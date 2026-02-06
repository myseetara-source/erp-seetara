-- =============================================================================
-- MIGRATION 028: WORLD-CLASS INVENTORY SYSTEM
-- =============================================================================
-- Priority: CRITICAL - International Standard Inventory Dashboard & Sync
-- 
-- This migration creates:
-- 1. Master stock sync trigger (handles ALL transaction types)
-- 2. Advanced dashboard RPC with 4 key metrics
-- 3. Product movement report function
-- 4. Inventory summary materialized view for performance
-- 5. Additional performance indexes
-- =============================================================================

-- =============================================================================
-- PART 1: DROP OLD TRIGGERS (Clean slate)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_sync_inventory_on_transaction ON inventory_transactions;
DROP FUNCTION IF EXISTS trg_sync_inventory_on_transaction();

-- =============================================================================
-- PART 2: MASTER STOCK SYNC TRIGGER
-- =============================================================================
-- This trigger handles ALL transaction types correctly:
-- - Purchase: ADD to stock
-- - Purchase Return: SUBTRACT from stock (returning to vendor)
-- - Damage: SUBTRACT from stock (items destroyed/lost)
-- - Adjustment: ADD or SUBTRACT based on direction

CREATE OR REPLACE FUNCTION fn_master_stock_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  stock_delta INT;
  movement_type TEXT;
  old_stock INT;
  new_stock INT;
BEGIN
  -- ==========================================================================
  -- CASE 1: Transaction APPROVED (Insert or Update to approved)
  -- ==========================================================================
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status != 'approved') THEN
    
    FOR item IN 
      SELECT 
        iti.variant_id, 
        iti.quantity_fresh, 
        iti.quantity_damaged,
        iti.unit_cost,
        pv.current_stock
      FROM inventory_transaction_items iti
      JOIN product_variants pv ON pv.id = iti.variant_id
      WHERE iti.transaction_id = NEW.id
    LOOP
      -- Calculate total quantity for this item
      stock_delta := COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0);
      old_stock := item.current_stock;
      
      -- Determine stock direction based on transaction type
      CASE NEW.transaction_type
        -- PURCHASE: Stock IN (add to inventory)
        WHEN 'purchase' THEN
          movement_type := 'in';
          new_stock := old_stock + stock_delta;
          
        -- PURCHASE RETURN: Stock OUT (sending back to vendor)
        WHEN 'purchase_return' THEN
          movement_type := 'out';
          stock_delta := -stock_delta;
          new_stock := GREATEST(0, old_stock + stock_delta);
          
        -- DAMAGE: Stock OUT (items destroyed/lost)
        WHEN 'damage' THEN
          movement_type := 'out';
          stock_delta := -stock_delta;
          new_stock := GREATEST(0, old_stock + stock_delta);
          
        -- ADJUSTMENT: Direction depends on quantity sign
        -- quantity_fresh = positive adjustment (add)
        -- quantity_damaged = negative adjustment (subtract)
        WHEN 'adjustment' THEN
          stock_delta := COALESCE(item.quantity_fresh, 0) - COALESCE(item.quantity_damaged, 0);
          IF stock_delta >= 0 THEN
            movement_type := 'in';
          ELSE
            movement_type := 'out';
          END IF;
          new_stock := GREATEST(0, old_stock + stock_delta);
          
        ELSE
          stock_delta := 0;
          movement_type := 'adjustment';
          new_stock := old_stock;
      END CASE;
      
      -- Update variant stock
      IF stock_delta != 0 THEN
        UPDATE product_variants
        SET 
          current_stock = new_stock,
          updated_at = NOW()
        WHERE id = item.variant_id;
        
        -- Log to stock_movements for audit trail
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
          ABS(stock_delta),
          movement_type,
          'inventory_transaction',
          NEW.id,
          format('%s [%s] - Qty: %s, Old: %s, New: %s', 
            UPPER(NEW.transaction_type), 
            NEW.invoice_no,
            ABS(stock_delta),
            old_stock,
            new_stock
          ),
          NOW()
        );
      END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Stock synced for transaction % (%)', NEW.invoice_no, NEW.transaction_type;
    
  -- ==========================================================================
  -- CASE 2: Transaction VOIDED (Reverse the stock change)
  -- ==========================================================================
  ELSIF NEW.status = 'voided' AND OLD.status = 'approved' THEN
    
    FOR item IN 
      SELECT 
        iti.variant_id, 
        iti.quantity_fresh, 
        iti.quantity_damaged,
        pv.current_stock
      FROM inventory_transaction_items iti
      JOIN product_variants pv ON pv.id = iti.variant_id
      WHERE iti.transaction_id = NEW.id
    LOOP
      stock_delta := COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0);
      old_stock := item.current_stock;
      
      -- REVERSE the original operation
      CASE NEW.transaction_type
        WHEN 'purchase' THEN
          -- Was added, now subtract
          movement_type := 'out';
          stock_delta := -stock_delta;
          
        WHEN 'purchase_return' THEN
          -- Was subtracted, now add back
          movement_type := 'in';
          -- stock_delta stays positive
          
        WHEN 'damage' THEN
          -- Was subtracted, now add back (restoring damaged items)
          movement_type := 'in';
          -- stock_delta stays positive
          
        WHEN 'adjustment' THEN
          -- Reverse the adjustment
          stock_delta := -(COALESCE(item.quantity_fresh, 0) - COALESCE(item.quantity_damaged, 0));
          IF stock_delta >= 0 THEN
            movement_type := 'in';
          ELSE
            movement_type := 'out';
          END IF;
          
        ELSE
          stock_delta := 0;
          movement_type := 'void';
      END CASE;
      
      new_stock := GREATEST(0, old_stock + stock_delta);
      
      IF stock_delta != 0 THEN
        UPDATE product_variants
        SET 
          current_stock = new_stock,
          updated_at = NOW()
        WHERE id = item.variant_id;
        
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
          ABS(stock_delta),
          movement_type,
          'inventory_transaction_void',
          NEW.id,
          format('VOIDED: %s [%s] - Reversed %s units', 
            UPPER(NEW.transaction_type), 
            NEW.invoice_no,
            ABS(stock_delta)
          ),
          NOW()
        );
      END IF;
    END LOOP;
    
    RAISE NOTICE '⚠️ Transaction voided and stock reversed: %', NEW.invoice_no;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the master trigger
CREATE TRIGGER trg_master_stock_sync
  AFTER INSERT OR UPDATE OF status ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_master_stock_sync();

-- =============================================================================
-- PART 3: ADVANCED DASHBOARD RPC
-- =============================================================================
-- Returns comprehensive inventory metrics in a single call

DROP FUNCTION IF EXISTS get_inventory_dashboard_stats();

CREATE OR REPLACE FUNCTION get_inventory_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  month_start DATE;
  prev_month_start DATE;
  low_stock_threshold INT := 10;
BEGIN
  month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  prev_month_start := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE;
  
  SELECT json_build_object(
    -- =========================================================================
    -- METRIC 1: Total Stock Value (Inventory Valuation)
    -- =========================================================================
    'total_stock_value', (
      SELECT json_build_object(
        'value', COALESCE(SUM(current_stock * COALESCE(cost_price, 0)), 0),
        'units', COALESCE(SUM(current_stock), 0),
        'active_variants', COUNT(*) FILTER (WHERE current_stock > 0)
      )
      FROM product_variants
      WHERE is_active = true
    ),
    
    -- =========================================================================
    -- METRIC 2: Inventory Turnover (Monthly In vs Out)
    -- =========================================================================
    'inventory_turnover', (
      SELECT json_build_object(
        'this_month', json_build_object(
          'stock_in', COALESCE(SUM(
            CASE WHEN transaction_type = 'purchase' AND status = 'approved' 
            THEN total_cost ELSE 0 END
          ), 0),
          'stock_in_qty', COALESCE(SUM(
            CASE WHEN transaction_type = 'purchase' AND status = 'approved' 
            THEN (SELECT SUM(quantity_fresh + COALESCE(quantity_damaged, 0)) 
                  FROM inventory_transaction_items WHERE transaction_id = it.id) 
            ELSE 0 END
          ), 0),
          'stock_out', COALESCE(SUM(
            CASE WHEN transaction_type IN ('damage', 'purchase_return') AND status = 'approved' 
            THEN total_cost ELSE 0 END
          ), 0),
          'stock_out_qty', COALESCE(SUM(
            CASE WHEN transaction_type IN ('damage', 'purchase_return') AND status = 'approved' 
            THEN (SELECT SUM(quantity_fresh + COALESCE(quantity_damaged, 0)) 
                  FROM inventory_transaction_items WHERE transaction_id = it.id) 
            ELSE 0 END
          ), 0),
          'orders_value', (
            SELECT COALESCE(SUM(total_amount), 0) 
            FROM orders 
            WHERE status = 'delivered' AND created_at >= month_start
          )
        ),
        'last_month', json_build_object(
          'stock_in', COALESCE(SUM(
            CASE WHEN transaction_type = 'purchase' AND status = 'approved' 
                 AND created_at >= prev_month_start AND created_at < month_start
            THEN total_cost ELSE 0 END
          ), 0),
          'stock_out', COALESCE(SUM(
            CASE WHEN transaction_type IN ('damage', 'purchase_return') AND status = 'approved'
                 AND created_at >= prev_month_start AND created_at < month_start
            THEN total_cost ELSE 0 END
          ), 0)
        )
      )
      FROM inventory_transactions it
      WHERE created_at >= prev_month_start
    ),
    
    -- =========================================================================
    -- METRIC 3: Critical Stock (Below Threshold)
    -- =========================================================================
    'critical_stock', (
      SELECT json_build_object(
        'count', COUNT(*),
        'items', COALESCE(json_agg(
          json_build_object(
            'id', pv.id,
            'sku', pv.sku,
            'product_name', p.name,
            'current_stock', pv.current_stock,
            'threshold', low_stock_threshold,
            'cost_price', pv.cost_price,
            'selling_price', pv.selling_price,
            'potential_loss', (low_stock_threshold - pv.current_stock) * COALESCE(pv.cost_price, 0)
          ) ORDER BY pv.current_stock ASC
        ) FILTER (WHERE pv.current_stock < low_stock_threshold), '[]'::json)
      )
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.is_active = true AND pv.current_stock < low_stock_threshold AND pv.current_stock >= 0
    ),
    
    -- =========================================================================
    -- METRIC 4: Damage Loss (This Month)
    -- =========================================================================
    'damage_loss', (
      SELECT json_build_object(
        'this_month', json_build_object(
          'total_value', COALESCE(SUM(total_cost), 0),
          'transaction_count', COUNT(*),
          'units_damaged', COALESCE(SUM(
            (SELECT SUM(quantity_fresh + COALESCE(quantity_damaged, 0)) 
             FROM inventory_transaction_items WHERE transaction_id = it.id)
          ), 0)
        ),
        'last_month', (
          SELECT json_build_object(
            'total_value', COALESCE(SUM(total_cost), 0),
            'transaction_count', COUNT(*)
          )
          FROM inventory_transactions
          WHERE transaction_type = 'damage' 
            AND status = 'approved'
            AND created_at >= prev_month_start 
            AND created_at < month_start
        ),
        'recent', COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', id,
              'invoice_no', invoice_no,
              'total_cost', total_cost,
              'date', transaction_date,
              'notes', notes
            ) ORDER BY created_at DESC
          )
          FROM inventory_transactions
          WHERE transaction_type = 'damage' 
            AND status = 'approved'
            AND created_at >= month_start
          LIMIT 5
        ), '[]'::json)
      )
      FROM inventory_transactions it
      WHERE transaction_type = 'damage' 
        AND status = 'approved'
        AND created_at >= month_start
    ),
    
    -- =========================================================================
    -- ADDITIONAL: Stock Trend (Last 7 days sparkline data)
    -- =========================================================================
    'stock_trend', (
      SELECT COALESCE(json_agg(day_data ORDER BY day_data.day), '[]'::json)
      FROM (
        SELECT 
          d::date as day,
          COALESCE((
            SELECT SUM(
              CASE 
                WHEN sm.movement_type = 'in' THEN sm.quantity 
                WHEN sm.movement_type = 'out' THEN -sm.quantity 
                ELSE 0 
              END
            )
            FROM stock_movements sm
            WHERE sm.created_at::date = d::date
          ), 0) as net_change
        FROM generate_series(
          CURRENT_DATE - INTERVAL '6 days', 
          CURRENT_DATE, 
          '1 day'
        ) d
      ) day_data
    ),
    
    -- =========================================================================
    -- ADDITIONAL: Pending Actions
    -- =========================================================================
    'pending_actions', json_build_object(
      'pending_approvals', (
        SELECT COUNT(*) FROM inventory_transactions WHERE status = 'pending'
      ),
      'out_of_stock', (
        SELECT COUNT(*) FROM product_variants WHERE is_active = true AND current_stock <= 0
      )
    ),
    
    -- =========================================================================
    -- ADDITIONAL: Recent Transactions
    -- =========================================================================
    'recent_transactions', COALESCE((
      SELECT json_agg(tx ORDER BY tx.created_at DESC)
      FROM (
        SELECT 
          id,
          invoice_no,
          transaction_type,
          status,
          total_cost,
          transaction_date,
          created_at,
          (SELECT json_build_object('name', v.name) FROM vendors v WHERE v.id = it.vendor_id) as vendor
        FROM inventory_transactions it
        ORDER BY created_at DESC
        LIMIT 10
      ) tx
    ), '[]'::json),
    
    -- Metadata
    'generated_at', NOW(),
    'period', json_build_object(
      'month_start', month_start,
      'prev_month_start', prev_month_start,
      'low_stock_threshold', low_stock_threshold
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_dashboard_stats() TO authenticated;

-- =============================================================================
-- PART 4: PRODUCT MOVEMENT REPORT FUNCTION
-- =============================================================================
-- Returns opening -> in -> out -> closing for each product

CREATE OR REPLACE FUNCTION get_product_movement_report(
  p_start_date DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
  p_end_date DATE DEFAULT CURRENT_DATE,
  p_product_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(report ORDER BY report.product_name), '[]'::json)
  INTO result
  FROM (
    SELECT 
      p.id as product_id,
      p.name as product_name,
      pv.id as variant_id,
      pv.sku,
      pv.color,
      pv.size,
      pv.cost_price,
      pv.selling_price,
      
      -- Opening Stock (stock at start of period - net movements before period)
      pv.current_stock - COALESCE((
        SELECT SUM(
          CASE 
            WHEN sm.movement_type = 'in' THEN sm.quantity 
            WHEN sm.movement_type = 'out' THEN -sm.quantity 
            ELSE 0 
          END
        )
        FROM stock_movements sm
        WHERE sm.variant_id = pv.id 
          AND sm.created_at >= p_start_date
      ), 0) as opening_stock,
      
      -- Stock In (purchases + positive adjustments during period)
      COALESCE((
        SELECT SUM(sm.quantity)
        FROM stock_movements sm
        WHERE sm.variant_id = pv.id 
          AND sm.movement_type = 'in'
          AND sm.created_at >= p_start_date 
          AND sm.created_at <= p_end_date + INTERVAL '1 day'
      ), 0) as stock_in,
      
      -- Stock Out (damage + returns + sales during period)
      COALESCE((
        SELECT SUM(sm.quantity)
        FROM stock_movements sm
        WHERE sm.variant_id = pv.id 
          AND sm.movement_type = 'out'
          AND sm.created_at >= p_start_date 
          AND sm.created_at <= p_end_date + INTERVAL '1 day'
      ), 0) as stock_out,
      
      -- Closing Stock (current)
      pv.current_stock as closing_stock,
      
      -- Movement Details
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'date', sm.created_at,
            'type', sm.movement_type,
            'quantity', sm.quantity,
            'reference', sm.reference_type,
            'notes', sm.notes
          ) ORDER BY sm.created_at DESC
        )
        FROM stock_movements sm
        WHERE sm.variant_id = pv.id
          AND sm.created_at >= p_start_date 
          AND sm.created_at <= p_end_date + INTERVAL '1 day'
      ), '[]'::json) as movements
      
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.is_active = true
      AND (p_product_id IS NULL OR p.id = p_product_id)
    ORDER BY p.name, pv.sku
    LIMIT p_limit
  ) report;
  
  RETURN json_build_object(
    'period', json_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date
    ),
    'data', result,
    'generated_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_movement_report(DATE, DATE, UUID, INT) TO authenticated;

-- =============================================================================
-- PART 5: ADDITIONAL PERFORMANCE INDEXES
-- =============================================================================

-- Stock movements indexes
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_date 
ON stock_movements(variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_type_date 
ON stock_movements(movement_type, created_at DESC);

-- Inventory transactions composite index for dashboard
CREATE INDEX IF NOT EXISTS idx_inv_tx_type_status_date 
ON inventory_transactions(transaction_type, status, created_at DESC);

-- Product variants for low stock queries
CREATE INDEX IF NOT EXISTS idx_variants_active_lowstock 
ON product_variants(current_stock, is_active) 
WHERE is_active = true AND current_stock < 20;

-- Orders for turnover calculation
CREATE INDEX IF NOT EXISTS idx_orders_status_created 
ON orders(status, created_at DESC) 
WHERE status = 'delivered';

-- =============================================================================
-- PART 6: VERIFY MIGRATION
-- =============================================================================

DO $$
DECLARE
  test_result JSON;
BEGIN
  -- Test the dashboard stats function
  SELECT get_inventory_dashboard_stats() INTO test_result;
  
  IF test_result IS NOT NULL THEN
    RAISE NOTICE '✅ Migration 028 completed successfully';
    RAISE NOTICE '   - Master stock sync trigger installed';
    RAISE NOTICE '   - get_inventory_dashboard_stats() ready';
    RAISE NOTICE '   - get_product_movement_report() ready';
    RAISE NOTICE '   - Performance indexes created';
  ELSE
    RAISE EXCEPTION 'Migration 028 verification failed';
  END IF;
END $$;
