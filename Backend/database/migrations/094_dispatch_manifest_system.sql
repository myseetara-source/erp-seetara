-- ============================================================================
-- Migration 094: Advanced Dispatch Manifest System
-- Description: Scalable logistics command center for 1000+ daily orders
-- Author: ERP System
-- Date: 2026-01-29
-- ============================================================================

-- ============================================================================
-- PART 1: ENUM TYPES
-- ============================================================================

-- Manifest status enum
DO $$ BEGIN
    CREATE TYPE manifest_status AS ENUM (
        'open',           -- Manifest created, orders being added
        'out_for_delivery', -- Rider has departed with the manifest
        'partially_settled', -- Some orders settled, some pending
        'settled',        -- All orders delivered/returned, cash reconciled
        'cancelled'       -- Manifest cancelled
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Delivery outcome enum (per order in manifest)
DO $$ BEGIN
    CREATE TYPE delivery_outcome AS ENUM (
        'pending',        -- Not yet attempted
        'delivered',      -- Successfully delivered
        'partial_delivery', -- Partial items delivered
        'customer_refused', -- Customer refused delivery
        'customer_unavailable', -- Customer not available
        'wrong_address',  -- Address incorrect
        'rescheduled',    -- Customer asked to reschedule
        'returned',       -- Returned to warehouse
        'damaged',        -- Product damaged during delivery
        'lost'            -- Package lost
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 2: DISPATCH MANIFESTS TABLE (The "Run" or "Trip")
-- ============================================================================

CREATE TABLE IF NOT EXISTS dispatch_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Human-readable ID: RUN-YYMMDD-NNN (e.g., RUN-260129-001)
    readable_id VARCHAR(20) NOT NULL UNIQUE,
    
    -- Assignment
    rider_id UUID REFERENCES users(id) ON DELETE SET NULL,
    vehicle_type VARCHAR(20) DEFAULT 'bike', -- bike, scooter, van
    
    -- Location grouping (for route optimization)
    zone_name VARCHAR(100), -- e.g., "Lalitpur", "Baneshwor"
    zone_ids UUID[], -- Array of delivery_zone IDs
    
    -- Status tracking
    status manifest_status NOT NULL DEFAULT 'open',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_at TIMESTAMPTZ, -- When rider left warehouse
    completed_at TIMESTAMPTZ, -- When fully settled
    settled_at TIMESTAMPTZ,   -- When cash reconciled
    settled_by UUID REFERENCES users(id),
    
    -- Order counts (denormalized for quick display)
    total_orders INT NOT NULL DEFAULT 0,
    delivered_count INT NOT NULL DEFAULT 0,
    returned_count INT NOT NULL DEFAULT 0,
    rescheduled_count INT NOT NULL DEFAULT 0,
    
    -- Financial tracking (COD Management)
    total_cod_expected DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_cod_collected DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_received DECIMAL(12,2), -- Actual cash handed over by rider
    settlement_variance DECIMAL(12,2), -- Difference (can be +/-)
    
    -- Notes
    notes TEXT,
    settlement_notes TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PART 3: ORDER MANIFEST JUNCTION (Per-Order Delivery Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_manifest_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    manifest_id UUID NOT NULL REFERENCES dispatch_manifests(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Delivery sequence (route order)
    sequence_number INT,
    
    -- Per-order outcome
    outcome delivery_outcome NOT NULL DEFAULT 'pending',
    outcome_notes TEXT,
    outcome_at TIMESTAMPTZ,
    
    -- Financial (per order)
    cod_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    cod_collected DECIMAL(12,2) DEFAULT 0,
    
    -- Attempt tracking
    attempt_number INT NOT NULL DEFAULT 1,
    
    -- Photo proof
    delivery_photo_url TEXT,
    signature_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Prevent duplicate order in same manifest
    UNIQUE(manifest_id, order_id)
);

-- ============================================================================
-- PART 4: UPDATE ORDERS TABLE
-- ============================================================================

-- Add manifest reference to orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS current_manifest_id UUID REFERENCES dispatch_manifests(id) ON DELETE SET NULL;

-- Add delivery attempt counter
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_attempt_count INT NOT NULL DEFAULT 0;

-- Add last delivery outcome
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS last_delivery_outcome delivery_outcome;

-- Add reschedule date
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS reschedule_date DATE;

-- ============================================================================
-- PART 5: COURIER HANDOVER TABLE (Outside Valley)
-- ============================================================================

CREATE TABLE IF NOT EXISTS courier_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Human-readable ID: CH-YYMMDD-NNN
    readable_id VARCHAR(20) NOT NULL UNIQUE,
    
    -- Courier info
    courier_partner VARCHAR(50) NOT NULL, -- 'pathao', 'ncm', 'custom'
    courier_contact_name VARCHAR(100),
    courier_contact_phone VARCHAR(20),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, handed_over, in_transit, delivered
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    handed_over_at TIMESTAMPTZ,
    
    -- Order counts
    total_orders INT NOT NULL DEFAULT 0,
    total_weight_kg DECIMAL(8,2),
    
    -- Financial
    total_cod_expected DECIMAL(12,2) NOT NULL DEFAULT 0,
    courier_charges DECIMAL(10,2),
    
    -- Documents
    manifest_pdf_url TEXT,
    receipt_photo_url TEXT,
    
    -- Notes
    notes TEXT,
    
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Courier handover items
CREATE TABLE IF NOT EXISTS courier_handover_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handover_id UUID NOT NULL REFERENCES courier_handovers(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Tracking
    awb_number VARCHAR(50),
    tracking_status VARCHAR(50),
    
    -- Outcome
    outcome VARCHAR(20) DEFAULT 'pending',
    outcome_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(handover_id, order_id)
);

-- ============================================================================
-- PART 6: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Manifest indexes
CREATE INDEX IF NOT EXISTS idx_manifests_status ON dispatch_manifests(status);
CREATE INDEX IF NOT EXISTS idx_manifests_rider ON dispatch_manifests(rider_id);
CREATE INDEX IF NOT EXISTS idx_manifests_created ON dispatch_manifests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manifests_readable ON dispatch_manifests(readable_id);

-- Order manifest items indexes
CREATE INDEX IF NOT EXISTS idx_manifest_items_manifest ON order_manifest_items(manifest_id);
CREATE INDEX IF NOT EXISTS idx_manifest_items_order ON order_manifest_items(order_id);
CREATE INDEX IF NOT EXISTS idx_manifest_items_outcome ON order_manifest_items(outcome);

-- Orders indexes for dispatch queries
CREATE INDEX IF NOT EXISTS idx_orders_manifest ON orders(current_manifest_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_attempt ON orders(delivery_attempt_count);
CREATE INDEX IF NOT EXISTS idx_orders_reschedule ON orders(reschedule_date) WHERE reschedule_date IS NOT NULL;

-- Courier handover indexes
CREATE INDEX IF NOT EXISTS idx_courier_handovers_status ON courier_handovers(status);
CREATE INDEX IF NOT EXISTS idx_courier_handover_items_handover ON courier_handover_items(handover_id);

-- ============================================================================
-- PART 7: GENERATE READABLE ID FUNCTIONS
-- ============================================================================

-- Generate manifest ID: RUN-YYMMDD-NNN
CREATE OR REPLACE FUNCTION generate_manifest_id()
RETURNS TRIGGER AS $$
DECLARE
    date_part TEXT;
    seq_num INT;
    new_id TEXT;
BEGIN
    -- Format: RUN-YYMMDD-NNN
    date_part := TO_CHAR(NOW(), 'YYMMDD');
    
    -- Get sequence for today
    SELECT COALESCE(MAX(
        NULLIF(REGEXP_REPLACE(readable_id, '^RUN-' || date_part || '-', ''), '')::INT
    ), 0) + 1
    INTO seq_num
    FROM dispatch_manifests
    WHERE readable_id LIKE 'RUN-' || date_part || '-%';
    
    new_id := 'RUN-' || date_part || '-' || LPAD(seq_num::TEXT, 3, '0');
    NEW.readable_id := new_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for manifest ID
DROP TRIGGER IF EXISTS trg_generate_manifest_id ON dispatch_manifests;
CREATE TRIGGER trg_generate_manifest_id
    BEFORE INSERT ON dispatch_manifests
    FOR EACH ROW
    WHEN (NEW.readable_id IS NULL)
    EXECUTE FUNCTION generate_manifest_id();

-- Generate courier handover ID: CH-YYMMDD-NNN
CREATE OR REPLACE FUNCTION generate_handover_id()
RETURNS TRIGGER AS $$
DECLARE
    date_part TEXT;
    seq_num INT;
    new_id TEXT;
BEGIN
    date_part := TO_CHAR(NOW(), 'YYMMDD');
    
    SELECT COALESCE(MAX(
        NULLIF(REGEXP_REPLACE(readable_id, '^CH-' || date_part || '-', ''), '')::INT
    ), 0) + 1
    INTO seq_num
    FROM courier_handovers
    WHERE readable_id LIKE 'CH-' || date_part || '-%';
    
    new_id := 'CH-' || date_part || '-' || LPAD(seq_num::TEXT, 3, '0');
    NEW.readable_id := new_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_handover_id ON courier_handovers;
CREATE TRIGGER trg_generate_handover_id
    BEFORE INSERT ON courier_handovers
    FOR EACH ROW
    WHEN (NEW.readable_id IS NULL)
    EXECUTE FUNCTION generate_handover_id();

-- ============================================================================
-- PART 8: RPC FUNCTIONS FOR MANIFEST OPERATIONS
-- ============================================================================

-- Create manifest and assign orders atomically
CREATE OR REPLACE FUNCTION create_dispatch_manifest(
    p_rider_id UUID,
    p_order_ids UUID[],
    p_zone_name TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_manifest_id UUID;
    v_manifest_readable_id TEXT;
    v_total_orders INT;
    v_total_cod DECIMAL(12,2);
    v_order_id UUID;
BEGIN
    -- Validate rider exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_rider_id AND role = 'rider') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid rider ID');
    END IF;
    
    -- Validate all orders are in 'packed' status
    IF EXISTS (
        SELECT 1 FROM orders 
        WHERE id = ANY(p_order_ids) 
        AND status != 'packed'
    ) THEN
        RETURN json_build_object('success', false, 'error', 'All orders must be in packed status');
    END IF;
    
    -- Calculate totals
    SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
    INTO v_total_orders, v_total_cod
    FROM orders
    WHERE id = ANY(p_order_ids)
    AND payment_status != 'paid'; -- Only COD orders contribute
    
    -- Create manifest
    INSERT INTO dispatch_manifests (
        rider_id, zone_name, total_orders, total_cod_expected, created_by
    ) VALUES (
        p_rider_id, p_zone_name, array_length(p_order_ids, 1), v_total_cod, p_created_by
    )
    RETURNING id, readable_id INTO v_manifest_id, v_manifest_readable_id;
    
    -- Insert order items
    FOREACH v_order_id IN ARRAY p_order_ids
    LOOP
        INSERT INTO order_manifest_items (manifest_id, order_id, cod_amount, sequence_number)
        SELECT 
            v_manifest_id,
            o.id,
            CASE WHEN o.payment_status = 'paid' THEN 0 ELSE o.total_amount END,
            ROW_NUMBER() OVER (ORDER BY o.customer_city, o.created_at)
        FROM orders o
        WHERE o.id = v_order_id;
    END LOOP;
    
    -- Update orders
    UPDATE orders
    SET 
        current_manifest_id = v_manifest_id,
        status = 'assigned',
        rider_id = p_rider_id,
        delivery_attempt_count = delivery_attempt_count + 1,
        updated_at = NOW()
    WHERE id = ANY(p_order_ids);
    
    RETURN json_build_object(
        'success', true,
        'manifest_id', v_manifest_id,
        'readable_id', v_manifest_readable_id,
        'total_orders', array_length(p_order_ids, 1),
        'total_cod_expected', v_total_cod
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark manifest as dispatched (rider left)
CREATE OR REPLACE FUNCTION dispatch_manifest(p_manifest_id UUID)
RETURNS JSON AS $$
BEGIN
    UPDATE dispatch_manifests
    SET 
        status = 'out_for_delivery',
        dispatched_at = NOW(),
        updated_at = NOW()
    WHERE id = p_manifest_id AND status = 'open';
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Manifest not found or not in open status');
    END IF;
    
    -- Update all orders in manifest
    UPDATE orders o
    SET 
        status = 'out_for_delivery',
        updated_at = NOW()
    FROM order_manifest_items omi
    WHERE omi.order_id = o.id AND omi.manifest_id = p_manifest_id;
    
    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record delivery outcome for single order
CREATE OR REPLACE FUNCTION record_delivery_outcome(
    p_manifest_id UUID,
    p_order_id UUID,
    p_outcome delivery_outcome,
    p_cod_collected DECIMAL DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_photo_url TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_order_status TEXT;
BEGIN
    -- Update manifest item
    UPDATE order_manifest_items
    SET 
        outcome = p_outcome,
        outcome_notes = p_notes,
        outcome_at = NOW(),
        cod_collected = COALESCE(p_cod_collected, 0),
        delivery_photo_url = p_photo_url,
        updated_at = NOW()
    WHERE manifest_id = p_manifest_id AND order_id = p_order_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Order not found in manifest');
    END IF;
    
    -- Determine order status based on outcome
    v_order_status := CASE p_outcome
        WHEN 'delivered' THEN 'delivered'
        WHEN 'partial_delivery' THEN 'delivered'
        WHEN 'customer_refused' THEN 'returns'
        WHEN 'customer_unavailable' THEN 'follow_up'
        WHEN 'wrong_address' THEN 'follow_up'
        WHEN 'rescheduled' THEN 'follow_up'
        WHEN 'returned' THEN 'returns'
        WHEN 'damaged' THEN 'returns'
        WHEN 'lost' THEN 'cancelled'
        ELSE 'out_for_delivery'
    END;
    
    -- Update order status
    UPDATE orders
    SET 
        status = v_order_status,
        last_delivery_outcome = p_outcome,
        payment_status = CASE 
            WHEN p_outcome = 'delivered' AND p_cod_collected > 0 THEN 'paid'
            ELSE payment_status
        END,
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- Update manifest counts
    UPDATE dispatch_manifests
    SET 
        delivered_count = (SELECT COUNT(*) FROM order_manifest_items WHERE manifest_id = p_manifest_id AND outcome = 'delivered'),
        returned_count = (SELECT COUNT(*) FROM order_manifest_items WHERE manifest_id = p_manifest_id AND outcome IN ('returned', 'customer_refused', 'damaged')),
        rescheduled_count = (SELECT COUNT(*) FROM order_manifest_items WHERE manifest_id = p_manifest_id AND outcome IN ('rescheduled', 'customer_unavailable', 'wrong_address')),
        total_cod_collected = (SELECT COALESCE(SUM(cod_collected), 0) FROM order_manifest_items WHERE manifest_id = p_manifest_id),
        updated_at = NOW()
    WHERE id = p_manifest_id;
    
    RETURN json_build_object('success', true, 'order_status', v_order_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Settle manifest (reconcile cash)
CREATE OR REPLACE FUNCTION settle_manifest(
    p_manifest_id UUID,
    p_cash_received DECIMAL,
    p_settled_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_expected DECIMAL;
    v_collected DECIMAL;
    v_variance DECIMAL;
BEGIN
    -- Get expected vs collected
    SELECT total_cod_expected, total_cod_collected
    INTO v_expected, v_collected
    FROM dispatch_manifests
    WHERE id = p_manifest_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Manifest not found');
    END IF;
    
    v_variance := p_cash_received - v_collected;
    
    -- Update manifest
    UPDATE dispatch_manifests
    SET 
        status = 'settled',
        cash_received = p_cash_received,
        settlement_variance = v_variance,
        settled_at = NOW(),
        settled_by = p_settled_by,
        settlement_notes = p_notes,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_manifest_id;
    
    -- Clear manifest reference from orders (they're now settled)
    UPDATE orders
    SET current_manifest_id = NULL
    WHERE current_manifest_id = p_manifest_id;
    
    RETURN json_build_object(
        'success', true,
        'expected', v_expected,
        'collected', v_collected,
        'received', p_cash_received,
        'variance', v_variance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get orders for sorting floor (packed, inside_valley, not in manifest)
CREATE OR REPLACE FUNCTION get_orders_for_dispatch(
    p_fulfillment_type TEXT DEFAULT 'inside_valley',
    p_city TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    readable_id TEXT,
    order_number TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_city TEXT,
    customer_address TEXT,
    total_amount DECIMAL,
    payment_status TEXT,
    item_count BIGINT,
    delivery_attempt_count INT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id,
        o.readable_id,
        o.order_number,
        o.customer_name,
        o.customer_phone,
        o.customer_city,
        o.customer_address,
        o.total_amount,
        o.payment_status::TEXT,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id)::BIGINT,
        o.delivery_attempt_count,
        o.created_at
    FROM orders o
    WHERE o.status = 'packed'
    AND o.fulfillment_type = p_fulfillment_type
    AND o.current_manifest_id IS NULL
    AND (p_city IS NULL OR o.customer_city ILIKE '%' || p_city || '%')
    ORDER BY o.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get city/zone summary for sorting floor
CREATE OR REPLACE FUNCTION get_dispatch_zone_summary(p_fulfillment_type TEXT DEFAULT 'inside_valley')
RETURNS TABLE (
    city TEXT,
    order_count BIGINT,
    total_cod DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(o.customer_city, 'Unknown')::TEXT as city,
        COUNT(*)::BIGINT as order_count,
        SUM(CASE WHEN o.payment_status != 'paid' THEN o.total_amount ELSE 0 END) as total_cod
    FROM orders o
    WHERE o.status = 'packed'
    AND o.fulfillment_type = p_fulfillment_type
    AND o.current_manifest_id IS NULL
    GROUP BY COALESCE(o.customer_city, 'Unknown')
    ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 9: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE dispatch_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_manifest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_handover_items ENABLE ROW LEVEL SECURITY;

-- Manifests: Full access for admin/manager/operator, read-only own for riders
CREATE POLICY manifests_admin_full ON dispatch_manifests
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager', 'operator'))
    );

CREATE POLICY manifests_rider_read ON dispatch_manifests
    FOR SELECT TO authenticated
    USING (rider_id = auth.uid());

-- Manifest items: Same as manifests
CREATE POLICY manifest_items_admin ON order_manifest_items
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager', 'operator'))
    );

CREATE POLICY manifest_items_rider ON order_manifest_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM dispatch_manifests WHERE id = manifest_id AND rider_id = auth.uid())
    );

-- Courier handovers: Admin/manager/operator only
CREATE POLICY courier_handovers_policy ON courier_handovers
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager', 'operator'))
    );

CREATE POLICY courier_items_policy ON courier_handover_items
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager', 'operator'))
    );

-- ============================================================================
-- PART 10: COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE dispatch_manifests IS 'Delivery runs/trips for Inside Valley riders';
COMMENT ON TABLE order_manifest_items IS 'Orders included in each manifest with delivery outcomes';
COMMENT ON TABLE courier_handovers IS 'Bulk handovers to courier partners for Outside Valley';
COMMENT ON FUNCTION create_dispatch_manifest IS 'Atomically create manifest and assign orders';
COMMENT ON FUNCTION settle_manifest IS 'Cash reconciliation for completed manifests';

-- ============================================================================
-- SUCCESS
-- ============================================================================
SELECT 'Migration 094: Dispatch Manifest System - SUCCESS' as status;
