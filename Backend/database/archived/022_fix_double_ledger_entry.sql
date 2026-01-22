-- =============================================================================
-- MIGRATION: 022_fix_double_ledger_entry.sql
-- PURPOSE: Fix duplicate payment entries in vendor_ledger
-- ROOT CAUSE: Both RPC function AND trigger were inserting into ledger
-- SOLUTION: Let trigger be the SINGLE SOURCE OF TRUTH
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: DELETE DUPLICATE LEDGER ENTRIES                                  ║
-- ║  Keep the FIRST entry (earliest created_at), delete the rest              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Delete duplicate payment entries
DELETE FROM vendor_ledger
WHERE id IN (
    SELECT id FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY reference_id, entry_type 
                ORDER BY created_at ASC
            ) as row_num
        FROM vendor_ledger
        WHERE entry_type = 'payment'
          AND reference_id IS NOT NULL
    ) duplicates
    WHERE duplicates.row_num > 1
);

-- Delete duplicate purchase entries (if any)
DELETE FROM vendor_ledger
WHERE id IN (
    SELECT id FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY reference_id, entry_type 
                ORDER BY created_at ASC
            ) as row_num
        FROM vendor_ledger
        WHERE entry_type = 'purchase'
          AND reference_id IS NOT NULL
    ) duplicates
    WHERE duplicates.row_num > 1
);

-- Delete duplicate return entries (if any)
DELETE FROM vendor_ledger
WHERE id IN (
    SELECT id FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (
                PARTITION BY reference_id, entry_type 
                ORDER BY created_at ASC
            ) as row_num
        FROM vendor_ledger
        WHERE entry_type = 'purchase_return'
          AND reference_id IS NOT NULL
    ) duplicates
    WHERE duplicates.row_num > 1
);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: UPDATE RPC FUNCTION - REMOVE LEDGER INSERT                       ║
-- ║  The trigger will handle ledger entries exclusively                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS record_vendor_payment CASCADE;

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
        RAISE EXCEPTION 'Vendor not found';
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be greater than zero';
    END IF;

    -- Get current balance
    SELECT COALESCE(balance, 0) INTO v_current_balance FROM vendors WHERE id = p_vendor_id;
    v_new_balance := v_current_balance - p_amount;
    
    -- Generate payment number
    v_payment_no := 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 10000))::TEXT, 4, '0');

    -- =========================================================================
    -- ONLY INSERT INTO vendor_payments
    -- The TRIGGER (trg_vendor_payment_to_ledger) will automatically:
    --   1. Insert into vendor_ledger
    --   2. Update vendors.balance
    --   3. Update vendors.total_payments
    -- =========================================================================
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
        p_remarks,
        p_remarks,
        p_receipt_url,
        'completed',
        p_created_by
    )
    RETURNING id INTO v_payment_id;

    -- NO MANUAL LEDGER INSERT HERE - TRIGGER HANDLES IT!

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'amount', p_amount,
        'new_balance', v_new_balance
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'code', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION record_vendor_payment TO authenticated, service_role, anon;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: VERIFY/RECREATE THE TRIGGER (Single Source of Truth)             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Drop and recreate trigger to ensure it's correct
DROP TRIGGER IF EXISTS trg_vendor_payment_to_ledger ON vendor_payments;

CREATE OR REPLACE FUNCTION fn_vendor_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
BEGIN
    -- Get current vendor balance
    SELECT COALESCE(balance, 0) INTO v_current_balance FROM vendors WHERE id = NEW.vendor_id;
    
    -- Calculate new balance (Payment reduces balance)
    v_new_balance := v_current_balance - NEW.amount;
    
    -- Insert into ledger (Payment is a CREDIT - reduces what we owe)
    INSERT INTO vendor_ledger (
        vendor_id,
        entry_type,
        debit,
        credit,
        reference_id,
        reference_no,
        description,
        transaction_date,
        running_balance,
        created_at
    ) VALUES (
        NEW.vendor_id,
        'payment'::vendor_ledger_type,
        0,
        NEW.amount,
        NEW.id,
        NEW.payment_no,
        'Payment: ' || COALESCE(NEW.payment_method, 'cash'),
        COALESCE(NEW.payment_date, CURRENT_DATE),
        v_new_balance,
        NOW()
    );
    
    -- Update vendor stats
    UPDATE vendors SET 
        balance = v_new_balance,
        total_payments = COALESCE(total_payments, 0) + NEW.amount
    WHERE id = NEW.vendor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trg_vendor_payment_to_ledger
    AFTER INSERT ON vendor_payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_vendor_payment_to_ledger();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: RECALCULATE RUNNING BALANCES FOR ALL LEDGER ENTRIES              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION recalculate_all_running_balances()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_vendor RECORD;
    v_entry RECORD;
    v_running_balance DECIMAL := 0;
BEGIN
    FOR v_vendor IN SELECT DISTINCT vendor_id FROM vendor_ledger LOOP
        v_running_balance := 0;
        
        FOR v_entry IN 
            SELECT id, debit, credit 
            FROM vendor_ledger 
            WHERE vendor_id = v_vendor.vendor_id 
            ORDER BY transaction_date ASC, created_at ASC
        LOOP
            v_running_balance := v_running_balance + COALESCE(v_entry.debit, 0) - COALESCE(v_entry.credit, 0);
            
            UPDATE vendor_ledger 
            SET running_balance = v_running_balance 
            WHERE id = v_entry.id;
        END LOOP;
    END LOOP;
END;
$$;

SELECT recalculate_all_running_balances();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 5: RECALCULATE ALL VENDOR STATS FROM LEDGER                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

UPDATE vendors v SET
    total_purchases = COALESCE((
        SELECT SUM(debit) 
        FROM vendor_ledger 
        WHERE vendor_id = v.id AND entry_type = 'purchase'
    ), 0),
    
    total_payments = COALESCE((
        SELECT SUM(credit) 
        FROM vendor_ledger 
        WHERE vendor_id = v.id AND entry_type = 'payment'
    ), 0),
    
    balance = COALESCE((
        SELECT SUM(COALESCE(debit, 0) - COALESCE(credit, 0))
        FROM vendor_ledger 
        WHERE vendor_id = v.id
    ), 0);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 6: FORCE SCHEMA CACHE RELOAD                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 7: VERIFICATION REPORT                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Show duplicate check (should be 0 duplicates now)
SELECT 
    'Duplicate Check' as check_type,
    COUNT(*) as duplicate_count
FROM (
    SELECT 
        reference_id,
        entry_type,
        COUNT(*) as cnt
    FROM vendor_ledger
    WHERE reference_id IS NOT NULL
    GROUP BY reference_id, entry_type
    HAVING COUNT(*) > 1
) duplicates;

-- Show vendor stats
SELECT 
    v.name,
    v.total_purchases,
    v.total_payments,
    v.balance,
    (SELECT COUNT(*) FROM vendor_ledger WHERE vendor_id = v.id) as ledger_entries
FROM vendors v
ORDER BY v.name;
