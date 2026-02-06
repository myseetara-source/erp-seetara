-- ============================================================================
-- Migration 097: Order Activities Timeline & Parent-Child Linking
-- ============================================================================
-- Purpose: Create order_activities table for comprehensive audit trail
-- 
-- Features:
--   1. Tracks system logs (auto-generated) vs user comments (manual)
--   2. Records WHO made each change (user_id, user_name, role)
--   3. Supports parent-child order relationships for exchanges
--   4. Enables full audit trail for order lifecycle
-- ============================================================================

-- ============================================================================
-- STEP 1: Create order_activities table
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),  -- NULL for System activities
  user_name TEXT NOT NULL DEFAULT 'System',  -- 'System' or actual user name
  user_role TEXT,  -- 'admin', 'operator', 'rider', 'system'
  activity_type TEXT NOT NULL DEFAULT 'system_log',  -- 'status_change', 'comment', 'system_log', 'exchange_link'
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',  -- Extra data (old_status, new_status, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 2: Add parent_order_id column to orders (if not exists)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'parent_order_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN parent_order_id UUID REFERENCES orders(id);
    COMMENT ON COLUMN orders.parent_order_id IS 'Links exchange/refund orders to their original parent order';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_order_activities_order_id ON order_activities(order_id);
CREATE INDEX IF NOT EXISTS idx_order_activities_created_at ON order_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_activities_type ON order_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL;

-- ============================================================================
-- STEP 4: Enable RLS on order_activities
-- ============================================================================
ALTER TABLE order_activities ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read activities for orders they can access
DROP POLICY IF EXISTS "Users can view order activities" ON order_activities;
CREATE POLICY "Users can view order activities"
  ON order_activities FOR SELECT
  TO authenticated
  USING (true);  -- Access controlled by application layer for now

-- Policy: Allow authenticated users to insert activities
DROP POLICY IF EXISTS "Users can insert order activities" ON order_activities;
CREATE POLICY "Users can insert order activities"
  ON order_activities FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- STEP 5: Helper function to log order activities
-- ============================================================================
CREATE OR REPLACE FUNCTION log_order_activity(
  p_order_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_user_name TEXT DEFAULT 'System',
  p_user_role TEXT DEFAULT 'system',
  p_activity_type TEXT DEFAULT 'system_log',
  p_message TEXT DEFAULT '',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO order_activities (
    order_id,
    user_id,
    user_name,
    user_role,
    activity_type,
    message,
    metadata
  ) VALUES (
    p_order_id,
    p_user_id,
    COALESCE(p_user_name, 'System'),
    COALESCE(p_user_role, 'system'),
    COALESCE(p_activity_type, 'system_log'),
    p_message,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 6: Trigger to auto-log order creation
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_log_order_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM log_order_activity(
    NEW.id,
    NULL,
    'System',
    'system',
    'system_log',
    'Order created via ' || COALESCE(NEW.source, 'manual'),
    jsonb_build_object(
      'source', NEW.source,
      'status', NEW.status,
      'fulfillment_type', NEW.fulfillment_type,
      'total_amount', NEW.total_amount
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_created_activity ON orders;
CREATE TRIGGER trg_order_created_activity
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_log_order_created();

-- ============================================================================
-- STEP 7: Trigger to auto-log status changes
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_order_activity(
      NEW.id,
      NULL,
      'System',
      'system',
      'status_change',
      'Status changed from ' || COALESCE(OLD.status, 'none') || ' to ' || NEW.status,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_status_activity ON orders;
CREATE TRIGGER trg_order_status_activity
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_log_order_status_change();

-- ============================================================================
-- STEP 8: View for child orders (exchanges/refunds)
-- ============================================================================
CREATE OR REPLACE VIEW order_children AS
SELECT 
  o.id,
  o.readable_id,
  o.parent_order_id,
  o.total_amount,
  o.status,
  o.created_at,
  CASE 
    WHEN o.total_amount < 0 THEN 'refund'
    WHEN EXISTS (
      SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.quantity < 0
    ) THEN 'exchange'
    ELSE 'addon'
  END AS exchange_type
FROM orders o
WHERE o.parent_order_id IS NOT NULL;

-- ============================================================================
-- STEP 9: Grant permissions
-- ============================================================================
GRANT SELECT, INSERT ON order_activities TO authenticated;
GRANT SELECT ON order_children TO authenticated;
GRANT EXECUTE ON FUNCTION log_order_activity TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 097 complete: order_activities table created with triggers';
  RAISE NOTICE '   - order_activities table for audit trail';
  RAISE NOTICE '   - parent_order_id column for exchange linking';
  RAISE NOTICE '   - Auto-logging triggers for create/status change';
  RAISE NOTICE '   - RLS policies enabled';
END $$;
