-- ============================================================================
-- MIGRATION: Add alt_phone to orders table
-- VERSION: 107
-- DESCRIPTION: Adds secondary phone (alt_phone) column to orders table for
--              inline editing of customer details
-- AUTHOR: System
-- ============================================================================

-- Add alt_phone column to orders table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' 
        AND column_name = 'alt_phone'
    ) THEN
        ALTER TABLE orders ADD COLUMN alt_phone VARCHAR(20);
        RAISE NOTICE 'Added alt_phone column to orders table';
    ELSE
        RAISE NOTICE 'alt_phone column already exists in orders table';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN orders.alt_phone IS 'Secondary/Alternative phone number for delivery contact';
