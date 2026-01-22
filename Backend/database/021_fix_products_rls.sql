-- =============================================================================
-- MIGRATION: 021_fix_products_rls.sql
-- PURPOSE: Fix RLS policies for products table
-- =============================================================================

-- Step 1: Force schema cache reload
NOTIFY pgrst, 'reload schema';

-- Step 2: Drop all existing policies on products and variants
DROP POLICY IF EXISTS products_select ON products;
DROP POLICY IF EXISTS products_insert ON products;
DROP POLICY IF EXISTS products_update ON products;
DROP POLICY IF EXISTS products_delete ON products;
DROP POLICY IF EXISTS products_all ON products;

DROP POLICY IF EXISTS variants_select ON product_variants;
DROP POLICY IF EXISTS variants_insert ON product_variants;
DROP POLICY IF EXISTS variants_update ON product_variants;
DROP POLICY IF EXISTS variants_delete ON product_variants;
DROP POLICY IF EXISTS variants_all ON product_variants;

-- Step 3: Ensure RLS is enabled
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- Step 4: Create simple permissive policies for authenticated users
-- Products - All authenticated users can view
CREATE POLICY "products_select_authenticated" 
ON products FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "products_insert_authenticated" 
ON products FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "products_update_authenticated" 
ON products FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "products_delete_authenticated" 
ON products FOR DELETE 
TO authenticated 
USING (true);

-- Product Variants - Same permissions
CREATE POLICY "variants_select_authenticated" 
ON product_variants FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "variants_insert_authenticated" 
ON product_variants FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "variants_update_authenticated" 
ON product_variants FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "variants_delete_authenticated" 
ON product_variants FOR DELETE 
TO authenticated 
USING (true);

-- Step 5: Allow service_role to bypass RLS (for backend)
CREATE POLICY "products_service_role_all" 
ON products FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY "variants_service_role_all" 
ON product_variants FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Step 6: Force schema cache reload again
NOTIFY pgrst, 'reload schema';

-- Step 7: Verification
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd
FROM pg_policies 
WHERE tablename IN ('products', 'product_variants')
ORDER BY tablename, policyname;
