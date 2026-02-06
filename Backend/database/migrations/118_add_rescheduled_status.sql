-- ============================================================================
-- Migration 118: Add 'rescheduled' status to order_status enum
-- ============================================================================
-- 
-- Problem: When rider marks order as "Next Attempt", status stays 'out_for_delivery'
--          which causes confusion in the orders page
--
-- Solution: Add 'rescheduled' as a valid order_status
-- ============================================================================

-- Add 'rescheduled' to order_status enum if it doesn't exist
DO $$ 
BEGIN
    -- Check if 'rescheduled' already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'order_status'::regtype 
        AND enumlabel = 'rescheduled'
    ) THEN
        -- Add the new value after 'out_for_delivery'
        ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'rescheduled' AFTER 'out_for_delivery';
        RAISE NOTICE 'Added rescheduled to order_status enum';
    ELSE
        RAISE NOTICE 'rescheduled already exists in order_status enum';
    END IF;
END $$;

-- ============================================================================
-- Done!
-- ============================================================================
