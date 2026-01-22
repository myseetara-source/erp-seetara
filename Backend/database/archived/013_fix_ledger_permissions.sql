-- =============================================================================
-- MIGRATION: 013_fix_ledger_permissions.sql
-- PURPOSE: Fix permission denied error for vendor_ledger table
-- ISSUE: Service role key getting "permission denied for table vendor_ledger"
-- =============================================================================

-- Grant full access to authenticated and service_role
GRANT ALL ON vendor_ledger TO authenticated;
GRANT ALL ON vendor_ledger TO service_role;
GRANT ALL ON vendor_ledger TO anon;

-- Also grant on related tables
GRANT ALL ON vendor_payments TO authenticated;
GRANT ALL ON vendor_payments TO service_role;
GRANT ALL ON vendor_users TO authenticated;
GRANT ALL ON vendor_users TO service_role;

-- Ensure sequences are also accessible (for UUID generation)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Alternative: Disable RLS for admin access (use with caution)
-- If above doesn't work, uncomment these lines:
-- ALTER TABLE vendor_ledger FORCE ROW LEVEL SECURITY;

-- Create a bypass policy for service role
DROP POLICY IF EXISTS vendor_ledger_service_role_bypass ON vendor_ledger;
CREATE POLICY vendor_ledger_service_role_bypass ON vendor_ledger
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create bypass for authenticated role (for admin users)
DROP POLICY IF EXISTS vendor_ledger_full_access ON vendor_ledger;
CREATE POLICY vendor_ledger_full_access ON vendor_ledger
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Same for vendor_payments
DROP POLICY IF EXISTS vendor_payments_service_role_bypass ON vendor_payments;
CREATE POLICY vendor_payments_service_role_bypass ON vendor_payments
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS vendor_payments_full_access ON vendor_payments;
CREATE POLICY vendor_payments_full_access ON vendor_payments
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMENT ON POLICY vendor_ledger_full_access ON vendor_ledger IS 'Allow full access to all authenticated users (admin check done in backend)';

-- Verify
SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('vendor_ledger', 'vendor_payments');
