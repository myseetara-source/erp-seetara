-- ============================================================================
-- Migration: 126_performance_composite_indexes.sql
-- Purpose: P0 PERFORMANCE - Add composite indexes for common dashboard queries
-- 
-- PROBLEM: Dashboard queries scanning full tables for common filters
-- SOLUTION: Composite indexes on frequently filtered columns
-- 
-- Expected Impact:
--   - Order filtering: 100-500ms → 5-20ms (10-50x faster)
--   - Customer history: 200-800ms → 10-30ms (20-40x faster)
--   - Logistics sync: 300-1000ms → 15-40ms (20-30x faster)
--   - Inventory logs: 150-600ms → 10-25ms (15-25x faster)
-- ============================================================================

-- ============================================================================
-- 1. ORDERS: Status + Date Filtering
-- 
-- USE CASE: "Show me all PENDING orders", "Show CONVERTED orders today"
-- QUERY: SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_status_created 
ON orders(status, created_at DESC);

-- Partial index for active orders (excludes delivered/cancelled/returned)
-- Smaller index = faster queries for dispatch center
CREATE INDEX IF NOT EXISTS idx_orders_active_status_created 
ON orders(status, created_at DESC)
WHERE status NOT IN ('delivered', 'cancelled', 'returned') AND is_deleted = false;

-- ============================================================================
-- 2. ORDERS: Customer History
-- 
-- USE CASE: "Show order history for Ram", "Customer's last 10 orders"
-- QUERY: SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_customer_created 
ON orders(customer_id, created_at DESC);

-- Composite for customer + status (e.g., "Ram's pending orders")
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created 
ON orders(customer_id, status, created_at DESC);

-- ============================================================================
-- 3. ORDERS: Logistics Sync Queries
-- 
-- USE CASE: "Find unsynced GBL orders", "Orders pending NCM sync"
-- QUERY: SELECT * FROM orders WHERE logistics_provider = 'gaaubesi' 
--        AND is_logistics_synced = false AND status IN (...)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_logistics_sync 
ON orders(logistics_provider, is_logistics_synced, status)
WHERE logistics_provider IS NOT NULL;

-- Partial index for unsynced orders only (very small, very fast)
CREATE INDEX IF NOT EXISTS idx_orders_unsynced_logistics 
ON orders(logistics_provider, status, created_at DESC)
WHERE is_logistics_synced = false AND logistics_provider IS NOT NULL AND is_deleted = false;

-- ============================================================================
-- 4. ORDERS: Fulfillment Type Filtering
-- 
-- USE CASE: Dispatch center filtering by Inside Valley / Outside Valley
-- QUERY: SELECT * FROM orders WHERE fulfillment_type = 'inside_valley' 
--        AND status = 'packed' ORDER BY created_at
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status_created 
ON orders(fulfillment_type, status, created_at DESC)
WHERE is_deleted = false;

-- ============================================================================
-- 5. INVENTORY: Vendor Transaction Logs
-- 
-- USE CASE: "Show all purchases from Vendor X", "Vendor ledger report"
-- QUERY: SELECT * FROM inventory_transactions WHERE vendor_id = ? 
--        ORDER BY transaction_date DESC
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_vendor_date 
ON inventory_transactions(vendor_id, transaction_date DESC);

-- Composite for vendor + type + status (e.g., "Approved purchases from Vendor X")
CREATE INDEX IF NOT EXISTS idx_inventory_vendor_type_status_date 
ON inventory_transactions(vendor_id, transaction_type, status, transaction_date DESC);

-- ============================================================================
-- 6. INVENTORY: Transaction Type Filtering
-- 
-- USE CASE: "Show all PURCHASE transactions", "Today's damages"
-- QUERY: SELECT * FROM inventory_transactions WHERE transaction_type = 'purchase'
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_type_status_date 
ON inventory_transactions(transaction_type, status, transaction_date DESC);

-- Partial index for pending approvals (common dashboard query)
CREATE INDEX IF NOT EXISTS idx_inventory_pending_approvals 
ON inventory_transactions(transaction_type, created_at DESC)
WHERE status = 'pending';

-- ============================================================================
-- 7. ORDER ITEMS: Product/Variant Lookup
-- 
-- USE CASE: "Which orders contain SKU-123?", "Sales of Product X"
-- QUERY: SELECT * FROM order_items WHERE variant_id = ?
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_items_variant 
ON order_items(variant_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_variant 
ON order_items(order_id, variant_id);

-- ============================================================================
-- 8. CUSTOMERS: Phone Number Lookup
-- 
-- USE CASE: "Find customer by phone", "Check if phone exists"
-- QUERY: SELECT * FROM customers WHERE phone = ?
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_customers_phone 
ON customers(phone);

-- Composite for phone + tier (VIP customer lookup)
CREATE INDEX IF NOT EXISTS idx_customers_phone_tier 
ON customers(phone, tier);

-- ============================================================================
-- 9. VENDOR LEDGER: Balance History
-- 
-- USE CASE: "Vendor payment history", "Ledger report"
-- QUERY: SELECT * FROM vendor_ledger WHERE vendor_id = ? ORDER BY created_at DESC
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_date 
ON vendor_ledger(vendor_id, created_at DESC);

-- Composite for vendor + entry type
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_type_date 
ON vendor_ledger(vendor_id, entry_type, created_at DESC);

-- ============================================================================
-- 10. PRODUCT VARIANTS: Stock Queries
-- 
-- USE CASE: "Low stock alerts", "Out of stock products"
-- QUERY: SELECT * FROM product_variants WHERE current_stock <= reorder_level
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_variants_stock 
ON product_variants(current_stock);

-- Partial index for low stock (very small, very fast for alerts)
CREATE INDEX IF NOT EXISTS idx_variants_low_stock 
ON product_variants(current_stock, product_id)
WHERE current_stock <= 10;

-- ============================================================================
-- 11. ORDERS: Search Optimization (Full-Text Search)
-- 
-- USE CASE: Global search by order number, customer name, phone
-- If search_vector column exists, ensure GIN index
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_search_gin 
ON orders USING GIN(search_vector)
WHERE search_vector IS NOT NULL;

-- ============================================================================
-- 12. ACTIVITY/AUDIT LOGS: User Activity Lookup
-- 
-- USE CASE: "What did User X do today?", "Audit trail for order"
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_activity_log_user_date 
ON user_activity_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity_date 
ON user_activity_log(entity_type, entity_id, created_at DESC);

-- ============================================================================
-- ANALYZE TABLES (Update statistics for query planner)
-- ============================================================================

ANALYZE orders;
ANALYZE inventory_transactions;
ANALYZE order_items;
ANALYZE customers;
ANALYZE vendor_ledger;
ANALYZE product_variants;

-- ============================================================================
-- VERIFICATION: Check index sizes
-- ============================================================================
-- Run this query to verify indexes were created:
-- SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) as size
-- FROM pg_indexes WHERE tablename IN ('orders', 'inventory_transactions', 'customers');

COMMENT ON INDEX idx_orders_status_created IS 
'P0 Performance: Speeds up status filtering on orders dashboard. Created: 2026-02-05';

COMMENT ON INDEX idx_orders_customer_created IS 
'P0 Performance: Speeds up customer order history lookup. Created: 2026-02-05';

COMMENT ON INDEX idx_orders_logistics_sync IS 
'P0 Performance: Speeds up logistics sync queue queries. Created: 2026-02-05';

COMMENT ON INDEX idx_inventory_vendor_date IS 
'P0 Performance: Speeds up vendor transaction history. Created: 2026-02-05';
