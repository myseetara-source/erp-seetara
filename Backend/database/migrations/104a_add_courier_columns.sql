-- Migration 104a: Add courier columns to orders table
-- Run this FIRST before the main logistics migration

-- Add columns one by one (safer approach)
DO $$
BEGIN
    -- courier_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_id') THEN
        ALTER TABLE orders ADD COLUMN courier_id UUID;
        RAISE NOTICE 'Added courier_id column';
    ELSE
        RAISE NOTICE 'courier_id already exists';
    END IF;
    
    -- courier_manifest_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_manifest_id') THEN
        ALTER TABLE orders ADD COLUMN courier_manifest_id UUID;
        RAISE NOTICE 'Added courier_manifest_id column';
    ELSE
        RAISE NOTICE 'courier_manifest_id already exists';
    END IF;
    
    -- tracking_number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'tracking_number') THEN
        ALTER TABLE orders ADD COLUMN tracking_number TEXT;
        RAISE NOTICE 'Added tracking_number column';
    ELSE
        RAISE NOTICE 'tracking_number already exists';
    END IF;
    
    -- handed_over_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'handed_over_at') THEN
        ALTER TABLE orders ADD COLUMN handed_over_at TIMESTAMPTZ;
        RAISE NOTICE 'Added handed_over_at column';
    ELSE
        RAISE NOTICE 'handed_over_at already exists';
    END IF;
    
    -- expected_delivery_date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'expected_delivery_date') THEN
        ALTER TABLE orders ADD COLUMN expected_delivery_date DATE;
        RAISE NOTICE 'Added expected_delivery_date column';
    ELSE
        RAISE NOTICE 'expected_delivery_date already exists';
    END IF;
    
    -- courier_status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_status') THEN
        ALTER TABLE orders ADD COLUMN courier_status TEXT;
        RAISE NOTICE 'Added courier_status column';
    ELSE
        RAISE NOTICE 'courier_status already exists';
    END IF;
END $$;

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('courier_id', 'courier_manifest_id', 'tracking_number', 'handed_over_at', 'expected_delivery_date', 'courier_status');
