-- =============================================================================
-- MIGRATION: 010_purchase_payment_system.sql
-- PURPOSE: Complete Purchase Order & Payment Recording System with ACID Transactions
-- 
-- ARCHITECTURE:
-- 1. purchase_orders - Header for purchase transactions
-- 2. purchase_items - Line items with product/variant details
-- 3. vendor_payments - Payment records against vendors
-- 4. vendor_ledger - Central source of truth for balance (already exists)
-- 
-- CHAIN REACTION:
-- Purchase: +Stock, +Debit (Payable increases - we owe vendor more)
-- Payment: +Credit (Payable decreases - we paid vendor)
-- =============================================================================

-- =============================================================================
-- CLEANUP: Drop existing functions to avoid conflicts
-- =============================================================================

DROP FUNCTION IF EXISTS create_purchase_transaction CASCADE;
DROP FUNCTION IF EXISTS record_vendor_payment CASCADE;
DROP VIEW IF EXISTS vendor_financial_summary CASCADE;

-- =============================================================================
-- SECTION 1: PURCHASE ORDERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vendor Reference
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    
    -- Invoice Details
    invoice_no VARCHAR(100),
    invoice_date DATE,
    
    -- Financial
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE purchase_orders IS 'Purchase order headers for vendor purchases';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_po_vendor_id ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_invoice_date ON purchase_orders(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

-- =============================================================================
-- SECTION 2: PURCHASE ITEMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_variant_id UUID REFERENCES product_variants(id),
    
    -- Product Snapshot (in case product is deleted/changed later)
    product_name VARCHAR(255) NOT NULL,
    variant_name VARCHAR(255),
    sku VARCHAR(100),
    
    -- Quantities
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    
    -- Pricing (per unit)
    cost_price DECIMAL(10, 2) NOT NULL CHECK (cost_price >= 0),
    
    -- Line Total
    line_total DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * cost_price) STORED,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE purchase_items IS 'Line items for each purchase order';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pi_purchase_order ON purchase_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_pi_product_variant ON purchase_items(product_variant_id);

-- =============================================================================
-- SECTION 3: VENDOR PAYMENTS TABLE
-- Note: This table already exists from 004_vendor_management.sql
-- We only add missing columns if needed
-- =============================================================================

-- Add bank_name column if it doesn't exist (for compatibility)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendor_payments' AND column_name = 'bank_name'
    ) THEN
        ALTER TABLE vendor_payments ADD COLUMN bank_name VARCHAR(100);
    END IF;
END$$;

-- =============================================================================
-- SECTION 4: RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
-- Note: vendor_payments RLS already enabled in 004_vendor_management.sql

-- Purchase Orders Policies
DROP POLICY IF EXISTS "Users can view purchase orders" ON purchase_orders;
CREATE POLICY "Users can view purchase orders" ON purchase_orders
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create purchase orders" ON purchase_orders;
CREATE POLICY "Users can create purchase orders" ON purchase_orders
    FOR INSERT WITH CHECK (true);

-- Purchase Items Policies
DROP POLICY IF EXISTS "Users can view purchase items" ON purchase_items;
CREATE POLICY "Users can view purchase items" ON purchase_items
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create purchase items" ON purchase_items;
CREATE POLICY "Users can create purchase items" ON purchase_items
    FOR INSERT WITH CHECK (true);

-- Note: Vendor Payments policies already exist in 004_vendor_management.sql

-- =============================================================================
-- SECTION 5: RPC - CREATE PURCHASE TRANSACTION (ATOMIC)
-- =============================================================================

CREATE OR REPLACE FUNCTION create_purchase_transaction(
    p_vendor_id UUID,
    p_items JSONB,  -- Array of {product_id, variant_id, product_name, variant_name, sku, qty, cost_price}
    p_invoice_no VARCHAR DEFAULT NULL,
    p_invoice_date DATE DEFAULT CURRENT_DATE,
    p_discount DECIMAL DEFAULT 0,
    p_tax DECIMAL DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_purchase_id UUID;
    v_subtotal DECIMAL := 0;
    v_total DECIMAL := 0;
    v_item JSONB;
    v_line_total DECIMAL;
BEGIN
    -- Validate vendor exists
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'Vendor not found';
    END IF;

    -- Validate items array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one item is required';
    END IF;

    -- Calculate subtotal
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_subtotal := v_subtotal + ((v_item->>'qty')::INTEGER * (v_item->>'cost_price')::DECIMAL);
    END LOOP;

    -- Calculate total
    v_total := v_subtotal - COALESCE(p_discount, 0) + COALESCE(p_tax, 0);

    -- Create purchase order
    INSERT INTO purchase_orders (
        vendor_id,
        invoice_no,
        invoice_date,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        notes,
        created_by,
        status
    ) VALUES (
        p_vendor_id,
        p_invoice_no,
        p_invoice_date,
        v_subtotal,
        p_discount,
        p_tax,
        v_total,
        p_notes,
        p_created_by,
        'completed'
    ) RETURNING id INTO v_purchase_id;

    -- Insert purchase items and update stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_line_total := (v_item->>'qty')::INTEGER * (v_item->>'cost_price')::DECIMAL;

        -- Insert purchase item
        INSERT INTO purchase_items (
            purchase_order_id,
            product_id,
            product_variant_id,
            product_name,
            variant_name,
            sku,
            quantity,
            cost_price
        ) VALUES (
            v_purchase_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'variant_id')::UUID,
            v_item->>'product_name',
            v_item->>'variant_name',
            v_item->>'sku',
            (v_item->>'qty')::INTEGER,
            (v_item->>'cost_price')::DECIMAL
        );

        -- Update product variant stock (if variant exists)
        IF (v_item->>'variant_id') IS NOT NULL THEN
            UPDATE product_variants
            SET 
                stock = COALESCE(stock, 0) + (v_item->>'qty')::INTEGER,
                cost_price = (v_item->>'cost_price')::DECIMAL, -- Update cost price to latest
                updated_at = NOW()
            WHERE id = (v_item->>'variant_id')::UUID;
        END IF;
    END LOOP;

    -- Insert ledger entry (DEBIT - increases payable, vendor owes us inventory)
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
        p_vendor_id,
        'purchase',
        v_purchase_id,
        COALESCE(p_invoice_no, 'PO-' || substr(v_purchase_id::text, 1, 8)),
        v_total,  -- Debit = we owe vendor more
        0,
        (SELECT COALESCE(balance, 0) FROM vendors WHERE id = p_vendor_id) + v_total,
        COALESCE('Purchase: ' || p_invoice_no, 'Purchase Order'),
        p_created_by,
        p_invoice_date
    );

    -- Update vendor balance
    UPDATE vendors
    SET 
        balance = COALESCE(balance, 0) + v_total,
        updated_at = NOW()
    WHERE id = p_vendor_id;

    -- Return result
    RETURN jsonb_build_object(
        'success', true,
        'purchase_id', v_purchase_id,
        'total_amount', v_total,
        'items_count', jsonb_array_length(p_items),
        'message', 'Purchase recorded successfully'
    );

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Purchase transaction failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION create_purchase_transaction IS 'Atomic transaction to record purchase with stock update and ledger entry';

-- =============================================================================
-- SECTION 6: RPC - RECORD VENDOR PAYMENT (ATOMIC)
-- =============================================================================

CREATE OR REPLACE FUNCTION record_vendor_payment(
    p_vendor_id UUID,
    p_amount DECIMAL,
    p_payment_method VARCHAR DEFAULT 'cash',
    p_payment_date DATE DEFAULT CURRENT_DATE,
    p_transaction_ref VARCHAR DEFAULT NULL,
    p_bank_name VARCHAR DEFAULT NULL,
    p_remarks TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_payment_id UUID;
    v_payment_no VARCHAR(50);
    v_current_balance DECIMAL;
    v_new_balance DECIMAL;
BEGIN
    -- Validate vendor exists
    IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = p_vendor_id) THEN
        RAISE EXCEPTION 'Vendor not found';
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Get current balance
    SELECT COALESCE(balance, 0) INTO v_current_balance FROM vendors WHERE id = p_vendor_id;

    -- Warning if overpaying (but allow it)
    IF p_amount > v_current_balance THEN
        -- This creates an advance payment scenario
        RAISE NOTICE 'Payment exceeds current balance. This will create an advance.';
    END IF;

    -- Calculate new balance
    v_new_balance := v_current_balance - p_amount;

    -- Generate unique payment number
    v_payment_no := 'PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((FLOOR(RANDOM() * 10000))::TEXT, 4, '0');

    -- Create payment record (compatible with existing vendor_payments schema from 004)
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
        status,
        created_by
    ) VALUES (
        p_vendor_id,
        v_payment_no,
        p_amount,
        p_payment_method,  -- VARCHAR, not enum
        p_transaction_ref,
        v_current_balance,  -- balance_before
        v_new_balance,      -- balance_after
        p_payment_date,
        p_remarks,          -- notes column
        'completed',
        p_created_by
    ) RETURNING id INTO v_payment_id;

    -- Insert ledger entry (CREDIT - decreases payable, we paid vendor)
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
        p_vendor_id,
        'payment',
        v_payment_id,
        v_payment_no,
        0,
        p_amount,  -- Credit = we paid vendor, reduces what we owe
        v_new_balance,
        'Payment: ' || UPPER(p_payment_method) || COALESCE(' - ' || p_transaction_ref, ''),
        p_created_by,
        p_payment_date
    );

    -- Update vendor balance
    UPDATE vendors
    SET 
        balance = v_new_balance,
        updated_at = NOW()
    WHERE id = p_vendor_id;

    -- Return result
    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'amount', p_amount,
        'previous_balance', v_current_balance,
        'new_balance', v_new_balance,
        'message', 'Payment recorded successfully'
    );

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Payment recording failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION record_vendor_payment IS 'Atomic transaction to record payment with ledger entry';

-- =============================================================================
-- SECTION 7: HELPER VIEW - VENDOR FINANCIAL SUMMARY
-- =============================================================================

CREATE OR REPLACE VIEW vendor_financial_summary AS
SELECT 
    v.id,
    v.name,
    v.company_name,
    COALESCE(v.balance, 0) AS current_balance,
    COALESCE(po.total_purchases, 0) AS total_purchases,
    COALESCE(po.purchase_count, 0) AS purchase_count,
    COALESCE(vp.total_payments, 0) AS total_payments,
    COALESCE(vp.payment_count, 0) AS payment_count,
    COALESCE(ret.total_returns, 0) AS total_returns
FROM vendors v
LEFT JOIN (
    SELECT 
        vendor_id,
        SUM(total_amount) AS total_purchases,
        COUNT(*) AS purchase_count
    FROM purchase_orders 
    WHERE status = 'completed'
    GROUP BY vendor_id
) po ON v.id = po.vendor_id
LEFT JOIN (
    SELECT 
        vendor_id,
        SUM(amount) AS total_payments,
        COUNT(*) AS payment_count
    FROM vendor_payments 
    WHERE status = 'completed'
    GROUP BY vendor_id
) vp ON v.id = vp.vendor_id
LEFT JOIN (
    SELECT 
        vendor_id,
        SUM(credit) AS total_returns  -- Returns are credits (reduces what we owe)
    FROM vendor_ledger 
    WHERE entry_type = 'purchase_return'  -- Fixed: use correct column and value
    GROUP BY vendor_id
) ret ON v.id = ret.vendor_id;

COMMENT ON VIEW vendor_financial_summary IS 'Aggregated financial metrics per vendor';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 'Tables created:' AS status;
SELECT tablename FROM pg_tables WHERE tablename IN ('purchase_orders', 'purchase_items', 'vendor_payments');

SELECT 'Functions created:' AS status;
SELECT proname FROM pg_proc WHERE proname IN ('create_purchase_transaction', 'record_vendor_payment');
