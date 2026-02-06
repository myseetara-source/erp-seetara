-- Migration: 102_store_pos_stock_functions
-- Purpose: Fix Store POS stock operations (Sale, Refund, Exchange)
-- 
-- PROBLEM:
-- - Store Sales use 'deduct_stock_atomic' which reserves stock (wrong for immediate sales)
-- - Store should do immediate deduction with movement_type = 'sale'
-- - Refund should do immediate addition with movement_type = 'return'
--
-- SOLUTION:
-- - Create deduct_stock_sale_atomic() for immediate sales (not reservations)
-- - Create deduct_stock_sale_batch() for batch sales
-- - These DON'T touch reserved_stock, just current_stock

-- ============================================================================
-- STEP 1: Create Immediate Sale Deduction Function (Single Variant)
-- ============================================================================

CREATE OR REPLACE FUNCTION deduct_stock_sale_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_sku VARCHAR(100);
    v_product_name VARCHAR(500);
BEGIN
    -- Lock row for atomic update
    SELECT pv.current_stock, pv.sku, p.name 
    INTO v_current_stock, v_sku, v_product_name
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    -- Check stock availability
    IF v_current_stock < p_quantity THEN
        RETURN json_build_object(
            'success', FALSE, 
            'error', format('Insufficient stock for %s. Available: %s, Requested: %s', 
                           v_sku, v_current_stock, p_quantity),
            'variant_id', p_variant_id,
            'available', v_current_stock,
            'requested', p_quantity
        );
    END IF;
    
    -- Calculate new stock
    v_new_stock := v_current_stock - p_quantity;
    
    -- Update stock - IMMEDIATE SALE (no reserved_stock change)
    UPDATE product_variants
    SET 
        current_stock = v_new_stock,
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    -- Log stock movement with 'sale' type
    INSERT INTO stock_movements (
        variant_id, 
        order_id, 
        movement_type, 
        quantity, 
        balance_before, 
        balance_after, 
        source, 
        notes
    ) VALUES (
        p_variant_id, 
        p_order_id, 
        'sale',          -- SALE not 'reserved'
        -p_quantity,     -- Negative for outgoing
        v_current_stock, 
        v_new_stock, 
        'store_pos',     -- Source is Store POS
        format('Store Sale: %s x %s', v_product_name, p_quantity)
    );
    
    RETURN json_build_object(
        'success', TRUE,
        'variant_id', p_variant_id,
        'sku', v_sku,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'deducted', p_quantity
    );
END;
$$;

COMMENT ON FUNCTION deduct_stock_sale_atomic IS 
'P0 FIX: Immediate stock deduction for Store POS sales.
Unlike deduct_stock_atomic (which reserves), this directly reduces current_stock
and logs movement_type as "sale" for proper inventory tracking.';

-- ============================================================================
-- STEP 2: Create Batch Sale Deduction Function (Multiple Variants)
-- ============================================================================

CREATE OR REPLACE FUNCTION deduct_stock_sale_batch(
    p_items JSONB,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_result JSON;
    v_failed JSONB := '[]'::JSONB;
    v_success INTEGER := 0;
    v_variant_id UUID;
    v_quantity INTEGER;
BEGIN
    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        -- Call single item function
        SELECT deduct_stock_sale_atomic(v_variant_id, v_quantity, p_order_id) INTO v_result;
        
        IF (v_result->>'success')::BOOLEAN THEN
            v_success := v_success + 1;
        ELSE
            v_failed := v_failed || jsonb_build_object(
                'variant_id', v_variant_id,
                'error', v_result->>'error',
                'available', v_result->>'available',
                'requested', v_result->>'requested'
            );
        END IF;
    END LOOP;
    
    -- Return result
    IF jsonb_array_length(v_failed) > 0 THEN
        RETURN json_build_object(
            'success', FALSE,
            'processed', v_success,
            'failed', v_failed,
            'error', format('%s items failed stock deduction', jsonb_array_length(v_failed))
        );
    ELSE
        RETURN json_build_object(
            'success', TRUE,
            'processed', v_success
        );
    END IF;
END;
$$;

COMMENT ON FUNCTION deduct_stock_sale_batch IS 
'P0 FIX: Batch stock deduction for Store POS sales.
Processes multiple variants in a single transaction for atomicity.';

-- ============================================================================
-- STEP 3: Create Stock Return Function (for Refunds)
-- ============================================================================

CREATE OR REPLACE FUNCTION restore_stock_return_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Store Return'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_sku VARCHAR(100);
    v_product_name VARCHAR(500);
BEGIN
    -- Lock row for atomic update
    SELECT pv.current_stock, pv.sku, p.name 
    INTO v_current_stock, v_sku, v_product_name
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    -- Calculate new stock (add returned quantity)
    v_new_stock := v_current_stock + p_quantity;
    
    -- Update stock - ADD back to inventory
    UPDATE product_variants
    SET 
        current_stock = v_new_stock,
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    -- Log stock movement with 'return' type
    INSERT INTO stock_movements (
        variant_id, 
        order_id, 
        movement_type, 
        quantity, 
        balance_before, 
        balance_after, 
        source, 
        reason,
        notes
    ) VALUES (
        p_variant_id, 
        p_order_id, 
        'return',        -- RETURN type
        p_quantity,      -- Positive for incoming
        v_current_stock, 
        v_new_stock, 
        'store_pos',     -- Source is Store POS
        p_reason,
        format('Store Return: %s x %s', v_product_name, p_quantity)
    );
    
    RETURN json_build_object(
        'success', TRUE,
        'variant_id', p_variant_id,
        'sku', v_sku,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'restored', p_quantity
    );
END;
$$;

COMMENT ON FUNCTION restore_stock_return_atomic IS 
'P0 FIX: Stock restoration for Store POS refunds/returns.
Adds stock back to inventory with movement_type "return".';

-- ============================================================================
-- STEP 4: Grant Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION deduct_stock_sale_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock_sale_batch TO authenticated;
GRANT EXECUTE ON FUNCTION restore_stock_return_atomic TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_func_count INT;
BEGIN
    SELECT COUNT(*) INTO v_func_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN ('deduct_stock_sale_atomic', 'deduct_stock_sale_batch', 'restore_stock_return_atomic');
    
    RAISE NOTICE '[OK] Migration 102 complete: % Store POS stock functions created', v_func_count;
END $$;
