-- =============================================================================
-- MIGRATION: 025_fix_vendors_rls.sql
-- PURPOSE: FIX "Failed to load vendors" - RLS Policy Issue
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: FORCE SCHEMA CACHE RELOAD                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: CHECK AND FIX VENDORS TABLE RLS                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Enable RLS (if not already)
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "vendors_select" ON vendors;
DROP POLICY IF EXISTS "vendors_insert" ON vendors;
DROP POLICY IF EXISTS "vendors_update" ON vendors;
DROP POLICY IF EXISTS "vendors_delete" ON vendors;
DROP POLICY IF EXISTS "vendors_select_authenticated" ON vendors;
DROP POLICY IF EXISTS "vendors_all_authenticated" ON vendors;
DROP POLICY IF EXISTS "Allow authenticated read vendors" ON vendors;
DROP POLICY IF EXISTS "Allow authenticated write vendors" ON vendors;

-- Create simple, permissive policies
CREATE POLICY "vendors_select_all" 
ON vendors FOR SELECT 
TO authenticated, anon, service_role
USING (true);

CREATE POLICY "vendors_insert_all" 
ON vendors FOR INSERT 
TO authenticated, service_role
WITH CHECK (true);

CREATE POLICY "vendors_update_all" 
ON vendors FOR UPDATE 
TO authenticated, service_role
USING (true);

CREATE POLICY "vendors_delete_all" 
ON vendors FOR DELETE 
TO authenticated, service_role
USING (true);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: FIX VENDOR_LEDGER RLS                                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE vendor_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_ledger_select" ON vendor_ledger;
DROP POLICY IF EXISTS "vendor_ledger_insert" ON vendor_ledger;
DROP POLICY IF EXISTS "vendor_ledger_update" ON vendor_ledger;
DROP POLICY IF EXISTS "vendor_ledger_all" ON vendor_ledger;

CREATE POLICY "vendor_ledger_select_all" 
ON vendor_ledger FOR SELECT 
TO authenticated, anon, service_role
USING (true);

CREATE POLICY "vendor_ledger_insert_all" 
ON vendor_ledger FOR INSERT 
TO authenticated, service_role
WITH CHECK (true);

CREATE POLICY "vendor_ledger_update_all" 
ON vendor_ledger FOR UPDATE 
TO authenticated, service_role
USING (true);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: FIX VENDOR_PAYMENTS RLS                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendor_payments_select" ON vendor_payments;
DROP POLICY IF EXISTS "vendor_payments_insert" ON vendor_payments;
DROP POLICY IF EXISTS "vendor_payments_all" ON vendor_payments;

CREATE POLICY "vendor_payments_select_all" 
ON vendor_payments FOR SELECT 
TO authenticated, anon, service_role
USING (true);

CREATE POLICY "vendor_payments_insert_all" 
ON vendor_payments FOR INSERT 
TO authenticated, service_role
WITH CHECK (true);

CREATE POLICY "vendor_payments_update_all" 
ON vendor_payments FOR UPDATE 
TO authenticated, service_role
USING (true);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 5: GRANT PERMISSIONS                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

GRANT ALL ON vendors TO authenticated, service_role;
GRANT SELECT ON vendors TO anon;

GRANT ALL ON vendor_ledger TO authenticated, service_role;
GRANT SELECT ON vendor_ledger TO anon;

GRANT ALL ON vendor_payments TO authenticated, service_role;
GRANT SELECT ON vendor_payments TO anon;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 6: FORCE SCHEMA CACHE RELOAD AGAIN                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 7: VERIFY DATA EXISTS                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

SELECT 
    'Vendors Table' as table_name,
    COUNT(*) as record_count 
FROM vendors

UNION ALL

SELECT 
    'Vendor Ledger' as table_name,
    COUNT(*) as record_count 
FROM vendor_ledger

UNION ALL

SELECT 
    'Vendor Payments' as table_name,
    COUNT(*) as record_count 
FROM vendor_payments;
