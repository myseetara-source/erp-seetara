-- ============================================================================
-- Migration 098: Fix order_activities RLS permissions
-- ============================================================================
-- Purpose: Ensure order_activities table has correct permissions
-- ============================================================================

-- First, ensure RLS is enabled
ALTER TABLE order_activities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view order activities" ON order_activities;
DROP POLICY IF EXISTS "Users can insert order activities" ON order_activities;
DROP POLICY IF EXISTS "order_activities_select_policy" ON order_activities;
DROP POLICY IF EXISTS "order_activities_insert_policy" ON order_activities;

-- Create permissive SELECT policy for all authenticated users
CREATE POLICY "order_activities_select_policy"
  ON order_activities FOR SELECT
  TO authenticated
  USING (true);

-- Create permissive INSERT policy for all authenticated users
CREATE POLICY "order_activities_insert_policy"
  ON order_activities FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Grant explicit permissions
GRANT SELECT, INSERT ON order_activities TO authenticated;
GRANT SELECT ON order_activities TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Also grant on the view
GRANT SELECT ON order_children TO authenticated;
GRANT SELECT ON order_children TO anon;

-- Ensure the function has proper permissions
GRANT EXECUTE ON FUNCTION log_order_activity TO authenticated;
GRANT EXECUTE ON FUNCTION log_order_activity TO anon;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 098 complete: order_activities RLS fixed';
END $$;
