-- =============================================================================
-- Migration 092: Fix Smart Order ID to Handle Legacy Formats
-- =============================================================================
-- Problem: The generate_smart_order_id() trigger fails when there are legacy
-- orders with readable_id formats like "IV-001" that don't match YY-MM-DD-SEQ
-- 
-- Error: "invalid input syntax for type integer: 'IV-001'"
-- 
-- Fix: Add proper filtering and error handling to only consider properly
-- formatted IDs when calculating the next sequence number.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Create improved Smart Order ID Generator Function
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_smart_order_id()
RETURNS TRIGGER AS $$
DECLARE
    v_date_prefix TEXT;
    v_lock_key BIGINT;
    v_last_seq INT;
    v_new_seq INT;
    v_last_id TEXT;
    v_extracted TEXT;
BEGIN
    -- Skip if readable_id is already set (for legacy data or manual override)
    IF NEW.readable_id IS NOT NULL AND NEW.readable_id != '' THEN
        RETURN NEW;
    END IF;
    
    -- Generate date prefix in YY-MM-DD format
    v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
    
    -- Create a unique lock key based on the date prefix
    v_lock_key := hashtext(v_date_prefix);
    
    -- Acquire an advisory lock for this specific date
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Find the latest sequence number for today
    -- P0 FIX: Only consider IDs that match the expected format (4 segments, last is numeric)
    BEGIN
        SELECT readable_id INTO v_last_id
        FROM orders
        WHERE readable_id LIKE v_date_prefix || '-%'
          -- P0 FIX: Ensure the 4th segment exists and is numeric
          AND SPLIT_PART(readable_id, '-', 4) ~ '^[0-9]+[A-Z]?$'  -- Allow optional letter suffix (e.g., 101E for exchange)
          AND SPLIT_PART(readable_id, '-', 4) != ''
        ORDER BY 
            -- Extract numeric part only (remove any letter suffix)
            CAST(REGEXP_REPLACE(SPLIT_PART(readable_id, '-', 4), '[^0-9]', '', 'g') AS INTEGER) DESC
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        -- If any parsing error, just start fresh
        v_last_id := NULL;
        RAISE NOTICE 'Smart Order ID: Could not parse existing IDs, starting fresh for %', v_date_prefix;
    END;
    
    IF v_last_id IS NULL THEN
        -- First order of the day, start at 101
        v_new_seq := 101;
    ELSE
        -- Extract the sequence part (4th segment after splitting by '-')
        BEGIN
            v_extracted := SPLIT_PART(v_last_id, '-', 4);
            -- Remove any letter suffix (like 'E' for exchange orders)
            v_extracted := REGEXP_REPLACE(v_extracted, '[^0-9]', '', 'g');
            v_last_seq := CAST(v_extracted AS INTEGER);
            v_new_seq := v_last_seq + 1;
        EXCEPTION WHEN OTHERS THEN
            -- If parsing fails, fallback to 101
            v_new_seq := 101;
            RAISE NOTICE 'Smart Order ID: Failed to parse sequence from %, starting at 101', v_last_id;
        END;
    END IF;
    
    -- Generate the new readable_id
    NEW.readable_id := v_date_prefix || '-' || v_new_seq::TEXT;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION generate_smart_order_id() IS 
'Generates smart readable order IDs in format YY-MM-DD-SEQ. 
Sequence starts at 101 each day and increments for each order.
Uses advisory locks to prevent race conditions.
P0 FIX (Migration 092): Now handles legacy ID formats gracefully.';

COMMIT;

-- =============================================================================
-- ROLLBACK PLAN
-- =============================================================================
-- Run the original migration 090 to restore the previous version:
-- \i migrations/090_smart_order_id.sql
