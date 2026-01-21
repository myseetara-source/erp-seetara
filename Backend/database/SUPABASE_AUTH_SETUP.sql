-- =============================================================================
-- SUPABASE AUTH SETUP
-- =============================================================================
-- 
-- This script sets up the connection between Supabase Auth (auth.users)
-- and our public.users table.
-- 
-- RUN THIS IN SUPABASE SQL EDITOR
-- =============================================================================

-- =============================================================================
-- STEP 1: Create trigger to sync auth.users with public.users
-- =============================================================================

-- Function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, is_active, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operator'),
    true,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    last_login = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- STEP 2: Create Admin User in Supabase Auth
-- =============================================================================
-- 
-- NOTE: You cannot create users directly in auth.users via SQL.
-- Use one of these methods:
-- 
-- METHOD A: Supabase Dashboard
-- 1. Go to Authentication > Users
-- 2. Click "Add User"
-- 3. Enter: admin@seetara.com / Admin@123456
-- 4. After creation, run the SQL below to set the role
-- 
-- METHOD B: Use the Supabase Management API (from your backend)
-- 
-- METHOD C: Use the signup endpoint (if enabled)
-- =============================================================================

-- After creating user in Supabase Auth dashboard, run this to set admin role:
-- (Replace 'USER_ID_HERE' with the actual UUID from auth.users)

/*
UPDATE public.users 
SET role = 'admin', name = 'System Admin'
WHERE email = 'admin@seetara.com';
*/

-- =============================================================================
-- STEP 3: Verify Setup
-- =============================================================================

-- Check if trigger exists
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

-- Check public.users table
SELECT id, email, name, role, is_active FROM public.users LIMIT 10;

-- =============================================================================
-- STEP 4: RLS Policies for public.users
-- =============================================================================

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Admins can view all users
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update users
DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users" ON public.users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can do everything (for backend)
DROP POLICY IF EXISTS "Service role full access" ON public.users;
CREATE POLICY "Service role full access" ON public.users
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- =============================================================================
-- COMPLETE!
-- =============================================================================
