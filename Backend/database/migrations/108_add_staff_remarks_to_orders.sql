-- ============================================================================
-- MIGRATION: Add staff_remarks to orders table
-- VERSION: 108
-- DESCRIPTION: Adds staff_remarks column for quick notes/comments on orders
-- AUTHOR: System
-- ============================================================================

-- Add staff_remarks column to orders table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' 
        AND column_name = 'staff_remarks'
    ) THEN
        ALTER TABLE orders ADD COLUMN staff_remarks TEXT;
        RAISE NOTICE 'Added staff_remarks column to orders table';
    ELSE
        RAISE NOTICE 'staff_remarks column already exists in orders table';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN orders.staff_remarks IS 'Internal staff notes/remarks for order handling and tracking';

-- Create index for searching remarks (optional, useful for filtering)
CREATE INDEX IF NOT EXISTS idx_orders_staff_remarks ON orders USING gin(to_tsvector('english', COALESCE(staff_remarks, '')));
