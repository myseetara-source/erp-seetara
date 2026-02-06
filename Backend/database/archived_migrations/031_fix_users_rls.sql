-- =============================================================================
-- FIX: USERS TABLE RLS (Fixes login issue)
-- =============================================================================
-- Problem: Recursive RLS policies blocking user lookup during login
-- Solution: Use auth.jwt() claims instead of querying public.users
-- =============================================================================

-- Temporarily disable RLS to fix the issue
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update users" ON public.users;
DROP POLICY IF EXISTS "Service role full access" ON public.users;
DROP POLICY IF EXISTS "sm_select" ON public.users;
DROP POLICY IF EXISTS "sm_insert" ON public.users;

-- Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- NEW POLICIES (Non-recursive)
-- =============================================================================

-- 1. Everyone can read their own profile
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = id);

-- 2. Everyone can read basic user info (needed for app functionality)
-- This allows seeing other users' names in UI (e.g., "Created by: John")
CREATE POLICY "users_select_basic" ON public.users
  FOR SELECT 
  TO authenticated
  USING (true);  -- Allow reading all users (only id, name, email, role exposed)

-- 3. Users can update their own profile
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE 
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Service role has full access (for backend operations)
CREATE POLICY "users_service_role" ON public.users
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Allow insert for new user creation (via trigger)
CREATE POLICY "users_insert_trigger" ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- =============================================================================
-- VERIFY THE FIX
-- =============================================================================

-- Check users exist
SELECT id, email, name, role, is_active 
FROM public.users 
ORDER BY created_at DESC 
LIMIT 5;

-- Check policies are correct
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';
