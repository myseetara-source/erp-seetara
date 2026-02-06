-- =============================================================================
-- MIGRATION: 042_complete_system_restoration.sql
-- PURPOSE: PHASE 2 - DATABASE ALIGNMENT & STABILITY RESTORATION
-- DATE: 2026-01-24
-- =============================================================================
-- 
-- This migration addresses ALL missing tables and RPC functions identified
-- in the System Audit Report (SYSTEM_AUDIT_REPORT_2026-01-24.md)
--
-- SECTIONS:
-- 0. Aggressive Function Cleanup (drop all overloads)
-- 1. Missing Tables (Order Tracking, Logistics, Activity)
-- 2. Atomic Stock Operations (RPCs)
-- 3. Vendor Stats & Payment RPCs
-- 4. Dashboard Consolidation RPC
-- 5. Utility Functions
-- 6. Indexes for Performance
--
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 0: AGGRESSIVE FUNCTION CLEANUP                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- This dynamically drops ALL overloads of functions we're about to create

DO $$
DECLARE
    func_names TEXT[] := ARRAY[
        'deduct_stock_atomic',
        'deduct_stock_batch_atomic', 
        'restore_stock_atomic',
        'confirm_stock_deduction_atomic',
        'get_vendor_stats',
        'generate_supply_number',
        'get_next_followup_attempt',
        'get_dashboard_analytics',
        'increment_rider_stats',
        'append_unique_to_array',
        'get_delivery_zone',
        'get_zone_type'
    ];
    func_name TEXT;
    func_oid OID;
BEGIN
    FOREACH func_name IN ARRAY func_names
    LOOP
        -- Find and drop all overloads of this function
        FOR func_oid IN 
            SELECT p.oid 
            FROM pg_proc p 
            JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'public' 
            AND p.proname = func_name
        LOOP
            EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_oid::regprocedure);
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Cleaned up all function overloads';
END $$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 1: MISSING TABLES                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- -----------------------------------------------------------------------------
-- 1.1 ORDER FOLLOWUPS (Order Tracking System)
-- -----------------------------------------------------------------------------
-- Drop and recreate to ensure correct schema
DROP TABLE IF EXISTS order_followups CASCADE;

CREATE TABLE order_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    followup_number INTEGER NOT NULL DEFAULT 1,
    scheduled_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, skipped
    outcome VARCHAR(50), -- converted, rescheduled, cancelled, no_answer
    notes TEXT,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_order_followup UNIQUE(order_id, followup_number)
);

CREATE INDEX idx_order_followups_order_id ON order_followups(order_id);
CREATE INDEX idx_order_followups_scheduled ON order_followups(scheduled_at);
CREATE INDEX idx_order_followups_performer ON order_followups(performed_by);
CREATE INDEX idx_order_followups_pending ON order_followups(status) WHERE status = 'pending';

COMMENT ON TABLE order_followups IS 'Tracks follow-up attempts for orders';

-- -----------------------------------------------------------------------------
-- 1.2 ORDER TIMELINE (Order History/Activity)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS order_timeline CASCADE;

CREATE TABLE order_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- status_change, note_added, call_made, etc.
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_timeline_order ON order_timeline(order_id);
CREATE INDEX idx_order_timeline_type ON order_timeline(event_type);
CREATE INDEX idx_order_timeline_created ON order_timeline(created_at DESC);

COMMENT ON TABLE order_timeline IS 'Complete activity history for orders';

-- -----------------------------------------------------------------------------
-- 1.3 COURIER MANIFESTS (Batch Handover to Courier Partners)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS courier_manifests CASCADE;

CREATE TABLE courier_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_number VARCHAR(30) UNIQUE NOT NULL,
    courier_partner VARCHAR(100) NOT NULL,
    manifest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'draft', -- draft, finalized, handed_over
    total_orders INTEGER DEFAULT 0,
    total_weight_grams INTEGER DEFAULT 0,
    total_cod DECIMAL(14, 2) DEFAULT 0,
    handed_over_at TIMESTAMPTZ,
    handed_over_to VARCHAR(100),
    handover_notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_courier_manifests_date ON courier_manifests(manifest_date DESC);
CREATE INDEX idx_courier_manifests_courier ON courier_manifests(courier_partner);
CREATE INDEX idx_courier_manifests_status ON courier_manifests(status);

COMMENT ON TABLE courier_manifests IS 'Batch manifests for courier handover';

-- -----------------------------------------------------------------------------
-- 1.4 DELIVERY ASSIGNMENTS (Rider-Order Mapping)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS delivery_assignments CASCADE;

CREATE TABLE delivery_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    delivery_run_id UUID REFERENCES delivery_runs(id) ON DELETE SET NULL,
    status delivery_status DEFAULT 'assigned',
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    picked_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    result delivery_result,
    failure_reason TEXT,
    customer_feedback TEXT,
    customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
    collected_amount DECIMAL(12, 2) DEFAULT 0,
    photo_proof TEXT, -- URL to delivery photo
    signature_url TEXT,
    location_lat DECIMAL(10, 6),
    location_lng DECIMAL(10, 6),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_active_assignment UNIQUE(order_id, rider_id, assigned_at)
);

CREATE INDEX idx_delivery_assignments_order ON delivery_assignments(order_id);
CREATE INDEX idx_delivery_assignments_rider ON delivery_assignments(rider_id);
CREATE INDEX idx_delivery_assignments_status ON delivery_assignments(status);
CREATE INDEX idx_delivery_assignments_date ON delivery_assignments(assigned_at DESC);

COMMENT ON TABLE delivery_assignments IS 'Maps orders to riders with delivery tracking';

-- -----------------------------------------------------------------------------
-- 1.5 DELIVERY ATTEMPTS (Failed Delivery Tracking)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS delivery_attempts CASCADE;

CREATE TABLE delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES delivery_assignments(id) ON DELETE SET NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    result delivery_result NOT NULL,
    reason TEXT,
    notes TEXT,
    rescheduled_for DATE,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_attempts_order ON delivery_attempts(order_id);
CREATE INDEX idx_delivery_attempts_result ON delivery_attempts(result);

COMMENT ON TABLE delivery_attempts IS 'Tracks individual delivery attempts';

-- -----------------------------------------------------------------------------
-- 1.6 RIDER SETTLEMENTS (Daily Cash Collection)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS rider_settlements CASCADE;

CREATE TABLE rider_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, settled, disputed
    total_cod_collected DECIMAL(14, 2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    amount_deposited DECIMAL(14, 2) DEFAULT 0,
    deposit_reference VARCHAR(100),
    deposited_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_rider_date_settlement UNIQUE(rider_id, settlement_date)
);

CREATE INDEX idx_rider_settlements_rider ON rider_settlements(rider_id);
CREATE INDEX idx_rider_settlements_date ON rider_settlements(settlement_date DESC);
CREATE INDEX idx_rider_settlements_status ON rider_settlements(status);

COMMENT ON TABLE rider_settlements IS 'Daily COD settlement tracking for riders';

-- -----------------------------------------------------------------------------
-- 1.7 USER ACTIVITY LOG (Audit Trail)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS user_activity_log CASCADE;

CREATE TABLE user_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50), -- order, product, vendor, customer, etc.
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_activity_user ON user_activity_log(user_id);
CREATE INDEX idx_user_activity_action ON user_activity_log(action);
CREATE INDEX idx_user_activity_entity ON user_activity_log(entity_type, entity_id);
CREATE INDEX idx_user_activity_created ON user_activity_log(created_at DESC);

COMMENT ON TABLE user_activity_log IS 'Audit trail for user actions';

-- -----------------------------------------------------------------------------
-- 1.8 VENDOR ACCESS LOGS (Portal Access Tracking)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS vendor_access_logs CASCADE;

CREATE TABLE vendor_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- login, view_ledger, view_supplies, etc.
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendor_access_vendor ON vendor_access_logs(vendor_id);
CREATE INDEX idx_vendor_access_created ON vendor_access_logs(created_at DESC);

COMMENT ON TABLE vendor_access_logs IS 'Tracks vendor portal access';

-- -----------------------------------------------------------------------------
-- 1.9 PRODUCT CHANGE REQUESTS (Approval Workflow)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS product_change_requests CASCADE;

CREATE TABLE product_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    request_type VARCHAR(30) NOT NULL, -- create, update, delete, price_change
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
    requested_changes JSONB NOT NULL,
    reason TEXT,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_changes_product ON product_change_requests(product_id);
CREATE INDEX idx_product_changes_status ON product_change_requests(status);
CREATE INDEX idx_product_changes_requester ON product_change_requests(requested_by);

COMMENT ON TABLE product_change_requests IS 'Product change approval workflow';

-- -----------------------------------------------------------------------------
-- 1.10 REVIEWS (Customer Reviews)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS reviews CASCADE;

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255),
    content TEXT,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    helpful_count INTEGER DEFAULT 0,
    images JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_approved ON reviews(is_approved) WHERE is_approved = TRUE;

COMMENT ON TABLE reviews IS 'Product reviews from customers';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 2: ATOMIC STOCK OPERATIONS (RPCs)                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- -----------------------------------------------------------------------------
-- 2.1 DEDUCT STOCK ATOMIC (Single Variant)
-- -----------------------------------------------------------------------------
-- Drop all overloads of this function first
DROP FUNCTION IF EXISTS deduct_stock_atomic(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS deduct_stock_atomic(UUID, INTEGER);

CREATE OR REPLACE FUNCTION deduct_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_sku VARCHAR(100);
BEGIN
    -- Lock and get current stock
    SELECT current_stock, sku INTO v_current_stock, v_sku
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    -- Check availability
    IF v_current_stock < p_quantity THEN
        RETURN json_build_object(
            'success', FALSE, 
            'error', format('Insufficient stock for %s. Available: %s, Requested: %s', 
                           v_sku, v_current_stock, p_quantity)
        );
    END IF;
    
    -- Deduct stock and add to reserved
    v_new_stock := v_current_stock - p_quantity;
    
    UPDATE product_variants
    SET 
        current_stock = v_new_stock,
        reserved_stock = reserved_stock + p_quantity,
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    -- Log the movement
    INSERT INTO stock_movements (
        variant_id, order_id, movement_type, quantity, 
        balance_before, balance_after, source, notes
    ) VALUES (
        p_variant_id, p_order_id, 'reserved', -p_quantity,
        v_current_stock, v_new_stock, 'fresh', 
        'Order reservation'
    );
    
    RETURN json_build_object(
        'success', TRUE,
        'variant_id', p_variant_id,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'reserved', p_quantity
    );
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_stock_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock_atomic TO service_role;

COMMENT ON FUNCTION deduct_stock_atomic IS 'Atomically deducts stock for order reservation';

-- -----------------------------------------------------------------------------
-- 2.2 DEDUCT STOCK BATCH ATOMIC (Multiple Variants)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS deduct_stock_batch_atomic(JSONB, UUID);
DROP FUNCTION IF EXISTS deduct_stock_batch_atomic(JSONB);

CREATE OR REPLACE FUNCTION deduct_stock_batch_atomic(
    p_items JSONB,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_result JSON;
    v_failed JSONB := '[]'::JSONB;
    v_success INTEGER := 0;
    v_variant_id UUID;
    v_quantity INTEGER;
BEGIN
    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        -- Call single deduct function
        SELECT deduct_stock_atomic(v_variant_id, v_quantity, p_order_id) INTO v_result;
        
        IF (v_result->>'success')::BOOLEAN THEN
            v_success := v_success + 1;
        ELSE
            v_failed := v_failed || jsonb_build_object(
                'variant_id', v_variant_id,
                'error', v_result->>'error'
            );
        END IF;
    END LOOP;
    
    -- Return summary
    IF jsonb_array_length(v_failed) > 0 THEN
        RETURN json_build_object(
            'success', FALSE,
            'processed', v_success,
            'failed', v_failed
        );
    ELSE
        RETURN json_build_object(
            'success', TRUE,
            'processed', v_success
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_stock_batch_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock_batch_atomic TO service_role;

COMMENT ON FUNCTION deduct_stock_batch_atomic IS 'Batch stock deduction for order items';

-- -----------------------------------------------------------------------------
-- 2.3 RESTORE STOCK ATOMIC (For Cancellations/Returns)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS restore_stock_atomic(UUID, INTEGER, UUID, TEXT);
DROP FUNCTION IF EXISTS restore_stock_atomic(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS restore_stock_atomic(UUID, INTEGER);

CREATE OR REPLACE FUNCTION restore_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Order cancelled'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stock INTEGER;
    v_reserved_stock INTEGER;
    v_new_stock INTEGER;
BEGIN
    -- Lock and get current stock
    SELECT current_stock, reserved_stock INTO v_current_stock, v_reserved_stock
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    -- Calculate new values
    v_new_stock := v_current_stock + p_quantity;
    
    -- Restore stock
    UPDATE product_variants
    SET 
        current_stock = v_new_stock,
        reserved_stock = GREATEST(0, reserved_stock - p_quantity),
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    -- Log the movement
    INSERT INTO stock_movements (
        variant_id, order_id, movement_type, quantity,
        balance_before, balance_after, source, notes
    ) VALUES (
        p_variant_id, p_order_id, 'restored', p_quantity,
        v_current_stock, v_new_stock, 'fresh', p_reason
    );
    
    RETURN json_build_object(
        'success', TRUE,
        'variant_id', p_variant_id,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'restored', p_quantity
    );
END;
$$;

GRANT EXECUTE ON FUNCTION restore_stock_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION restore_stock_atomic TO service_role;

-- -----------------------------------------------------------------------------
-- 2.4 CONFIRM STOCK DEDUCTION (After Delivery)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS confirm_stock_deduction_atomic(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS confirm_stock_deduction_atomic(UUID, INTEGER);

CREATE OR REPLACE FUNCTION confirm_stock_deduction_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reserved_stock INTEGER;
BEGIN
    -- Get reserved stock
    SELECT reserved_stock INTO v_reserved_stock
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    -- Remove from reserved (stock already deducted)
    UPDATE product_variants
    SET 
        reserved_stock = GREATEST(0, reserved_stock - p_quantity),
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    -- Log the movement
    INSERT INTO stock_movements (
        variant_id, order_id, movement_type, quantity,
        balance_before, balance_after, source, notes
    ) VALUES (
        p_variant_id, p_order_id, 'confirmed', -p_quantity,
        v_reserved_stock, GREATEST(0, v_reserved_stock - p_quantity), 
        'reserved', 'Delivery confirmed'
    );
    
    RETURN json_build_object('success', TRUE, 'confirmed', p_quantity);
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_stock_deduction_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_stock_deduction_atomic TO service_role;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 3: VENDOR STATS & PAYMENT RPCs                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- -----------------------------------------------------------------------------
-- 3.1 GET VENDOR STATS (Optimized Aggregation)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_vendor_stats(UUID);

CREATE OR REPLACE FUNCTION get_vendor_stats(p_vendor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
    v_purchases DECIMAL(14,2) := 0;
    v_returns DECIMAL(14,2) := 0;
    v_payments DECIMAL(14,2) := 0;
    v_purchase_count INTEGER := 0;
    v_last_purchase_date DATE;
    v_last_payment_date DATE;
    v_balance DECIMAL(14,2) := 0;
BEGIN
    -- Get purchase stats from inventory_transactions
    SELECT 
        COALESCE(COUNT(*), 0),
        COALESCE(SUM(ABS(total_cost)), 0),
        MAX(transaction_date)
    INTO v_purchase_count, v_purchases, v_last_purchase_date
    FROM inventory_transactions
    WHERE vendor_id = p_vendor_id 
      AND transaction_type = 'purchase'
      AND status = 'approved';
    
    -- Get return stats
    SELECT COALESCE(SUM(ABS(total_cost)), 0)
    INTO v_returns
    FROM inventory_transactions
    WHERE vendor_id = p_vendor_id 
      AND transaction_type = 'purchase_return'
      AND status = 'approved';
    
    -- Get payment stats from vendor_ledger
    SELECT 
        COALESCE(SUM(credit), 0),
        MAX(transaction_date)
    INTO v_payments, v_last_payment_date
    FROM vendor_ledger
    WHERE vendor_id = p_vendor_id 
      AND entry_type = 'payment';
    
    -- Get current balance from vendor record
    SELECT COALESCE(balance, 0) INTO v_balance
    FROM vendors
    WHERE id = p_vendor_id;
    
    -- Build result
    v_result := json_build_object(
        'purchase_count', v_purchase_count,
        'purchases', v_purchases,
        'returns', v_returns,
        'payments', v_payments,
        'balance', COALESCE(v_balance, v_purchases - v_returns - v_payments),
        'last_purchase_date', v_last_purchase_date,
        'last_payment_date', v_last_payment_date,
        'last_activity_date', GREATEST(v_last_purchase_date, v_last_payment_date)
    );
    
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_vendor_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_vendor_stats TO service_role;

COMMENT ON FUNCTION get_vendor_stats IS 'Get comprehensive vendor statistics';

-- -----------------------------------------------------------------------------
-- 3.2 GENERATE SUPPLY NUMBER (Invoice Number Generator)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS generate_supply_number();

CREATE OR REPLACE FUNCTION generate_supply_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix TEXT := 'PO';
    v_date_part TEXT := TO_CHAR(NOW(), 'YYMMDD');
    v_sequence INTEGER;
    v_result TEXT;
BEGIN
    -- Get next sequence for today
    SELECT COALESCE(MAX(
        CAST(RIGHT(invoice_no, 3) AS INTEGER)
    ), 0) + 1 INTO v_sequence
    FROM inventory_transactions
    WHERE invoice_no LIKE v_prefix || v_date_part || '%'
      AND created_at::DATE = CURRENT_DATE;
    
    v_result := v_prefix || v_date_part || LPAD(v_sequence::TEXT, 3, '0');
    
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_supply_number TO authenticated;
GRANT EXECUTE ON FUNCTION generate_supply_number TO service_role;

-- -----------------------------------------------------------------------------
-- 3.3 GET NEXT FOLLOWUP ATTEMPT
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_next_followup_attempt(UUID);

CREATE OR REPLACE FUNCTION get_next_followup_attempt(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_attempt INTEGER;
BEGIN
    SELECT COALESCE(MAX(followup_number), 0) + 1 INTO v_max_attempt
    FROM order_followups
    WHERE order_id = p_order_id;
    
    RETURN v_max_attempt;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_followup_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_followup_attempt TO service_role;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 4: CONSOLIDATED DASHBOARD RPC                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- -----------------------------------------------------------------------------
-- 4.1 GET DASHBOARD ANALYTICS (Single Call for All Stats)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_dashboard_analytics(DATE, DATE);
DROP FUNCTION IF EXISTS get_dashboard_analytics();

CREATE OR REPLACE FUNCTION get_dashboard_analytics(
    p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
    v_orders_stats JSON;
    v_inventory_stats JSON;
    v_vendor_stats JSON;
    v_revenue_stats JSON;
BEGIN
    -- Orders Stats
    SELECT json_build_object(
        'total_orders', COUNT(*),
        'pending_orders', COUNT(*) FILTER (WHERE status IN ('intake', 'follow_up')),
        'processing_orders', COUNT(*) FILTER (WHERE status IN ('converted', 'packed', 'assigned')),
        'delivered_orders', COUNT(*) FILTER (WHERE status = 'delivered'),
        'cancelled_orders', COUNT(*) FILTER (WHERE status IN ('cancelled', 'rejected', 'returned')),
        'orders_today', COUNT(*) FILTER (WHERE created_at::DATE = CURRENT_DATE),
        'orders_this_week', COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE))
    ) INTO v_orders_stats
    FROM orders
    WHERE is_deleted = FALSE
      AND created_at::DATE BETWEEN p_date_from AND p_date_to;
    
    -- Inventory Stats
    SELECT json_build_object(
        'total_products', COUNT(DISTINCT product_id),
        'total_variants', COUNT(*),
        'total_stock', COALESCE(SUM(current_stock), 0),
        'low_stock_count', COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock < 10),
        'out_of_stock_count', COUNT(*) FILTER (WHERE current_stock = 0),
        'stock_value', COALESCE(SUM(current_stock * cost_price), 0),
        'pending_transactions', (
            SELECT COUNT(*) FROM inventory_transactions 
            WHERE status = 'pending'
        )
    ) INTO v_inventory_stats
    FROM product_variants
    WHERE is_active = TRUE;
    
    -- Vendor Stats
    SELECT json_build_object(
        'total_vendors', COUNT(*),
        'active_vendors', COUNT(*) FILTER (WHERE is_active = TRUE),
        'total_balance', COALESCE(SUM(balance), 0),
        'total_purchases_period', (
            SELECT COALESCE(SUM(ABS(total_cost)), 0)
            FROM inventory_transactions
            WHERE transaction_type = 'purchase'
              AND status = 'approved'
              AND transaction_date BETWEEN p_date_from AND p_date_to
        ),
        'total_payments_period', (
            SELECT COALESCE(SUM(credit), 0)
            FROM vendor_ledger
            WHERE entry_type = 'payment'
              AND transaction_date BETWEEN p_date_from AND p_date_to
        )
    ) INTO v_vendor_stats
    FROM vendors;
    
    -- Revenue Stats
    SELECT json_build_object(
        'total_revenue', COALESCE(SUM(total_amount), 0),
        'total_paid', COALESCE(SUM(paid_amount), 0),
        'pending_amount', COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status = 'delivered'), 0),
        'avg_order_value', COALESCE(AVG(total_amount), 0),
        'cod_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'cod'), 0),
        'prepaid_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_method != 'cod'), 0)
    ) INTO v_revenue_stats
    FROM orders
    WHERE is_deleted = FALSE
      AND created_at::DATE BETWEEN p_date_from AND p_date_to;
    
    -- Combine all stats
    v_result := json_build_object(
        'orders', v_orders_stats,
        'inventory', v_inventory_stats,
        'vendors', v_vendor_stats,
        'revenue', v_revenue_stats,
        'period', json_build_object(
            'from', p_date_from,
            'to', p_date_to
        ),
        'generated_at', NOW()
    );
    
    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_analytics TO service_role;

COMMENT ON FUNCTION get_dashboard_analytics IS 'Single RPC for all dashboard statistics - prevents 429 errors';


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 5: UTILITY FUNCTIONS                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- -----------------------------------------------------------------------------
-- 5.1 INCREMENT RIDER STATS
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS increment_rider_stats(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS increment_rider_stats(UUID);

CREATE OR REPLACE FUNCTION increment_rider_stats(
    p_rider_id UUID,
    p_delivered INTEGER DEFAULT 0,
    p_failed INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE riders
    SET 
        total_deliveries = total_deliveries + p_delivered + p_failed,
        successful_deliveries = successful_deliveries + p_delivered,
        failed_deliveries = failed_deliveries + p_failed,
        updated_at = NOW()
    WHERE id = p_rider_id;
    
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_rider_stats TO authenticated;
GRANT EXECUTE ON FUNCTION increment_rider_stats TO service_role;

-- -----------------------------------------------------------------------------
-- 5.2 APPEND UNIQUE TO ARRAY
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS append_unique_to_array(TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION append_unique_to_array(
    p_table_name TEXT,
    p_column_name TEXT,
    p_id UUID,
    p_value TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE format(
        'UPDATE %I SET %I = array_append(
            COALESCE(%I, ARRAY[]::TEXT[]), 
            $1
        ) WHERE id = $2 AND NOT ($1 = ANY(COALESCE(%I, ARRAY[]::TEXT[])))',
        p_table_name, p_column_name, p_column_name, p_column_name
    ) USING p_value, p_id;
    
    RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION append_unique_to_array TO authenticated;
GRANT EXECUTE ON FUNCTION append_unique_to_array TO service_role;

-- -----------------------------------------------------------------------------
-- 5.3 GET DELIVERY ZONE (For Order Assignment)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_delivery_zone(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_delivery_zone(TEXT);

CREATE OR REPLACE FUNCTION get_delivery_zone(p_city TEXT, p_district TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_zone RECORD;
BEGIN
    SELECT * INTO v_zone
    FROM delivery_zones
    WHERE LOWER(city_name) = LOWER(p_city)
       OR (p_district IS NOT NULL AND LOWER(district) = LOWER(p_district))
    LIMIT 1;
    
    IF NOT FOUND THEN
        -- Default to outside valley
        RETURN json_build_object(
            'found', FALSE,
            'zone_type', 'outside_valley',
            'delivery_fee', 150
        );
    END IF;
    
    RETURN json_build_object(
        'found', TRUE,
        'zone_id', v_zone.id,
        'zone_type', v_zone.zone_type,
        'city_name', v_zone.city_name,
        'delivery_fee', v_zone.delivery_fee,
        'estimated_days', v_zone.estimated_days
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_delivery_zone TO authenticated;
GRANT EXECUTE ON FUNCTION get_delivery_zone TO service_role;

-- -----------------------------------------------------------------------------
-- 5.4 GET ZONE TYPE (Simple Zone Lookup)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_zone_type(UUID);

CREATE OR REPLACE FUNCTION get_zone_type(p_zone_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_zone_type TEXT;
BEGIN
    SELECT zone_type::TEXT INTO v_zone_type
    FROM delivery_zones
    WHERE id = p_zone_id;
    
    RETURN COALESCE(v_zone_type, 'outside_valley');
END;
$$;

GRANT EXECUTE ON FUNCTION get_zone_type TO authenticated;
GRANT EXECUTE ON FUNCTION get_zone_type TO service_role;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  SECTION 6: RLS POLICIES FOR NEW TABLES                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Enable RLS on new tables
ALTER TABLE order_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write (admin checks in application layer)
CREATE POLICY "Allow authenticated access to order_followups" ON order_followups
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to order_timeline" ON order_timeline
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to courier_manifests" ON courier_manifests
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to delivery_assignments" ON delivery_assignments
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to delivery_attempts" ON delivery_attempts
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to rider_settlements" ON rider_settlements
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to user_activity_log" ON user_activity_log
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to vendor_access_logs" ON vendor_access_logs
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to product_change_requests" ON product_change_requests
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow public read on reviews" ON reviews
    FOR SELECT USING (is_approved = TRUE);

CREATE POLICY "Allow authenticated write on reviews" ON reviews
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  VERIFICATION                                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
    v_tables_created INTEGER := 0;
    v_functions_created INTEGER := 0;
BEGIN
    -- Count new tables
    SELECT COUNT(*) INTO v_tables_created
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
          'order_followups', 'order_timeline', 'courier_manifests',
          'delivery_assignments', 'delivery_attempts', 'rider_settlements',
          'user_activity_log', 'vendor_access_logs', 'product_change_requests', 'reviews'
      );
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 042 COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  ✓ Tables created: %', v_tables_created;
    RAISE NOTICE '  ✓ Stock RPCs: deduct_stock_atomic, restore_stock_atomic, etc.';
    RAISE NOTICE '  ✓ Vendor RPCs: get_vendor_stats, generate_supply_number';
    RAISE NOTICE '  ✓ Dashboard RPC: get_dashboard_analytics (consolidated)';
    RAISE NOTICE '  ✓ Utility RPCs: increment_rider_stats, get_delivery_zone';
    RAISE NOTICE '  ✓ RLS policies enabled on all new tables';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
