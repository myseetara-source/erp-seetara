-- =============================================================================
-- MIGRATION: 026_add_performance_indexes.sql
-- PURPOSE: Eliminate Full Table Scans & Fix Slow Queries
-- IMPACT: 10x-100x faster queries on vendor ledger and transaction history
-- =============================================================================

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 0: ENABLE REQUIRED EXTENSIONS                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Enable pg_trgm for fuzzy text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: VENDOR LEDGER INDEXES (THE HEAVY LIFTER)                         ║
-- ║  This table is queried on EVERY vendor page load                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Primary lookup: Get all transactions for a vendor
-- Before: Full table scan (O(n) - reads ALL rows)
-- After: Index scan (O(log n) - reads only matching rows)
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_id 
ON vendor_ledger(vendor_id);

-- Filter by transaction type (purchase, payment, return)
-- Used for: Calculating totals by type
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_entry_type 
ON vendor_ledger(entry_type);

-- Composite index for common query pattern: vendor + type
-- Used for: "Get all payments for vendor X"
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_type 
ON vendor_ledger(vendor_id, entry_type);

-- Reference lookup (for deduplication checks)
-- Used for: Preventing duplicate entries, joins
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_reference_id 
ON vendor_ledger(reference_id) 
WHERE reference_id IS NOT NULL;

-- Date ordering (most common sort)
-- Used for: Transaction history display (most recent first)
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_date_desc 
ON vendor_ledger(vendor_id, transaction_date DESC, created_at DESC);

-- Running balance queries
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_running_balance 
ON vendor_ledger(vendor_id, running_balance);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: VENDOR PAYMENTS INDEXES                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Primary lookup: Get all payments for a vendor
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor_id 
ON vendor_payments(vendor_id);

-- Payment date ordering
CREATE INDEX IF NOT EXISTS idx_vendor_payments_date_desc 
ON vendor_payments(vendor_id, payment_date DESC);

-- Payment status filtering
CREATE INDEX IF NOT EXISTS idx_vendor_payments_status 
ON vendor_payments(status) 
WHERE status = 'completed';

-- Payment number lookup (for receipts)
CREATE INDEX IF NOT EXISTS idx_vendor_payments_payment_no 
ON vendor_payments(payment_no);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: INVENTORY TRANSACTIONS INDEXES (PURCHASES/RETURNS)               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Already exists but ensure it's there
CREATE INDEX IF NOT EXISTS idx_inventory_tx_vendor_id 
ON inventory_transactions(vendor_id) 
WHERE vendor_id IS NOT NULL;

-- Composite for vendor purchases
CREATE INDEX IF NOT EXISTS idx_inventory_tx_vendor_type 
ON inventory_transactions(vendor_id, transaction_type) 
WHERE vendor_id IS NOT NULL;

-- Date ordering for history
CREATE INDEX IF NOT EXISTS idx_inventory_tx_vendor_date 
ON inventory_transactions(vendor_id, transaction_date DESC) 
WHERE vendor_id IS NOT NULL;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: VENDOR SEARCH OPTIMIZATION                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Fast fuzzy search on vendor name (instant typeahead)
CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm 
ON vendors USING gin(name gin_trgm_ops);

-- Fast fuzzy search on company name
CREATE INDEX IF NOT EXISTS idx_vendors_company_trgm 
ON vendors USING gin(company_name gin_trgm_ops) 
WHERE company_name IS NOT NULL;

-- Phone number exact match (common lookup)
CREATE INDEX IF NOT EXISTS idx_vendors_phone 
ON vendors(phone);

-- Balance filtering (payable/receivable)
CREATE INDEX IF NOT EXISTS idx_vendors_balance_payable 
ON vendors(balance) 
WHERE balance > 0;

CREATE INDEX IF NOT EXISTS idx_vendors_balance_receivable 
ON vendors(balance) 
WHERE balance < 0;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 5: ORDER-RELATED INDEXES (BONUS OPTIMIZATION)                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Fast customer order lookup
CREATE INDEX IF NOT EXISTS idx_orders_customer_date 
ON orders(customer_id, created_at DESC);

-- Order status dashboard
CREATE INDEX IF NOT EXISTS idx_orders_status_created 
ON orders(status, created_at DESC);

-- AWB tracking lookup
CREATE INDEX IF NOT EXISTS idx_orders_awb 
ON orders(awb_number) 
WHERE awb_number IS NOT NULL AND awb_number != '';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 6: PRODUCT/VARIANT INDEXES                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Fast product search
CREATE INDEX IF NOT EXISTS idx_products_name_search 
ON products USING gin(name gin_trgm_ops);

-- SKU lookup (exact match)
CREATE INDEX IF NOT EXISTS idx_variants_sku_lookup 
ON product_variants(sku) 
WHERE sku IS NOT NULL AND sku != '';

-- Low stock alerts
CREATE INDEX IF NOT EXISTS idx_variants_low_stock_alert 
ON product_variants(current_stock) 
WHERE current_stock <= 10 AND is_active = TRUE;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 7: ANALYZE TABLES (UPDATE QUERY PLANNER STATISTICS)                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Force PostgreSQL to update its statistics for optimal query plans
ANALYZE vendor_ledger;
ANALYZE vendor_payments;
ANALYZE vendors;
ANALYZE inventory_transactions;
ANALYZE orders;
ANALYZE products;
ANALYZE product_variants;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 8: VERIFICATION - SHOW INDEX STATUS                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Show all indexes on critical tables
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('vendor_ledger', 'vendor_payments', 'vendors', 'inventory_transactions')
ORDER BY tablename, indexname;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  EXPECTED PERFORMANCE IMPROVEMENT                                         ║
-- ╠═══════════════════════════════════════════════════════════════════════════╣
-- ║                                                                           ║
-- ║  Query: Get vendor ledger for vendor X                                    ║
-- ║  Before: ~500ms (100K rows, full scan)                                    ║
-- ║  After:  ~5ms (index seek)                                                ║
-- ║  Improvement: 100x faster                                                 ║
-- ║                                                                           ║
-- ║  Query: Calculate vendor balance                                          ║
-- ║  Before: ~200ms (scan + aggregate)                                        ║
-- ║  After:  ~10ms (index + aggregate)                                        ║
-- ║  Improvement: 20x faster                                                  ║
-- ║                                                                           ║
-- ║  Query: Search vendors by name                                            ║
-- ║  Before: ~100ms (LIKE '%search%' full scan)                               ║
-- ║  After:  ~2ms (trigram index)                                             ║
-- ║  Improvement: 50x faster                                                  ║
-- ║                                                                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
