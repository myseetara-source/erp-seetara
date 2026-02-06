-- =============================================================================
-- Migration 095: Final Fix for Smart Order ID Trigger
-- =============================================================================
-- P0 FIX: The generate_smart_order_id trigger is failing because it tries to 
-- parse ALL readable_ids in the database, including legacy "IV-001" format.
-- 
-- This migration creates a BULLETPROOF version that:
-- 1. Skips generation if readable_id is already set
-- 2. Uses ONLY regex matching to find valid IDs
-- 3. Wraps ALL parsing in exception handlers
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Drop and recreate the trigger function with maximum safety
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_smart_order_id()
RETURNS TRIGGER AS $$
DECLARE
    v_date_prefix TEXT;
    v_new_seq INT;
    v_max_seq INT DEFAULT 100;  -- Start at 100 to generate IDs like 101, 102, etc.
BEGIN
    -- CRITICAL: Skip if readable_id is already set (for reconciliation orders, etc.)
    IF NEW.readable_id IS NOT NULL AND TRIM(NEW.readable_id) != '' THEN
        RETURN NEW;
    END IF;
    
    -- Generate today's date prefix: YY-MM-DD
    v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
    
    -- P0 FIX: Find the maximum sequence number using STRICT regex filtering
    -- Only consider IDs that EXACTLY match the pattern: YY-MM-DD-NNN (optionally with letter suffix)
    BEGIN
        SELECT COALESCE(MAX(
            CASE 
                -- Only extract sequence from IDs that exactly match our format
                WHEN readable_id ~ ('^' || v_date_prefix || '-[0-9]+[A-Z]?$') THEN
                    CAST(REGEXP_REPLACE(SPLIT_PART(readable_id, '-', 4), '[^0-9]', '', 'g') AS INTEGER)
                ELSE NULL
            END
        ), 100) INTO v_max_seq
        FROM orders
        WHERE readable_id LIKE v_date_prefix || '-%'
          -- CRITICAL: Strict regex check - must have exactly 4 segments with numeric 4th
          AND readable_id ~ ('^[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]+[A-Z]?$');
    EXCEPTION WHEN OTHERS THEN
        -- If anything fails, just use a random sequence in 101-999 range
        v_max_seq := 100 + (random() * 800)::int;
        RAISE NOTICE 'Smart Order ID: Query failed, using random sequence %', v_max_seq;
    END;
    
    -- Generate new sequence (max + 1)
    v_new_seq := v_max_seq + 1;
    
    -- Set the new readable_id
    NEW.readable_id := v_date_prefix || '-' || v_new_seq::TEXT;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION generate_smart_order_id() IS 
'P0 FIX (Migration 095): Generates smart readable order IDs in format YY-MM-DD-SEQ.
Completely safe against legacy ID formats like "IV-001".
Uses strict regex matching and exception handling.';

COMMIT;

-- =============================================================================
-- VERIFICATION: Check that the function was created
-- =============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_smart_order_id') THEN
        RAISE NOTICE '✅ Migration 095 complete: generate_smart_order_id function updated';
    ELSE
        RAISE EXCEPTION '❌ Migration 095 failed: function not found';
    END IF;
END $$;
