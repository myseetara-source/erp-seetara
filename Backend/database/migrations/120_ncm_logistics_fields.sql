-- Migration 120: NCM Logistics Integration Fields
-- Priority: P0 - Add NCM-specific tracking and branch fields
-- Date: 2026-02-03

-- =============================================================================
-- Add NCM-specific columns to orders table
-- =============================================================================

DO $$
BEGIN
    -- courier_tracking_id: Store NCM order_id / tracking number
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_tracking_id') THEN
        ALTER TABLE orders ADD COLUMN courier_tracking_id TEXT;
        RAISE NOTICE 'Added courier_tracking_id column';
    ELSE
        RAISE NOTICE 'courier_tracking_id already exists';
    END IF;
    
    -- courier_branch_name: Destination branch for NCM/other couriers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_branch_name') THEN
        ALTER TABLE orders ADD COLUMN courier_branch_name TEXT;
        RAISE NOTICE 'Added courier_branch_name column';
    ELSE
        RAISE NOTICE 'courier_branch_name already exists';
    END IF;
    
    -- courier_raw_status: Store raw status string from courier API
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_raw_status') THEN
        ALTER TABLE orders ADD COLUMN courier_raw_status TEXT;
        RAISE NOTICE 'Added courier_raw_status column';
    ELSE
        RAISE NOTICE 'courier_raw_status already exists';
    END IF;
    
    -- courier_waybill: AWB/Waybill number from courier
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_waybill') THEN
        ALTER TABLE orders ADD COLUMN courier_waybill TEXT;
        RAISE NOTICE 'Added courier_waybill column';
    ELSE
        RAISE NOTICE 'courier_waybill already exists';
    END IF;
    
    -- destination_branch: Alias for easier use
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'destination_branch') THEN
        ALTER TABLE orders ADD COLUMN destination_branch TEXT;
        RAISE NOTICE 'Added destination_branch column';
    ELSE
        RAISE NOTICE 'destination_branch already exists';
    END IF;
    
    -- handover_at: When order was handed over to courier
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'handover_at') THEN
        ALTER TABLE orders ADD COLUMN handover_at TIMESTAMPTZ;
        RAISE NOTICE 'Added handover_at column';
    ELSE
        RAISE NOTICE 'handover_at already exists';
    END IF;
    
    -- returned_at: When order was returned (RTO)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'returned_at') THEN
        ALTER TABLE orders ADD COLUMN returned_at TIMESTAMPTZ;
        RAISE NOTICE 'Added returned_at column';
    ELSE
        RAISE NOTICE 'returned_at already exists';
    END IF;
END $$;

-- =============================================================================
-- Add unique index on courier_tracking_id (allow NULLs)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_courier_tracking_id 
ON orders (courier_tracking_id) 
WHERE courier_tracking_id IS NOT NULL;

-- =============================================================================
-- Add index for courier partner queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_courier_partner 
ON orders (courier_partner) 
WHERE courier_partner IS NOT NULL;

-- =============================================================================
-- Verify columns
-- =============================================================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN (
    'courier_tracking_id', 
    'courier_branch_name', 
    'courier_raw_status',
    'courier_waybill',
    'destination_branch',
    'handover_at',
    'courier_partner',
    'awb_number'
)
ORDER BY column_name;
