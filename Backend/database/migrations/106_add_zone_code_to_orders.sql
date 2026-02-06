-- ============================================================================
-- Migration: 106_add_zone_code_to_orders.sql
-- Purpose: Add zone_code and destination_branch columns to orders
--          - zone_code: For inside_valley delivery zones
--          - destination_branch: For outside_valley courier branches
-- Author: Senior Database Architect
-- Date: 2026-01-29
-- ============================================================================

-- ============================================================================
-- STEP 1: Add zone_code column to orders table (Inside Valley)
-- ============================================================================

DO $$
BEGIN
    -- Add zone_code column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'zone_code'
    ) THEN
        ALTER TABLE orders ADD COLUMN zone_code TEXT;
        COMMENT ON COLUMN orders.zone_code IS 'Delivery zone code for inside_valley orders (NORTH, WEST, CENTER, EAST, LALIT)';
        RAISE NOTICE '[OK] Added zone_code column to orders';
    ELSE
        RAISE NOTICE '[SKIP] zone_code column already exists';
    END IF;
    
    -- Add destination_branch column if not exists (Outside Valley)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'destination_branch'
    ) THEN
        ALTER TABLE orders ADD COLUMN destination_branch TEXT;
        COMMENT ON COLUMN orders.destination_branch IS 'Courier branch name for outside_valley orders (e.g., Narayanghat, Pokhara)';
        RAISE NOTICE '[OK] Added destination_branch column to orders';
    ELSE
        RAISE NOTICE '[SKIP] destination_branch column already exists';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Create index for zone filtering
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_zone_code ON orders(zone_code) 
WHERE zone_code IS NOT NULL AND fulfillment_type = 'inside_valley';

-- ============================================================================
-- STEP 3: RPC to update order zone
-- ============================================================================

CREATE OR REPLACE FUNCTION update_order_zone(
    p_order_id UUID,
    p_zone_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Validate zone code
    IF p_zone_code NOT IN ('NORTH', 'WEST', 'CENTER', 'EAST', 'LALIT') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid zone code. Must be NORTH, WEST, CENTER, EAST, or LALIT'
        );
    END IF;
    
    -- Update the order
    UPDATE orders
    SET zone_code = p_zone_code,
        updated_at = NOW()
    WHERE id = p_order_id
    AND fulfillment_type = 'inside_valley';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order not found or not an inside_valley order'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'zone_code', p_zone_code
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_order_zone TO authenticated;

-- ============================================================================
-- STEP 4: Auto-assign zone based on address (optional helper)
-- ============================================================================

CREATE OR REPLACE FUNCTION suggest_zone_from_address(p_address TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_address_lower TEXT;
BEGIN
    v_address_lower := LOWER(COALESCE(p_address, ''));
    
    -- NORTH zone areas
    IF v_address_lower ~ '(swayambhu|halchowk|balaju|gongabu|samakhushi|maharajgunj|budhanilkantha|tokha|chabahil)' THEN
        RETURN 'NORTH';
    END IF;
    
    -- WEST zone areas
    IF v_address_lower ~ '(kalanki|sita paila|naikap|thankot|satungal|balkhu|kirtipur|chobhar)' THEN
        RETURN 'WEST';
    END IF;
    
    -- CENTER zone areas
    IF v_address_lower ~ '(chettrapati|thamel|asan|new road|newroad|tripureshwor|putalisadak|lazimpat|kamaladi|maitidevi|baneshwor)' THEN
        RETURN 'CENTER';
    END IF;
    
    -- EAST zone areas
    IF v_address_lower ~ '(tinkune|koteshwor|sinamangal|pepsicola|thimi|bhaktapur|suryabinayak)' THEN
        RETURN 'EAST';
    END IF;
    
    -- LALITPUR zone areas
    IF v_address_lower ~ '(kupondole|sanepa|jhamsikhel|jawalakhel|lagankhel|satdobato|bhaisepati|godawari|patan|lalitpur)' THEN
        RETURN 'LALIT';
    END IF;
    
    -- No match found
    RETURN NULL;
END;
$$;

-- ============================================================================
-- STEP 5: Verification
-- ============================================================================

SELECT 'zone_code column added' AS status
WHERE EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'zone_code'
);
