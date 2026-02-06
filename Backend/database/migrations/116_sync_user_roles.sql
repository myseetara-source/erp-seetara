-- ============================================================================
-- Migration 116: Sync User Roles & Fix Operator Permissions
-- P0 CRITICAL: Fixes 403 errors on packing by syncing roles
-- ============================================================================

-- Update the specific user who has role mismatch
-- User ddd8330b-7c67-4477-9fd4-606f9030224e has app_metadata.role = 'admin' 
-- but public.users.role = 'rider'
UPDATE public.users 
SET role = 'admin', updated_at = NOW()
WHERE id = 'ddd8330b-7c67-4477-9fd4-606f9030224e';

-- Log the change
DO $$
BEGIN
  RAISE NOTICE 'Updated user ddd8330b-7c67-4477-9fd4-606f9030224e role to admin';
END $$;

-- ============================================================================
-- Create a function to sync roles from auth.users app_metadata to public.users
-- This ensures consistency between Supabase Auth and our users table
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_user_role_from_auth()
RETURNS TRIGGER AS $$
DECLARE
  auth_role TEXT;
BEGIN
  -- Get role from auth.users app_metadata
  SELECT raw_app_meta_data->>'role' INTO auth_role
  FROM auth.users
  WHERE id = NEW.id;
  
  -- If auth has a role and it differs from public.users, use auth's role
  IF auth_role IS NOT NULL AND auth_role != '' AND auth_role != NEW.role THEN
    NEW.role := auth_role;
    RAISE NOTICE 'Synced role from auth.users: % -> %', NEW.role, auth_role;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-sync roles on user update/insert
DROP TRIGGER IF EXISTS sync_user_role_trigger ON public.users;
CREATE TRIGGER sync_user_role_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_role_from_auth();

-- ============================================================================
-- RLS Policy Updates for Dispatch Operations
-- Allow admin, manager, AND operator to perform dispatch operations
-- ============================================================================

-- Drop and recreate order update policies to include operator
DO $$
BEGIN
  -- Orders: Allow operators to update order status
  DROP POLICY IF EXISTS orders_update_staff ON orders;
  CREATE POLICY orders_update_staff ON orders
    FOR UPDATE
    USING (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager', 'operator')
    )
    WITH CHECK (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager', 'operator')
    );
  
  RAISE NOTICE 'Created orders_update_staff policy for admin, manager, operator';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create orders_update_staff policy: %', SQLERRM;
END $$;

-- Product variants: Allow operators to update stock
DO $$
BEGIN
  DROP POLICY IF EXISTS product_variants_update_stock ON product_variants;
  CREATE POLICY product_variants_update_stock ON product_variants
    FOR UPDATE
    USING (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager', 'operator')
    )
    WITH CHECK (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager', 'operator')
    );
  
  RAISE NOTICE 'Created product_variants_update_stock policy';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create product_variants_update_stock policy: %', SQLERRM;
END $$;

-- Order activities: Allow operators to insert activity logs
DO $$
BEGIN
  DROP POLICY IF EXISTS order_activities_insert_staff ON order_activities;
  CREATE POLICY order_activities_insert_staff ON order_activities
    FOR INSERT
    WITH CHECK (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager', 'operator')
    );
  
  RAISE NOTICE 'Created order_activities_insert_staff policy';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create order_activities_insert_staff policy: %', SQLERRM;
END $$;

-- Stock movements: Allow operators to insert stock movements
DO $$
BEGIN
  DROP POLICY IF EXISTS stock_movements_insert_staff ON stock_movements;
  CREATE POLICY stock_movements_insert_staff ON stock_movements
    FOR INSERT
    WITH CHECK (
      (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'manager', 'operator')
    );
  
  RAISE NOTICE 'Created stock_movements_insert_staff policy';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create stock_movements_insert_staff policy: %', SQLERRM;
END $$;

-- ============================================================================
-- Verify the user role update
-- ============================================================================
DO $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.users WHERE id = 'ddd8330b-7c67-4477-9fd4-606f9030224e';
  RAISE NOTICE 'User role is now: %', user_role;
END $$;
