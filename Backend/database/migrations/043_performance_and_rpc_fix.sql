-- =============================================================================
-- MIGRATION: 043_performance_and_rpc_fix.sql
-- PURPOSE: Fix performance issues and add missing RPC functions
-- DATE: 2026-01-24
-- REFERENCE: SEETARA ERP FORENSIC AUDIT REPORT
-- =============================================================================

-- =============================================================================
-- SECTION 1: PERFORMANCE INDEXES
-- =============================================================================

-- Orders - Additional indexes for frequently filtered columns
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);

-- Order Items - Vendor lookup optimization
CREATE INDEX IF NOT EXISTS idx_order_items_vendor ON order_items(vendor_id) WHERE vendor_id IS NOT NULL;

-- Stock Movements - Critical for inventory tracking
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);

-- =============================================================================
-- SECTION 2: BATCH STOCK DEDUCTION RPC
-- =============================================================================

-- Drop existing function if exists (for clean recreation)
DROP FUNCTION IF EXISTS deduct_stock_batch_atomic(JSONB, UUID);

-- Create batch stock deduction function
CREATE OR REPLACE FUNCTION deduct_stock_batch_atomic(
    p_items JSONB,  -- Array of {variant_id, quantity}
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_current_stock INTEGER;
    v_sku VARCHAR(100);
    v_results JSONB := '[]'::JSONB;
    v_errors JSONB := '[]'::JSONB;
BEGIN
    -- Validate input
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'No items provided');
    END IF;

    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        -- Lock and get current stock
        SELECT current_stock, sku INTO v_current_stock, v_sku
        FROM product_variants 
        WHERE id = v_variant_id 
        FOR UPDATE;
        
        IF NOT FOUND THEN
            v_errors := v_errors || jsonb_build_object(
                'variant_id', v_variant_id, 
                'error', 'Variant not found'
            );
            CONTINUE;
        END IF;
        
        -- Check stock availability
        IF v_current_stock < v_quantity THEN
            v_errors := v_errors || jsonb_build_object(
                'variant_id', v_variant_id,
                'sku', v_sku,
                'error', format('Insufficient stock. Available: %s, Requested: %s', v_current_stock, v_quantity)
            );
            CONTINUE;
        END IF;
        
        -- Deduct stock and add to reserved
        UPDATE product_variants SET 
            current_stock = current_stock - v_quantity,
            reserved_stock = reserved_stock + v_quantity,
            updated_at = NOW()
        WHERE id = v_variant_id;
        
        -- Record stock movement
        INSERT INTO stock_movements (
            variant_id, 
            order_id, 
            movement_type, 
            quantity, 
            balance_before, 
            balance_after,
            source,
            notes
        )
        VALUES (
            v_variant_id, 
            p_order_id, 
            'reserved', 
            -v_quantity, 
            v_current_stock, 
            v_current_stock - v_quantity,
            'fresh',
            'Batch order reservation'
        );
        
        -- Add to results
        v_results := v_results || jsonb_build_object(
            'variant_id', v_variant_id, 
            'sku', v_sku,
            'deducted', v_quantity,
            'previous_stock', v_current_stock,
            'new_stock', v_current_stock - v_quantity
        );
    END LOOP;
    
    -- Check if there were any errors
    IF jsonb_array_length(v_errors) > 0 THEN
        -- Rollback will happen automatically if we raise exception
        RAISE EXCEPTION 'Stock deduction failed: %', v_errors::TEXT;
    END IF;
    
    RETURN jsonb_build_object(
        'success', TRUE, 
        'items_processed', jsonb_array_length(v_results),
        'items', v_results
    );
END;
$$;

-- =============================================================================
-- SECTION 3: CONFIRM STOCK DEDUCTION RPC (Was missing)
-- =============================================================================

DROP FUNCTION IF EXISTS confirm_stock_deduction_atomic(UUID, INTEGER, UUID);

CREATE OR REPLACE FUNCTION confirm_stock_deduction_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reserved_stock INTEGER;
BEGIN
    -- Get current reserved stock
    SELECT reserved_stock INTO v_reserved_stock
    FROM product_variants 
    WHERE id = p_variant_id 
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    IF v_reserved_stock < p_quantity THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Insufficient reserved stock');
    END IF;
    
    -- Reduce reserved stock (stock already deducted from current_stock)
    UPDATE product_variants SET 
        reserved_stock = reserved_stock - p_quantity,
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    -- Update stock movement to confirmed
    UPDATE stock_movements SET 
        movement_type = 'sold',
        notes = 'Stock confirmed for delivery'
    WHERE order_id = p_order_id 
      AND variant_id = p_variant_id 
      AND movement_type = 'reserved';
    
    RETURN jsonb_build_object('success', TRUE, 'confirmed', p_quantity);
END;
$$;

-- =============================================================================
-- SECTION 4: RESTORE BATCH STOCK (For order cancellation)
-- =============================================================================

DROP FUNCTION IF EXISTS restore_stock_batch_atomic(JSONB, UUID, TEXT);

CREATE OR REPLACE FUNCTION restore_stock_batch_atomic(
    p_items JSONB,  -- Array of {variant_id, quantity}
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Order cancelled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_current_stock INTEGER;
    v_results JSONB := '[]'::JSONB;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        SELECT current_stock INTO v_current_stock
        FROM product_variants WHERE id = v_variant_id FOR UPDATE;
        
        IF FOUND THEN
            UPDATE product_variants SET 
                current_stock = current_stock + v_quantity,
                reserved_stock = GREATEST(0, reserved_stock - v_quantity),
                updated_at = NOW()
            WHERE id = v_variant_id;
            
            INSERT INTO stock_movements (variant_id, order_id, movement_type, quantity, balance_before, balance_after, notes)
            VALUES (v_variant_id, p_order_id, 'restored', v_quantity, v_current_stock, v_current_stock + v_quantity, p_reason);
            
            v_results := v_results || jsonb_build_object('variant_id', v_variant_id, 'restored', v_quantity);
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object('success', TRUE, 'items', v_results);
END;
$$;

-- =============================================================================
-- SECTION 5: GRANTS
-- =============================================================================

GRANT EXECUTE ON FUNCTION deduct_stock_batch_atomic(JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock_batch_atomic(JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION confirm_stock_deduction_atomic(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_stock_deduction_atomic(UUID, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION restore_stock_batch_atomic(JSONB, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_stock_batch_atomic(JSONB, UUID, TEXT) TO service_role;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    v_index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_index_count 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND indexname IN (
        'idx_orders_assigned_to', 'idx_orders_payment_status', 'idx_orders_source',
        'idx_order_items_vendor', 'idx_stock_movements_variant', 
        'idx_stock_movements_order', 'idx_stock_movements_created'
    );
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 043 COMPLETE!';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  Performance Indexes Created: %', v_index_count;
    RAISE NOTICE '  ✓ deduct_stock_batch_atomic - CREATED';
    RAISE NOTICE '  ✓ confirm_stock_deduction_atomic - CREATED';
    RAISE NOTICE '  ✓ restore_stock_batch_atomic - CREATED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
