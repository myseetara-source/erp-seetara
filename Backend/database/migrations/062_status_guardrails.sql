-- =============================================================================
-- MIGRATION 062: STATUS GUARDRAILS (STATE MACHINE VALIDATION)
-- =============================================================================
-- 
-- DATE: 2026-01-25
-- AUTHOR: Senior Backend Logic Engineer
-- PURPOSE: Prevent invalid status transitions - 100% Data Integrity
--
-- BUSINESS RULES ENFORCED:
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ LEADS STATE MACHINE                                                      │
-- │ INTAKE ──┬──▶ FOLLOW_UP ──┬──▶ CONVERTED (locked)                       │
-- │          │                │                                              │
-- │          └──▶ CANCELLED   └──▶ CANCELLED (locked)                       │
-- └─────────────────────────────────────────────────────────────────────────┘
-- 
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ ORDERS STATE MACHINE (Inside Valley - Rider)                            │
-- │ PACKED ──▶ ASSIGNED ──▶ SENT_FOR_DELIVERY ──┬──▶ DELIVERED              │
-- │                                              ├──▶ REJECTED               │
-- │                                              ├──▶ HOLD                   │
-- │                                              └──▶ NEXT_ATTEMPT           │
-- └─────────────────────────────────────────────────────────────────────────┘
-- 
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ ORDERS STATE MACHINE (Outside Valley - Courier)                         │
-- │ PACKED ──▶ DISPATCHED ──┬──▶ RETURN_RECEIVED                            │
-- │                         └──▶ RE_DIRECTED                                 │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 0: ADD MISSING ENUM VALUE (BUSY for leads)
-- =============================================================================

DO $$
BEGIN
    -- Add BUSY to lead_status if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'lead_status'::regtype 
        AND enumlabel = 'BUSY'
    ) THEN
        ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'BUSY' AFTER 'FOLLOW_UP';
        RAISE NOTICE '✅ Added BUSY to lead_status enum';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⏭️ Could not add BUSY to lead_status: %', SQLERRM;
END $$;

-- =============================================================================
-- SECTION 1: LEAD STATUS VALIDATION (State Machine)
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_lead_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status TEXT;
    v_new_status TEXT;
    v_allowed_transitions TEXT[];
BEGIN
    -- Skip if status hasn't changed
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    
    v_old_status := OLD.status::TEXT;
    v_new_status := NEW.status::TEXT;
    
    -- Define allowed transitions based on current status
    CASE v_old_status
        -- ═══════════════════════════════════════════════════════════════════
        -- FROM INTAKE: New lead, can move to follow-up, cancel, or convert
        -- ═══════════════════════════════════════════════════════════════════
        WHEN 'INTAKE' THEN
            v_allowed_transitions := ARRAY['FOLLOW_UP', 'CANCELLED', 'CONVERTED'];
            
        -- ═══════════════════════════════════════════════════════════════════
        -- FROM FOLLOW_UP: In pipeline, can go busy, cancel, or convert
        -- ═══════════════════════════════════════════════════════════════════
        WHEN 'FOLLOW_UP' THEN
            v_allowed_transitions := ARRAY['CANCELLED', 'CONVERTED', 'BUSY', 'INTAKE'];
            -- INTAKE allowed for "reset" scenarios
            
        -- ═══════════════════════════════════════════════════════════════════
        -- FROM BUSY: Customer was busy, can retry or close
        -- ═══════════════════════════════════════════════════════════════════
        WHEN 'BUSY' THEN
            v_allowed_transitions := ARRAY['FOLLOW_UP', 'CANCELLED', 'CONVERTED'];
            
        -- ═══════════════════════════════════════════════════════════════════
        -- FROM CANCELLED: Terminal state - Cannot change directly
        -- Must use restore_lead() RPC function
        -- ═══════════════════════════════════════════════════════════════════
        WHEN 'CANCELLED' THEN
            RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Cannot change status from CANCELLED. Use "Restore Lead" function to reopen.';
            
        -- ═══════════════════════════════════════════════════════════════════
        -- FROM CONVERTED: Terminal state - Lead has become an Order
        -- Cannot change (Order is the source of truth now)
        -- ═══════════════════════════════════════════════════════════════════
        WHEN 'CONVERTED' THEN
            RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Cannot change status from CONVERTED. This lead is now an Order.';
            
        ELSE
            -- Unknown status - allow for backwards compatibility
            RETURN NEW;
    END CASE;
    
    -- Validate the transition
    IF NOT (v_new_status = ANY(v_allowed_transitions)) THEN
        RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Cannot move from "%" to "%". Allowed transitions: %',
            v_old_status, v_new_status, array_to_string(v_allowed_transitions, ', ');
    END IF;
    
    -- Log the transition (optional - for audit)
    RAISE NOTICE '✅ Lead status change: % → %', v_old_status, v_new_status;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_lead_status_change() IS 
'State machine validation for lead status transitions. Prevents invalid moves.';

-- =============================================================================
-- SECTION 2: ORDER STATUS VALIDATION (State Machine with Location Awareness)
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status TEXT;
    v_new_status TEXT;
    v_location TEXT;
    v_allowed_transitions TEXT[];
    v_is_admin BOOLEAN := FALSE;
BEGIN
    -- Skip if status hasn't changed
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;
    
    v_old_status := OLD.status::TEXT;
    v_new_status := NEW.status::TEXT;
    v_location := COALESCE(NEW.location::TEXT, OLD.location::TEXT, 'INSIDE_VALLEY');
    
    -- Check for admin override flag in session (for emergency changes)
    -- Usage: SET LOCAL app.admin_override = 'true';
    BEGIN
        v_is_admin := current_setting('app.admin_override', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        v_is_admin := FALSE;
    END;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- UNIVERSAL RULES (Apply to all locations)
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- Rule 1: Cannot reverse from DELIVERED back to processing states
    IF v_old_status = 'DELIVERED' AND v_new_status IN ('PROCESSING', 'PACKED', 'ASSIGNED', 'SENT_FOR_DELIVERY', 'DISPATCHED') THEN
        IF v_is_admin THEN
            RAISE NOTICE '⚠️ ADMIN OVERRIDE: Allowing DELIVERED → % (normally blocked)', v_new_status;
        ELSE
            RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Cannot reverse from DELIVERED to "%". Contact Admin for override.', v_new_status;
        END IF;
    END IF;
    
    -- Rule 2: INSIDE_VALLEY cannot use DISPATCHED (that's for couriers)
    IF v_location = 'INSIDE_VALLEY' AND v_new_status = 'DISPATCHED' THEN
        RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Inside Valley orders must use "SENT_FOR_DELIVERY" (Rider), not "DISPATCHED" (Courier).';
    END IF;
    
    -- Rule 3: OUTSIDE_VALLEY cannot use SENT_FOR_DELIVERY (that's for riders)
    IF v_location = 'OUTSIDE_VALLEY' AND v_new_status = 'SENT_FOR_DELIVERY' THEN
        RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Outside Valley orders must use "DISPATCHED" (Courier), not "SENT_FOR_DELIVERY" (Rider).';
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- INSIDE VALLEY RULES (Rider Delivery)
    -- ═══════════════════════════════════════════════════════════════════════
    
    IF v_location = 'INSIDE_VALLEY' THEN
        CASE v_old_status
            WHEN 'PACKED' THEN
                v_allowed_transitions := ARRAY['ASSIGNED', 'HOLD', 'CANCELLED'];
                
            WHEN 'ASSIGNED' THEN
                -- Must go through SENT_FOR_DELIVERY, cannot skip to DELIVERED
                v_allowed_transitions := ARRAY['SENT_FOR_DELIVERY', 'HOLD', 'CANCELLED', 'PACKED'];
                
                IF v_new_status = 'DELIVERED' THEN
                    RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Cannot go from ASSIGNED to DELIVERED directly. Must go through SENT_FOR_DELIVERY first.';
                END IF;
                
            WHEN 'SENT_FOR_DELIVERY' THEN
                v_allowed_transitions := ARRAY['DELIVERED', 'REJECTED', 'HOLD', 'NEXT_ATTEMPT', 'RETURN_RECEIVED'];
                
            WHEN 'REJECTED' THEN
                v_allowed_transitions := ARRAY['NEXT_ATTEMPT', 'RETURN_RECEIVED', 'HOLD', 'CANCELLED'];
                
            WHEN 'NEXT_ATTEMPT' THEN
                v_allowed_transitions := ARRAY['SENT_FOR_DELIVERY', 'ASSIGNED', 'CANCELLED', 'HOLD'];
                
            WHEN 'HOLD' THEN
                v_allowed_transitions := ARRAY['ASSIGNED', 'PACKED', 'CANCELLED', 'RE_DIRECTED'];
                
            WHEN 'RETURN_RECEIVED' THEN
                v_allowed_transitions := ARRAY['EXCHANGED', 'REFUND_REQUESTED', 'CANCELLED'];
                
            WHEN 'REFUND_REQUESTED' THEN
                v_allowed_transitions := ARRAY['REFUNDED', 'EXCHANGED'];
                
            WHEN 'DELIVERED', 'REFUNDED', 'EXCHANGED', 'CANCELLED' THEN
                -- Terminal states
                IF NOT v_is_admin THEN
                    RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Cannot change from terminal status "%". Contact Admin.', v_old_status;
                END IF;
                RETURN NEW; -- Admin override allowed
                
            ELSE
                -- Unknown status - allow for backwards compatibility
                RETURN NEW;
        END CASE;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- OUTSIDE VALLEY RULES (Courier Delivery)
    -- ═══════════════════════════════════════════════════════════════════════
    
    ELSIF v_location = 'OUTSIDE_VALLEY' THEN
        CASE v_old_status
            WHEN 'PACKED' THEN
                v_allowed_transitions := ARRAY['DISPATCHED', 'HOLD', 'CANCELLED'];
                
            WHEN 'DISPATCHED' THEN
                -- Courier deliveries: We don't track "DELIVERED" directly
                -- Courier confirms delivery externally, we mark RETURN_RECEIVED if returned
                v_allowed_transitions := ARRAY['DELIVERED', 'RETURN_RECEIVED', 'RE_DIRECTED', 'HOLD'];
                
            WHEN 'RE_DIRECTED' THEN
                v_allowed_transitions := ARRAY['DISPATCHED', 'CANCELLED', 'HOLD'];
                
            WHEN 'RETURN_RECEIVED' THEN
                v_allowed_transitions := ARRAY['EXCHANGED', 'REFUND_REQUESTED', 'CANCELLED'];
                
            WHEN 'HOLD' THEN
                v_allowed_transitions := ARRAY['PACKED', 'DISPATCHED', 'CANCELLED', 'RE_DIRECTED'];
                
            WHEN 'REFUND_REQUESTED' THEN
                v_allowed_transitions := ARRAY['REFUNDED', 'EXCHANGED'];
                
            WHEN 'DELIVERED', 'REFUNDED', 'EXCHANGED', 'CANCELLED' THEN
                -- Terminal states
                IF NOT v_is_admin THEN
                    RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Cannot change from terminal status "%". Contact Admin.', v_old_status;
                END IF;
                RETURN NEW; -- Admin override allowed
                
            ELSE
                -- Unknown status - allow for backwards compatibility
                RETURN NEW;
        END CASE;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- POS (Point of Sale) - Simpler flow
    -- ═══════════════════════════════════════════════════════════════════════
    
    ELSIF v_location = 'POS' THEN
        CASE v_old_status
            WHEN 'PACKED' THEN
                v_allowed_transitions := ARRAY['DELIVERED', 'CANCELLED', 'HOLD'];
                
            WHEN 'HOLD' THEN
                v_allowed_transitions := ARRAY['PACKED', 'DELIVERED', 'CANCELLED'];
                
            WHEN 'DELIVERED' THEN
                v_allowed_transitions := ARRAY['RETURN_RECEIVED', 'EXCHANGED'];
                
            WHEN 'RETURN_RECEIVED' THEN
                v_allowed_transitions := ARRAY['REFUND_REQUESTED', 'EXCHANGED'];
                
            WHEN 'REFUND_REQUESTED' THEN
                v_allowed_transitions := ARRAY['REFUNDED'];
                
            WHEN 'REFUNDED', 'EXCHANGED', 'CANCELLED' THEN
                IF NOT v_is_admin THEN
                    RAISE EXCEPTION '❌ INVALID STATUS CHANGE: Cannot change from terminal status "%".', v_old_status;
                END IF;
                RETURN NEW;
                
            ELSE
                RETURN NEW;
        END CASE;
    
    ELSE
        -- Unknown location - allow all transitions
        RETURN NEW;
    END IF;
    
    -- Validate the transition
    IF v_allowed_transitions IS NOT NULL AND NOT (v_new_status = ANY(v_allowed_transitions)) THEN
        RAISE EXCEPTION '❌ INVALID STATUS CHANGE [%]: Cannot move from "%" to "%". Allowed: %',
            v_location, v_old_status, v_new_status, array_to_string(v_allowed_transitions, ', ');
    END IF;
    
    -- Log successful transition
    RAISE NOTICE '✅ Order status change [%]: % → %', v_location, v_old_status, v_new_status;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_order_status_change() IS 
'State machine validation for order status transitions. Location-aware rules for Inside Valley (Rider) vs Outside Valley (Courier).';

-- =============================================================================
-- SECTION 3: ATTACH TRIGGERS
-- =============================================================================

-- 3.1 Lead Status Trigger
DO $$
BEGIN
    DROP TRIGGER IF EXISTS trg_validate_lead_status ON leads;
    CREATE TRIGGER trg_validate_lead_status
        BEFORE UPDATE OF status ON leads
        FOR EACH ROW
        EXECUTE FUNCTION validate_lead_status_change();
    
    RAISE NOTICE '✅ Attached trigger: trg_validate_lead_status on leads';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Could not attach lead status trigger: %', SQLERRM;
END $$;

-- 3.2 Order Status Trigger
DO $$
BEGIN
    DROP TRIGGER IF EXISTS trg_validate_order_status ON orders;
    CREATE TRIGGER trg_validate_order_status
        BEFORE UPDATE OF status ON orders
        FOR EACH ROW
        EXECUTE FUNCTION validate_order_status_change();
    
    RAISE NOTICE '✅ Attached trigger: trg_validate_order_status on orders.status';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Could not attach order status trigger: %', SQLERRM;
END $$;

-- =============================================================================
-- SECTION 4: HELPER FUNCTIONS (For locked states)
-- =============================================================================

-- 4.1 Restore a cancelled lead (Admin function)
CREATE OR REPLACE FUNCTION restore_lead(
    p_lead_id UUID,
    p_new_status lead_status DEFAULT 'INTAKE'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status::TEXT INTO v_current_status
    FROM leads WHERE id = p_lead_id;
    
    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Lead not found: %', p_lead_id;
    END IF;
    
    IF v_current_status != 'CANCELLED' THEN
        RAISE EXCEPTION 'Lead is not cancelled. Current status: %', v_current_status;
    END IF;
    
    -- Bypass trigger by updating with flag
    -- We temporarily disable the trigger
    ALTER TABLE leads DISABLE TRIGGER trg_validate_lead_status;
    
    UPDATE leads 
    SET status = p_new_status, updated_at = NOW()
    WHERE id = p_lead_id;
    
    ALTER TABLE leads ENABLE TRIGGER trg_validate_lead_status;
    
    RAISE NOTICE '✅ Lead % restored to status: %', p_lead_id, p_new_status;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION restore_lead(UUID, lead_status) IS 
'Admin function to restore a cancelled lead. Bypasses status validation.';

-- 4.2 Admin override for order status (emergency use)
CREATE OR REPLACE FUNCTION admin_override_order_status(
    p_order_id UUID,
    p_new_status TEXT,
    p_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_old_status TEXT;
BEGIN
    SELECT status::TEXT INTO v_old_status
    FROM orders WHERE id = p_order_id;
    
    IF v_old_status IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;
    
    -- Set admin override flag
    PERFORM set_config('app.admin_override', 'true', true);
    
    -- Perform the update
    UPDATE orders 
    SET status = p_new_status::order_status, 
        updated_at = NOW(),
        internal_notes = COALESCE(internal_notes, '') || E'\n[ADMIN OVERRIDE ' || NOW() || '] ' || 
                         v_old_status || ' → ' || p_new_status || ': ' || p_reason
    WHERE id = p_order_id;
    
    -- Clear override flag
    PERFORM set_config('app.admin_override', 'false', true);
    
    RAISE NOTICE '✅ Order % status overridden: % → % (Reason: %)', 
        p_order_id, v_old_status, p_new_status, p_reason;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION admin_override_order_status(UUID, TEXT, TEXT) IS 
'Admin-only function to force status change on orders. Logs reason for audit.';

-- =============================================================================
-- SECTION 5: GRANT PERMISSIONS
-- =============================================================================

-- Revoke direct access to admin functions
REVOKE ALL ON FUNCTION restore_lead(UUID, lead_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_override_order_status(UUID, TEXT, TEXT) FROM PUBLIC;

-- Note: Grant to admin role as needed:
-- GRANT EXECUTE ON FUNCTION restore_lead TO admin_role;
-- GRANT EXECUTE ON FUNCTION admin_override_order_status TO admin_role;

COMMIT;

-- =============================================================================
-- DOCUMENTATION: STATUS FLOW CHARTS
-- =============================================================================

/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║                           LEAD STATUS FLOW                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   ┌──────────┐                                                                ║
║   │  INTAKE  │ ────────────────┬─────────────────┐                            ║
║   └────┬─────┘                 │                 │                            ║
║        │                       │                 ▼                            ║
║        ▼                       │          ┌────────────┐                      ║
║   ┌──────────┐                 │          │ CANCELLED  │ ◀─── (LOCKED)        ║
║   │FOLLOW_UP │ ────────────────┤          └────────────┘                      ║
║   └────┬─────┘                 │                                              ║
║        │                       │                                              ║
║        ▼                       │                                              ║
║   ┌──────────┐                 │                                              ║
║   │   BUSY   │ ────────────────┘                                              ║
║   └────┬─────┘                                                                ║
║        │                                                                       ║
║        ▼                                                                       ║
║   ┌───────────┐                                                               ║
║   │ CONVERTED │ ◀─── (LOCKED - Now an Order)                                  ║
║   └───────────┘                                                               ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ORDER STATUS FLOW - INSIDE VALLEY (Rider)                   ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   ┌────────┐      ┌──────────┐      ┌──────────────────┐      ┌───────────┐  ║
║   │ PACKED │ ───▶ │ ASSIGNED │ ───▶ │ SENT_FOR_DELIVERY│ ───▶ │ DELIVERED │  ║
║   └────────┘      └──────────┘      └────────┬─────────┘      └───────────┘  ║
║                                              │                                ║
║                                              ├───▶ REJECTED ───▶ NEXT_ATTEMPT ║
║                                              │                                ║
║                                              ├───▶ HOLD                       ║
║                                              │                                ║
║                                              └───▶ RETURN_RECEIVED ───▶       ║
║                                                         │                     ║
║                                                         ├───▶ EXCHANGED       ║
║                                                         └───▶ REFUNDED        ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║                   ORDER STATUS FLOW - OUTSIDE VALLEY (Courier)                 ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   ┌────────┐      ┌────────────┐                          ┌───────────┐       ║
║   │ PACKED │ ───▶ │ DISPATCHED │ ────────────────────────▶│ DELIVERED │       ║
║   └────────┘      └─────┬──────┘                          └───────────┘       ║
║                         │                                                      ║
║                         ├───▶ RE_DIRECTED ───▶ DISPATCHED (retry)             ║
║                         │                                                      ║
║                         └───▶ RETURN_RECEIVED ───▶ EXCHANGED / REFUNDED       ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
*/

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
/*
-- Check triggers are attached
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger 
WHERE tgname IN ('trg_validate_lead_status', 'trg_validate_order_status');

-- Test lead status validation (should fail)
-- UPDATE leads SET status = 'CONVERTED' WHERE status = 'CANCELLED';

-- Test order status validation (should fail for Inside Valley)
-- UPDATE orders SET status = 'DISPATCHED' WHERE location = 'INSIDE_VALLEY';
*/

-- =============================================================================
-- ROLLBACK
-- =============================================================================
/*
BEGIN;
DROP TRIGGER IF EXISTS trg_validate_lead_status ON leads;
DROP TRIGGER IF EXISTS trg_validate_order_status ON orders;
DROP FUNCTION IF EXISTS validate_lead_status_change();
DROP FUNCTION IF EXISTS validate_order_status_change();
DROP FUNCTION IF EXISTS restore_lead(UUID, lead_status);
DROP FUNCTION IF EXISTS admin_override_order_status(UUID, TEXT, TEXT);
COMMIT;
*/
