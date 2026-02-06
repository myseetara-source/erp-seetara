-- =============================================================================
-- MIGRATION 115: Customer Advance Payment System
-- =============================================================================
-- Purpose: Track partial/advance payments against orders with receipt uploads
-- 
-- Features:
--   1. order_payments table for payment records
--   2. advance_paid column on orders (auto-calculated)
--   3. Trigger to sync payment totals to orders
--   4. RPC function for payment insertion with validation
--
-- Rollback: DROP TABLE order_payments; ALTER TABLE orders DROP COLUMN advance_paid;
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Create payment_method_v2 enum if not exists
-- =============================================================================
-- Extended enum to support more granular payment methods for advances

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'advance_payment_method') THEN
        CREATE TYPE advance_payment_method AS ENUM (
            'esewa',
            'khalti',
            'ime_pay',
            'fonepay',
            'bank',
            'cash'
        );
        RAISE NOTICE '✅ Created advance_payment_method enum';
    ELSE
        RAISE NOTICE '⏭️  advance_payment_method enum already exists';
    END IF;
END $$;

-- =============================================================================
-- STEP 2: Add advance_paid column to orders table
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'advance_paid'
    ) THEN
        ALTER TABLE orders 
        ADD COLUMN advance_paid DECIMAL(12, 2) DEFAULT 0.00;
        
        RAISE NOTICE '✅ Added advance_paid column to orders';
    ELSE
        RAISE NOTICE '⏭️  advance_paid column already exists';
    END IF;
END $$;

-- =============================================================================
-- STEP 3: Create order_payments table
-- =============================================================================

CREATE TABLE IF NOT EXISTS order_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign key to orders
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Payment details
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    payment_method advance_payment_method NOT NULL,
    transaction_id TEXT,  -- UTR, ref number, etc.
    
    -- Receipt/proof
    receipt_url TEXT,     -- URL to uploaded receipt image
    
    -- Audit fields
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Soft delete support
    deleted_at TIMESTAMPTZ,
    
    -- Metadata
    notes TEXT
);

-- Create comment
COMMENT ON TABLE order_payments IS 'Tracks partial/advance payments made by customers against orders';
COMMENT ON COLUMN order_payments.receipt_url IS 'Cloudflare R2 URL for payment proof screenshot';
COMMENT ON COLUMN order_payments.transaction_id IS 'Bank UTR, eSewa ref, Khalti ID, etc.';

-- =============================================================================
-- STEP 4: Create indexes for performance
-- =============================================================================

-- Index for fast lookup by order
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id 
ON order_payments(order_id);

-- Index for filtering by payment method
CREATE INDEX IF NOT EXISTS idx_order_payments_method 
ON order_payments(payment_method);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_order_payments_created_at 
ON order_payments(created_at DESC);

-- Composite index for order + date
CREATE INDEX IF NOT EXISTS idx_order_payments_order_date 
ON order_payments(order_id, created_at DESC);

-- =============================================================================
-- STEP 5: Create trigger to sync advance_paid to orders
-- =============================================================================

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_sync_order_advance_paid ON order_payments;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION sync_order_advance_paid()
RETURNS TRIGGER AS $$
DECLARE
    v_order_id UUID;
    v_total_advance DECIMAL(12, 2);
BEGIN
    -- Determine which order_id to update
    IF TG_OP = 'DELETE' THEN
        v_order_id := OLD.order_id;
    ELSE
        v_order_id := NEW.order_id;
    END IF;
    
    -- Calculate total advance paid (excluding soft-deleted records)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_advance
    FROM order_payments
    WHERE order_id = v_order_id
      AND deleted_at IS NULL;
    
    -- Update the orders table
    UPDATE orders
    SET 
        advance_paid = v_total_advance,
        -- Also update paid_amount for backward compatibility
        paid_amount = v_total_advance,
        -- Update payment_status based on advance
        payment_status = CASE
            WHEN v_total_advance = 0 THEN 'pending'::payment_status
            WHEN v_total_advance >= total_amount THEN 'paid'::payment_status
            ELSE 'partial'::payment_status
        END
    WHERE id = v_order_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trg_sync_order_advance_paid
AFTER INSERT OR UPDATE OR DELETE ON order_payments
FOR EACH ROW EXECUTE FUNCTION sync_order_advance_paid();

-- =============================================================================
-- STEP 6: Create RPC function for inserting payments with validation
-- =============================================================================

CREATE OR REPLACE FUNCTION insert_order_payment(
    p_order_id UUID,
    p_amount DECIMAL(12, 2),
    p_payment_method TEXT,
    p_transaction_id TEXT DEFAULT NULL,
    p_receipt_url TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_payment_id UUID;
    v_new_total DECIMAL(12, 2);
    v_user_id UUID;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    
    -- Validate order exists and get details
    SELECT id, order_number, total_amount, advance_paid, status
    INTO v_order
    FROM orders
    WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order not found'
        );
    END IF;
    
    -- Validate amount
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Amount must be greater than zero'
        );
    END IF;
    
    -- Validate payment method
    IF p_payment_method NOT IN ('esewa', 'khalti', 'ime_pay', 'fonepay', 'bank', 'cash') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid payment method. Allowed: esewa, khalti, ime_pay, fonepay, bank, cash'
        );
    END IF;
    
    -- Calculate new total
    v_new_total := COALESCE(v_order.advance_paid, 0) + p_amount;
    
    -- Insert the payment record
    INSERT INTO order_payments (
        order_id,
        amount,
        payment_method,
        transaction_id,
        receipt_url,
        notes,
        created_by
    ) VALUES (
        p_order_id,
        p_amount,
        p_payment_method::advance_payment_method,
        p_transaction_id,
        p_receipt_url,
        p_notes,
        v_user_id
    )
    RETURNING id INTO v_payment_id;
    
    -- Return success response
    RETURN jsonb_build_object(
        'success', true,
        'data', jsonb_build_object(
            'payment_id', v_payment_id,
            'order_id', p_order_id,
            'order_number', v_order.order_number,
            'amount', p_amount,
            'new_total_paid', v_new_total,
            'remaining', GREATEST(v_order.total_amount - v_new_total, 0)
        )
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION insert_order_payment IS 'Insert a customer advance payment with validation and auto-sync to orders';

-- =============================================================================
-- STEP 7: Create RPC function for listing order payments
-- =============================================================================

CREATE OR REPLACE FUNCTION get_order_payments(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payments JSONB;
    v_total DECIMAL(12, 2);
BEGIN
    -- Get all payments for the order
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', op.id,
                'amount', op.amount,
                'payment_method', op.payment_method,
                'transaction_id', op.transaction_id,
                'receipt_url', op.receipt_url,
                'notes', op.notes,
                'created_at', op.created_at,
                'created_by', jsonb_build_object(
                    'id', u.id,
                    'name', u.name
                )
            ) ORDER BY op.created_at DESC
        ), '[]'::jsonb),
        COALESCE(SUM(op.amount), 0)
    INTO v_payments, v_total
    FROM order_payments op
    LEFT JOIN users u ON u.id = op.created_by
    WHERE op.order_id = p_order_id
      AND op.deleted_at IS NULL;
    
    RETURN jsonb_build_object(
        'success', true,
        'data', jsonb_build_object(
            'payments', v_payments,
            'total_paid', v_total
        )
    );
END;
$$;

COMMENT ON FUNCTION get_order_payments IS 'Get all payments for a specific order';

-- =============================================================================
-- STEP 8: RLS Policies for order_payments
-- =============================================================================

-- Enable RLS
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS order_payments_select_policy ON order_payments;
DROP POLICY IF EXISTS order_payments_insert_policy ON order_payments;
DROP POLICY IF EXISTS order_payments_update_policy ON order_payments;
DROP POLICY IF EXISTS order_payments_delete_policy ON order_payments;

-- Select: Authenticated users can view payments
CREATE POLICY order_payments_select_policy ON order_payments
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Insert: Authenticated users can insert payments
CREATE POLICY order_payments_insert_policy ON order_payments
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Update: Only admin/manager can update
CREATE POLICY order_payments_update_policy ON order_payments
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- Delete: Only admin can delete (soft delete preferred)
CREATE POLICY order_payments_delete_policy ON order_payments
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- =============================================================================
-- STEP 9: Verification
-- =============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check table exists
    SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
    WHERE table_name = 'order_payments';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ VERIFICATION: order_payments table exists';
    ELSE
        RAISE EXCEPTION '❌ VERIFICATION FAILED: order_payments table not created';
    END IF;
    
    -- Check advance_paid column
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'advance_paid';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ VERIFICATION: orders.advance_paid column exists';
    ELSE
        RAISE EXCEPTION '❌ VERIFICATION FAILED: advance_paid column not added';
    END IF;
    
    -- Check trigger
    SELECT COUNT(*) INTO v_count
    FROM pg_trigger
    WHERE tgname = 'trg_sync_order_advance_paid';
    
    IF v_count > 0 THEN
        RAISE NOTICE '✅ VERIFICATION: sync trigger exists';
    ELSE
        RAISE EXCEPTION '❌ VERIFICATION FAILED: sync trigger not created';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 115 COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'New Objects Created:';
    RAISE NOTICE '  • Table: order_payments';
    RAISE NOTICE '  • Column: orders.advance_paid';
    RAISE NOTICE '  • Enum: advance_payment_method';
    RAISE NOTICE '  • Function: insert_order_payment()';
    RAISE NOTICE '  • Function: get_order_payments()';
    RAISE NOTICE '  • Trigger: trg_sync_order_advance_paid';
    RAISE NOTICE '  • Indexes: 4 performance indexes';
    RAISE NOTICE '  • RLS Policies: 4 policies';
    RAISE NOTICE '';
END $$;

COMMIT;
