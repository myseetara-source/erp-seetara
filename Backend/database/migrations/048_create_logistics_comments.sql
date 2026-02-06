-- ============================================================================
-- Migration: 048_create_logistics_comments.sql
-- Description: Create table for 2-way communication with NCM/Gaau Besi
-- Priority: P0 - Logistics Comment Tracking
-- Author: Database Architect
-- Date: 2026-02-04
-- ============================================================================

-- Step 1: Create enum for sender type
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'logistics_sender') THEN
        CREATE TYPE logistics_sender AS ENUM ('ERP_USER', 'LOGISTICS_PROVIDER');
    END IF;
END $$;

-- Step 2: Create logistics_comments table
CREATE TABLE IF NOT EXISTS logistics_comments (
    id SERIAL PRIMARY KEY,
    
    -- Foreign key to orders
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Comment content
    comment TEXT NOT NULL,
    
    -- Sender information
    sender logistics_sender NOT NULL,  -- Who sent it? Us or Them?
    sender_name TEXT,                   -- Optional: Name of person who sent
    
    -- External tracking
    external_id TEXT,                   -- ID from NCM/GBL if available
    provider TEXT,                      -- 'NCM' or 'GBL'
    
    -- Sync status
    is_synced BOOLEAN DEFAULT false,    -- True if successfully sent to API
    sync_error TEXT,                    -- Error message if sync failed
    synced_at TIMESTAMP WITH TIME ZONE, -- When it was synced
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Add indexes for fast fetching
CREATE INDEX IF NOT EXISTS idx_logistics_comments_order 
    ON logistics_comments(order_id);

CREATE INDEX IF NOT EXISTS idx_logistics_comments_created 
    ON logistics_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logistics_comments_unsynced 
    ON logistics_comments(is_synced) 
    WHERE is_synced = false;

-- Step 4: Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_logistics_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_logistics_comments_updated_at ON logistics_comments;
CREATE TRIGGER trigger_logistics_comments_updated_at
    BEFORE UPDATE ON logistics_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_logistics_comments_updated_at();

-- Step 5: Add RLS policies
ALTER TABLE logistics_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view comments for orders they can access
CREATE POLICY "Users can view logistics comments"
    ON logistics_comments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders o 
            WHERE o.id = logistics_comments.order_id
        )
    );

-- Policy: Admin/Staff can insert comments
CREATE POLICY "Staff can insert logistics comments"
    ON logistics_comments FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Admin/Staff can update their own comments (or sync status)
CREATE POLICY "Staff can update logistics comments"
    ON logistics_comments FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- ROLLBACK PLAN (Run manually if needed)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trigger_logistics_comments_updated_at ON logistics_comments;
-- DROP FUNCTION IF EXISTS update_logistics_comments_updated_at();
-- DROP TABLE IF EXISTS logistics_comments;
-- DROP TYPE IF EXISTS logistics_sender;
-- ============================================================================

COMMENT ON TABLE logistics_comments IS 'Stores 2-way communication between ERP and logistics providers (NCM/Gaau Besi)';
COMMENT ON COLUMN logistics_comments.sender IS 'ERP_USER = comment from our team, LOGISTICS_PROVIDER = comment from courier';
COMMENT ON COLUMN logistics_comments.is_synced IS 'True if comment was successfully pushed to logistics provider API';
