-- =============================================================================
-- MIGRATION: 019_fix_payment_schema_and_rpc.sql
-- PURPOSE: Fix PGRST202/PGRST204 errors - Schema Cache & RPC Signature Mismatch
-- RUN THIS IN SUPABASE SQL EDITOR IMMEDIATELY
-- =============================================================================

-- Step 1: Ensure receipt_url column exists in vendor_payments
ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Step 2: Drop ALL versions of the function to prevent signature conflicts
DROP FUNCTION IF EXISTS record_vendor_payment(UUID, DECIMAL, VARCHAR, DATE, VARCHAR, VARCHAR, TEXT, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS record_vendor_payment(UUID, DECIMAL, VARCHAR, DATE, VARCHAR, VARCHAR, UUID) CASCADE;
DROP FUNCTION IF EXISTS record_vendor_payment(UUID, DECIMAL) CASCADE;
DROP FUNCTION IF EXISTS record_vendor_payment CASCADE;

-- Step 3: Recreate the function with the EXACT signature frontend expects
CREATE OR REPLACE FUNCTION record_vendor_payment(
    p_vendor_id UUID,
    p_amount DECIMAL,
    p_payment_method VARCHAR DEFAULT 'cash',
    p_payment_date DATE DEFAULT CURRENT_DATE,
    p_transaction_ref VARCHAR DEFAULT NULL,
    p_bank_name VARCHAR DEFAULT NULL,
    p_remarks TEXT DEFAULT NULL,
    p_receipt_url TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment_id UUID;
    v_payment_no VARCHAR(50);
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
BEGIN
    -- Validate vendor exists
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'Vendor not found: %', p_vendor_id;
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Get current balance
    SELECT COALESCE(balance, 0) INTO v_current_balance 
    FROM vendors 
    WHERE id = p_vendor_id;

    -- Calculate new balance
    v_new_balance := v_current_balance - p_amount;
    
    -- Generate payment number: PAY-YYYYMMDD-XXXX
    v_payment_no := 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 10000))::TEXT, 4, '0');

    -- Create payment record
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
        remarks,
        receipt_url,
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
        p_remarks,  -- Store in notes field too for compatibility
        p_remarks,  -- Store in remarks field
        p_receipt_url,
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
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'code', SQLSTATE
    );
END;
$$;

-- Step 4: Grant execute permissions
GRANT EXECUTE ON FUNCTION record_vendor_payment TO authenticated;
GRANT EXECUTE ON FUNCTION record_vendor_payment TO service_role;
GRANT EXECUTE ON FUNCTION record_vendor_payment TO anon;

-- Step 5: Add comment for documentation
COMMENT ON FUNCTION record_vendor_payment IS 'Atomic transaction to record vendor payment with optional receipt upload. Updated 2026-01-22.';

-- Step 6: Force Supabase schema cache reload
NOTIFY pgrst, 'reload schema';

-- Step 7: Verify function signature
DO $$
BEGIN
    RAISE NOTICE '✅ Function record_vendor_payment recreated successfully';
    RAISE NOTICE '📋 Expected parameters: p_vendor_id, p_amount, p_payment_method, p_payment_date, p_transaction_ref, p_bank_name, p_remarks, p_receipt_url, p_created_by';
END $$;

-- Step 8: Test the function exists with correct signature
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'record_vendor_payment'
AND n.nspname = 'public';
