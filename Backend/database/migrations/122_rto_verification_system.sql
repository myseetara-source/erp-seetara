-- =============================================================================
-- MIGRATION 122: Robust RTO (Return to Origin) Verification System
-- =============================================================================
-- P0 PRIORITY: Prevent financial loss from unverified returns
-- 
-- ⚠️ IMPORTANT: Run this migration in TWO STEPS due to PostgreSQL ENUM rules
-- New enum values cannot be used in the same transaction they are added.
--
-- STEP 1: Run lines 1-50 first (Add enum values)
-- STEP 2: Then run the rest (Create columns, indexes, functions, views)
--
-- @author Senior Database Architect
-- @priority P0 - Financial Protection
-- =============================================================================

-- =============================================================================
-- STEP 1: ADD NEW ENUM VALUES (Run this FIRST, then commit)
-- =============================================================================

-- Add 'rto_initiated' if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'rto_initiated' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
    ) THEN
        ALTER TYPE order_status ADD VALUE 'rto_initiated';
        RAISE NOTICE 'Added rto_initiated to order_status enum';
    ELSE
        RAISE NOTICE 'rto_initiated already exists';
    END IF;
END$$;

-- Add 'rto_verification_pending' if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'rto_verification_pending' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
    ) THEN
        ALTER TYPE order_status ADD VALUE 'rto_verification_pending';
        RAISE NOTICE 'Added rto_verification_pending to order_status enum';
    ELSE
        RAISE NOTICE 'rto_verification_pending already exists';
    END IF;
END$$;

-- Add 'lost_in_transit' if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'lost_in_transit' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
    ) THEN
        ALTER TYPE order_status ADD VALUE 'lost_in_transit';
        RAISE NOTICE 'Added lost_in_transit to order_status enum';
    ELSE
        RAISE NOTICE 'lost_in_transit already exists';
    END IF;
END$$;

-- =============================================================================
-- ⚠️ STOP HERE! Click "Run" to commit enum values first.
-- Then select and run the rest of the script below.
-- =============================================================================
