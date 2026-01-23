-- =============================================================================
-- MIGRATION: 032_vendor_ledger_sync.sql
-- PURPOSE: FIX VENDOR LEDGER SYNC WITH INVENTORY TRANSACTIONS
-- =============================================================================
-- PROBLEM: Inventory purchases/returns show Rs. 0 in Vendor Transaction History
-- ROOT CAUSE: No trigger syncs inventory_transactions -> vendor_ledger
-- SOLUTION: Create atomic trigger that syncs on approval
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: ADD INDEX FOR FAST LOOKUPS                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Index on vendor_ledger(reference_id) for fast inventory->ledger lookup
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_reference_id 
ON vendor_ledger(reference_id) 
WHERE reference_id IS NOT NULL;

-- Index for type filtering
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_entry_type_vendor 
ON vendor_ledger(vendor_id, entry_type);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: CREATE ATOMIC SYNC FUNCTION                                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION fn_sync_inventory_to_vendor_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_entry_type TEXT;
    v_debit DECIMAL(15,2) := 0;
    v_credit DECIMAL(15,2) := 0;
    v_description TEXT;
    v_running_balance DECIMAL(15,2);
    v_existing_entry UUID;
BEGIN
    -- Only process if:
    -- 1. Transaction has a vendor_id (purchases/returns)
    -- 2. Transaction is being approved (status = 'approved')
    -- 3. Transaction type is purchase or purchase_return
    
    IF NEW.vendor_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    IF NEW.transaction_type NOT IN ('purchase', 'purchase_return') THEN
        RETURN NEW;
    END IF;
    
    -- Only trigger on approval (new approved OR status change to approved)
    IF NEW.status != 'approved' THEN
        RETURN NEW;
    END IF;
    
    -- Skip if already has ledger entry (prevent duplicates)
    SELECT id INTO v_existing_entry
    FROM vendor_ledger
    WHERE reference_id = NEW.id
    LIMIT 1;
    
    IF v_existing_entry IS NOT NULL THEN
        -- Update existing entry instead of creating duplicate
        UPDATE vendor_ledger
        SET 
            debit = CASE WHEN NEW.transaction_type = 'purchase' THEN COALESCE(NEW.total_cost, 0) ELSE 0 END,
            credit = CASE WHEN NEW.transaction_type = 'purchase_return' THEN COALESCE(NEW.total_cost, 0) ELSE 0 END,
            transaction_date = NEW.transaction_date
        WHERE id = v_existing_entry;
        
        RETURN NEW;
    END IF;
    
    -- Determine entry type and amounts
    CASE NEW.transaction_type
        WHEN 'purchase' THEN
            v_entry_type := 'purchase';
            v_debit := COALESCE(NEW.total_cost, 0);  -- We owe vendor
            v_credit := 0;
            v_description := 'Purchase: ' || NEW.invoice_no;
        WHEN 'purchase_return' THEN
            v_entry_type := 'return';
            v_debit := 0;
            v_credit := COALESCE(NEW.total_cost, 0);  -- Vendor owes us back
            v_description := 'Return: ' || NEW.invoice_no;
        ELSE
            RETURN NEW;  -- Unknown type, skip
    END CASE;
    
    -- Skip zero-value transactions
    IF v_debit = 0 AND v_credit = 0 THEN
        RETURN NEW;
    END IF;
    
    -- Calculate running balance
    SELECT COALESCE(
        (SELECT running_balance 
         FROM vendor_ledger 
         WHERE vendor_id = NEW.vendor_id 
         ORDER BY transaction_date DESC, created_at DESC 
         LIMIT 1),
        0
    ) + v_debit - v_credit INTO v_running_balance;
    
    -- Insert ledger entry (ATOMIC with transaction)
    INSERT INTO vendor_ledger (
        vendor_id,
        entry_type,
        reference_id,
        reference_no,
        debit,
        credit,
        running_balance,
        description,
        transaction_date,
        performed_by,
        created_at
    ) VALUES (
        NEW.vendor_id,
        v_entry_type::vendor_ledger_type,
        NEW.id,
        NEW.invoice_no,
        v_debit,
        v_credit,
        v_running_balance,
        v_description,
        NEW.transaction_date,
        NEW.performed_by,
        NOW()
    );
    
    -- Update vendor balance (denormalized for fast reads)
    UPDATE vendors
    SET 
        balance = v_running_balance,
        total_purchases = COALESCE(total_purchases, 0) + v_debit,
        updated_at = NOW()
    WHERE id = NEW.vendor_id;
    
    RAISE NOTICE 'Vendor ledger synced: %, debit=%, credit=%, balance=%', 
        NEW.invoice_no, v_debit, v_credit, v_running_balance;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: CREATE/REPLACE TRIGGER                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_sync_inventory_to_vendor_ledger ON inventory_transactions;

CREATE TRIGGER trg_sync_inventory_to_vendor_ledger
AFTER INSERT OR UPDATE ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION fn_sync_inventory_to_vendor_ledger();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: FIX EXISTING Rs. 0 ENTRIES                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- First, update existing vendor_ledger entries that have Rs. 0 but should have values
UPDATE vendor_ledger vl
SET 
    debit = CASE 
        WHEN it.transaction_type = 'purchase' THEN COALESCE(it.total_cost, 0)
        ELSE vl.debit
    END,
    credit = CASE 
        WHEN it.transaction_type = 'purchase_return' THEN COALESCE(it.total_cost, 0)
        ELSE vl.credit
    END
FROM inventory_transactions it
WHERE vl.reference_id = it.id
  AND (vl.debit = 0 OR vl.debit IS NULL)
  AND (vl.credit = 0 OR vl.credit IS NULL)
  AND it.total_cost > 0
  AND it.status = 'approved';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 5: BACKFILL MISSING LEDGER ENTRIES                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Insert ledger entries for approved inventory transactions that don't have one
INSERT INTO vendor_ledger (
    vendor_id,
    entry_type,
    reference_id,
    reference_no,
    debit,
    credit,
    running_balance,
    description,
    transaction_date,
    performed_by,
    created_at
)
SELECT 
    it.vendor_id,
    CASE it.transaction_type 
        WHEN 'purchase' THEN 'purchase'::vendor_ledger_type
        WHEN 'purchase_return' THEN 'return'::vendor_ledger_type
    END,
    it.id,
    it.invoice_no,
    CASE WHEN it.transaction_type = 'purchase' THEN COALESCE(it.total_cost, 0) ELSE 0 END,
    CASE WHEN it.transaction_type = 'purchase_return' THEN COALESCE(it.total_cost, 0) ELSE 0 END,
    0, -- Will recalculate running balance below
    CASE it.transaction_type 
        WHEN 'purchase' THEN 'Purchase: ' || it.invoice_no
        WHEN 'purchase_return' THEN 'Return: ' || it.invoice_no
    END,
    it.transaction_date,
    it.performed_by,
    it.created_at
FROM inventory_transactions it
WHERE it.vendor_id IS NOT NULL
  AND it.transaction_type IN ('purchase', 'purchase_return')
  AND it.status = 'approved'
  AND NOT EXISTS (
      SELECT 1 FROM vendor_ledger vl WHERE vl.reference_id = it.id
  )
ON CONFLICT DO NOTHING;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 6: RECALCULATE ALL RUNNING BALANCES                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
    v_vendor RECORD;
    v_entry RECORD;
    v_running_balance DECIMAL(15,2);
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
        
        -- Update vendor's current balance
        UPDATE vendors 
        SET balance = v_running_balance,
            updated_at = NOW()
        WHERE id = v_vendor.vendor_id;
    END LOOP;
END $$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 7: UPDATE VENDOR STATS                                              ║
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
    
    updated_at = NOW();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  VERIFICATION QUERY                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
    v_count_fixed INTEGER;
    v_count_missing INTEGER;
BEGIN
    -- Count fixed entries
    SELECT COUNT(*) INTO v_count_fixed
    FROM vendor_ledger
    WHERE debit > 0 OR credit > 0;
    
    -- Count transactions without ledger entries
    SELECT COUNT(*) INTO v_count_missing
    FROM inventory_transactions it
    WHERE it.vendor_id IS NOT NULL
      AND it.transaction_type IN ('purchase', 'purchase_return')
      AND it.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM vendor_ledger vl WHERE vl.reference_id = it.id);
    
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 032 COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '  ✓ Vendor ledger sync trigger installed';
    RAISE NOTICE '  ✓ Index on vendor_ledger(reference_id) created';
    RAISE NOTICE '  ✓ Fixed % entries with amounts', v_count_fixed;
    RAISE NOTICE '  ✓ Missing entries remaining: %', v_count_missing;
    RAISE NOTICE '  ✓ Running balances recalculated';
    RAISE NOTICE '  ✓ Vendor stats updated';
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;
