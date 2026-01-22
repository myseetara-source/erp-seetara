-- =============================================================================
-- MIGRATION: 015_fix_running_balance.sql
-- PURPOSE: Recalculate running_balance for all vendor_ledger entries
-- ISSUE: Backfilled entries have running_balance = 0
-- =============================================================================

-- Calculate running balance chronologically for each vendor
-- Running balance = cumulative (debit - credit) from oldest to newest

-- Step 1: Calculate running balances using window function
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

-- Step 2: Verify - show transactions for a specific vendor with balances
SELECT 
    entry_type,
    reference_no,
    transaction_date,
    debit,
    credit,
    running_balance,
    created_at
FROM vendor_ledger 
WHERE vendor_id = '8a9b4081-f048-4c3f-9294-c26c705993f8'
ORDER BY COALESCE(transaction_date, created_at::date) DESC, created_at DESC
LIMIT 20;

-- Step 3: Also update vendors.balance to match the latest running_balance
UPDATE vendors v
SET balance = COALESCE((
    SELECT running_balance 
    FROM vendor_ledger vl 
    WHERE vl.vendor_id = v.id 
    ORDER BY COALESCE(transaction_date, created_at::date) DESC, created_at DESC 
    LIMIT 1
), 0);

-- Verify final balances
SELECT id, name, balance, total_purchases, total_payments, total_returns
FROM vendors
WHERE is_active = true;
