-- =============================================================================
-- MIGRATION 027: INVENTORY DASHBOARD OPTIMIZATION
-- =============================================================================
-- Priority: CRITICAL - Fix 429 Errors & Data Integrity
-- 
-- This migration addresses:
-- 1. Performance indexes for inventory queries
-- 2. Single RPC endpoint for dashboard stats (eliminates multiple API calls)
-- 3. Inventory sync trigger for damage/adjustment transactions
-- =============================================================================

-- =============================================================================
-- PART 1: PERFORMANCE INDEXES
-- =============================================================================
-- These indexes dramatically speed up common queries

-- Inventory Transactions: Vendor + Type + Date (common filter pattern)
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_vendor_type_date 
ON inventory_transactions(vendor_id, transaction_type, created_at DESC);

-- Inventory Transactions: Status for pending approvals
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_status 
ON inventory_transactions(status) WHERE status = 'pending';

-- Inventory Transactions: Transaction date for reports
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date 
ON inventory_transactions(transaction_date DESC);

-- Vendor Ledgers: Vendor + Reference (for balance calculations)
CREATE INDEX IF NOT EXISTS idx_vendor_ledgers_vendor_reference 
ON vendor_ledgers(vendor_id, reference_id);

-- Vendor Ledgers: Created at for timeline
CREATE INDEX IF NOT EXISTS idx_vendor_ledgers_created 
ON vendor_ledgers(created_at DESC);

-- Product Variants: SKU lookup (exact match)
CREATE INDEX IF NOT EXISTS idx_product_variants_sku 
ON product_variants(sku);

-- Product Variants: Stock quantity for low stock alerts
CREATE INDEX IF NOT EXISTS idx_product_variants_stock 
ON product_variants(current_stock) WHERE is_active = true;

-- Product Variants: Active variants with stock
CREATE INDEX IF NOT EXISTS idx_product_variants_active_stock 
ON product_variants(is_active, current_stock) WHERE is_active = true;

-- =============================================================================
-- PART 2: DASHBOARD SUMMARY RPC
-- =============================================================================
-- Single function that returns ALL dashboard stats in one call
-- Eliminates 5-6 separate API calls that cause 429 errors

CREATE OR REPLACE FUNCTION get_inventory_dashboard_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  current_month_start DATE;
  low_stock_threshold INT := 10;
BEGIN
  -- Calculate start of current month
  current_month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  
  -- Build comprehensive dashboard summary
  SELECT json_build_object(
    -- Product & Variant Counts
    'products', (
      SELECT json_build_object(
        'total', COUNT(DISTINCT p.id),
        'active', COUNT(DISTINCT p.id) FILTER (WHERE p.is_active = true)
      )
      FROM products p
    ),
    'variants', (
      SELECT json_build_object(
        'total', COUNT(*),
        'active', COUNT(*) FILTER (WHERE is_active = true)
      )
      FROM product_variants
    ),
    
    -- Stock Alerts
    'alerts', (
      SELECT json_build_object(
        'low_stock', COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock <= low_stock_threshold),
        'out_of_stock', COUNT(*) FILTER (WHERE current_stock <= 0)
      )
      FROM product_variants
      WHERE is_active = true
    ),
    
    -- This Month Stock Movement (Purchases = Stock In, Orders = Stock Out)
    'this_month', (
      SELECT json_build_object(
        'stock_in_value', COALESCE(SUM(total_cost) FILTER (
          WHERE transaction_type = 'purchase' AND status = 'approved'
        ), 0),
        'stock_in_count', COUNT(*) FILTER (
          WHERE transaction_type = 'purchase' AND status = 'approved'
        ),
        'stock_out_value', COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0),
        'stock_out_count', COUNT(*) FILTER (WHERE status = 'delivered')
      )
      FROM (
        -- Combine inventory transactions and orders
        SELECT 'purchase' as transaction_type, total_cost, NULL::NUMERIC as total_amount, status
        FROM inventory_transactions
        WHERE created_at >= current_month_start
        
        UNION ALL
        
        SELECT 'order' as transaction_type, NULL as total_cost, total_amount, status
        FROM orders
        WHERE created_at >= current_month_start
      ) combined
    ),
    
    -- Pending Approvals Count
    'pending_approvals', (
      SELECT COUNT(*)
      FROM inventory_transactions
      WHERE status = 'pending'
    ),
    
    -- Recent Transactions (Last 5)
    'recent_transactions', (
      SELECT COALESCE(json_agg(tx ORDER BY tx.created_at DESC), '[]'::json)
      FROM (
        SELECT 
          id,
          invoice_no,
          transaction_type,
          status,
          total_cost,
          transaction_date,
          created_at
        FROM inventory_transactions
        ORDER BY created_at DESC
        LIMIT 5
      ) tx
    ),
    
    -- Low Stock Items (Top 10)
    'low_stock_items', (
      SELECT COALESCE(json_agg(items ORDER BY items.current_stock ASC), '[]'::json)
      FROM (
        SELECT 
          pv.id,
          pv.sku,
          pv.current_stock,
          p.name as product_name
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.is_active = true
          AND pv.current_stock > 0 
          AND pv.current_stock <= low_stock_threshold
        ORDER BY pv.current_stock ASC
        LIMIT 10
      ) items
    ),
    
    -- Inventory Valuation (Total value of stock)
    'valuation', (
      SELECT json_build_object(
        'total_value', COALESCE(SUM(current_stock * COALESCE(cost_price, 0)), 0),
        'total_units', COALESCE(SUM(current_stock), 0)
      )
      FROM product_variants
      WHERE is_active = true AND current_stock > 0
    ),
    
    -- Timestamp
    'generated_at', NOW()
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_inventory_dashboard_summary() TO authenticated;

-- =============================================================================
-- PART 3: INVENTORY SYNC TRIGGER FOR DAMAGE/ADJUSTMENT
-- =============================================================================
-- Ensures stock is properly deducted when damage or adjustment transactions are approved

CREATE OR REPLACE FUNCTION trg_sync_inventory_on_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  stock_change INT;
BEGIN
  -- Only process when transaction status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    
    -- Process each item in the transaction
    FOR item IN 
      SELECT variant_id, quantity_fresh, quantity_damaged
      FROM inventory_transaction_items
      WHERE transaction_id = NEW.id
    LOOP
      -- Calculate stock change based on transaction type
      CASE NEW.transaction_type
        WHEN 'purchase' THEN
          -- Stock IN: Add fresh + damaged to current stock
          stock_change := COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0);
          
        WHEN 'purchase_return' THEN
          -- Stock OUT: Subtract (returning to vendor)
          stock_change := -(COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0));
          
        WHEN 'damage' THEN
          -- Stock OUT: Subtract (items are damaged)
          stock_change := -(COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0));
          
        WHEN 'adjustment' THEN
          -- Adjustment can be positive or negative
          -- Fresh = add, Damaged = subtract (damaged during adjustment)
          stock_change := COALESCE(item.quantity_fresh, 0) - COALESCE(item.quantity_damaged, 0);
          
        ELSE
          stock_change := 0;
      END CASE;
      
      -- Update variant stock atomically
      IF stock_change != 0 THEN
        UPDATE product_variants
        SET 
          current_stock = GREATEST(0, current_stock + stock_change),
          updated_at = NOW()
        WHERE id = item.variant_id;
        
        -- Log the stock movement
        INSERT INTO stock_movements (
          variant_id,
          quantity,
          movement_type,
          reference_type,
          reference_id,
          notes,
          created_at
        ) VALUES (
          item.variant_id,
          ABS(stock_change),
          CASE WHEN stock_change > 0 THEN 'in' ELSE 'out' END,
          'inventory_transaction',
          NEW.id,
          NEW.transaction_type || ' - ' || NEW.invoice_no,
          NOW()
        );
      END IF;
    END LOOP;
    
  -- Handle voiding an approved transaction (reverse the stock change)
  ELSIF NEW.status = 'voided' AND OLD.status = 'approved' THEN
    
    FOR item IN 
      SELECT variant_id, quantity_fresh, quantity_damaged
      FROM inventory_transaction_items
      WHERE transaction_id = NEW.id
    LOOP
      -- Reverse the original stock change
      CASE OLD.transaction_type
        WHEN 'purchase' THEN
          stock_change := -(COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0));
          
        WHEN 'purchase_return' THEN
          stock_change := COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0);
          
        WHEN 'damage' THEN
          stock_change := COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0);
          
        WHEN 'adjustment' THEN
          stock_change := -(COALESCE(item.quantity_fresh, 0) - COALESCE(item.quantity_damaged, 0));
          
        ELSE
          stock_change := 0;
      END CASE;
      
      IF stock_change != 0 THEN
        UPDATE product_variants
        SET 
          current_stock = GREATEST(0, current_stock + stock_change),
          updated_at = NOW()
        WHERE id = item.variant_id;
        
        -- Log the reversal
        INSERT INTO stock_movements (
          variant_id,
          quantity,
          movement_type,
          reference_type,
          reference_id,
          notes,
          created_at
        ) VALUES (
          item.variant_id,
          ABS(stock_change),
          CASE WHEN stock_change > 0 THEN 'in' ELSE 'out' END,
          'inventory_transaction_void',
          NEW.id,
          'VOIDED: ' || OLD.transaction_type || ' - ' || OLD.invoice_no,
          NOW()
        );
      END IF;
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_sync_inventory_on_transaction ON inventory_transactions;

-- Create the trigger
CREATE TRIGGER trg_sync_inventory_on_transaction
  AFTER INSERT OR UPDATE OF status ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_inventory_on_transaction();

-- =============================================================================
-- PART 4: STOCK MOVEMENTS TABLE (if not exists)
-- =============================================================================

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('in', 'out')),
  reference_type VARCHAR(50) NOT NULL,
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant 
ON stock_movements(variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference 
ON stock_movements(reference_type, reference_id);

-- RLS for stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock movements"
ON stock_movements FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert stock movements"
ON stock_movements FOR INSERT
TO authenticated
WITH CHECK (true);

-- =============================================================================
-- VERIFY MIGRATION
-- =============================================================================

DO $$
BEGIN
  -- Test the RPC function
  PERFORM get_inventory_dashboard_summary();
  RAISE NOTICE '✅ Migration 027 completed successfully';
  RAISE NOTICE '   - Performance indexes created';
  RAISE NOTICE '   - get_inventory_dashboard_summary() RPC ready';
  RAISE NOTICE '   - Inventory sync trigger active';
  RAISE NOTICE '   - Stock movements table ready';
END $$;
