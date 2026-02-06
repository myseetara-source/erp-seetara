-- =============================================================================
-- Migration 093: Add Remarks Column to Orders
-- =============================================================================
-- Purpose: Add a "remarks" field for tracking special notes on delivery orders
-- (e.g., follow-up reasons, customer requests, delivery instructions)
-- 
-- Note: This column is intended for Inside/Outside Valley orders.
-- Store POS orders typically don't need remarks as they're immediate sales.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Add remarks column if it doesn't exist
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'remarks'
    ) THEN
        ALTER TABLE orders ADD COLUMN remarks TEXT;
        RAISE NOTICE '✅ Added remarks column to orders table';
    ELSE
        RAISE NOTICE '⚠️ remarks column already exists';
    END IF;
END $$;

-- =============================================================================
-- STEP 2: Add comment for documentation
-- =============================================================================

COMMENT ON COLUMN orders.remarks IS 
'Special notes for delivery orders (follow-up reasons, customer requests, etc.). 
Typically used for Inside/Outside Valley orders, hidden for Store POS.';

-- =============================================================================
-- STEP 3: Create index for potential searching
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_remarks ON orders USING gin(to_tsvector('english', COALESCE(remarks, '')));

COMMIT;

-- =============================================================================
-- ROLLBACK PLAN
-- =============================================================================
-- ALTER TABLE orders DROP COLUMN IF EXISTS remarks;
-- DROP INDEX IF EXISTS idx_orders_remarks;
