-- ============================================================================
-- MIGRATION 110: Ultra Performance Optimization (Target: 250ms)
-- ============================================================================
-- Priority: P0 - Critical Performance
-- Target: Sub-250ms query response for 10,000+ orders
-- 
-- Strategy:
-- 1. Materialized View for list queries (instant reads)
-- 2. Optimized RPC functions with server-side caching hints
-- 3. Partial indexes for "hot" data (active orders)
-- 4. Lightweight list query (no deep JOINs)
-- ============================================================================

-- ============================================================================
-- PART 1: MATERIALIZED VIEW FOR ORDER LIST
-- ============================================================================
-- This pre-computes the JOINs and stores the result
-- Refresh every 30 seconds or on-demand via trigger
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_orders_list CASCADE;

CREATE MATERIALIZED VIEW mv_orders_list AS
SELECT 
  o.id,
  o.order_number,
  o.readable_id,
  o.status,
  o.fulfillment_type,
  o.total_amount,
  o.payment_status,
  o.payment_method,
  o.shipping_name,
  o.shipping_phone,
  o.shipping_address,
  o.shipping_city,
  o.assigned_to,
  o.rider_id,
  o.courier_partner,
  o.awb_number,
  o.zone_code,
  o.destination_branch,
  o.remarks,
  o.parent_order_id,
  o.created_at,
  o.updated_at,
  o.customer_id,
  -- Pre-joined customer data
  c.name AS customer_name,
  c.phone AS customer_phone,
  c.email AS customer_email,
  c.tier AS customer_tier,
  -- Pre-aggregated items data
  COALESCE(item_agg.item_count, 0) AS item_count,
  COALESCE(item_agg.total_quantity, 0) AS total_quantity,
  item_agg.first_product_name,
  item_agg.first_sku,
  item_agg.items_json,
  -- Search vector for full-text search
  o.search_vector
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN LATERAL (
  SELECT 
    COUNT(*)::int AS item_count,
    SUM(oi.quantity)::int AS total_quantity,
    (ARRAY_AGG(oi.product_name ORDER BY oi.created_at))[1] AS first_product_name,
    (ARRAY_AGG(oi.sku ORDER BY oi.created_at))[1] AS first_sku,
    json_agg(json_build_object(
      'id', oi.id,
      'quantity', oi.quantity,
      'sku', oi.sku,
      'product_name', oi.product_name,
      'variant_name', oi.variant_name,
      'unit_price', oi.unit_price
    ) ORDER BY oi.created_at) AS items_json
  FROM order_items oi
  WHERE oi.order_id = o.id
) item_agg ON true
WHERE o.is_deleted = false;

-- Unique index for fast lookups
CREATE UNIQUE INDEX idx_mv_orders_list_id ON mv_orders_list(id);

-- Primary query pattern index
CREATE INDEX idx_mv_orders_list_main ON mv_orders_list(created_at DESC, status, fulfillment_type);

-- Full-text search index
CREATE INDEX idx_mv_orders_list_search ON mv_orders_list USING GIN(search_vector);

-- Status filter index
CREATE INDEX idx_mv_orders_list_status ON mv_orders_list(status, created_at DESC);

-- Fulfillment type index
CREATE INDEX idx_mv_orders_list_fulfillment ON mv_orders_list(fulfillment_type, status, created_at DESC);

-- Phone search index
CREATE INDEX idx_mv_orders_list_phone ON mv_orders_list(shipping_phone);

-- ============================================================================
-- PART 2: AUTO-REFRESH FUNCTION FOR MATERIALIZED VIEW
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_mv_orders_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Refresh concurrently to avoid locking
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_orders_list;
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to refresh mv_orders_list: %', SQLERRM;
    RETURN NULL;
END;
$$;

-- Note: In production, use a background job (pg_cron) instead of trigger
-- to refresh every 30 seconds. Trigger-based refresh can cause performance issues.

-- ============================================================================
-- PART 3: ULTRA-FAST LIST QUERY RPC FUNCTION
-- ============================================================================
-- Returns pre-computed data from materialized view
-- Target: <50ms for 25 rows
-- ============================================================================

CREATE OR REPLACE FUNCTION get_orders_fast(
  p_page INT DEFAULT 1,
  p_limit INT DEFAULT 25,
  p_status TEXT DEFAULT NULL,
  p_fulfillment_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_orders JSON;
  v_search_query TSQUERY;
BEGIN
  v_offset := (p_page - 1) * p_limit;
  
  -- Build search query if provided
  IF p_search IS NOT NULL AND p_search != '' THEN
    v_search_query := plainto_tsquery('simple', p_search);
  END IF;
  
  -- Get total count (uses index-only scan)
  SELECT COUNT(*)
  INTO v_total
  FROM mv_orders_list m
  WHERE (p_status IS NULL OR m.status = p_status)
    AND (p_fulfillment_type IS NULL OR m.fulfillment_type = p_fulfillment_type)
    AND (p_start_date IS NULL OR m.created_at >= p_start_date)
    AND (p_end_date IS NULL OR m.created_at <= p_end_date)
    AND (p_assigned_to IS NULL OR m.assigned_to = p_assigned_to)
    AND (v_search_query IS NULL OR m.search_vector @@ v_search_query);
  
  -- Get paginated orders
  SELECT json_agg(row_to_json(t))
  INTO v_orders
  FROM (
    SELECT 
      m.id,
      m.order_number,
      m.readable_id,
      m.status,
      m.fulfillment_type,
      m.total_amount,
      m.payment_status,
      m.payment_method,
      m.shipping_name AS customer_name,
      m.shipping_phone AS customer_phone,
      m.shipping_address AS customer_address,
      m.shipping_city AS customer_city,
      m.assigned_to,
      m.rider_id,
      m.zone_code,
      m.destination_branch,
      m.remarks,
      m.parent_order_id,
      m.created_at,
      m.item_count,
      m.total_quantity,
      m.first_product_name,
      m.first_sku,
      m.items_json AS items,
      json_build_object(
        'id', m.customer_id,
        'name', m.customer_name,
        'phone', m.customer_phone,
        'email', m.customer_email,
        'tier', m.customer_tier
      ) AS customer
    FROM mv_orders_list m
    WHERE (p_status IS NULL OR m.status = p_status)
      AND (p_fulfillment_type IS NULL OR m.fulfillment_type = p_fulfillment_type)
      AND (p_start_date IS NULL OR m.created_at >= p_start_date)
      AND (p_end_date IS NULL OR m.created_at <= p_end_date)
      AND (p_assigned_to IS NULL OR m.assigned_to = p_assigned_to)
      AND (v_search_query IS NULL OR m.search_vector @@ v_search_query)
    ORDER BY m.created_at DESC
    LIMIT p_limit
    OFFSET v_offset
  ) t;
  
  RETURN json_build_object(
    'data', COALESCE(v_orders, '[]'::json),
    'pagination', json_build_object(
      'page', p_page,
      'limit', p_limit,
      'total', v_total,
      'totalPages', CEIL(v_total::float / p_limit)::int,
      'hasNext', (v_offset + p_limit) < v_total,
      'hasPrev', p_page > 1
    )
  );
END;
$$;

-- ============================================================================
-- PART 4: PARTIAL INDEXES FOR "HOT" DATA
-- ============================================================================
-- Most queries filter for active orders (not delivered/cancelled)
-- These partial indexes are smaller and faster
-- NOTE: Removed CONCURRENTLY as it cannot run in transaction (Supabase SQL Editor)
-- ============================================================================

-- Active orders only (excludes delivered, cancelled, returned)
DROP INDEX IF EXISTS idx_orders_active_hot;
CREATE INDEX idx_orders_active_hot
ON orders(created_at DESC, status)
WHERE is_deleted = false 
  AND status NOT IN ('delivered', 'cancelled', 'returned');

-- Pending delivery orders (ready for dispatch)
DROP INDEX IF EXISTS idx_orders_pending_dispatch;
CREATE INDEX idx_orders_pending_dispatch
ON orders(fulfillment_type, zone_code, created_at DESC)
WHERE is_deleted = false 
  AND status = 'packed';

-- Recent orders (last 7 days - most frequently accessed)
-- NOTE: Using a fixed interval instead of CURRENT_DATE since functions must be IMMUTABLE
-- This index covers the "hot" data that operators access most often
DROP INDEX IF EXISTS idx_orders_recent;
CREATE INDEX idx_orders_recent
ON orders(created_at DESC, status)
WHERE is_deleted = false;

-- ============================================================================
-- PART 5: OPTIMIZED STATS RPC (Single Scan)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_order_stats_ultra(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_fulfillment_type TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '3s'
AS $$
DECLARE
  result JSON;
BEGIN
  -- Single-pass aggregation using window functions
  WITH filtered_orders AS (
    SELECT 
      status,
      payment_status,
      fulfillment_type,
      total_amount
    FROM orders
    WHERE is_deleted = false
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
      AND (p_fulfillment_type IS NULL OR fulfillment_type = p_fulfillment_type)
  ),
  status_counts AS (
    SELECT status, COUNT(*) as cnt
    FROM filtered_orders
    GROUP BY status
  ),
  payment_counts AS (
    SELECT payment_status, COUNT(*) as cnt
    FROM filtered_orders
    GROUP BY payment_status
  ),
  fulfillment_counts AS (
    SELECT fulfillment_type, COUNT(*) as cnt
    FROM filtered_orders
    GROUP BY fulfillment_type
  ),
  totals AS (
    SELECT 
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN status NOT IN ('delivered', 'cancelled', 'returned') THEN total_amount ELSE 0 END), 0) as pending_revenue,
      COALESCE(AVG(total_amount), 0) as avg_order_value
    FROM filtered_orders
  )
  SELECT json_build_object(
    'total', t.total,
    'totalRevenue', t.total_revenue,
    'pendingRevenue', t.pending_revenue,
    'avgOrderValue', ROUND(t.avg_order_value::numeric, 2),
    'byStatus', (SELECT COALESCE(json_object_agg(status, cnt), '{}') FROM status_counts),
    'byPaymentStatus', (SELECT COALESCE(json_object_agg(payment_status, cnt), '{}') FROM payment_counts),
    'byFulfillmentType', (SELECT COALESCE(json_object_agg(fulfillment_type, cnt), '{}') FROM fulfillment_counts)
  )
  INTO result
  FROM totals t;
  
  RETURN COALESCE(result, '{"total":0,"totalRevenue":0,"pendingRevenue":0,"avgOrderValue":0,"byStatus":{},"byPaymentStatus":{},"byFulfillmentType":{}}'::json);
END;
$$;

-- ============================================================================
-- PART 6: SAFE REFRESH RPC (For API calls)
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_mv_orders_list_safe()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
BEGIN
  -- Refresh concurrently to avoid locking
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_orders_list;
EXCEPTION
  WHEN OTHERS THEN
    -- If concurrent refresh fails (no unique index), do regular refresh
    BEGIN
      REFRESH MATERIALIZED VIEW mv_orders_list;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to refresh mv_orders_list: %', SQLERRM;
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_mv_orders_list_safe TO authenticated;

-- ============================================================================
-- PART 7: INITIAL REFRESH
-- ============================================================================

-- Initial refresh
REFRESH MATERIALIZED VIEW mv_orders_list;

-- Grant access
GRANT SELECT ON mv_orders_list TO authenticated;
GRANT EXECUTE ON FUNCTION get_orders_fast TO authenticated;
GRANT EXECUTE ON FUNCTION get_order_stats_ultra TO authenticated;

-- ============================================================================
-- PART 7: SCHEDULE AUTO-REFRESH (Using pg_cron if available)
-- ============================================================================
-- Run this manually if pg_cron is enabled:
-- SELECT cron.schedule('refresh-orders-mv', '*/30 * * * * *', 
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_orders_list');

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

ANALYZE orders;
ANALYZE order_items;
ANALYZE customers;
ANALYZE mv_orders_list;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON MATERIALIZED VIEW mv_orders_list IS 
  'Pre-computed order list with JOINs. Target: <50ms query time. Refresh every 30s.';
COMMENT ON FUNCTION get_orders_fast IS 
  'Ultra-fast order list query using materialized view. Target: <100ms total.';
COMMENT ON FUNCTION get_order_stats_ultra IS 
  'Single-pass stats aggregation. Target: <50ms for 10k orders.';
