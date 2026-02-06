-- Migration 104c: ONLY the RPC functions
-- Run AFTER tables and columns exist

-- Function 1: Get orders for handover
-- Using status::TEXT to avoid enum issues
CREATE OR REPLACE FUNCTION get_orders_for_courier_handover(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    order_id UUID, readable_id TEXT, customer_name TEXT, customer_phone TEXT,
    shipping_city TEXT, shipping_address TEXT, total_amount DECIMAL,
    payment_method TEXT, is_cod BOOLEAN, item_count BIGINT, created_at TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER AS $$
    SELECT o.id, o.readable_id, o.shipping_name, o.shipping_phone, o.shipping_city,
           o.shipping_address, o.total_amount, o.payment_method, (o.payment_method = 'cod'),
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id), o.created_at
    FROM orders o WHERE o.fulfillment_type = 'outside_valley'
      AND o.status::TEXT IN ('packed', 'confirmed', 'processing') AND o.courier_manifest_id IS NULL
    ORDER BY o.created_at ASC LIMIT p_limit;
$$;

-- Function 2: Create manifest
CREATE OR REPLACE FUNCTION create_courier_handover_manifest(
    p_courier_id UUID, p_order_ids UUID[], p_created_by UUID,
    p_pickup_agent_name TEXT DEFAULT NULL, p_pickup_agent_phone TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_manifest_id UUID; v_manifest_readable_id TEXT; v_total_orders INTEGER; v_total_cod DECIMAL; v_courier RECORD;
BEGIN
    SELECT * INTO v_courier FROM couriers WHERE id = p_courier_id AND is_active = TRUE;
    IF NOT FOUND THEN RETURN '{"success":false,"error":"Invalid courier"}'::JSON; END IF;
    
    SELECT COUNT(*), COALESCE(SUM(CASE WHEN payment_method = 'cod' THEN total_amount ELSE 0 END), 0)
    INTO v_total_orders, v_total_cod FROM orders
    WHERE id = ANY(p_order_ids) AND fulfillment_type = 'outside_valley';
    
    IF v_total_orders = 0 THEN RETURN '{"success":false,"error":"No valid orders"}'::JSON; END IF;
    
    INSERT INTO courier_manifests (courier_id, status, total_orders, total_cod_amount, pickup_agent_name, pickup_agent_phone, notes, created_by)
    VALUES (p_courier_id, 'pending', v_total_orders, v_total_cod, p_pickup_agent_name, p_pickup_agent_phone, p_notes, p_created_by)
    RETURNING id, readable_id INTO v_manifest_id, v_manifest_readable_id;
    
    UPDATE orders SET courier_id = p_courier_id, courier_manifest_id = v_manifest_id, courier_status = 'pending_pickup',
           status = 'shipped', handed_over_at = NOW(), updated_at = NOW()
    WHERE id = ANY(p_order_ids);
    
    RETURN json_build_object('success', TRUE, 'manifest_id', v_manifest_id, 'readable_id', v_manifest_readable_id,
                             'courier_name', v_courier.name, 'total_orders', v_total_orders, 'total_cod', v_total_cod);
END;
$$;

-- Function 3: Mark handed over
CREATE OR REPLACE FUNCTION mark_manifest_handed_over(p_manifest_id UUID, p_handed_over_by UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE courier_manifests SET status = 'handed_over', handed_over_at = NOW(), handed_over_by = p_handed_over_by WHERE id = p_manifest_id;
    UPDATE orders SET courier_status = 'picked_up' WHERE courier_manifest_id = p_manifest_id;
    RETURN '{"success":true}'::JSON;
END;
$$;

-- Function 4: Get manifest details
CREATE OR REPLACE FUNCTION get_courier_manifest_details(p_manifest_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_manifest RECORD; v_orders JSON;
BEGIN
    SELECT cm.*, c.name as courier_name, c.code as courier_code INTO v_manifest
    FROM courier_manifests cm JOIN couriers c ON c.id = cm.courier_id WHERE cm.id = p_manifest_id;
    IF NOT FOUND THEN RETURN '{"success":false}'::JSON; END IF;
    SELECT json_agg(row_to_json(t)) INTO v_orders FROM (
        SELECT id, readable_id, shipping_name, shipping_phone, shipping_city, total_amount, status, courier_status
        FROM orders WHERE courier_manifest_id = p_manifest_id
    ) t;
    RETURN json_build_object('success', TRUE, 'manifest', row_to_json(v_manifest), 'orders', COALESCE(v_orders, '[]'::json));
END;
$$;

-- Function 5: Update status
CREATE OR REPLACE FUNCTION update_courier_order_status(p_order_id UUID, p_courier_status TEXT, p_tracking_number TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE orders SET courier_status = p_courier_status, tracking_number = COALESCE(p_tracking_number, tracking_number),
           status = CASE p_courier_status WHEN 'delivered' THEN 'delivered' WHEN 'rto_delivered' THEN 'returned' ELSE status END
    WHERE id = p_order_id;
    RETURN json_build_object('success', TRUE, 'order_id', p_order_id);
END;
$$;

-- Permissions
ALTER TABLE couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_manifests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_couriers ON couriers;
DROP POLICY IF EXISTS auth_manifests ON courier_manifests;
CREATE POLICY auth_couriers ON couriers FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_manifests ON courier_manifests FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION get_orders_for_courier_handover TO authenticated;
GRANT EXECUTE ON FUNCTION create_courier_handover_manifest TO authenticated;
GRANT EXECUTE ON FUNCTION mark_manifest_handed_over TO authenticated;
GRANT EXECUTE ON FUNCTION get_courier_manifest_details TO authenticated;
GRANT EXECUTE ON FUNCTION update_courier_order_status TO authenticated;

SELECT 'All functions created!' as status;
