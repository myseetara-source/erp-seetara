-- =============================================================================
-- Migration 071: Fix Leads and Archives Table Permissions
-- =============================================================================
-- 
-- Issue: The leads and archives tables were created without proper GRANT
-- permissions for the Supabase roles (anon, authenticated, service_role)
--
-- This is causing "permission denied for table leads" errors even when using
-- the service_role key
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: GRANT PERMISSIONS ON LEADS TABLE
-- =============================================================================

-- Grant full access to service_role (bypasses RLS)
GRANT ALL ON TABLE leads TO service_role;
GRANT ALL ON TABLE leads TO postgres;

-- Grant access to authenticated users (subject to RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leads TO authenticated;

-- Grant read-only access to anon (subject to RLS)
GRANT SELECT ON TABLE leads TO anon;

-- =============================================================================
-- SECTION 2: GRANT PERMISSIONS ON ARCHIVES TABLE
-- =============================================================================

-- Grant full access to service_role
GRANT ALL ON TABLE archives TO service_role;
GRANT ALL ON TABLE archives TO postgres;

-- Grant access to authenticated users
GRANT SELECT, INSERT ON TABLE archives TO authenticated;

-- Grant read-only access to anon
GRANT SELECT ON TABLE archives TO anon;

-- =============================================================================
-- SECTION 3: RLS POLICIES FOR LEADS
-- =============================================================================

-- Enable RLS on leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (if any)
DROP POLICY IF EXISTS "leads_view_authenticated" ON leads;
DROP POLICY IF EXISTS "leads_insert_authenticated" ON leads;
DROP POLICY IF EXISTS "leads_update_authenticated" ON leads;
DROP POLICY IF EXISTS "leads_delete_admin" ON leads;
DROP POLICY IF EXISTS "leads_access" ON leads;

-- Policy: Authenticated users can view leads
CREATE POLICY "leads_view_authenticated" ON leads
    FOR SELECT TO authenticated
    USING (true);

-- Policy: Authenticated users can insert leads
CREATE POLICY "leads_insert_authenticated" ON leads
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Policy: Authenticated users can update leads
CREATE POLICY "leads_update_authenticated" ON leads
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy: Admins can delete leads
CREATE POLICY "leads_delete_admin" ON leads
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- =============================================================================
-- SECTION 4: RLS POLICIES FOR ARCHIVES
-- =============================================================================

-- Enable RLS on archives
ALTER TABLE archives ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (if any)
DROP POLICY IF EXISTS "archives_view_authenticated" ON archives;
DROP POLICY IF EXISTS "archives_insert_service" ON archives;
DROP POLICY IF EXISTS "archives_access" ON archives;

-- Policy: Authenticated users can view archives
CREATE POLICY "archives_view_authenticated" ON archives
    FOR SELECT TO authenticated
    USING (true);

-- Policy: Staff can insert archives
CREATE POLICY "archives_insert_service" ON archives
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'operator')
        )
    );

COMMIT;

-- Verification
DO $$
DECLARE
    v_leads_grants INTEGER;
    v_archives_grants INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_leads_grants
    FROM information_schema.role_table_grants 
    WHERE table_name = 'leads' AND grantee = 'service_role';
    
    SELECT COUNT(*) INTO v_archives_grants
    FROM information_schema.role_table_grants 
    WHERE table_name = 'archives' AND grantee = 'service_role';
    
    RAISE NOTICE '✅ Leads table grants for service_role: %', v_leads_grants;
    RAISE NOTICE '✅ Archives table grants for service_role: %', v_archives_grants;
END $$;
