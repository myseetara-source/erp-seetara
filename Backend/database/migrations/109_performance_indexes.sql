-- ============================================================================
-- MIGRATION 109: Performance Indexes for Orders Table
-- ============================================================================
-- Priority: P0 - Critical Performance
-- Target: Sub-400ms query response for 10,000+ orders
-- 
-- This migration adds composite indexes for common query patterns identified
-- in the performance audit.
-- 
-- NOTE: Removed CONCURRENTLY as Supabase SQL Editor runs in a transaction.
-- For production with zero downtime, run these indexes separately via CLI.
-- ============================================================================

-- ============================================================================
-- PHONE NUMBER INDEXES (High Priority)
-- Used for: Customer search by phone (very common)
-- ============================================================================

-- Primary phone number lookup
DROP INDEX IF EXISTS idx_orders_shipping_phone;
CREATE INDEX idx_orders_shipping_phone 
ON orders(shipping_phone) 
WHERE shipping_phone IS NOT NULL;

-- Alternate phone number lookup (added in migration 107)
DROP INDEX IF EXISTS idx_orders_alt_phone;
CREATE INDEX idx_orders_alt_phone 
ON orders(alt_phone) 
WHERE alt_phone IS NOT NULL;

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON FILTER PATTERNS (High Priority)
-- ============================================================================

-- Most common pattern: status + payment_status + date (for payment filtering)
DROP INDEX IF EXISTS idx_orders_status_payment_date;
CREATE INDEX idx_orders_status_payment_date 
ON orders(status, payment_status, created_at DESC) 
WHERE is_deleted = false;

-- Pattern: assigned_to + status + date (for staff workload view)
DROP INDEX IF EXISTS idx_orders_assigned_status_date;
CREATE INDEX idx_orders_assigned_status_date 
ON orders(assigned_to, status, created_at DESC) 
WHERE assigned_to IS NOT NULL AND is_deleted = false;

-- Pattern: rider + status + date (for rider workload view)
DROP INDEX IF EXISTS idx_orders_rider_status_date;
CREATE INDEX idx_orders_rider_status_date 
ON orders(rider_id, status, created_at DESC) 
WHERE rider_id IS NOT NULL AND is_deleted = false;

-- Pattern: customer + status + date (for customer order history)
DROP INDEX IF EXISTS idx_orders_customer_status_date;
CREATE INDEX idx_orders_customer_status_date 
ON orders(customer_id, status, created_at DESC) 
WHERE is_deleted = false;

-- ============================================================================
-- ZONE & BRANCH INDEXES (For Dispatch Optimization)
-- ============================================================================

-- Zone-based filtering for inside_valley dispatching
DROP INDEX IF EXISTS idx_orders_zone_status_date;
CREATE INDEX idx_orders_zone_status_date 
ON orders(zone_code, status, created_at DESC) 
WHERE zone_code IS NOT NULL AND fulfillment_type = 'inside_valley' AND is_deleted = false;

-- Branch-based filtering for outside_valley (courier) dispatching  
DROP INDEX IF EXISTS idx_orders_branch_status_date;
CREATE INDEX idx_orders_branch_status_date
ON orders(destination_branch, status, created_at DESC)
WHERE destination_branch IS NOT NULL AND fulfillment_type = 'outside_valley' AND is_deleted = false;

-- ============================================================================
-- READABLE_ID INDEX (For User-Friendly Order Lookup)
-- ============================================================================

DROP INDEX IF EXISTS idx_orders_readable_id;
CREATE INDEX idx_orders_readable_id 
ON orders(readable_id) 
WHERE readable_id IS NOT NULL;

-- ============================================================================
-- PARENT ORDER INDEX (For Exchange/Refund Queries)
-- Optimizes child order lookups during list queries
-- ============================================================================

DROP INDEX IF EXISTS idx_orders_parent_order_id;
CREATE INDEX idx_orders_parent_order_id 
ON orders(parent_order_id, created_at DESC) 
WHERE parent_order_id IS NOT NULL AND is_deleted = false;

-- ============================================================================
-- COVERING INDEX FOR LIST VIEW (Ultra-Optimization)
-- Includes all columns needed for the order list to avoid table lookups
-- ============================================================================

-- This is the "magic bullet" index that covers the main list query
DROP INDEX IF EXISTS idx_orders_list_covering;
CREATE INDEX idx_orders_list_covering 
ON orders(
  created_at DESC, 
  status, 
  fulfillment_type
)
INCLUDE (
  id,
  order_number,
  readable_id,
  total_amount,
  payment_status,
  shipping_name,
  shipping_phone,
  shipping_address,
  shipping_city,
  customer_id,
  assigned_to,
  rider_id,
  zone_code,
  destination_branch,
  remarks
)
WHERE is_deleted = false;

-- ============================================================================
-- ORDER_ITEMS INDEXES (For JOIN Optimization)
-- ============================================================================

-- Speed up order_items lookup by order_id
DROP INDEX IF EXISTS idx_order_items_order_id;
CREATE INDEX idx_order_items_order_id 
ON order_items(order_id);

-- Covering index for order_items list display
DROP INDEX IF EXISTS idx_order_items_covering;
CREATE INDEX idx_order_items_covering
ON order_items(order_id)
INCLUDE (
  id,
  quantity,
  sku,
  product_name,
  variant_name,
  unit_price,
  variant_id
);

-- ============================================================================
-- RPC FUNCTION: get_order_stats_v2
-- Replaces the slow JavaScript aggregation with a single efficient SQL query
-- ============================================================================

CREATE OR REPLACE FUNCTION get_order_stats_v2(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_fulfillment_type TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INT;
  v_total_revenue NUMERIC;
  v_pending_revenue NUMERIC;
  v_avg_order_value NUMERIC;
  v_by_status JSON;
  v_by_payment JSON;
  v_by_fulfillment JSON;
BEGIN
  -- Get totals in single query
  SELECT 
    COUNT(*),
    COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status NOT IN ('delivered', 'cancelled', 'returned') THEN total_amount ELSE 0 END), 0),
    COALESCE(AVG(total_amount), 0)
  INTO v_total, v_total_revenue, v_pending_revenue, v_avg_order_value
  FROM orders
  WHERE is_deleted = false
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
    AND (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
    AND (p_fulfillment_type IS NULL OR fulfillment_type = p_fulfillment_type);

  -- Get status breakdown
  SELECT COALESCE(json_object_agg(status, cnt), '{}'::json)
  INTO v_by_status
  FROM (
    SELECT status, COUNT(*) as cnt
    FROM orders
    WHERE is_deleted = false
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
      AND (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
      AND (p_fulfillment_type IS NULL OR fulfillment_type = p_fulfillment_type)
    GROUP BY status
  ) s;

  -- Get payment status breakdown
  SELECT COALESCE(json_object_agg(payment_status, cnt), '{}'::json)
  INTO v_by_payment
  FROM (
    SELECT payment_status, COUNT(*) as cnt
    FROM orders
    WHERE is_deleted = false
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
      AND (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
      AND (p_fulfillment_type IS NULL OR fulfillment_type = p_fulfillment_type)
    GROUP BY payment_status
  ) p;

  -- Get fulfillment type breakdown
  SELECT COALESCE(json_object_agg(fulfillment_type, cnt), '{}'::json)
  INTO v_by_fulfillment
  FROM (
    SELECT fulfillment_type, COUNT(*) as cnt
    FROM orders
    WHERE is_deleted = false
      AND (p_start_date IS NULL OR created_at >= p_start_date)
      AND (p_end_date IS NULL OR created_at <= p_end_date)
      AND (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
      AND (p_fulfillment_type IS NULL OR fulfillment_type = p_fulfillment_type)
    GROUP BY fulfillment_type
  ) f;

  RETURN json_build_object(
    'total', v_total,
    'byStatus', v_by_status,
    'totalRevenue', v_total_revenue,
    'pendingRevenue', v_pending_revenue,
    'avgOrderValue', ROUND(v_avg_order_value, 2),
    'byPaymentStatus', v_by_payment,
    'byFulfillmentType', v_by_fulfillment
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_order_stats_v2 TO authenticated;

-- ============================================================================
-- ANALYZE TABLES (Refresh Statistics)
-- Run this after adding indexes to update query planner statistics
-- ============================================================================

ANALYZE orders;
ANALYZE order_items;
ANALYZE customers;
ANALYZE product_variants;
ANALYZE products;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON INDEX idx_orders_shipping_phone IS 'Phone search optimization - covers customer lookup by phone';
COMMENT ON INDEX idx_orders_status_payment_date IS 'Composite index for status + payment + date filtering';
COMMENT ON INDEX idx_orders_list_covering IS 'Covering index for order list view - avoids table lookups';
COMMENT ON FUNCTION get_order_stats_v2 IS 'Optimized order statistics - replaces JS aggregation with SQL GROUP BY';
