-- ============================================================================
-- Migration 128: Add logistics fields to materialized view
-- P0 FIX: delivery_type and logistics sync fields were missing from mv_orders_list
-- ============================================================================
-- 
-- Run this migration in Supabase SQL Editor:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Paste this entire script
-- 3. Click "Run"
-- ============================================================================

-- Drop and recreate materialized view with new fields
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
  -- P0 FIX: Add logistics sync fields
  o.delivery_type,
  o.is_logistics_synced,
  o.external_order_id,
  o.logistics_provider,
  o.logistics_synced_at,
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

-- Recreate indexes
CREATE UNIQUE INDEX idx_mv_orders_list_id ON mv_orders_list(id);
CREATE INDEX idx_mv_orders_list_main ON mv_orders_list(created_at DESC, status, fulfillment_type);
CREATE INDEX idx_mv_orders_list_search ON mv_orders_list USING GIN(search_vector);
CREATE INDEX idx_mv_orders_list_status ON mv_orders_list(status, created_at DESC);
CREATE INDEX idx_mv_orders_list_fulfillment ON mv_orders_list(fulfillment_type, status, created_at DESC);
CREATE INDEX idx_mv_orders_list_phone ON mv_orders_list(shipping_phone);

-- P0 FIX: Add index for logistics sync queries
CREATE INDEX idx_mv_orders_list_logistics ON mv_orders_list(is_logistics_synced, courier_partner) 
WHERE fulfillment_type = 'outside_valley';

-- Initial refresh
REFRESH MATERIALIZED VIEW mv_orders_list;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run this to verify the migration:
-- 
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'mv_orders_list' 
-- AND column_name IN ('delivery_type', 'is_logistics_synced', 'external_order_id');
-- ============================================================================
