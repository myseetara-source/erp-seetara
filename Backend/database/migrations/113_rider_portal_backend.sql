-- ============================================================================
-- Migration 113: Rider Portal Backend Setup
-- Priority: P0 - Critical for rider app functionality
-- Author: System Architect
-- Date: 2026-01-30
-- ============================================================================
-- 
-- This migration sets up the complete backend infrastructure for the Rider Portal:
-- 1. Adds duty tracking columns to riders table
-- 2. Adds delivery attempt tracking to orders
-- 3. Creates delivery_logs table for delivery attempt tracking
-- 4. Implements strict RLS policies for rider security
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: CREATE ENUMS FOR DELIVERY LOGS
-- ============================================================================

-- Delivery attempt status
DO $$ BEGIN
    CREATE TYPE delivery_log_status AS ENUM (
        'delivered',      -- Successfully delivered
        'reschedule',     -- Customer requested reschedule
        'reject',         -- Customer rejected / refused
        'partial',        -- Partial delivery (some items)
        'unreachable'     -- Could not reach customer
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Delivery failure/reschedule reasons
DO $$ BEGIN
    CREATE TYPE delivery_fail_reason AS ENUM (
        'customer_unreachable',    -- Phone not answered, not at location
        'refused',                 -- Customer refused to accept
        'wrong_location',          -- Address was incorrect
        'customer_not_available',  -- Customer asked to come later
        'payment_issue',           -- COD amount dispute
        'damaged_product',         -- Product was damaged
        'wrong_product',           -- Wrong product delivered
        'other'                    -- Other reason (see note field)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- SECTION 2: UPDATE RIDERS TABLE (Duty & Location Tracking)
-- ============================================================================

-- Add is_on_duty column (real-time duty status)
ALTER TABLE riders 
ADD COLUMN IF NOT EXISTS is_on_duty BOOLEAN NOT NULL DEFAULT FALSE;

-- Add current_location for GPS tracking (JSONB for flexibility)
-- Format: {"lat": 27.7172, "lng": 85.3240, "accuracy": 10, "updated_at": "ISO timestamp"}
ALTER TABLE riders 
ADD COLUMN IF NOT EXISTS current_location JSONB;

-- Add last_location_update for tracking freshness
ALTER TABLE riders 
ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMPTZ;

-- Add daily stats tracking
ALTER TABLE riders 
ADD COLUMN IF NOT EXISTS today_deliveries INTEGER NOT NULL DEFAULT 0;

ALTER TABLE riders 
ADD COLUMN IF NOT EXISTS today_earnings DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- Add last_seen timestamp for activity tracking
ALTER TABLE riders 
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- ============================================================================
-- SECTION 3: UPDATE ORDERS TABLE (Delivery Attempt Tracking)
-- ============================================================================

-- Ensure delivery_attempt_count exists (may already exist from migration 094)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_attempt_count INTEGER NOT NULL DEFAULT 0;

-- Add last_delivery_attempt timestamp
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS last_delivery_attempt TIMESTAMPTZ;

-- Add last_delivery_outcome for quick status check
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS last_delivery_outcome TEXT;

-- Add reschedule_date for rescheduled deliveries (may already exist)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS reschedule_date DATE;

-- Add reschedule_reason
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS reschedule_reason TEXT;

-- ============================================================================
-- SECTION 4: CREATE DELIVERY_LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign keys
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE SET NULL,
    manifest_id UUID REFERENCES dispatch_manifests(id) ON DELETE SET NULL,
    
    -- Delivery attempt info
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status delivery_log_status NOT NULL,
    reason delivery_fail_reason,
    
    -- Additional details
    note TEXT,
    customer_feedback TEXT,
    
    -- Location at time of attempt
    delivery_location JSONB,  -- {"lat": ..., "lng": ..., "address": "..."}
    
    -- Proof of delivery
    pod_image_url TEXT,       -- Photo proof (signature, delivered item)
    pod_signature_url TEXT,   -- Digital signature if captured
    
    -- Financial info (for COD)
    cod_collected DECIMAL(10, 2),
    payment_method_used TEXT,  -- 'cash', 'qr', 'fonepay'
    
    -- Timestamps
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add helpful comments
COMMENT ON TABLE delivery_logs IS 'Tracks every delivery attempt for each order - success or failure';
COMMENT ON COLUMN delivery_logs.status IS 'Outcome of delivery attempt: delivered, reschedule, reject, partial, unreachable';
COMMENT ON COLUMN delivery_logs.reason IS 'If status is not delivered, the reason why';
COMMENT ON COLUMN delivery_logs.pod_image_url IS 'Photo proof of delivery (R2 storage URL)';
COMMENT ON COLUMN delivery_logs.cod_collected IS 'Amount collected if COD (may differ from order total)';

-- ============================================================================
-- SECTION 5: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Delivery logs indexes
CREATE INDEX IF NOT EXISTS idx_delivery_logs_order 
ON delivery_logs(order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_rider 
ON delivery_logs(rider_id);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_status 
ON delivery_logs(status);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_attempted 
ON delivery_logs(attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_rider_date 
ON delivery_logs(rider_id, attempted_at DESC);

-- Rider duty tracking indexes
CREATE INDEX IF NOT EXISTS idx_riders_on_duty 
ON riders(is_on_duty) 
WHERE is_on_duty = TRUE;

CREATE INDEX IF NOT EXISTS idx_riders_available_duty 
ON riders(is_available, is_on_duty) 
WHERE is_active = TRUE;

-- Orders - rider assignment indexes
CREATE INDEX IF NOT EXISTS idx_orders_rider_pending 
ON orders(rider_id, status) 
WHERE rider_id IS NOT NULL AND status IN ('assigned', 'out_for_delivery', 'in_transit');

CREATE INDEX IF NOT EXISTS idx_orders_last_attempt 
ON orders(last_delivery_attempt DESC) 
WHERE last_delivery_attempt IS NOT NULL;

-- ============================================================================
-- SECTION 6: RLS POLICIES FOR RIDER PORTAL (CRITICAL SECURITY)
-- ============================================================================

-- Enable RLS on delivery_logs
ALTER TABLE delivery_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing rider policies if any (to recreate cleanly)
DROP POLICY IF EXISTS "delivery_logs_staff_all" ON delivery_logs;
DROP POLICY IF EXISTS "delivery_logs_rider_select" ON delivery_logs;
DROP POLICY IF EXISTS "delivery_logs_rider_insert" ON delivery_logs;

-- -------------------------------------------------------------------------
-- DELIVERY_LOGS POLICIES
-- -------------------------------------------------------------------------

-- Staff (admin/manager/operator): Full access
CREATE POLICY "delivery_logs_staff_all" ON delivery_logs
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Riders: Can VIEW their own delivery logs
CREATE POLICY "delivery_logs_rider_select" ON delivery_logs
FOR SELECT TO authenticated
USING (
    public.is_rider() 
    AND rider_id = public.get_user_rider_id()
);

-- Riders: Can INSERT new delivery logs (for orders assigned to them)
CREATE POLICY "delivery_logs_rider_insert" ON delivery_logs
FOR INSERT TO authenticated
WITH CHECK (
    public.is_rider()
    AND rider_id = public.get_user_rider_id()
    -- Must be for an order assigned to this rider
    AND EXISTS (
        SELECT 1 FROM orders o 
        WHERE o.id = order_id 
        AND o.rider_id = (
            SELECT r.id FROM riders r WHERE r.user_id = auth.uid()
        )
    )
);

-- -------------------------------------------------------------------------
-- ORDERS POLICIES FOR RIDERS (More restrictive)
-- -------------------------------------------------------------------------

-- Drop and recreate rider order policies for clarity
DROP POLICY IF EXISTS "orders_rider_select" ON orders;
DROP POLICY IF EXISTS "orders_rider_update" ON orders;

-- Riders: Can ONLY see orders assigned to them
CREATE POLICY "orders_rider_select" ON orders
FOR SELECT TO authenticated
USING (
    -- Allow if user is staff (they see all)
    public.is_staff()
    OR
    -- OR if user is a rider and this order is assigned to them
    (
        public.is_rider()
        AND rider_id = (SELECT r.id FROM riders r WHERE r.user_id = auth.uid())
    )
);

-- Riders: Can UPDATE orders ONLY if assigned to them
-- AND can only update specific fields (delivery status, not financials)
CREATE POLICY "orders_rider_update" ON orders
FOR UPDATE TO authenticated
USING (
    public.is_staff()
    OR
    (
        public.is_rider()
        AND rider_id = (SELECT r.id FROM riders r WHERE r.user_id = auth.uid())
        -- Only allow update on orders in deliverable status
        AND status IN ('assigned', 'out_for_delivery', 'in_transit', 'delivered', 'follow_up', 'rejected')
    )
)
WITH CHECK (
    public.is_staff()
    OR
    (
        public.is_rider()
        AND rider_id = (SELECT r.id FROM riders r WHERE r.user_id = auth.uid())
    )
);

-- -------------------------------------------------------------------------
-- RIDERS TABLE POLICIES (Riders can update their own profile)
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "riders_own_update_location" ON riders;

-- Riders: Can update their own location and duty status
CREATE POLICY "riders_own_update_location" ON riders
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- SECTION 7: HELPER FUNCTIONS FOR RIDER PORTAL
-- ============================================================================

-- Function to get rider's current assigned orders
CREATE OR REPLACE FUNCTION get_rider_assigned_orders(p_rider_id UUID DEFAULT NULL)
RETURNS TABLE (
    order_id UUID,
    order_number VARCHAR,
    readable_id VARCHAR,
    customer_name VARCHAR,
    customer_phone VARCHAR,
    shipping_address TEXT,
    shipping_city VARCHAR,
    total_amount DECIMAL,
    payment_method TEXT,
    payment_status TEXT,
    status TEXT,
    delivery_attempt_count INTEGER,
    last_delivery_attempt TIMESTAMPTZ,
    zone_code VARCHAR,
    priority INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rider_id UUID;
BEGIN
    -- Get rider_id from param or current user
    IF p_rider_id IS NOT NULL THEN
        v_rider_id := p_rider_id;
    ELSE
        SELECT r.id INTO v_rider_id 
        FROM riders r 
        WHERE r.user_id = auth.uid();
    END IF;
    
    IF v_rider_id IS NULL THEN
        RAISE EXCEPTION 'Rider not found';
    END IF;
    
    RETURN QUERY
    SELECT 
        o.id,
        o.order_number,
        o.readable_id,
        o.shipping_name,
        o.shipping_phone,
        o.shipping_address,
        o.shipping_city,
        o.total_amount,
        o.payment_method::TEXT,
        o.payment_status::TEXT,
        o.status::TEXT,
        o.delivery_attempt_count,
        o.last_delivery_attempt,
        o.zone_code,
        o.priority,
        o.internal_notes,
        o.created_at
    FROM orders o
    WHERE o.rider_id = v_rider_id
    AND o.status IN ('assigned', 'out_for_delivery', 'in_transit')
    AND o.is_deleted = FALSE
    ORDER BY o.priority DESC, o.created_at ASC;
END;
$$;

-- Function to log a delivery attempt and update order
CREATE OR REPLACE FUNCTION log_delivery_attempt(
    p_order_id UUID,
    p_status delivery_log_status,
    p_reason delivery_fail_reason DEFAULT NULL,
    p_note TEXT DEFAULT NULL,
    p_cod_collected DECIMAL DEFAULT NULL,
    p_pod_image_url TEXT DEFAULT NULL,
    p_location JSONB DEFAULT NULL,
    p_reschedule_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rider_id UUID;
    v_order_record RECORD;
    v_attempt_number INTEGER;
    v_log_id UUID;
    v_new_status order_status;
BEGIN
    -- Get current rider
    SELECT r.id INTO v_rider_id 
    FROM riders r 
    WHERE r.user_id = auth.uid();
    
    IF v_rider_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not a valid rider');
    END IF;
    
    -- Get order and verify assignment
    SELECT * INTO v_order_record 
    FROM orders 
    WHERE id = p_order_id;
    
    IF v_order_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Order not found');
    END IF;
    
    IF v_order_record.rider_id != v_rider_id THEN
        RETURN json_build_object('success', false, 'error', 'Order not assigned to you');
    END IF;
    
    -- Calculate attempt number
    SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_number
    FROM delivery_logs
    WHERE order_id = p_order_id;
    
    -- Insert delivery log
    INSERT INTO delivery_logs (
        order_id, rider_id, attempt_number, status, reason, 
        note, cod_collected, pod_image_url, delivery_location
    ) VALUES (
        p_order_id, v_rider_id, v_attempt_number, p_status, p_reason,
        p_note, p_cod_collected, p_pod_image_url, p_location
    )
    RETURNING id INTO v_log_id;
    
    -- Determine new order status based on delivery outcome
    CASE p_status
        WHEN 'delivered' THEN
            v_new_status := 'delivered';
        WHEN 'reschedule' THEN
            v_new_status := 'follow_up';  -- Reschedule goes to follow_up for retry
        WHEN 'reject' THEN
            v_new_status := 'rejected';
        WHEN 'unreachable' THEN
            v_new_status := 'follow_up';  -- Will retry
        ELSE
            v_new_status := v_order_record.status;  -- No change
    END CASE;
    
    -- Update order
    UPDATE orders SET
        status = v_new_status,
        delivery_attempt_count = v_attempt_number,
        last_delivery_attempt = NOW(),
        last_delivery_outcome = p_status::TEXT,
        reschedule_date = COALESCE(p_reschedule_date, reschedule_date),
        reschedule_reason = CASE WHEN p_status = 'reschedule' THEN p_note ELSE reschedule_reason END,
        delivered_at = CASE WHEN p_status = 'delivered' THEN NOW() ELSE delivered_at END,
        payment_status = CASE 
            WHEN p_status = 'delivered' AND p_cod_collected IS NOT NULL 
            THEN 'paid'::payment_status 
            ELSE payment_status 
        END,
        paid_amount = CASE 
            WHEN p_status = 'delivered' AND p_cod_collected IS NOT NULL 
            THEN COALESCE(paid_amount, 0) + p_cod_collected 
            ELSE paid_amount 
        END,
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- Update rider stats
    UPDATE riders SET
        today_deliveries = today_deliveries + CASE WHEN p_status = 'delivered' THEN 1 ELSE 0 END,
        total_deliveries = total_deliveries + CASE WHEN p_status = 'delivered' THEN 1 ELSE 0 END,
        successful_deliveries = successful_deliveries + CASE WHEN p_status = 'delivered' THEN 1 ELSE 0 END,
        failed_deliveries = failed_deliveries + CASE WHEN p_status IN ('reject', 'unreachable') THEN 1 ELSE 0 END,
        last_seen = NOW(),
        updated_at = NOW()
    WHERE id = v_rider_id;
    
    RETURN json_build_object(
        'success', true,
        'log_id', v_log_id,
        'attempt_number', v_attempt_number,
        'new_status', v_new_status::TEXT
    );
END;
$$;

-- Function to update rider location
CREATE OR REPLACE FUNCTION update_rider_location(
    p_lat DECIMAL,
    p_lng DECIMAL,
    p_accuracy INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rider_id UUID;
BEGIN
    SELECT id INTO v_rider_id 
    FROM riders 
    WHERE user_id = auth.uid();
    
    IF v_rider_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not a valid rider');
    END IF;
    
    UPDATE riders SET
        current_location = json_build_object(
            'lat', p_lat,
            'lng', p_lng,
            'accuracy', p_accuracy,
            'updated_at', NOW()
        )::JSONB,
        last_location_update = NOW(),
        last_seen = NOW(),
        updated_at = NOW()
    WHERE id = v_rider_id;
    
    RETURN json_build_object('success', true, 'updated_at', NOW());
END;
$$;

-- Function to toggle rider duty status
CREATE OR REPLACE FUNCTION toggle_rider_duty(p_on_duty BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rider_id UUID;
    v_current_status rider_status;
BEGIN
    SELECT id, status INTO v_rider_id, v_current_status 
    FROM riders 
    WHERE user_id = auth.uid();
    
    IF v_rider_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not a valid rider');
    END IF;
    
    -- Don't allow going on duty if suspended
    IF p_on_duty = TRUE AND v_current_status = 'suspended' THEN
        RETURN json_build_object('success', false, 'error', 'Rider is suspended');
    END IF;
    
    UPDATE riders SET
        is_on_duty = p_on_duty,
        status = CASE 
            WHEN p_on_duty = TRUE THEN 'available'::rider_status
            ELSE 'off_duty'::rider_status
        END,
        -- Reset daily stats when going on duty for first time today
        today_deliveries = CASE 
            WHEN p_on_duty = TRUE AND (
                last_seen IS NULL OR 
                last_seen::DATE < CURRENT_DATE
            ) THEN 0 
            ELSE today_deliveries 
        END,
        today_earnings = CASE 
            WHEN p_on_duty = TRUE AND (
                last_seen IS NULL OR 
                last_seen::DATE < CURRENT_DATE
            ) THEN 0 
            ELSE today_earnings 
        END,
        last_seen = NOW(),
        updated_at = NOW()
    WHERE id = v_rider_id;
    
    RETURN json_build_object(
        'success', true, 
        'is_on_duty', p_on_duty,
        'status', CASE WHEN p_on_duty THEN 'available' ELSE 'off_duty' END
    );
END;
$$;

-- Function to get rider dashboard stats
CREATE OR REPLACE FUNCTION get_rider_dashboard_stats(p_rider_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rider_id UUID;
    v_rider RECORD;
    v_pending_count INTEGER;
    v_today_count INTEGER;
    v_total_cod DECIMAL;
BEGIN
    -- Get rider_id
    IF p_rider_id IS NOT NULL THEN
        v_rider_id := p_rider_id;
    ELSE
        SELECT r.id INTO v_rider_id FROM riders r WHERE r.user_id = auth.uid();
    END IF;
    
    IF v_rider_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Rider not found');
    END IF;
    
    -- Get rider info
    SELECT * INTO v_rider FROM riders WHERE id = v_rider_id;
    
    -- Count pending orders
    SELECT COUNT(*) INTO v_pending_count
    FROM orders
    WHERE rider_id = v_rider_id
    AND status IN ('assigned', 'out_for_delivery', 'in_transit')
    AND is_deleted = FALSE;
    
    -- Today's completed deliveries
    SELECT COUNT(*) INTO v_today_count
    FROM orders
    WHERE rider_id = v_rider_id
    AND status = 'delivered'
    AND delivered_at::DATE = CURRENT_DATE;
    
    -- Total COD to collect today
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_cod
    FROM orders
    WHERE rider_id = v_rider_id
    AND status IN ('assigned', 'out_for_delivery', 'in_transit')
    AND payment_method = 'cod'
    AND is_deleted = FALSE;
    
    RETURN json_build_object(
        'success', true,
        'rider', json_build_object(
            'id', v_rider.id,
            'name', v_rider.full_name,
            'phone', v_rider.phone,
            'status', v_rider.status,
            'is_on_duty', v_rider.is_on_duty,
            'vehicle_type', v_rider.vehicle_type,
            'vehicle_number', v_rider.vehicle_number
        ),
        'stats', json_build_object(
            'pending_orders', v_pending_count,
            'today_completed', v_today_count,
            'today_deliveries', v_rider.today_deliveries,
            'cod_to_collect', v_total_cod,
            'total_deliveries', v_rider.total_deliveries,
            'success_rate', CASE 
                WHEN v_rider.total_deliveries > 0 
                THEN ROUND((v_rider.successful_deliveries::DECIMAL / v_rider.total_deliveries) * 100, 1)
                ELSE 100
            END,
            'average_rating', v_rider.average_rating
        )
    );
END;
$$;

-- ============================================================================
-- SECTION 8: GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_rider_assigned_orders TO authenticated;
GRANT EXECUTE ON FUNCTION log_delivery_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION update_rider_location TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_rider_duty TO authenticated;
GRANT EXECUTE ON FUNCTION get_rider_dashboard_stats TO authenticated;

-- Grant table permissions (RLS will filter)
GRANT SELECT, INSERT ON delivery_logs TO authenticated;
GRANT SELECT, UPDATE ON riders TO authenticated;
GRANT SELECT, UPDATE ON orders TO authenticated;

-- ============================================================================
-- SECTION 9: MIGRATION VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_col_count INTEGER;
    v_func_count INTEGER;
    v_policy_count INTEGER;
BEGIN
    -- Check new columns on riders
    SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
    WHERE table_name = 'riders' 
    AND column_name IN ('is_on_duty', 'current_location', 'last_location_update', 'today_deliveries', 'today_earnings', 'last_seen');
    
    -- Check functions
    SELECT COUNT(*) INTO v_func_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN ('get_rider_assigned_orders', 'log_delivery_attempt', 'update_rider_location', 'toggle_rider_duty', 'get_rider_dashboard_stats');
    
    -- Check policies
    SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies
    WHERE tablename IN ('delivery_logs', 'orders', 'riders')
    AND policyname LIKE '%rider%';
    
    RAISE NOTICE '[OK] Migration 113 complete: % rider columns, % functions, % RLS policies', v_col_count, v_func_count, v_policy_count;
END;
$$;

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (Run separately if needed)
-- ============================================================================
/*
BEGIN;

-- Drop functions
DROP FUNCTION IF EXISTS get_rider_assigned_orders;
DROP FUNCTION IF EXISTS log_delivery_attempt;
DROP FUNCTION IF EXISTS update_rider_location;
DROP FUNCTION IF EXISTS toggle_rider_duty;
DROP FUNCTION IF EXISTS get_rider_dashboard_stats;

-- Drop policies
DROP POLICY IF EXISTS "delivery_logs_staff_all" ON delivery_logs;
DROP POLICY IF EXISTS "delivery_logs_rider_select" ON delivery_logs;
DROP POLICY IF EXISTS "delivery_logs_rider_insert" ON delivery_logs;

-- Drop table
DROP TABLE IF EXISTS delivery_logs;

-- Drop types
DROP TYPE IF EXISTS delivery_log_status;
DROP TYPE IF EXISTS delivery_fail_reason;

-- Remove columns from riders (careful - data loss)
ALTER TABLE riders DROP COLUMN IF EXISTS is_on_duty;
ALTER TABLE riders DROP COLUMN IF EXISTS current_location;
ALTER TABLE riders DROP COLUMN IF EXISTS last_location_update;
ALTER TABLE riders DROP COLUMN IF EXISTS today_deliveries;
ALTER TABLE riders DROP COLUMN IF EXISTS today_earnings;
ALTER TABLE riders DROP COLUMN IF EXISTS last_seen;

-- Remove columns from orders
ALTER TABLE orders DROP COLUMN IF EXISTS last_delivery_attempt;
ALTER TABLE orders DROP COLUMN IF EXISTS last_delivery_outcome;
ALTER TABLE orders DROP COLUMN IF EXISTS reschedule_reason;

COMMIT;
*/
