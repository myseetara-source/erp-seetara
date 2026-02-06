-- =============================================================================
-- MIGRATION 123: RTO Verification Columns & Functions
-- =============================================================================
-- ⚠️ RUN THIS AFTER MIGRATION 122 (enum values must be committed first)
--
-- This migration adds:
-- - RTO tracking columns to orders table
-- - Indexes for RTO queries
-- - RTO verification functions
-- - RTO dashboard view
--
-- @author Senior Database Architect
-- @priority P0 - Financial Protection
-- =============================================================================

-- STEP 0: Add logistics_status column if missing (from migration 121)
-- -----------------------------------------------------------------------------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS logistics_status TEXT;
COMMENT ON COLUMN orders.logistics_status IS 'Exact status text from logistics provider API for display';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_raw_status TEXT;
COMMENT ON COLUMN orders.courier_raw_status IS 'Raw status from courier API (backup)';

-- STEP 1: Add RTO tracking columns to orders table
-- -----------------------------------------------------------------------------

-- rto_initiated_at: When courier says customer rejected/undelivered
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rto_initiated_at TIMESTAMPTZ;
COMMENT ON COLUMN orders.rto_initiated_at IS 'Timestamp when RTO was initiated by courier (customer rejected)';

-- return_received_at: When warehouse physically received and verified the return
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_received_at TIMESTAMPTZ;
COMMENT ON COLUMN orders.return_received_at IS 'Timestamp when return was physically received and verified at warehouse';

-- return_condition: Physical condition of returned item after inspection
-- Values: GOOD, DAMAGED, MISSING_ITEMS, TAMPERED, UNKNOWN
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_condition TEXT;
COMMENT ON COLUMN orders.return_condition IS 'Physical condition of returned item: GOOD, DAMAGED, MISSING_ITEMS, TAMPERED';

-- return_verified_by: Who verified the return at warehouse
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_verified_by UUID REFERENCES users(id);
COMMENT ON COLUMN orders.return_verified_by IS 'Staff member who verified the return at warehouse';

-- return_notes: Notes from warehouse inspection
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_notes TEXT;
COMMENT ON COLUMN orders.return_notes IS 'Notes from warehouse staff during return inspection';

-- rto_reason: Reason provided by courier for RTO
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rto_reason TEXT;
COMMENT ON COLUMN orders.rto_reason IS 'Reason for RTO provided by courier (e.g., Customer Not Available, Wrong Address)';

-- STEP 2: Create indexes for efficient querying
-- -----------------------------------------------------------------------------

-- Index for finding orders pending RTO verification
CREATE INDEX IF NOT EXISTS idx_orders_rto_verification_pending 
ON orders (status) 
WHERE status = 'rto_verification_pending';

-- Index for finding RTO initiated orders
CREATE INDEX IF NOT EXISTS idx_orders_rto_initiated 
ON orders (status, rto_initiated_at) 
WHERE status = 'rto_initiated';

-- Index for finding lost orders
CREATE INDEX IF NOT EXISTS idx_orders_lost_in_transit 
ON orders (status) 
WHERE status = 'lost_in_transit';

-- STEP 3: Create RTO verification function
-- -----------------------------------------------------------------------------

/**
 * Verify RTO and mark as RETURNED
 * 
 * This function should be called when warehouse physically receives and verifies
 * a returned item. Only after this verification should inventory be updated.
 * 
 * @param p_order_id - Order UUID
 * @param p_condition - 'GOOD', 'DAMAGED', 'MISSING_ITEMS', 'TAMPERED'
 * @param p_verified_by - Staff member UUID who verified
 * @param p_notes - Optional inspection notes
 * @returns JSON with success status and message
 */
CREATE OR REPLACE FUNCTION verify_rto_return(
    p_order_id UUID,
    p_condition TEXT,
    p_verified_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_result JSON;
BEGIN
    -- Fetch order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Order not found'
        );
    END IF;
    
    -- Validate order is in correct status
    IF v_order.status::TEXT NOT IN ('rto_initiated', 'rto_verification_pending') THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Order is not pending RTO verification. Current status: ' || v_order.status::TEXT
        );
    END IF;
    
    -- Validate condition
    IF p_condition NOT IN ('GOOD', 'DAMAGED', 'MISSING_ITEMS', 'TAMPERED', 'UNKNOWN') THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Invalid return condition. Use: GOOD, DAMAGED, MISSING_ITEMS, TAMPERED'
        );
    END IF;
    
    -- Update order to RETURNED with verification details
    UPDATE orders
    SET
        status = 'returned',
        return_received_at = NOW(),
        return_condition = p_condition,
        return_verified_by = p_verified_by,
        return_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- Log activity
    INSERT INTO order_activities (
        order_id,
        type,
        message,
        metadata,
        created_by
    ) VALUES (
        p_order_id,
        'status_change',
        'Return verified at warehouse. Condition: ' || p_condition,
        json_build_object(
            'from_status', v_order.status::TEXT,
            'to_status', 'returned',
            'condition', p_condition,
            'notes', p_notes
        ),
        p_verified_by
    );
    
    RETURN json_build_object(
        'success', true,
        'message', 'RTO verified successfully. Order marked as RETURNED.',
        'order_id', p_order_id,
        'condition', p_condition
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'message', 'Error: ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION verify_rto_return IS 
'Verify RTO at warehouse and mark order as RETURNED. Only after this should inventory be updated.';

-- STEP 4: Create function to mark order as lost
-- -----------------------------------------------------------------------------

/**
 * Mark order as LOST_IN_TRANSIT
 * 
 * Use this when an order cannot be located after reasonable time in 
 * RTO_VERIFICATION_PENDING status (courier says delivered but we didn't receive).
 * 
 * @param p_order_id - Order UUID
 * @param p_marked_by - Staff member UUID who marked as lost
 * @param p_notes - Reason/evidence for marking as lost
 */
CREATE OR REPLACE FUNCTION mark_order_lost(
    p_order_id UUID,
    p_marked_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Fetch order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Order not found'
        );
    END IF;
    
    -- Validate order is in correct status (only RTO states can be marked lost)
    IF v_order.status::TEXT NOT IN ('rto_initiated', 'rto_verification_pending', 'in_transit', 'handover_to_courier') THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Order cannot be marked as lost from status: ' || v_order.status::TEXT
        );
    END IF;
    
    -- Update order to LOST_IN_TRANSIT
    UPDATE orders
    SET
        status = 'lost_in_transit',
        return_notes = COALESCE(return_notes || ' | ', '') || 'MARKED LOST: ' || COALESCE(p_notes, 'No reason provided'),
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- Log activity
    INSERT INTO order_activities (
        order_id,
        type,
        message,
        metadata,
        created_by
    ) VALUES (
        p_order_id,
        'status_change',
        'Order marked as LOST IN TRANSIT for courier dispute',
        json_build_object(
            'from_status', v_order.status::TEXT,
            'to_status', 'lost_in_transit',
            'notes', p_notes,
            'courier_tracking', v_order.external_order_id
        ),
        p_marked_by
    );
    
    RETURN json_build_object(
        'success', true,
        'message', 'Order marked as LOST IN TRANSIT. Open dispute with courier.',
        'order_id', p_order_id,
        'courier_tracking', v_order.external_order_id
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'message', 'Error: ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION mark_order_lost IS 
'Mark order as LOST_IN_TRANSIT for courier disputes when item never arrives.';

-- STEP 5: Create view for RTO dashboard
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_rto_pending AS
SELECT 
    o.id,
    o.readable_id,
    o.order_number,
    o.status::TEXT as status,
    o.logistics_status,
    o.courier_raw_status,
    o.external_order_id AS courier_tracking,
    o.logistics_provider AS courier_partner,
    o.shipping_name AS customer_name,
    o.shipping_phone AS customer_phone,
    o.destination_branch,
    o.total_amount,
    o.rto_initiated_at,
    o.rto_reason,
    o.created_at,
    o.updated_at,
    -- Calculate days pending RTO verification
    EXTRACT(DAY FROM NOW() - COALESCE(o.rto_initiated_at, o.updated_at))::INTEGER AS days_pending_verification
FROM orders o
WHERE o.status::TEXT IN ('rto_initiated', 'rto_verification_pending', 'lost_in_transit')
ORDER BY 
    CASE o.status::TEXT
        WHEN 'rto_verification_pending' THEN 1  -- Needs action first
        WHEN 'rto_initiated' THEN 2              -- On its way back
        WHEN 'lost_in_transit' THEN 3            -- Dispute cases
    END,
    o.rto_initiated_at ASC NULLS LAST;

COMMENT ON VIEW vw_rto_pending IS 
'Dashboard view for all RTO-related orders pending action';

-- =============================================================================
-- FINAL LOG
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 123: RTO Columns & Functions complete';
    RAISE NOTICE '   - Added columns: rto_initiated_at, return_received_at, return_condition, etc.';
    RAISE NOTICE '   - Created indexes for RTO queries';
    RAISE NOTICE '   - Created functions: verify_rto_return(), mark_order_lost()';
    RAISE NOTICE '   - Created view: vw_rto_pending for RTO dashboard';
END$$;
