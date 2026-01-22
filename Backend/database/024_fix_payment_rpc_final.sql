-- =============================================================================
-- MIGRATION: 024_fix_payment_rpc_final.sql
-- PURPOSE: STOP DOUBLE ENTRY PERMANENTLY
-- ROOT CAUSE: RPC function AND trigger BOTH inserting into vendor_ledger
-- SOLUTION: RPC inserts into vendor_payments ONLY, trigger handles the rest
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: DROP AND RECREATE THE RPC FUNCTION (CLEAN VERSION)               ║
-- ║  This function ONLY inserts into vendor_payments                          ║
-- ║  The trigger (trg_after_payment) handles ledger & balance updates         ║
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
BEGIN
    -- =========================================================================
    -- VALIDATION
    -- =========================================================================
    
    -- Validate vendor exists
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = p_vendor_id) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Vendor not found',
            'code', 'VENDOR_NOT_FOUND'
        );
    END IF;

    -- Validate amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Amount must be greater than zero',
            'code', 'INVALID_AMOUNT'
        );
    END IF;

    -- Get current balance for reference
    SELECT COALESCE(balance, 0) INTO v_current_balance 
    FROM vendors WHERE id = p_vendor_id;
    
    -- Generate payment number
    v_payment_no := 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                    LPAD((FLOOR(RANDOM() * 10000))::TEXT, 4, '0');

    -- =========================================================================
    -- INSERT INTO vendor_payments ONLY
    -- =========================================================================
    -- ⚠️ IMPORTANT: We do NOT insert into vendor_ledger here!
    -- The trigger (trg_after_payment) will automatically:
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
        v_current_balance - p_amount,  -- Expected balance after trigger runs
        p_payment_date,
        p_remarks,
        p_remarks,
        p_receipt_url,
        'completed',
        p_created_by
    )
    RETURNING id INTO v_payment_id;

    -- =========================================================================
    -- NO MANUAL LEDGER INSERT!
    -- NO MANUAL BALANCE UPDATE!
    -- TRIGGER HANDLES EVERYTHING!
    -- =========================================================================

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'amount', p_amount,
        'balance_before', v_current_balance,
        'balance_after', v_current_balance - p_amount
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'code', SQLSTATE
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION record_vendor_payment TO authenticated, service_role, anon;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: DELETE ALL DUPLICATE LEDGER ENTRIES                              ║
-- ║  Keep only the FIRST entry (earliest created_at) for each reference_id    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Delete duplicate PAYMENT entries
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

-- Delete duplicate PURCHASE entries (just in case)
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

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: RECALCULATE ALL RUNNING BALANCES                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
    v_vendor RECORD;
    v_entry RECORD;
    v_running_balance DECIMAL;
BEGIN
    FOR v_vendor IN SELECT DISTINCT vendor_id FROM vendor_ledger LOOP
        v_running_balance := 0;
        
        FOR v_entry IN 
            SELECT id, debit, credit 
            FROM vendor_ledger 
            WHERE vendor_id = v_vendor.vendor_id 
            ORDER BY transaction_date ASC, created_at ASC
        LOOP
            v_running_balance := v_running_balance + 
                                 COALESCE(v_entry.debit, 0) - 
                                 COALESCE(v_entry.credit, 0);
            
            UPDATE vendor_ledger 
            SET running_balance = v_running_balance 
            WHERE id = v_entry.id;
        END LOOP;
    END LOOP;
END $$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: SYNC VENDOR TABLE STATS FROM LEDGER                              ║
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
    ), 0),
    
    updated_at = NOW();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 5: FORCE SCHEMA CACHE RELOAD                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 6: VERIFICATION - CHECK FOR DUPLICATES (Should be 0)                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

SELECT 
    'Duplicate Check' as check_type,
    COUNT(*) as duplicate_count
FROM (
    SELECT reference_id, entry_type, COUNT(*) as cnt
    FROM vendor_ledger
    WHERE reference_id IS NOT NULL
    GROUP BY reference_id, entry_type
    HAVING COUNT(*) > 1
) duplicates;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 7: SHOW CORRECTED VENDOR STATS                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

SELECT 
    v.name AS vendor_name,
    v.total_purchases,
    v.total_payments,
    v.balance,
    (SELECT COUNT(*) FROM vendor_ledger WHERE vendor_id = v.id) AS total_ledger_entries,
    (SELECT COUNT(*) FROM vendor_ledger WHERE vendor_id = v.id AND entry_type = 'payment') AS payment_entries
FROM vendors v
ORDER BY v.name;
