-- =============================================================================
-- MIGRATION: 018_add_receipt_to_payment_rpc.sql
-- PURPOSE: Update record_vendor_payment RPC to accept receipt_url parameter
-- =============================================================================

-- Drop existing function to recreate with new parameter
DROP FUNCTION IF EXISTS record_vendor_payment CASCADE;

-- Recreate function with receipt_url parameter
CREATE OR REPLACE FUNCTION record_vendor_payment(
    p_vendor_id UUID,
    p_amount DECIMAL,
    p_payment_method VARCHAR DEFAULT 'cash',
    p_payment_date DATE DEFAULT CURRENT_DATE,
    p_transaction_ref VARCHAR DEFAULT NULL,
    p_bank_name VARCHAR DEFAULT NULL,
    p_remarks TEXT DEFAULT NULL,
    p_receipt_url TEXT DEFAULT NULL,  -- NEW: Receipt file URL
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment_id UUID;
    v_payment_no VARCHAR(50);
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
BEGIN
    -- Validate vendor exists
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'Vendor not found';
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Get current balance
    SELECT COALESCE(balance, 0) INTO v_current_balance FROM vendors WHERE id = p_vendor_id;

    -- Warning if overpaying (but allow it)
    IF p_amount > v_current_balance THEN
        -- This creates an advance payment scenario
        RAISE NOTICE 'Payment exceeds current balance. This will create an advance.';
    END IF;

    -- Calculate new balance
    v_new_balance := v_current_balance - p_amount;
    
    -- Generate payment number: PAY-YYYYMMDD-XXXX
    v_payment_no := 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 10000))::TEXT, 4, '0');

    -- Create payment record (compatible with existing vendor_payments schema)
    INSERT INTO vendor_payments (
        vendor_id,
        payment_no,
        amount,
        payment_method,
        reference_number,
        balance_before,
        balance_after,
        payment_date,
        notes,
        receipt_url,  -- NEW: Store receipt URL
        status,
        created_by
    ) VALUES (
        p_vendor_id,
        v_payment_no,
        p_amount,
        p_payment_method,
        p_transaction_ref,
        v_current_balance,
        v_new_balance,
        p_payment_date,
        p_remarks,
        p_receipt_url,  -- NEW: Store receipt URL
        'completed',
        p_created_by
    )
    RETURNING id INTO v_payment_id;

    -- The trigger fn_vendor_payment_to_ledger will automatically:
    -- 1. Insert into vendor_ledger (CREDIT entry)
    -- 2. Update vendors.balance
    -- 3. Update vendors.total_payments

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'amount', p_amount,
        'new_balance', v_new_balance,
        'receipt_url', p_receipt_url
    );

EXCEPTION WHEN OTHERS THEN
    -- Rollback happens automatically
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'code', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION record_vendor_payment IS 'Atomic transaction to record payment with optional receipt upload';

-- Verify function exists
SELECT proname, pronargs 
FROM pg_proc 
WHERE proname = 'record_vendor_payment';
