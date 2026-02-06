-- =============================================================================
-- MIGRATION 045: ENTERPRISE PERFORMANCE OPTIMIZATION
-- =============================================================================
-- Priority: P2 - PERFORMANCE (Reduce Purchase API from 2200ms to <300ms)
-- 
-- Optimizations:
-- 1. Add missing vendor_id column to stock_movements
-- 2. Create performance indexes for 100M+ scale
-- 3. Implement get_inventory_metrics RPC (replaces missing function)
-- 4. Implement process_purchase_transaction RPC (atomic, single round-trip)
-- =============================================================================

-- =============================================================================
-- SECTION 1: SCHEMA FIXES - Add Missing Columns
-- =============================================================================

-- Add vendor_id to stock_movements for purchase tracking
ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

COMMENT ON COLUMN stock_movements.vendor_id IS 'Vendor reference for purchase-related movements';

-- =============================================================================
-- SECTION 2: PERFORMANCE INDEXES (B-Tree for 100M+ scale)
-- =============================================================================

-- Stock Movements Indexes
CREATE INDEX IF NOT EXISTS idx_stock_movements_vendor 
ON stock_movements(vendor_id) WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant_created 
ON stock_movements(variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_type_created 
ON stock_movements(movement_type, created_at DESC);

-- Inventory Transactions Indexes (for dashboard queries)
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_vendor_date 
ON inventory_transactions(vendor_id, transaction_date DESC) WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type_status 
ON inventory_transactions(transaction_type, status);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date_range 
ON inventory_transactions(transaction_date DESC, created_at DESC);

-- Vendor Ledger Indexes (for balance calculations)
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_date 
ON vendor_ledger(vendor_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_ledger_type 
ON vendor_ledger(entry_type);

-- Product Variants Stock Index
CREATE INDEX IF NOT EXISTS idx_product_variants_low_stock 
ON product_variants(current_stock) WHERE current_stock < 10;

CREATE INDEX IF NOT EXISTS idx_product_variants_stock_value 
ON product_variants(current_stock, cost_price) WHERE is_active = TRUE;

-- =============================================================================
-- SECTION 3: GET_INVENTORY_METRICS RPC (Dashboard Analytics)
-- =============================================================================

DROP FUNCTION IF EXISTS get_inventory_metrics(DATE, DATE, TEXT, UUID);

CREATE OR REPLACE FUNCTION get_inventory_metrics(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_user_role TEXT DEFAULT 'admin',
    p_vendor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_total_stock_value DECIMAL(15,2);
    v_total_stock_units INTEGER;
    v_low_stock_count INTEGER;
    v_out_of_stock_count INTEGER;
    v_active_variants INTEGER;
    v_purchase_total DECIMAL(15,2);
    v_damage_total DECIMAL(15,2);
    v_return_total DECIMAL(15,2);
BEGIN
    -- Calculate total stock value and units (optimized with single scan)
    SELECT 
        COALESCE(SUM(pv.current_stock * pv.cost_price), 0),
        COALESCE(SUM(pv.current_stock), 0),
        COUNT(*) FILTER (WHERE pv.current_stock > 0 AND pv.current_stock < 10),
        COUNT(*) FILTER (WHERE pv.current_stock <= 0),
        COUNT(*) FILTER (WHERE pv.is_active = TRUE)
    INTO 
        v_total_stock_value,
        v_total_stock_units,
        v_low_stock_count,
        v_out_of_stock_count,
        v_active_variants
    FROM product_variants pv
    WHERE pv.is_active = TRUE;

    -- Calculate transaction totals for the period
    SELECT
        COALESCE(SUM(CASE WHEN it.transaction_type = 'purchase' THEN it.total_cost ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN it.transaction_type = 'damage' THEN it.total_cost ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN it.transaction_type = 'purchase_return' THEN it.total_cost ELSE 0 END), 0)
    INTO
        v_purchase_total,
        v_damage_total,
        v_return_total
    FROM inventory_transactions it
    WHERE it.transaction_date BETWEEN p_start_date AND p_end_date
      AND it.status = 'approved'
      AND (p_vendor_id IS NULL OR it.vendor_id = p_vendor_id);

    -- Build result JSON
    v_result := jsonb_build_object(
        'summary', jsonb_build_object(
            'total_stock_value', v_total_stock_value,
            'total_stock_units', v_total_stock_units,
            'active_variants', v_active_variants,
            'low_stock_count', v_low_stock_count,
            'out_of_stock_count', v_out_of_stock_count
        ),
        'period_transactions', jsonb_build_object(
            'purchases', v_purchase_total,
            'damages', v_damage_total,
            'returns', v_return_total,
            'net_change', v_purchase_total - v_damage_total - v_return_total
        ),
        'low_stock_items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'variant_id', pv.id,
                'sku', pv.sku,
                'product_name', p.name,
                'current_stock', pv.current_stock,
                'cost_price', pv.cost_price
            ) ORDER BY pv.current_stock ASC), '[]'::jsonb)
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            WHERE pv.is_active = TRUE AND pv.current_stock > 0 AND pv.current_stock < 10
            LIMIT 20
        ),
        'top_vendors', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'vendor_id', v.id,
                'name', v.name,
                'total_purchases', v.total_purchases,
                'balance', v.balance
            ) ORDER BY v.total_purchases DESC NULLS LAST), '[]'::jsonb)
            FROM vendors v
            WHERE v.is_active = TRUE
            LIMIT 10
        ),
        'monthly_trend', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'month', TO_CHAR(month_date, 'YYYY-MM'),
                'purchases', month_purchases,
                'damages', month_damages
            ) ORDER BY month_date DESC), '[]'::jsonb)
            FROM (
                SELECT 
                    DATE_TRUNC('month', it.transaction_date)::DATE as month_date,
                    SUM(CASE WHEN it.transaction_type = 'purchase' THEN it.total_cost ELSE 0 END) as month_purchases,
                    SUM(CASE WHEN it.transaction_type = 'damage' THEN it.total_cost ELSE 0 END) as month_damages
                FROM inventory_transactions it
                WHERE it.transaction_date >= (CURRENT_DATE - INTERVAL '6 months')
                  AND it.status = 'approved'
                GROUP BY DATE_TRUNC('month', it.transaction_date)
            ) monthly
            LIMIT 6
        ),
        'generated_at', NOW()
    );

    RETURN v_result;
END;
$$;

-- =============================================================================
-- SECTION 4: PROCESS_PURCHASE_TRANSACTION RPC (Atomic Purchase)
-- =============================================================================
-- This function replaces 4 sequential API calls with 1 atomic transaction
-- Expected improvement: 2200ms -> <300ms
-- =============================================================================

DROP FUNCTION IF EXISTS process_purchase_transaction(JSONB);

CREATE OR REPLACE FUNCTION process_purchase_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Input parameters
    v_vendor_id UUID;
    v_invoice_no TEXT;
    v_invoice_date DATE;
    v_notes TEXT;
    v_performed_by UUID;
    v_items JSONB;
    
    -- Working variables
    v_transaction_id UUID;
    v_total_cost DECIMAL(15,2) := 0;
    v_total_quantity INTEGER := 0;
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_unit_cost DECIMAL(15,2);
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_item_count INTEGER := 0;
    v_stock_updates JSONB := '[]'::JSONB;
    v_vendor_name TEXT;
    v_vendor_balance DECIMAL(15,2);
    v_new_balance DECIMAL(15,2);
    v_entry_type TEXT := 'purchase';
    v_running_balance DECIMAL(15,2);
BEGIN
    -- =========================================================================
    -- STEP 1: Extract and validate input parameters
    -- =========================================================================
    
    v_vendor_id := (p_payload->>'vendor_id')::UUID;
    v_invoice_no := COALESCE(p_payload->>'invoice_no', 'PUR-' || TO_CHAR(NOW(), 'YYYY-MM-DD-HH24MISS'));
    v_invoice_date := COALESCE((p_payload->>'invoice_date')::DATE, CURRENT_DATE);
    v_notes := p_payload->>'notes';
    v_performed_by := (p_payload->>'performed_by')::UUID;
    v_items := p_payload->'items';
    
    -- Validate required fields
    IF v_vendor_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'vendor_id is required');
    END IF;
    
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'At least one item is required');
    END IF;
    
    -- Verify vendor exists
    SELECT name, COALESCE(balance, 0) INTO v_vendor_name, v_vendor_balance
    FROM vendors WHERE id = v_vendor_id;
    
    IF v_vendor_name IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Vendor not found');
    END IF;
    
    -- =========================================================================
    -- STEP 2: Calculate totals (pre-validation)
    -- =========================================================================
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'unit_cost')::DECIMAL;
        
        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid quantity for item ' || v_item_count);
        END IF;
        
        IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid unit_cost for item ' || v_item_count);
        END IF;
        
        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
        v_total_quantity := v_total_quantity + v_quantity;
        v_item_count := v_item_count + 1;
    END LOOP;
    
    -- =========================================================================
    -- STEP 3: Create inventory_transactions record
    -- =========================================================================
    
    INSERT INTO inventory_transactions (
        invoice_no,
        transaction_type,
        vendor_id,
        status,
        total_cost,
        total_quantity,
        transaction_date,
        notes,
        performed_by,
        approved_by,
        approval_date,
        created_at
    ) VALUES (
        v_invoice_no,
        'purchase',
        v_vendor_id,
        'approved',
        v_total_cost,
        v_total_quantity,
        v_invoice_date,
        COALESCE(v_notes, 'Purchase from ' || v_vendor_name),
        v_performed_by,
        v_performed_by,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    -- =========================================================================
    -- STEP 4: Process each item (stock update + movement log)
    -- =========================================================================
    
    v_item_count := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'unit_cost')::DECIMAL;
        
        -- Get current stock
        SELECT current_stock INTO v_current_stock
        FROM product_variants WHERE id = v_variant_id FOR UPDATE;
        
        IF v_current_stock IS NULL THEN
            RAISE EXCEPTION 'Variant not found: %', v_variant_id;
        END IF;
        
        v_new_stock := v_current_stock + v_quantity;
        
        -- Update product variant stock and cost price
        UPDATE product_variants
        SET 
            current_stock = v_new_stock,
            cost_price = v_unit_cost,
            updated_at = NOW()
        WHERE id = v_variant_id;
        
        -- Insert transaction item
        INSERT INTO inventory_transaction_items (
            transaction_id,
            variant_id,
            quantity,
            unit_cost,
            stock_before,
            stock_after,
            source_type,
            notes
        ) VALUES (
            v_transaction_id,
            v_variant_id,
            v_quantity,
            v_unit_cost,
            v_current_stock,
            v_new_stock,
            'fresh',
            'Purchase - ' || v_invoice_no
        );
        
        -- Insert stock movement (audit trail)
        INSERT INTO stock_movements (
            variant_id,
            vendor_id,
            movement_type,
            quantity,
            stock_before,
            stock_after,
            balance_before,
            balance_after,
            reference_id,
            reason,
            notes,
            created_by,
            created_at
        ) VALUES (
            v_variant_id,
            v_vendor_id,
            'inward',
            v_quantity,
            v_current_stock,
            v_new_stock,
            v_current_stock,
            v_new_stock,
            v_transaction_id,
            'Purchase from ' || v_vendor_name,
            v_invoice_no,
            v_performed_by,
            NOW()
        );
        
        -- Track updates for response
        v_stock_updates := v_stock_updates || jsonb_build_object(
            'variant_id', v_variant_id,
            'quantity', v_quantity,
            'stock_before', v_current_stock,
            'stock_after', v_new_stock,
            'unit_cost', v_unit_cost
        );
        
        v_item_count := v_item_count + 1;
    END LOOP;
    
    -- =========================================================================
    -- STEP 5: Update vendor balance
    -- =========================================================================
    
    v_new_balance := v_vendor_balance + v_total_cost;
    
    UPDATE vendors
    SET 
        balance = v_new_balance,
        total_purchases = COALESCE(total_purchases, 0) + v_total_cost,
        updated_at = NOW()
    WHERE id = v_vendor_id;
    
    -- =========================================================================
    -- STEP 6: Create vendor ledger entry
    -- =========================================================================
    
    -- Get running balance for vendor
    SELECT COALESCE(
        (SELECT running_balance FROM vendor_ledger 
         WHERE vendor_id = v_vendor_id 
         ORDER BY transaction_date DESC, created_at DESC 
         LIMIT 1),
        0
    ) + v_total_cost INTO v_running_balance;
    
    INSERT INTO vendor_ledger (
        vendor_id,
        entry_type,
        reference_id,
        reference_no,
        debit,
        credit,
        running_balance,
        description,
        transaction_date,
        performed_by,
        created_at
    ) VALUES (
        v_vendor_id,
        'purchase'::vendor_ledger_type,
        v_transaction_id,
        v_invoice_no,
        v_total_cost,  -- Debit (we owe vendor)
        0,
        v_running_balance,
        'Purchase: ' || v_invoice_no,
        v_invoice_date,
        v_performed_by,
        NOW()
    );
    
    -- =========================================================================
    -- STEP 7: Return success response
    -- =========================================================================
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'transaction_id', v_transaction_id,
        'invoice_no', v_invoice_no,
        'vendor', jsonb_build_object(
            'id', v_vendor_id,
            'name', v_vendor_name,
            'previous_balance', v_vendor_balance,
            'new_balance', v_new_balance
        ),
        'summary', jsonb_build_object(
            'total_items', v_item_count,
            'total_quantity', v_total_quantity,
            'total_cost', v_total_cost
        ),
        'stock_updates', v_stock_updates,
        'processed_at', NOW()
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', SQLSTATE
        );
END;
$$;

-- =============================================================================
-- SECTION 5: GENERATE INVOICE NUMBER RPC (Atomic)
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_purchase_invoice_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_year TEXT := TO_CHAR(NOW(), 'YYYY');
    v_prefix TEXT := 'PUR-' || v_year || '-';
    v_last_num INTEGER;
    v_new_num INTEGER;
BEGIN
    -- Get the last invoice number for this year
    SELECT COALESCE(
        MAX(
            CASE 
                WHEN invoice_no LIKE v_prefix || '%' 
                THEN NULLIF(regexp_replace(invoice_no, '^' || v_prefix, ''), '')::INTEGER 
                ELSE 0 
            END
        ), 0
    ) INTO v_last_num
    FROM inventory_transactions
    WHERE transaction_type = 'purchase';
    
    v_new_num := v_last_num + 1;
    
    RETURN v_prefix || LPAD(v_new_num::TEXT, 6, '0');
END;
$$;

-- =============================================================================
-- SECTION 6: GRANTS
-- =============================================================================

GRANT EXECUTE ON FUNCTION get_inventory_metrics(DATE, DATE, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_metrics(DATE, DATE, TEXT, UUID) TO service_role;

GRANT EXECUTE ON FUNCTION process_purchase_transaction(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_purchase_transaction(JSONB) TO service_role;

GRANT EXECUTE ON FUNCTION generate_purchase_invoice_no() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_purchase_invoice_no() TO service_role;

-- =============================================================================
-- SECTION 7: VERIFICATION
-- =============================================================================

DO $$
DECLARE
    v_col_exists BOOLEAN;
    v_idx_count INTEGER;
    v_func_count INTEGER;
BEGIN
    -- Check vendor_id column exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stock_movements' AND column_name = 'vendor_id'
    ) INTO v_col_exists;
    
    -- Count new indexes
    SELECT COUNT(*) INTO v_idx_count
    FROM pg_indexes 
    WHERE indexname IN (
        'idx_stock_movements_vendor',
        'idx_stock_movements_variant_created',
        'idx_stock_movements_type_created',
        'idx_inventory_transactions_vendor_date',
        'idx_inventory_transactions_type_status',
        'idx_inventory_transactions_date_range',
        'idx_vendor_ledger_vendor_date',
        'idx_vendor_ledger_type',
        'idx_product_variants_low_stock',
        'idx_product_variants_stock_value'
    );
    
    -- Count functions
    SELECT COUNT(*) INTO v_func_count
    FROM pg_proc 
    WHERE proname IN ('get_inventory_metrics', 'process_purchase_transaction', 'generate_purchase_invoice_no');
    
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 045: ENTERPRISE PERFORMANCE OPTIMIZATION COMPLETE';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Schema Updates:';
    RAISE NOTICE '   • stock_movements.vendor_id column: %', CASE WHEN v_col_exists THEN '✅ ADDED' ELSE '❌ FAILED' END;
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Performance Indexes Created: %', v_idx_count;
    RAISE NOTICE '';
    RAISE NOTICE '⚡ RPC Functions Created: %', v_func_count;
    RAISE NOTICE '   • get_inventory_metrics() - Dashboard analytics';
    RAISE NOTICE '   • process_purchase_transaction() - Atomic purchase (4 ops → 1)';
    RAISE NOTICE '   • generate_purchase_invoice_no() - Auto invoice number';
    RAISE NOTICE '';
    RAISE NOTICE '📈 Expected Performance Improvement:';
    RAISE NOTICE '   • Purchase API: 2200ms → <300ms (~7x faster)';
    RAISE NOTICE '   • Dashboard Load: 2200ms → <500ms (~4x faster)';
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
END $$;
