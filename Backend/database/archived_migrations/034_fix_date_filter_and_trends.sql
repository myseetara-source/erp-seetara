-- =============================================================================
-- MIGRATION 034: FIX DATE FILTERING & DYNAMIC TRENDS
-- =============================================================================
-- 
-- FIXES:
-- 1. Dynamic time-series based on date range (hourly/daily/weekly)
-- 2. Proper date filtering for all metrics
-- 3. Reset to zero when no data exists
-- 4. Add time_series data for charts
-- =============================================================================

-- Drop existing function to recreate
DROP FUNCTION IF EXISTS get_inventory_metrics(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID, TEXT);

-- =============================================================================
-- RECREATE: get_inventory_metrics with proper date filtering
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
    v_date_diff_hours INTEGER;
    v_time_bucket TEXT;
    
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
    
    v_low_stock_count BIGINT := 0;
    v_out_of_stock_count BIGINT := 0;
    v_pending_approvals BIGINT := 0;
    
    -- Previous period for trends
    v_prev_start_date TIMESTAMP WITH TIME ZONE;
    v_prev_end_date TIMESTAMP WITH TIME ZONE;
    v_prev_purchase_value NUMERIC := 0;
    v_prev_damage_value NUMERIC := 0;
    
    -- Dynamic data
    v_recent_transactions JSON;
    v_low_stock_items JSON;
    v_time_series JSON;
BEGIN
    -- Set default date range (this month if not provided)
    v_start_date := COALESCE(p_start_date, date_trunc('month', CURRENT_TIMESTAMP));
    v_end_date := COALESCE(p_end_date, CURRENT_TIMESTAMP);
    
    -- Calculate date difference in hours for time bucket determination
    v_date_diff_hours := EXTRACT(EPOCH FROM (v_end_date - v_start_date)) / 3600;
    
    -- Determine time bucket based on date range
    IF v_date_diff_hours <= 48 THEN
        v_time_bucket := 'hour';
    ELSIF v_date_diff_hours <= 336 THEN -- 14 days
        v_time_bucket := 'day';
    ELSE
        v_time_bucket := 'week';
    END IF;
    
    -- Calculate previous period (same duration, before start date)
    v_prev_end_date := v_start_date - INTERVAL '1 second';
    v_prev_start_date := v_start_date - (v_end_date - v_start_date);
    
    -- Check if user can see financial data
    v_can_see_financials := p_user_role IN ('admin', 'manager');
    
    -- ==========================================================================
    -- AGGREGATE: Total Stock Value & Units (Current Inventory - NOT filtered by date)
    -- ==========================================================================
    SELECT 
        COALESCE(SUM(pv.current_stock * COALESCE(pv.cost_price, 0)), 0),
        COALESCE(SUM(pv.current_stock), 0),
        COUNT(DISTINCT pv.id)
    INTO v_total_stock_value, v_total_stock_units, v_active_variants
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.current_stock > 0
      AND p.status = 'active'
      AND pv.is_active = true;
    
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
    -- AGGREGATE: Low Stock & Out of Stock (Current state, not date filtered)
    -- ==========================================================================
    SELECT COUNT(*)
    INTO v_low_stock_count
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.current_stock > 0
      AND pv.current_stock <= COALESCE(pv.reorder_level, 10)
      AND p.status = 'active'
      AND pv.is_active = true;
    
    SELECT COUNT(*)
    INTO v_out_of_stock_count
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.current_stock <= 0
      AND p.status = 'active'
      AND pv.is_active = true;
    
    -- ==========================================================================
    -- AGGREGATE: Pending Approvals (Current state)
    -- ==========================================================================
    SELECT COUNT(*)
    INTO v_pending_approvals
    FROM inventory_transactions
    WHERE status = 'pending';
    
    -- ==========================================================================
    -- TREND: Previous Period (for comparison)
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
    -- RECENT TRANSACTIONS (within date range)
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
    -- LOW STOCK ITEMS (Current state)
    -- ==========================================================================
    SELECT json_agg(t)
    INTO v_low_stock_items
    FROM (
        SELECT 
            pv.id,
            pv.sku,
            p.name as product_name,
            pv.current_stock,
            COALESCE(pv.reorder_level, 10) as threshold,
            CASE WHEN v_can_see_financials THEN pv.cost_price ELSE NULL END as cost_price,
            pv.selling_price
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.current_stock > 0
          AND pv.current_stock <= COALESCE(pv.reorder_level, 10)
          AND p.status = 'active'
          AND pv.is_active = true
        ORDER BY pv.current_stock ASC
        LIMIT 10
    ) t;
    
    -- ==========================================================================
    -- DYNAMIC TIME SERIES (based on date range)
    -- ==========================================================================
    IF v_time_bucket = 'hour' THEN
        -- Hourly data for < 2 days
        SELECT json_agg(t ORDER BY t.bucket)
        INTO v_time_series
        FROM (
            SELECT 
                to_char(d.bucket, 'HH24:00') as label,
                d.bucket::text as bucket,
                COALESCE((
                    SELECT SUM(
                        (SELECT COALESCE(SUM(item.quantity), 0) 
                         FROM inventory_transaction_items item 
                         WHERE item.transaction_id = it.id)
                    )
                    FROM inventory_transactions it 
                    WHERE it.transaction_type = 'purchase' 
                      AND it.status = 'approved'
                      AND it.created_at >= d.bucket 
                      AND it.created_at < d.bucket + INTERVAL '1 hour'
                ), 0) as stock_in,
                COALESCE((
                    SELECT SUM(
                        (SELECT COALESCE(SUM(item.quantity), 0) 
                         FROM inventory_transaction_items item 
                         WHERE item.transaction_id = it.id)
                    )
                    FROM inventory_transactions it 
                    WHERE it.transaction_type IN ('damage', 'purchase_return')
                      AND it.status = 'approved'
                      AND it.created_at >= d.bucket 
                      AND it.created_at < d.bucket + INTERVAL '1 hour'
                ), 0) as stock_out
            FROM generate_series(
                date_trunc('hour', v_start_date),
                date_trunc('hour', v_end_date),
                INTERVAL '1 hour'
            ) d(bucket)
        ) t;
    ELSIF v_time_bucket = 'day' THEN
        -- Daily data for 2-14 days
        SELECT json_agg(t ORDER BY t.bucket)
        INTO v_time_series
        FROM (
            SELECT 
                to_char(d.bucket, 'Mon DD') as label,
                d.bucket::date::text as bucket,
                COALESCE((
                    SELECT SUM(
                        (SELECT COALESCE(SUM(item.quantity), 0) 
                         FROM inventory_transaction_items item 
                         WHERE item.transaction_id = it.id)
                    )
                    FROM inventory_transactions it 
                    WHERE it.transaction_type = 'purchase' 
                      AND it.status = 'approved'
                      AND DATE(it.created_at) = d.bucket::date
                ), 0) as stock_in,
                COALESCE((
                    SELECT SUM(
                        (SELECT COALESCE(SUM(item.quantity), 0) 
                         FROM inventory_transaction_items item 
                         WHERE item.transaction_id = it.id)
                    )
                    FROM inventory_transactions it 
                    WHERE it.transaction_type IN ('damage', 'purchase_return')
                      AND it.status = 'approved'
                      AND DATE(it.created_at) = d.bucket::date
                ), 0) as stock_out
            FROM generate_series(
                date_trunc('day', v_start_date),
                date_trunc('day', v_end_date),
                INTERVAL '1 day'
            ) d(bucket)
        ) t;
    ELSE
        -- Weekly data for > 14 days
        SELECT json_agg(t ORDER BY t.bucket)
        INTO v_time_series
        FROM (
            SELECT 
                'Week ' || EXTRACT(WEEK FROM d.bucket)::text as label,
                d.bucket::date::text as bucket,
                COALESCE((
                    SELECT SUM(
                        (SELECT COALESCE(SUM(item.quantity), 0) 
                         FROM inventory_transaction_items item 
                         WHERE item.transaction_id = it.id)
                    )
                    FROM inventory_transactions it 
                    WHERE it.transaction_type = 'purchase' 
                      AND it.status = 'approved'
                      AND it.created_at >= d.bucket 
                      AND it.created_at < d.bucket + INTERVAL '1 week'
                ), 0) as stock_in,
                COALESCE((
                    SELECT SUM(
                        (SELECT COALESCE(SUM(item.quantity), 0) 
                         FROM inventory_transaction_items item 
                         WHERE item.transaction_id = it.id)
                    )
                    FROM inventory_transactions it 
                    WHERE it.transaction_type IN ('damage', 'purchase_return')
                      AND it.status = 'approved'
                      AND it.created_at >= d.bucket 
                      AND it.created_at < d.bucket + INTERVAL '1 week'
                ), 0) as stock_out
            FROM generate_series(
                date_trunc('week', v_start_date),
                date_trunc('week', v_end_date),
                INTERVAL '1 week'
            ) d(bucket)
        ) t;
    END IF;
    
    -- ==========================================================================
    -- BUILD FINAL RESULT
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
        'time_series', COALESCE(v_time_series, '[]'::json),
        'time_bucket', v_time_bucket,
        'stock_trend', COALESCE(v_time_series, '[]'::json),
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
            'end', v_end_date,
            'bucket', v_time_bucket
        ),
        'generated_at', CURRENT_TIMESTAMP
    );
    
    RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_inventory_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_metrics TO service_role;

-- =============================================================================
-- Success Message
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 034 COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '  ✓ get_inventory_metrics() updated with:';
    RAISE NOTICE '    - Dynamic time series (hourly/daily/weekly)';
    RAISE NOTICE '    - Proper date filtering';
    RAISE NOTICE '    - Zero-state handling';
    RAISE NOTICE '    - time_bucket indicator';
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;
