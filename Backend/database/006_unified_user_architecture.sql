-- =============================================================================
-- UNIFIED USER ARCHITECTURE
-- =============================================================================
--
-- Version: 1.0.0
-- Purpose: Single Table Strategy for all user types (Staff, Vendor, Rider)
--
-- THE PROBLEM:
-- We had fragmentation with separate vendor_users and staff in public.users.
-- This makes login logic complex and creates identity confusion.
--
-- THE SOLUTION:
-- Everyone lives in public.users linked to auth.users.
-- vendor_id column determines if a user is a vendor portal user.
--
-- LOGIC:
-- | role     | vendor_id | Description                        |
-- |----------|-----------|------------------------------------ |
-- | admin    | NULL      | Full system access                 |
-- | manager  | NULL      | Most access                        |
-- | operator | NULL      | Order entry, basic operations      |
-- | csr      | NULL      | Customer service                   |
-- | rider    | NULL      | Delivery app access                |
-- | vendor   | UUID      | Vendor portal (linked to vendor)   |
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: ENSURE user_role ENUM HAS ALL VALUES
-- =============================================================================

-- Add missing values to user_role enum
DO $$ 
BEGIN
    -- Add 'csr' if missing
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'csr' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'csr' AFTER 'vendor';
    END IF;
    
    -- Add 'staff' if missing (alias for operator)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'staff' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'staff' AFTER 'operator';
    END IF;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- =============================================================================
-- SECTION 2: UPDATE USERS TABLE
-- =============================================================================

-- Ensure vendor_id column exists with proper FK
ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

-- Add constraint: If role = 'vendor', vendor_id MUST be set
-- (We can't use CHECK constraint across enums easily, so we'll enforce in trigger)

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_vendor_id ON users(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- SECTION 3: TRIGGER TO ENFORCE VENDOR ROLE CONSTRAINT
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_vendor_role_constraint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If role is 'vendor', vendor_id must be set
    IF NEW.role = 'vendor' AND NEW.vendor_id IS NULL THEN
        RAISE EXCEPTION 'Users with role "vendor" must have a vendor_id set';
    END IF;
    
    -- If vendor_id is set, role should be 'vendor'
    IF NEW.vendor_id IS NOT NULL AND NEW.role != 'vendor' THEN
        RAISE EXCEPTION 'Users with vendor_id must have role = "vendor"';
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vendor_role ON users;
CREATE TRIGGER trg_enforce_vendor_role
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION enforce_vendor_role_constraint();

COMMENT ON FUNCTION enforce_vendor_role_constraint IS 'Ensures vendor_id and role are consistent';

-- =============================================================================
-- SECTION 4: VIEW FOR EASY QUERYING
-- =============================================================================

-- Drop and recreate the unified team view
DROP VIEW IF EXISTS team_members_view;

CREATE VIEW team_members_view AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.phone,
    u.role,
    u.avatar_url,
    u.is_active,
    u.last_login,
    u.created_at,
    u.vendor_id,
    v.name AS vendor_name,
    v.company_name AS vendor_company,
    CASE 
        WHEN u.vendor_id IS NOT NULL THEN 'vendor_user'
        WHEN u.role IN ('admin', 'manager') THEN 'admin_staff'
        ELSE 'staff'
    END AS user_category
FROM users u
LEFT JOIN vendors v ON u.vendor_id = v.id
ORDER BY 
    CASE u.role 
        WHEN 'admin' THEN 1 
        WHEN 'manager' THEN 2 
        WHEN 'operator' THEN 3
        WHEN 'csr' THEN 4
        WHEN 'rider' THEN 5
        WHEN 'vendor' THEN 6
        ELSE 7
    END,
    u.created_at DESC;

COMMENT ON VIEW team_members_view IS 'Unified view of all system users with category';

-- =============================================================================
-- SECTION 5: DROP OBSOLETE vendor_users TABLE (IF EXISTS)
-- =============================================================================

-- We don't need a separate vendor_users table anymore
-- All vendor portal users go into public.users with role='vendor' and vendor_id set

-- Check if vendor_users exists and drop it (if no important data)
-- DO $$
-- BEGIN
--     IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_users') THEN
--         DROP TABLE vendor_users;
--     END IF;
-- END $$;

-- =============================================================================
-- SECTION 6: FUNCTION TO CREATE VENDOR PORTAL USER
-- =============================================================================

CREATE OR REPLACE FUNCTION create_vendor_portal_user(
    p_vendor_id UUID,
    p_email VARCHAR(255),
    p_name VARCHAR(255),
    p_password_hash VARCHAR(255) DEFAULT 'managed_by_supabase_auth'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Verify vendor exists
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'Vendor not found: %', p_vendor_id;
    END IF;
    
    -- Check if user already exists for this vendor
    SELECT id INTO v_user_id FROM users WHERE vendor_id = p_vendor_id AND email = p_email;
    IF v_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'User already exists for this vendor with email: %', p_email;
    END IF;
    
    -- Create user
    INSERT INTO users (email, name, role, vendor_id, password_hash, is_active)
    VALUES (p_email, p_name, 'vendor', p_vendor_id, p_password_hash, TRUE)
    RETURNING id INTO v_user_id;
    
    RETURN v_user_id;
END;
$$;

COMMENT ON FUNCTION create_vendor_portal_user IS 'Creates a vendor portal user linked to a vendor';

-- =============================================================================
-- SECTION 7: RLS POLICIES FOR UNIFIED ACCESS
-- =============================================================================

-- Users RLS is already defined, but let's ensure vendor users can only see their own data

-- Vendor can only see their own user record
DROP POLICY IF EXISTS users_vendor_self_select ON users;
CREATE POLICY users_vendor_self_select ON users
    FOR SELECT TO authenticated
    USING (
        id = auth.uid() 
        OR 
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.role IN ('admin', 'manager')
        )
    );

-- =============================================================================
-- SECTION 8: HELPER FUNCTION FOR LOGIN
-- =============================================================================

-- Function to get user details after authentication
CREATE OR REPLACE FUNCTION get_authenticated_user_profile(p_auth_uid UUID)
RETURNS TABLE (
    id UUID,
    email VARCHAR(255),
    name VARCHAR(255),
    role user_role,
    vendor_id UUID,
    vendor_name VARCHAR(255),
    is_active BOOLEAN,
    last_login TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.vendor_id,
        v.name AS vendor_name,
        u.is_active,
        u.last_login
    FROM users u
    LEFT JOIN vendors v ON u.vendor_id = v.id
    WHERE u.id = p_auth_uid;
$$;

COMMENT ON FUNCTION get_authenticated_user_profile IS 'Get user profile after auth - includes vendor details if applicable';

-- =============================================================================
-- DONE!
-- =============================================================================

-- Summary:
-- ✅ Single users table for all user types
-- ✅ vendor_id links vendor portal users to their vendor
-- ✅ Role enforcement trigger (vendor role requires vendor_id)
-- ✅ Unified team_members_view
-- ✅ create_vendor_portal_user function
-- ✅ get_authenticated_user_profile for login flow
-- ✅ Proper RLS policies
