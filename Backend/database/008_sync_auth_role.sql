-- =============================================================================
-- ROLE SYNC BRIDGE: public.users.role → auth.users.raw_app_meta_data
-- =============================================================================
--
-- Version: 1.0.0
-- Purpose: Automatically sync role changes to JWT metadata for instant auth
--
-- ARCHITECTURE:
-- ┌─────────────────┐    Trigger    ┌──────────────────────────┐
-- │  public.users   │ ──────────► │  auth.users              │
-- │  role: 'admin'  │              │  raw_app_meta_data.role  │
-- └─────────────────┘              └──────────────────────────┘
--                                            │
--                                            ▼
--                                   ┌──────────────────┐
--                                   │  JWT Token       │
--                                   │  app_metadata:   │
--                                   │    role: 'admin' │
--                                   └──────────────────┘
--
-- BENEFITS:
-- ✅ No extra DB call after login
-- ✅ No UI flickering
-- ✅ Instant route protection via JWT
-- ✅ Enterprise-grade security
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: THE SYNC FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_current_meta JSONB;
    v_new_meta JSONB;
BEGIN
    -- Get current app_metadata from auth.users
    SELECT raw_app_meta_data INTO v_current_meta
    FROM auth.users
    WHERE id = NEW.id;

    -- If no metadata exists, create empty object
    IF v_current_meta IS NULL THEN
        v_current_meta := '{}'::jsonb;
    END IF;

    -- Merge the new role into existing metadata (preserves other keys)
    v_new_meta := v_current_meta || jsonb_build_object('role', NEW.role::text);

    -- Also sync vendor_id if user is a vendor
    IF NEW.vendor_id IS NOT NULL THEN
        v_new_meta := v_new_meta || jsonb_build_object('vendor_id', NEW.vendor_id::text);
    ELSE
        -- Remove vendor_id if it was previously set
        v_new_meta := v_new_meta - 'vendor_id';
    END IF;

    -- Update auth.users metadata
    UPDATE auth.users
    SET 
        raw_app_meta_data = v_new_meta,
        updated_at = NOW()
    WHERE id = NEW.id;

    -- Log the sync for debugging (optional - can be removed in production)
    RAISE NOTICE 'Role synced for user %: % -> auth.users.raw_app_meta_data', 
        NEW.id, NEW.role;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_role_update IS 
'Syncs public.users.role to auth.users.raw_app_meta_data for JWT-based auth';

-- =============================================================================
-- SECTION 2: THE TRIGGER
-- =============================================================================

-- Drop existing trigger if exists (for idempotent runs)
DROP TRIGGER IF EXISTS on_role_change ON public.users;

-- Create trigger that fires on INSERT or UPDATE of role/vendor_id columns
CREATE TRIGGER on_role_change
    AFTER INSERT OR UPDATE OF role, vendor_id
    ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_role_update();

COMMENT ON TRIGGER on_role_change ON public.users IS 
'Automatically syncs role changes to auth.users for JWT-based authentication';

-- =============================================================================
-- SECTION 3: INITIAL SYNC (Force Update All Existing Users)
-- =============================================================================

-- This query syncs ALL existing users' roles to auth.users metadata
-- Run this ONCE after creating the trigger

DO $$
DECLARE
    r RECORD;
    v_current_meta JSONB;
    v_new_meta JSONB;
    v_sync_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting initial role sync for all users...';
    
    FOR r IN 
        SELECT pu.id, pu.role, pu.vendor_id
        FROM public.users pu
        WHERE EXISTS (SELECT 1 FROM auth.users au WHERE au.id = pu.id)
    LOOP
        -- Get current metadata
        SELECT raw_app_meta_data INTO v_current_meta
        FROM auth.users
        WHERE id = r.id;

        -- Build new metadata
        v_current_meta := COALESCE(v_current_meta, '{}'::jsonb);
        v_new_meta := v_current_meta || jsonb_build_object('role', r.role::text);
        
        IF r.vendor_id IS NOT NULL THEN
            v_new_meta := v_new_meta || jsonb_build_object('vendor_id', r.vendor_id::text);
        END IF;

        -- Update auth.users
        UPDATE auth.users
        SET 
            raw_app_meta_data = v_new_meta,
            updated_at = NOW()
        WHERE id = r.id;

        v_sync_count := v_sync_count + 1;
    END LOOP;

    RAISE NOTICE 'Initial sync complete! % users synced.', v_sync_count;
END;
$$;

-- =============================================================================
-- SECTION 4: VERIFICATION QUERY
-- =============================================================================

-- Run this to verify the sync worked
SELECT 
    pu.id,
    pu.email,
    pu.role AS "public.users.role",
    au.raw_app_meta_data->>'role' AS "auth.users.metadata.role",
    CASE 
        WHEN pu.role::text = au.raw_app_meta_data->>'role' THEN '✅ Synced'
        ELSE '❌ Mismatch'
    END AS sync_status
FROM public.users pu
LEFT JOIN auth.users au ON pu.id = au.id
ORDER BY pu.created_at DESC;

-- =============================================================================
-- SECTION 5: HELPER FUNCTION TO GET ROLE FROM JWT (For RLS)
-- =============================================================================

-- This function can be used in RLS policies to check role from JWT
CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        current_setting('request.jwt.claims', true)::json->>'role',
        (current_setting('request.jwt.claims', true)::json->'app_metadata'->>'role'),
        'anonymous'
    )
$$;

COMMENT ON FUNCTION auth.role IS 
'Extract user role from JWT claims for use in RLS policies';

-- =============================================================================
-- DONE! 
-- =============================================================================
-- 
-- WHAT HAPPENS NOW:
-- 1. Admin updates public.users.role (e.g., staff → admin)
-- 2. Trigger fires and syncs to auth.users.raw_app_meta_data
-- 3. Next time user logs in, JWT contains: app_metadata: { role: 'admin' }
-- 4. Frontend reads role from session.user.app_metadata.role
-- 5. No extra DB call needed! ⚡
--
-- =============================================================================
