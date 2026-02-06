-- ============================================================================
-- Migration: 049_fix_logistics_comments_permissions.sql
-- Description: Fix RLS permissions for logistics_comments table
-- Priority: P0 - Critical Fix
-- Date: 2026-02-04
-- ============================================================================

-- Step 1: Grant table permissions
GRANT ALL ON logistics_comments TO authenticated;
GRANT ALL ON logistics_comments TO service_role;
GRANT ALL ON logistics_comments TO anon;

-- Step 2: Grant sequence permissions (for auto-increment ID)
GRANT USAGE, SELECT ON SEQUENCE logistics_comments_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE logistics_comments_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE logistics_comments_id_seq TO anon;

-- Step 3: Drop old restrictive policies
DROP POLICY IF EXISTS "Users can view logistics comments" ON logistics_comments;
DROP POLICY IF EXISTS "Staff can insert logistics comments" ON logistics_comments;
DROP POLICY IF EXISTS "Staff can update logistics comments" ON logistics_comments;

-- Step 4: Create permissive policies
-- SELECT policy
CREATE POLICY "logistics_comments_select_policy"
    ON logistics_comments FOR SELECT
    TO authenticated
    USING (true);

-- INSERT policy
CREATE POLICY "logistics_comments_insert_policy"
    ON logistics_comments FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE policy
CREATE POLICY "logistics_comments_update_policy"
    ON logistics_comments FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- DELETE policy (optional, for cleanup)
CREATE POLICY "logistics_comments_delete_policy"
    ON logistics_comments FOR DELETE
    TO authenticated
    USING (true);

-- Step 5: Verify RLS is enabled
ALTER TABLE logistics_comments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- VERIFICATION QUERY (Run after migration)
-- ============================================================================
-- SELECT * FROM logistics_comments LIMIT 1;
-- ============================================================================
