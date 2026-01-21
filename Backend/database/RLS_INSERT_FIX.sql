-- =============================================================================
-- CRITICAL DATABASE PERMISSIONS FIX
-- Run this in Supabase SQL Editor to fix ALL permission issues
-- =============================================================================

-- =============================================================================
-- STEP 1: GRANT SCHEMA PERMISSIONS
-- =============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- =============================================================================
-- STEP 2: GRANT TABLE PERMISSIONS TO authenticated ROLE
-- =============================================================================

-- Orders & Order Items
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.order_items TO authenticated;
GRANT ALL ON public.order_logs TO authenticated;
GRANT ALL ON public.order_comments TO authenticated;

-- Customers
GRANT ALL ON public.customers TO authenticated;

-- Products & Variants
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.product_variants TO authenticated;

-- Vendors & Supplies
GRANT ALL ON public.vendors TO authenticated;
GRANT ALL ON public.vendor_supplies TO authenticated;
GRANT ALL ON public.vendor_supply_items TO authenticated;
GRANT ALL ON public.vendor_payments TO authenticated;
GRANT ALL ON public.vendor_access_logs TO authenticated;

-- Stock & Transactions
GRANT ALL ON public.stock_movements TO authenticated;
GRANT ALL ON public.transactions TO authenticated;

-- Users
GRANT ALL ON public.users TO authenticated;

-- Riders & Delivery
GRANT ALL ON public.riders TO authenticated;
GRANT ALL ON public.delivery_runs TO authenticated;
GRANT ALL ON public.delivery_attempts TO authenticated;
GRANT ALL ON public.rider_settlements TO authenticated;

-- Tickets & Support
GRANT ALL ON public.tickets TO authenticated;
GRANT ALL ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_activities TO authenticated;
GRANT ALL ON public.reviews TO authenticated;

-- SMS
GRANT ALL ON public.sms_templates TO authenticated;
GRANT ALL ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_settings TO authenticated;

-- Other Tables
GRANT ALL ON public.valley_districts TO authenticated;
GRANT ALL ON public.sales_channels TO authenticated;
GRANT ALL ON public.logistics_webhook_logs TO authenticated;

-- =============================================================================
-- STEP 3: GRANT TABLE PERMISSIONS TO service_role (BYPASSES RLS)
-- =============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =============================================================================
-- STEP 4: SET DEFAULT PRIVILEGES FOR FUTURE TABLES
-- =============================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT USAGE ON SEQUENCES TO authenticated;

-- =============================================================================
-- STEP 5: FIX RLS POLICIES ON users TABLE (Drop problematic ones)
-- =============================================================================

-- Drop old problematic policies
DROP POLICY IF EXISTS "Admins can see all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can see their own profile" ON public.users;
DROP POLICY IF EXISTS "authenticated_select" ON public.users;
DROP POLICY IF EXISTS "authenticated_update_own" ON public.users;

-- Create simple clean policies
CREATE POLICY "allow_authenticated_select" ON public.users
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "allow_authenticated_update_own" ON public.users
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "allow_service_role_all" ON public.users
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- STEP 6: ADD INSERT POLICIES FOR TABLES (CRITICAL FOR CREATING RECORDS)
-- =============================================================================

-- Orders
DROP POLICY IF EXISTS "admin_all_orders" ON orders;
DROP POLICY IF EXISTS "operator_manage_orders" ON orders;

CREATE POLICY "staff_all_orders" ON orders 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Order Items
DROP POLICY IF EXISTS "admin_all_order_items" ON order_items;
DROP POLICY IF EXISTS "operator_manage_order_items" ON order_items;

CREATE POLICY "staff_all_order_items" ON order_items 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Customers
DROP POLICY IF EXISTS "admin_all_customers" ON customers;
DROP POLICY IF EXISTS "operator_manage_customers" ON customers;

CREATE POLICY "staff_all_customers" ON customers 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Products
DROP POLICY IF EXISTS "admin_all_products" ON products;
DROP POLICY IF EXISTS "operator_read_products" ON products;

CREATE POLICY "staff_all_products" ON products 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Product Variants
DROP POLICY IF EXISTS "admin_all_variants" ON product_variants;
DROP POLICY IF EXISTS "operator_read_variants" ON product_variants;

CREATE POLICY "staff_all_variants" ON product_variants 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Vendors
DROP POLICY IF EXISTS "admin_all_vendors" ON vendors;

CREATE POLICY "staff_all_vendors" ON vendors 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Stock Movements
DROP POLICY IF EXISTS "admin_all_stock_movements" ON stock_movements;

CREATE POLICY "staff_all_stock_movements" ON stock_movements 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Transactions
DROP POLICY IF EXISTS "admin_all_transactions" ON transactions;

CREATE POLICY "staff_all_transactions" ON transactions 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Tickets
DROP POLICY IF EXISTS "tickets_staff_all" ON tickets;

CREATE POLICY "staff_all_tickets" ON tickets 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Ticket Messages
DROP POLICY IF EXISTS "messages_staff_all" ON ticket_messages;

CREATE POLICY "staff_all_ticket_messages" ON ticket_messages 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- SMS Templates
DROP POLICY IF EXISTS "admin_all_sms_templates" ON sms_templates;

CREATE POLICY "staff_all_sms_templates" ON sms_templates 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- SMS Logs
DROP POLICY IF EXISTS "admin_all_sms_logs" ON sms_logs;

CREATE POLICY "staff_all_sms_logs" ON sms_logs 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- SMS Settings
CREATE POLICY "staff_all_sms_settings" ON sms_settings 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Riders
DROP POLICY IF EXISTS "riders_staff_all" ON riders;
DROP POLICY IF EXISTS "riders_self_view" ON riders;

CREATE POLICY "staff_all_riders" ON riders 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Delivery Runs
DROP POLICY IF EXISTS "runs_staff_all" ON delivery_runs;
DROP POLICY IF EXISTS "runs_rider_own" ON delivery_runs;

CREATE POLICY "staff_all_delivery_runs" ON delivery_runs 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Delivery Attempts
DROP POLICY IF EXISTS "attempts_staff_all" ON delivery_attempts;
DROP POLICY IF EXISTS "attempts_rider_own" ON delivery_attempts;

CREATE POLICY "staff_all_delivery_attempts" ON delivery_attempts 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Rider Settlements
DROP POLICY IF EXISTS "settlements_admin_all" ON rider_settlements;
DROP POLICY IF EXISTS "settlements_rider_view" ON rider_settlements;

CREATE POLICY "staff_all_rider_settlements" ON rider_settlements 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Vendor Supplies
DROP POLICY IF EXISTS "admin_all_vendor_supplies" ON vendor_supplies;
DROP POLICY IF EXISTS "vendor_view_own_supply" ON vendor_supplies;

CREATE POLICY "staff_all_vendor_supplies" ON vendor_supplies 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Vendor Supply Items
DROP POLICY IF EXISTS "admin_all_vendor_supply_items" ON vendor_supply_items;

CREATE POLICY "staff_all_vendor_supply_items" ON vendor_supply_items 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Order Logs
DROP POLICY IF EXISTS "admin_all_order_logs" ON order_logs;

CREATE POLICY "staff_all_order_logs" ON order_logs 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Order Comments
DROP POLICY IF EXISTS "admin_all_comments" ON order_comments;

CREATE POLICY "staff_all_order_comments" ON order_comments 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Vendor Payments
CREATE POLICY "staff_all_vendor_payments" ON vendor_payments 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Reviews
DROP POLICY IF EXISTS "reviews_staff_all" ON reviews;
DROP POLICY IF EXISTS "reviews_public_view" ON reviews;

CREATE POLICY "staff_all_reviews" ON reviews 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Sales Channels
CREATE POLICY "staff_all_sales_channels" ON sales_channels 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Valley Districts
CREATE POLICY "staff_all_valley_districts" ON valley_districts 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Logistics Webhook Logs
DROP POLICY IF EXISTS "admin_webhook_logs" ON logistics_webhook_logs;

CREATE POLICY "staff_all_webhook_logs" ON logistics_webhook_logs 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Ticket Activities
CREATE POLICY "staff_all_ticket_activities" ON ticket_activities 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- Vendor Access Logs
CREATE POLICY "staff_all_vendor_access_logs" ON vendor_access_logs 
    FOR ALL TO authenticated 
    USING (true) WITH CHECK (true);

-- =============================================================================
-- STEP 7: VERIFY PERMISSIONS
-- =============================================================================

-- Check policies on key tables
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('orders', 'products', 'users', 'customers')
ORDER BY tablename, policyname;

-- =============================================================================
-- SUCCESS MESSAGE
-- =============================================================================

SELECT 'All permissions have been granted successfully!' AS result;
