-- ============================================================================
-- Migration 129: Fix Missing delivery_type Values
-- ============================================================================
-- 
-- P0 FIX: Orders with courier_partner assigned but delivery_type = NULL
-- These orders show incorrectly as D2D in the dispatch table
--
-- Problem: When orders were assigned to NCM/GBL, the delivery_type wasn't set
-- Solution: Default all existing courier orders to 'D2D' (Home Delivery)
--
-- NOTE: For NCM, users can still change to D2B via the UI
--       For GBL, it's always D2D (Branch Pickup not supported)
-- ============================================================================

BEGIN;

-- Step 1: Update NCM orders with null delivery_type to default 'D2D'
UPDATE orders
SET 
  delivery_type = 'D2D',
  updated_at = NOW()
WHERE 
  courier_partner = 'Nepal Can Move'
  AND delivery_type IS NULL;

-- Step 2: Update Gaau Besi orders with null delivery_type to 'D2D'
-- (Gaau Besi only supports home delivery)
UPDATE orders
SET 
  delivery_type = 'D2D',
  updated_at = NOW()
WHERE 
  courier_partner = 'Gaau Besi'
  AND delivery_type IS NULL;

-- Step 3: Also update any orders with logistics_provider set but null delivery_type
UPDATE orders
SET 
  delivery_type = 'D2D',
  updated_at = NOW()
WHERE 
  logistics_provider IS NOT NULL
  AND delivery_type IS NULL;

-- Refresh materialized view to reflect changes
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_orders_list;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run these after migration)
-- ============================================================================

-- Check how many orders were affected:
-- SELECT 
--   courier_partner,
--   delivery_type,
--   COUNT(*) as count
-- FROM orders
-- WHERE courier_partner IS NOT NULL
-- GROUP BY courier_partner, delivery_type
-- ORDER BY courier_partner, delivery_type;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- This migration is non-destructive. To rollback:
-- UPDATE orders SET delivery_type = NULL WHERE delivery_type = 'D2D' AND courier_partner IS NOT NULL;
