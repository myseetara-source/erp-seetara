-- =============================================================================
-- MISSING DATABASE FUNCTIONS
-- =============================================================================
-- Run this in Supabase SQL Editor to add the missing functions
-- that are required by the backend services.
-- =============================================================================

-- =============================================================================
-- 1. ATOMIC STOCK DEDUCTION (Required for Order Creation)
-- =============================================================================
-- This function atomically deducts stock and creates a movement record.
-- Used by: Backend/src/services/product.service.js -> deductStockAtomic

CREATE OR REPLACE FUNCTION public.deduct_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Order deduction'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_variant RECORD;
BEGIN
    -- Lock the variant row for update
    SELECT id, sku, current_stock INTO v_variant
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Variant not found'
        );
    END IF;
    
    v_current_stock := v_variant.current_stock;
    v_new_stock := v_current_stock - p_quantity;
    
    -- Check for sufficient stock
    IF v_new_stock < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Insufficient stock. Available: %s, Requested: %s', v_current_stock, p_quantity),
            'available', v_current_stock,
            'requested', p_quantity
        );
    END IF;
    
    -- Update the stock
    UPDATE product_variants
    SET 
        current_stock = v_new_stock,
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    -- Create stock movement record
    INSERT INTO stock_movements (
        variant_id,
        movement_type,
        quantity,
        stock_before,
        stock_after,
        order_id,
        reason,
        created_at
    ) VALUES (
        p_variant_id,
        'order_deduction',
        -p_quantity,
        v_current_stock,
        v_new_stock,
        p_order_id,
        p_reason,
        NOW()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'variant_id', p_variant_id,
        'stock_before', v_current_stock,
        'stock_after', v_new_stock,
        'deducted', p_quantity
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.deduct_stock_atomic(UUID, INTEGER, UUID, TEXT) TO authenticated;

-- =============================================================================
-- 2. BULK STOCK DEDUCTION (For multi-item orders)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.deduct_stock_bulk(
    p_items JSONB,  -- Array of {variant_id, quantity}
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Order deduction'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_result JSONB;
    v_all_results JSONB := '[]'::jsonb;
    v_has_error BOOLEAN := false;
BEGIN
    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_result := public.deduct_stock_atomic(
            (v_item->>'variant_id')::UUID,
            (v_item->>'quantity')::INTEGER,
            p_order_id,
            p_reason
        );
        
        v_all_results := v_all_results || v_result;
        
        IF NOT (v_result->>'success')::boolean THEN
            v_has_error := true;
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', NOT v_has_error,
        'results', v_all_results
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_stock_bulk(JSONB, UUID, TEXT) TO authenticated;

-- =============================================================================
-- 3. GENERATE ORDER NUMBER (If not exists)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_year TEXT;
    v_count INTEGER;
    v_order_number TEXT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    
    -- Get count of orders this year
    SELECT COUNT(*) + 1 INTO v_count
    FROM orders
    WHERE order_number LIKE 'ORD-' || v_year || '-%';
    
    v_order_number := 'ORD-' || v_year || '-' || LPAD(v_count::TEXT, 5, '0');
    
    RETURN v_order_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_order_number() TO authenticated;

-- =============================================================================
-- 4. GET NEXT INVOICE NUMBER (For Inventory Transactions)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_next_invoice_number(
    p_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prefix TEXT;
    v_last_number INTEGER;
    v_next_invoice TEXT;
BEGIN
    -- Determine prefix based on type
    v_prefix := CASE p_type
        WHEN 'purchase' THEN 'PUR-'
        WHEN 'purchase_return' THEN 'RET-'
        WHEN 'damage' THEN 'DMG-'
        WHEN 'adjustment' THEN 'ADJ-'
        ELSE 'TXN-'
    END;
    
    -- Get the last number used for this prefix
    SELECT COALESCE(MAX(
        NULLIF(REGEXP_REPLACE(invoice_no, '^' || v_prefix, ''), '')::INTEGER
    ), 0) INTO v_last_number
    FROM inventory_transactions
    WHERE invoice_no LIKE v_prefix || '%';
    
    -- Generate next invoice number
    v_next_invoice := v_prefix || LPAD((v_last_number + 1)::TEXT, 6, '0');
    
    RETURN v_next_invoice;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_invoice_number(TEXT) TO authenticated;

-- =============================================================================
-- 5. APPROVE INVENTORY TRANSACTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.approve_inventory_transaction(
    p_transaction_id UUID,
    p_approved_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction RECORD;
    v_item RECORD;
    v_config RECORD;
BEGIN
    -- Get transaction
    SELECT * INTO v_transaction
    FROM inventory_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;
    
    IF v_transaction.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction is not pending');
    END IF;
    
    -- Process each item - update stock
    FOR v_item IN 
        SELECT * FROM inventory_transaction_items 
        WHERE transaction_id = p_transaction_id
    LOOP
        -- Update variant stock based on source_type
        IF v_item.source_type = 'damaged' THEN
            UPDATE product_variants
            SET damaged_stock = damaged_stock + v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.variant_id;
        ELSE
            UPDATE product_variants
            SET current_stock = current_stock + v_item.quantity,
                updated_at = NOW()
            WHERE id = v_item.variant_id;
        END IF;
        
        -- Update item with stock snapshot
        UPDATE inventory_transaction_items
        SET stock_after = (
            SELECT CASE 
                WHEN v_item.source_type = 'damaged' THEN damaged_stock 
                ELSE current_stock 
            END
            FROM product_variants WHERE id = v_item.variant_id
        )
        WHERE id = v_item.id;
    END LOOP;
    
    -- Update transaction status
    UPDATE inventory_transactions
    SET 
        status = 'approved',
        approved_by = p_approved_by,
        approval_date = NOW(),
        updated_at = NOW()
    WHERE id = p_transaction_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', p_transaction_id,
        'approved_by', p_approved_by
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_inventory_transaction(UUID, UUID) TO authenticated;

-- =============================================================================
-- 6. REJECT INVENTORY TRANSACTION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reject_inventory_transaction(
    p_transaction_id UUID,
    p_rejected_by UUID,
    p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction RECORD;
BEGIN
    -- Get transaction
    SELECT * INTO v_transaction
    FROM inventory_transactions
    WHERE id = p_transaction_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
    END IF;
    
    IF v_transaction.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Transaction is not pending');
    END IF;
    
    -- Update transaction status (no stock changes since it was pending)
    UPDATE inventory_transactions
    SET 
        status = 'rejected',
        rejection_reason = p_rejection_reason,
        approved_by = p_rejected_by,  -- Using same field for rejection
        approval_date = NOW(),
        updated_at = NOW()
    WHERE id = p_transaction_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', p_transaction_id,
        'rejected_by', p_rejected_by,
        'reason', p_rejection_reason
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_inventory_transaction(UUID, UUID, TEXT) TO authenticated;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ All missing functions created successfully!';
    RAISE NOTICE '   - deduct_stock_atomic (for order creation)';
    RAISE NOTICE '   - deduct_stock_bulk (for multi-item orders)';
    RAISE NOTICE '   - generate_order_number';
    RAISE NOTICE '   - get_next_invoice_number';
    RAISE NOTICE '   - approve_inventory_transaction';
    RAISE NOTICE '   - reject_inventory_transaction';
END $$;
