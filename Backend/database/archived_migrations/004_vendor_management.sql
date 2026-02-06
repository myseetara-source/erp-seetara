-- =============================================================================
-- VENDOR MANAGEMENT SYSTEM UPGRADE
-- =============================================================================
--
-- Version: 1.0.0
-- Purpose: Master-Detail Vendor Management with Portal Access & Stats
--
-- FEATURES:
-- ✅ vendor_users table for portal login
-- ✅ vendor_ledger for full debit/credit history
-- ✅ vendor_payments for payment tracking
-- ✅ Efficient stats aggregation view
-- ✅ RLS Security for vendor portal
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: LEDGER ENTRY TYPES ENUM
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE vendor_ledger_type AS ENUM (
        'purchase',           -- Purchase (Debit - we owe vendor more)
        'purchase_return',    -- Return (Credit - we owe vendor less)
        'payment',            -- Payment (Credit - we paid vendor)
        'debit_note',         -- Debit Note (Credit - vendor owes us)
        'credit_note',        -- Credit Note (Debit - we owe vendor more)
        'void_purchase',      -- Void Purchase (Credit - reverses a purchase)
        'void_return',        -- Void Return (Debit - reverses a return)
        'adjustment'          -- General adjustment entry
        'opening_balance',    -- Opening Balance
        'adjustment'          -- Manual Adjustment
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- SECTION 2: VENDOR USERS TABLE (Portal Access)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vendor_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    is_primary BOOLEAN DEFAULT FALSE, -- Primary contact for the vendor
    last_login TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    password_changed_at TIMESTAMPTZ,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vendor_users IS 'Portal login users for vendors (separate from main users table)';
COMMENT ON COLUMN vendor_users.is_primary IS 'Primary contact person for this vendor';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_users_vendor_id ON vendor_users(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_users_email ON vendor_users(email);

-- =============================================================================
-- SECTION 3: VENDOR LEDGER TABLE (Full Accounting History)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vendor_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    
    -- Entry Details
    entry_type vendor_ledger_type NOT NULL,
    reference_id UUID,                      -- Links to inventory_transaction, payment, etc.
    reference_no VARCHAR(50),               -- Invoice/Payment number for display
    
    -- Financial Fields (Double Entry)
    debit DECIMAL(14, 2) DEFAULT 0,         -- Vendor's Receivable (we owe them)
    credit DECIMAL(14, 2) DEFAULT 0,        -- Vendor's Payable (reduces what we owe)
    running_balance DECIMAL(14, 2) NOT NULL, -- Balance after this entry
    
    -- Audit
    description TEXT,
    notes TEXT,
    performed_by UUID REFERENCES users(id),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_debit_credit CHECK (
        (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0)
    )
);

COMMENT ON TABLE vendor_ledger IS 'Double-entry ledger for vendor transactions';
COMMENT ON COLUMN vendor_ledger.running_balance IS 'Cumulative balance after this transaction';

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_id ON vendor_ledger(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_entry_type ON vendor_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_reference_id ON vendor_ledger(reference_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_transaction_date ON vendor_ledger(transaction_date);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_created_at ON vendor_ledger(created_at DESC);

-- =============================================================================
-- SECTION 4: VENDOR PAYMENTS TABLE (Detailed Payment Tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vendor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    
    -- Payment Details
    payment_no VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
    reference_number VARCHAR(100),          -- Cheque/UTR number
    
    -- Financial Tracking
    balance_before DECIMAL(14, 2) NOT NULL,
    balance_after DECIMAL(14, 2) NOT NULL,
    
    -- Metadata
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    attachments JSONB DEFAULT '[]',         -- Receipts, etc.
    
    -- Audit
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled', 'bounced')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vendor_payments IS 'Payment records to vendors';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor_id ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_payment_no ON vendor_payments(payment_no);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_payment_date ON vendor_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_status ON vendor_payments(status);

-- =============================================================================
-- SECTION 5: VENDOR STATS VIEW (Optimized Aggregation)
-- =============================================================================

CREATE OR REPLACE VIEW vendor_stats_view AS
SELECT 
    v.id AS vendor_id,
    v.name,
    v.balance AS current_balance,
    
    -- Purchase Stats (from inventory_transactions)
    COALESCE(purchase_stats.total_purchases, 0) AS total_purchases,
    COALESCE(purchase_stats.purchase_count, 0) AS purchase_count,
    purchase_stats.last_purchase_date,
    
    -- Return Stats (from inventory_transactions)
    COALESCE(return_stats.total_returns, 0) AS total_returns,
    COALESCE(return_stats.return_count, 0) AS return_count,
    
    -- Payment Stats (from vendor_payments)
    COALESCE(payment_stats.total_payments, 0) AS total_payments,
    COALESCE(payment_stats.payment_count, 0) AS payment_count,
    payment_stats.last_payment_date,
    
    -- Calculated Fields
    COALESCE(purchase_stats.total_purchases, 0) 
        - COALESCE(return_stats.total_returns, 0) 
        - COALESCE(payment_stats.total_payments, 0) AS calculated_balance,
    
    -- Activity
    GREATEST(
        purchase_stats.last_purchase_date, 
        payment_stats.last_payment_date
    ) AS last_activity_date

FROM vendors v

-- Purchase aggregation
LEFT JOIN LATERAL (
    SELECT 
        SUM(ABS(it.total_cost)) AS total_purchases,
        COUNT(*) AS purchase_count,
        MAX(it.transaction_date) AS last_purchase_date
    FROM inventory_transactions it
    WHERE it.vendor_id = v.id 
      AND it.transaction_type = 'purchase'
      AND it.status = 'approved'
) purchase_stats ON true

-- Return aggregation
LEFT JOIN LATERAL (
    SELECT 
        SUM(ABS(it.total_cost)) AS total_returns,
        COUNT(*) AS return_count
    FROM inventory_transactions it
    WHERE it.vendor_id = v.id 
      AND it.transaction_type = 'purchase_return'
      AND it.status = 'approved'
) return_stats ON true

-- Payment aggregation
LEFT JOIN LATERAL (
    SELECT 
        SUM(vp.amount) AS total_payments,
        COUNT(*) AS payment_count,
        MAX(vp.payment_date) AS last_payment_date
    FROM vendor_payments vp
    WHERE vp.vendor_id = v.id 
      AND vp.status = 'completed'
) payment_stats ON true

WHERE v.is_active = true;

COMMENT ON VIEW vendor_stats_view IS 'Pre-aggregated vendor statistics for fast dashboard loading';

-- =============================================================================
-- SECTION 6: FUNCTIONS
-- =============================================================================

-- Generate unique payment number
CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS VARCHAR(50)
LANGUAGE plpgsql
AS $$
DECLARE
    next_num INTEGER;
    year_suffix VARCHAR(4);
BEGIN
    year_suffix := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(REGEXP_REPLACE(payment_no, '[^0-9]', '', 'g') AS INTEGER)
    ), 0) + 1
    INTO next_num
    FROM vendor_payments
    WHERE payment_no LIKE 'PAY-' || year_suffix || '-%';
    
    RETURN 'PAY-' || year_suffix || '-' || LPAD(next_num::TEXT, 6, '0');
END;
$$;

-- Record vendor payment with ledger entry (Atomic)
CREATE OR REPLACE FUNCTION record_vendor_payment(
    p_vendor_id UUID,
    p_amount DECIMAL(14, 2),
    p_payment_method VARCHAR(50),
    p_reference_number VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vendor RECORD;
    v_payment_no VARCHAR(50);
    v_new_balance DECIMAL(14, 2);
    v_payment_id UUID;
    v_ledger_id UUID;
BEGIN
    -- Get vendor with lock
    SELECT id, name, balance INTO v_vendor
    FROM vendors
    WHERE id = p_vendor_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Vendor not found');
    END IF;
    
    -- Validate amount
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Amount must be positive');
    END IF;
    
    -- Generate payment number
    v_payment_no := generate_payment_number();
    v_new_balance := v_vendor.balance - p_amount;
    
    -- Create payment record
    INSERT INTO vendor_payments (
        vendor_id, payment_no, amount, payment_method, 
        reference_number, balance_before, balance_after, 
        notes, created_by
    ) VALUES (
        p_vendor_id, v_payment_no, p_amount, p_payment_method,
        p_reference_number, v_vendor.balance, v_new_balance,
        p_notes, p_performed_by
    )
    RETURNING id INTO v_payment_id;
    
    -- Create ledger entry (Credit - we paid them)
    INSERT INTO vendor_ledger (
        vendor_id, entry_type, reference_id, reference_no,
        debit, credit, running_balance, description, performed_by
    ) VALUES (
        p_vendor_id, 'payment', v_payment_id, v_payment_no,
        0, p_amount, v_new_balance,
        'Payment via ' || p_payment_method,
        p_performed_by
    )
    RETURNING id INTO v_ledger_id;
    
    -- Update vendor balance
    UPDATE vendors
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = p_vendor_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'ledger_id', v_ledger_id,
        'balance_before', v_vendor.balance,
        'balance_after', v_new_balance
    );
END;
$$;

-- Get vendor stats (Fast function for API)
CREATE OR REPLACE FUNCTION get_vendor_stats(p_vendor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'vendor_id', vendor_id,
        'name', name,
        'purchases', total_purchases,
        'payments', total_payments,
        'returns', total_returns,
        'balance', current_balance,
        'purchase_count', purchase_count,
        'payment_count', payment_count,
        'last_purchase_date', last_purchase_date,
        'last_payment_date', last_payment_date,
        'last_activity_date', last_activity_date
    )
    INTO v_result
    FROM vendor_stats_view
    WHERE vendor_id = p_vendor_id;
    
    IF v_result IS NULL THEN
        -- Vendor might be inactive, query directly
        SELECT jsonb_build_object(
            'vendor_id', id,
            'name', name,
            'balance', balance,
            'purchases', 0,
            'payments', 0,
            'returns', 0,
            'purchase_count', 0,
            'payment_count', 0
        )
        INTO v_result
        FROM vendors
        WHERE id = p_vendor_id;
    END IF;
    
    RETURN COALESCE(v_result, '{"error": "Vendor not found"}'::JSONB);
END;
$$;

-- =============================================================================
-- SECTION 7: ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS
ALTER TABLE vendor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent migrations)
DROP POLICY IF EXISTS vendor_users_vendor_access ON vendor_users;
DROP POLICY IF EXISTS vendor_ledger_vendor_access ON vendor_ledger;
DROP POLICY IF EXISTS vendor_ledger_admin_write ON vendor_ledger;
DROP POLICY IF EXISTS vendor_payments_vendor_access ON vendor_payments;
DROP POLICY IF EXISTS vendor_payments_admin_write ON vendor_payments;

-- Vendor Users: Vendors see only their own users
CREATE POLICY vendor_users_vendor_access ON vendor_users
    FOR ALL TO authenticated
    USING (
        vendor_id = (SELECT vendor_id FROM users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    );

-- Vendor Ledger: Vendors see only their own ledger
CREATE POLICY vendor_ledger_vendor_access ON vendor_ledger
    FOR SELECT TO authenticated
    USING (
        vendor_id = (SELECT vendor_id FROM users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    );

-- Vendor Ledger: Only admins can insert/update
CREATE POLICY vendor_ledger_admin_write ON vendor_ledger
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    );

-- Vendor Payments: Vendors see only their own payments
CREATE POLICY vendor_payments_vendor_access ON vendor_payments
    FOR SELECT TO authenticated
    USING (
        vendor_id = (SELECT vendor_id FROM users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    );

-- Vendor Payments: Only admins can insert/update
CREATE POLICY vendor_payments_admin_write ON vendor_payments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    );

-- =============================================================================
-- SECTION 8: TRIGGER TO AUTO-CREATE LEDGER ENTRIES
-- =============================================================================

-- Auto-create ledger entry when inventory transaction is approved
CREATE OR REPLACE FUNCTION auto_create_vendor_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vendor_balance DECIMAL(14, 2);
    v_new_balance DECIMAL(14, 2);
    v_entry_type vendor_ledger_type;
    v_debit DECIMAL(14, 2) := 0;
    v_credit DECIMAL(14, 2) := 0;
    v_amount DECIMAL(14, 2);
BEGIN
    -- Only process if vendor_id is set and status changed to approved
    IF NEW.vendor_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Only process on status change to approved
    IF NOT (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
        RETURN NEW;
    END IF;
    
    -- Get vendor balance
    SELECT balance INTO v_vendor_balance FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
    v_amount := ABS(COALESCE(NEW.total_cost, 0));
    
    IF NEW.transaction_type = 'purchase' THEN
        v_entry_type := 'purchase';
        v_debit := v_amount;
        v_new_balance := v_vendor_balance + v_amount;
    ELSIF NEW.transaction_type = 'purchase_return' THEN
        v_entry_type := 'purchase_return';
        v_credit := v_amount;
        v_new_balance := v_vendor_balance - v_amount;
    ELSE
        RETURN NEW;
    END IF;
    
    -- Create ledger entry
    INSERT INTO vendor_ledger (
        vendor_id, entry_type, reference_id, reference_no,
        debit, credit, running_balance, description, 
        performed_by, transaction_date
    ) VALUES (
        NEW.vendor_id, v_entry_type, NEW.id, NEW.invoice_no,
        v_debit, v_credit, v_new_balance,
        CASE 
            WHEN NEW.transaction_type = 'purchase' THEN 'Purchase Invoice ' || NEW.invoice_no
            ELSE 'Return against ' || COALESCE(NEW.invoice_no, 'N/A')
        END,
        NEW.performed_by, NEW.transaction_date
    );
    
    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_auto_vendor_ledger ON inventory_transactions;

-- Create trigger
CREATE TRIGGER trg_auto_vendor_ledger
    AFTER UPDATE ON inventory_transactions
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_vendor_ledger_entry();

-- =============================================================================
-- DONE!
-- =============================================================================

COMMENT ON FUNCTION record_vendor_payment IS 'Atomic payment recording with ledger entry';
COMMENT ON FUNCTION get_vendor_stats IS 'Fast vendor statistics for dashboard';
