-- =============================================================================
-- SEETARA ERP - CANONICAL DATABASE SCHEMA
-- =============================================================================
--
-- Version: 2.0.0
-- Generated: 2026-01-21
-- 
-- This is the SINGLE SOURCE OF TRUTH for the database schema.
-- Run this ONCE on a fresh Supabase database.
--
-- FEATURES:
-- ✅ Dynamic Product Variants (JSONB attributes)
-- ✅ Dual-Bucket Inventory (fresh vs damaged stock)
-- ✅ Unified Inventory Transactions with Maker-Checker workflow
-- ✅ Complete Order State Machine (Nepal logistics)
-- ✅ RBAC (Role-Based Access Control)
-- ✅ Product-Level Shipping Rates (Highest Value Rule)
-- ✅ Full RLS (Row Level Security)
-- ✅ Comprehensive Indexes
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- =============================================================================
-- SECTION 2: ENUMS (MUST MATCH Frontend/src/constants/index.ts)
-- =============================================================================

-- User Roles
CREATE TYPE user_role AS ENUM (
    'admin',
    'manager',
    'operator',
    'vendor',
    'rider',
    'viewer'
);

-- Order Status State Machine
-- CRITICAL: Must match Frontend constants exactly
CREATE TYPE order_status AS ENUM (
    'intake',
    'follow_up',
    'converted',
    'hold',
    'packed',
    'assigned',
    'out_for_delivery',
    'handover_to_courier',
    'in_transit',
    'store_sale',
    'delivered',
    'cancelled',
    'rejected',
    'return_initiated',
    'returned'
);

-- Order Source Channels
CREATE TYPE order_source AS ENUM (
    'manual',
    'website',
    'facebook',
    'instagram',
    'store',
    'todaytrend',
    'seetara',
    'shopify',
    'woocommerce',
    'api'
);

-- Fulfillment Type (Nepal Logistics)
-- CRITICAL: Must match Frontend constants exactly
CREATE TYPE fulfillment_type AS ENUM (
    'inside_valley',
    'outside_valley',
    'store'
);

-- Payment Status
CREATE TYPE payment_status AS ENUM (
    'pending',
    'paid',
    'partial',
    'refunded',
    'cod'
);

-- Payment Method
CREATE TYPE payment_method AS ENUM (
    'cod',
    'esewa',
    'khalti',
    'bank_transfer',
    'cash'
);

-- Inventory Transaction Type
CREATE TYPE inventory_transaction_type AS ENUM (
    'purchase',
    'purchase_return',
    'damage',
    'adjustment'
);

-- Inventory Transaction Status (Maker-Checker)
CREATE TYPE inventory_transaction_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'voided'
);

-- Stock Source Type (Dual-Bucket)
CREATE TYPE stock_source_type AS ENUM (
    'fresh',
    'damaged'
);

-- Customer Tier
CREATE TYPE customer_tier AS ENUM (
    'new',
    'regular',
    'vip',
    'gold',
    'platinum',
    'warning',
    'blacklisted'
);

-- Zone Type
CREATE TYPE zone_type AS ENUM (
    'inside_valley',
    'outside_valley'
);

-- Rider Status
CREATE TYPE rider_status AS ENUM (
    'available',
    'on_delivery',
    'on_break',
    'off_duty',
    'suspended'
);

-- Delivery Result
CREATE TYPE delivery_result AS ENUM (
    'delivered',
    'rejected',
    'not_home',
    'wrong_address',
    'rescheduled',
    'returned'
);

-- Delivery Status
CREATE TYPE delivery_status AS ENUM (
    'assigned',
    'picked',
    'in_transit',
    'delivered',
    'failed',
    'returned'
);

-- Ticket Types
CREATE TYPE ticket_type AS ENUM (
    'issue',
    'task',
    'feedback',
    'vendor_dispute',
    'return_request',
    'inquiry'
);

CREATE TYPE ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

CREATE TYPE ticket_status AS ENUM (
    'open',
    'pending',
    'in_progress',
    'escalated',
    'resolved',
    'closed'
);

-- SMS Status
CREATE TYPE sms_status AS ENUM (
    'pending',
    'queued',
    'sent',
    'delivered',
    'failed',
    'blocked',
    'skipped'
);

-- Comment Source
CREATE TYPE comment_source AS ENUM (
    'staff',
    'logistics',
    'system',
    'customer'
);

-- =============================================================================
-- SECTION 3: CORE TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 USERS (RBAC)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'operator',
    phone VARCHAR(20),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    vendor_id UUID,  -- FK added after vendors table
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE users IS 'System users with role-based access control';
COMMENT ON COLUMN users.role IS 'admin=full access, manager=most access, operator=order entry, vendor=vendor portal, rider=delivery app';

-- -----------------------------------------------------------------------------
-- 3.2 VENDORS (Suppliers)
-- -----------------------------------------------------------------------------
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    phone VARCHAR(20) NOT NULL,
    alt_phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    gst_number VARCHAR(20),
    pan_number VARCHAR(20),
    bank_details JSONB DEFAULT '{}',
    balance DECIMAL(14, 2) DEFAULT 0.00,
    credit_limit DECIMAL(14, 2) DEFAULT 0.00,
    payment_terms INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vendors IS 'Supplier/vendor master for purchases';

-- Add FK from users to vendors
ALTER TABLE users 
    ADD CONSTRAINT fk_users_vendor 
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

-- Vendor role must have vendor_id
ALTER TABLE users 
    ADD CONSTRAINT vendor_id_required_for_vendor_role
    CHECK ((role = 'vendor' AND vendor_id IS NOT NULL) OR (role != 'vendor'));

-- -----------------------------------------------------------------------------
-- 3.3 CUSTOMERS
-- -----------------------------------------------------------------------------
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    alt_phone VARCHAR(20),
    email VARCHAR(255),
    
    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    country VARCHAR(100) DEFAULT 'Nepal',
    
    -- Marketing Attribution
    ip_address INET,
    fbid VARCHAR(100),
    fbclid VARCHAR(255),
    gclid VARCHAR(255),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(255),
    
    -- Metrics (Updated by triggers)
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(14, 2) DEFAULT 0.00,
    return_count INTEGER DEFAULT 0,
    customer_score DECIMAL(5, 2) DEFAULT 50.00,
    tier customer_tier DEFAULT 'new',
    avg_order_value DECIMAL(12, 2) DEFAULT 0.00,
    delivery_success_rate DECIMAL(5, 2) DEFAULT 100.00,
    
    -- Timestamps
    first_order_at TIMESTAMPTZ,
    last_order_at TIMESTAMPTZ,
    
    -- Status
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    is_blocked BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE customers IS 'Customer master with CRM metrics';

-- -----------------------------------------------------------------------------
-- 3.4 PRODUCTS
-- -----------------------------------------------------------------------------
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(500) NOT NULL,
    description TEXT,
    brand VARCHAR(255),
    category VARCHAR(255),
    image_url TEXT,
    
    -- Shipping Rates (for Highest Value Rule)
    -- NULL means use global default (100/150)
    shipping_inside INTEGER DEFAULT NULL,
    shipping_outside INTEGER DEFAULT NULL,
    
    -- Relations
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    meta JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE products IS 'Product catalog master';
COMMENT ON COLUMN products.shipping_inside IS 'Custom shipping for Inside Valley (NPR). NULL = use default 100';
COMMENT ON COLUMN products.shipping_outside IS 'Custom shipping for Outside Valley (NPR). NULL = use default 150';

-- -----------------------------------------------------------------------------
-- 3.5 PRODUCT VARIANTS (SKU Level with Dynamic Attributes)
-- -----------------------------------------------------------------------------
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Identity
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    
    -- Dynamic Attributes (replaces hardcoded color/size/material)
    -- Example: {"color": "Red", "size": "XL", "material": "Cotton"}
    attributes JSONB NOT NULL DEFAULT '{}',
    
    -- Legacy columns (deprecated, use attributes instead)
    color VARCHAR(100),
    size VARCHAR(50),
    material VARCHAR(100),
    
    -- Physical
    weight_grams INTEGER,
    
    -- Pricing (DECIMAL for accuracy)
    cost_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    mrp DECIMAL(12, 2),
    
    -- Dual-Bucket Inventory
    current_stock INTEGER NOT NULL DEFAULT 0,
    damaged_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    meta JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_stock CHECK (current_stock >= 0),
    CONSTRAINT positive_damaged CHECK (damaged_stock >= 0),
    CONSTRAINT positive_reserved CHECK (reserved_stock >= 0),
    CONSTRAINT valid_prices CHECK (cost_price >= 0 AND selling_price >= 0)
);

COMMENT ON TABLE product_variants IS 'SKU-level inventory with dynamic attributes';
COMMENT ON COLUMN product_variants.attributes IS 'Dynamic key-value pairs: {"color": "Red", "size": "XL"}';
COMMENT ON COLUMN product_variants.current_stock IS 'Fresh/sellable stock';
COMMENT ON COLUMN product_variants.damaged_stock IS 'Quarantined/damaged stock - not for sale';

-- =============================================================================
-- SECTION 4: ORDER MANAGEMENT
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 ORDERS
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    
    -- Source
    source order_source NOT NULL DEFAULT 'manual',
    source_order_id VARCHAR(100),
    
    -- Status
    status order_status NOT NULL DEFAULT 'intake',
    fulfillment_type fulfillment_type DEFAULT 'inside_valley',
    
    -- Pricing (DECIMAL for accuracy)
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(12, 2) DEFAULT 0.00,
    discount_code VARCHAR(50),
    shipping_charges DECIMAL(12, 2) DEFAULT 0.00,
    cod_charges DECIMAL(12, 2) DEFAULT 0.00,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Payment
    payment_method payment_method DEFAULT 'cod',
    payment_status payment_status DEFAULT 'pending',
    paid_amount DECIMAL(12, 2) DEFAULT 0.00,
    
    -- Shipping Snapshot (copied from customer at order time)
    shipping_name VARCHAR(255),
    shipping_phone VARCHAR(20),
    shipping_address TEXT,
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_pincode VARCHAR(10),
    
    -- Logistics (Inside Valley)
    rider_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rider_assigned_at TIMESTAMPTZ,
    
    -- Logistics (Outside Valley)
    courier_partner VARCHAR(100),
    awb_number VARCHAR(100),
    tracking_url TEXT,
    handover_at TIMESTAMPTZ,
    
    -- Workflow
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    priority INTEGER DEFAULT 0,
    followup_date TIMESTAMPTZ,
    followup_reason TEXT,
    followup_count INTEGER DEFAULT 0,
    
    -- Notes
    internal_notes TEXT,
    customer_notes TEXT,
    
    -- Cancellation/Rejection/Return
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    return_reason TEXT,
    return_initiated_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    
    -- Timestamps
    dispatched_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    
    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE orders IS 'Order master with Nepal logistics support';

-- -----------------------------------------------------------------------------
-- 4.2 ORDER ITEMS
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    
    -- Product Snapshot (copied at order time)
    sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(500) NOT NULL,
    variant_name VARCHAR(255),
    
    -- Quantities & Pricing
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    discount_per_unit DECIMAL(12, 2) DEFAULT 0.00,
    total_price DECIMAL(12, 2) NOT NULL,
    
    -- Fulfillment
    fulfilled_quantity INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT positive_quantity CHECK (quantity > 0)
);

COMMENT ON TABLE order_items IS 'Line items for orders';

-- -----------------------------------------------------------------------------
-- 4.3 ORDER LOGS (Audit Trail)
-- -----------------------------------------------------------------------------
CREATE TABLE order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status order_status,
    new_status order_status NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_logs IS 'Audit trail for order changes';

-- -----------------------------------------------------------------------------
-- 4.4 ORDER COMMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE order_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    source comment_source NOT NULL DEFAULT 'staff',
    is_internal BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE order_comments IS 'Comments and notes on orders';

-- =============================================================================
-- SECTION 5: INVENTORY MANAGEMENT (Unified Transaction System)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 INVENTORY TRANSACTIONS (Header)
-- -----------------------------------------------------------------------------
CREATE TABLE inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    transaction_type inventory_transaction_type NOT NULL,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    
    -- Relations
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    performed_by UUID NOT NULL REFERENCES users(id),
    
    -- Dates
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Details
    reason TEXT,
    notes TEXT,
    
    -- Maker-Checker Workflow
    status inventory_transaction_status NOT NULL DEFAULT 'approved',
    reference_transaction_id UUID REFERENCES inventory_transactions(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approval_date TIMESTAMPTZ,
    rejection_reason TEXT,
    
    -- Computed Totals (updated by trigger)
    total_quantity INTEGER DEFAULT 0,
    total_cost DECIMAL(14, 2) DEFAULT 0.00,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE inventory_transactions IS 'Unified inventory transaction header (Purchase, Return, Damage, Adjustment)';
COMMENT ON COLUMN inventory_transactions.status IS 'pending=awaiting approval, approved=stock updated, rejected=declined, voided=cancelled';
COMMENT ON COLUMN inventory_transactions.reference_transaction_id IS 'For Purchase Returns: links to original purchase';

-- -----------------------------------------------------------------------------
-- 5.2 INVENTORY TRANSACTION ITEMS (Line Items)
-- -----------------------------------------------------------------------------
CREATE TABLE inventory_transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES inventory_transactions(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    
    -- Quantity (positive=stock in, negative=stock out)
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12, 2) DEFAULT 0.00,
    
    -- Dual-Bucket Source
    source_type stock_source_type DEFAULT 'fresh',
    
    -- Stock Snapshot (filled by trigger)
    stock_before INTEGER,
    stock_after INTEGER,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT non_zero_quantity CHECK (quantity <> 0)
);

COMMENT ON TABLE inventory_transaction_items IS 'Line items for inventory transactions';
COMMENT ON COLUMN inventory_transaction_items.quantity IS 'Positive for stock in (purchase), negative for stock out (return, damage)';
COMMENT ON COLUMN inventory_transaction_items.source_type IS 'Which bucket: fresh (current_stock) or damaged (damaged_stock)';

-- -----------------------------------------------------------------------------
-- 5.3 STOCK MOVEMENTS (Audit Trail)
-- -----------------------------------------------------------------------------
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    stock_before INTEGER NOT NULL,
    stock_after INTEGER NOT NULL,
    reference_id UUID,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reason TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE stock_movements IS 'Complete audit trail of all stock changes';

-- =============================================================================
-- SECTION 6: LOGISTICS & DELIVERY
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6.1 COURIER PARTNERS (3rd Party Logistics)
-- -----------------------------------------------------------------------------
CREATE TABLE courier_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    api_url TEXT,
    api_key VARCHAR(255),
    tracking_url_template TEXT,
    base_rate DECIMAL(10, 2) DEFAULT 0.00,
    per_kg_rate DECIMAL(10, 2) DEFAULT 0.00,
    cod_percentage DECIMAL(5, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    coverage_areas TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE courier_partners IS '3rd party courier providers for Outside Valley delivery';

-- -----------------------------------------------------------------------------
-- 6.2 DELIVERY ZONES
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_name VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    state_province VARCHAR(100),
    zone_type zone_type NOT NULL DEFAULT 'outside_valley',
    delivery_charge DECIMAL(10, 2) DEFAULT 0.00,
    estimated_days INTEGER DEFAULT 3,
    is_cod_available BOOLEAN DEFAULT TRUE,
    is_prepaid_available BOOLEAN DEFAULT TRUE,
    default_courier_id UUID REFERENCES courier_partners(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_city_district UNIQUE(city_name, district)
);

COMMENT ON TABLE delivery_zones IS 'City/district delivery configuration';

-- -----------------------------------------------------------------------------
-- 6.3 RIDERS (In-house Delivery Staff)
-- -----------------------------------------------------------------------------
CREATE TABLE riders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rider_code VARCHAR(10) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    emergency_contact VARCHAR(20),
    status rider_status NOT NULL DEFAULT 'off_duty',
    vehicle_type VARCHAR(50) DEFAULT 'motorcycle',
    vehicle_number VARCHAR(20),
    license_number VARCHAR(30),
    max_orders_per_run INTEGER DEFAULT 15,
    total_deliveries INTEGER DEFAULT 0,
    successful_deliveries INTEGER DEFAULT 0,
    failed_deliveries INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 5.00,
    current_cash_balance DECIMAL(12, 2) DEFAULT 0.00,
    is_available BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    joined_at DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_rider_user UNIQUE(user_id)
);

COMMENT ON TABLE riders IS 'In-house delivery personnel for Inside Valley orders';

-- -----------------------------------------------------------------------------
-- 6.4 DELIVERY RUNS (Batch Assignments)
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_number VARCHAR(20) UNIQUE NOT NULL,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    total_orders INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    expected_cod DECIMAL(12, 2) DEFAULT 0.00,
    collected_cod DECIMAL(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE delivery_runs IS 'Batch of orders assigned to a rider';

-- =============================================================================
-- SECTION 7: SUPPORT & TICKETING
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 TICKETS
-- -----------------------------------------------------------------------------
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    type ticket_type NOT NULL DEFAULT 'issue',
    priority ticket_priority NOT NULL DEFAULT 'medium',
    status ticket_status NOT NULL DEFAULT 'open',
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Relations
    related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    
    -- Assignment
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    
    -- Resolution
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Feedback
    feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
    
    -- Timestamps
    due_date TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

COMMENT ON TABLE tickets IS 'Support tickets for issues, returns, feedback';

-- -----------------------------------------------------------------------------
-- 7.2 TICKET MESSAGES
-- -----------------------------------------------------------------------------
CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sender_name VARCHAR(100),
    is_internal BOOLEAN DEFAULT FALSE,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ticket_messages IS 'Messages within support tickets';

-- =============================================================================
-- SECTION 8: SMS & NOTIFICATIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 8.1 SMS TEMPLATES
-- -----------------------------------------------------------------------------
CREATE TABLE sms_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    trigger_status order_status,
    template_text TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sms_templates IS 'SMS message templates with variables';

-- -----------------------------------------------------------------------------
-- 8.2 SMS LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    status sms_status NOT NULL DEFAULT 'pending',
    provider VARCHAR(50),
    provider_response JSONB DEFAULT '{}',
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sms_logs IS 'Log of all SMS sent';

-- =============================================================================
-- SECTION 9: SYSTEM TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 9.1 CATEGORIES (Dynamic)
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE categories IS 'Product categories (hierarchical)';

-- -----------------------------------------------------------------------------
-- 9.2 BRANDS (Dynamic)
-- -----------------------------------------------------------------------------
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE brands IS 'Product brands';

-- -----------------------------------------------------------------------------
-- 9.3 APP SETTINGS
-- -----------------------------------------------------------------------------
CREATE TABLE app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE app_settings IS 'Application configuration key-value store';

-- =============================================================================
-- SECTION 10: INDEXES (Performance Critical)
-- =============================================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Vendors
CREATE INDEX idx_vendors_phone ON vendors(phone);
CREATE INDEX idx_vendors_is_active ON vendors(is_active) WHERE is_active = TRUE;

-- Customers
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_phone_trgm ON customers USING gin(phone gin_trgm_ops);
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_name_trgm ON customers USING gin(name gin_trgm_ops);
CREATE INDEX idx_customers_tier ON customers(tier);

-- Products
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_is_active ON products(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_products_vendor_id ON products(vendor_id);

-- Product Variants
CREATE UNIQUE INDEX idx_unique_variant_sku ON product_variants(sku) WHERE sku IS NOT NULL AND sku != '';
CREATE INDEX idx_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_variants_is_active ON product_variants(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_variants_low_stock ON product_variants(current_stock) WHERE current_stock <= 10;
CREATE INDEX idx_variants_damaged ON product_variants(damaged_stock) WHERE damaged_stock > 0;

-- Orders
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_fulfillment ON orders(fulfillment_type);
CREATE INDEX idx_orders_status_fulfillment ON orders(status, fulfillment_type);
CREATE INDEX idx_orders_awb_number ON orders(awb_number) WHERE awb_number IS NOT NULL;
CREATE INDEX idx_orders_created_at_desc ON orders(created_at DESC);
CREATE INDEX idx_orders_active ON orders(status, created_at DESC) WHERE status NOT IN ('cancelled', 'rejected', 'returned');
CREATE INDEX idx_orders_pending ON orders(created_at DESC) WHERE status IN ('intake', 'follow_up');
CREATE INDEX idx_orders_rider_id ON orders(rider_id) WHERE rider_id IS NOT NULL;

-- Order Items
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_variant_id ON order_items(variant_id);

-- Inventory Transactions
CREATE INDEX idx_inv_tx_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_inv_tx_invoice ON inventory_transactions(invoice_no);
CREATE INDEX idx_inv_tx_vendor ON inventory_transactions(vendor_id);
CREATE INDEX idx_inv_tx_date ON inventory_transactions(transaction_date DESC);
CREATE INDEX idx_inv_tx_status ON inventory_transactions(status);
CREATE INDEX idx_inv_tx_pending ON inventory_transactions(created_at DESC) WHERE status = 'pending';

-- Inventory Transaction Items
CREATE INDEX idx_inv_items_tx ON inventory_transaction_items(transaction_id);
CREATE INDEX idx_inv_items_variant ON inventory_transaction_items(variant_id);

-- Stock Movements
CREATE INDEX idx_stock_mv_variant ON stock_movements(variant_id);
CREATE INDEX idx_stock_mv_date ON stock_movements(created_at DESC);

-- Tickets
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_customer ON tickets(customer_id);
CREATE INDEX idx_tickets_order ON tickets(related_order_id);

-- SMS Logs
CREATE INDEX idx_sms_logs_phone ON sms_logs(phone);
CREATE INDEX idx_sms_logs_status ON sms_logs(status);
CREATE INDEX idx_sms_logs_order ON sms_logs(order_id);

-- =============================================================================
-- SECTION 11: TRIGGERS & FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 11.1 Updated At Trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_inv_tx_updated_at BEFORE UPDATE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_riders_updated_at BEFORE UPDATE ON riders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 11.2 Inventory Transaction Stock Update Trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_stock_on_transaction_item()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_type inventory_transaction_type;
    v_transaction_status inventory_transaction_status;
    v_current_stock INTEGER;
    v_damaged_stock INTEGER;
    v_quantity_change INTEGER;
BEGIN
    -- Get transaction type and status
    SELECT transaction_type, status INTO v_transaction_type, v_transaction_status
    FROM inventory_transactions WHERE id = NEW.transaction_id;
    
    -- Only update stock if transaction is APPROVED
    IF v_transaction_status != 'approved' THEN
        RETURN NEW;
    END IF;
    
    -- Get current stock levels
    SELECT current_stock, damaged_stock INTO v_current_stock, v_damaged_stock
    FROM product_variants WHERE id = NEW.variant_id;
    
    -- Record stock before
    NEW.stock_before := v_current_stock;
    
    -- Calculate stock changes based on transaction type
    CASE v_transaction_type
        WHEN 'purchase' THEN
            -- Purchase: Add to fresh stock
            v_quantity_change := ABS(NEW.quantity);
            UPDATE product_variants
            SET current_stock = current_stock + v_quantity_change, updated_at = NOW()
            WHERE id = NEW.variant_id;
            NEW.stock_after := v_current_stock + v_quantity_change;
            
        WHEN 'purchase_return' THEN
            -- Return: Deduct from appropriate bucket
            v_quantity_change := ABS(NEW.quantity);
            IF NEW.source_type = 'damaged' THEN
                UPDATE product_variants
                SET damaged_stock = GREATEST(0, damaged_stock - v_quantity_change), updated_at = NOW()
                WHERE id = NEW.variant_id;
            ELSE
                UPDATE product_variants
                SET current_stock = GREATEST(0, current_stock - v_quantity_change), updated_at = NOW()
                WHERE id = NEW.variant_id;
            END IF;
            NEW.stock_after := GREATEST(0, v_current_stock - v_quantity_change);
            
        WHEN 'damage' THEN
            -- Damage: Move from fresh to damaged
            v_quantity_change := ABS(NEW.quantity);
            UPDATE product_variants
            SET current_stock = GREATEST(0, current_stock - v_quantity_change),
                damaged_stock = damaged_stock + v_quantity_change,
                updated_at = NOW()
            WHERE id = NEW.variant_id;
            NEW.stock_after := GREATEST(0, v_current_stock - v_quantity_change);
            
        WHEN 'adjustment' THEN
            -- Adjustment: Direct quantity change (can be positive or negative)
            v_quantity_change := NEW.quantity;
            UPDATE product_variants
            SET current_stock = GREATEST(0, current_stock + v_quantity_change), updated_at = NOW()
            WHERE id = NEW.variant_id;
            NEW.stock_after := GREATEST(0, v_current_stock + v_quantity_change);
    END CASE;
    
    -- Create stock movement audit record
    INSERT INTO stock_movements (variant_id, movement_type, quantity, stock_before, stock_after, reference_id, reason)
    VALUES (NEW.variant_id, v_transaction_type::text, NEW.quantity, NEW.stock_before, NEW.stock_after, NEW.transaction_id, NEW.notes);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_item_stock_update
BEFORE INSERT ON inventory_transaction_items
FOR EACH ROW EXECUTE FUNCTION update_stock_on_transaction_item();

-- -----------------------------------------------------------------------------
-- 11.3 Order Number Generator
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_seq INTEGER;
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER)), 0) + 1
        INTO v_seq
        FROM orders
        WHERE order_number LIKE 'ORD-%';
        
        NEW.order_number := 'ORD-' || LPAD(v_seq::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_order_number
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- -----------------------------------------------------------------------------
-- 11.4 Invoice Number Generator Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_type inventory_transaction_type)
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_last_num INTEGER;
    v_new_num TEXT;
BEGIN
    -- Set prefix based on type
    v_prefix := CASE p_type
        WHEN 'purchase' THEN 'PUR-'
        WHEN 'purchase_return' THEN 'RET-'
        WHEN 'damage' THEN 'DMG-'
        WHEN 'adjustment' THEN 'ADJ-'
    END;
    
    -- Get last number for this prefix
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no FROM LENGTH(v_prefix) + 1) AS INTEGER)), 0)
    INTO v_last_num
    FROM inventory_transactions
    WHERE invoice_no LIKE v_prefix || '%';
    
    -- Generate new number
    v_new_num := v_prefix || LPAD((v_last_num + 1)::text, 6, '0');
    
    RETURN v_new_num;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 11.5 Approval/Rejection Functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION approve_inventory_transaction(
    p_transaction_id UUID,
    p_approved_by UUID
)
RETURNS TABLE (id UUID, status inventory_transaction_status) AS $$
DECLARE
    v_current_status inventory_transaction_status;
BEGIN
    -- Get current status
    SELECT it.status INTO v_current_status
    FROM inventory_transactions it WHERE it.id = p_transaction_id;
    
    IF v_current_status != 'pending' THEN
        RAISE EXCEPTION 'Transaction is not pending (current: %)', v_current_status;
    END IF;
    
    -- Update status to approved
    UPDATE inventory_transactions
    SET status = 'approved',
        approved_by = p_approved_by,
        approval_date = NOW(),
        updated_at = NOW()
    WHERE inventory_transactions.id = p_transaction_id;
    
    -- The stock update trigger will now process items
    -- Force re-process items by updating them
    UPDATE inventory_transaction_items
    SET notes = COALESCE(notes, '') -- Touch to trigger
    WHERE transaction_id = p_transaction_id;
    
    RETURN QUERY SELECT inventory_transactions.id, inventory_transactions.status FROM inventory_transactions WHERE inventory_transactions.id = p_transaction_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_inventory_transaction(
    p_transaction_id UUID,
    p_rejected_by UUID,
    p_rejection_reason TEXT
)
RETURNS TABLE (id UUID, status inventory_transaction_status) AS $$
BEGIN
    UPDATE inventory_transactions
    SET status = 'rejected',
        approved_by = p_rejected_by,
        approval_date = NOW(),
        rejection_reason = p_rejection_reason,
        updated_at = NOW()
    WHERE inventory_transactions.id = p_transaction_id
      AND status = 'pending';
    
    RETURN QUERY SELECT inventory_transactions.id, inventory_transactions.status FROM inventory_transactions WHERE inventory_transactions.id = p_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 12: ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS Policies: Block all access for 'anon' role
-- Only 'authenticated' users can access
-- -----------------------------------------------------------------------------

-- Users: Authenticated can read, only admin can write
CREATE POLICY users_select ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY users_insert ON users FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY users_update ON users FOR UPDATE TO authenticated USING (
    id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Vendors: All authenticated can read, admin/manager can write
CREATE POLICY vendors_select ON vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY vendors_insert ON vendors FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);
CREATE POLICY vendors_update ON vendors FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Customers: All authenticated can access
CREATE POLICY customers_all ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Products: All authenticated can read, staff can write
CREATE POLICY products_select ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY products_insert ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY products_update ON products FOR UPDATE TO authenticated USING (true);

-- Product Variants: Same as products
CREATE POLICY variants_select ON product_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY variants_insert ON product_variants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY variants_update ON product_variants FOR UPDATE TO authenticated USING (true);

-- Orders: All authenticated can access
CREATE POLICY orders_all ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Order Items: All authenticated can access
CREATE POLICY order_items_all ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Order Logs: All authenticated can read, system inserts
CREATE POLICY order_logs_select ON order_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY order_logs_insert ON order_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Order Comments: All authenticated
CREATE POLICY order_comments_all ON order_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Inventory Transactions: All authenticated can access
CREATE POLICY inv_tx_all ON inventory_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Inventory Transaction Items: All authenticated
CREATE POLICY inv_items_all ON inventory_transaction_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Stock Movements: Read only for all, insert by trigger
CREATE POLICY stock_mv_select ON stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY stock_mv_insert ON stock_movements FOR INSERT TO authenticated WITH CHECK (true);

-- Tickets: All authenticated
CREATE POLICY tickets_all ON tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ticket Messages: All authenticated
CREATE POLICY ticket_messages_all ON ticket_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SMS: Admin/Manager only for templates, all for logs
CREATE POLICY sms_templates_select ON sms_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY sms_templates_write ON sms_templates FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);
CREATE POLICY sms_logs_all ON sms_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Riders: Authenticated can read, admin can write
CREATE POLICY riders_select ON riders FOR SELECT TO authenticated USING (true);
CREATE POLICY riders_write ON riders FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Delivery Runs: Authenticated
CREATE POLICY delivery_runs_all ON delivery_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Courier Partners: Authenticated can read, admin can write
CREATE POLICY couriers_select ON courier_partners FOR SELECT TO authenticated USING (true);
CREATE POLICY couriers_write ON courier_partners FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Delivery Zones: Authenticated can read, admin can write
CREATE POLICY zones_select ON delivery_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY zones_write ON delivery_zones FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

-- Categories/Brands: Authenticated can read, admin can write
CREATE POLICY categories_select ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY categories_write ON categories FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY brands_select ON brands FOR SELECT TO authenticated USING (true);
CREATE POLICY brands_write ON brands FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- App Settings: Authenticated can read, admin only can write
CREATE POLICY settings_select ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_write ON app_settings FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- =============================================================================
-- SECTION 13: GRANTS
-- =============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant all on tables to service_role (for backend)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Grant select/insert/update on tables to authenticated (for RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================

COMMENT ON SCHEMA public IS 'Seetara ERP - Production Schema v2.0.0';
