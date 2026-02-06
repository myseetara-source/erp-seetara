-- =============================================================================
-- Migration 132: Atomic Stock Adjustment Function
-- =============================================================================
-- 
-- PRIORITY: P0 - CRITICAL DATA INTEGRITY FIX
-- 
-- PROBLEM: product.service.js uses unsafe read-modify-write pattern for stock
--          adjustments, causing data corruption under concurrent access.
-- 
-- SOLUTION: Database-level atomic function with row-level locking (FOR UPDATE)
--           that guarantees consistency even under high concurrency.
-- 
-- DATE: 2026-02-06
-- =============================================================================

-- Drop existing function if exists (with all signatures)
DROP FUNCTION IF EXISTS adjust_stock_atomic(UUID, INTEGER, TEXT, UUID);
DROP FUNCTION IF EXISTS adjust_stock_atomic(UUID, INTEGER, TEXT);

-- =============================================================================
-- FUNCTION: adjust_stock_atomic
-- =============================================================================
-- 
-- Performs atomic stock adjustment with:
-- 1. Row-level locking (FOR UPDATE) to prevent race conditions
-- 2. Negative stock constraint validation
-- 3. Automatic stock_movements audit trail
-- 
-- Parameters:
--   p_variant_id: UUID of the product variant
--   p_quantity: Delta quantity (positive = add stock, negative = remove stock)
--   p_reason: Reason for adjustment (required for audit)
--   p_user_id: User performing the adjustment (optional)
-- 
-- Returns: JSONB with success status, new stock level, and movement details
-- 
-- =============================================================================

CREATE OR REPLACE FUNCTION adjust_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_reason TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_sku VARCHAR(100);
    v_product_name TEXT;
    v_movement_id UUID;
BEGIN
    -- =========================================================================
    -- STEP 1: Validate input
    -- =========================================================================
    IF p_quantity = 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Quantity cannot be zero',
            'error_code', 'INVALID_QUANTITY'
        );
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Reason is required (minimum 3 characters)',
            'error_code', 'INVALID_REASON'
        );
    END IF;

    -- =========================================================================
    -- STEP 2: Lock the row and fetch current stock (ATOMIC)
    -- =========================================================================
    -- FOR UPDATE: Prevents other transactions from modifying this row until
    -- this transaction completes. This is the KEY to preventing race conditions.
    -- =========================================================================
    SELECT 
        pv.current_stock, 
        pv.sku,
        p.name
    INTO 
        v_current_stock, 
        v_sku,
        v_product_name
    FROM product_variants pv
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE pv.id = p_variant_id
    FOR UPDATE;  -- ⚠️ CRITICAL: Row-level lock

    -- Check if variant exists
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Product variant not found',
            'error_code', 'VARIANT_NOT_FOUND',
            'variant_id', p_variant_id
        );
    END IF;

    -- =========================================================================
    -- STEP 3: Calculate new stock and validate constraints
    -- =========================================================================
    v_new_stock := v_current_stock + p_quantity;

    -- Prevent negative stock
    IF v_new_stock < 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('Insufficient stock for %s. Available: %s, Requested: %s', 
                           v_sku, v_current_stock, ABS(p_quantity)),
            'error_code', 'INSUFFICIENT_STOCK',
            'variant_id', p_variant_id,
            'sku', v_sku,
            'current_stock', v_current_stock,
            'requested', ABS(p_quantity),
            'shortfall', ABS(v_new_stock)
        );
    END IF;

    -- =========================================================================
    -- STEP 4: Update stock (ATOMIC with the lock held)
    -- =========================================================================
    UPDATE product_variants
    SET 
        current_stock = v_new_stock,
        updated_at = NOW()
    WHERE id = p_variant_id;

    -- =========================================================================
    -- STEP 5: Create audit trail in stock_movements
    -- =========================================================================
    INSERT INTO stock_movements (
        id,
        variant_id,
        movement_type,
        quantity,
        stock_before,
        stock_after,
        balance_before,
        balance_after,
        reason,
        notes,
        source,
        created_by,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_variant_id,
        CASE 
            WHEN p_quantity > 0 THEN 'adjustment_in'
            ELSE 'adjustment_out'
        END,
        p_quantity,
        v_current_stock,
        v_new_stock,
        v_current_stock,  -- balance_before = stock_before for consistency
        v_new_stock,      -- balance_after = stock_after
        p_reason,
        format('Atomic adjustment: %s%s units', 
               CASE WHEN p_quantity > 0 THEN '+' ELSE '' END, 
               p_quantity),
        'adjustment',
        p_user_id,
        NOW()
    )
    RETURNING id INTO v_movement_id;

    -- =========================================================================
    -- STEP 6: Return success response
    -- =========================================================================
    RETURN jsonb_build_object(
        'success', TRUE,
        'variant_id', p_variant_id,
        'sku', v_sku,
        'product_name', v_product_name,
        'stock_before', v_current_stock,
        'stock_after', v_new_stock,
        'quantity_adjusted', p_quantity,
        'movement_id', v_movement_id,
        'reason', p_reason,
        'adjusted_at', NOW()
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return failure
        RAISE WARNING 'adjust_stock_atomic failed: % - %', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', format('Database error: %s', SQLERRM),
            'error_code', SQLSTATE,
            'variant_id', p_variant_id
        );
END;
$$;

-- =============================================================================
-- FUNCTION: adjust_stock_batch_atomic
-- =============================================================================
-- 
-- Performs atomic stock adjustment for multiple variants in a single transaction.
-- ALL-OR-NOTHING: If any adjustment fails, the entire batch is rolled back.
-- 
-- =============================================================================

CREATE OR REPLACE FUNCTION adjust_stock_batch_atomic(
    p_adjustments JSONB,  -- Array of {variant_id, quantity, reason}
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_adjustment JSONB;
    v_result JSONB;
    v_results JSONB[] := '{}';
    v_total_adjusted INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_failed_item JSONB := NULL;
BEGIN
    -- Validate input
    IF p_adjustments IS NULL OR jsonb_array_length(p_adjustments) = 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'No adjustments provided',
            'error_code', 'EMPTY_BATCH'
        );
    END IF;

    -- Process each adjustment
    FOR v_adjustment IN SELECT * FROM jsonb_array_elements(p_adjustments)
    LOOP
        -- Call single adjustment function
        v_result := adjust_stock_atomic(
            (v_adjustment->>'variant_id')::UUID,
            (v_adjustment->>'quantity')::INTEGER,
            COALESCE(v_adjustment->>'reason', 'Batch adjustment'),
            p_user_id
        );

        -- Check result
        IF (v_result->>'success')::BOOLEAN = TRUE THEN
            v_total_adjusted := v_total_adjusted + 1;
            v_results := array_append(v_results, v_result);
        ELSE
            -- On first failure, record and abort (all-or-nothing)
            v_failed_count := v_failed_count + 1;
            v_failed_item := v_result;
            
            -- Raise exception to trigger rollback
            RAISE EXCEPTION 'Batch adjustment failed at item %: %', 
                            v_total_adjusted + 1, 
                            v_result->>'error';
        END IF;
    END LOOP;

    -- All succeeded
    RETURN jsonb_build_object(
        'success', TRUE,
        'items_adjusted', v_total_adjusted,
        'results', to_jsonb(v_results)
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Transaction will be rolled back
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'BATCH_FAILED',
            'items_processed_before_failure', v_total_adjusted,
            'failed_item', v_failed_item
        );
END;
$$;

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT EXECUTE ON FUNCTION adjust_stock_atomic(UUID, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock_atomic(UUID, INTEGER, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION adjust_stock_batch_atomic(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock_batch_atomic(JSONB, UUID) TO service_role;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION adjust_stock_atomic IS 
'Atomic stock adjustment with row-level locking. Prevents race conditions and ensures data integrity.
Usage: SELECT adjust_stock_atomic(variant_id, quantity, reason, user_id)
- quantity > 0: Add stock
- quantity < 0: Remove stock
Returns JSONB with success status and stock details.';

COMMENT ON FUNCTION adjust_stock_batch_atomic IS 
'Batch atomic stock adjustment. All-or-nothing - if any item fails, entire batch is rolled back.
Usage: SELECT adjust_stock_batch_atomic(''[{"variant_id":"...", "quantity":10, "reason":"..."}]''::jsonb, user_id)';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
    -- Verify functions exist
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'adjust_stock_atomic') THEN
        RAISE NOTICE '✅ Migration 132: adjust_stock_atomic function created successfully';
    ELSE
        RAISE EXCEPTION '❌ Migration 132: Failed to create adjust_stock_atomic function';
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'adjust_stock_batch_atomic') THEN
        RAISE NOTICE '✅ Migration 132: adjust_stock_batch_atomic function created successfully';
    ELSE
        RAISE EXCEPTION '❌ Migration 132: Failed to create adjust_stock_batch_atomic function';
    END IF;
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 132 COMPLETE: Atomic Stock Adjustment Functions';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  ⚡ adjust_stock_atomic(variant_id, quantity, reason, user_id)';
    RAISE NOTICE '  ⚡ adjust_stock_batch_atomic(adjustments_jsonb, user_id)';
    RAISE NOTICE '  🔒 Race condition vulnerability: PATCHED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
