-- ============================================================================
-- Migration 114: Dispatch Hub Finance & QC System
-- Purpose: Complete logistics lifecycle - Packing → Delivery → Cash → Returns
-- ============================================================================

-- ============================================================================
-- STEP 1: Create ENUM Types
-- ============================================================================

-- Settlement status enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status') THEN
        CREATE TYPE settlement_status AS ENUM (
            'pending',      -- Settlement initiated
            'partial',      -- Partial cash received
            'completed',    -- Fully settled
            'disputed'      -- Discrepancy reported
        );
    END IF;
END $$;

-- Item condition enum for QC
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'return_item_condition') THEN
        CREATE TYPE return_item_condition AS ENUM (
            'good',         -- Restock to main inventory
            'damaged',      -- Move to damaged/defect inventory
            'wrong_item',   -- Wrong item returned, flag for review
            'missing',      -- Item missing from return
            'opened'        -- Packaging opened but item OK
        );
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Create rider_settlements Table
-- Tracks cash collection and reconciliation per rider per day
-- ============================================================================

CREATE TABLE IF NOT EXISTS rider_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Rider & Date
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Order Summary
    total_orders INTEGER DEFAULT 0,
    delivered_orders INTEGER DEFAULT 0,
    returned_orders INTEGER DEFAULT 0,
    rejected_orders INTEGER DEFAULT 0,
    
    -- Financial Summary
    total_cod_expected DECIMAL(12,2) DEFAULT 0,        -- Total COD from delivered orders
    total_cod_collected DECIMAL(12,2) DEFAULT 0,       -- Actual cash received from rider
    total_prepaid DECIMAL(12,2) DEFAULT 0,             -- Prepaid order amounts
    shortage_amount DECIMAL(12,2) DEFAULT 0,           -- Expected - Collected
    
    -- Settlement Details
    status settlement_status DEFAULT 'pending',
    settled_by UUID REFERENCES users(id),              -- Who received the cash
    settled_at TIMESTAMPTZ,
    
    -- Shortage Handling
    shortage_deducted_from_wallet BOOLEAN DEFAULT FALSE,
    shortage_notes TEXT,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one settlement per rider per day
    UNIQUE(rider_id, settlement_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rider_settlements_rider ON rider_settlements(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_settlements_date ON rider_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS idx_rider_settlements_status ON rider_settlements(status);
CREATE INDEX IF NOT EXISTS idx_rider_settlements_rider_date ON rider_settlements(rider_id, settlement_date);

COMMENT ON TABLE rider_settlements IS 
'P0: Daily cash settlement tracking for riders. 
Each rider has one settlement record per day containing all COD reconciliation.';

-- ============================================================================
-- STEP 3: Create return_qc_logs Table
-- Tracks quality control for returned items
-- ============================================================================

CREATE TABLE IF NOT EXISTS return_qc_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    
    -- QC Details
    condition return_item_condition NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    
    -- Stock Action Taken
    restocked BOOLEAN DEFAULT FALSE,
    restocked_to_damaged BOOLEAN DEFAULT FALSE,
    restock_quantity INTEGER DEFAULT 0,
    
    -- Notes & Evidence
    notes TEXT,
    image_urls JSONB DEFAULT '[]'::JSONB,        -- Photos of condition
    
    -- Who & When
    qc_by UUID REFERENCES users(id),
    qc_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_return_qc_logs_order ON return_qc_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_return_qc_logs_variant ON return_qc_logs(variant_id);
CREATE INDEX IF NOT EXISTS idx_return_qc_logs_condition ON return_qc_logs(condition);
CREATE INDEX IF NOT EXISTS idx_return_qc_logs_qc_at ON return_qc_logs(qc_at);

COMMENT ON TABLE return_qc_logs IS 
'P0: Quality control log for returned items.
Tracks item condition and whether it was restocked to main or damaged inventory.';

-- ============================================================================
-- STEP 4: Create courier_manifests Table
-- Tracks courier handover batches with PDF generation support
-- ============================================================================

CREATE TABLE IF NOT EXISTS courier_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Manifest Info
    manifest_number VARCHAR(50) UNIQUE NOT NULL,
    courier_partner VARCHAR(100) NOT NULL,           -- Pathao, Sewa, NCM, etc.
    
    -- Order Summary
    total_orders INTEGER DEFAULT 0,
    total_cod_amount DECIMAL(12,2) DEFAULT 0,
    total_prepaid_amount DECIMAL(12,2) DEFAULT 0,
    total_weight_grams INTEGER DEFAULT 0,
    
    -- Handover Details
    pickup_person_name VARCHAR(200),
    pickup_person_phone VARCHAR(20),
    pickup_person_signature TEXT,                    -- Base64 signature image
    
    -- Status
    status VARCHAR(50) DEFAULT 'created',            -- created, handed_over, in_transit
    handed_over_at TIMESTAMPTZ,
    handed_over_by UUID REFERENCES users(id),
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_courier_manifests_number ON courier_manifests(manifest_number);
CREATE INDEX IF NOT EXISTS idx_courier_manifests_courier ON courier_manifests(courier_partner);
CREATE INDEX IF NOT EXISTS idx_courier_manifests_status ON courier_manifests(status);
CREATE INDEX IF NOT EXISTS idx_courier_manifests_date ON courier_manifests(created_at);

COMMENT ON TABLE courier_manifests IS 
'P0: Courier handover manifests for Outside Valley shipments.
Supports PDF generation and signature capture for legal handover.';

-- ============================================================================
-- STEP 5: Update orders Table
-- Add settlement and manifest tracking columns
-- ============================================================================

-- Add is_settled column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'is_settled'
    ) THEN
        ALTER TABLE orders ADD COLUMN is_settled BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN orders.is_settled IS 'Whether COD cash has been settled at office';
    END IF;
END $$;

-- Add settlement_id column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'settlement_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN settlement_id UUID REFERENCES rider_settlements(id);
        COMMENT ON COLUMN orders.settlement_id IS 'Link to rider settlement record';
    END IF;
END $$;

-- Add courier_manifest_id column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'courier_manifest_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN courier_manifest_id UUID REFERENCES courier_manifests(id);
        COMMENT ON COLUMN orders.courier_manifest_id IS 'Link to courier manifest for outside valley orders';
    END IF;
END $$;

-- Add packed_by column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'packed_by'
    ) THEN
        ALTER TABLE orders ADD COLUMN packed_by UUID REFERENCES users(id);
        COMMENT ON COLUMN orders.packed_by IS 'Who packed this order';
    END IF;
END $$;

-- Add qc_status column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'qc_status'
    ) THEN
        ALTER TABLE orders ADD COLUMN qc_status VARCHAR(50);
        COMMENT ON COLUMN orders.qc_status IS 'Quality control status for returns: pending, passed, failed';
    END IF;
END $$;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_orders_is_settled ON orders(is_settled) WHERE is_settled = FALSE;
CREATE INDEX IF NOT EXISTS idx_orders_settlement ON orders(settlement_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier_manifest ON orders(courier_manifest_id);

-- ============================================================================
-- STEP 6: Update riders Table
-- Add wallet balance for shortage handling
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'riders' AND column_name = 'wallet_balance'
    ) THEN
        ALTER TABLE riders ADD COLUMN wallet_balance DECIMAL(12,2) DEFAULT 0;
        COMMENT ON COLUMN riders.wallet_balance IS 'Security deposit/wallet for shortage deductions';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'riders' AND column_name = 'total_shortage'
    ) THEN
        ALTER TABLE riders ADD COLUMN total_shortage DECIMAL(12,2) DEFAULT 0;
        COMMENT ON COLUMN riders.total_shortage IS 'Cumulative shortage amount (for tracking)';
    END IF;
END $$;

-- ============================================================================
-- STEP 7: RPC Functions for Settlement Operations
-- ============================================================================

-- Function: Initialize daily settlement for a rider
CREATE OR REPLACE FUNCTION init_rider_settlement(
    p_rider_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settlement_id UUID;
    v_total_orders INTEGER;
    v_delivered INTEGER;
    v_returned INTEGER;
    v_rejected INTEGER;
    v_cod_expected DECIMAL(12,2);
    v_prepaid DECIMAL(12,2);
BEGIN
    -- Check if settlement already exists
    SELECT id INTO v_settlement_id
    FROM rider_settlements
    WHERE rider_id = p_rider_id AND settlement_date = p_date;
    
    IF v_settlement_id IS NOT NULL THEN
        RETURN v_settlement_id;
    END IF;
    
    -- Calculate order stats for the day
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'delivered'),
        COUNT(*) FILTER (WHERE status IN ('returned', 'return_initiated')),
        COUNT(*) FILTER (WHERE status = 'rejected')
    INTO v_total_orders, v_delivered, v_returned, v_rejected
    FROM orders
    WHERE rider_id = p_rider_id
    AND DATE(COALESCE(delivered_at, updated_at)) = p_date
    AND is_deleted = FALSE;
    
    -- Calculate COD expected (from delivered COD orders)
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_cod_expected
    FROM orders
    WHERE rider_id = p_rider_id
    AND status = 'delivered'
    AND payment_method = 'cod'
    AND DATE(delivered_at) = p_date
    AND is_deleted = FALSE;
    
    -- Calculate prepaid total
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_prepaid
    FROM orders
    WHERE rider_id = p_rider_id
    AND status = 'delivered'
    AND payment_method != 'cod'
    AND DATE(delivered_at) = p_date
    AND is_deleted = FALSE;
    
    -- Create settlement record
    INSERT INTO rider_settlements (
        rider_id,
        settlement_date,
        total_orders,
        delivered_orders,
        returned_orders,
        rejected_orders,
        total_cod_expected,
        total_prepaid
    ) VALUES (
        p_rider_id,
        p_date,
        v_total_orders,
        v_delivered,
        v_returned,
        v_rejected,
        v_cod_expected,
        v_prepaid
    ) RETURNING id INTO v_settlement_id;
    
    RETURN v_settlement_id;
END;
$$;

-- Function: Complete rider settlement
CREATE OR REPLACE FUNCTION complete_rider_settlement(
    p_settlement_id UUID,
    p_cash_received DECIMAL(12,2),
    p_deduct_from_wallet BOOLEAN DEFAULT FALSE,
    p_notes TEXT DEFAULT NULL,
    p_settled_by UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_settlement rider_settlements%ROWTYPE;
    v_shortage DECIMAL(12,2);
    v_new_wallet DECIMAL(12,2);
BEGIN
    -- Get settlement
    SELECT * INTO v_settlement
    FROM rider_settlements
    WHERE id = p_settlement_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Settlement not found');
    END IF;
    
    IF v_settlement.status = 'completed' THEN
        RETURN json_build_object('success', FALSE, 'error', 'Settlement already completed');
    END IF;
    
    -- Calculate shortage
    v_shortage := v_settlement.total_cod_expected - p_cash_received;
    
    -- Handle shortage with wallet deduction
    IF v_shortage > 0 AND p_deduct_from_wallet THEN
        UPDATE riders
        SET 
            wallet_balance = wallet_balance - v_shortage,
            total_shortage = total_shortage + v_shortage
        WHERE id = v_settlement.rider_id;
        
        GET DIAGNOSTICS v_new_wallet = ROW_COUNT;
    END IF;
    
    -- Update settlement
    UPDATE rider_settlements
    SET 
        total_cod_collected = p_cash_received,
        shortage_amount = GREATEST(v_shortage, 0),
        shortage_deducted_from_wallet = (v_shortage > 0 AND p_deduct_from_wallet),
        shortage_notes = p_notes,
        status = CASE 
            WHEN v_shortage <= 0 THEN 'completed'
            WHEN p_deduct_from_wallet THEN 'completed'
            ELSE 'disputed'
        END,
        settled_by = p_settled_by,
        settled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_settlement_id;
    
    -- Mark all rider's delivered orders for today as settled
    UPDATE orders
    SET 
        is_settled = TRUE,
        settlement_id = p_settlement_id
    WHERE rider_id = v_settlement.rider_id
    AND status = 'delivered'
    AND DATE(delivered_at) = v_settlement.settlement_date
    AND is_settled = FALSE;
    
    RETURN json_build_object(
        'success', TRUE,
        'settlement_id', p_settlement_id,
        'cash_received', p_cash_received,
        'shortage', v_shortage,
        'shortage_handled', (v_shortage > 0 AND p_deduct_from_wallet)
    );
END;
$$;

-- Function: Process return QC and restock
CREATE OR REPLACE FUNCTION process_return_qc(
    p_order_id UUID,
    p_items JSONB,  -- [{variant_id, quantity, condition, notes}]
    p_qc_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_restocked INTEGER := 0;
    v_damaged INTEGER := 0;
    v_flagged INTEGER := 0;
    v_condition return_item_condition;
    v_variant_id UUID;
    v_quantity INTEGER;
BEGIN
    -- Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
        v_condition := (v_item->>'condition')::return_item_condition;
        
        -- Insert QC log
        INSERT INTO return_qc_logs (
            order_id, variant_id, condition, quantity,
            restocked, restocked_to_damaged, restock_quantity,
            notes, qc_by
        ) VALUES (
            p_order_id, v_variant_id, v_condition, v_quantity,
            (v_condition = 'good'),
            (v_condition = 'damaged'),
            CASE WHEN v_condition IN ('good', 'damaged') THEN v_quantity ELSE 0 END,
            v_item->>'notes', p_qc_by
        );
        
        -- Handle stock based on condition
        IF v_condition = 'good' THEN
            -- Restock to main inventory
            PERFORM restore_stock_return_atomic(v_variant_id, v_quantity, p_order_id, 'Return QC - Good condition');
            v_restocked := v_restocked + v_quantity;
            
        ELSIF v_condition = 'damaged' THEN
            -- Add to damaged inventory (increment damaged_stock if column exists)
            UPDATE product_variants
            SET 
                damaged_stock = COALESCE(damaged_stock, 0) + v_quantity,
                updated_at = NOW()
            WHERE id = v_variant_id;
            v_damaged := v_damaged + v_quantity;
            
        ELSIF v_condition = 'wrong_item' THEN
            v_flagged := v_flagged + 1;
        END IF;
    END LOOP;
    
    -- Update order QC status
    UPDATE orders
    SET 
        qc_status = CASE 
            WHEN v_flagged > 0 THEN 'needs_review'
            ELSE 'passed'
        END,
        status = 'returned',
        returned_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;
    
    RETURN json_build_object(
        'success', TRUE,
        'restocked', v_restocked,
        'damaged', v_damaged,
        'flagged', v_flagged
    );
END;
$$;

-- Function: Generate manifest number
CREATE OR REPLACE FUNCTION generate_manifest_number(p_courier VARCHAR)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_date_part VARCHAR;
    v_seq INTEGER;
    v_manifest_number VARCHAR;
BEGIN
    v_date_part := TO_CHAR(NOW(), 'YYYYMMDD');
    
    SELECT COALESCE(MAX(
        SUBSTRING(manifest_number FROM '[0-9]+$')::INTEGER
    ), 0) + 1 INTO v_seq
    FROM courier_manifests
    WHERE manifest_number LIKE v_date_part || '%';
    
    v_manifest_number := v_date_part || '-' || UPPER(LEFT(p_courier, 3)) || '-' || LPAD(v_seq::TEXT, 3, '0');
    
    RETURN v_manifest_number;
END;
$$;

-- ============================================================================
-- STEP 8: Grant Permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON rider_settlements TO authenticated;
GRANT SELECT, INSERT ON return_qc_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON courier_manifests TO authenticated;
GRANT EXECUTE ON FUNCTION init_rider_settlement TO authenticated;
GRANT EXECUTE ON FUNCTION complete_rider_settlement TO authenticated;
GRANT EXECUTE ON FUNCTION process_return_qc TO authenticated;
GRANT EXECUTE ON FUNCTION generate_manifest_number TO authenticated;

-- ============================================================================
-- STEP 9: RLS Policies
-- ============================================================================

ALTER TABLE rider_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_qc_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_manifests ENABLE ROW LEVEL SECURITY;

-- Rider Settlements RLS
CREATE POLICY "rider_settlements_select_policy" ON rider_settlements
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "rider_settlements_insert_policy" ON rider_settlements
    FOR INSERT TO authenticated
    WITH CHECK (TRUE);

CREATE POLICY "rider_settlements_update_policy" ON rider_settlements
    FOR UPDATE TO authenticated
    USING (TRUE);

-- Return QC Logs RLS
CREATE POLICY "return_qc_logs_select_policy" ON return_qc_logs
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "return_qc_logs_insert_policy" ON return_qc_logs
    FOR INSERT TO authenticated
    WITH CHECK (TRUE);

-- Courier Manifests RLS
CREATE POLICY "courier_manifests_select_policy" ON courier_manifests
    FOR SELECT TO authenticated
    USING (TRUE);

CREATE POLICY "courier_manifests_insert_policy" ON courier_manifests
    FOR INSERT TO authenticated
    WITH CHECK (TRUE);

CREATE POLICY "courier_manifests_update_policy" ON courier_manifests
    FOR UPDATE TO authenticated
    USING (TRUE);

-- ============================================================================
-- STEP 10: Add damaged_stock column to product_variants if not exists
-- ============================================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_variants' AND column_name = 'damaged_stock'
    ) THEN
        ALTER TABLE product_variants ADD COLUMN damaged_stock INTEGER DEFAULT 0;
        COMMENT ON COLUMN product_variants.damaged_stock IS 'Damaged/defective items count from returns';
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_tables INTEGER;
    v_functions INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_tables
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('rider_settlements', 'return_qc_logs', 'courier_manifests');
    
    SELECT COUNT(*) INTO v_functions
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN ('init_rider_settlement', 'complete_rider_settlement', 'process_return_qc', 'generate_manifest_number');
    
    RAISE NOTICE '[OK] Migration 114 complete: % tables, % functions created', v_tables, v_functions;
END $$;
