-- ============================================================================
-- Migration 099: Force Fix order_activities Permissions
-- ============================================================================
-- Run this in Supabase SQL Editor to fix "permission denied" errors
-- ============================================================================

-- 1. Ensure table exists
CREATE TABLE IF NOT EXISTS order_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT NOT NULL DEFAULT 'System',
  user_role TEXT,
  activity_type TEXT NOT NULL DEFAULT 'system_log',
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. DISABLE RLS completely (for service_role to work)
ALTER TABLE order_activities DISABLE ROW LEVEL SECURITY;

-- 3. Drop ALL existing policies
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname FROM pg_policies WHERE tablename = 'order_activities'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON order_activities', pol.policyname);
  END LOOP;
END $$;

-- 4. Grant ALL permissions to ALL roles
GRANT ALL ON order_activities TO postgres;
GRANT ALL ON order_activities TO authenticated;
GRANT ALL ON order_activities TO anon;
GRANT ALL ON order_activities TO service_role;

-- 5. Re-enable RLS with permissive policies
ALTER TABLE order_activities ENABLE ROW LEVEL SECURITY;

-- 6. Create simple permissive policies
CREATE POLICY "allow_all_select" ON order_activities FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON order_activities FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON order_activities FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON order_activities FOR DELETE USING (true);

-- 7. Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_order_activities_order_id ON order_activities(order_id);
CREATE INDEX IF NOT EXISTS idx_order_activities_created_at ON order_activities(created_at DESC);

-- Done
SELECT 'Migration 099 complete - order_activities permissions fixed' as status;
