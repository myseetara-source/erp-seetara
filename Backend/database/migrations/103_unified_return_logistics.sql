-- Migration: 103_unified_return_logistics
-- Priority: P0 - UNIFIED RETURN LOGISTICS & DISPATCH SETTLEMENT
-- 
-- ARCHITECTURE:
-- Stock ONLY increments when item physically arrives at Dispatch Hub.
-- Returns flow: pending_pickup → picked_up → received_hub (stock added)
--
-- FLOW:
-- 1. Exchange/Return created → return_status = 'pending_pickup'
-- 2. Rider picks up from customer → return_status = 'picked_up'
-- 3. Rider returns to Hub → Dispatch settles → return_status = 'received_hub' → Stock+1
-- 4. If damaged → return_status = 'damaged_hub' → No stock increment

-- ============================================================================
-- STEP 1: Add return_status column to order_items
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'return_status'
    ) THEN
        ALTER TABLE order_items ADD COLUMN return_status TEXT DEFAULT 'none';
        RAISE NOTICE '[OK] Added return_status column to order_items';
    ELSE
        RAISE NOTICE '[SKIP] return_status column already exists';
    END IF;
END $$;

-- Add check constraint for valid return statuses
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE table_name = 'order_items' AND constraint_name = 'chk_return_status'
    ) THEN
        ALTER TABLE order_items ADD CONSTRAINT chk_return_status 
        CHECK (return_status IN ('none', 'pending_pickup', 'picked_up', 'received_hub', 'damaged_hub'));
        RAISE NOTICE '[OK] Added return_status check constraint';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[SKIP] Check constraint may already exist';
END $$;

-- ============================================================================
-- STEP 2: Add return tracking columns to order_items
-- ============================================================================

DO $$
BEGIN
    -- Return pickup scheduled date
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'return_pickup_date'
    ) THEN
        ALTER TABLE order_items ADD COLUMN return_pickup_date TIMESTAMPTZ;
    END IF;
    
    -- Who picked up the return (rider_id)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'return_picked_by'
    ) THEN
        ALTER TABLE order_items ADD COLUMN return_picked_by UUID;
    END IF;
    
    -- When picked up
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'return_picked_at'
    ) THEN
        ALTER TABLE order_items ADD COLUMN return_picked_at TIMESTAMPTZ;
    END IF;
    
    -- When received at hub
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'return_received_at'
    ) THEN
        ALTER TABLE order_items ADD COLUMN return_received_at TIMESTAMPTZ;
    END IF;
    
    -- Condition when received (good, damaged, missing)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'return_condition'
    ) THEN
        ALTER TABLE order_items ADD COLUMN return_condition TEXT;
    END IF;
    
    -- Notes about the return
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'return_notes'
    ) THEN
        ALTER TABLE order_items ADD COLUMN return_notes TEXT;
    END IF;
    
    -- Who settled the return at hub
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'order_items' AND column_name = 'return_settled_by'
    ) THEN
        ALTER TABLE order_items ADD COLUMN return_settled_by UUID;
    END IF;
    
    RAISE NOTICE '[OK] Added return tracking columns to order_items';
END $$;

-- ============================================================================
-- STEP 3: Add exchange/return flag to orders table
-- ============================================================================

DO $$
BEGIN
    -- Flag for dispatch UI to know there's a pickup task
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'has_exchange_pickup'
    ) THEN
        ALTER TABLE orders ADD COLUMN has_exchange_pickup BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '[OK] Added has_exchange_pickup column to orders';
    END IF;
    
    -- Flag for courier returns (outside valley)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'has_courier_return'
    ) THEN
        ALTER TABLE orders ADD COLUMN has_courier_return BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '[OK] Added has_courier_return column to orders';
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Create return_settlements table for tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS return_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    
    -- Return details
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1,
    
    -- Settlement
    condition TEXT NOT NULL CHECK (condition IN ('good', 'damaged', 'missing')),
    stock_added BOOLEAN DEFAULT FALSE,
    stock_movement_id UUID,
    
    -- Metadata
    settled_by UUID,
    settled_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_settlements_order ON return_settlements(order_id);
CREATE INDEX IF NOT EXISTS idx_return_settlements_variant ON return_settlements(variant_id);
CREATE INDEX IF NOT EXISTS idx_return_settlements_settled_at ON return_settlements(settled_at DESC);

-- ============================================================================
-- STEP 5: Create RPC function for settling returns
-- ============================================================================

CREATE OR REPLACE FUNCTION settle_return_at_hub(
    p_order_item_id UUID,
    p_condition TEXT,
    p_settled_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_item RECORD;
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_movement_id UUID;
    v_settlement_id UUID;
BEGIN
    -- Get order item details
    SELECT 
        oi.id, oi.order_id, oi.variant_id, oi.quantity, oi.return_status,
        oi.product_name, oi.sku,
        pv.current_stock
    INTO v_order_item
    FROM order_items oi
    JOIN product_variants pv ON pv.id = oi.variant_id
    WHERE oi.id = p_order_item_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Order item not found');
    END IF;
    
    -- Validate return status (must be pending_pickup or picked_up)
    IF v_order_item.return_status NOT IN ('pending_pickup', 'picked_up') THEN
        RETURN json_build_object(
            'success', FALSE, 
            'error', format('Invalid return status: %s. Must be pending_pickup or picked_up', v_order_item.return_status)
        );
    END IF;
    
    -- Update order_item based on condition
    IF p_condition = 'good' THEN
        -- Good condition: Update status and increment stock
        UPDATE order_items SET
            return_status = 'received_hub',
            return_condition = 'good',
            return_received_at = NOW(),
            return_settled_by = p_settled_by,
            return_notes = COALESCE(p_notes, return_notes)
        WHERE id = p_order_item_id;
        
        -- Increment stock
        v_current_stock := v_order_item.current_stock;
        v_new_stock := v_current_stock + v_order_item.quantity;
        
        UPDATE product_variants
        SET current_stock = v_new_stock, updated_at = NOW()
        WHERE id = v_order_item.variant_id;
        
        -- Log stock movement
        INSERT INTO stock_movements (
            variant_id, order_id, movement_type, quantity,
            balance_before, balance_after, source, reason, notes
        ) VALUES (
            v_order_item.variant_id,
            v_order_item.order_id,
            'return',
            v_order_item.quantity,
            v_current_stock,
            v_new_stock,
            'dispatch_settlement',
            'Return physically received at Hub',
            format('Settled by dispatch. Item: %s (%s)', v_order_item.product_name, v_order_item.sku)
        )
        RETURNING id INTO v_movement_id;
        
    ELSIF p_condition = 'damaged' THEN
        -- Damaged: Update status but DO NOT increment sellable stock
        UPDATE order_items SET
            return_status = 'damaged_hub',
            return_condition = 'damaged',
            return_received_at = NOW(),
            return_settled_by = p_settled_by,
            return_notes = COALESCE(p_notes, return_notes)
        WHERE id = p_order_item_id;
        
        -- Log as damaged (no stock increment)
        INSERT INTO stock_movements (
            variant_id, order_id, movement_type, quantity,
            balance_before, balance_after, source, reason, notes
        ) VALUES (
            v_order_item.variant_id,
            v_order_item.order_id,
            'damage',
            0, -- No stock change
            v_order_item.current_stock,
            v_order_item.current_stock,
            'dispatch_settlement',
            'Return received DAMAGED - not added to sellable stock',
            p_notes
        )
        RETURNING id INTO v_movement_id;
        
    ELSIF p_condition = 'missing' THEN
        -- Missing: Mark as missing
        UPDATE order_items SET
            return_status = 'damaged_hub',
            return_condition = 'missing',
            return_received_at = NOW(),
            return_settled_by = p_settled_by,
            return_notes = COALESCE(p_notes, return_notes)
        WHERE id = p_order_item_id;
        
    ELSE
        RETURN json_build_object('success', FALSE, 'error', 'Invalid condition. Must be good, damaged, or missing');
    END IF;
    
    -- Create settlement record
    INSERT INTO return_settlements (
        order_id, order_item_id, variant_id, quantity,
        condition, stock_added, stock_movement_id,
        settled_by, notes
    ) VALUES (
        v_order_item.order_id,
        p_order_item_id,
        v_order_item.variant_id,
        v_order_item.quantity,
        p_condition,
        (p_condition = 'good'),
        v_movement_id,
        p_settled_by,
        p_notes
    )
    RETURNING id INTO v_settlement_id;
    
    RETURN json_build_object(
        'success', TRUE,
        'settlement_id', v_settlement_id,
        'condition', p_condition,
        'stock_added', (p_condition = 'good'),
        'quantity', v_order_item.quantity,
        'new_stock', CASE WHEN p_condition = 'good' THEN v_new_stock ELSE v_order_item.current_stock END
    );
END;
$$;

COMMENT ON FUNCTION settle_return_at_hub IS 
'P0: Settle return at dispatch hub. 
- good: Increment stock, mark received_hub
- damaged: No stock increment, mark damaged_hub
- missing: No stock, mark as missing
Stock ONLY added when physically verified at hub.';

-- ============================================================================
-- STEP 6: Create RPC to get pending returns for a rider
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_returns_for_rider(
    p_rider_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    order_id UUID,
    order_readable_id TEXT,
    order_item_id UUID,
    variant_id UUID,
    product_name TEXT,
    variant_name TEXT,
    sku TEXT,
    quantity INTEGER,
    return_status TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    return_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id as order_id,
        o.readable_id as order_readable_id,
        oi.id as order_item_id,
        oi.variant_id,
        oi.product_name,
        oi.variant_name,
        oi.sku,
        oi.quantity,
        oi.return_status,
        o.shipping_name as customer_name,
        o.shipping_phone as customer_phone,
        o.shipping_address as customer_address,
        o.return_reason
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE 
        -- Assigned to this rider
        o.rider_id = p_rider_id
        -- Has exchange pickup or is a return
        AND (o.has_exchange_pickup = TRUE OR o.status IN ('return_initiated', 'rejected'))
        -- Item is pending pickup
        AND oi.return_status IN ('pending_pickup', 'picked_up')
        -- From today or earlier
        AND DATE(o.created_at) <= p_date
    ORDER BY o.created_at DESC;
END;
$$;

-- ============================================================================
-- STEP 7: Create RPC to get courier returns (Outside Valley)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_courier_returns(
    p_courier_partner TEXT DEFAULT NULL,
    p_date_from DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
    p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    order_id UUID,
    order_readable_id TEXT,
    order_item_id UUID,
    variant_id UUID,
    product_name TEXT,
    variant_name TEXT,
    sku TEXT,
    quantity INTEGER,
    return_status TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    courier_partner TEXT,
    awb_number TEXT,
    return_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id as order_id,
        o.readable_id as order_readable_id,
        oi.id as order_item_id,
        oi.variant_id,
        oi.product_name,
        oi.variant_name,
        oi.sku,
        oi.quantity,
        oi.return_status,
        o.shipping_name as customer_name,
        o.shipping_phone as customer_phone,
        o.courier_partner,
        o.awb_number,
        o.return_reason
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE 
        -- Outside valley orders
        o.fulfillment_type = 'outside_valley'
        -- Has courier return flag or is a return
        AND (o.has_courier_return = TRUE OR o.status IN ('return_initiated', 'rejected', 'returned'))
        -- Item is pending
        AND oi.return_status IN ('pending_pickup', 'picked_up')
        -- Filter by courier if provided
        AND (p_courier_partner IS NULL OR o.courier_partner = p_courier_partner)
        -- Date range
        AND DATE(o.created_at) BETWEEN p_date_from AND p_date_to
    ORDER BY o.created_at DESC;
END;
$$;

-- ============================================================================
-- STEP 8: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION settle_return_at_hub TO authenticated;
GRANT EXECUTE ON FUNCTION get_pending_returns_for_rider TO authenticated;
GRANT EXECUTE ON FUNCTION get_courier_returns TO authenticated;

-- Enable RLS on new table
ALTER TABLE return_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON return_settlements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_col_count INT;
    v_func_count INT;
BEGIN
    SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns 
    WHERE table_name = 'order_items' AND column_name IN ('return_status', 'return_picked_by', 'return_received_at');
    
    SELECT COUNT(*) INTO v_func_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN ('settle_return_at_hub', 'get_pending_returns_for_rider', 'get_courier_returns');
    
    RAISE NOTICE '[OK] Migration 103 complete: % return columns, % functions created', v_col_count, v_func_count;
END $$;
