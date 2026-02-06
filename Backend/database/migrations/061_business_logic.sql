-- =============================================================================
-- MIGRATION 061: BUSINESS LOGIC RPCs & TRIGGERS
-- =============================================================================
-- 
-- DATE: 2026-01-25
-- AUTHOR: Backend Logic Expert (PL/PGSQL)
-- PURPOSE: Core business logic for the 3-Engine architecture
--
-- CONTENTS:
-- 1. Auto-Archive Trigger (CANCELLED, BAD_LEAD, REFUNDED → Archives)
-- 2. RPC convert_lead_to_order() (Lead → Order + Reserve Stock)
-- 3. RPC process_dispatch() (Order Dispatch + Deduct Stock)
-- 4. RPC redirect_order() (Failed Order → New Order from Lead)
--
-- INVENTORY FLOW:
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ Lead Converted    → reserved_stock++ (Stock held for this order)       │
-- │ Order Dispatched  → reserved_stock--, current_stock-- (Real deduction) │
-- │ Order Redirected  → No change (stock reused for new order)             │
-- │ Order Cancelled   → reserved_stock-- (Stock released)                  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: AUTO-ARCHIVE TRIGGER
-- =============================================================================
-- Automatically archives leads/orders when they reach terminal states

-- 1.1 Archive function for leads
CREATE OR REPLACE FUNCTION auto_archive_lead()
RETURNS TRIGGER AS $$
DECLARE
    v_archive_statuses TEXT[] := ARRAY['CANCELLED', 'BAD_LEAD'];
BEGIN
    -- Only archive on specific status changes
    IF NEW.status::TEXT = ANY(v_archive_statuses) AND 
       (OLD.status IS NULL OR OLD.status::TEXT != NEW.status::TEXT) THEN
        
        -- Insert into archives
        INSERT INTO archives (
            original_id,
            source_table,
            original_data,
            reason,
            archived_at
        ) VALUES (
            NEW.id,
            'leads',
            to_jsonb(NEW),
            'auto_archive_' || LOWER(NEW.status::TEXT),
            NOW()
        );
        
        RAISE NOTICE '📦 Lead % auto-archived (status: %)', NEW.id, NEW.status;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1.2 Archive function for orders
CREATE OR REPLACE FUNCTION auto_archive_order()
RETURNS TRIGGER AS $$
DECLARE
    v_archive_statuses TEXT[] := ARRAY['CANCELLED', 'REFUNDED'];
    v_order_items JSONB;
BEGIN
    -- Only archive on specific status changes
    IF NEW.status::TEXT = ANY(v_archive_statuses) AND 
       (OLD.status IS NULL OR OLD.status::TEXT != NEW.status::TEXT) THEN
        
        -- Get order items for complete snapshot
        SELECT COALESCE(jsonb_agg(to_jsonb(oi.*)), '[]'::jsonb)
        INTO v_order_items
        FROM order_items oi
        WHERE oi.order_id = NEW.id;
        
        -- Insert into archives
        INSERT INTO archives (
            original_id,
            source_table,
            original_data,
            reason,
            archived_at
        ) VALUES (
            NEW.id,
            'orders',
            to_jsonb(NEW) || jsonb_build_object('items', v_order_items),
            'auto_archive_' || LOWER(NEW.status::TEXT),
            NOW()
        );
        
        RAISE NOTICE '📦 Order % auto-archived (status: %)', NEW.id, NEW.status;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1.3 Attach triggers
DO $$
BEGIN
    -- Lead auto-archive trigger
    DROP TRIGGER IF EXISTS trg_auto_archive_lead ON leads;
    CREATE TRIGGER trg_auto_archive_lead
        AFTER UPDATE OF status ON leads
        FOR EACH ROW
        EXECUTE FUNCTION auto_archive_lead();
    
    RAISE NOTICE '✅ Attached trigger: trg_auto_archive_lead';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Could not attach lead archive trigger: %', SQLERRM;
END $$;

DO $$
BEGIN
    -- Order auto-archive trigger
    DROP TRIGGER IF EXISTS trg_auto_archive_order ON orders;
    CREATE TRIGGER trg_auto_archive_order
        AFTER UPDATE OF status ON orders
        FOR EACH ROW
        EXECUTE FUNCTION auto_archive_order();
    
    RAISE NOTICE '✅ Attached trigger: trg_auto_archive_order';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Could not attach order archive trigger: %', SQLERRM;
END $$;

-- =============================================================================
-- SECTION 2: RPC convert_lead_to_order()
-- =============================================================================
-- Converts a lead to an order and reserves inventory

CREATE OR REPLACE FUNCTION convert_lead_to_order(
    p_lead_id UUID,
    p_converted_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_lead RECORD;
    v_order_id UUID;
    v_customer_id UUID;
    v_readable_id VARCHAR(30);
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_order_item_id UUID;
    v_items_created INTEGER := 0;
    v_stock_reserved INTEGER := 0;
BEGIN
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 1: Validate Lead
    -- ═══════════════════════════════════════════════════════════════════════
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
    
    IF v_lead IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Lead not found',
            'lead_id', p_lead_id
        );
    END IF;
    
    IF v_lead.status = 'CONVERTED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Lead already converted',
            'lead_id', p_lead_id,
            'order_id', v_lead.converted_order_id
        );
    END IF;
    
    IF v_lead.status = 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot convert cancelled lead',
            'lead_id', p_lead_id
        );
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 2: Find or Create Customer
    -- ═══════════════════════════════════════════════════════════════════════
    SELECT id INTO v_customer_id
    FROM customers
    WHERE phone = v_lead.customer_info->>'phone'
      AND is_deleted = FALSE
    LIMIT 1;
    
    IF v_customer_id IS NULL THEN
        INSERT INTO customers (
            name,
            phone,
            alt_phone,
            email,
            default_address
        ) VALUES (
            COALESCE(v_lead.customer_info->>'name', 'Unknown'),
            v_lead.customer_info->>'phone',
            v_lead.customer_info->>'alt_phone',
            v_lead.customer_info->>'email',
            v_lead.customer_info->>'address'
        )
        RETURNING id INTO v_customer_id;
        
        RAISE NOTICE '👤 Created new customer: %', v_customer_id;
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 3: Generate Readable Order ID
    -- ═══════════════════════════════════════════════════════════════════════
    SELECT generate_readable_id('ORD') INTO v_readable_id;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 4: Create Order
    -- ═══════════════════════════════════════════════════════════════════════
    INSERT INTO orders (
        customer_id,
        lead_id,
        readable_id,
        order_number,
        location,
        source,
        status,
        shipping_name,
        shipping_phone,
        shipping_address,
        shipping_city,
        assigned_to,
        created_at
    ) VALUES (
        v_customer_id,
        p_lead_id,
        v_readable_id,
        'ORD-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        v_lead.location,
        COALESCE(v_lead.source, 'lead'),
        'intake', -- Initial status (existing enum value)
        v_lead.customer_info->>'name',
        v_lead.customer_info->>'phone',
        v_lead.customer_info->>'address',
        v_lead.customer_info->>'city',
        v_lead.assigned_to,
        NOW()
    )
    RETURNING id INTO v_order_id;
    
    RAISE NOTICE '📦 Created order: % (%)', v_order_id, v_readable_id;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 5: Create Order Items & Reserve Inventory
    -- ═══════════════════════════════════════════════════════════════════════
    IF v_lead.items_interest IS NOT NULL AND jsonb_array_length(v_lead.items_interest) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_lead.items_interest)
        LOOP
            v_variant_id := (v_item->>'variant_id')::UUID;
            v_quantity := COALESCE((v_item->>'qty')::INTEGER, (v_item->>'quantity')::INTEGER, 1);
            
            -- Skip if no variant_id
            IF v_variant_id IS NOT NULL THEN
                -- Create order item
                INSERT INTO order_items (
                    order_id,
                    variant_id,
                    sku,
                    product_name,
                    variant_name,
                    quantity,
                    unit_price,
                    unit_cost,
                    total_price
                )
                SELECT
                    v_order_id,
                    pv.id,
                    pv.sku,
                    p.name,
                    COALESCE(pv.color, '') || ' ' || COALESCE(pv.size, ''),
                    v_quantity,
                    pv.selling_price,
                    pv.cost_price,
                    pv.selling_price * v_quantity
                FROM product_variants pv
                JOIN products p ON p.id = pv.product_id
                WHERE pv.id = v_variant_id
                RETURNING id INTO v_order_item_id;
                
                IF v_order_item_id IS NOT NULL THEN
                    v_items_created := v_items_created + 1;
                    
                    -- ═══════════════════════════════════════════════════════
                    -- INVENTORY ACTION: Reserve Stock
                    -- ═══════════════════════════════════════════════════════
                    UPDATE product_variants
                    SET reserved_stock = reserved_stock + v_quantity,
                        updated_at = NOW()
                    WHERE id = v_variant_id
                      AND current_stock >= v_quantity; -- Only if stock available
                    
                    IF FOUND THEN
                        v_stock_reserved := v_stock_reserved + v_quantity;
                        RAISE NOTICE '🔒 Reserved % units of variant %', v_quantity, v_variant_id;
                    ELSE
                        RAISE WARNING '⚠️ Insufficient stock for variant %', v_variant_id;
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 6: Update Lead Status
    -- ═══════════════════════════════════════════════════════════════════════
    UPDATE leads
    SET status = 'CONVERTED',
        converted_order_id = v_order_id,
        converted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_lead_id;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 7: Return Success Response
    -- ═══════════════════════════════════════════════════════════════════════
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lead converted to order successfully',
        'lead_id', p_lead_id,
        'order_id', v_order_id,
        'readable_id', v_readable_id,
        'customer_id', v_customer_id,
        'items_created', v_items_created,
        'stock_reserved', v_stock_reserved
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'lead_id', p_lead_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION convert_lead_to_order(UUID, UUID) IS 
'Converts a lead to an order. Creates customer if needed, creates order items, and reserves inventory.';

-- =============================================================================
-- SECTION 3: RPC process_dispatch()
-- =============================================================================
-- Marks order as dispatched and deducts inventory

CREATE OR REPLACE FUNCTION process_dispatch(
    p_order_id UUID,
    p_delivery_metadata JSONB DEFAULT '{}'::jsonb,
    p_dispatched_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_location TEXT;
    v_new_status TEXT;
    v_item RECORD;
    v_total_deducted INTEGER := 0;
BEGIN
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 1: Validate Order
    -- ═══════════════════════════════════════════════════════════════════════
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    
    IF v_order IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order not found',
            'order_id', p_order_id
        );
    END IF;
    
    -- Check if already dispatched
    IF v_order.status::TEXT IN ('DISPATCHED', 'SENT_FOR_DELIVERY', 'DELIVERED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order already dispatched or delivered',
            'order_id', p_order_id,
            'current_status', v_order.status
        );
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 2: Determine Dispatch Status Based on Location
    -- ═══════════════════════════════════════════════════════════════════════
    v_location := COALESCE(v_order.location::TEXT, 'INSIDE_VALLEY');
    
    IF v_location = 'INSIDE_VALLEY' THEN
        v_new_status := 'out_for_delivery'; -- Using existing enum value
        -- For rider delivery
    ELSIF v_location = 'OUTSIDE_VALLEY' THEN
        v_new_status := 'handover_to_courier'; -- Using existing enum value
        -- For courier delivery
    ELSE
        v_new_status := 'out_for_delivery'; -- Default
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 3: Deduct Inventory (Real Stock Deduction)
    -- ═══════════════════════════════════════════════════════════════════════
    FOR v_item IN 
        SELECT oi.variant_id, oi.quantity
        FROM order_items oi
        WHERE oi.order_id = p_order_id
    LOOP
        -- Decrease reserved_stock AND current_stock
        UPDATE product_variants
        SET reserved_stock = GREATEST(0, reserved_stock - v_item.quantity),
            current_stock = GREATEST(0, current_stock - v_item.quantity),
            updated_at = NOW()
        WHERE id = v_item.variant_id;
        
        IF FOUND THEN
            v_total_deducted := v_total_deducted + v_item.quantity;
            RAISE NOTICE '📤 Deducted % units from variant %', v_item.quantity, v_item.variant_id;
            
            -- Record stock movement
            INSERT INTO stock_movements (
                variant_id,
                movement_type,
                quantity,
                source_type,
                reference_id,
                notes,
                created_at
            ) VALUES (
                v_item.variant_id,
                'out',
                v_item.quantity,
                'fresh',
                p_order_id,
                'Order dispatch: ' || COALESCE(v_order.readable_id, v_order.order_number),
                NOW()
            );
        END IF;
    END LOOP;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 4: Update Order Status & Metadata
    -- ═══════════════════════════════════════════════════════════════════════
    UPDATE orders
    SET status = v_new_status::order_status,
        delivery_metadata = COALESCE(delivery_metadata, '{}'::jsonb) || p_delivery_metadata,
        dispatched_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 5: Log the action
    -- ═══════════════════════════════════════════════════════════════════════
    INSERT INTO order_logs (
        order_id,
        old_status,
        new_status,
        action,
        description,
        changed_by,
        meta,
        created_at
    ) VALUES (
        p_order_id,
        v_order.status,
        v_new_status::order_status,
        'dispatch',
        'Order dispatched for ' || v_location,
        p_dispatched_by,
        jsonb_build_object(
            'delivery_metadata', p_delivery_metadata,
            'stock_deducted', v_total_deducted
        ),
        NOW()
    );
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 6: Return Success Response
    -- ═══════════════════════════════════════════════════════════════════════
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Order dispatched successfully',
        'order_id', p_order_id,
        'readable_id', v_order.readable_id,
        'new_status', v_new_status,
        'location', v_location,
        'stock_deducted', v_total_deducted,
        'dispatched_at', NOW()
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'order_id', p_order_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION process_dispatch(UUID, JSONB, UUID) IS 
'Dispatches an order. Deducts current_stock and reserved_stock. Sets appropriate status based on location.';

-- =============================================================================
-- SECTION 4: RPC redirect_order()
-- =============================================================================
-- Redirects a failed order to a new lead, creating a linked replacement order

CREATE OR REPLACE FUNCTION redirect_order(
    p_failed_order_id UUID,
    p_target_lead_id UUID,
    p_redirect_reason TEXT DEFAULT 'customer_redirect',
    p_redirected_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_failed_order RECORD;
    v_target_lead RECORD;
    v_new_order_id UUID;
    v_new_readable_id VARCHAR(30);
    v_result JSONB;
BEGIN
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 1: Validate Failed Order
    -- ═══════════════════════════════════════════════════════════════════════
    SELECT * INTO v_failed_order FROM orders WHERE id = p_failed_order_id;
    
    IF v_failed_order IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Failed order not found',
            'failed_order_id', p_failed_order_id
        );
    END IF;
    
    -- Check if order is in a redirectable state
    IF v_failed_order.status::TEXT NOT IN ('rejected', 'REJECTED', 'HOLD', 'hold', 'NEXT_ATTEMPT') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order cannot be redirected from current status',
            'failed_order_id', p_failed_order_id,
            'current_status', v_failed_order.status
        );
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 2: Validate Target Lead
    -- ═══════════════════════════════════════════════════════════════════════
    SELECT * INTO v_target_lead FROM leads WHERE id = p_target_lead_id;
    
    IF v_target_lead IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Target lead not found',
            'target_lead_id', p_target_lead_id
        );
    END IF;
    
    IF v_target_lead.status IN ('CONVERTED', 'CANCELLED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Target lead is not available for conversion',
            'target_lead_id', p_target_lead_id,
            'lead_status', v_target_lead.status
        );
    END IF;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 3: Mark Failed Order as RE_DIRECTED
    -- ═══════════════════════════════════════════════════════════════════════
    UPDATE orders
    SET status = 'returned', -- Using existing enum value closest to RE_DIRECTED
        return_reason = 'Redirected: ' || p_redirect_reason,
        updated_at = NOW()
    WHERE id = p_failed_order_id;
    
    -- Log the redirect action
    INSERT INTO order_logs (
        order_id,
        old_status,
        new_status,
        action,
        description,
        changed_by,
        meta,
        created_at
    ) VALUES (
        p_failed_order_id,
        v_failed_order.status,
        'returned',
        'redirect',
        'Order redirected to new lead: ' || p_target_lead_id::TEXT,
        p_redirected_by,
        jsonb_build_object(
            'redirect_reason', p_redirect_reason,
            'target_lead_id', p_target_lead_id
        ),
        NOW()
    );
    
    RAISE NOTICE '🔄 Order % marked as redirected', p_failed_order_id;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 4: Convert Target Lead to New Order (NO INVENTORY CHANGE)
    -- Stock is being reused from the failed order
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- Generate new readable ID
    SELECT generate_readable_id('RDR') INTO v_new_readable_id; -- RDR = Redirected
    
    -- Create new order from lead (without reserving new stock)
    INSERT INTO orders (
        customer_id,
        lead_id,
        readable_id,
        order_number,
        location,
        source,
        status,
        shipping_name,
        shipping_phone,
        shipping_address,
        shipping_city,
        parent_order_id, -- Link to failed order
        assigned_to,
        internal_notes,
        created_at
    )
    SELECT
        COALESCE(
            (SELECT id FROM customers WHERE phone = v_target_lead.customer_info->>'phone' LIMIT 1),
            v_failed_order.customer_id
        ),
        p_target_lead_id,
        v_new_readable_id,
        'RDR-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        v_target_lead.location,
        'redirect',
        'intake', -- Start fresh
        v_target_lead.customer_info->>'name',
        v_target_lead.customer_info->>'phone',
        v_target_lead.customer_info->>'address',
        v_target_lead.customer_info->>'city',
        p_failed_order_id, -- Parent order reference
        v_target_lead.assigned_to,
        'Redirected from order: ' || COALESCE(v_failed_order.readable_id, v_failed_order.order_number),
        NOW()
    RETURNING id INTO v_new_order_id;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 5: Copy Order Items from Failed Order (Stock Reuse)
    -- ═══════════════════════════════════════════════════════════════════════
    INSERT INTO order_items (
        order_id,
        variant_id,
        vendor_id,
        sku,
        product_name,
        variant_name,
        quantity,
        unit_price,
        unit_cost,
        discount_per_unit,
        total_price,
        created_at
    )
    SELECT
        v_new_order_id,
        oi.variant_id,
        oi.vendor_id,
        oi.sku,
        oi.product_name,
        oi.variant_name,
        oi.quantity,
        oi.unit_price,
        oi.unit_cost,
        oi.discount_per_unit,
        oi.total_price,
        NOW()
    FROM order_items oi
    WHERE oi.order_id = p_failed_order_id;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 6: Update Target Lead Status
    -- ═══════════════════════════════════════════════════════════════════════
    UPDATE leads
    SET status = 'CONVERTED',
        converted_order_id = v_new_order_id,
        converted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_target_lead_id;
    
    RAISE NOTICE '✅ Lead % converted to redirected order %', p_target_lead_id, v_new_order_id;
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 7: Return Success Response
    -- ═══════════════════════════════════════════════════════════════════════
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Order redirected successfully',
        'failed_order_id', p_failed_order_id,
        'failed_order_readable_id', v_failed_order.readable_id,
        'target_lead_id', p_target_lead_id,
        'new_order_id', v_new_order_id,
        'new_readable_id', v_new_readable_id,
        'redirect_reason', p_redirect_reason,
        'inventory_action', 'none (stock reused)'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'failed_order_id', p_failed_order_id,
        'target_lead_id', p_target_lead_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION redirect_order(UUID, UUID, TEXT, UUID) IS 
'Redirects a failed order to a new lead. No inventory change (stock reused). Links parent_order_id.';

-- =============================================================================
-- SECTION 5: HELPER - Release Reserved Stock on Cancel
-- =============================================================================

CREATE OR REPLACE FUNCTION release_reserved_stock_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
    v_item RECORD;
BEGIN
    -- Only act when order is cancelled BEFORE dispatch
    IF NEW.status::TEXT IN ('cancelled', 'CANCELLED') AND 
       OLD.status::TEXT NOT IN ('out_for_delivery', 'handover_to_courier', 'delivered', 
                                 'DISPATCHED', 'SENT_FOR_DELIVERY', 'DELIVERED') THEN
        
        FOR v_item IN 
            SELECT variant_id, quantity 
            FROM order_items 
            WHERE order_id = NEW.id
        LOOP
            -- Release reserved stock
            UPDATE product_variants
            SET reserved_stock = GREATEST(0, reserved_stock - v_item.quantity),
                updated_at = NOW()
            WHERE id = v_item.variant_id;
            
            RAISE NOTICE '🔓 Released % reserved units for variant %', v_item.quantity, v_item.variant_id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    DROP TRIGGER IF EXISTS trg_release_stock_on_cancel ON orders;
    CREATE TRIGGER trg_release_stock_on_cancel
        AFTER UPDATE OF status ON orders
        FOR EACH ROW
        EXECUTE FUNCTION release_reserved_stock_on_cancel();
    
    RAISE NOTICE '✅ Attached trigger: trg_release_stock_on_cancel';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Could not attach cancel trigger: %', SQLERRM;
END $$;

-- =============================================================================
-- SECTION 6: GRANT PERMISSIONS
-- =============================================================================

-- Grant execute to authenticated users (adjust as needed)
GRANT EXECUTE ON FUNCTION convert_lead_to_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION process_dispatch(UUID, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION redirect_order(UUID, UUID, TEXT, UUID) TO authenticated;

COMMIT;

-- =============================================================================
-- DOCUMENTATION: INVENTORY FLOW
-- =============================================================================
/*
╔═══════════════════════════════════════════════════════════════════════════════╗
║                           INVENTORY FLOW DIAGRAM                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║   ┌───────────────────────────────────────────────────────────────────────┐   ║
║   │ PRODUCT_VARIANTS                                                       │   ║
║   │ ├── current_stock  (Physical stock in warehouse)                      │   ║
║   │ ├── reserved_stock (Held for pending orders)                          │   ║
║   │ └── available_stock = current_stock - reserved_stock (Sellable)       │   ║
║   └───────────────────────────────────────────────────────────────────────┘   ║
║                                                                                ║
║   ┌─────────────────────────────────────────────────────────────────────┐     ║
║   │ LEAD CONVERTED (convert_lead_to_order)                              │     ║
║   │                                                                      │     ║
║   │   reserved_stock += quantity                                         │     ║
║   │   current_stock  = (no change)                                       │     ║
║   │                                                                      │     ║
║   │   Effect: Stock is "held" for this order                            │     ║
║   └─────────────────────────────────────────────────────────────────────┘     ║
║                            │                                                   ║
║                            ▼                                                   ║
║   ┌─────────────────────────────────────────────────────────────────────┐     ║
║   │ ORDER DISPATCHED (process_dispatch)                                 │     ║
║   │                                                                      │     ║
║   │   reserved_stock -= quantity                                         │     ║
║   │   current_stock  -= quantity                                         │     ║
║   │                                                                      │     ║
║   │   Effect: Stock is physically removed                               │     ║
║   └─────────────────────────────────────────────────────────────────────┘     ║
║                                                                                ║
║   ┌─────────────────────────────────────────────────────────────────────┐     ║
║   │ ORDER CANCELLED (Before Dispatch)                                   │     ║
║   │                                                                      │     ║
║   │   reserved_stock -= quantity                                         │     ║
║   │   current_stock  = (no change)                                       │     ║
║   │                                                                      │     ║
║   │   Effect: Reserved stock released back to available                 │     ║
║   └─────────────────────────────────────────────────────────────────────┘     ║
║                                                                                ║
║   ┌─────────────────────────────────────────────────────────────────────┐     ║
║   │ ORDER REDIRECTED (redirect_order)                                   │     ║
║   │                                                                      │     ║
║   │   reserved_stock = (no change)                                       │     ║
║   │   current_stock  = (no change)                                       │     ║
║   │                                                                      │     ║
║   │   Effect: Stock reused for new order (no duplicate reservation)    │     ║
║   └─────────────────────────────────────────────────────────────────────┘     ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
*/

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
/*
-- Test convert_lead_to_order
SELECT convert_lead_to_order('your-lead-uuid-here');

-- Test process_dispatch
SELECT process_dispatch('your-order-uuid-here', '{"rider_name": "Test Rider"}');

-- Test redirect_order
SELECT redirect_order('failed-order-uuid', 'target-lead-uuid', 'Customer requested different address');

-- Check inventory levels
SELECT sku, current_stock, reserved_stock, (current_stock - reserved_stock) as available
FROM product_variants
WHERE reserved_stock > 0;
*/

-- =============================================================================
-- ROLLBACK
-- =============================================================================
/*
BEGIN;
DROP TRIGGER IF EXISTS trg_auto_archive_lead ON leads;
DROP TRIGGER IF EXISTS trg_auto_archive_order ON orders;
DROP TRIGGER IF EXISTS trg_release_stock_on_cancel ON orders;
DROP FUNCTION IF EXISTS auto_archive_lead();
DROP FUNCTION IF EXISTS auto_archive_order();
DROP FUNCTION IF EXISTS convert_lead_to_order(UUID, UUID);
DROP FUNCTION IF EXISTS process_dispatch(UUID, JSONB, UUID);
DROP FUNCTION IF EXISTS redirect_order(UUID, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS release_reserved_stock_on_cancel();
COMMIT;
*/
