-- =============================================================================
-- MIGRATION 060: MASTER SCHEMA - 3 ENGINES FOUNDATION
-- =============================================================================
-- 
-- DATE: 2026-01-25
-- AUTHOR: Senior Database Architect
-- PURPOSE: Create the foundational 3-Engine architecture for Order Management
--
-- ARCHITECTURE (3 ENGINES):
-- ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
-- │     LEADS       │───▶│     ORDERS      │───▶│    ARCHIVES     │
-- │ (Sales Engine)  │    │(Logistics Engine)│   │ (History Engine)│
-- └─────────────────┘    └─────────────────┘    └─────────────────┘
--
-- ENUMS (The Rules):
-- • location_type  → Geography-based routing
-- • lead_status    → Sales pipeline stages
-- • order_status   → Logistics workflow states
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: DEFINE STRICT ENUMs (The Rules)
-- =============================================================================

-- 1.1 LOCATION TYPE (Geography-based routing)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'location_type') THEN
        CREATE TYPE location_type AS ENUM (
            'INSIDE_VALLEY',    -- Kathmandu Valley (Rider delivery)
            'OUTSIDE_VALLEY',   -- Rest of Nepal (Courier delivery)
            'POS'               -- Point of Sale (Store pickup)
        );
        RAISE NOTICE '✅ Created ENUM: location_type';
    ELSE
        RAISE NOTICE '⏭️ ENUM location_type already exists';
    END IF;
END $$;

-- 1.2 LEAD STATUS (Sales Pipeline)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
        CREATE TYPE lead_status AS ENUM (
            'INTAKE',       -- New lead, initial contact
            'FOLLOW_UP',    -- Needs follow-up
            'CANCELLED',    -- Lead cancelled/not interested
            'CONVERTED'     -- Successfully converted to order
        );
        RAISE NOTICE '✅ Created ENUM: lead_status';
    ELSE
        RAISE NOTICE '⏭️ ENUM lead_status already exists';
    END IF;
END $$;

-- 1.3 ORDER STATUS (Logistics Workflow - 13 States)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_v2') THEN
        CREATE TYPE order_status_v2 AS ENUM (
            -- Preparation Phase
            'PACKED',               -- Order packed and ready
            'ASSIGNED',             -- Assigned to rider/courier
            
            -- Delivery Phase
            'SENT_FOR_DELIVERY',    -- Handed to delivery partner
            'DISPATCHED',           -- On the way to customer
            'DELIVERED',            -- Successfully delivered
            
            -- Issue Handling
            'REJECTED',             -- Customer rejected delivery
            'NEXT_ATTEMPT',         -- Scheduled for next delivery attempt
            'HOLD',                 -- Temporarily on hold
            
            -- Return & Exchange
            'RE_DIRECTED',          -- Redirected to different address
            'RETURN_RECEIVED',      -- Return received back at warehouse
            'EXCHANGED',            -- Exchanged with new order
            
            -- Refund
            'REFUND_REQUESTED',     -- Customer requested refund
            'REFUNDED'              -- Refund processed
        );
        RAISE NOTICE '✅ Created ENUM: order_status_v2';
    ELSE
        RAISE NOTICE '⏭️ ENUM order_status_v2 already exists';
    END IF;
END $$;

-- 1.4 ARCHIVE SOURCE TYPE
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'archive_source') THEN
        CREATE TYPE archive_source AS ENUM (
            'leads',
            'orders'
        );
        RAISE NOTICE '✅ Created ENUM: archive_source';
    ELSE
        RAISE NOTICE '⏭️ ENUM archive_source already exists';
    END IF;
END $$;

-- =============================================================================
-- SECTION 2: ENGINE 1 - LEADS (Sales Engine)
-- =============================================================================

CREATE TABLE IF NOT EXISTS leads (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Customer Information (JSONB for flexibility)
    customer_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Schema: {
    --   "name": "Ram Bahadur",
    --   "phone": "9801234567",
    --   "alt_phone": "9807654321",
    --   "email": "ram@email.com",
    --   "address": "Baluwatar, Kathmandu",
    --   "landmark": "Near Nepal Bank"
    -- }
    
    -- Status & Location
    status lead_status NOT NULL DEFAULT 'INTAKE',
    location location_type NOT NULL DEFAULT 'INSIDE_VALLEY',
    
    -- Product Interest (JSONB array)
    items_interest JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Schema: [
    --   { "variant_id": "uuid", "name": "iPhone 15", "qty": 1, "price": 150000 },
    --   { "variant_id": "uuid", "name": "AirPods Pro", "qty": 1, "price": 35000 }
    -- ]
    
    -- Sales Management
    source VARCHAR(50) DEFAULT 'manual',
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    followup_date TIMESTAMPTZ,
    notes TEXT,
    
    -- Conversion Tracking
    converted_order_id UUID,  -- Set when lead converts to order
    converted_at TIMESTAMPTZ,
    
    -- Audit
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Sales Engine
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_location ON leads(location);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads((customer_info->>'phone'));
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(followup_date) WHERE status = 'FOLLOW_UP';
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- GIN index for JSONB search
CREATE INDEX IF NOT EXISTS idx_leads_customer_gin ON leads USING gin(customer_info);
CREATE INDEX IF NOT EXISTS idx_leads_items_gin ON leads USING gin(items_interest);

-- =============================================================================
-- SECTION 3: ENGINE 2 - ORDERS (Logistics Engine)
-- =============================================================================

-- 3.1 Add new columns to existing orders table
-- Lead reference (links order to source lead)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'lead_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
        RAISE NOTICE '✅ Added column: orders.lead_id';
    ELSE
        RAISE NOTICE '⏭️ Column orders.lead_id already exists';
    END IF;
END $$;

-- Readable ID (human-friendly: ORD-20260125-0001)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'readable_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN readable_id VARCHAR(30) UNIQUE;
        RAISE NOTICE '✅ Added column: orders.readable_id';
    ELSE
        RAISE NOTICE '⏭️ Column orders.readable_id already exists';
    END IF;
END $$;

-- Delivery Metadata (JSONB for Rider/Courier info)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'delivery_metadata'
    ) THEN
        ALTER TABLE orders ADD COLUMN delivery_metadata JSONB DEFAULT '{}'::jsonb;
        -- Schema for INSIDE_VALLEY (Rider): {
        --   "type": "rider",
        --   "rider_id": "uuid",
        --   "rider_name": "Hari",
        --   "rider_phone": "9801111111",
        --   "vehicle_number": "Ba 1 Pa 1234"
        -- }
        -- Schema for OUTSIDE_VALLEY (Courier): {
        --   "type": "courier",
        --   "courier_name": "NCM Express",
        --   "awb": "NCM123456789",
        --   "tracking_url": "https://ncm.com/track/..."
        -- }
        RAISE NOTICE '✅ Added column: orders.delivery_metadata';
    ELSE
        RAISE NOTICE '⏭️ Column orders.delivery_metadata already exists';
    END IF;
END $$;

-- Parent Order ID (For Exchange/Redirect - self-referencing FK)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'parent_order_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN parent_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
        RAISE NOTICE '✅ Added column: orders.parent_order_id';
    ELSE
        RAISE NOTICE '⏭️ Column orders.parent_order_id already exists';
    END IF;
END $$;

-- Location type column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'location'
    ) THEN
        ALTER TABLE orders ADD COLUMN location location_type DEFAULT 'INSIDE_VALLEY';
        RAISE NOTICE '✅ Added column: orders.location';
    ELSE
        RAISE NOTICE '⏭️ Column orders.location already exists';
    END IF;
END $$;

-- Indexes for Logistics Engine
CREATE INDEX IF NOT EXISTS idx_orders_lead ON orders(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_readable ON orders(readable_id) WHERE readable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_parent ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(location);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_gin ON orders USING gin(delivery_metadata);

-- Add FK constraint from leads.converted_order_id to orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_leads_converted_order'
    ) THEN
        ALTER TABLE leads 
        ADD CONSTRAINT fk_leads_converted_order 
        FOREIGN KEY (converted_order_id) REFERENCES orders(id) ON DELETE SET NULL;
        RAISE NOTICE '✅ Added FK: leads.converted_order_id → orders.id';
    ELSE
        RAISE NOTICE '⏭️ FK fk_leads_converted_order already exists';
    END IF;
END $$;

-- =============================================================================
-- SECTION 4: ENGINE 3 - ARCHIVES (History Engine)
-- =============================================================================

CREATE TABLE IF NOT EXISTS archives (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Original Record Reference
    original_id UUID NOT NULL,
    source_table archive_source NOT NULL,
    
    -- Complete Snapshot (JSONB)
    original_data JSONB NOT NULL,
    
    -- Archive Metadata
    reason VARCHAR(100) NOT NULL,
    -- Examples: 'completed', 'cancelled', 'expired', 'manual', 'gdpr_request'
    
    archived_by UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Optional: Expiry for GDPR compliance
    expires_at TIMESTAMPTZ
);

-- Indexes for History Engine
CREATE INDEX IF NOT EXISTS idx_archives_source ON archives(source_table, original_id);
CREATE INDEX IF NOT EXISTS idx_archives_archived_at ON archives(archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_archives_reason ON archives(reason);
CREATE INDEX IF NOT EXISTS idx_archives_expires ON archives(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_archives_data_gin ON archives USING gin(original_data);

-- =============================================================================
-- SECTION 5: INVENTORY LOGIC (Reserved Stock)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_variants' AND column_name = 'reserved_stock'
    ) THEN
        ALTER TABLE product_variants 
        ADD COLUMN reserved_stock INTEGER NOT NULL DEFAULT 0
        CONSTRAINT chk_reserved_stock_positive CHECK (reserved_stock >= 0);
        RAISE NOTICE '✅ Added column: product_variants.reserved_stock';
    ELSE
        RAISE NOTICE '⏭️ Column product_variants.reserved_stock already exists';
    END IF;
END $$;

-- =============================================================================
-- SECTION 6: HELPER FUNCTIONS
-- =============================================================================

-- 6.1 Generate Readable Order ID
CREATE OR REPLACE FUNCTION generate_readable_id(prefix VARCHAR DEFAULT 'ORD')
RETURNS VARCHAR AS $$
DECLARE
    today_str VARCHAR;
    seq_num INTEGER;
BEGIN
    today_str := TO_CHAR(NOW(), 'YYYYMMDD');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(readable_id FROM '[0-9]+$') AS INTEGER)
    ), 0) + 1
    INTO seq_num
    FROM orders
    WHERE readable_id LIKE prefix || '-' || today_str || '-%';
    
    RETURN prefix || '-' || today_str || '-' || LPAD(seq_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 6.2 Convert Lead to Order
CREATE OR REPLACE FUNCTION convert_lead_to_order(p_lead_id UUID)
RETURNS UUID AS $$
DECLARE
    v_lead RECORD;
    v_order_id UUID;
    v_customer_id UUID;
    v_readable_id VARCHAR;
BEGIN
    -- Get lead
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
    
    IF v_lead IS NULL THEN
        RAISE EXCEPTION 'Lead not found: %', p_lead_id;
    END IF;
    
    IF v_lead.status = 'CONVERTED' THEN
        RAISE EXCEPTION 'Lead already converted';
    END IF;
    
    -- Find or create customer
    SELECT id INTO v_customer_id
    FROM customers 
    WHERE phone = v_lead.customer_info->>'phone'
    LIMIT 1;
    
    IF v_customer_id IS NULL THEN
        INSERT INTO customers (name, phone, default_address)
        VALUES (
            v_lead.customer_info->>'name',
            v_lead.customer_info->>'phone',
            v_lead.customer_info->>'address'
        )
        RETURNING id INTO v_customer_id;
    END IF;
    
    -- Generate readable ID
    v_readable_id := generate_readable_id('ORD');
    
    -- Create order
    INSERT INTO orders (
        customer_id, lead_id, readable_id, location,
        order_number, source, shipping_name, shipping_phone, shipping_address
    )
    VALUES (
        v_customer_id, p_lead_id, v_readable_id, v_lead.location,
        'ORD-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        COALESCE(v_lead.source, 'lead'),
        v_lead.customer_info->>'name',
        v_lead.customer_info->>'phone',
        v_lead.customer_info->>'address'
    )
    RETURNING id INTO v_order_id;
    
    -- Update lead
    UPDATE leads
    SET status = 'CONVERTED',
        converted_order_id = v_order_id,
        converted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_lead_id;
    
    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql;

-- 6.3 Archive Record
CREATE OR REPLACE FUNCTION archive_record(
    p_id UUID,
    p_source archive_source,
    p_reason VARCHAR DEFAULT 'completed'
)
RETURNS UUID AS $$
DECLARE
    v_archive_id UUID;
    v_data JSONB;
BEGIN
    IF p_source = 'leads' THEN
        SELECT to_jsonb(l.*) INTO v_data FROM leads l WHERE l.id = p_id;
    ELSIF p_source = 'orders' THEN
        SELECT to_jsonb(o.*) INTO v_data FROM orders o WHERE o.id = p_id;
    END IF;
    
    IF v_data IS NULL THEN
        RAISE EXCEPTION 'Record not found';
    END IF;
    
    INSERT INTO archives (original_id, source_table, original_data, reason)
    VALUES (p_id, p_source, v_data, p_reason)
    RETURNING id INTO v_archive_id;
    
    RETURN v_archive_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 7: TRIGGERS
-- =============================================================================

-- Auto-update updated_at for leads
CREATE OR REPLACE FUNCTION trg_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION trg_leads_updated_at();

-- =============================================================================
-- SECTION 8: ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE archives ENABLE ROW LEVEL SECURITY;

-- Leads policies
DROP POLICY IF EXISTS "leads_authenticated_select" ON leads;
CREATE POLICY "leads_authenticated_select" ON leads
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "leads_authenticated_insert" ON leads;
CREATE POLICY "leads_authenticated_insert" ON leads
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "leads_authenticated_update" ON leads;
CREATE POLICY "leads_authenticated_update" ON leads
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Archives policies (read-only for most)
DROP POLICY IF EXISTS "archives_authenticated_select" ON archives;
CREATE POLICY "archives_authenticated_select" ON archives
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "archives_authenticated_insert" ON archives;
CREATE POLICY "archives_authenticated_insert" ON archives
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- =============================================================================
-- SECTION 9: DOCUMENTATION
-- =============================================================================

COMMENT ON TYPE location_type IS 'Nepal geography: INSIDE_VALLEY (Rider), OUTSIDE_VALLEY (Courier), POS (Store)';
COMMENT ON TYPE lead_status IS 'Sales pipeline: INTAKE → FOLLOW_UP → CONVERTED/CANCELLED';
COMMENT ON TYPE order_status_v2 IS 'Logistics workflow: PACKED → ASSIGNED → DELIVERED (with issue handling)';

COMMENT ON TABLE leads IS 'ENGINE 1: Sales Engine - Active leads in CRM pipeline';
COMMENT ON TABLE archives IS 'ENGINE 3: History Engine - Archived leads and orders';

COMMENT ON COLUMN leads.customer_info IS 'JSONB: {name, phone, alt_phone, email, address, landmark}';
COMMENT ON COLUMN leads.items_interest IS 'JSONB array: [{variant_id, name, qty, price}, ...]';
COMMENT ON COLUMN orders.readable_id IS 'Human-friendly ID: ORD-YYYYMMDD-NNNN';
COMMENT ON COLUMN orders.delivery_metadata IS 'JSONB: Rider details (valley) or Courier/AWB (outside)';
COMMENT ON COLUMN orders.parent_order_id IS 'Self-reference for Exchange/Redirect orders';

COMMIT;

-- =============================================================================
-- VERIFICATION (Run after migration)
-- =============================================================================
/*
-- Check ENUMs
SELECT typname, array_agg(enumlabel ORDER BY enumsortorder) as values
FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE typname IN ('location_type', 'lead_status', 'order_status_v2', 'archive_source')
GROUP BY typname;

-- Check tables
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('leads', 'archives') AND table_schema = 'public';

-- Check new order columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('lead_id', 'readable_id', 'delivery_metadata', 'parent_order_id', 'location');

-- Test readable ID
SELECT generate_readable_id('ORD');
*/

-- =============================================================================
-- ROLLBACK (If needed)
-- =============================================================================
/*
BEGIN;
DROP TRIGGER IF EXISTS leads_updated_at ON leads;
DROP FUNCTION IF EXISTS trg_leads_updated_at();
DROP FUNCTION IF EXISTS generate_readable_id(VARCHAR);
DROP FUNCTION IF EXISTS convert_lead_to_order(UUID);
DROP FUNCTION IF EXISTS archive_record(UUID, archive_source, VARCHAR);
DROP TABLE IF EXISTS archives CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
ALTER TABLE orders DROP COLUMN IF EXISTS lead_id;
ALTER TABLE orders DROP COLUMN IF EXISTS readable_id;
ALTER TABLE orders DROP COLUMN IF EXISTS delivery_metadata;
ALTER TABLE orders DROP COLUMN IF EXISTS parent_order_id;
ALTER TABLE orders DROP COLUMN IF EXISTS location;
DROP TYPE IF EXISTS location_type CASCADE;
DROP TYPE IF EXISTS lead_status CASCADE;
DROP TYPE IF EXISTS order_status_v2 CASCADE;
DROP TYPE IF EXISTS archive_source CASCADE;
COMMIT;
*/
