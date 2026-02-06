-- ============================================================================
-- Migration: 047_logistics_sync_tracking.sql
-- Purpose: Add logistics sync tracking columns for NCM & Gaau Besi integration
-- Author: Senior Backend Architect
-- Priority: P0 - Outside Valley Order Sync
-- ============================================================================

-- Add logistics sync tracking columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS external_order_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_logistics_synced BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS logistics_response JSONB,
ADD COLUMN IF NOT EXISTS logistics_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS logistics_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20); -- 'D2D' or 'D2B' for NCM

-- Create index for faster lookups on synced orders
CREATE INDEX IF NOT EXISTS idx_orders_external_order_id ON orders(external_order_id) WHERE external_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_logistics_synced ON orders(is_logistics_synced) WHERE is_logistics_synced = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_logistics_provider ON orders(logistics_provider) WHERE logistics_provider IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN orders.external_order_id IS 'External order ID from logistics provider (NCM order_id / GBL order_id)';
COMMENT ON COLUMN orders.is_logistics_synced IS 'Whether order has been successfully synced to logistics provider';
COMMENT ON COLUMN orders.logistics_response IS 'Raw JSON response from logistics provider API for debugging';
COMMENT ON COLUMN orders.logistics_synced_at IS 'Timestamp when order was synced to logistics provider';
COMMENT ON COLUMN orders.logistics_provider IS 'Name of logistics provider (ncm / gaaubesi)';
COMMENT ON COLUMN orders.delivery_type IS 'Delivery type for NCM: D2D (Home Delivery) or D2B (Branch Pickup)';

-- ============================================================================
-- ROLLBACK SCRIPT (Run manually if needed)
-- ============================================================================
-- ALTER TABLE orders 
-- DROP COLUMN IF EXISTS external_order_id,
-- DROP COLUMN IF EXISTS is_logistics_synced,
-- DROP COLUMN IF EXISTS logistics_response,
-- DROP COLUMN IF EXISTS logistics_synced_at,
-- DROP COLUMN IF EXISTS logistics_provider,
-- DROP COLUMN IF EXISTS delivery_type;
-- 
-- DROP INDEX IF EXISTS idx_orders_external_order_id;
-- DROP INDEX IF EXISTS idx_orders_logistics_synced;
-- DROP INDEX IF EXISTS idx_orders_logistics_provider;
