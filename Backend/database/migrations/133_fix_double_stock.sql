-- =============================================================================
-- MIGRATION 133: P0 FIX - DOUBLE STOCK COUNTING BUG
-- =============================================================================
--
-- BUG: When creating a purchase, stock was being incremented TWICE:
--   1. By the DB trigger `update_stock_on_transaction_item()` (BEFORE INSERT on items)
--   2. By the `process_purchase_transaction()` RPC function (manual UPDATE)
--
-- ROOT CAUSE: The RPC function manually updates `current_stock` AND then
-- inserts into `inventory_transaction_items`, which fires the trigger that
-- ALSO increments `current_stock`. Result: double counting.
--
-- FIX:
--   Part A: Replace the RPC function to remove manual stock + movement updates
--   Part B: Recalculate all variant stock from transaction history (heal data)
--
-- ROLLBACK: Re-run migration 045 to restore old RPC function
-- =============================================================================

-- =============================================================================
-- PART A: FIX process_purchase_transaction() RPC
-- =============================================================================
-- Remove manual stock update and stock_movement insert.
-- The trigger on inventory_transaction_items handles both automatically.
-- Only cost_price update is kept (trigger doesn't handle this).

DROP FUNCTION IF EXISTS process_purchase_transaction(JSONB);

CREATE OR REPLACE FUNCTION process_purchase_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Input parameters
    v_vendor_id UUID;
    v_invoice_no TEXT;
    v_invoice_date DATE;
    v_notes TEXT;
    v_performed_by UUID;
    v_items JSONB;
    
    -- Working variables
    v_transaction_id UUID;
    v_total_cost DECIMAL(15,2) := 0;
    v_total_quantity INTEGER := 0;
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_unit_cost DECIMAL(15,2);
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_item_count INTEGER := 0;
    v_stock_updates JSONB := '[]'::JSONB;
    v_vendor_name TEXT;
    v_vendor_balance DECIMAL(15,2);
    v_new_balance DECIMAL(15,2);
    v_entry_type TEXT := 'purchase';
    v_running_balance DECIMAL(15,2);
BEGIN
    -- =========================================================================
    -- STEP 1: Extract and validate input parameters
    -- =========================================================================
    
    v_vendor_id := (p_payload->>'vendor_id')::UUID;
    v_invoice_no := COALESCE(p_payload->>'invoice_no', 'PUR-' || TO_CHAR(NOW(), 'YYYY-MM-DD-HH24MISS'));
    v_invoice_date := COALESCE((p_payload->>'invoice_date')::DATE, CURRENT_DATE);
    v_notes := p_payload->>'notes';
    v_performed_by := (p_payload->>'performed_by')::UUID;
    v_items := p_payload->'items';
    
    -- Validate required fields
    IF v_vendor_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'vendor_id is required');
    END IF;
    
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'At least one item is required');
    END IF;
    
    -- Verify vendor exists
    SELECT name, COALESCE(balance, 0) INTO v_vendor_name, v_vendor_balance
    FROM vendors WHERE id = v_vendor_id;
    
    IF v_vendor_name IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Vendor not found');
    END IF;
    
    -- =========================================================================
    -- STEP 2: Calculate totals (pre-validation)
    -- =========================================================================
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'unit_cost')::DECIMAL;
        
        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid quantity for item ' || v_item_count);
        END IF;
        
        IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN
            RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid unit_cost for item ' || v_item_count);
        END IF;
        
        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
        v_total_quantity := v_total_quantity + v_quantity;
        v_item_count := v_item_count + 1;
    END LOOP;
    
    -- =========================================================================
    -- STEP 3: Create inventory_transactions record
    -- =========================================================================
    
    INSERT INTO inventory_transactions (
        invoice_no,
        transaction_type,
        vendor_id,
        status,
        total_cost,
        total_quantity,
        transaction_date,
        notes,
        performed_by,
        approved_by,
        approval_date,
        created_at
    ) VALUES (
        v_invoice_no,
        'purchase',
        v_vendor_id,
        'approved',
        v_total_cost,
        v_total_quantity,
        v_invoice_date,
        COALESCE(v_notes, 'Purchase from ' || v_vendor_name),
        v_performed_by,
        v_performed_by,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    -- =========================================================================
    -- STEP 4: Process each item
    -- 
    -- P0 FIX: Stock update + stock_movements are handled AUTOMATICALLY by the
    -- BEFORE INSERT trigger `update_stock_on_transaction_item()` on the
    -- inventory_transaction_items table. We MUST NOT update current_stock
    -- manually here, or it will be counted TWICE.
    --
    -- We only update cost_price (trigger does not handle this).
    -- =========================================================================
    
    v_item_count := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_cost := (v_item->>'unit_cost')::DECIMAL;
        
        -- Get current stock (for response only, trigger reads it fresh)
        SELECT current_stock INTO v_current_stock
        FROM product_variants WHERE id = v_variant_id FOR UPDATE;
        
        IF v_current_stock IS NULL THEN
            RAISE EXCEPTION 'Variant not found: %', v_variant_id;
        END IF;
        
        v_new_stock := v_current_stock + v_quantity;
        
        -- P0 FIX: Only update cost_price, NOT current_stock
        -- The trigger on inventory_transaction_items handles current_stock
        UPDATE product_variants
        SET 
            cost_price = v_unit_cost,
            updated_at = NOW()
        WHERE id = v_variant_id;
        
        -- Insert transaction item
        -- TRIGGER fires here → updates current_stock + creates stock_movement
        INSERT INTO inventory_transaction_items (
            transaction_id,
            variant_id,
            quantity,
            unit_cost,
            stock_before,
            stock_after,
            source_type,
            notes
        ) VALUES (
            v_transaction_id,
            v_variant_id,
            v_quantity,
            v_unit_cost,
            v_current_stock,
            v_new_stock,
            'fresh',
            'Purchase - ' || v_invoice_no
        );
        
        -- NOTE: stock_before/stock_after in the INSERT above will be
        -- overwritten by the BEFORE INSERT trigger. That's correct behavior.
        
        -- Track updates for response
        v_stock_updates := v_stock_updates || jsonb_build_object(
            'variant_id', v_variant_id,
            'quantity', v_quantity,
            'unit_cost', v_unit_cost,
            'stock_before', v_current_stock,
            'stock_after', v_new_stock
        );
        
        v_item_count := v_item_count + 1;
    END LOOP;
    
    -- =========================================================================
    -- STEP 5: Update vendor balance atomically
    -- =========================================================================
    
    v_new_balance := v_vendor_balance + v_total_cost;
    
    UPDATE vendors
    SET 
        balance = v_new_balance,
        total_purchases = COALESCE(total_purchases, 0) + v_total_cost,
        updated_at = NOW()
    WHERE id = v_vendor_id;
    
    -- =========================================================================
    -- STEP 6: Create vendor ledger entry
    -- =========================================================================
    
    SELECT COALESCE(
        (SELECT running_balance 
         FROM vendor_ledger 
         WHERE vendor_id = v_vendor_id 
         ORDER BY transaction_date DESC, created_at DESC 
         LIMIT 1),
        0
    ) + v_total_cost INTO v_running_balance;
    
    INSERT INTO vendor_ledger (
        vendor_id, entry_type, reference_id, reference_no,
        debit, credit, running_balance, description,
        transaction_date, performed_by, created_at
    ) VALUES (
        v_vendor_id, 'purchase'::vendor_ledger_type, v_transaction_id, v_invoice_no,
        v_total_cost, 0, v_running_balance,
        'Purchase from ' || v_vendor_name || ' - ' || v_invoice_no,
        v_invoice_date, v_performed_by, NOW()
    );
    
    -- =========================================================================
    -- RETURN: Success response
    -- =========================================================================
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'transaction_id', v_transaction_id,
        'invoice_no', v_invoice_no,
        'vendor', jsonb_build_object('id', v_vendor_id, 'name', v_vendor_name),
        'stock_updates', v_stock_updates,
        'summary', jsonb_build_object(
            'total_items', v_item_count,
            'total_quantity', v_total_quantity,
            'total_cost', v_total_cost,
            'vendor_previous_balance', v_vendor_balance,
            'vendor_new_balance', v_new_balance
        ),
        'processed_at', NOW()
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'detail', SQLSTATE
        );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION process_purchase_transaction(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION process_purchase_transaction(JSONB) TO service_role;

-- =============================================================================
-- PART B: HEAL CORRUPTED DATA - Recalculate all variant stock
-- =============================================================================
-- 
-- Only count items from APPROVED transactions (trigger skips non-approved).
-- This resets all variant stock to match the transaction history exactly.
-- Uses GREATEST(0, ...) to respect the positive_stock CHECK constraint.

UPDATE product_variants v
SET current_stock = GREATEST(0,
    COALESCE(
        (
            SELECT SUM(
                CASE 
                    WHEN t.transaction_type = 'purchase' THEN ABS(i.quantity)
                    WHEN t.transaction_type = 'purchase_return' THEN -ABS(i.quantity)
                    WHEN t.transaction_type = 'damage' THEN -ABS(i.quantity)
                    WHEN t.transaction_type = 'adjustment' THEN i.quantity
                    ELSE 0
                END
            )
            FROM inventory_transaction_items i
            JOIN inventory_transactions t ON t.id = i.transaction_id
            WHERE i.variant_id = v.id
              AND t.status = 'approved'
        ),
        0
    )
);

-- =============================================================================
-- PART C: Verification
-- =============================================================================

DO $$
DECLARE
    v_variant_count INTEGER;
    v_total_stock INTEGER;
BEGIN
    SELECT COUNT(*), COALESCE(SUM(current_stock), 0)
    INTO v_variant_count, v_total_stock
    FROM product_variants;

    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 133: DOUBLE STOCK BUG FIX COMPLETE';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Fixes Applied:';
    RAISE NOTICE '   1. process_purchase_transaction() RPC: Removed manual stock update';
    RAISE NOTICE '   2. All variant stock recalculated from approved transaction history';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Result:';
    RAISE NOTICE '   Total variants: %', v_variant_count;
    RAISE NOTICE '   Total stock units: %', v_total_stock;
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  IMPORTANT: Also update purchase.service.js to remove manual stock';
    RAISE NOTICE '   updates in the fallback path (Step 3 & Step 4).';
    RAISE NOTICE '';
END $$;
