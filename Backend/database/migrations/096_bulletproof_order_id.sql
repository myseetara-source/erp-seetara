-- =============================================================================
-- Migration 096: BULLETPROOF Order ID Generation
-- =============================================================================
-- P0 CRITICAL FIX: The generate_order_number trigger fails with:
-- "invalid input syntax for type integer: 'IV-001'"
--
-- ROOT CAUSE: The generate_order_number() function tries to parse ALL
-- order_numbers matching 'ORD-%', including legacy 'ORD-IV-001' format.
--
-- THIS MIGRATION FIXES BOTH:
-- 1. generate_order_number() - for order_number column
-- 2. generate_smart_order_id() - for readable_id column (if it exists)
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: FIX generate_order_number() - THE ACTUAL BUG!
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_seq INTEGER := 0;
    v_candidate TEXT;
    rec RECORD;
BEGIN
    -- Skip if order_number is already set
    IF NEW.order_number IS NOT NULL AND LENGTH(TRIM(NEW.order_number)) > 0 THEN
        RETURN NEW;
    END IF;
    
    -- P0 FIX: Process one row at a time to handle legacy formats safely
    BEGIN
        FOR rec IN 
            SELECT order_number FROM orders 
            WHERE order_number IS NOT NULL
              AND order_number LIKE 'ORD-%'
              -- Only consider pure numeric suffixes
              AND SUBSTRING(order_number FROM 5) ~ '^[0-9]+$'
        LOOP
            BEGIN
                v_candidate := SUBSTRING(rec.order_number FROM 5);
                IF v_candidate ~ '^[0-9]+$' THEN
                    IF v_candidate::INT > v_seq THEN
                        v_seq := v_candidate::INT;
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Skip legacy formats like ORD-IV-001
                NULL;
            END;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback to timestamp-based sequence
        v_seq := (EXTRACT(EPOCH FROM NOW())::INT % 900000);
    END;
    
    NEW.order_number := 'ORD-' || LPAD((v_seq + 1)::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_order_number() IS 
'P0 FIX (Migration 096): Safe order number generation that handles legacy ORD-IV-001 formats.';

-- =============================================================================
-- STEP 2: DROP ALL EXISTING readable_id TRIGGERS (cleanup)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_generate_readable_id ON orders;
DROP TRIGGER IF EXISTS trg_prevent_readable_id_change ON orders;
DROP TRIGGER IF EXISTS trg_generate_smart_order_id ON orders;
DROP TRIGGER IF EXISTS generate_smart_order_id_trigger ON orders;

-- Drop old functions too
DROP FUNCTION IF EXISTS generate_smart_order_id() CASCADE;
DROP FUNCTION IF EXISTS prevent_readable_id_change() CASCADE;

-- =============================================================================
-- STEP 2: Create BULLETPROOF order ID generation function
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_order_readable_id_safe()
RETURNS TRIGGER AS $$
DECLARE
    v_date_prefix TEXT;
    v_max_seq INT := 100;
    v_new_seq INT;
    v_candidate TEXT;
    v_extracted INT;
    rec RECORD;
BEGIN
    -- =========================================================================
    -- CRITICAL: Skip if readable_id is already set
    -- This is the primary path for POS reconciliation orders
    -- =========================================================================
    IF NEW.readable_id IS NOT NULL AND LENGTH(TRIM(NEW.readable_id)) > 0 THEN
        RETURN NEW;
    END IF;
    
    -- Generate today's date prefix in YY-MM-DD format
    v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
    
    -- =========================================================================
    -- ULTRA-SAFE sequence finding: Loop through candidates one by one
    -- NEVER use CAST in a bulk query - do it row by row with exception handling
    -- =========================================================================
    BEGIN
        FOR rec IN 
            SELECT readable_id 
            FROM orders 
            WHERE readable_id IS NOT NULL
              AND readable_id LIKE v_date_prefix || '-%'
              -- Pre-filter: Only consider IDs with exactly 4 dash-separated parts
              AND array_length(string_to_array(readable_id, '-'), 1) = 4
        LOOP
            BEGIN
                -- Extract the 4th part (after YY-MM-DD-)
                v_candidate := SPLIT_PART(rec.readable_id, '-', 4);
                
                -- Remove any letter suffix (like 'E' for exchange)
                v_candidate := REGEXP_REPLACE(v_candidate, '[^0-9]', '', 'g');
                
                -- Only try to convert if it looks like a number
                IF v_candidate ~ '^[0-9]+$' AND LENGTH(v_candidate) > 0 THEN
                    v_extracted := v_candidate::INT;
                    IF v_extracted > v_max_seq THEN
                        v_max_seq := v_extracted;
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Skip this row silently - it's a legacy format
                NULL;
            END;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        -- If the entire loop fails, use a safe default
        v_max_seq := 100 + (EXTRACT(EPOCH FROM NOW())::INT % 800);
        RAISE NOTICE '[Order ID] Loop failed, using timestamp-based sequence: %', v_max_seq;
    END;
    
    -- Generate new sequence
    v_new_seq := v_max_seq + 1;
    
    -- Set the readable_id
    NEW.readable_id := v_date_prefix || '-' || v_new_seq::TEXT;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_order_readable_id_safe() IS 
'P0 FIX (Migration 096): Ultra-safe order ID generation.
- Skips if readable_id already set (for POS reconciliation)
- Processes rows one-by-one with individual exception handling
- Never uses bulk CAST that could fail on legacy data
- Completely immune to legacy formats like IV-001, TT-2026-xxx';

-- =============================================================================
-- STEP 3: Create the trigger
-- =============================================================================

CREATE TRIGGER trg_generate_order_readable_id
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_readable_id_safe();

RAISE NOTICE '✅ Created safe order ID trigger';

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$
DECLARE
    v_trigger_exists BOOLEAN;
    v_function_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_generate_order_readable_id'
    ) INTO v_trigger_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'generate_order_readable_id_safe'
    ) INTO v_function_exists;
    
    IF v_trigger_exists AND v_function_exists THEN
        RAISE NOTICE '✅ Migration 096 complete: Bulletproof order ID system installed';
    ELSE
        RAISE EXCEPTION '❌ Migration 096 failed: trigger=%, function=%', v_trigger_exists, v_function_exists;
    END IF;
END $$;
