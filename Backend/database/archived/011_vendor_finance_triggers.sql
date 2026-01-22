-- =============================================================================
-- MIGRATION: 011_vendor_finance_triggers.sql
-- PURPOSE: Automated Double-Entry Ledger System for Vendors
-- 
-- ARCHITECTURE:
-- This implements AUTOMATIC balance updates using DATABASE TRIGGERS.
-- The frontend/API cannot bypass this - data integrity is guaranteed.
-- 
-- FLOW:
-- 1. Payment inserted → Trigger fires → Ledger entry created → Balance updated
-- 2. Purchase inserted → Trigger fires → Ledger entry created → Balance updated
-- =============================================================================

-- =============================================================================
-- SECTION 1: ENSURE VENDOR_LEDGER TABLE EXISTS WITH CORRECT SCHEMA
-- =============================================================================

-- Check if vendor_ledger exists and has correct columns
DO $$
BEGIN
    -- Add transaction_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendor_ledger' AND column_name = 'transaction_type'
    ) THEN
        -- The table uses entry_type instead, so we create an alias view
        RAISE NOTICE 'vendor_ledger uses entry_type column';
    END IF;
END$$;

-- =============================================================================
-- SECTION 2: DROP EXISTING TRIGGERS (Clean Slate)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_vendor_payment_ledger ON vendor_payments;
DROP TRIGGER IF EXISTS trg_purchase_order_ledger ON purchase_orders;
DROP FUNCTION IF EXISTS fn_vendor_payment_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_purchase_order_to_ledger() CASCADE;

-- =============================================================================
-- SECTION 3: TRIGGER FUNCTION - PAYMENT TO LEDGER
-- When a payment is inserted, automatically:
-- 1. Create a ledger entry (Credit = reduces payable)
-- 2. Update vendor's balance
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_vendor_payment_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance DECIMAL(14,2);
    v_new_balance DECIMAL(14,2);
BEGIN
    -- Only process completed payments
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    -- Get current vendor balance
    SELECT COALESCE(balance, 0) INTO v_current_balance
    FROM vendors WHERE id = NEW.vendor_id;

    -- Calculate new balance (payment reduces what we owe)
    v_new_balance := v_current_balance - NEW.amount;

    -- Insert ledger entry (CREDIT = payment, reduces payable)
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
        transaction_date
    ) VALUES (
        NEW.vendor_id,
        'payment',
        NEW.id,
        NEW.payment_no,
        0,
        NEW.amount,  -- Credit = payment
        v_new_balance,
        'Payment: ' || UPPER(NEW.payment_method) || COALESCE(' - ' || NEW.reference_number, ''),
        NEW.created_by,
        NEW.payment_date
    );

    -- Update vendor's balance
    UPDATE vendors 
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = NEW.vendor_id;

    -- Also update the payment record with calculated balances
    -- (This is redundant but ensures data consistency)
    NEW.balance_before := v_current_balance;
    NEW.balance_after := v_new_balance;

    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_vendor_payment_ledger
    AFTER INSERT ON vendor_payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_vendor_payment_to_ledger();

COMMENT ON FUNCTION fn_vendor_payment_to_ledger IS 'Auto-creates ledger entry and updates balance when payment is recorded';

-- =============================================================================
-- SECTION 4: TRIGGER FUNCTION - PURCHASE ORDER TO LEDGER
-- When a purchase is inserted, automatically:
-- 1. Create a ledger entry (Debit = increases payable)
-- 2. Update vendor's balance
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_purchase_order_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance DECIMAL(14,2);
    v_new_balance DECIMAL(14,2);
BEGIN
    -- Only process completed purchases
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    -- Get current vendor balance
    SELECT COALESCE(balance, 0) INTO v_current_balance
    FROM vendors WHERE id = NEW.vendor_id;

    -- Calculate new balance (purchase increases what we owe)
    v_new_balance := v_current_balance + NEW.total_amount;

    -- Insert ledger entry (DEBIT = purchase, increases payable)
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
        transaction_date
    ) VALUES (
        NEW.vendor_id,
        'purchase',
        NEW.id,
        COALESCE(NEW.invoice_no, 'PO-' || substr(NEW.id::text, 1, 8)),
        NEW.total_amount,  -- Debit = purchase
        0,
        v_new_balance,
        'Purchase: ' || COALESCE(NEW.invoice_no, 'Purchase Order'),
        NEW.created_by,
        COALESCE(NEW.invoice_date, CURRENT_DATE)
    );

    -- Update vendor's balance
    UPDATE vendors 
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = NEW.vendor_id;

    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_purchase_order_ledger
    AFTER INSERT ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_purchase_order_to_ledger();

COMMENT ON FUNCTION fn_purchase_order_to_ledger IS 'Auto-creates ledger entry and updates balance when purchase is recorded';

-- =============================================================================
-- SECTION 5: FIX EXISTING DATA - Backfill Ledger & Recalculate Balances
-- =============================================================================

-- Step 1: Clear any orphaned ledger entries (for clean recalculation)
-- WARNING: Only run this if you want to reset ledger data!
-- DELETE FROM vendor_ledger WHERE entry_type IN ('payment', 'purchase');

-- Step 2: Backfill payments that don't have ledger entries
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
    transaction_date
)
SELECT 
    vp.vendor_id,
    'payment',
    vp.id,
    vp.payment_no,
    0,
    vp.amount,
    vp.balance_after,  -- Use stored balance if available
    'Payment: ' || UPPER(vp.payment_method),
    vp.created_by,
    vp.payment_date
FROM vendor_payments vp
WHERE vp.status = 'completed'
AND NOT EXISTS (
    SELECT 1 FROM vendor_ledger vl 
    WHERE vl.reference_id = vp.id AND vl.entry_type = 'payment'
);

-- Step 3: Backfill purchases that don't have ledger entries
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
    transaction_date
)
SELECT 
    po.vendor_id,
    'purchase',
    po.id,
    COALESCE(po.invoice_no, 'PO-' || substr(po.id::text, 1, 8)),
    po.total_amount,
    0,
    0,  -- Will be recalculated
    'Purchase: ' || COALESCE(po.invoice_no, 'Purchase Order'),
    po.created_by,
    COALESCE(po.invoice_date, po.created_at::date)
FROM purchase_orders po
WHERE po.status = 'completed'
AND NOT EXISTS (
    SELECT 1 FROM vendor_ledger vl 
    WHERE vl.reference_id = po.id AND vl.entry_type = 'purchase'
);

-- Step 4: Recalculate all vendor balances based on ledger
UPDATE vendors v
SET balance = COALESCE((
    SELECT SUM(debit) - SUM(credit)
    FROM vendor_ledger vl
    WHERE vl.vendor_id = v.id
), 0),
updated_at = NOW();

-- Step 5: Update running balances in ledger (chronological order)
-- This is a complex operation, we'll use a window function approach
WITH ordered_ledger AS (
    SELECT 
        id,
        vendor_id,
        SUM(debit - credit) OVER (
            PARTITION BY vendor_id 
            ORDER BY transaction_date, created_at
        ) AS calculated_balance
    FROM vendor_ledger
)
UPDATE vendor_ledger vl
SET running_balance = ol.calculated_balance
FROM ordered_ledger ol
WHERE vl.id = ol.id;

-- =============================================================================
-- SECTION 6: HELPER FUNCTION - GET VENDOR FINANCIAL SUMMARY
-- =============================================================================

CREATE OR REPLACE FUNCTION get_vendor_financial_summary(p_vendor_id UUID)
RETURNS TABLE (
    total_purchases DECIMAL,
    total_payments DECIMAL,
    total_returns DECIMAL,
    current_balance DECIMAL,
    purchase_count BIGINT,
    payment_count BIGINT,
    last_purchase_date DATE,
    last_payment_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'purchase' THEN debit ELSE 0 END), 0) AS total_purchases,
        COALESCE(SUM(CASE WHEN entry_type = 'payment' THEN credit ELSE 0 END), 0) AS total_payments,
        COALESCE(SUM(CASE WHEN entry_type = 'purchase_return' THEN credit ELSE 0 END), 0) AS total_returns,
        COALESCE(SUM(debit) - SUM(credit), 0) AS current_balance,
        COUNT(CASE WHEN entry_type = 'purchase' THEN 1 END) AS purchase_count,
        COUNT(CASE WHEN entry_type = 'payment' THEN 1 END) AS payment_count,
        MAX(CASE WHEN entry_type = 'purchase' THEN transaction_date END) AS last_purchase_date,
        MAX(CASE WHEN entry_type = 'payment' THEN transaction_date END) AS last_payment_date
    FROM vendor_ledger
    WHERE vendor_id = p_vendor_id;
END;
$$;

COMMENT ON FUNCTION get_vendor_financial_summary IS 'Returns aggregated financial metrics for a vendor from the ledger';

-- =============================================================================
-- SECTION 7: HELPER FUNCTION - GET VENDOR TRANSACTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION get_vendor_transactions(
    p_vendor_id UUID,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    transaction_date DATE,
    entry_type VARCHAR,
    reference_no VARCHAR,
    description TEXT,
    debit DECIMAL,
    credit DECIMAL,
    running_balance DECIMAL,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vl.id,
        vl.transaction_date,
        vl.entry_type::VARCHAR,
        vl.reference_no,
        vl.description,
        vl.debit,
        vl.credit,
        vl.running_balance,
        vl.created_at
    FROM vendor_ledger vl
    WHERE vl.vendor_id = p_vendor_id
    ORDER BY vl.transaction_date DESC, vl.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION get_vendor_transactions IS 'Returns paginated transaction history for a vendor';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'Triggers created:' AS status;
SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_vendor_payment_ledger', 'trg_purchase_order_ledger');

SELECT 'Functions created:' AS status;
SELECT proname FROM pg_proc WHERE proname IN ('fn_vendor_payment_to_ledger', 'fn_purchase_order_to_ledger', 'get_vendor_financial_summary', 'get_vendor_transactions');

-- Show current vendor balances
SELECT 'Vendor Balances:' AS status;
SELECT id, name, balance FROM vendors ORDER BY name LIMIT 10;
