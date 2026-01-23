-- =============================================================================
-- MIGRATION 033: INVENTORY ANALYTICS RPC (World-Class Performance)
-- =============================================================================
-- 
-- PURPOSE: Create a single, optimized RPC that returns ALL inventory metrics
-- in one database hit. Supports date filtering and role-based data masking.
--
-- PERFORMANCE: Designed for 100M+ records with proper indexing
-- =============================================================================

-- STEP 1: Add performance indexes (if not exist)
-- =============================================================================

-- Index for date-range queries on inventory_transactions
CREATE INDEX IF NOT EXISTS idx_inv_tx_created_at 
ON inventory_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_tx_type_date 
ON inventory_transactions(transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_tx_vendor_type_date 
ON inventory_transactions(vendor_id, transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_tx_status_date 
ON inventory_transactions(status, created_at DESC);

-- Index for product_variants stock queries
CREATE INDEX IF NOT EXISTS idx_pv_stock_quantity 
ON product_variants(stock_quantity);

CREATE INDEX IF NOT EXISTS idx_pv_low_stock 
ON product_variants(stock_quantity, low_stock_threshold);

-- =============================================================================
-- STEP 2: Create the main analytics function
-- =============================================================================

CREATE OR REPLACE FUNCTION get_inventory_metrics(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_vendor_id UUID DEFAULT NULL,
    p_user_role TEXT DEFAULT 'staff'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_start_date TIMESTAMP WITH TIME ZONE;
    v_end_date TIMESTAMP WITH TIME ZONE;
    v_can_see_financials BOOLEAN;
    
    -- Aggregation variables
    v_total_stock_value NUMERIC := 0;
    v_total_stock_units BIGINT := 0;
    v_active_variants BIGINT := 0;
    
    v_purchase_value NUMERIC := 0;
    v_purchase_units BIGINT := 0;
    v_purchase_count BIGINT := 0;
    
    v_return_value NUMERIC := 0;
    v_return_units BIGINT := 0;
    v_return_count BIGINT := 0;
    
    v_damage_value NUMERIC := 0;
    v_damage_units BIGINT := 0;
    v_damage_count BIGINT := 0;
    
    v_adjustment_value NUMERIC := 0;
    v_adjustment_units BIGINT := 0;
    
    v_low_stock_count BIGINT := 0;
    v_out_of_stock_count BIGINT := 0;
    v_pending_approvals BIGINT := 0;
    
    -- Previous period for trends
    v_prev_start_date TIMESTAMP WITH TIME ZONE;
    v_prev_end_date TIMESTAMP WITH TIME ZONE;
    v_prev_purchase_value NUMERIC := 0;
    v_prev_damage_value NUMERIC := 0;
    
    -- Recent transactions
    v_recent_transactions JSON;
    v_low_stock_items JSON;
    v_stock_trend JSON;
BEGIN
    -- Set default date range (this month if not provided)
    v_start_date := COALESCE(p_start_date, date_trunc('month', CURRENT_TIMESTAMP));
    v_end_date := COALESCE(p_end_date, CURRENT_TIMESTAMP);
    
    -- Calculate previous period (same duration, before start date)
    v_prev_end_date := v_start_date - INTERVAL '1 second';
    v_prev_start_date := v_start_date - (v_end_date - v_start_date);
    
    -- Check if user can see financial data
    v_can_see_financials := p_user_role IN ('admin', 'manager');
    
    -- ==========================================================================
    -- AGGREGATE: Total Stock Value & Units (Current Inventory)
    -- ==========================================================================
    SELECT 
        COALESCE(SUM(pv.stock_quantity * COALESCE(pv.cost_price, 0)), 0),
        COALESCE(SUM(pv.stock_quantity), 0),
        COUNT(DISTINCT pv.id)
    INTO v_total_stock_value, v_total_stock_units, v_active_variants
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.stock_quantity > 0
      AND p.status = 'active';
    
    -- ==========================================================================
    -- AGGREGATE: Purchases (Stock In) for date range
    -- ==========================================================================
    SELECT 
        COALESCE(SUM(it.total_cost), 0),
        COALESCE(SUM(
            (SELECT COALESCE(SUM(item.quantity), 0) 
             FROM inventory_transaction_items item 
             WHERE item.transaction_id = it.id)
        ), 0),
        COUNT(*)
    INTO v_purchase_value, v_purchase_units, v_purchase_count
    FROM inventory_transactions it
    WHERE it.transaction_type = 'purchase'
      AND it.status = 'approved'
      AND it.created_at >= v_start_date
      AND it.created_at <= v_end_date
      AND (p_vendor_id IS NULL OR it.vendor_id = p_vendor_id);
    
    -- ==========================================================================
    -- AGGREGATE: Returns (Stock Out) for date range
    -- ==========================================================================
    SELECT 
        COALESCE(SUM(it.total_cost), 0),
        COALESCE(SUM(
            (SELECT COALESCE(SUM(item.quantity), 0) 
             FROM inventory_transaction_items item 
             WHERE item.transaction_id = it.id)
        ), 0),
        COUNT(*)
    INTO v_return_value, v_return_units, v_return_count
    FROM inventory_transactions it
    WHERE it.transaction_type = 'purchase_return'
      AND it.status = 'approved'
      AND it.created_at >= v_start_date
      AND it.created_at <= v_end_date
      AND (p_vendor_id IS NULL OR it.vendor_id = p_vendor_id);
    
    -- ==========================================================================
    -- AGGREGATE: Damages for date range
    -- ==========================================================================
    SELECT 
        COALESCE(SUM(it.total_cost), 0),
        COALESCE(SUM(
            (SELECT COALESCE(SUM(item.quantity), 0) 
             FROM inventory_transaction_items item 
             WHERE item.transaction_id = it.id)
        ), 0),
        COUNT(*)
    INTO v_damage_value, v_damage_units, v_damage_count
    FROM inventory_transactions it
    WHERE it.transaction_type = 'damage'
      AND it.status = 'approved'
      AND it.created_at >= v_start_date
      AND it.created_at <= v_end_date
      AND (p_vendor_id IS NULL OR it.vendor_id = p_vendor_id);
    
    -- ==========================================================================
    -- AGGREGATE: Low Stock & Out of Stock
    -- ==========================================================================
    SELECT COUNT(*)
    INTO v_low_stock_count
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.stock_quantity > 0
      AND pv.stock_quantity <= COALESCE(pv.low_stock_threshold, 5)
      AND p.status = 'active';
    
    SELECT COUNT(*)
    INTO v_out_of_stock_count
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.stock_quantity <= 0
      AND p.status = 'active';
    
    -- ==========================================================================
    -- AGGREGATE: Pending Approvals
    -- ==========================================================================
    SELECT COUNT(*)
    INTO v_pending_approvals
    FROM inventory_transactions
    WHERE status = 'pending';
    
    -- ==========================================================================
    -- TREND: Previous Period Purchases & Damages
    -- ==========================================================================
    SELECT COALESCE(SUM(total_cost), 0)
    INTO v_prev_purchase_value
    FROM inventory_transactions
    WHERE transaction_type = 'purchase'
      AND status = 'approved'
      AND created_at >= v_prev_start_date
      AND created_at <= v_prev_end_date;
    
    SELECT COALESCE(SUM(total_cost), 0)
    INTO v_prev_damage_value
    FROM inventory_transactions
    WHERE transaction_type = 'damage'
      AND status = 'approved'
      AND created_at >= v_prev_start_date
      AND created_at <= v_prev_end_date;
    
    -- ==========================================================================
    -- RECENT TRANSACTIONS (Last 10)
    -- ==========================================================================
    SELECT json_agg(t)
    INTO v_recent_transactions
    FROM (
        SELECT 
            it.id,
            it.invoice_no,
            it.transaction_type,
            it.status,
            CASE WHEN v_can_see_financials THEN it.total_cost ELSE NULL END as total_cost,
            it.created_at as transaction_date,
            json_build_object('name', v.company_name) as vendor
        FROM inventory_transactions it
        LEFT JOIN vendors v ON v.id = it.vendor_id
        WHERE it.created_at >= v_start_date
          AND it.created_at <= v_end_date
        ORDER BY it.created_at DESC
        LIMIT 10
    ) t;
    
    -- ==========================================================================
    -- LOW STOCK ITEMS (Top 10)
    -- ==========================================================================
    SELECT json_agg(t)
    INTO v_low_stock_items
    FROM (
        SELECT 
            pv.id,
            pv.sku,
            p.name as product_name,
            pv.stock_quantity as current_stock,
            COALESCE(pv.low_stock_threshold, 5) as threshold,
            CASE WHEN v_can_see_financials THEN pv.cost_price ELSE NULL END as cost_price,
            pv.selling_price
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.stock_quantity > 0
          AND pv.stock_quantity <= COALESCE(pv.low_stock_threshold, 5)
          AND p.status = 'active'
        ORDER BY pv.stock_quantity ASC
        LIMIT 10
    ) t;
    
    -- ==========================================================================
    -- STOCK TREND (Last 7 days, for sparkline)
    -- ==========================================================================
    SELECT json_agg(t ORDER BY t.day)
    INTO v_stock_trend
    FROM (
        SELECT 
            d.day::date::text as day,
            COALESCE(SUM(CASE 
                WHEN it.transaction_type = 'purchase' THEN 1
                WHEN it.transaction_type IN ('damage', 'purchase_return') THEN -1
                ELSE 0 
            END), 0) as net_change
        FROM generate_series(
            CURRENT_DATE - INTERVAL '6 days',
            CURRENT_DATE,
            INTERVAL '1 day'
        ) d(day)
        LEFT JOIN inventory_transactions it 
            ON DATE(it.created_at) = d.day::date
            AND it.status = 'approved'
        GROUP BY d.day
    ) t;
    
    -- ==========================================================================
    -- BUILD FINAL RESULT (with role-based masking)
    -- ==========================================================================
    v_result := json_build_object(
        'total_stock_value', json_build_object(
            'value', CASE WHEN v_can_see_financials THEN v_total_stock_value ELSE '***' END,
            'units', v_total_stock_units,
            'active_variants', v_active_variants
        ),
        'inventory_turnover', json_build_object(
            'this_month', json_build_object(
                'stock_in', CASE WHEN v_can_see_financials THEN v_purchase_value ELSE '***' END,
                'stock_in_qty', v_purchase_units,
                'stock_out', CASE WHEN v_can_see_financials THEN v_return_value + v_damage_value ELSE '***' END,
                'stock_out_qty', v_return_units + v_damage_units,
                'orders_value', CASE WHEN v_can_see_financials THEN 0 ELSE '***' END
            ),
            'last_month', json_build_object(
                'stock_in', CASE WHEN v_can_see_financials THEN v_prev_purchase_value ELSE '***' END,
                'stock_out', CASE WHEN v_can_see_financials THEN v_prev_damage_value ELSE '***' END
            )
        ),
        'critical_stock', json_build_object(
            'count', v_low_stock_count,
            'items', COALESCE(v_low_stock_items, '[]'::json)
        ),
        'damage_loss', json_build_object(
            'this_month', json_build_object(
                'total_value', CASE WHEN v_can_see_financials THEN v_damage_value ELSE '***' END,
                'transaction_count', v_damage_count,
                'units_damaged', v_damage_units
            ),
            'last_month', json_build_object(
                'total_value', CASE WHEN v_can_see_financials THEN v_prev_damage_value ELSE '***' END
            ),
            'recent', '[]'::json
        ),
        'stock_trend', COALESCE(v_stock_trend, '[]'::json),
        'pending_actions', json_build_object(
            'pending_approvals', v_pending_approvals,
            'out_of_stock', v_out_of_stock_count
        ),
        'recent_transactions', COALESCE(v_recent_transactions, '[]'::json),
        'purchase_summary', json_build_object(
            'total_value', CASE WHEN v_can_see_financials THEN v_purchase_value ELSE '***' END,
            'total_units', v_purchase_units,
            'count', v_purchase_count,
            'trend_percent', CASE 
                WHEN v_prev_purchase_value > 0 
                THEN ROUND(((v_purchase_value - v_prev_purchase_value) / v_prev_purchase_value * 100)::numeric, 1)
                ELSE 0 
            END
        ),
        'return_summary', json_build_object(
            'total_value', CASE WHEN v_can_see_financials THEN v_return_value ELSE '***' END,
            'total_units', v_return_units,
            'count', v_return_count
        ),
        'date_range', json_build_object(
            'start', v_start_date,
            'end', v_end_date
        ),
        'generated_at', CURRENT_TIMESTAMP
    );
    
    RETURN v_result;
END;
$$;

-- =============================================================================
-- STEP 3: Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION get_inventory_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_metrics TO service_role;

-- =============================================================================
-- Success Message
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 033 COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '  ✓ Performance indexes created';
    RAISE NOTICE '  ✓ get_inventory_metrics() function created';
    RAISE NOTICE '  ✓ Role-based data masking enabled';
    RAISE NOTICE '  ✓ Trend calculations included';
    RAISE NOTICE '  ✓ Date range filtering supported';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE 'Usage: SELECT get_inventory_metrics(';
    RAISE NOTICE '         p_start_date => ''2026-01-01''::timestamp,';
    RAISE NOTICE '         p_end_date => NOW(),';
    RAISE NOTICE '         p_vendor_id => NULL,';
    RAISE NOTICE '         p_user_role => ''admin''';
    RAISE NOTICE '       );';
END $$;
