-- Migration: 104_full_cycle_logistics
-- Priority: P0 - FULL-CYCLE LOGISTICS (FORWARD & REVERSE)
-- 
-- ARCHITECTURE:
-- Two distinct flows:
-- 1. Local Fleet (Riders) - Inside Valley
-- 2. Courier Logistics (3rd Party) - Outside Valley
--
-- Both flows handle:
-- - Handover (Sending out)
-- - Settlement (Returns coming in)

-- ============================================================================
-- STEP 1: Create COURIERS table (3rd party courier partners)
-- ============================================================================

CREATE TABLE IF NOT EXISTS couriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Info
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL, -- Short code like 'NCM', 'FDX'
    type TEXT NOT NULL DEFAULT 'domestic', -- 'domestic', 'international'
    
    -- Contact
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    
    -- Address
    pickup_address TEXT,
    city TEXT,
    
    -- API Integration (for future automation)
    api_url TEXT,
    api_key TEXT,
    tracking_url_template TEXT, -- e.g., 'https://ncm.com/track/{awb}'
    
    -- Settings
    is_active BOOLEAN DEFAULT TRUE,
    supports_cod BOOLEAN DEFAULT TRUE,
    avg_delivery_days INTEGER DEFAULT 3,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common Nepali couriers
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

-- ============================================================================
-- STEP 2: Create COURIER_MANIFESTS table (Handover batches)
-- ============================================================================

CREATE TABLE IF NOT EXISTS courier_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Readable ID
    readable_id TEXT UNIQUE NOT NULL,
    
    -- Courier Reference
    courier_id UUID NOT NULL REFERENCES couriers(id),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending', 
    -- Values: 'pending', 'handed_over', 'in_transit', 'partially_delivered', 'completed', 'cancelled'
    
    -- Counts
    total_orders INTEGER DEFAULT 0,
    total_cod_amount DECIMAL(12,2) DEFAULT 0,
    
    -- Handover Details
    handed_over_at TIMESTAMPTZ,
    handed_over_by UUID,
    pickup_agent_name TEXT,
    pickup_agent_phone TEXT,
    
    -- Settlement Details
    settled_at TIMESTAMPTZ,
    settled_by UUID,
    cod_received DECIMAL(12,2) DEFAULT 0,
    cod_variance DECIMAL(12,2) DEFAULT 0,
    
    -- Delivery Stats (updated as orders complete)
    delivered_count INTEGER DEFAULT 0,
    returned_count INTEGER DEFAULT 0,
    in_transit_count INTEGER DEFAULT 0,
    
    -- Notes
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_manifests_courier ON courier_manifests(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_manifests_status ON courier_manifests(status);
CREATE INDEX IF NOT EXISTS idx_courier_manifests_created ON courier_manifests(created_at DESC);

-- ============================================================================
-- STEP 3: Update ORDERS table with courier tracking fields
-- ============================================================================

DO $$
BEGIN
    -- Courier ID (which courier is handling)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'courier_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN courier_id UUID REFERENCES couriers(id);
        RAISE NOTICE '[OK] Added courier_id column to orders';
    END IF;
    
    -- Courier Manifest ID (which batch/handover)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'courier_manifest_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN courier_manifest_id UUID REFERENCES courier_manifests(id);
        RAISE NOTICE '[OK] Added courier_manifest_id column to orders';
    END IF;
    
    -- AWB/Tracking Number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'tracking_number'
    ) THEN
        ALTER TABLE orders ADD COLUMN tracking_number TEXT;
        RAISE NOTICE '[OK] Added tracking_number column to orders';
    END IF;
    
    -- Courier handover timestamp
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'handed_over_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN handed_over_at TIMESTAMPTZ;
        RAISE NOTICE '[OK] Added handed_over_at column to orders';
    END IF;
    
    -- Expected delivery date from courier
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'expected_delivery_date'
    ) THEN
        ALTER TABLE orders ADD COLUMN expected_delivery_date DATE;
        RAISE NOTICE '[OK] Added expected_delivery_date column to orders';
    END IF;
    
    -- Courier delivery status (separate from main status)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'courier_status'
    ) THEN
        ALTER TABLE orders ADD COLUMN courier_status TEXT;
        -- Values: 'pending_pickup', 'picked_up', 'in_transit', 'out_for_delivery', 
        --         'delivered', 'rto_initiated', 'rto_in_transit', 'rto_delivered'
        RAISE NOTICE '[OK] Added courier_status column to orders';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier_manifest ON orders(courier_manifest_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number);

-- ============================================================================
-- STEP 4: Create courier manifest readable_id generator
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_courier_manifest_id()
RETURNS TRIGGER AS $$
DECLARE
    v_date_prefix TEXT;
    v_seq INTEGER;
    v_courier_code TEXT;
BEGIN
    -- Get courier code
    SELECT code INTO v_courier_code FROM couriers WHERE id = NEW.courier_id;
    
    -- Date prefix: YYMMDD
    v_date_prefix := TO_CHAR(NOW(), 'YYMMDD');
    
    -- Get sequence for today
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(readable_id FROM '\d+$') AS INTEGER)
    ), 0) + 1 INTO v_seq
    FROM courier_manifests
    WHERE readable_id LIKE 'CM-' || v_courier_code || '-' || v_date_prefix || '-%';
    
    -- Generate ID: CM-NCM-260129-001
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

-- ============================================================================
-- STEP 5: RPC - Create Courier Handover Manifest
-- ============================================================================

CREATE OR REPLACE FUNCTION create_courier_handover_manifest(
    p_courier_id UUID,
    p_order_ids UUID[],
    p_created_by UUID,
    p_pickup_agent_name TEXT DEFAULT NULL,
    p_pickup_agent_phone TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_manifest_id UUID;
    v_manifest_readable_id TEXT;
    v_total_orders INTEGER;
    v_total_cod DECIMAL(12,2);
    v_courier RECORD;
    v_order RECORD;
BEGIN
    -- Validate courier
    SELECT * INTO v_courier FROM couriers WHERE id = p_courier_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Invalid or inactive courier');
    END IF;
    
    -- Validate orders
    v_total_orders := array_length(p_order_ids, 1);
    IF v_total_orders IS NULL OR v_total_orders = 0 THEN
        RETURN json_build_object('success', FALSE, 'error', 'No orders provided');
    END IF;
    
    -- Calculate total COD
    SELECT 
        COUNT(*),
        COALESCE(SUM(CASE WHEN payment_method = 'cod' THEN total_amount ELSE 0 END), 0)
    INTO v_total_orders, v_total_cod
    FROM orders
    WHERE id = ANY(p_order_ids)
    AND fulfillment_type = 'outside_valley'
    AND status IN ('packed', 'ready_to_ship', 'processing');
    
    IF v_total_orders = 0 THEN
        RETURN json_build_object('success', FALSE, 'error', 'No valid orders found for handover');
    END IF;
    
    -- Create manifest
    INSERT INTO courier_manifests (
        courier_id,
        status,
        total_orders,
        total_cod_amount,
        pickup_agent_name,
        pickup_agent_phone,
        notes,
        created_by
    ) VALUES (
        p_courier_id,
        'pending',
        v_total_orders,
        v_total_cod,
        p_pickup_agent_name,
        p_pickup_agent_phone,
        p_notes,
        p_created_by
    )
    RETURNING id, readable_id INTO v_manifest_id, v_manifest_readable_id;
    
    -- Update all orders
    UPDATE orders
    SET 
        courier_id = p_courier_id,
        courier_manifest_id = v_manifest_id,
        courier_status = 'pending_pickup',
        status = 'shipped', -- Or 'handed_over_to_courier'
        handed_over_at = NOW(),
        expected_delivery_date = CURRENT_DATE + v_courier.avg_delivery_days,
        updated_at = NOW()
    WHERE id = ANY(p_order_ids)
    AND fulfillment_type = 'outside_valley';
    
    -- Log activity for each order
    FOR v_order IN 
        SELECT id, readable_id FROM orders WHERE courier_manifest_id = v_manifest_id
    LOOP
        INSERT INTO order_activities (order_id, activity_type, description, performed_by)
        VALUES (
            v_order.id,
            'status_change',
            format('Handed over to %s. Manifest: %s', v_courier.name, v_manifest_readable_id),
            p_created_by
        );
    END LOOP;
    
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

-- ============================================================================
-- STEP 6: RPC - Mark Manifest as Handed Over
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_manifest_handed_over(
    p_manifest_id UUID,
    p_handed_over_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE courier_manifests
    SET 
        status = 'handed_over',
        handed_over_at = NOW(),
        handed_over_by = p_handed_over_by,
        updated_at = NOW()
    WHERE id = p_manifest_id
    AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Manifest not found or already handed over');
    END IF;
    
    -- Update courier status on orders
    UPDATE orders
    SET courier_status = 'picked_up', updated_at = NOW()
    WHERE courier_manifest_id = p_manifest_id;
    
    RETURN json_build_object('success', TRUE, 'message', 'Manifest marked as handed over');
END;
$$;

-- ============================================================================
-- STEP 7: RPC - Get Orders Ready for Courier Handover
-- ============================================================================

CREATE OR REPLACE FUNCTION get_orders_for_courier_handover(
    p_limit INTEGER DEFAULT 100
)
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
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

-- ============================================================================
-- STEP 8: RPC - Get Manifest Details with Orders
-- ============================================================================

CREATE OR REPLACE FUNCTION get_courier_manifest_details(
    p_manifest_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_manifest RECORD;
    v_orders JSON;
BEGIN
    -- Get manifest
    SELECT 
        cm.*,
        c.name as courier_name,
        c.code as courier_code,
        c.tracking_url_template
    INTO v_manifest
    FROM courier_manifests cm
    JOIN couriers c ON c.id = cm.courier_id
    WHERE cm.id = p_manifest_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Manifest not found');
    END IF;
    
    -- Get orders
    SELECT json_agg(row_to_json(t)) INTO v_orders
    FROM (
        SELECT 
            o.id,
            o.readable_id,
            o.shipping_name,
            o.shipping_phone,
            o.shipping_city,
            o.shipping_address,
            o.total_amount,
            o.payment_method,
            o.status,
            o.courier_status,
            o.tracking_number
        FROM orders o
        WHERE o.courier_manifest_id = p_manifest_id
        ORDER BY o.created_at
    ) t;
    
    RETURN json_build_object(
        'success', TRUE,
        'manifest', row_to_json(v_manifest),
        'orders', COALESCE(v_orders, '[]'::json)
    );
END;
$$;

-- ============================================================================
-- STEP 9: RPC - Update Courier Delivery Status
-- ============================================================================

CREATE OR REPLACE FUNCTION update_courier_order_status(
    p_order_id UUID,
    p_courier_status TEXT,
    p_tracking_number TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_new_status TEXT;
BEGIN
    -- Validate status
    IF p_courier_status NOT IN (
        'pending_pickup', 'picked_up', 'in_transit', 'out_for_delivery',
        'delivered', 'rto_initiated', 'rto_in_transit', 'rto_delivered'
    ) THEN
        RETURN json_build_object('success', FALSE, 'error', 'Invalid courier status');
    END IF;
    
    -- Map courier status to order status
    v_new_status := CASE p_courier_status
        WHEN 'delivered' THEN 'delivered'
        WHEN 'rto_delivered' THEN 'returned'
        ELSE NULL -- Don't change main status
    END;
    
    -- Update order
    UPDATE orders
    SET 
        courier_status = p_courier_status,
        tracking_number = COALESCE(p_tracking_number, tracking_number),
        status = COALESCE(v_new_status, status),
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING * INTO v_order;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Order not found');
    END IF;
    
    -- Update manifest counts
    IF v_order.courier_manifest_id IS NOT NULL THEN
        UPDATE courier_manifests
        SET 
            delivered_count = (SELECT COUNT(*) FROM orders WHERE courier_manifest_id = v_order.courier_manifest_id AND courier_status = 'delivered'),
            returned_count = (SELECT COUNT(*) FROM orders WHERE courier_manifest_id = v_order.courier_manifest_id AND courier_status = 'rto_delivered'),
            in_transit_count = (SELECT COUNT(*) FROM orders WHERE courier_manifest_id = v_order.courier_manifest_id AND courier_status IN ('in_transit', 'out_for_delivery')),
            updated_at = NOW()
        WHERE id = v_order.courier_manifest_id;
    END IF;
    
    RETURN json_build_object(
        'success', TRUE,
        'order_id', p_order_id,
        'courier_status', p_courier_status,
        'order_status', v_order.status
    );
END;
$$;

-- ============================================================================
-- STEP 10: Grant Permissions
-- ============================================================================

-- Tables
ALTER TABLE couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_manifests ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_read_couriers ON couriers FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_all_courier_manifests ON courier_manifests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Functions
GRANT EXECUTE ON FUNCTION create_courier_handover_manifest TO authenticated;
GRANT EXECUTE ON FUNCTION mark_manifest_handed_over TO authenticated;
GRANT EXECUTE ON FUNCTION get_orders_for_courier_handover TO authenticated;
GRANT EXECUTE ON FUNCTION get_courier_manifest_details TO authenticated;
GRANT EXECUTE ON FUNCTION update_courier_order_status TO authenticated;

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
    WHERE table_name = 'orders' AND column_name IN ('courier_id', 'courier_manifest_id', 'tracking_number');
    
    RAISE NOTICE '[OK] Migration 104 complete: % couriers seeded, % new order columns', v_courier_count, v_col_count;
END $$;
