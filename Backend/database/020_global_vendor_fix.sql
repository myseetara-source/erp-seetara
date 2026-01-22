-- =============================================================================
-- MIGRATION: 020_global_vendor_fix.sql
-- PURPOSE: CRITICAL - Global Vendor Data Integrity Repair
-- RUN THIS IN SUPABASE SQL EDITOR IMMEDIATELY
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: FORCE SCHEMA CACHE RELOAD (Beginning)                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: ENSURE ALL REQUIRED COLUMNS EXIST                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Add missing columns to vendor_payments
ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Ensure vendors has stat columns
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS total_purchases DECIMAL(15,2) DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS total_payments DECIMAL(15,2) DEFAULT 0;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: BACKFILL MISSING PAYMENT ENTRIES INTO LEDGER                     ║
-- ║  vendor_ledger uses: debit/credit, reference_no                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Insert missing payments into vendor_ledger (Payments are CREDITS)
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
)
SELECT 
    vp.vendor_id,
    'payment'::vendor_ledger_type as entry_type,
    0 as debit,
    vp.amount as credit,
    vp.id as reference_id,
    vp.payment_no as reference_no,
    COALESCE('Payment: ' || vp.payment_method, 'Payment') as description,
    COALESCE(vp.payment_date, vp.created_at::date) as transaction_date,
    0 as running_balance,
    COALESCE(vp.created_at, NOW()) as created_at
FROM vendor_payments vp
WHERE vp.id NOT IN (
    SELECT reference_id FROM vendor_ledger WHERE entry_type = 'payment' AND reference_id IS NOT NULL
)
ON CONFLICT DO NOTHING;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: BACKFILL MISSING PURCHASE ENTRIES FROM INVENTORY_TRANSACTIONS    ║
-- ║  inventory_transactions uses: invoice_no, total_cost, total_quantity      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Insert missing purchases (Purchases are DEBITS)
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
)
SELECT 
    it.vendor_id,
    'purchase'::vendor_ledger_type as entry_type,
    COALESCE(it.total_cost, 0) as debit,
    0 as credit,
    it.id as reference_id,
    it.invoice_no as reference_no,
    'Purchase: ' || it.invoice_no as description,
    COALESCE(it.transaction_date, it.created_at::date) as transaction_date,
    0 as running_balance,
    COALESCE(it.created_at, NOW()) as created_at
FROM inventory_transactions it
WHERE it.transaction_type = 'purchase'
  AND it.vendor_id IS NOT NULL
  AND it.total_cost > 0
  AND it.id NOT IN (
    SELECT reference_id FROM vendor_ledger WHERE entry_type = 'purchase' AND reference_id IS NOT NULL
  )
ON CONFLICT DO NOTHING;

-- Insert missing returns (Returns are CREDITS)
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
)
SELECT 
    it.vendor_id,
    'purchase_return'::vendor_ledger_type as entry_type,
    0 as debit,
    COALESCE(it.total_cost, 0) as credit,
    it.id as reference_id,
    it.invoice_no as reference_no,
    'Return: ' || it.invoice_no as description,
    COALESCE(it.transaction_date, it.created_at::date) as transaction_date,
    0 as running_balance,
    COALESCE(it.created_at, NOW()) as created_at
FROM inventory_transactions it
WHERE it.transaction_type = 'purchase_return'
  AND it.vendor_id IS NOT NULL
  AND it.total_cost > 0
  AND it.id NOT IN (
    SELECT reference_id FROM vendor_ledger WHERE entry_type = 'purchase_return' AND reference_id IS NOT NULL
  )
ON CONFLICT DO NOTHING;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 5: RECALCULATE RUNNING BALANCES FOR ALL LEDGER ENTRIES              ║
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
-- ║  STEP 6: GLOBAL VENDOR STATS RECALCULATION                                ║
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
-- ║  STEP 7: RECREATE PAYMENT RPC WITH CORRECT SIGNATURE                      ║
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
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'Vendor not found';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be greater than zero';
    END IF;

    SELECT COALESCE(balance, 0) INTO v_current_balance FROM vendors WHERE id = p_vendor_id;
    v_new_balance := v_current_balance - p_amount;
    v_payment_no := 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 10000))::TEXT, 4, '0');

    INSERT INTO vendor_payments (
        vendor_id, payment_no, amount, payment_method, reference_number,
        balance_before, balance_after, payment_date, notes, remarks, receipt_url, status, created_by
    ) VALUES (
        p_vendor_id, v_payment_no, p_amount, p_payment_method, p_transaction_ref,
        v_current_balance, v_new_balance, p_payment_date, p_remarks, p_remarks, p_receipt_url, 'completed', p_created_by
    )
    RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'amount', p_amount,
        'new_balance', v_new_balance
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION record_vendor_payment TO authenticated, service_role, anon;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 8: ENSURE TRIGGERS EXIST FOR FUTURE DATA                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_vendor_payment_to_ledger ON vendor_payments;

CREATE OR REPLACE FUNCTION fn_vendor_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
BEGIN
    SELECT COALESCE(balance, 0) INTO v_current_balance FROM vendors WHERE id = NEW.vendor_id;
    v_new_balance := v_current_balance - NEW.amount;
    
    INSERT INTO vendor_ledger (
        vendor_id, entry_type, debit, credit, reference_id, reference_no,
        description, transaction_date, running_balance, created_at
    ) VALUES (
        NEW.vendor_id, 'payment'::vendor_ledger_type, 0, NEW.amount, NEW.id, NEW.payment_no,
        'Payment: ' || COALESCE(NEW.payment_method, 'cash'),
        COALESCE(NEW.payment_date, CURRENT_DATE), v_new_balance, NOW()
    );
    
    UPDATE vendors SET 
        balance = v_new_balance,
        total_payments = COALESCE(total_payments, 0) + NEW.amount
    WHERE id = NEW.vendor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendor_payment_to_ledger
    AFTER INSERT ON vendor_payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_vendor_payment_to_ledger();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 9: FORCE SCHEMA CACHE RELOAD (End)                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 10: VERIFICATION                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

SELECT 
    '✅ Migration Complete' as status,
    (SELECT COUNT(*) FROM vendors) as vendors,
    (SELECT COUNT(*) FROM vendor_ledger) as ledger_entries,
    (SELECT COUNT(*) FROM vendor_payments) as payments;

SELECT 
    v.name,
    v.total_purchases,
    v.total_payments,
    v.balance,
    (SELECT COUNT(*) FROM vendor_ledger WHERE vendor_id = v.id) as ledger_entries
FROM vendors v
ORDER BY v.name;
