-- ============================================================================
-- MIGRATION 112: Security Hardening - RLS Policies
-- ============================================================================
-- Priority: P0 - CRITICAL SECURITY
-- 
-- This migration replaces overly permissive USING(true) policies with
-- proper Role-Based Access Control (RBAC) policies.
--
-- Role Matrix:
-- ┌──────────────┬────────┬─────────┬──────────┬────────┬───────┐
-- │ Table        │ Admin  │ Manager │ Operator │ Vendor │ Rider │
-- ├──────────────┼────────┼─────────┼──────────┼────────┼───────┤
-- │ users        │ CRUD   │ Read    │ Read     │ -      │ -     │
-- │ vendors      │ CRUD   │ CRUD    │ Read     │ Own    │ -     │
-- │ orders       │ CRUD   │ CRUD    │ CRUD     │ Own    │ Own   │
-- │ order_items  │ CRUD   │ CRUD    │ CRUD     │ Own    │ Own   │
-- │ products     │ CRUD   │ CRUD    │ CRUD     │ Own    │ -     │
-- │ customers    │ CRUD   │ CRUD    │ CRUD     │ Read   │ -     │
-- │ vendor_ledger│ CRUD   │ Read    │ -        │ -      │ -     │
-- │ vendor_pay   │ CRUD   │ Read    │ -        │ -      │ -     │
-- │ inventory    │ CRUD   │ CRUD    │ CRUD     │ -      │ -     │
-- └──────────────┴────────┴─────────┴──────────┴────────┴───────┘
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS (in public schema - auth schema is protected in Supabase)
-- ============================================================================

-- Function to get current user's role from users table
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role::TEXT FROM public.users WHERE id = auth.uid();
$$;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role IN ('admin')
  );
$$;

-- Function to check if current user is admin or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
$$;

-- Function to check if current user is staff (admin, manager, or operator)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role IN ('admin', 'manager', 'operator')
  );
$$;

-- Function to get current user's vendor_id (for vendor users)
CREATE OR REPLACE FUNCTION public.get_user_vendor_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT vendor_id FROM public.users WHERE id = auth.uid();
$$;

-- Function to check if current user is a rider
CREATE OR REPLACE FUNCTION public.is_rider()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'rider'
  );
$$;

-- Function to get current user's rider_id
CREATE OR REPLACE FUNCTION public.get_user_rider_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT r.id FROM public.riders r
  INNER JOIN public.users u ON r.user_id = u.id
  WHERE u.id = auth.uid();
$$;

-- ============================================================================
-- SECTION 1: USERS TABLE POLICIES
-- ============================================================================
-- Admin: Full CRUD
-- Manager/Operator: Read only
-- Vendor/Rider: Read own profile only

DROP POLICY IF EXISTS "authenticated_all" ON users;
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

-- Admin: Full access
CREATE POLICY "users_admin_all" ON users
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Manager/Operator: Read all users
CREATE POLICY "users_staff_select" ON users
FOR SELECT TO authenticated
USING (public.is_staff());

-- All users: Read own profile
CREATE POLICY "users_own_select" ON users
FOR SELECT TO authenticated
USING (id = auth.uid());

-- All users: Update own profile (limited fields handled by API)
CREATE POLICY "users_own_update" ON users
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ============================================================================
-- SECTION 2: VENDORS TABLE POLICIES
-- ============================================================================
-- Admin/Manager: Full CRUD
-- Operator: Read only
-- Vendor: Read own vendor profile

DROP POLICY IF EXISTS "authenticated_all" ON vendors;
DROP POLICY IF EXISTS "vendors_select" ON vendors;
DROP POLICY IF EXISTS "vendors_insert" ON vendors;
DROP POLICY IF EXISTS "vendors_update" ON vendors;
DROP POLICY IF EXISTS "vendors_delete" ON vendors;

-- Admin/Manager: Full access
CREATE POLICY "vendors_admin_all" ON vendors
FOR ALL TO authenticated
USING (public.is_admin_or_manager())
WITH CHECK (public.is_admin_or_manager());

-- Operator: Read all vendors
CREATE POLICY "vendors_staff_select" ON vendors
FOR SELECT TO authenticated
USING (public.is_staff());

-- Vendor users: Read own vendor
CREATE POLICY "vendors_own_select" ON vendors
FOR SELECT TO authenticated
USING (id = public.get_user_vendor_id());

-- ============================================================================
-- SECTION 3: CUSTOMERS TABLE POLICIES
-- ============================================================================
-- Admin/Manager/Operator: Full CRUD
-- Vendor: Read customers who ordered their products

DROP POLICY IF EXISTS "authenticated_all" ON customers;
DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;
DROP POLICY IF EXISTS "customers_delete" ON customers;

-- Staff: Full access
CREATE POLICY "customers_staff_all" ON customers
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Vendors: Read customers who ordered their products
CREATE POLICY "customers_vendor_select" ON customers
FOR SELECT TO authenticated
USING (
  public.get_user_vendor_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM orders o
    INNER JOIN order_items oi ON o.id = oi.order_id
    WHERE o.customer_id = customers.id
    AND oi.vendor_id = public.get_user_vendor_id()
  )
);

-- ============================================================================
-- SECTION 4: PRODUCTS TABLE POLICIES
-- ============================================================================
-- Admin/Manager/Operator: Full CRUD
-- Vendor: CRUD own products only

DROP POLICY IF EXISTS "authenticated_all" ON products;
DROP POLICY IF EXISTS "products_read" ON products;
DROP POLICY IF EXISTS "products_modify" ON products;

-- Staff: Full access
CREATE POLICY "products_staff_all" ON products
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Vendor: Read all active products
CREATE POLICY "products_vendor_select" ON products
FOR SELECT TO authenticated
USING (
  public.get_user_vendor_id() IS NOT NULL 
  AND (vendor_id = public.get_user_vendor_id() OR is_active = true)
);

-- Vendor: Modify own products only
CREATE POLICY "products_vendor_modify" ON products
FOR ALL TO authenticated
USING (
  public.get_user_vendor_id() IS NOT NULL 
  AND vendor_id = public.get_user_vendor_id()
)
WITH CHECK (
  public.get_user_vendor_id() IS NOT NULL 
  AND vendor_id = public.get_user_vendor_id()
);

-- ============================================================================
-- SECTION 5: PRODUCT VARIANTS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_all" ON product_variants;
DROP POLICY IF EXISTS "product_variants_read" ON product_variants;
DROP POLICY IF EXISTS "product_variants_modify" ON product_variants;

-- Staff: Full access
CREATE POLICY "variants_staff_all" ON product_variants
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Vendor: Read all active variants
CREATE POLICY "variants_vendor_select" ON product_variants
FOR SELECT TO authenticated
USING (
  public.get_user_vendor_id() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = product_variants.product_id 
    AND (p.vendor_id = public.get_user_vendor_id() OR p.is_active = true)
  )
);

-- ============================================================================
-- SECTION 6: ORDERS TABLE POLICIES
-- ============================================================================
-- Admin/Manager/Operator: Full CRUD
-- Vendor: Read orders containing their products
-- Rider: Read orders assigned to them

DROP POLICY IF EXISTS "authenticated_all" ON orders;
DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;
DROP POLICY IF EXISTS "orders_update" ON orders;
DROP POLICY IF EXISTS "orders_delete" ON orders;

-- Staff: Full access
CREATE POLICY "orders_staff_all" ON orders
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Vendor: Read orders containing their products
CREATE POLICY "orders_vendor_select" ON orders
FOR SELECT TO authenticated
USING (
  public.get_user_vendor_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.order_id = orders.id
    AND oi.vendor_id = public.get_user_vendor_id()
  )
);

-- Rider: Read orders assigned to them
CREATE POLICY "orders_rider_select" ON orders
FOR SELECT TO authenticated
USING (
  public.is_rider()
  AND rider_id = public.get_user_rider_id()
);

-- Rider: Update delivery status on assigned orders
CREATE POLICY "orders_rider_update" ON orders
FOR UPDATE TO authenticated
USING (
  public.is_rider()
  AND rider_id = public.get_user_rider_id()
)
WITH CHECK (
  public.is_rider()
  AND rider_id = public.get_user_rider_id()
);

-- ============================================================================
-- SECTION 7: ORDER ITEMS TABLE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_all" ON order_items;
DROP POLICY IF EXISTS "order_items_select" ON order_items;

-- Staff: Full access
CREATE POLICY "order_items_staff_all" ON order_items
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Vendor: Read their own items
CREATE POLICY "order_items_vendor_select" ON order_items
FOR SELECT TO authenticated
USING (
  public.get_user_vendor_id() IS NOT NULL
  AND vendor_id = public.get_user_vendor_id()
);

-- Rider: Read items in orders assigned to them
CREATE POLICY "order_items_rider_select" ON order_items
FOR SELECT TO authenticated
USING (
  public.is_rider()
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND o.rider_id = public.get_user_rider_id()
  )
);

-- ============================================================================
-- SECTION 8: FINANCIAL DATA - ADMIN/MANAGER ONLY
-- ============================================================================

-- 8.1 VENDOR LEDGER
DROP POLICY IF EXISTS "authenticated_all" ON vendor_ledger;
DROP POLICY IF EXISTS "vendor_ledger_all" ON vendor_ledger;

-- Admin: Full access
CREATE POLICY "vendor_ledger_admin_all" ON vendor_ledger
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Manager: Read only
CREATE POLICY "vendor_ledger_manager_select" ON vendor_ledger
FOR SELECT TO authenticated
USING (public.is_admin_or_manager());

-- 8.2 VENDOR PAYMENTS
DROP POLICY IF EXISTS "authenticated_all" ON vendor_payments;
DROP POLICY IF EXISTS "vendor_payments_all" ON vendor_payments;

-- Admin: Full access
CREATE POLICY "vendor_payments_admin_all" ON vendor_payments
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Manager: Read only
CREATE POLICY "vendor_payments_manager_select" ON vendor_payments
FOR SELECT TO authenticated
USING (public.is_admin_or_manager());

-- ============================================================================
-- SECTION 9: INVENTORY DATA - STAFF ONLY
-- ============================================================================

-- 9.1 INVENTORY TRANSACTIONS
DROP POLICY IF EXISTS "authenticated_all" ON inventory_transactions;

CREATE POLICY "inv_trans_staff_all" ON inventory_transactions
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- 9.2 INVENTORY TRANSACTION ITEMS
DROP POLICY IF EXISTS "authenticated_all" ON inventory_transaction_items;

CREATE POLICY "inv_items_staff_all" ON inventory_transaction_items
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- 9.3 STOCK MOVEMENTS
DROP POLICY IF EXISTS "authenticated_all" ON stock_movements;

CREATE POLICY "stock_movements_staff_all" ON stock_movements
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- ============================================================================
-- SECTION 10: DELIVERY & LOGISTICS - STAFF + RIDERS
-- ============================================================================

-- 10.1 RIDERS TABLE
DROP POLICY IF EXISTS "authenticated_all" ON riders;

-- Staff: Full access
CREATE POLICY "riders_staff_all" ON riders
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Rider: Read and update own profile
CREATE POLICY "riders_own_select" ON riders
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "riders_own_update" ON riders
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 10.2 DELIVERY RUNS
DROP POLICY IF EXISTS "authenticated_all" ON delivery_runs;

-- Staff: Full access
CREATE POLICY "delivery_runs_staff_all" ON delivery_runs
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Rider: Read and update own runs
CREATE POLICY "delivery_runs_rider_select" ON delivery_runs
FOR SELECT TO authenticated
USING (
  public.is_rider()
  AND rider_id = public.get_user_rider_id()
);

CREATE POLICY "delivery_runs_rider_update" ON delivery_runs
FOR UPDATE TO authenticated
USING (
  public.is_rider()
  AND rider_id = public.get_user_rider_id()
);

-- ============================================================================
-- SECTION 11: ORDER LOGS & COMMENTS - STAFF READ/WRITE
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_all" ON order_logs;
DROP POLICY IF EXISTS "authenticated_all" ON order_comments;

CREATE POLICY "order_logs_staff_all" ON order_logs
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

CREATE POLICY "order_comments_staff_all" ON order_comments
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- ============================================================================
-- SECTION 12: SMS LOGS & TEMPLATES - STAFF ONLY
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_all" ON sms_logs;
DROP POLICY IF EXISTS "authenticated_all" ON sms_templates;

CREATE POLICY "sms_logs_staff_all" ON sms_logs
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

CREATE POLICY "sms_templates_staff_all" ON sms_templates
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- ============================================================================
-- SECTION 13: TICKETS - STAFF + VENDORS
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_all" ON tickets;
DROP POLICY IF EXISTS "authenticated_all" ON ticket_messages;

-- Staff: Full access
CREATE POLICY "tickets_staff_all" ON tickets
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- Vendor: Read and create own tickets
CREATE POLICY "tickets_vendor_select" ON tickets
FOR SELECT TO authenticated
USING (
  public.get_user_vendor_id() IS NOT NULL
  AND vendor_id = public.get_user_vendor_id()
);

CREATE POLICY "tickets_vendor_insert" ON tickets
FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_vendor_id() IS NOT NULL
  AND vendor_id = public.get_user_vendor_id()
);

-- Messages follow ticket access
CREATE POLICY "ticket_messages_staff_all" ON ticket_messages
FOR ALL TO authenticated
USING (public.is_staff())
WITH CHECK (public.is_staff());

CREATE POLICY "ticket_messages_vendor" ON ticket_messages
FOR ALL TO authenticated
USING (
  public.get_user_vendor_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_messages.ticket_id
    AND t.vendor_id = public.get_user_vendor_id()
  )
);

-- ============================================================================
-- SECTION 14: READ-ONLY REFERENCE TABLES
-- ============================================================================

-- These tables are read by all authenticated users, modified by admin/manager only

DROP POLICY IF EXISTS "authenticated_all" ON delivery_zones;
DROP POLICY IF EXISTS "authenticated_all" ON courier_partners;
DROP POLICY IF EXISTS "authenticated_all" ON categories;
DROP POLICY IF EXISTS "authenticated_all" ON brands;

-- Delivery Zones
CREATE POLICY "delivery_zones_read" ON delivery_zones
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "delivery_zones_modify" ON delivery_zones
FOR ALL TO authenticated
USING (public.is_admin_or_manager())
WITH CHECK (public.is_admin_or_manager());

-- Courier Partners
CREATE POLICY "courier_partners_read" ON courier_partners
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "courier_partners_modify" ON courier_partners
FOR ALL TO authenticated
USING (public.is_admin_or_manager())
WITH CHECK (public.is_admin_or_manager());

-- Categories
CREATE POLICY "categories_read" ON categories
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "categories_modify" ON categories
FOR ALL TO authenticated
USING (public.is_admin_or_manager())
WITH CHECK (public.is_admin_or_manager());

-- Brands
CREATE POLICY "brands_read" ON brands
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "brands_modify" ON brands
FOR ALL TO authenticated
USING (public.is_admin_or_manager())
WITH CHECK (public.is_admin_or_manager());

-- ============================================================================
-- SECTION 15: APP SETTINGS - ADMIN ONLY
-- ============================================================================

DROP POLICY IF EXISTS "authenticated_all" ON app_settings;

CREATE POLICY "app_settings_admin_all" ON app_settings
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "app_settings_read" ON app_settings
FOR SELECT TO authenticated
USING (true);

-- ============================================================================
-- GRANT EXECUTE ON HELPER FUNCTIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_vendor_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_rider TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_rider_id TO authenticated;

-- ============================================================================
-- DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION public.get_user_role IS 'Returns the current user role from public.users table';
COMMENT ON FUNCTION public.is_admin IS 'Returns true if current user is admin';
COMMENT ON FUNCTION public.is_admin_or_manager IS 'Returns true if current user is admin or manager';
COMMENT ON FUNCTION public.is_staff IS 'Returns true if current user is admin, manager, or operator';
COMMENT ON FUNCTION public.get_user_vendor_id IS 'Returns the vendor_id for vendor users, NULL otherwise';
COMMENT ON FUNCTION public.is_rider IS 'Returns true if current user is a rider';
COMMENT ON FUNCTION public.get_user_rider_id IS 'Returns the rider_id for rider users, NULL otherwise';
