-- =============================================================================
-- MIGRATION: 014_backfill_purchases_from_inventory.sql
-- PURPOSE: Backfill vendor_ledger with purchase/return data from inventory_transactions
-- ISSUE: Purchases were stored in inventory_transactions, not purchase_orders
-- =============================================================================

-- Step 1: Grant permissions on purchase_orders (if needed)
GRANT ALL ON purchase_orders TO service_role;
GRANT ALL ON purchase_orders TO authenticated;
GRANT ALL ON inventory_transactions TO service_role;
GRANT ALL ON inventory_transactions TO authenticated;

-- Step 2: Backfill PURCHASES from inventory_transactions
-- Only insert if not already in ledger (idempotent)
INSERT INTO vendor_ledger (
    vendor_id,
    entry_type,
    reference_id,
    reference_no,
    debit,
    credit,
    running_balance,
    description,
    performed_by,
    transaction_date,
    created_at
)
SELECT 
    it.vendor_id,
    'purchase'::vendor_ledger_type,
    it.id,
    it.invoice_no,
    COALESCE(it.total_cost, 0),  -- Debit (we owe vendor)
    0,                            -- Credit
    0,                            -- Will calculate running balance later
    'Purchase: ' || COALESCE(it.invoice_no, 'N/A'),
    it.performed_by,
    it.transaction_date,
    it.created_at
FROM inventory_transactions it
WHERE it.transaction_type = 'purchase'
  AND it.vendor_id IS NOT NULL
  AND it.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_ledger vl 
    WHERE vl.reference_id = it.id AND vl.entry_type = 'purchase'
  );

-- Step 3: Backfill RETURNS from inventory_transactions  
INSERT INTO vendor_ledger (
    vendor_id,
    entry_type,
    reference_id,
    reference_no,
    debit,
    credit,
    running_balance,
    description,
    performed_by,
    transaction_date,
    created_at
)
SELECT 
    it.vendor_id,
    'purchase_return'::vendor_ledger_type,
    it.id,
    it.invoice_no,
    0,                            -- Debit
    COALESCE(it.total_cost, 0),  -- Credit (vendor owes us / reduces payable)
    0,                            -- Will calculate running balance later
    'Return: ' || COALESCE(it.invoice_no, 'N/A'),
    it.performed_by,
    it.transaction_date,
    it.created_at
FROM inventory_transactions it
WHERE it.transaction_type IN ('return', 'vendor_return', 'purchase_return')
  AND it.vendor_id IS NOT NULL
  AND it.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM vendor_ledger vl 
    WHERE vl.reference_id = it.id AND vl.entry_type = 'purchase_return'
  );

-- Step 4: Update running balances (chronological order)
-- This is a complex operation - for now we'll use a simpler approach
WITH ordered_ledger AS (
    SELECT 
        id,
        vendor_id,
        debit,
        credit,
        SUM(debit - credit) OVER (
            PARTITION BY vendor_id 
            ORDER BY COALESCE(transaction_date, created_at::date), created_at
        ) as calculated_balance
    FROM vendor_ledger
)
UPDATE vendor_ledger vl
SET running_balance = ol.calculated_balance
FROM ordered_ledger ol
WHERE vl.id = ol.id;

-- Step 5: Recalculate denormalized totals in vendors table
UPDATE vendors v
SET 
    total_purchases = COALESCE((
        SELECT SUM(debit) 
        FROM vendor_ledger vl 
        WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase'
    ), 0),
    total_payments = COALESCE((
        SELECT SUM(credit) 
        FROM vendor_ledger vl 
        WHERE vl.vendor_id = v.id AND vl.entry_type = 'payment'
    ), 0),
    total_returns = COALESCE((
        SELECT SUM(credit) 
        FROM vendor_ledger vl 
        WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase_return'
    ), 0),
    balance = COALESCE((
        SELECT SUM(debit) - SUM(credit) 
        FROM vendor_ledger vl 
        WHERE vl.vendor_id = v.id
    ), 0);

-- Step 6: Also update purchase_count and last dates
UPDATE vendors v
SET 
    purchase_count = COALESCE((
        SELECT COUNT(*) 
        FROM vendor_ledger vl 
        WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase'
    ), 0),
    last_purchase_date = (
        SELECT MAX(transaction_date) 
        FROM vendor_ledger vl 
        WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase'
    ),
    last_payment_date = (
        SELECT MAX(transaction_date) 
        FROM vendor_ledger vl 
        WHERE vl.vendor_id = v.id AND vl.entry_type = 'payment'
    );

-- Step 7: Verify the results
SELECT 
    v.id,
    v.name,
    v.total_purchases,
    v.total_payments,
    v.total_returns,
    v.balance,
    v.purchase_count,
    (SELECT COUNT(*) FROM vendor_ledger WHERE vendor_id = v.id) as ledger_entries
FROM vendors v
WHERE v.id = '8a9b4081-f048-4c3f-9294-c26c705993f8';

-- Also show ledger entries
SELECT entry_type, COUNT(*), SUM(debit), SUM(credit)
FROM vendor_ledger 
WHERE vendor_id = '8a9b4081-f048-4c3f-9294-c26c705993f8'
GROUP BY entry_type;
