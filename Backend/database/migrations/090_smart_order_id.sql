-- =============================================================================
-- Migration: 090_smart_order_id.sql
-- Description: Implement Smart Readable Order ID Generation
-- Format: YY-MM-DD-SEQ (e.g., 26-01-26-101)
-- Author: System
-- Date: 2026-01-26
-- =============================================================================

-- ROLLBACK PLAN:
-- DROP TRIGGER IF EXISTS trg_set_order_id ON orders;
-- DROP TRIGGER IF EXISTS trg_prevent_order_id_update ON orders;
-- DROP FUNCTION IF EXISTS generate_smart_order_id();
-- DROP FUNCTION IF EXISTS prevent_order_id_update();

BEGIN;

-- =============================================================================
-- STEP 1: Add constraints to readable_id column (if not exists)
-- =============================================================================

-- Ensure readable_id column exists and has proper constraints
DO $$
BEGIN
    -- Check if readable_id column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'readable_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN readable_id TEXT;
    END IF;
    
    -- Add UNIQUE constraint if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_readable_id_unique' AND conrelid = 'orders'::regclass
    ) THEN
        -- First, update any NULL readable_id values with temporary unique values
        UPDATE orders 
        SET readable_id = 'LEGACY-' || id::text 
        WHERE readable_id IS NULL;
        
        -- Now add the unique constraint
        ALTER TABLE orders ADD CONSTRAINT orders_readable_id_unique UNIQUE (readable_id);
    END IF;
    
    -- Add NOT NULL constraint if not already set
    ALTER TABLE orders ALTER COLUMN readable_id SET NOT NULL;
    
EXCEPTION WHEN others THEN
    -- If NOT NULL fails due to existing NULLs, backfill first
    UPDATE orders SET readable_id = 'LEGACY-' || id::text WHERE readable_id IS NULL;
    ALTER TABLE orders ALTER COLUMN readable_id SET NOT NULL;
END $$;

-- =============================================================================
-- STEP 2: Create index for efficient prefix lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_readable_id_prefix 
ON orders (readable_id text_pattern_ops);

-- =============================================================================
-- STEP 3: Create the Smart Order ID Generator Function
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_smart_order_id()
RETURNS TRIGGER AS $$
DECLARE
    v_date_prefix TEXT;
    v_lock_key BIGINT;
    v_last_seq INT;
    v_new_seq INT;
    v_last_id TEXT;
BEGIN
    -- Skip if readable_id is already set (for legacy data or manual override)
    IF NEW.readable_id IS NOT NULL AND NEW.readable_id != '' THEN
        RETURN NEW;
    END IF;
    
    -- Generate date prefix in YY-MM-DD format
    v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
    
    -- Create a unique lock key based on the date prefix
    -- This ensures only one transaction can generate an ID for the same date at a time
    -- Using hashtext to convert the prefix to a bigint for the advisory lock
    v_lock_key := hashtext(v_date_prefix);
    
    -- Acquire an advisory lock for this specific date
    -- This prevents race conditions when multiple orders are created simultaneously
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    -- Find the latest sequence number for today
    SELECT readable_id INTO v_last_id
    FROM orders
    WHERE readable_id LIKE v_date_prefix || '-%'
    ORDER BY 
        -- Extract and sort by sequence number numerically
        CAST(SPLIT_PART(readable_id, '-', 4) AS INTEGER) DESC
    LIMIT 1;
    
    IF v_last_id IS NULL THEN
        -- First order of the day, start at 101
        v_new_seq := 101;
    ELSE
        -- Extract the sequence part (4th segment after splitting by '-')
        v_last_seq := CAST(SPLIT_PART(v_last_id, '-', 4) AS INTEGER);
        v_new_seq := v_last_seq + 1;
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
Uses advisory locks to prevent race conditions.';

-- =============================================================================
-- STEP 4: Create Function to Prevent Order ID Updates
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_order_id_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow updates if readable_id is not changing
    IF OLD.readable_id = NEW.readable_id THEN
        RETURN NEW;
    END IF;
    
    -- Allow updates from legacy format to new format (migration scenario)
    IF OLD.readable_id LIKE 'LEGACY-%' OR OLD.readable_id LIKE 'TT-%' THEN
        RETURN NEW;
    END IF;
    
    -- Block any other attempt to change readable_id
    RAISE EXCEPTION 'Order ID (readable_id) is immutable and cannot be changed. Original: %, Attempted: %', 
        OLD.readable_id, NEW.readable_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_order_id_update() IS 
'Prevents modification of readable_id once set, ensuring order ID immutability.
Allows migration from legacy formats (LEGACY-*, TT-*) to new format.';

-- =============================================================================
-- STEP 5: Create Triggers
-- =============================================================================

-- Drop existing triggers if they exist (to allow re-running migration)
DROP TRIGGER IF EXISTS trg_set_order_id ON orders;
DROP TRIGGER IF EXISTS trg_prevent_order_id_update ON orders;

-- Trigger to generate readable_id BEFORE INSERT
CREATE TRIGGER trg_set_order_id
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_smart_order_id();

-- Trigger to prevent readable_id changes BEFORE UPDATE
CREATE TRIGGER trg_prevent_order_id_update
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION prevent_order_id_update();

-- =============================================================================
-- STEP 6: Create Helper Function for Manual ID Generation (Admin Use)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_next_order_id()
RETURNS TEXT AS $$
DECLARE
    v_date_prefix TEXT;
    v_lock_key BIGINT;
    v_last_seq INT;
    v_new_seq INT;
    v_last_id TEXT;
BEGIN
    v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
    v_lock_key := hashtext(v_date_prefix);
    
    PERFORM pg_advisory_xact_lock(v_lock_key);
    
    SELECT readable_id INTO v_last_id
    FROM orders
    WHERE readable_id LIKE v_date_prefix || '-%'
    ORDER BY CAST(SPLIT_PART(readable_id, '-', 4) AS INTEGER) DESC
    LIMIT 1;
    
    IF v_last_id IS NULL THEN
        v_new_seq := 101;
    ELSE
        v_last_seq := CAST(SPLIT_PART(v_last_id, '-', 4) AS INTEGER);
        v_new_seq := v_last_seq + 1;
    END IF;
    
    RETURN v_date_prefix || '-' || v_new_seq::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_order_id() IS 
'Returns the next available order ID without creating an order. 
Useful for preview/display purposes. Note: ID is not reserved.';

-- =============================================================================
-- STEP 7: Create RPC for Frontend to Preview Next Order ID
-- =============================================================================

CREATE OR REPLACE FUNCTION public.preview_next_order_id()
RETURNS JSON AS $$
DECLARE
    v_date_prefix TEXT;
    v_last_id TEXT;
    v_next_seq INT;
    v_preview_id TEXT;
BEGIN
    v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
    
    SELECT readable_id INTO v_last_id
    FROM orders
    WHERE readable_id LIKE v_date_prefix || '-%'
    ORDER BY CAST(SPLIT_PART(readable_id, '-', 4) AS INTEGER) DESC
    LIMIT 1;
    
    IF v_last_id IS NULL THEN
        v_next_seq := 101;
    ELSE
        v_next_seq := CAST(SPLIT_PART(v_last_id, '-', 4) AS INTEGER) + 1;
    END IF;
    
    v_preview_id := v_date_prefix || '-' || v_next_seq::TEXT;
    
    RETURN json_build_object(
        'success', true,
        'preview_id', v_preview_id,
        'date_prefix', v_date_prefix,
        'sequence', v_next_seq,
        'note', 'This is a preview. Actual ID assigned on order creation.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.preview_next_order_id() TO authenticated;

-- =============================================================================
-- STEP 8: Verification Queries (Run manually to verify)
-- =============================================================================

-- Test the function works (commented out - run manually)
-- SELECT get_next_order_id();
-- SELECT preview_next_order_id();

-- View today's orders with new ID format
-- SELECT readable_id, created_at FROM orders 
-- WHERE readable_id LIKE TO_CHAR(CURRENT_DATE, 'YY-MM-DD') || '-%'
-- ORDER BY readable_id;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

COMMIT;

-- Log migration success
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 090_smart_order_id.sql completed successfully';
    RAISE NOTICE '   - Order ID format: YY-MM-DD-SEQ (e.g., 26-01-26-101)';
    RAISE NOTICE '   - Sequence starts at 101 each day';
    RAISE NOTICE '   - Concurrency handled with advisory locks';
    RAISE NOTICE '   - Order IDs are immutable after creation';
END $$;
