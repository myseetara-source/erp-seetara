-- ============================================================================
-- Migration 130: Add Logistics Fields to get_orders_fast RPC
-- ============================================================================
-- 
-- P0 FIX: The fast path RPC function was missing logistics fields:
-- - delivery_type (D2D/D2B for NCM)
-- - courier_partner (NCM/Gaau Besi)  
-- - is_logistics_synced
-- - external_order_id
-- - logistics_provider
-- - logistics_synced_at
-- - awb_number
--
-- This caused the dispatch table to show null delivery_type for all orders
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
      -- P0 FIX: Added logistics fields
      m.delivery_type,
      m.courier_partner,
      m.is_logistics_synced,
      m.external_order_id,
      m.logistics_provider,
      m.logistics_synced_at,
      m.awb_number,
      -- End logistics fields
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
-- VERIFICATION
-- ============================================================================
-- Run this to verify the function returns delivery_type:
-- 
-- SELECT (get_orders_fast(1, 10, 'packed', 'outside_valley', NULL, NULL, NULL, NULL)::json->'data'->0);
-- ============================================================================
