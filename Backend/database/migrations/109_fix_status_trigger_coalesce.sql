-- ============================================================================
-- Migration 109: Fix Status Trigger COALESCE Bug
-- ============================================================================
-- BUG: The trg_log_order_status_change trigger uses COALESCE(OLD.status, 'none')
-- which tries to cast 'none' to order_status ENUM, causing:
-- "invalid input value for enum order_status: 'none'"
--
-- FIX: Cast status to TEXT before COALESCE, or disable the trigger entirely
-- (since we handle activity logging in the controller with proper user context)
-- ============================================================================

-- OPTION 1: Disable the auto-activity triggers (preferred)
-- We handle activity logging from the controller with proper user context
DROP TRIGGER IF EXISTS trg_order_status_activity ON orders;
DROP TRIGGER IF EXISTS trg_order_created_activity ON orders;

-- OPTION 2: Fix the function if someone re-enables triggers later
CREATE OR REPLACE FUNCTION trg_log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_order_activity(
      NEW.id,
      NULL,
      'System',
      'system',
      'status_change',
      -- FIX: Cast to TEXT before COALESCE to avoid enum type conflict
      'Status changed from ' || COALESCE(OLD.status::TEXT, 'unknown') || ' to ' || NEW.status::TEXT,
      jsonb_build_object(
        'old_status', OLD.status::TEXT,
        'new_status', NEW.status::TEXT
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also fix the order created trigger function (just in case)
CREATE OR REPLACE FUNCTION trg_log_order_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_order_activity(
    NEW.id,
    NULL,
    'System',
    'system',
    'system_log',
    'Order created via ' || COALESCE(NEW.source::TEXT, 'manual'),
    jsonb_build_object(
      'source', NEW.source::TEXT,
      'status', NEW.status::TEXT,
      'fulfillment_type', NEW.fulfillment_type::TEXT,
      'total_amount', NEW.total_amount
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_trigger_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_order_status_activity'
  ) INTO v_trigger_exists;
  
  IF v_trigger_exists THEN
    RAISE WARNING '⚠️ Trigger trg_order_status_activity still exists - attempting to drop again';
    DROP TRIGGER IF EXISTS trg_order_status_activity ON orders;
  END IF;
  
  RAISE NOTICE '✅ Migration 109 complete: Status trigger COALESCE bug fixed';
END $$;
