-- Migration: 100_fix_product_rls_for_realtime
-- Purpose: Ensure products and product_variants tables are accessible for realtime inventory sync
-- This is critical for the client-side cache system

-- ============================================================================
-- STEP 1: Ensure RLS is enabled
-- ============================================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: Drop any conflicting policies
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_all" ON products;
DROP POLICY IF EXISTS "authenticated_all" ON product_variants;
DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "variants_select" ON product_variants;
DROP POLICY IF EXISTS "variants_insert" ON product_variants;
DROP POLICY IF EXISTS "variants_update" ON product_variants;

-- ============================================================================
-- STEP 3: Create permissive policies for authenticated users
-- ============================================================================

-- Products table - all authenticated users can read
CREATE POLICY "products_select" 
ON products 
FOR SELECT 
TO authenticated 
USING (true);

-- Products table - only admin/manager can modify
CREATE POLICY "products_modify" 
ON products 
FOR ALL 
TO authenticated 
USING (
  auth.jwt() ->> 'role' IN ('admin', 'manager', 'staff', 'operator')
  OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'staff', 'operator')
)
WITH CHECK (
  auth.jwt() ->> 'role' IN ('admin', 'manager', 'staff', 'operator')
  OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'staff', 'operator')
);

-- Product variants - all authenticated users can read
CREATE POLICY "variants_select" 
ON product_variants 
FOR SELECT 
TO authenticated 
USING (true);

-- Product variants - only admin/manager can modify
CREATE POLICY "variants_modify" 
ON product_variants 
FOR ALL 
TO authenticated 
USING (
  auth.jwt() ->> 'role' IN ('admin', 'manager', 'staff', 'operator')
  OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'staff', 'operator')
)
WITH CHECK (
  auth.jwt() ->> 'role' IN ('admin', 'manager', 'staff', 'operator')
  OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager', 'staff', 'operator')
);

-- ============================================================================
-- STEP 4: Enable realtime for these tables
-- ============================================================================

-- Enable realtime publication for product_variants (for live stock updates)
DO $$
BEGIN
  -- Check if publication exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Add tables to realtime publication
    ALTER PUBLICATION supabase_realtime ADD TABLE product_variants;
  ELSE
    RAISE NOTICE 'supabase_realtime publication does not exist, skipping...';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'product_variants already in supabase_realtime publication';
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  product_count INT;
  variant_count INT;
BEGIN
  SELECT COUNT(*) INTO product_count FROM products WHERE is_active = true;
  SELECT COUNT(*) INTO variant_count FROM product_variants WHERE is_active = true;
  
  RAISE NOTICE '✅ Migration 100 complete: % active products, % active variants', product_count, variant_count;
END $$;
