-- =============================================================================
-- MIGRATION: 012_optimize_vendor_stats.sql
-- PURPOSE: O(1) Scalable Architecture for Vendor Stats
-- 
-- PROBLEM: Calculating SUM(amount) on every page load is slow for large datasets.
-- SOLUTION: Denormalize total_purchases and total_payments into vendors table.
--           These are updated automatically via Triggers.
-- 
-- BENEFIT: Dashboard loads instantly even with 1 million transactions!
-- =============================================================================

-- =============================================================================
-- SECTION 1: ADD DENORMALIZED COLUMNS TO VENDORS TABLE
-- =============================================================================

-- Add total_purchases column if not exists
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS total_purchases DECIMAL(14,2) DEFAULT 0;

-- Add total_payments column if not exists
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS total_payments DECIMAL(14,2) DEFAULT 0;

-- Add total_returns column if not exists
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS total_returns DECIMAL(14,2) DEFAULT 0;

-- Add purchase_count for quick count access
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS purchase_count INT DEFAULT 0;

-- Add payment_count for quick count access
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS payment_count INT DEFAULT 0;

-- Add last transaction dates for quick access
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS last_purchase_date DATE;

ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS last_payment_date DATE;

COMMENT ON COLUMN vendors.total_purchases IS 'Denormalized: Sum of all purchase amounts (auto-updated by trigger)';
COMMENT ON COLUMN vendors.total_payments IS 'Denormalized: Sum of all payment amounts (auto-updated by trigger)';
COMMENT ON COLUMN vendors.total_returns IS 'Denormalized: Sum of all return amounts (auto-updated by trigger)';

-- =============================================================================
-- SECTION 2: UPDATE TRIGGERS TO MAINTAIN DENORMALIZED COLUMNS
-- =============================================================================

-- Drop existing triggers (we'll recreate them with enhanced logic)
DROP TRIGGER IF EXISTS trg_vendor_payment_ledger ON vendor_payments;
DROP TRIGGER IF EXISTS trg_purchase_order_ledger ON purchase_orders;

-- =============================================================================
-- TRIGGER: PAYMENT TO LEDGER (Enhanced with stats update)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_vendor_payment_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance DECIMAL(14,2);
    v_new_balance DECIMAL(14,2);
    v_current_total_payments DECIMAL(14,2);
BEGIN
    -- Only process completed payments
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    -- Get current vendor stats
    SELECT 
        COALESCE(balance, 0), 
        COALESCE(total_payments, 0)
    INTO v_current_balance, v_current_total_payments
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

    -- Update vendor's balance AND denormalized stats (O(1) update)
    UPDATE vendors 
    SET 
        balance = v_new_balance,
        total_payments = v_current_total_payments + NEW.amount,
        payment_count = COALESCE(payment_count, 0) + 1,
        last_payment_date = NEW.payment_date,
        updated_at = NOW()
    WHERE id = NEW.vendor_id;

    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_vendor_payment_ledger
    AFTER INSERT ON vendor_payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_vendor_payment_to_ledger();

-- =============================================================================
-- TRIGGER: PURCHASE ORDER TO LEDGER (Enhanced with stats update)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_purchase_order_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance DECIMAL(14,2);
    v_new_balance DECIMAL(14,2);
    v_current_total_purchases DECIMAL(14,2);
BEGIN
    -- Only process completed purchases
    IF NEW.status != 'completed' THEN
        RETURN NEW;
    END IF;

    -- Get current vendor stats
    SELECT 
        COALESCE(balance, 0), 
        COALESCE(total_purchases, 0)
    INTO v_current_balance, v_current_total_purchases
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

    -- Update vendor's balance AND denormalized stats (O(1) update)
    UPDATE vendors 
    SET 
        balance = v_new_balance,
        total_purchases = v_current_total_purchases + NEW.total_amount,
        purchase_count = COALESCE(purchase_count, 0) + 1,
        last_purchase_date = COALESCE(NEW.invoice_date, CURRENT_DATE),
        updated_at = NOW()
    WHERE id = NEW.vendor_id;

    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_purchase_order_ledger
    AFTER INSERT ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_purchase_order_to_ledger();

-- =============================================================================
-- SECTION 3: BACKFILL EXISTING DATA
-- Calculate and update stats for all existing vendors
-- =============================================================================

-- Backfill total_purchases from ledger
UPDATE vendors v
SET total_purchases = COALESCE((
    SELECT SUM(debit) 
    FROM vendor_ledger vl 
    WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase'
), 0);

-- Backfill total_payments from ledger
UPDATE vendors v
SET total_payments = COALESCE((
    SELECT SUM(credit) 
    FROM vendor_ledger vl 
    WHERE vl.vendor_id = v.id AND vl.entry_type = 'payment'
), 0);

-- Backfill total_returns from ledger
UPDATE vendors v
SET total_returns = COALESCE((
    SELECT SUM(credit) 
    FROM vendor_ledger vl 
    WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase_return'
), 0);

-- Backfill purchase_count from ledger
UPDATE vendors v
SET purchase_count = COALESCE((
    SELECT COUNT(*) 
    FROM vendor_ledger vl 
    WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase'
), 0);

-- Backfill payment_count from ledger
UPDATE vendors v
SET payment_count = COALESCE((
    SELECT COUNT(*) 
    FROM vendor_ledger vl 
    WHERE vl.vendor_id = v.id AND vl.entry_type = 'payment'
), 0);

-- Backfill last_purchase_date from ledger
UPDATE vendors v
SET last_purchase_date = (
    SELECT MAX(transaction_date) 
    FROM vendor_ledger vl 
    WHERE vl.vendor_id = v.id AND vl.entry_type = 'purchase'
);

-- Backfill last_payment_date from ledger
UPDATE vendors v
SET last_payment_date = (
    SELECT MAX(transaction_date) 
    FROM vendor_ledger vl 
    WHERE vl.vendor_id = v.id AND vl.entry_type = 'payment'
);

-- Recalculate balance to ensure accuracy
UPDATE vendors v
SET balance = COALESCE(total_purchases, 0) - COALESCE(total_payments, 0) - COALESCE(total_returns, 0),
    updated_at = NOW();

-- =============================================================================
-- SECTION 4: CREATE INDEX FOR FAST LEDGER QUERIES
-- =============================================================================

-- Index for fast transaction history lookup
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_date 
ON vendor_ledger (vendor_id, transaction_date DESC, created_at DESC);

-- Index for entry type filtering
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_entry_type 
ON vendor_ledger (vendor_id, entry_type);

-- =============================================================================
-- SECTION 5: VERIFICATION
-- =============================================================================

SELECT 'Migration 012: Vendor Stats Optimization Complete!' AS status;

-- Show updated schema
SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'vendors' 
AND column_name IN ('total_purchases', 'total_payments', 'total_returns', 'balance', 'purchase_count', 'payment_count')
ORDER BY column_name;

-- Show current vendor stats
SELECT 
    name,
    balance,
    total_purchases,
    total_payments,
    total_returns,
    purchase_count,
    payment_count
FROM vendors 
ORDER BY name
LIMIT 10;
