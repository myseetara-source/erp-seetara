-- ============================================================================
-- MIGRATION 091: Fix Missing deduct_stock_batch_atomic Function
-- ============================================================================
-- This function is required for order creation but was missing from the database.
-- Apply this migration in Supabase SQL Editor.
-- ============================================================================

-- First, ensure the single variant function exists
CREATE OR REPLACE FUNCTION deduct_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_variant RECORD;
    v_available INTEGER;
    v_new_reserved INTEGER;
BEGIN
    -- Lock the row for update to prevent race conditions
    SELECT id, sku, current_stock, reserved_stock
    INTO v_variant
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Variant not found',
            'variant_id', p_variant_id
        );
    END IF;
    
    -- Calculate available stock
    v_available := COALESCE(v_variant.current_stock, 0) - COALESCE(v_variant.reserved_stock, 0);
    
    IF v_available < p_quantity THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Insufficient stock',
            'variant_id', p_variant_id,
            'sku', v_variant.sku,
            'requested', p_quantity,
            'available', v_available
        );
    END IF;
    
    -- Update reserved stock (don't deduct current_stock until delivery)
    v_new_reserved := COALESCE(v_variant.reserved_stock, 0) + p_quantity;
    
    UPDATE product_variants
    SET reserved_stock = v_new_reserved,
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    -- Create stock movement record
    -- NOTE: Using correct column names from master_schema.sql
    -- stock_movements has: order_id, source (NOT reference_id, reference_type)
    INSERT INTO stock_movements (
        variant_id,
        quantity,
        movement_type,
        order_id,
        source,
        reason,
        notes,
        created_at
    ) VALUES (
        p_variant_id,
        -p_quantity,  -- Negative for outgoing
        'reserved',
        p_order_id,
        'order',
        'Stock reserved',
        'Stock reserved for order',
        NOW()
    );
    
    RETURN json_build_object(
        'success', true,
        'variant_id', p_variant_id,
        'sku', v_variant.sku,
        'deducted', p_quantity,
        'new_reserved', v_new_reserved,
        'available_after', v_available - p_quantity
    );
END;
$$;

-- Now create the batch function that uses the single variant function
CREATE OR REPLACE FUNCTION deduct_stock_batch_atomic(
    p_items JSONB,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_result JSON;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_success INTEGER := 0;
    v_failed JSONB := '[]'::JSONB;
BEGIN
    -- Process each item in the batch
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        -- Call single deduct function
        SELECT deduct_stock_atomic(v_variant_id, v_quantity, p_order_id) INTO v_result;
        
        IF (v_result->>'success')::BOOLEAN THEN
            v_success := v_success + 1;
        ELSE
            v_failed := v_failed || jsonb_build_object(
                'variant_id', v_variant_id,
                'error', v_result->>'error',
                'requested', v_quantity,
                'available', v_result->>'available'
            );
        END IF;
    END LOOP;
    
    -- If any failed, return failure (but items already processed are committed)
    IF jsonb_array_length(v_failed) > 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Some items failed stock check',
            'processed', v_success,
            'failed', v_failed
        );
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'processed', v_success,
        'order_id', p_order_id
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION deduct_stock_atomic(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock_atomic(UUID, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION deduct_stock_batch_atomic(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock_batch_atomic(JSONB, UUID) TO service_role;

-- Add comments
COMMENT ON FUNCTION deduct_stock_atomic IS 'Atomically deducts stock for a single variant (reserves stock for order)';
COMMENT ON FUNCTION deduct_stock_batch_atomic IS 'Batch stock deduction for multiple order items';

-- Verify
DO $$
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 091 COMPLETED!';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  ✓ deduct_stock_atomic - CREATED';
    RAISE NOTICE '  ✓ deduct_stock_batch_atomic - CREATED';
    RAISE NOTICE '  ✓ Permissions granted to authenticated & service_role';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
