-- =============================================================================
-- MIGRATION: 023_reinstall_automation_triggers.sql
-- PURPOSE: Guarantee automatic Ledger & Balance updates for ALL new transactions
-- ROOT CAUSE: Triggers were missing/broken for new purchases after "double-entry" fix
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: DROP ALL EXISTING CONFLICTING TRIGGERS                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Payment triggers
DROP TRIGGER IF EXISTS trg_after_payment ON vendor_payments;
DROP TRIGGER IF EXISTS trg_vendor_payment_to_ledger ON vendor_payments;
DROP TRIGGER IF EXISTS after_payment_insert ON vendor_payments;

-- Purchase/Inventory triggers  
DROP TRIGGER IF EXISTS trg_after_purchase ON inventory_transactions;
DROP TRIGGER IF EXISTS trg_after_inventory_transaction ON inventory_transactions;
DROP TRIGGER IF EXISTS trg_inventory_to_vendor_ledger ON inventory_transactions;

-- Drop old functions
DROP FUNCTION IF EXISTS fn_vendor_payment_to_ledger CASCADE;
DROP FUNCTION IF EXISTS fn_inventory_to_vendor_ledger CASCADE;
DROP FUNCTION IF EXISTS manage_vendor_financials CASCADE;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: CREATE MASTER FUNCTION FOR VENDOR PAYMENTS                       ║
-- ║  Handles: Payment → Ledger Entry → Update Vendor Balance                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION fn_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_running_balance DECIMAL;
BEGIN
    -- Calculate the new running balance
    SELECT COALESCE(
        (SELECT running_balance FROM vendor_ledger 
         WHERE vendor_id = NEW.vendor_id 
         ORDER BY transaction_date DESC, created_at DESC 
         LIMIT 1), 
        0
    ) - NEW.amount INTO v_running_balance;

    -- Insert ledger entry (Payment = CREDIT = reduces balance)
    INSERT INTO vendor_ledger (
        vendor_id,
        entry_type,
        debit,
        credit,
        reference_id,
        reference_no,
        description,
        notes,
        performed_by,
        transaction_date,
        running_balance,
        created_at
    ) VALUES (
        NEW.vendor_id,
        'payment'::vendor_ledger_type,
        0,                              -- No debit
        NEW.amount,                     -- Credit (payment amount)
        NEW.id,                         -- Reference to payment record
        NEW.payment_no,
        'Payment: ' || COALESCE(NEW.payment_method, 'cash') || 
            CASE WHEN NEW.reference_number IS NOT NULL 
                 THEN ' (Ref: ' || NEW.reference_number || ')' 
                 ELSE '' END,
        NEW.notes,
        NEW.created_by,
        COALESCE(NEW.payment_date, CURRENT_DATE),
        v_running_balance,
        NOW()
    );

    -- Update vendor stats
    UPDATE vendors SET 
        balance = balance - NEW.amount,
        total_payments = COALESCE(total_payments, 0) + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.vendor_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: CREATE MASTER FUNCTION FOR INVENTORY TRANSACTIONS                ║
-- ║  Handles: Purchase/Return → Ledger Entry → Update Vendor Balance          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION fn_inventory_to_vendor_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_running_balance DECIMAL;
    v_entry_type vendor_ledger_type;
    v_debit DECIMAL := 0;
    v_credit DECIMAL := 0;
    v_description TEXT;
BEGIN
    -- Only process if vendor_id exists and it's a vendor-related transaction
    IF NEW.vendor_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Only process approved transactions
    IF NEW.status != 'approved' THEN
        RETURN NEW;
    END IF;

    -- Determine entry type and amounts based on transaction type
    CASE NEW.transaction_type
        WHEN 'purchase' THEN
            v_entry_type := 'purchase';
            v_debit := COALESCE(NEW.total_cost, 0);  -- Purchase = DEBIT (we owe more)
            v_credit := 0;
            v_description := 'Purchase: ' || NEW.invoice_no;
            
        WHEN 'purchase_return' THEN
            v_entry_type := 'purchase_return';
            v_debit := 0;
            v_credit := COALESCE(NEW.total_cost, 0);  -- Return = CREDIT (we owe less)
            v_description := 'Purchase Return: ' || NEW.invoice_no;
            
        ELSE
            -- Damage, adjustment, etc. - don't affect vendor ledger
            RETURN NEW;
    END CASE;

    -- Calculate the new running balance
    SELECT COALESCE(
        (SELECT running_balance FROM vendor_ledger 
         WHERE vendor_id = NEW.vendor_id 
         ORDER BY transaction_date DESC, created_at DESC 
         LIMIT 1), 
        0
    ) + v_debit - v_credit INTO v_running_balance;

    -- Insert ledger entry
    INSERT INTO vendor_ledger (
        vendor_id,
        entry_type,
        debit,
        credit,
        reference_id,
        reference_no,
        description,
        notes,
        performed_by,
        transaction_date,
        running_balance,
        created_at
    ) VALUES (
        NEW.vendor_id,
        v_entry_type,
        v_debit,
        v_credit,
        NEW.id,
        NEW.invoice_no,
        v_description,
        NEW.notes,
        NEW.performed_by,
        NEW.transaction_date,
        v_running_balance,
        NOW()
    );

    -- Update vendor stats based on transaction type
    IF NEW.transaction_type = 'purchase' THEN
        UPDATE vendors SET 
            balance = balance + COALESCE(NEW.total_cost, 0),
            total_purchases = COALESCE(total_purchases, 0) + COALESCE(NEW.total_cost, 0),
            updated_at = NOW()
        WHERE id = NEW.vendor_id;
        
    ELSIF NEW.transaction_type = 'purchase_return' THEN
        UPDATE vendors SET 
            balance = balance - COALESCE(NEW.total_cost, 0),
            -- Note: We could also track total_returns separately if needed
            updated_at = NOW()
        WHERE id = NEW.vendor_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: CREATE THE TRIGGERS                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Trigger for Payments
CREATE TRIGGER trg_after_payment
    AFTER INSERT ON vendor_payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_payment_to_ledger();

-- Trigger for Purchases/Returns
CREATE TRIGGER trg_after_inventory_transaction
    AFTER INSERT ON inventory_transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_inventory_to_vendor_ledger();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 5: SELF-HEALING - BACKFILL MISSING LEDGER ENTRIES                   ║
-- ║  For entries that were created BEFORE the triggers existed                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Backfill missing PURCHASE entries from inventory_transactions
INSERT INTO vendor_ledger (
    vendor_id, entry_type, debit, credit, reference_id, reference_no,
    description, notes, performed_by, transaction_date, running_balance, created_at
)
SELECT 
    it.vendor_id,
    'purchase'::vendor_ledger_type,
    it.total_cost,
    0,
    it.id,
    it.invoice_no,
    'Purchase: ' || it.invoice_no,
    it.notes,
    it.performed_by,
    it.transaction_date,
    0, -- Will be recalculated
    it.created_at
FROM inventory_transactions it
WHERE it.transaction_type = 'purchase'
  AND it.vendor_id IS NOT NULL
  AND it.status = 'approved'
  AND NOT EXISTS (
      SELECT 1 FROM vendor_ledger vl 
      WHERE vl.reference_id = it.id 
        AND vl.entry_type = 'purchase'
  );

-- Backfill missing PURCHASE_RETURN entries from inventory_transactions
INSERT INTO vendor_ledger (
    vendor_id, entry_type, debit, credit, reference_id, reference_no,
    description, notes, performed_by, transaction_date, running_balance, created_at
)
SELECT 
    it.vendor_id,
    'purchase_return'::vendor_ledger_type,
    0,
    it.total_cost,
    it.id,
    it.invoice_no,
    'Purchase Return: ' || it.invoice_no,
    it.notes,
    it.performed_by,
    it.transaction_date,
    0, -- Will be recalculated
    it.created_at
FROM inventory_transactions it
WHERE it.transaction_type = 'purchase_return'
  AND it.vendor_id IS NOT NULL
  AND it.status = 'approved'
  AND NOT EXISTS (
      SELECT 1 FROM vendor_ledger vl 
      WHERE vl.reference_id = it.id 
        AND vl.entry_type = 'purchase_return'
  );

-- Backfill missing PAYMENT entries from vendor_payments
INSERT INTO vendor_ledger (
    vendor_id, entry_type, debit, credit, reference_id, reference_no,
    description, notes, performed_by, transaction_date, running_balance, created_at
)
SELECT 
    vp.vendor_id,
    'payment'::vendor_ledger_type,
    0,
    vp.amount,
    vp.id,
    vp.payment_no,
    'Payment: ' || COALESCE(vp.payment_method, 'cash'),
    vp.notes,
    vp.created_by,
    vp.payment_date,
    0, -- Will be recalculated
    vp.created_at
FROM vendor_payments vp
WHERE NOT EXISTS (
    SELECT 1 FROM vendor_ledger vl 
    WHERE vl.reference_id = vp.id 
      AND vl.entry_type = 'payment'
);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 6: RECALCULATE ALL RUNNING BALANCES                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION recalculate_vendor_running_balances(p_vendor_id UUID)
RETURNS VOID AS $$
DECLARE
    v_entry RECORD;
    v_running_balance DECIMAL := 0;
BEGIN
    FOR v_entry IN 
        SELECT id, debit, credit 
        FROM vendor_ledger 
        WHERE vendor_id = p_vendor_id 
        ORDER BY transaction_date ASC, created_at ASC
    LOOP
        v_running_balance := v_running_balance + COALESCE(v_entry.debit, 0) - COALESCE(v_entry.credit, 0);
        
        UPDATE vendor_ledger 
        SET running_balance = v_running_balance 
        WHERE id = v_entry.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Recalculate for all vendors
DO $$
DECLARE
    v_vendor RECORD;
BEGIN
    FOR v_vendor IN SELECT id FROM vendors LOOP
        PERFORM recalculate_vendor_running_balances(v_vendor.id);
    END LOOP;
END $$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 7: SYNC VENDOR TABLE STATS FROM LEDGER (Final Truth)                ║
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
-- ║  STEP 8: VERIFY TRIGGERS ARE INSTALLED                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
    v_payment_trigger_exists BOOLEAN;
    v_inventory_trigger_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_after_payment'
    ) INTO v_payment_trigger_exists;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_after_inventory_transaction'
    ) INTO v_inventory_trigger_exists;
    
    IF NOT v_payment_trigger_exists THEN
        RAISE EXCEPTION 'CRITICAL: Payment trigger not installed!';
    END IF;
    
    IF NOT v_inventory_trigger_exists THEN
        RAISE EXCEPTION 'CRITICAL: Inventory trigger not installed!';
    END IF;
    
    RAISE NOTICE '✅ All automation triggers verified and active!';
END $$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 9: FORCE SCHEMA CACHE RELOAD                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

NOTIFY pgrst, 'reload schema';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 10: VERIFICATION REPORT                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

SELECT 
    v.name AS vendor_name,
    v.total_purchases,
    v.total_payments,
    v.balance,
    (SELECT COUNT(*) FROM vendor_ledger WHERE vendor_id = v.id) AS ledger_entries,
    (SELECT COUNT(*) FROM vendor_ledger WHERE vendor_id = v.id AND entry_type = 'purchase') AS purchase_count,
    (SELECT COUNT(*) FROM vendor_ledger WHERE vendor_id = v.id AND entry_type = 'payment') AS payment_count
FROM vendors v
ORDER BY v.created_at DESC;
