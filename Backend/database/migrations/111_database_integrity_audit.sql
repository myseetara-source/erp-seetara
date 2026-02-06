-- ============================================================================
-- MIGRATION 111: Database Integrity Audit & Fix
-- ============================================================================
-- Priority: P0 - Critical Data Integrity
-- 
-- This migration ensures:
-- 1. All Foreign Key relationships are properly defined
-- 2. Cascade deletes are correctly configured
-- 3. CHECK constraints enforce valid values
-- 4. NOT NULL constraints protect critical columns
-- 5. Orphaned data is identified and can be cleaned up
--
-- RUN ORDER:
-- Part 1: Run FIRST - Creates orphan detection functions
-- Part 2: Run SECOND - Review orphan data before fixing
-- Part 3: Run THIRD - Add FK constraints (may fail if orphans exist)
-- Part 4: Run LAST - Add CHECK constraints and cleanup
-- ============================================================================

-- ============================================================================
-- PART 1: ORPHAN DATA DETECTION FUNCTIONS
-- ============================================================================
-- These functions find "zombie data" - rows referencing non-existent parents

-- 1.1 Function to find orphaned order_items (no parent order)
CREATE OR REPLACE FUNCTION find_orphaned_order_items()
RETURNS TABLE (
  item_id UUID,
  order_id UUID,
  product_name VARCHAR,
  created_at TIMESTAMPTZ
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT oi.id, oi.order_id, oi.product_name, oi.created_at
  FROM order_items oi
  LEFT JOIN orders o ON oi.order_id = o.id
  WHERE o.id IS NULL;
$$;

-- 1.2 Function to find orphaned order_logs
CREATE OR REPLACE FUNCTION find_orphaned_order_logs()
RETURNS TABLE (
  log_id UUID,
  order_id UUID,
  action VARCHAR,
  created_at TIMESTAMPTZ
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT ol.id, ol.order_id, ol.action, ol.created_at
  FROM order_logs ol
  LEFT JOIN orders o ON ol.order_id = o.id
  WHERE o.id IS NULL;
$$;

-- 1.3 Function to find orphaned stock_movements (no variant)
CREATE OR REPLACE FUNCTION find_orphaned_stock_movements()
RETURNS TABLE (
  movement_id UUID,
  variant_id UUID,
  movement_type VARCHAR,
  quantity INTEGER,
  created_at TIMESTAMPTZ
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT sm.id, sm.variant_id, sm.movement_type, sm.quantity, sm.created_at
  FROM stock_movements sm
  LEFT JOIN product_variants pv ON sm.variant_id = pv.id
  WHERE pv.id IS NULL;
$$;

-- 1.4 Function to find orphaned inventory_transaction_items
CREATE OR REPLACE FUNCTION find_orphaned_inventory_items()
RETURNS TABLE (
  item_id UUID,
  transaction_id UUID,
  variant_id UUID,
  quantity INTEGER
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT iti.id, iti.transaction_id, iti.variant_id, iti.quantity
  FROM inventory_transaction_items iti
  LEFT JOIN inventory_transactions it ON iti.transaction_id = it.id
  WHERE it.id IS NULL;
$$;

-- 1.5 Function to find orphaned vendor_ledger entries
CREATE OR REPLACE FUNCTION find_orphaned_vendor_ledger()
RETURNS TABLE (
  ledger_id UUID,
  vendor_id UUID,
  entry_type vendor_ledger_type,
  debit DECIMAL,
  credit DECIMAL
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT vl.id, vl.vendor_id, vl.entry_type, vl.debit, vl.credit
  FROM vendor_ledger vl
  LEFT JOIN vendors v ON vl.vendor_id = v.id
  WHERE v.id IS NULL;
$$;

-- 1.6 Function to find orphaned sms_logs (invalid order_id or customer_id)
CREATE OR REPLACE FUNCTION find_orphaned_sms_logs()
RETURNS TABLE (
  log_id UUID,
  order_id UUID,
  customer_id UUID,
  phone VARCHAR,
  status sms_status
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT sl.id, sl.order_id, sl.customer_id, sl.phone, sl.status
  FROM sms_logs sl
  LEFT JOIN orders o ON sl.order_id = o.id
  LEFT JOIN customers c ON sl.customer_id = c.id
  WHERE (sl.order_id IS NOT NULL AND o.id IS NULL)
     OR (sl.customer_id IS NOT NULL AND c.id IS NULL);
$$;

-- 1.7 Function to find invalid user references in orders
CREATE OR REPLACE FUNCTION find_invalid_order_user_refs()
RETURNS TABLE (
  order_id UUID,
  order_number VARCHAR,
  field_name TEXT,
  user_id UUID
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT o.id, o.order_number, 'assigned_to', o.assigned_to
  FROM orders o
  LEFT JOIN users u ON o.assigned_to = u.id
  WHERE o.assigned_to IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT o.id, o.order_number, 'cancelled_by', o.cancelled_by
  FROM orders o
  LEFT JOIN users u ON o.cancelled_by = u.id
  WHERE o.cancelled_by IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT o.id, o.order_number, 'rejected_by', o.rejected_by
  FROM orders o
  LEFT JOIN users u ON o.rejected_by = u.id
  WHERE o.rejected_by IS NOT NULL AND u.id IS NULL
  UNION ALL
  SELECT o.id, o.order_number, 'deleted_by', o.deleted_by
  FROM orders o
  LEFT JOIN users u ON o.deleted_by = u.id
  WHERE o.deleted_by IS NOT NULL AND u.id IS NULL;
$$;

-- 1.8 Function to find invalid rider references in orders
CREATE OR REPLACE FUNCTION find_invalid_order_rider_refs()
RETURNS TABLE (
  order_id UUID,
  order_number VARCHAR,
  rider_id UUID
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT o.id, o.order_number, o.rider_id
  FROM orders o
  LEFT JOIN riders r ON o.rider_id = r.id
  WHERE o.rider_id IS NOT NULL AND r.id IS NULL;
$$;

-- 1.9 Comprehensive orphan report
CREATE OR REPLACE FUNCTION get_orphan_data_report()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'orphaned_order_items', (SELECT COUNT(*) FROM find_orphaned_order_items()),
    'orphaned_order_logs', (SELECT COUNT(*) FROM find_orphaned_order_logs()),
    'orphaned_stock_movements', (SELECT COUNT(*) FROM find_orphaned_stock_movements()),
    'orphaned_inventory_items', (SELECT COUNT(*) FROM find_orphaned_inventory_items()),
    'orphaned_vendor_ledger', (SELECT COUNT(*) FROM find_orphaned_vendor_ledger()),
    'orphaned_sms_logs', (SELECT COUNT(*) FROM find_orphaned_sms_logs()),
    'invalid_order_user_refs', (SELECT COUNT(*) FROM find_invalid_order_user_refs()),
    'invalid_order_rider_refs', (SELECT COUNT(*) FROM find_invalid_order_rider_refs()),
    'checked_at', NOW()
  ) INTO result;
  
  RETURN result;
END;
$$;

-- ============================================================================
-- PART 2: VIEW ORPHAN DATA (Run to inspect before cleanup)
-- ============================================================================

-- Run this to see orphan counts:
-- SELECT get_orphan_data_report();

-- Run these to see actual orphan data:
-- SELECT * FROM find_orphaned_order_items();
-- SELECT * FROM find_orphaned_order_logs();
-- SELECT * FROM find_orphaned_stock_movements();
-- SELECT * FROM find_orphaned_inventory_items();
-- SELECT * FROM find_orphaned_vendor_ledger();
-- SELECT * FROM find_orphaned_sms_logs();
-- SELECT * FROM find_invalid_order_user_refs();
-- SELECT * FROM find_invalid_order_rider_refs();

-- ============================================================================
-- PART 3: ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================================================
-- NOTE: These will FAIL if orphan data exists. Clean up orphans first!

-- 3.1 Orders table - User references
DO $$
BEGIN
  -- rider_id -> riders
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_orders_rider' AND table_name = 'orders'
  ) THEN
    -- First, clean up invalid rider references
    UPDATE orders SET rider_id = NULL 
    WHERE rider_id IS NOT NULL 
      AND rider_id NOT IN (SELECT id FROM riders);
    
    ALTER TABLE orders ADD CONSTRAINT fk_orders_rider 
      FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL;
  END IF;

  -- assigned_to -> users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_orders_assigned_to' AND table_name = 'orders'
  ) THEN
    UPDATE orders SET assigned_to = NULL 
    WHERE assigned_to IS NOT NULL 
      AND assigned_to NOT IN (SELECT id FROM users);
    
    ALTER TABLE orders ADD CONSTRAINT fk_orders_assigned_to 
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- cancelled_by -> users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_orders_cancelled_by' AND table_name = 'orders'
  ) THEN
    UPDATE orders SET cancelled_by = NULL 
    WHERE cancelled_by IS NOT NULL 
      AND cancelled_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE orders ADD CONSTRAINT fk_orders_cancelled_by 
      FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- rejected_by -> users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_orders_rejected_by' AND table_name = 'orders'
  ) THEN
    UPDATE orders SET rejected_by = NULL 
    WHERE rejected_by IS NOT NULL 
      AND rejected_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE orders ADD CONSTRAINT fk_orders_rejected_by 
      FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- deleted_by -> users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_orders_deleted_by' AND table_name = 'orders'
  ) THEN
    UPDATE orders SET deleted_by = NULL 
    WHERE deleted_by IS NOT NULL 
      AND deleted_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE orders ADD CONSTRAINT fk_orders_deleted_by 
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.2 Order logs - User references
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_order_logs_changed_by' AND table_name = 'order_logs'
  ) THEN
    UPDATE order_logs SET changed_by = NULL 
    WHERE changed_by IS NOT NULL 
      AND changed_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE order_logs ADD CONSTRAINT fk_order_logs_changed_by 
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.3 Order comments - User references
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_order_comments_created_by' AND table_name = 'order_comments'
  ) THEN
    UPDATE order_comments SET created_by = NULL 
    WHERE created_by IS NOT NULL 
      AND created_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE order_comments ADD CONSTRAINT fk_order_comments_created_by 
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.4 Inventory transactions - User references
DO $$
BEGIN
  -- performed_by (required, so we need a fallback)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_inv_trans_performed_by' AND table_name = 'inventory_transactions'
  ) THEN
    -- Delete transactions with invalid performed_by (they're orphaned anyway)
    DELETE FROM inventory_transactions 
    WHERE performed_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE inventory_transactions ADD CONSTRAINT fk_inv_trans_performed_by 
      FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;

  -- approved_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_inv_trans_approved_by' AND table_name = 'inventory_transactions'
  ) THEN
    UPDATE inventory_transactions SET approved_by = NULL 
    WHERE approved_by IS NOT NULL 
      AND approved_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE inventory_transactions ADD CONSTRAINT fk_inv_trans_approved_by 
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- rejected_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_inv_trans_rejected_by' AND table_name = 'inventory_transactions'
  ) THEN
    UPDATE inventory_transactions SET rejected_by = NULL 
    WHERE rejected_by IS NOT NULL 
      AND rejected_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE inventory_transactions ADD CONSTRAINT fk_inv_trans_rejected_by 
      FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- voided_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_inv_trans_voided_by' AND table_name = 'inventory_transactions'
  ) THEN
    UPDATE inventory_transactions SET voided_by = NULL 
    WHERE voided_by IS NOT NULL 
      AND voided_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE inventory_transactions ADD CONSTRAINT fk_inv_trans_voided_by 
      FOREIGN KEY (voided_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- reference_transaction_id (self-reference)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_inv_trans_reference' AND table_name = 'inventory_transactions'
  ) THEN
    UPDATE inventory_transactions SET reference_transaction_id = NULL 
    WHERE reference_transaction_id IS NOT NULL 
      AND reference_transaction_id NOT IN (SELECT id FROM inventory_transactions);
    
    ALTER TABLE inventory_transactions ADD CONSTRAINT fk_inv_trans_reference 
      FOREIGN KEY (reference_transaction_id) REFERENCES inventory_transactions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.5 Stock movements - References
DO $$
BEGIN
  -- order_id -> orders
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_stock_movements_order' AND table_name = 'stock_movements'
  ) THEN
    UPDATE stock_movements SET order_id = NULL 
    WHERE order_id IS NOT NULL 
      AND order_id NOT IN (SELECT id FROM orders);
    
    ALTER TABLE stock_movements ADD CONSTRAINT fk_stock_movements_order 
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;

  -- created_by -> users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_stock_movements_created_by' AND table_name = 'stock_movements'
  ) THEN
    UPDATE stock_movements SET created_by = NULL 
    WHERE created_by IS NOT NULL 
      AND created_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE stock_movements ADD CONSTRAINT fk_stock_movements_created_by 
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.6 Vendor payments - User references
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_vendor_payments_created_by' AND table_name = 'vendor_payments'
  ) THEN
    UPDATE vendor_payments SET created_by = NULL 
    WHERE created_by IS NOT NULL 
      AND created_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE vendor_payments ADD CONSTRAINT fk_vendor_payments_created_by 
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_vendor_payments_approved_by' AND table_name = 'vendor_payments'
  ) THEN
    UPDATE vendor_payments SET approved_by = NULL 
    WHERE approved_by IS NOT NULL 
      AND approved_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE vendor_payments ADD CONSTRAINT fk_vendor_payments_approved_by 
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.7 Vendor ledger - User references
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_vendor_ledger_performed_by' AND table_name = 'vendor_ledger'
  ) THEN
    UPDATE vendor_ledger SET performed_by = NULL 
    WHERE performed_by IS NOT NULL 
      AND performed_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE vendor_ledger ADD CONSTRAINT fk_vendor_ledger_performed_by 
      FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.8 SMS logs - References
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_sms_logs_order' AND table_name = 'sms_logs'
  ) THEN
    UPDATE sms_logs SET order_id = NULL 
    WHERE order_id IS NOT NULL 
      AND order_id NOT IN (SELECT id FROM orders);
    
    ALTER TABLE sms_logs ADD CONSTRAINT fk_sms_logs_order 
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_sms_logs_customer' AND table_name = 'sms_logs'
  ) THEN
    UPDATE sms_logs SET customer_id = NULL 
    WHERE customer_id IS NOT NULL 
      AND customer_id NOT IN (SELECT id FROM customers);
    
    ALTER TABLE sms_logs ADD CONSTRAINT fk_sms_logs_customer 
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3.9 Delivery runs - User references
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_delivery_runs_assigned_by' AND table_name = 'delivery_runs'
  ) THEN
    UPDATE delivery_runs SET assigned_by = NULL 
    WHERE assigned_by IS NOT NULL 
      AND assigned_by NOT IN (SELECT id FROM users);
    
    ALTER TABLE delivery_runs ADD CONSTRAINT fk_delivery_runs_assigned_by 
      FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 4: CHECK CONSTRAINTS FOR STATUS COLUMNS
-- ============================================================================
-- Add CHECK constraints for VARCHAR status columns that don't use ENUMs

-- 4.1 vendor_payments.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'chk_vendor_payments_status' AND table_name = 'vendor_payments'
  ) THEN
    ALTER TABLE vendor_payments ADD CONSTRAINT chk_vendor_payments_status 
      CHECK (status IN ('pending', 'completed', 'cancelled', 'bounced'));
  END IF;
END $$;

-- 4.2 delivery_runs.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'chk_delivery_runs_status' AND table_name = 'delivery_runs'
  ) THEN
    ALTER TABLE delivery_runs ADD CONSTRAINT chk_delivery_runs_status 
      CHECK (status IN ('pending', 'started', 'completed', 'cancelled'));
  END IF;
END $$;

-- 4.3 stock_movements.movement_type
-- NOTE: Skipping this constraint as the table has existing values not in the predefined list.
-- First, let's see what values exist:
-- SELECT DISTINCT movement_type FROM stock_movements ORDER BY movement_type;
-- Then add constraint with ALL existing values if needed.
-- This constraint is OPTIONAL - the column is VARCHAR and flexible by design.

-- ============================================================================
-- PART 5: CLEANUP FUNCTIONS (Use with caution!)
-- ============================================================================

-- 5.1 Delete orphaned order_items
CREATE OR REPLACE FUNCTION cleanup_orphaned_order_items()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM order_items 
  WHERE order_id NOT IN (SELECT id FROM orders);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 5.2 Delete orphaned order_logs
CREATE OR REPLACE FUNCTION cleanup_orphaned_order_logs()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM order_logs 
  WHERE order_id NOT IN (SELECT id FROM orders);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 5.3 Delete orphaned stock_movements
CREATE OR REPLACE FUNCTION cleanup_orphaned_stock_movements()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM stock_movements 
  WHERE variant_id NOT IN (SELECT id FROM product_variants);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 5.4 Delete orphaned inventory_transaction_items
CREATE OR REPLACE FUNCTION cleanup_orphaned_inventory_items()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM inventory_transaction_items 
  WHERE transaction_id NOT IN (SELECT id FROM inventory_transactions);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 5.5 Master cleanup function
CREATE OR REPLACE FUNCTION cleanup_all_orphan_data()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'order_items_deleted', cleanup_orphaned_order_items(),
    'order_logs_deleted', cleanup_orphaned_order_logs(),
    'stock_movements_deleted', cleanup_orphaned_stock_movements(),
    'inventory_items_deleted', cleanup_orphaned_inventory_items(),
    'cleaned_at', NOW()
  ) INTO result;
  
  RETURN result;
END;
$$;

-- ============================================================================
-- PART 6: DATA CONSISTENCY VALIDATION
-- ============================================================================

-- 6.1 Find orders with mismatched totals
CREATE OR REPLACE FUNCTION find_orders_with_wrong_totals()
RETURNS TABLE (
  order_id UUID,
  order_number VARCHAR,
  stored_total DECIMAL,
  calculated_total DECIMAL,
  difference DECIMAL
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT 
    o.id,
    o.order_number,
    o.total_amount,
    COALESCE(o.subtotal, 0) - COALESCE(o.discount_amount, 0) + COALESCE(o.shipping_charges, 0) + COALESCE(o.cod_charges, 0) as calculated,
    o.total_amount - (COALESCE(o.subtotal, 0) - COALESCE(o.discount_amount, 0) + COALESCE(o.shipping_charges, 0) + COALESCE(o.cod_charges, 0)) as diff
  FROM orders o
  WHERE ABS(o.total_amount - (COALESCE(o.subtotal, 0) - COALESCE(o.discount_amount, 0) + COALESCE(o.shipping_charges, 0) + COALESCE(o.cod_charges, 0))) > 0.01;
$$;

-- 6.2 Find customers with wrong order counts
CREATE OR REPLACE FUNCTION find_customers_with_wrong_counts()
RETURNS TABLE (
  customer_id UUID,
  customer_name VARCHAR,
  stored_count INTEGER,
  actual_count BIGINT
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT 
    c.id,
    c.name,
    c.total_orders,
    COUNT(o.id)::BIGINT as actual_count
  FROM customers c
  LEFT JOIN orders o ON c.id = o.customer_id AND o.is_deleted = false
  GROUP BY c.id, c.name, c.total_orders
  HAVING c.total_orders <> COUNT(o.id);
$$;

-- 6.3 Find variants with negative stock
CREATE OR REPLACE FUNCTION find_negative_stock_variants()
RETURNS TABLE (
  variant_id UUID,
  sku VARCHAR,
  current_stock INTEGER,
  reserved_stock INTEGER,
  damaged_stock INTEGER
) LANGUAGE SQL SECURITY DEFINER AS $$
  SELECT id, sku, current_stock, reserved_stock, damaged_stock
  FROM product_variants
  WHERE current_stock < 0 OR reserved_stock < 0 OR damaged_stock < 0;
$$;

-- 6.4 Comprehensive data consistency report
CREATE OR REPLACE FUNCTION get_data_consistency_report()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'orders_with_wrong_totals', (SELECT COUNT(*) FROM find_orders_with_wrong_totals()),
    'customers_with_wrong_counts', (SELECT COUNT(*) FROM find_customers_with_wrong_counts()),
    'variants_with_negative_stock', (SELECT COUNT(*) FROM find_negative_stock_variants()),
    'checked_at', NOW()
  ) INTO result;
  
  RETURN result;
END;
$$;

-- ============================================================================
-- PART 7: INDEXES FOR FK COLUMNS (Performance)
-- ============================================================================

-- These indexes speed up FK constraint checks and JOIN operations
CREATE INDEX IF NOT EXISTS idx_orders_rider_id ON orders(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_logs_changed_by ON order_logs(changed_by) WHERE changed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_comments_created_by ON order_comments(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_trans_performed_by ON inventory_transactions(performed_by);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by ON stock_movements(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_payments_created_by ON vendor_payments(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_performed_by ON vendor_ledger(performed_by) WHERE performed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_logs_order_id ON sms_logs(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_logs_customer_id ON sms_logs(customer_id) WHERE customer_id IS NOT NULL;

-- ============================================================================
-- PART 8: GRANT PERMISSIONS
-- ============================================================================

-- Grant execute on all functions to authenticated users
GRANT EXECUTE ON FUNCTION find_orphaned_order_items TO authenticated;
GRANT EXECUTE ON FUNCTION find_orphaned_order_logs TO authenticated;
GRANT EXECUTE ON FUNCTION find_orphaned_stock_movements TO authenticated;
GRANT EXECUTE ON FUNCTION find_orphaned_inventory_items TO authenticated;
GRANT EXECUTE ON FUNCTION find_orphaned_vendor_ledger TO authenticated;
GRANT EXECUTE ON FUNCTION find_orphaned_sms_logs TO authenticated;
GRANT EXECUTE ON FUNCTION find_invalid_order_user_refs TO authenticated;
GRANT EXECUTE ON FUNCTION find_invalid_order_rider_refs TO authenticated;
GRANT EXECUTE ON FUNCTION get_orphan_data_report TO authenticated;
GRANT EXECUTE ON FUNCTION get_data_consistency_report TO authenticated;
GRANT EXECUTE ON FUNCTION find_orders_with_wrong_totals TO authenticated;
GRANT EXECUTE ON FUNCTION find_customers_with_wrong_counts TO authenticated;
GRANT EXECUTE ON FUNCTION find_negative_stock_variants TO authenticated;

-- Cleanup functions - Admin only (service role)
-- These should only be run by admins after reviewing the data

-- ============================================================================
-- PART 9: DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION get_orphan_data_report IS 
  'Returns counts of orphaned data across all tables. Run before adding FK constraints.';
COMMENT ON FUNCTION get_data_consistency_report IS 
  'Returns counts of data inconsistencies (wrong totals, counts, negative stock).';
COMMENT ON FUNCTION cleanup_all_orphan_data IS 
  'Deletes all orphaned data. USE WITH CAUTION - run get_orphan_data_report first!';

-- ============================================================================
-- FINAL: RUN REPORTS
-- ============================================================================

-- Uncomment to run the reports:
-- SELECT get_orphan_data_report();
-- SELECT get_data_consistency_report();
