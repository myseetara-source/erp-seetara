-- =============================================================================
-- RLS FIX & USER SYNC
-- =============================================================================
--
-- Version: 1.0.0
-- Purpose: Fix circular RLS dependency and sync auth.users to public.users
--
-- RUN THIS IF:
-- - Login fails with "User not found in public.users table"
-- - 500 Internal Server Error on /rest/v1/users query
-- - RLS policies blocking self-read
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: FIX RLS POLICIES (Remove Circular Dependency)
-- =============================================================================

-- Disable RLS first
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on users table
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- All authenticated users can read (they need to login first anyway)
CREATE POLICY users_read_policy ON public.users
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated can insert (for user creation flow)
CREATE POLICY users_insert_policy ON public.users
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- All authenticated can update (controller handles authorization)
CREATE POLICY users_update_policy ON public.users
    FOR UPDATE TO authenticated
    USING (true);

-- All authenticated can delete (controller handles authorization)  
CREATE POLICY users_delete_policy ON public.users
    FOR DELETE TO authenticated
    USING (true);

-- =============================================================================
-- SECTION 2: SYNC AUTH.USERS TO PUBLIC.USERS
-- =============================================================================

-- Insert any auth users that don't exist in public.users
INSERT INTO public.users (id, email, name, role, is_active, password_hash, created_at)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'name', SPLIT_PART(au.email, '@', 1)),
    COALESCE(
        (au.raw_user_meta_data->>'role')::user_role,
        'admin'::user_role
    ),
    TRUE,
    'managed_by_supabase_auth',
    au.created_at
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    is_active = TRUE;

-- =============================================================================
-- SECTION 3: AUTO-SYNC TRIGGER (For Future Users)
-- =============================================================================

-- Create trigger function to auto-sync new auth users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role, password_hash, is_active, created_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
        COALESCE(
            (NEW.raw_user_meta_data->>'role')::user_role,
            'operator'::user_role
        ),
        'managed_by_supabase_auth',
        TRUE,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = COALESCE(public.users.name, EXCLUDED.name);
    
    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_auth_user();

COMMENT ON FUNCTION public.handle_new_auth_user IS 'Auto-sync new auth users to public.users table';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Check sync status
SELECT 
    pu.id,
    pu.email,
    pu.name,
    pu.role,
    pu.is_active,
    CASE WHEN au.id IS NOT NULL THEN '✅ Linked' ELSE '❌ Not Linked' END AS auth_status
FROM public.users pu
LEFT JOIN auth.users au ON pu.id = au.id
ORDER BY pu.created_at DESC;

-- =============================================================================
-- DONE!
-- =============================================================================
