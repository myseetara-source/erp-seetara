-- ============================================================================
-- Migration 100: Disable Auto Activity Triggers
-- ============================================================================
-- Purpose: Remove auto-logging triggers since we now handle activity logging
--          from the controller with proper user context
-- ============================================================================

-- Drop the order creation trigger (we log from controller with user name)
DROP TRIGGER IF EXISTS trg_order_created_activity ON orders;

-- Drop the status change trigger (we log from controller with user name)
DROP TRIGGER IF EXISTS trg_order_status_activity ON orders;

-- Keep the functions in case we need them later
-- (they're not harmful without the triggers)

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
SELECT 'Migration 100 complete: Auto-activity triggers disabled' as status;
