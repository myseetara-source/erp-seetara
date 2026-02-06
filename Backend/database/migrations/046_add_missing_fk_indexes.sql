-- =============================================================================
-- Migration 046: Add Missing Foreign Key Indexes
-- =============================================================================
-- 
-- Purpose: Add B-Tree indexes to all foreign key columns for query optimization
-- 
-- Context: Foreign keys without indexes cause slow JOIN operations and 
-- CASCADE DELETE performance issues at scale.
--
-- Impact: Query performance improvement for JOINs, significantly faster 
-- DELETE CASCADE operations
-- =============================================================================

-- Transaction wrapper for safety
BEGIN;

-- =============================================================================
-- SECTION 1: Users Table
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_vendor ON users(vendor_id) WHERE vendor_id IS NOT NULL;

-- =============================================================================
-- SECTION 2: Order Items Table
-- =============================================================================
-- order_id and variant_id already indexed
CREATE INDEX IF NOT EXISTS idx_order_items_vendor ON order_items(vendor_id) WHERE vendor_id IS NOT NULL;

-- =============================================================================
-- SECTION 3: Order Logs & Comments
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_order_logs_order ON order_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_logs_user ON order_logs(changed_by) WHERE changed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_comments_order ON order_comments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_comments_user ON order_comments(created_by) WHERE created_by IS NOT NULL;

-- =============================================================================
-- SECTION 5: Inventory Transaction Items
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_inv_tx_items_transaction ON inventory_transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_items_variant ON inventory_transaction_items(variant_id);

-- =============================================================================
-- SECTION 6: Stock Movements
-- =============================================================================
-- variant_id is critical for stock queries
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);
-- vendor_id already added in migration 045

-- =============================================================================
-- SECTION 7: Vendor Payments
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date DESC);

-- =============================================================================
-- SECTION 8: Vendor Users
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_vendor_users_vendor ON vendor_users(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_users_email ON vendor_users(email);

-- =============================================================================
-- SECTION 9: SMS Logs
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_sms_logs_template ON sms_logs(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_logs_order ON sms_logs(order_id) WHERE order_id IS NOT NULL;

-- =============================================================================
-- SECTION 10: Tickets & Messages
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(related_order_id) WHERE related_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender ON ticket_messages(sender_id) WHERE sender_id IS NOT NULL;

-- =============================================================================
-- SECTION 11: Riders & Delivery
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_riders_user ON riders(user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_rider ON delivery_runs(rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_runs_date ON delivery_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_courier ON delivery_zones(default_courier_id) WHERE default_courier_id IS NOT NULL;

-- =============================================================================
-- SECTION 12: Categories
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- =============================================================================
-- SECTION 13: Additional Performance Indexes
-- =============================================================================

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status ON orders(customer_id, status);

-- Vendor ledger composite for statement queries
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_date ON vendor_ledger(vendor_id, transaction_date DESC);

-- Inventory composite for date range queries
CREATE INDEX IF NOT EXISTS idx_inv_tx_vendor_date ON inventory_transactions(vendor_id, transaction_date DESC) 
  WHERE vendor_id IS NOT NULL;

-- Product search optimization
CREATE INDEX IF NOT EXISTS idx_products_name_gin ON products USING gin(to_tsvector('english', name));

-- Order number prefix search (for partial matches like "TT-2026%")
CREATE INDEX IF NOT EXISTS idx_orders_number_pattern ON orders(order_number text_pattern_ops);

COMMIT;

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
    idx_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO idx_count 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND indexname LIKE 'idx_%';
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ Migration 046: FK Indexes Added Successfully';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  Total Indexes in public schema: %', idx_count;
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
