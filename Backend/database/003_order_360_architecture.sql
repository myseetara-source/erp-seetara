-- =============================================================================
-- SEETARA ERP - ORDER 360 ARCHITECTURE UPGRADE
-- =============================================================================
--
-- Version: 3.0.0
-- Generated: 2026-01-22
-- 
-- This migration upgrades the order system to capture comprehensive data for:
-- ✅ Marketing Attribution (Meta CAPI, UTM, Pixel tracking)
-- ✅ Customer Snapshot (Frozen at order time)
-- ✅ Financial Breakdown (Structured pricing)
-- ✅ Logistics Metadata (Delivery intelligence)
-- ✅ Follow-up/Call Tracking (CRM calls history)
-- ✅ Enhanced Audit Trail (Field-level change tracking)
--
-- DESIGN PHILOSOPHY:
-- - Core columns for filterable/indexable data
-- - JSONB for flexible, extensible metadata
-- - Separate tables for one-to-many relationships (calls, logs)
-- - Designed for 10,000+ orders/day scale
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: ENUMS FOR FOLLOWUPS
-- =============================================================================

-- Follow-up call response status
DO $$ BEGIN
    CREATE TYPE followup_response AS ENUM (
        'answered',
        'no_answer',
        'switched_off',
        'busy',
        'wrong_number',
        'callback_requested',
        'number_not_reachable',
        'confirmed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Audit action types
DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
        'CREATE',
        'UPDATE',
        'DELETE',
        'STATUS_CHANGE',
        'ASSIGN',
        'UNASSIGN',
        'PAYMENT',
        'CANCEL',
        'RESTORE'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- SECTION 2: UPGRADE ORDERS TABLE
-- =============================================================================

-- 2.1 Marketing Metadata (Meta Pixel, UTM, Attribution)
-- Stores: ip_address, user_agent, fbid, fbc, fbp, pixel_event_id, utm_*
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS marketing_metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN orders.marketing_metadata IS 'Marketing attribution data: {ip_address, user_agent, fbid, fbc, fbp, pixel_event_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_page}';

-- 2.2 Logistics Metadata (Delivery intelligence)
-- Stores: nearest_branch, courier_partner_id, delivery_instructions, attempts, etc.
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS logistics_metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN orders.logistics_metadata IS 'Logistics intelligence: {nearest_branch, zone_id, delivery_instructions, rider_comments, preferred_time, weight_kg, dimensions, is_fragile, delivery_attempts: [{attempt: 1, status: "failed", reason: "customer not home", timestamp: "..."}]}';

-- 2.3 Customer Snapshot (Frozen at order time)
-- CRITICAL: If customer updates address later, old order data MUST NOT change
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS customer_snapshot JSONB DEFAULT '{}';

COMMENT ON COLUMN orders.customer_snapshot IS 'Frozen customer data at order time: {name, phone, alt_phone, email, address_line1, address_line2, city, district, state, pincode, landmark, geo_lat, geo_lng, customer_notes}';

-- 2.4 Financial Snapshot (Structured breakdown)
-- Keeps detailed pricing for reconciliation
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS financial_snapshot JSONB DEFAULT '{}';

COMMENT ON COLUMN orders.financial_snapshot IS 'Detailed financial breakdown: {items_subtotal, shipping_calculated, shipping_applied, discount_percent, discount_flat, discount_code, prepaid_amount, cod_amount, tax_amount, adjustments: [{reason: "...", amount: -50}], final_total}';

-- 2.5 Processing Metadata (Internal workflow)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS processing_metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN orders.processing_metadata IS 'Workflow metadata: {created_via, created_by_role, verification_status, verification_notes, packed_by, packed_at, qc_checked_by, qc_notes}';

-- 2.6 Indexes for JSONB columns (for common queries)
CREATE INDEX IF NOT EXISTS idx_orders_marketing_utm_source 
ON orders ((marketing_metadata->>'utm_source')) 
WHERE marketing_metadata->>'utm_source' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_marketing_fbp 
ON orders ((marketing_metadata->>'fbp')) 
WHERE marketing_metadata->>'fbp' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_logistics_zone 
ON orders ((logistics_metadata->>'zone_id')) 
WHERE logistics_metadata->>'zone_id' IS NOT NULL;

-- =============================================================================
-- SECTION 3: ORDER FOLLOWUPS TABLE (CRM Call History)
-- =============================================================================

CREATE TABLE IF NOT EXISTS order_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    
    -- Call Details
    attempt_number INTEGER NOT NULL DEFAULT 1,
    response_status followup_response NOT NULL,
    call_duration_seconds INTEGER DEFAULT 0,
    
    -- Notes & Action
    remarks TEXT,
    outcome TEXT, -- 'confirmed', 'need_callback', 'cancelled', etc.
    
    -- Scheduling
    next_followup_date TIMESTAMPTZ,
    next_followup_assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Meta
    phone_called VARCHAR(20), -- Which phone was called (primary/alt)
    call_method VARCHAR(20) DEFAULT 'manual', -- 'manual', 'auto_dialer', 'sms'
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure attempt numbers are sequential per order
    CONSTRAINT unique_order_attempt UNIQUE (order_id, attempt_number)
);

COMMENT ON TABLE order_followups IS 'CRM call history and follow-up tracking for each order';

-- Indexes for followups
CREATE INDEX IF NOT EXISTS idx_followups_order_id ON order_followups(order_id);
CREATE INDEX IF NOT EXISTS idx_followups_staff_id ON order_followups(staff_id);
CREATE INDEX IF NOT EXISTS idx_followups_status ON order_followups(response_status);
CREATE INDEX IF NOT EXISTS idx_followups_next_date ON order_followups(next_followup_date) 
WHERE next_followup_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_followups_created_at ON order_followups(created_at);

-- =============================================================================
-- SECTION 4: ENHANCED AUDIT LOGS (Time Machine)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What was changed
    entity_type VARCHAR(50) NOT NULL, -- 'order', 'product', 'customer', etc.
    entity_id UUID NOT NULL,
    
    -- Action details
    action audit_action NOT NULL,
    field_changed VARCHAR(100), -- Specific field that changed (null for CREATE/DELETE)
    
    -- Values
    old_value TEXT, -- JSON stringified old value
    new_value TEXT, -- JSON stringified new value
    
    -- Context
    description TEXT, -- Human readable: "Status changed from intake to converted"
    
    -- Who & When
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    performed_by_name VARCHAR(255), -- Snapshot in case user is deleted
    performed_by_role VARCHAR(50),
    
    -- Technical Context
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    
    -- Related IDs (for joins)
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all entity changes (Time Machine)';

-- Indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_performed_by ON audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_order_id ON audit_logs(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_ip ON audit_logs(ip_address) WHERE ip_address IS NOT NULL;

-- Partition audit_logs by month for performance (optional, for very high volume)
-- CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- =============================================================================
-- SECTION 5: ORDER NOTES TABLE (Separate from main table for cleanliness)
-- =============================================================================

CREATE TABLE IF NOT EXISTS order_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    note_type VARCHAR(50) NOT NULL DEFAULT 'internal', -- 'internal', 'customer', 'system', 'logistics'
    content TEXT NOT NULL,
    
    -- Visibility
    is_pinned BOOLEAN DEFAULT FALSE,
    is_customer_visible BOOLEAN DEFAULT FALSE,
    
    -- Meta
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_notes IS 'Threaded notes for orders (replaces internal_notes column)';

CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON order_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_type ON order_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_order_notes_pinned ON order_notes(order_id) WHERE is_pinned = TRUE;

-- =============================================================================
-- SECTION 6: ORDER STATUS TIMELINE (Alternative to order_logs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS order_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Status Change
    from_status order_status,
    to_status order_status NOT NULL,
    
    -- Context
    event_type VARCHAR(50) NOT NULL DEFAULT 'status_change', -- 'status_change', 'assignment', 'note', 'call', 'sms', 'payment'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Who
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    performed_by_name VARCHAR(255),
    
    -- Related
    related_entity_type VARCHAR(50), -- 'followup', 'payment', 'logistics'
    related_entity_id UUID,
    
    -- Meta
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_timeline IS 'Complete timeline of all order events for Order Detail page';

CREATE INDEX IF NOT EXISTS idx_timeline_order_id ON order_timeline(order_id);
CREATE INDEX IF NOT EXISTS idx_timeline_created_at ON order_timeline(created_at);
CREATE INDEX IF NOT EXISTS idx_timeline_event_type ON order_timeline(event_type);

-- =============================================================================
-- SECTION 7: HELPER FUNCTIONS
-- =============================================================================

-- 7.1 Function to auto-log order status changes
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_timeline (
            order_id,
            from_status,
            to_status,
            event_type,
            title,
            description,
            performed_by,
            metadata
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            'status_change',
            'Status changed to ' || NEW.status,
            'Order status updated from ' || COALESCE(OLD.status::text, 'new') || ' to ' || NEW.status,
            NEW.assigned_to, -- Best guess; actual user should be set by app
            jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS trg_order_status_timeline ON orders;
CREATE TRIGGER trg_order_status_timeline
AFTER UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- 7.2 Function to get next followup attempt number
CREATE OR REPLACE FUNCTION get_next_followup_attempt(p_order_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_max INTEGER;
BEGIN
    SELECT COALESCE(MAX(attempt_number), 0) INTO v_max
    FROM order_followups
    WHERE order_id = p_order_id;
    
    RETURN v_max + 1;
END;
$$ LANGUAGE plpgsql;

-- 7.3 Function to update followup_count on orders
CREATE OR REPLACE FUNCTION update_order_followup_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE orders
    SET followup_count = (
        SELECT COUNT(*) FROM order_followups WHERE order_id = NEW.order_id
    ),
    updated_at = NOW()
    WHERE id = NEW.order_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_followup_count ON order_followups;
CREATE TRIGGER trg_update_followup_count
AFTER INSERT ON order_followups
FOR EACH ROW EXECUTE FUNCTION update_order_followup_count();

-- =============================================================================
-- SECTION 8: SAMPLE DATA STRUCTURE COMMENTS
-- =============================================================================

-- marketing_metadata structure:
/*
{
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "fbid": "fb_user_12345",
    "fbc": "fb.1.1234567890.abcdefg",
    "fbp": "fb.1.1234567890.hijklmn",
    "pixel_event_id": "evt_abc123",
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "winter_sale",
    "utm_content": "carousel_ad",
    "utm_term": "jacket",
    "referrer": "https://facebook.com/ads",
    "landing_page": "/products/winter-jacket",
    "session_id": "sess_xyz789",
    "device_type": "mobile",
    "browser": "Chrome",
    "os": "iOS"
}
*/

-- logistics_metadata structure:
/*
{
    "nearest_branch": "Kathmandu-Main",
    "zone_id": "zone_ktm_01",
    "courier_partner_id": "ncm",
    "delivery_instructions": "Call before coming",
    "preferred_delivery_time": "evening",
    "rider_comments": "Gate is blue colored",
    "weight_kg": 0.5,
    "dimensions": {"l": 30, "w": 20, "h": 10},
    "is_fragile": false,
    "requires_signature": false,
    "delivery_attempts": [
        {
            "attempt": 1,
            "status": "failed",
            "reason": "Customer not home",
            "timestamp": "2026-01-22T14:30:00Z",
            "rider_id": "uuid",
            "location": {"lat": 27.7, "lng": 85.3}
        }
    ]
}
*/

-- customer_snapshot structure:
/*
{
    "name": "Ram Thapa",
    "phone": "+977-9812345678",
    "alt_phone": "+977-9823456789",
    "email": "ram@example.com",
    "address_line1": "123 Main Street",
    "address_line2": "Near Temple",
    "city": "Kathmandu",
    "district": "Kathmandu",
    "state": "Bagmati",
    "pincode": "44600",
    "landmark": "Opposite to Blue Hospital",
    "geo_lat": 27.7172,
    "geo_lng": 85.3240,
    "customer_tier": "vip",
    "total_orders": 15,
    "customer_notes": "Prefers evening delivery"
}
*/

-- financial_snapshot structure:
/*
{
    "items_subtotal": 2500.00,
    "shipping_calculated": 150.00,
    "shipping_applied": 100.00,
    "shipping_discount": 50.00,
    "product_discount_percent": 10,
    "product_discount_amount": 250.00,
    "coupon_code": "WINTER20",
    "coupon_discount": 0,
    "prepaid_amount": 500.00,
    "cod_amount": 1850.00,
    "tax_rate": 0,
    "tax_amount": 0,
    "final_total": 2350.00,
    "adjustments": [
        {"reason": "Price match", "amount": -100, "added_by": "admin"}
    ]
}
*/

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check new columns exist
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders' ORDER BY ordinal_position;

-- Check new tables exist
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('order_followups', 'audit_logs', 'order_notes', 'order_timeline');

-- =============================================================================
-- ROLLBACK (If needed)
-- =============================================================================
/*
-- To rollback:
ALTER TABLE orders DROP COLUMN IF EXISTS marketing_metadata;
ALTER TABLE orders DROP COLUMN IF EXISTS logistics_metadata;
ALTER TABLE orders DROP COLUMN IF EXISTS customer_snapshot;
ALTER TABLE orders DROP COLUMN IF EXISTS financial_snapshot;
ALTER TABLE orders DROP COLUMN IF EXISTS processing_metadata;

DROP TABLE IF EXISTS order_followups;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS order_notes;
DROP TABLE IF EXISTS order_timeline;

DROP TYPE IF EXISTS followup_response;
DROP TYPE IF EXISTS audit_action;
*/
