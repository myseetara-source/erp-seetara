-- =============================================================================
-- MIGRATION 134: ORDER SOURCE TRACKING (Facebook Pages / Brands)
-- =============================================================================
--
-- PURPOSE: Allow admins to manage "Order Sources" (Facebook Pages / Brands)
-- and link them to orders. The source name is passed to couriers as the
-- Vendor Reference ID to reduce delivery rejections from brand mismatch.
--
-- TABLES:
--   1. order_sources (NEW) - Stores page/brand names with optional Pixel IDs
--   2. orders (ALTER) - Add source_id FK to order_sources
--
-- ROLLBACK: 
--   ALTER TABLE orders DROP COLUMN IF EXISTS source_id;
--   DROP TABLE IF EXISTS order_sources;
-- =============================================================================

-- =============================================================================
-- STEP 1: Create order_sources table
-- =============================================================================

CREATE TABLE IF NOT EXISTS order_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    pixel_id VARCHAR(255),           -- Facebook Pixel ID (future use)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active sources lookup
CREATE INDEX IF NOT EXISTS idx_order_sources_active ON order_sources (is_active) WHERE is_active = TRUE;

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_order_sources_updated_at ON order_sources;
CREATE TRIGGER trg_order_sources_updated_at
    BEFORE UPDATE ON order_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- STEP 2: Add source_id to orders table
-- =============================================================================

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES order_sources(id) ON DELETE SET NULL;

-- Index for filtering orders by source
CREATE INDEX IF NOT EXISTS idx_orders_source_id ON orders (source_id) WHERE source_id IS NOT NULL;

-- =============================================================================
-- STEP 3: Seed default sources
-- =============================================================================

INSERT INTO order_sources (name, is_active) VALUES
    ('Today Trend', TRUE),
    ('Seetara', TRUE)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- STEP 4: GRANT table-level permissions (REQUIRED before RLS)
-- =============================================================================
-- Without these GRANTs, Supabase PostgREST returns "permission denied"
-- even with RLS policies, because table-level access is denied first.

GRANT ALL ON order_sources TO authenticated;
GRANT ALL ON order_sources TO service_role;
GRANT SELECT ON order_sources TO anon;

-- =============================================================================
-- STEP 5: Enable RLS (Row Level Security)
-- =============================================================================

ALTER TABLE order_sources ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read active sources
CREATE POLICY "order_sources_read" ON order_sources
    FOR SELECT TO authenticated
    USING (TRUE);

-- Allow admin/manager to manage sources
CREATE POLICY "order_sources_manage" ON order_sources
    FOR ALL TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
    v_source_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_source_count FROM order_sources;
    
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 134: ORDER SOURCE TRACKING COMPLETE';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Changes:';
    RAISE NOTICE '   1. Created order_sources table';
    RAISE NOTICE '   2. Added source_id column to orders table';
    RAISE NOTICE '   3. Seeded % default sources', v_source_count;
    RAISE NOTICE '';
END $$;
