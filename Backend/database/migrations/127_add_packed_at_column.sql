-- ============================================================================
-- Migration 127: Add packed_at and packed_by columns to orders table
-- P0 FIX: These columns were referenced in DispatchPacking.controller.js but didn't exist
-- ============================================================================
-- 
-- Run this migration in Supabase SQL Editor:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Paste this entire script
-- 3. Click "Run"
-- ============================================================================

BEGIN;

-- Add packed_at column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'packed_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN packed_at TIMESTAMPTZ;
        COMMENT ON COLUMN orders.packed_at IS 'When the order was packed for dispatch';
        
        RAISE NOTICE '✅ Added packed_at column to orders table';
    ELSE
        RAISE NOTICE 'ℹ️ packed_at column already exists';
    END IF;
END $$;

-- Add packed_by column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'packed_by'
    ) THEN
        ALTER TABLE orders ADD COLUMN packed_by UUID REFERENCES auth.users(id);
        COMMENT ON COLUMN orders.packed_by IS 'User who packed this order';
        
        RAISE NOTICE '✅ Added packed_by column to orders table';
    ELSE
        RAISE NOTICE 'ℹ️ packed_by column already exists';
    END IF;
END $$;

-- Create index for faster filtering by packed date
CREATE INDEX IF NOT EXISTS idx_orders_packed_at 
ON orders (packed_at) 
WHERE packed_at IS NOT NULL;

-- Backfill packed_at for existing packed orders using updated_at
-- Only for orders that are in 'packed' status or beyond
UPDATE orders 
SET packed_at = updated_at 
WHERE packed_at IS NULL 
  AND status IN ('packed', 'assigned', 'out_for_delivery', 'delivered', 'in_transit', 'handover_to_courier');

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run this to verify the migration:
-- 
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_name = 'orders' AND column_name IN ('packed_at', 'packed_by');
-- ============================================================================
