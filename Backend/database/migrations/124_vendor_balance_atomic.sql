-- ============================================================================
-- Migration: 124_vendor_balance_atomic.sql
-- Description: Atomic vendor balance update to prevent race conditions
-- Priority: P0 - CRITICAL FINANCIAL DATA INTEGRITY
-- ============================================================================
-- 
-- PROBLEM:
-- The current TransactionService.js uses a read-modify-write pattern:
--   1. SELECT balance FROM vendors WHERE id = ?
--   2. newBalance = balance + amount (calculated in JavaScript)
--   3. UPDATE vendors SET balance = newBalance WHERE id = ?
--
-- If two transactions run concurrently, both read the same balance (e.g., 1000),
-- calculate their updates independently, and one overwrites the other's result.
-- Example: Two concurrent +500 purchases result in 1500 instead of 2000.
--
-- SOLUTION:
-- Use a database function with row-level locking (FOR UPDATE) to ensure
-- atomic read-modify-write operations. This guarantees data integrity
-- even under high concurrency.
--
-- ============================================================================

-- Drop existing function if it exists (idempotent)
DROP FUNCTION IF EXISTS update_vendor_balance_atomic(UUID, DECIMAL, TEXT);
DROP FUNCTION IF EXISTS update_vendor_balance_atomic(UUID, DECIMAL, TEXT, DECIMAL, DECIMAL);

-- ============================================================================
-- FUNCTION: update_vendor_balance_atomic
-- 
-- Atomically updates vendor balance with row-level locking.
-- Also updates denormalized stats (total_purchases, total_returns).
--
-- Parameters:
--   p_vendor_id: UUID of the vendor
--   p_amount: Amount to add/subtract (always positive)
--   p_type: Transaction type ('PURCHASE', 'PURCHASE_RETURN', 'PAYMENT')
--   p_total_purchases_delta: Optional delta for total_purchases (default 0)
--   p_total_returns_delta: Optional delta for total_returns (default 0)
--
-- Returns:
--   JSON with success status and new balance
-- ============================================================================
CREATE OR REPLACE FUNCTION update_vendor_balance_atomic(
  p_vendor_id UUID,
  p_amount DECIMAL,
  p_type TEXT,
  p_total_purchases_delta DECIMAL DEFAULT 0,
  p_total_returns_delta DECIMAL DEFAULT 0
) RETURNS JSON AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
  v_vendor_exists BOOLEAN;
BEGIN
  -- Validate input
  IF p_vendor_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'vendor_id is required'
    );
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'amount must be a non-negative number'
    );
  END IF;

  -- Lock the vendor row to prevent concurrent updates
  -- FOR UPDATE acquires a row-level exclusive lock
  SELECT balance INTO v_current_balance
  FROM vendors 
  WHERE id = p_vendor_id 
  FOR UPDATE;

  -- Check if vendor exists
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Vendor not found',
      'vendor_id', p_vendor_id
    );
  END IF;

  -- Initialize balance if NULL
  v_current_balance := COALESCE(v_current_balance, 0);

  -- Calculate new balance based on transaction type
  CASE UPPER(p_type)
    WHEN 'PURCHASE' THEN
      -- Purchase increases vendor balance (we owe them more)
      v_new_balance := v_current_balance + p_amount;
      
      UPDATE vendors 
      SET 
        balance = v_new_balance,
        total_purchases = COALESCE(total_purchases, 0) + COALESCE(p_total_purchases_delta, p_amount),
        updated_at = NOW()
      WHERE id = p_vendor_id;
      
    WHEN 'PURCHASE_RETURN' THEN
      -- Return decreases vendor balance (we owe them less)
      v_new_balance := v_current_balance - p_amount;
      
      UPDATE vendors 
      SET 
        balance = v_new_balance,
        total_returns = COALESCE(total_returns, 0) + COALESCE(p_total_returns_delta, p_amount),
        updated_at = NOW()
      WHERE id = p_vendor_id;
      
    WHEN 'PAYMENT' THEN
      -- Payment decreases vendor balance (we paid off debt)
      v_new_balance := v_current_balance - p_amount;
      
      UPDATE vendors 
      SET 
        balance = v_new_balance,
        total_payments = COALESCE(total_payments, 0) + p_amount,
        updated_at = NOW()
      WHERE id = p_vendor_id;
      
    ELSE
      RETURN json_build_object(
        'success', false,
        'error', 'Invalid transaction type. Must be PURCHASE, PURCHASE_RETURN, or PAYMENT',
        'received_type', p_type
      );
  END CASE;

  -- Return success with balance details
  RETURN json_build_object(
    'success', true,
    'vendor_id', p_vendor_id,
    'transaction_type', UPPER(p_type),
    'amount', p_amount,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log and return error
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_vendor_balance_atomic(UUID, DECIMAL, TEXT, DECIMAL, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION update_vendor_balance_atomic(UUID, DECIMAL, TEXT, DECIMAL, DECIMAL) TO service_role;

-- ============================================================================
-- VERIFICATION COMMENT
-- ============================================================================
COMMENT ON FUNCTION update_vendor_balance_atomic IS 
'Atomically updates vendor balance with row-level locking to prevent race conditions.
Supports PURCHASE (increase balance), PURCHASE_RETURN (decrease balance), and PAYMENT (decrease balance).
Returns JSON with success status and balance details.
Created: Migration 124 - P0 Race Condition Fix';

-- ============================================================================
-- TEST QUERY (Run manually to verify)
-- ============================================================================
-- SELECT update_vendor_balance_atomic(
--   'your-vendor-uuid-here'::uuid,
--   1000.00,
--   'PURCHASE'
-- );
