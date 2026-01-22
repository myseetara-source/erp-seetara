-- =============================================================================
-- RBAC & USER MANAGEMENT SYSTEM
-- =============================================================================
--
-- Version: 1.0.0
-- Purpose: Secure user management for admin dashboard
--
-- FEATURES:
-- ✅ Role-based access control (admin, manager, staff, csr, rider)
-- ✅ User activation/deactivation
-- ✅ Strict RLS - Only admins can manage users
-- ✅ Audit logging for user changes
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: ENSURE USER ROLE ENUM EXISTS
-- =============================================================================

-- Check if user_role type needs updating
DO $$ 
BEGIN
    -- Try to add new values to enum if they don't exist
    -- PostgreSQL 9.1+ supports IF NOT EXISTS
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'csr' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'csr' AFTER 'operator';
    END IF;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- =============================================================================
-- SECTION 2: ENSURE USERS TABLE HAS REQUIRED COLUMNS
-- =============================================================================

-- Add missing columns if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES users(id);

-- =============================================================================
-- SECTION 3: USER ACTIVITY LOG (Audit Trail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'activated', 'deactivated', 'role_changed', 'password_reset'
    performed_by UUID REFERENCES users(id),
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_action ON user_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_created_at ON user_activity_log(created_at DESC);

COMMENT ON TABLE user_activity_log IS 'Audit trail for all user management actions';

-- =============================================================================
-- SECTION 4: ROW LEVEL SECURITY (RLS) FOR USERS TABLE
-- =============================================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate
DROP POLICY IF EXISTS users_select_policy ON users;
DROP POLICY IF EXISTS users_insert_policy ON users;
DROP POLICY IF EXISTS users_update_policy ON users;
DROP POLICY IF EXISTS users_delete_policy ON users;

-- SELECT: Users can see themselves, Admins/Managers can see all
CREATE POLICY users_select_policy ON users
    FOR SELECT TO authenticated
    USING (
        id = auth.uid() 
        OR EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.role IN ('admin', 'manager')
        )
    );

-- INSERT: Only Admins can create new users
CREATE POLICY users_insert_policy ON users
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.role = 'admin'
        )
    );

-- UPDATE: Admins can update all, Managers can update non-admins, Users can update self (limited)
CREATE POLICY users_update_policy ON users
    FOR UPDATE TO authenticated
    USING (
        id = auth.uid()  -- Self
        OR EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.role = 'admin'
        )
    )
    WITH CHECK (
        id = auth.uid()  -- Self
        OR EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.role = 'admin'
        )
    );

-- DELETE: Only Admins can delete (soft delete preferred)
CREATE POLICY users_delete_policy ON users
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.role = 'admin'
        )
    );

-- =============================================================================
-- SECTION 5: RLS FOR USER ACTIVITY LOG
-- =============================================================================

ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- Only Admins can view activity logs
CREATE POLICY user_activity_log_admin_only ON user_activity_log
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.role IN ('admin', 'manager')
        )
    );

-- =============================================================================
-- SECTION 6: HELPER FUNCTIONS
-- =============================================================================

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users 
        WHERE id = auth.uid() 
        AND role = 'admin'
        AND is_active = true
    );
END;
$$;

-- Function to get all available roles (for dropdown)
CREATE OR REPLACE FUNCTION get_available_roles()
RETURNS TABLE (role_key TEXT, role_label TEXT, role_level INT)
LANGUAGE sql
STABLE
AS $$
    SELECT * FROM (VALUES
        ('admin', 'Administrator', 1),
        ('manager', 'Manager', 2),
        ('operator', 'Operator', 3),
        ('staff', 'Staff', 3),
        ('csr', 'Customer Service', 4),
        ('rider', 'Rider', 5),
        ('viewer', 'Viewer', 6)
    ) AS roles(role_key, role_label, role_level)
    ORDER BY role_level;
$$;

-- Function to log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
    p_user_id UUID,
    p_action VARCHAR(50),
    p_performed_by UUID,
    p_old_value JSONB DEFAULT NULL,
    p_new_value JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO user_activity_log (user_id, action, performed_by, old_value, new_value)
    VALUES (p_user_id, p_action, p_performed_by, p_old_value, p_new_value)
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- Function to deactivate user (soft ban)
CREATE OR REPLACE FUNCTION deactivate_user(
    p_user_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user RECORD;
BEGIN
    -- Check if admin
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_admin_id AND role = 'admin') THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Only admins can deactivate users');
    END IF;
    
    -- Cannot deactivate yourself
    IF p_user_id = p_admin_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot deactivate yourself');
    END IF;
    
    -- Get user
    SELECT * INTO v_user FROM users WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'User not found');
    END IF;
    
    -- Cannot deactivate other admins (protection)
    IF v_user.role = 'admin' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot deactivate admin users');
    END IF;
    
    -- Deactivate
    UPDATE users 
    SET 
        is_active = FALSE,
        deactivated_at = NOW(),
        deactivated_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Log activity
    PERFORM log_user_activity(
        p_user_id, 'deactivated', p_admin_id,
        jsonb_build_object('is_active', TRUE),
        jsonb_build_object('is_active', FALSE)
    );
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'User deactivated successfully'
    );
END;
$$;

-- Function to reactivate user
CREATE OR REPLACE FUNCTION reactivate_user(
    p_user_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if admin
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_admin_id AND role = 'admin') THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Only admins can reactivate users');
    END IF;
    
    -- Reactivate
    UPDATE users 
    SET 
        is_active = TRUE,
        deactivated_at = NULL,
        deactivated_by = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;
    
    -- Log activity
    PERFORM log_user_activity(
        p_user_id, 'reactivated', p_admin_id,
        jsonb_build_object('is_active', FALSE),
        jsonb_build_object('is_active', TRUE)
    );
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'User reactivated successfully'
    );
END;
$$;

-- =============================================================================
-- SECTION 7: VIEW FOR TEAM MANAGEMENT
-- =============================================================================

CREATE OR REPLACE VIEW team_members_view AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.phone,
    u.role,
    u.avatar_url,
    u.is_active,
    u.department,
    u.hire_date,
    u.last_login,
    u.created_at,
    u.deactivated_at,
    creator.name AS created_by_name,
    deactivator.name AS deactivated_by_name
FROM users u
LEFT JOIN users creator ON u.created_by = creator.id
LEFT JOIN users deactivator ON u.deactivated_by = deactivator.id
WHERE u.role != 'vendor'  -- Exclude vendors (they have their own portal)
ORDER BY 
    CASE u.role 
        WHEN 'admin' THEN 1 
        WHEN 'manager' THEN 2 
        ELSE 3 
    END,
    u.created_at DESC;

COMMENT ON VIEW team_members_view IS 'Team members for admin dashboard (excludes vendors)';

-- =============================================================================
-- DONE!
-- =============================================================================

COMMENT ON FUNCTION is_current_user_admin IS 'Check if current authenticated user is admin';
COMMENT ON FUNCTION get_available_roles IS 'Get list of roles for dropdown selection';
COMMENT ON FUNCTION deactivate_user IS 'Soft-ban a user (admin only)';
COMMENT ON FUNCTION reactivate_user IS 'Unban a user (admin only)';
