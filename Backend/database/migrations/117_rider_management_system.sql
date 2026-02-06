-- ============================================================================
-- Migration 117: Comprehensive Rider Management System
-- ============================================================================
-- This migration adds:
-- 1. rider_returns - Track return handovers from riders
-- 2. return_items - Individual items in each return
-- 3. rider_balance_log - Audit trail for all balance changes
-- 4. Updates to rider_settlements table
-- ============================================================================

-- ============================================================================
-- 1. RIDER RETURNS TABLE
-- Tracks when riders hand over rejected items back to office
-- ============================================================================
CREATE TABLE IF NOT EXISTS rider_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number VARCHAR(50) UNIQUE NOT NULL, -- RET-20260131-001
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  received_by UUID REFERENCES users(id), -- Office staff who received
  
  -- Summary
  total_items INT DEFAULT 0,
  total_orders INT DEFAULT 0,
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'processed', 'cancelled')),
  
  -- Timestamps
  received_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rider_returns
CREATE INDEX IF NOT EXISTS idx_rider_returns_rider_id ON rider_returns(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_returns_status ON rider_returns(status);
CREATE INDEX IF NOT EXISTS idx_rider_returns_created_at ON rider_returns(created_at DESC);

-- ============================================================================
-- 2. RETURN ITEMS TABLE
-- Individual items/orders in each return handover
-- ============================================================================
CREATE TABLE IF NOT EXISTS return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES rider_returns(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  
  -- Item condition on return
  condition VARCHAR(20) DEFAULT 'good' CHECK (condition IN ('good', 'damaged', 'missing', 'partial')),
  
  -- For partial returns or damaged items
  damage_notes TEXT,
  damage_photo_url TEXT,
  
  -- Action taken after receiving
  action_taken VARCHAR(30) CHECK (action_taken IN ('restock', 'resend', 'refund', 'damage_write_off', 'pending')),
  action_notes TEXT,
  action_by UUID REFERENCES users(id),
  action_at TIMESTAMPTZ,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for return_items
CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_id ON return_items(order_id);
CREATE INDEX IF NOT EXISTS idx_return_items_condition ON return_items(condition);

-- ============================================================================
-- 3. RIDER BALANCE LOG TABLE
-- Complete audit trail of all balance changes for each rider
-- ============================================================================
CREATE TABLE IF NOT EXISTS rider_balance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  
  -- Change details
  change_type VARCHAR(30) NOT NULL CHECK (change_type IN (
    'cod_collection',    -- Rider collected COD from customer
    'settlement',        -- Rider settled balance with office
    'adjustment',        -- Manual adjustment by admin
    'reversal',          -- Order reversal/cancellation
    'bonus',             -- Bonus payment
    'deduction'          -- Penalty/deduction
  )),
  
  -- Amounts
  amount DECIMAL(12,2) NOT NULL, -- Positive for collection, negative for settlement
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  
  -- Reference to source
  reference_type VARCHAR(30), -- order, settlement, adjustment
  reference_id UUID, -- order_id, settlement_id, etc.
  reference_number VARCHAR(50), -- Order number or settlement number
  
  -- Tracking
  performed_by UUID REFERENCES users(id),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rider_balance_log
CREATE INDEX IF NOT EXISTS idx_rider_balance_log_rider_id ON rider_balance_log(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_balance_log_change_type ON rider_balance_log(change_type);
CREATE INDEX IF NOT EXISTS idx_rider_balance_log_created_at ON rider_balance_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_balance_log_reference ON rider_balance_log(reference_type, reference_id);

-- ============================================================================
-- 4. UPDATE RIDER_SETTLEMENTS TABLE (if exists, add missing columns)
-- ============================================================================
DO $$ 
BEGIN
  -- Add settlement_number if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_settlements' AND column_name = 'settlement_number') THEN
    ALTER TABLE rider_settlements ADD COLUMN settlement_number VARCHAR(50) UNIQUE;
  END IF;
  
  -- Add payment_method if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_settlements' AND column_name = 'payment_method') THEN
    ALTER TABLE rider_settlements ADD COLUMN payment_method VARCHAR(30) DEFAULT 'cash';
  END IF;
  
  -- Add payment_reference if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_settlements' AND column_name = 'payment_reference') THEN
    ALTER TABLE rider_settlements ADD COLUMN payment_reference VARCHAR(100);
  END IF;
  
  -- Add receipt_url if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_settlements' AND column_name = 'receipt_url') THEN
    ALTER TABLE rider_settlements ADD COLUMN receipt_url TEXT;
  END IF;
  
  -- Add verified_by if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_settlements' AND column_name = 'verified_by') THEN
    ALTER TABLE rider_settlements ADD COLUMN verified_by UUID REFERENCES users(id);
  END IF;
  
  -- Add verified_at if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_settlements' AND column_name = 'verified_at') THEN
    ALTER TABLE rider_settlements ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;
  
  -- Add balance_before if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_settlements' AND column_name = 'balance_before') THEN
    ALTER TABLE rider_settlements ADD COLUMN balance_before DECIMAL(12,2);
  END IF;
  
  -- Add balance_after if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rider_settlements' AND column_name = 'balance_after') THEN
    ALTER TABLE rider_settlements ADD COLUMN balance_after DECIMAL(12,2);
  END IF;
END $$;

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to generate return number
CREATE OR REPLACE FUNCTION generate_return_number()
RETURNS TEXT AS $$
DECLARE
  today_date TEXT;
  seq_num INT;
  new_number TEXT;
BEGIN
  today_date := TO_CHAR(NOW(), 'YYYYMMDD');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(return_number FROM 'RET-[0-9]+-([0-9]+)') AS INT)
  ), 0) + 1 INTO seq_num
  FROM rider_returns
  WHERE return_number LIKE 'RET-' || today_date || '-%';
  
  new_number := 'RET-' || today_date || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate settlement number
CREATE OR REPLACE FUNCTION generate_settlement_number()
RETURNS TEXT AS $$
DECLARE
  today_date TEXT;
  seq_num INT;
  new_number TEXT;
BEGIN
  today_date := TO_CHAR(NOW(), 'YYYYMMDD');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(settlement_number FROM 'STL-[0-9]+-([0-9]+)') AS INT)
  ), 0) + 1 INTO seq_num
  FROM rider_settlements
  WHERE settlement_number LIKE 'STL-' || today_date || '-%';
  
  new_number := 'STL-' || today_date || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. RPC FUNCTIONS FOR SETTLEMENTS
-- ============================================================================

-- Create settlement with balance log
CREATE OR REPLACE FUNCTION create_rider_settlement(
  p_rider_id UUID,
  p_amount DECIMAL(12,2),
  p_payment_method VARCHAR(30),
  p_payment_reference VARCHAR(100) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_rider RECORD;
  v_settlement_id UUID;
  v_settlement_number TEXT;
  v_balance_before DECIMAL(12,2);
  v_balance_after DECIMAL(12,2);
BEGIN
  -- Get rider current balance
  SELECT id, current_cash_balance, rider_code, full_name
  INTO v_rider
  FROM riders
  WHERE id = p_rider_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Rider not found');
  END IF;
  
  -- Validate amount
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  
  IF p_amount > v_rider.current_cash_balance THEN
    RETURN json_build_object('success', false, 'error', 
      'Settlement amount (' || p_amount || ') exceeds balance (' || v_rider.current_cash_balance || ')');
  END IF;
  
  v_balance_before := v_rider.current_cash_balance;
  v_balance_after := v_balance_before - p_amount;
  v_settlement_number := generate_settlement_number();
  
  -- Create settlement record
  INSERT INTO rider_settlements (
    id, settlement_number, rider_id, amount, 
    payment_method, payment_reference,
    balance_before, balance_after,
    status, notes, created_by, created_at
  ) VALUES (
    gen_random_uuid(), v_settlement_number, p_rider_id, p_amount,
    p_payment_method, p_payment_reference,
    v_balance_before, v_balance_after,
    'pending', p_notes, p_created_by, NOW()
  )
  RETURNING id INTO v_settlement_id;
  
  -- Update rider balance
  UPDATE riders
  SET current_cash_balance = v_balance_after,
      updated_at = NOW()
  WHERE id = p_rider_id;
  
  -- Create balance log entry
  INSERT INTO rider_balance_log (
    rider_id, change_type, amount,
    balance_before, balance_after,
    reference_type, reference_id, reference_number,
    performed_by, notes
  ) VALUES (
    p_rider_id, 'settlement', -p_amount,
    v_balance_before, v_balance_after,
    'settlement', v_settlement_id, v_settlement_number,
    p_created_by, p_notes
  );
  
  RETURN json_build_object(
    'success', true,
    'settlement_id', v_settlement_id,
    'settlement_number', v_settlement_number,
    'amount', p_amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'rider_name', v_rider.full_name,
    'rider_code', v_rider.rider_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify settlement (admin approval)
CREATE OR REPLACE FUNCTION verify_rider_settlement(
  p_settlement_id UUID,
  p_verified_by UUID
)
RETURNS JSON AS $$
DECLARE
  v_settlement RECORD;
BEGIN
  SELECT * INTO v_settlement
  FROM rider_settlements
  WHERE id = p_settlement_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Settlement not found');
  END IF;
  
  IF v_settlement.status = 'verified' THEN
    RETURN json_build_object('success', false, 'error', 'Settlement already verified');
  END IF;
  
  UPDATE rider_settlements
  SET status = 'verified',
      verified_by = p_verified_by,
      verified_at = NOW(),
      updated_at = NOW()
  WHERE id = p_settlement_id;
  
  RETURN json_build_object(
    'success', true,
    'settlement_id', p_settlement_id,
    'status', 'verified'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. RPC FUNCTIONS FOR RETURNS
-- ============================================================================

-- Create return handover
CREATE OR REPLACE FUNCTION create_rider_return(
  p_rider_id UUID,
  p_order_ids UUID[],
  p_notes TEXT DEFAULT NULL,
  p_received_by UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_rider RECORD;
  v_return_id UUID;
  v_return_number TEXT;
  v_order_id UUID;
  v_item_count INT := 0;
BEGIN
  -- Get rider
  SELECT id, rider_code, full_name
  INTO v_rider
  FROM riders
  WHERE id = p_rider_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Rider not found');
  END IF;
  
  -- Validate orders exist and are rejected
  IF array_length(p_order_ids, 1) IS NULL OR array_length(p_order_ids, 1) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'No orders provided');
  END IF;
  
  v_return_number := generate_return_number();
  
  -- Create return record
  INSERT INTO rider_returns (
    id, return_number, rider_id, received_by,
    total_items, total_orders, status, notes,
    received_at, created_at
  ) VALUES (
    gen_random_uuid(), v_return_number, p_rider_id, p_received_by,
    array_length(p_order_ids, 1), array_length(p_order_ids, 1),
    'received', p_notes, NOW(), NOW()
  )
  RETURNING id INTO v_return_id;
  
  -- Create return items and update order status
  FOREACH v_order_id IN ARRAY p_order_ids LOOP
    -- Insert return item
    INSERT INTO return_items (
      return_id, order_id, condition, notes
    ) VALUES (
      v_return_id, v_order_id, 'good', NULL
    );
    
    -- Update order status to 'returned'
    UPDATE orders
    SET status = 'returned',
        returned_at = NOW(),
        updated_at = NOW()
    WHERE id = v_order_id
      AND rider_id = p_rider_id
      AND status = 'rejected';
    
    v_item_count := v_item_count + 1;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'return_id', v_return_id,
    'return_number', v_return_number,
    'items_count', v_item_count,
    'rider_name', v_rider.full_name,
    'rider_code', v_rider.rider_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. VIEWS FOR EASY QUERYING
-- ============================================================================

-- Rider overview with pending items and balance
CREATE OR REPLACE VIEW rider_overview AS
SELECT 
  r.id,
  r.rider_code,
  r.full_name,
  r.phone,
  r.status,
  r.is_active,
  r.current_cash_balance,
  r.total_deliveries,
  r.successful_deliveries,
  r.failed_deliveries,
  COALESCE(pending.pending_count, 0) as pending_orders,
  COALESCE(rejected.rejected_count, 0) as rejected_pending_return,
  COALESCE(today_delivered.count, 0) as today_delivered,
  COALESCE(today_collected.amount, 0) as today_collected
FROM riders r
LEFT JOIN (
  SELECT rider_id, COUNT(*) as pending_count
  FROM orders
  WHERE status IN ('assigned', 'out_for_delivery', 'in_transit')
  GROUP BY rider_id
) pending ON r.id = pending.rider_id
LEFT JOIN (
  SELECT rider_id, COUNT(*) as rejected_count
  FROM orders
  WHERE status = 'rejected'
  GROUP BY rider_id
) rejected ON r.id = rejected.rider_id
LEFT JOIN (
  SELECT rider_id, COUNT(*) as count
  FROM orders
  WHERE status = 'delivered'
    AND delivered_at >= CURRENT_DATE
  GROUP BY rider_id
) today_delivered ON r.id = today_delivered.rider_id
LEFT JOIN (
  SELECT rider_id, SUM(amount) as amount
  FROM rider_balance_log
  WHERE change_type = 'cod_collection'
    AND created_at >= CURRENT_DATE
  GROUP BY rider_id
) today_collected ON r.id = today_collected.rider_id
WHERE r.is_active = true;

-- ============================================================================
-- 9. ENABLE RLS
-- ============================================================================

ALTER TABLE rider_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_balance_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow authenticated users (admin check in application)
CREATE POLICY "rider_returns_all_access" ON rider_returns
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "return_items_all_access" ON return_items
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "rider_balance_log_all_access" ON rider_balance_log
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON rider_returns TO authenticated;
GRANT ALL ON return_items TO authenticated;
GRANT ALL ON rider_balance_log TO authenticated;
GRANT EXECUTE ON FUNCTION generate_return_number() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_settlement_number() TO authenticated;
GRANT EXECUTE ON FUNCTION create_rider_settlement TO authenticated;
GRANT EXECUTE ON FUNCTION verify_rider_settlement TO authenticated;
GRANT EXECUTE ON FUNCTION create_rider_return TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
