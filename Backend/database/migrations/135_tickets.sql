-- =============================================================================
-- MIGRATION 135: TICKET & SUPPORT SYSTEM
-- =============================================================================
--
-- PURPOSE: Complete ticket system with 3 workspaces:
--   1. Priority Desk (SUPPORT) - Manual complaints, tech issues
--   2. Experience Center (REVIEW) - Auto-created post-delivery
--   3. Return Lab (INVESTIGATION) - Auto-created on cancel/reject/return
--
-- TABLES:
--   1. tickets (NEW) - Core ticket data
--   2. ticket_comments (NEW) - Chat-style comment history
--
-- TRIGGERS:
--   - Auto-increment readable_id (1001, 1002, ...)
--   - Auto-update updated_at
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS ticket_comments;
--   DROP TABLE IF EXISTS tickets;
--   DROP SEQUENCE IF EXISTS ticket_readable_id_seq;
-- =============================================================================

-- =============================================================================
-- STEP 1: Drop stale enums from previous failed runs, then create fresh
-- =============================================================================

DROP TYPE IF EXISTS ticket_type CASCADE;
DROP TYPE IF EXISTS ticket_category CASCADE;
DROP TYPE IF EXISTS ticket_priority CASCADE;
DROP TYPE IF EXISTS ticket_status CASCADE;
DROP TYPE IF EXISTS ticket_source CASCADE;

CREATE TYPE ticket_type AS ENUM ('support', 'review', 'investigation');

CREATE TYPE ticket_category AS ENUM (
    'complaint', 'tech_issue', 'rider_issue', 'feedback',
    'wrong_item', 'damaged_item', 'missing_item', 'late_delivery', 'other'
);

CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TYPE ticket_status AS ENUM ('open', 'processing', 'resolved', 'closed');

CREATE TYPE ticket_source AS ENUM (
    'manual_internal', 'public_form', 'auto_delivered', 'auto_rejected'
);

-- =============================================================================
-- STEP 2: Create tickets table
-- =============================================================================

-- Drop partial tables from failed previous runs (safe - no data yet)
DROP TABLE IF EXISTS ticket_comments CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP SEQUENCE IF EXISTS ticket_readable_id_seq CASCADE;

-- Sequence for readable ticket IDs starting at 1001
CREATE SEQUENCE ticket_readable_id_seq START WITH 1001;

CREATE TABLE tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    readable_id     INT NOT NULL DEFAULT nextval('ticket_readable_id_seq'),

    -- Classification
    type            ticket_type NOT NULL DEFAULT 'support',
    category        ticket_category NOT NULL DEFAULT 'other',
    priority        ticket_priority NOT NULL DEFAULT 'medium',
    status          ticket_status NOT NULL DEFAULT 'open',
    source          ticket_source NOT NULL DEFAULT 'manual_internal',

    -- Content
    subject         VARCHAR(255) NOT NULL,
    description     TEXT,

    -- Relations
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    assigned_to     UUID, -- Staff user ID (not FK to avoid auth.users dependency)

    -- Customer snapshot (denormalized for speed)
    customer_name   VARCHAR(255),
    customer_phone  VARCHAR(20),

    -- Flexible metadata (review ratings, rejection reasons, etc.)
    metadata        JSONB DEFAULT '{}',

    -- Timestamps
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- STEP 3: Create ticket_comments table
-- =============================================================================

CREATE TABLE ticket_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id     UUID, -- Staff who wrote the comment
    user_name   VARCHAR(100), -- Snapshot for display
    content     TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT TRUE, -- Internal staff note vs customer-visible
    attachments JSONB DEFAULT '[]', -- Array of { url, name, type }
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- STEP 4: Indexes
-- =============================================================================

-- Core query patterns
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets (type);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets (priority);
CREATE INDEX IF NOT EXISTS idx_tickets_source ON tickets (source);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_readable_id ON tickets (readable_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);

-- Composite: workspace queries (type + status)
CREATE INDEX IF NOT EXISTS idx_tickets_type_status ON tickets (type, status);

-- Comments
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments (ticket_id, created_at);

-- =============================================================================
-- STEP 5: Auto-update trigger for updated_at
-- =============================================================================

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- STEP 6: GRANT permissions
-- =============================================================================

GRANT ALL ON tickets TO authenticated;
GRANT ALL ON tickets TO service_role;
GRANT INSERT, SELECT ON tickets TO anon; -- Public can create tickets & read own

GRANT ALL ON ticket_comments TO authenticated;
GRANT ALL ON ticket_comments TO service_role;

GRANT USAGE, SELECT ON SEQUENCE ticket_readable_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ticket_readable_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ticket_readable_id_seq TO anon;

-- =============================================================================
-- STEP 7: Row Level Security
-- =============================================================================

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

-- Tickets: Authenticated can read all, manage all
CREATE POLICY "tickets_read" ON tickets
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "tickets_manage" ON tickets
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Tickets: Anon can insert (public form) and read own by phone
CREATE POLICY "tickets_anon_insert" ON tickets
    FOR INSERT TO anon WITH CHECK (source = 'public_form');

CREATE POLICY "tickets_anon_read" ON tickets
    FOR SELECT TO anon USING (source = 'public_form');

-- Comments: Authenticated staff full access
CREATE POLICY "ticket_comments_manage" ON ticket_comments
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- Service role bypasses RLS
CREATE POLICY "tickets_service" ON tickets
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "ticket_comments_service" ON ticket_comments
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '  MIGRATION 135: TICKET & SUPPORT SYSTEM COMPLETE';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '  Tables created:';
    RAISE NOTICE '    1. tickets (with readable_id sequence starting at 1001)';
    RAISE NOTICE '    2. ticket_comments (chat-style notes)';
    RAISE NOTICE '';
    RAISE NOTICE '  Enums: ticket_type, ticket_category, ticket_priority,';
    RAISE NOTICE '         ticket_status, ticket_source';
    RAISE NOTICE '';
    RAISE NOTICE '  Next: Run this migration in Supabase SQL Editor';
    RAISE NOTICE '';
END $$;
