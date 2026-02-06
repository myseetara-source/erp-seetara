-- ============================================================================
-- Migration: 121_logistics_status_text.sql
-- Purpose: Add logistics_status column for dynamic courier status display
-- Priority: P0 - Dynamic Courier Status Labels
-- Author: Senior Backend Architect
-- Date: 2026-02-04
-- ============================================================================

-- =============================================================================
-- Add logistics_status column to orders table
-- This stores the exact status text from courier API (e.g., "Pickup Order Created")
-- =============================================================================

DO $$
BEGIN
    -- logistics_status: Store exact status text from courier for display
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'logistics_status') THEN
        ALTER TABLE orders ADD COLUMN logistics_status TEXT;
        RAISE NOTICE 'Added logistics_status column';
    ELSE
        RAISE NOTICE 'logistics_status already exists';
    END IF;
END $$;

-- =============================================================================
-- Create index for faster status-based queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_logistics_status 
ON orders (logistics_status) 
WHERE logistics_status IS NOT NULL;

-- =============================================================================
-- Add comment for documentation
-- =============================================================================

COMMENT ON COLUMN orders.logistics_status IS 'Exact status text from logistics provider API for display (e.g., "Pickup Order Created", "In Transit to BIRATNAGAR")';

-- =============================================================================
-- Sync with courier_raw_status if it has data but logistics_status is empty
-- =============================================================================

UPDATE orders 
SET logistics_status = courier_raw_status 
WHERE logistics_status IS NULL 
  AND courier_raw_status IS NOT NULL;

-- =============================================================================
-- ROLLBACK SCRIPT (Run manually if needed)
-- =============================================================================
-- ALTER TABLE orders DROP COLUMN IF EXISTS logistics_status;
-- DROP INDEX IF EXISTS idx_orders_logistics_status;
