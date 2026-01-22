-- =============================================================================
-- MIGRATION: 016_remove_duplicate_ledger_entries.sql
-- PURPOSE: Remove duplicate entries from vendor_ledger (same reference_id + entry_type)
-- =============================================================================

-- Step 1: Check for duplicates
SELECT 
    reference_id, 
    entry_type, 
    COUNT(*) as count,
    array_agg(id) as duplicate_ids
FROM vendor_ledger
WHERE reference_id IS NOT NULL
GROUP BY reference_id, entry_type
HAVING COUNT(*) > 1;

-- Step 2: Delete duplicates - keep only the OLDEST entry (first created)
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
        WHERE reference_id IS NOT NULL
    ) ranked
    WHERE row_num > 1
);

-- Step 3: Recalculate running balances after removing duplicates
WITH calculated_balances AS (
    SELECT 
        id,
        vendor_id,
        SUM(debit - credit) OVER (
            PARTITION BY vendor_id 
            ORDER BY COALESCE(transaction_date, created_at::date) ASC, created_at ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as calc_balance
    FROM vendor_ledger
)
UPDATE vendor_ledger vl
SET running_balance = cb.calc_balance
FROM calculated_balances cb
WHERE vl.id = cb.id;

-- Step 4: Update vendor totals
UPDATE vendors v
SET 
    total_purchases = COALESCE((SELECT SUM(debit) FROM vendor_ledger vl WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase'), 0),
    total_payments = COALESCE((SELECT SUM(credit) FROM vendor_ledger vl WHERE vl.vendor_id = v.id AND vl.entry_type = 'payment'), 0),
    total_returns = COALESCE((SELECT SUM(credit) FROM vendor_ledger vl WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase_return'), 0),
    balance = COALESCE((
        SELECT running_balance 
        FROM vendor_ledger vl 
        WHERE vl.vendor_id = v.id 
        ORDER BY COALESCE(transaction_date, created_at::date) DESC, created_at DESC 
        LIMIT 1
    ), 0);

-- Step 5: Verify - no more duplicates
SELECT 
    reference_id, 
    entry_type, 
    COUNT(*) as count
FROM vendor_ledger
WHERE reference_id IS NOT NULL
GROUP BY reference_id, entry_type
HAVING COUNT(*) > 1;

-- Step 6: Show clean transaction history
SELECT 
    entry_type,
    reference_no,
    transaction_date,
    debit,
    credit,
    running_balance
FROM vendor_ledger 
WHERE vendor_id = '8a9b4081-f048-4c3f-9294-c26c705993f8'
ORDER BY COALESCE(transaction_date, created_at::date) DESC, created_at DESC;
