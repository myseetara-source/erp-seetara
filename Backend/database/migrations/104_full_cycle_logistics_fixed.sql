-- Migration: 104_full_cycle_logistics_fixed
-- Priority: P0 - FULL-CYCLE LOGISTICS (FORWARD & REVERSE)
-- 
-- FIX: Run column additions FIRST before creating functions that reference them

-- ============================================================================
-- STEP 1: Create COURIERS table FIRST (no dependencies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS couriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL DEFAULT 'domestic',
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    pickup_address TEXT,
    city TEXT,
    api_url TEXT,
    api_key TEXT,
    tracking_url_template TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    supports_cod BOOLEAN DEFAULT TRUE,
    avg_delivery_days INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common Nepali couriers (ignore if exists)
INSERT INTO couriers (name, code, type, contact_name, supports_cod, tracking_url_template) 
VALUES 
    ('NCM Express', 'NCM', 'domestic', 'NCM Support', TRUE, 'https://ncm.com.np/track/{awb}'),
    ('Sundarban Courier', 'SUN', 'domestic', 'Sundarban Support', TRUE, NULL),
    ('FastTrack Courier', 'FTC', 'domestic', 'FastTrack Support', TRUE, NULL),
    ('Nepal Post', 'NPO', 'domestic', 'Nepal Post', FALSE, NULL),
    ('DHL Nepal', 'DHL', 'international', 'DHL Support', FALSE, 'https://www.dhl.com/track/{awb}')
ON CONFLICT (code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_couriers_code ON couriers(code);
CREATE INDEX IF NOT EXISTS idx_couriers_active ON couriers(is_active);

DO $$ BEGIN RAISE NOTICE '[OK] Step 1: couriers table created'; END $$;

-- ============================================================================
-- STEP 2: Create COURIER_MANIFESTS table (depends on couriers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS courier_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    readable_id TEXT UNIQUE,
    courier_id UUID REFERENCES couriers(id),
    status TEXT NOT NULL DEFAULT 'pending',
    total_orders INTEGER DEFAULT 0,
    total_cod_amount DECIMAL(12,2) DEFAULT 0,
    handed_over_at TIMESTAMPTZ,
    handed_over_by UUID,
    pickup_agent_name TEXT,
    pickup_agent_phone TEXT,
    settled_at TIMESTAMPTZ,
    settled_by UUID,
    cod_received DECIMAL(12,2) DEFAULT 0,
    cod_variance DECIMAL(12,2) DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    returned_count INTEGER DEFAULT 0,
    in_transit_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_manifests_courier ON courier_manifests(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_manifests_status ON courier_manifests(status);
CREATE INDEX IF NOT EXISTS idx_courier_manifests_created ON courier_manifests(created_at DESC);

DO $$ BEGIN RAISE NOTICE '[OK] Step 2: courier_manifests table created'; END $$;

-- ============================================================================
-- STEP 3: Add columns to ORDERS table (CRITICAL - must run before functions)
-- ============================================================================

-- courier_id
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_id UUID REFERENCES couriers(id);

-- courier_manifest_id
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_manifest_id UUID REFERENCES courier_manifests(id);

-- tracking_number (AWB)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- handed_over_at
ALTER TABLE orders ADD COLUMN IF NOT EXISTS handed_over_at TIMESTAMPTZ;

-- expected_delivery_date
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expected_delivery_date DATE;

-- courier_status
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_status TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier_manifest ON orders(courier_manifest_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number);

DO $$ BEGIN RAISE NOTICE '[OK] Step 3: orders columns added'; END $$;

-- ============================================================================
-- STEP 4: Create manifest ID generator (after tables exist)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_courier_manifest_id()
RETURNS TRIGGER AS $$
DECLARE
    v_date_prefix TEXT;
    v_seq INTEGER;
    v_courier_code TEXT;
BEGIN
    SELECT code INTO v_courier_code FROM couriers WHERE id = NEW.courier_id;
    v_date_prefix := TO_CHAR(NOW(), 'YYMMDD');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(readable_id FROM '\d+$') AS INTEGER)
    ), 0) + 1 INTO v_seq
    FROM courier_manifests
    WHERE readable_id LIKE 'CM-' || COALESCE(v_courier_code, 'UNK') || '-' || v_date_prefix || '-%';
    
    NEW.readable_id := 'CM-' || COALESCE(v_courier_code, 'UNK') || '-' || v_date_prefix || '-' || LPAD(v_seq::TEXT, 3, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_courier_manifest_id ON courier_manifests;
CREATE TRIGGER trg_generate_courier_manifest_id
    BEFORE INSERT ON courier_manifests
    FOR EACH ROW
    WHEN (NEW.readable_id IS NULL)
    EXECUTE FUNCTION generate_courier_manifest_id();

DO $$ BEGIN RAISE NOTICE '[OK] Step 4: manifest ID generator created'; END $$;

-- ============================================================================
-- STEP 5: Create RPC functions (AFTER columns exist)
-- ============================================================================

-- Get orders ready for handover
CREATE OR REPLACE FUNCTION get_orders_for_courier_handover(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    order_id UUID,
    readable_id TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    shipping_city TEXT,
    shipping_address TEXT,
    total_amount DECIMAL,
    payment_method TEXT,
    is_cod BOOLEAN,
    item_count BIGINT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id as order_id,
        o.readable_id,
        o.shipping_name as customer_name,
        o.shipping_phone as customer_phone,
        o.shipping_city,
        o.shipping_address,
        o.total_amount,
        o.payment_method,
        (o.payment_method = 'cod') as is_cod,
        COALESCE((SELECT COUNT(*) FROM order_items WHERE order_id = o.id), 0) as item_count,
        o.created_at
    FROM orders o
    WHERE 
        o.fulfillment_type = 'outside_valley'
        AND o.status IN ('packed', 'ready_to_ship', 'processing')
        AND o.courier_manifest_id IS NULL
    ORDER BY o.created_at ASC
    LIMIT p_limit;
END;
$$;

DO $$ BEGIN RAISE NOTICE '[OK] Step 5a: get_orders_for_courier_handover created'; END $$;

-- Create handover manifest
CREATE OR REPLACE FUNCTION create_courier_handover_manifest(
    p_courier_id UUID,
    p_order_ids UUID[],
    p_created_by UUID,
    p_pickup_agent_name TEXT DEFAULT NULL,
    p_pickup_agent_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_manifest_id UUID;
    v_manifest_readable_id TEXT;
    v_total_orders INTEGER;
    v_total_cod DECIMAL(12,2);
    v_courier RECORD;
BEGIN
    -- Validate courier
    SELECT * INTO v_courier FROM couriers WHERE id = p_courier_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Invalid or inactive courier');
    END IF;
    
    -- Count valid orders and COD
    SELECT 
        COUNT(*),
        COALESCE(SUM(CASE WHEN payment_method = 'cod' THEN total_amount ELSE 0 END), 0)
    INTO v_total_orders, v_total_cod
    FROM orders
    WHERE id = ANY(p_order_ids)
    AND fulfillment_type = 'outside_valley'
    AND status IN ('packed', 'ready_to_ship', 'processing');
    
    IF v_total_orders = 0 THEN
        RETURN json_build_object('success', FALSE, 'error', 'No valid orders found');
    END IF;
    
    -- Create manifest
    INSERT INTO courier_manifests (
        courier_id, status, total_orders, total_cod_amount,
        pickup_agent_name, pickup_agent_phone, notes, created_by
    ) VALUES (
        p_courier_id, 'pending', v_total_orders, v_total_cod,
        p_pickup_agent_name, p_pickup_agent_phone, p_notes, p_created_by
    )
    RETURNING id, readable_id INTO v_manifest_id, v_manifest_readable_id;
    
    -- Update orders
    UPDATE orders
    SET 
        courier_id = p_courier_id,
        courier_manifest_id = v_manifest_id,
        courier_status = 'pending_pickup',
        status = 'shipped',
        handed_over_at = NOW(),
        expected_delivery_date = CURRENT_DATE + v_courier.avg_delivery_days,
        updated_at = NOW()
    WHERE id = ANY(p_order_ids)
    AND fulfillment_type = 'outside_valley';
    
    RETURN json_build_object(
        'success', TRUE,
        'manifest_id', v_manifest_id,
        'readable_id', v_manifest_readable_id,
        'courier_name', v_courier.name,
        'total_orders', v_total_orders,
        'total_cod', v_total_cod
    );
END;
$$;

DO $$ BEGIN RAISE NOTICE '[OK] Step 5b: create_courier_handover_manifest created'; END $$;

-- Mark manifest as handed over
CREATE OR REPLACE FUNCTION mark_manifest_handed_over(p_manifest_id UUID, p_handed_over_by UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE courier_manifests
    SET status = 'handed_over', handed_over_at = NOW(), handed_over_by = p_handed_over_by, updated_at = NOW()
    WHERE id = p_manifest_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Manifest not found or already handed over');
    END IF;
    
    UPDATE orders SET courier_status = 'picked_up', updated_at = NOW()
    WHERE courier_manifest_id = p_manifest_id;
    
    RETURN json_build_object('success', TRUE);
END;
$$;

-- Get manifest details
CREATE OR REPLACE FUNCTION get_courier_manifest_details(p_manifest_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_manifest RECORD;
    v_orders JSON;
BEGIN
    SELECT cm.*, c.name as courier_name, c.code as courier_code, c.tracking_url_template
    INTO v_manifest
    FROM courier_manifests cm
    JOIN couriers c ON c.id = cm.courier_id
    WHERE cm.id = p_manifest_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Manifest not found');
    END IF;
    
    SELECT json_agg(row_to_json(t)) INTO v_orders
    FROM (
        SELECT id, readable_id, shipping_name, shipping_phone, shipping_city,
               shipping_address, total_amount, payment_method, status, courier_status, tracking_number
        FROM orders WHERE courier_manifest_id = p_manifest_id ORDER BY created_at
    ) t;
    
    RETURN json_build_object('success', TRUE, 'manifest', row_to_json(v_manifest), 'orders', COALESCE(v_orders, '[]'::json));
END;
$$;

-- Update courier order status
CREATE OR REPLACE FUNCTION update_courier_order_status(
    p_order_id UUID, p_courier_status TEXT, p_tracking_number TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_order RECORD;
    v_new_status TEXT;
BEGIN
    IF p_courier_status NOT IN ('pending_pickup', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'rto_initiated', 'rto_in_transit', 'rto_delivered') THEN
        RETURN json_build_object('success', FALSE, 'error', 'Invalid courier status');
    END IF;
    
    v_new_status := CASE p_courier_status WHEN 'delivered' THEN 'delivered' WHEN 'rto_delivered' THEN 'returned' ELSE NULL END;
    
    UPDATE orders
    SET courier_status = p_courier_status, tracking_number = COALESCE(p_tracking_number, tracking_number),
        status = COALESCE(v_new_status, status), updated_at = NOW()
    WHERE id = p_order_id RETURNING * INTO v_order;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Order not found');
    END IF;
    
    -- Update manifest counts
    IF v_order.courier_manifest_id IS NOT NULL THEN
        UPDATE courier_manifests SET
            delivered_count = (SELECT COUNT(*) FROM orders WHERE courier_manifest_id = v_order.courier_manifest_id AND courier_status = 'delivered'),
            returned_count = (SELECT COUNT(*) FROM orders WHERE courier_manifest_id = v_order.courier_manifest_id AND courier_status = 'rto_delivered'),
            in_transit_count = (SELECT COUNT(*) FROM orders WHERE courier_manifest_id = v_order.courier_manifest_id AND courier_status IN ('in_transit', 'out_for_delivery')),
            updated_at = NOW()
        WHERE id = v_order.courier_manifest_id;
    END IF;
    
    RETURN json_build_object('success', TRUE, 'order_id', p_order_id, 'courier_status', p_courier_status);
END;
$$;

DO $$ BEGIN RAISE NOTICE '[OK] Step 5: All RPC functions created'; END $$;

-- ============================================================================
-- STEP 6: Grant permissions
-- ============================================================================

ALTER TABLE couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_manifests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_read_couriers ON couriers;
DROP POLICY IF EXISTS authenticated_all_courier_manifests ON courier_manifests;

CREATE POLICY authenticated_read_couriers ON couriers FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_all_courier_manifests ON courier_manifests FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION create_courier_handover_manifest TO authenticated;
GRANT EXECUTE ON FUNCTION mark_manifest_handed_over TO authenticated;
GRANT EXECUTE ON FUNCTION get_orders_for_courier_handover TO authenticated;
GRANT EXECUTE ON FUNCTION get_courier_manifest_details TO authenticated;
GRANT EXECUTE ON FUNCTION update_courier_order_status TO authenticated;

DO $$ BEGIN RAISE NOTICE '[OK] Step 6: Permissions granted'; END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_courier_count INT;
    v_col_count INT;
BEGIN
    SELECT COUNT(*) INTO v_courier_count FROM couriers;
    
    SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns 
    WHERE table_name = 'orders' 
    AND column_name IN ('courier_id', 'courier_manifest_id', 'tracking_number');
    
    RAISE NOTICE '[OK] Migration 104 FIXED complete: % couriers, % order columns', v_courier_count, v_col_count;
END $$;
