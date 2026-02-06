-- =============================================================================
-- SEETARA ERP - MASTER SCHEMA v3.1.0 (EMERGENCY CONSOLIDATED)
-- =============================================================================
-- 
-- DATE: 2026-01-24
-- PURPOSE: Single source of truth - Run this ONCE on Supabase
--
-- FIXES:
-- ✅ Bug 1, 3, 4, 5, 6: All missing tables created
-- ✅ sms_templates, vendor_ledger, order_items, inventory_transactions
-- ✅ All columns aligned with Backend models
--
-- =============================================================================

-- =============================================================================
-- SECTION 0: EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- SECTION 1: DROP EXISTING TYPES (for clean recreation)
-- =============================================================================

DO $$ BEGIN
    DROP TYPE IF EXISTS user_role CASCADE;
    DROP TYPE IF EXISTS order_status CASCADE;
    DROP TYPE IF EXISTS order_source CASCADE;
    DROP TYPE IF EXISTS fulfillment_type CASCADE;
    DROP TYPE IF EXISTS payment_status CASCADE;
    DROP TYPE IF EXISTS payment_method CASCADE;
    DROP TYPE IF EXISTS inventory_transaction_type CASCADE;
    DROP TYPE IF EXISTS inventory_transaction_status CASCADE;
    DROP TYPE IF EXISTS stock_source_type CASCADE;
    DROP TYPE IF EXISTS customer_tier CASCADE;
    DROP TYPE IF EXISTS zone_type CASCADE;
    DROP TYPE IF EXISTS rider_status CASCADE;
    DROP TYPE IF EXISTS delivery_result CASCADE;
    DROP TYPE IF EXISTS delivery_status CASCADE;
    DROP TYPE IF EXISTS ticket_type CASCADE;
    DROP TYPE IF EXISTS ticket_priority CASCADE;
    DROP TYPE IF EXISTS ticket_status CASCADE;
    DROP TYPE IF EXISTS sms_status CASCADE;
    DROP TYPE IF EXISTS comment_source CASCADE;
    DROP TYPE IF EXISTS vendor_ledger_type CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =============================================================================
-- SECTION 2: CREATE ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'operator', 'vendor', 'rider', 'viewer');

CREATE TYPE order_status AS ENUM (
    'intake', 'follow_up', 'converted', 'hold', 'packed', 'assigned',
    'out_for_delivery', 'handover_to_courier', 'in_transit', 'store_sale',
    'delivered', 'cancelled', 'rejected', 'return_initiated', 'returned'
);

CREATE TYPE order_source AS ENUM (
    'manual', 'website', 'facebook', 'instagram', 'store',
    'todaytrend', 'seetara', 'shopify', 'woocommerce', 'api'
);

CREATE TYPE fulfillment_type AS ENUM ('inside_valley', 'outside_valley', 'store');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partial', 'refunded', 'cod');
CREATE TYPE payment_method AS ENUM ('cod', 'esewa', 'khalti', 'bank_transfer', 'cash');
CREATE TYPE inventory_transaction_type AS ENUM ('purchase', 'purchase_return', 'damage', 'adjustment');
CREATE TYPE inventory_transaction_status AS ENUM ('pending', 'approved', 'rejected', 'voided');
CREATE TYPE stock_source_type AS ENUM ('fresh', 'damaged');
CREATE TYPE customer_tier AS ENUM ('new', 'regular', 'vip', 'gold', 'platinum', 'warning', 'blacklisted');
CREATE TYPE zone_type AS ENUM ('inside_valley', 'outside_valley');
CREATE TYPE rider_status AS ENUM ('available', 'on_delivery', 'on_break', 'off_duty', 'suspended');
CREATE TYPE delivery_result AS ENUM ('delivered', 'rejected', 'not_home', 'wrong_address', 'rescheduled', 'returned');
CREATE TYPE delivery_status AS ENUM ('assigned', 'picked', 'in_transit', 'delivered', 'failed', 'returned');
CREATE TYPE ticket_type AS ENUM ('issue', 'task', 'feedback', 'vendor_dispute', 'return_request', 'inquiry');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'in_progress', 'escalated', 'resolved', 'closed');
CREATE TYPE sms_status AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed', 'blocked', 'skipped');
CREATE TYPE comment_source AS ENUM ('staff', 'logistics', 'system', 'customer');
CREATE TYPE vendor_ledger_type AS ENUM (
    'purchase', 'purchase_return', 'payment', 'debit_note', 
    'credit_note', 'void_purchase', 'void_return', 'adjustment', 'opening_balance'
);

-- =============================================================================
-- SECTION 3: CORE TABLES
-- =============================================================================

-- 3.1 USERS
DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) DEFAULT '',
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'operator',
    phone VARCHAR(20),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    vendor_id UUID,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 VENDORS
DROP TABLE IF EXISTS vendors CASCADE;
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
    total_purchases DECIMAL(14, 2) DEFAULT 0.00,
    total_payments DECIMAL(14, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK: users -> vendors
ALTER TABLE users ADD CONSTRAINT fk_users_vendor 
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

-- 3.3 CUSTOMERS
DROP TABLE IF EXISTS customers CASCADE;
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    alt_phone VARCHAR(20),
    email VARCHAR(255),
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    country VARCHAR(100) DEFAULT 'Nepal',
    ip_address INET,
    fbid VARCHAR(100),
    fbclid VARCHAR(255),
    gclid VARCHAR(255),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(255),
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(14, 2) DEFAULT 0.00,
    return_count INTEGER DEFAULT 0,
    customer_score DECIMAL(5, 2) DEFAULT 50.00,
    tier customer_tier DEFAULT 'new',
    avg_order_value DECIMAL(12, 2) DEFAULT 0.00,
    delivery_success_rate DECIMAL(5, 2) DEFAULT 100.00,
    first_order_at TIMESTAMPTZ,
    last_order_at TIMESTAMPTZ,
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.4 PRODUCTS
DROP TABLE IF EXISTS products CASCADE;
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(500) NOT NULL,
    description TEXT,
    brand VARCHAR(255),
    category VARCHAR(255),
    image_url TEXT,
    shipping_inside INTEGER DEFAULT NULL,
    shipping_outside INTEGER DEFAULT NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.5 PRODUCT VARIANTS
DROP TABLE IF EXISTS product_variants CASCADE;
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    attributes JSONB NOT NULL DEFAULT '{}',
    color VARCHAR(100),
    size VARCHAR(50),
    material VARCHAR(100),
    weight_grams INTEGER,
    cost_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    mrp DECIMAL(12, 2),
    current_stock INTEGER NOT NULL DEFAULT 0,
    damaged_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT positive_stock CHECK (current_stock >= 0),
    CONSTRAINT positive_damaged CHECK (damaged_stock >= 0),
    CONSTRAINT positive_reserved CHECK (reserved_stock >= 0)
);

-- =============================================================================
-- SECTION 4: ORDERS (Critical for Bug 1, 3)
-- =============================================================================

-- 4.1 ORDERS
DROP TABLE IF EXISTS orders CASCADE;
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    source order_source NOT NULL DEFAULT 'manual',
    source_order_id VARCHAR(100),
    status order_status NOT NULL DEFAULT 'intake',
    fulfillment_type fulfillment_type DEFAULT 'inside_valley',
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(12, 2) DEFAULT 0.00,
    discount_code VARCHAR(50),
    shipping_charges DECIMAL(12, 2) DEFAULT 0.00,
    cod_charges DECIMAL(12, 2) DEFAULT 0.00,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    payment_method payment_method DEFAULT 'cod',
    payment_status payment_status DEFAULT 'pending',
    paid_amount DECIMAL(12, 2) DEFAULT 0.00,
    shipping_name VARCHAR(255),
    shipping_phone VARCHAR(20),
    shipping_address TEXT,
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_pincode VARCHAR(10),
    rider_id UUID,
    rider_assigned_at TIMESTAMPTZ,
    courier_partner VARCHAR(100),
    awb_number VARCHAR(100),
    tracking_url TEXT,
    handover_at TIMESTAMPTZ,
    assigned_to UUID,
    priority INTEGER DEFAULT 0,
    followup_date TIMESTAMPTZ,
    followup_reason TEXT,
    followup_count INTEGER DEFAULT 0,
    internal_notes TEXT,
    customer_notes TEXT,
    cancellation_reason TEXT,
    cancelled_by UUID,
    rejection_reason TEXT,
    rejected_by UUID,
    return_reason TEXT,
    return_initiated_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by UUID,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 ORDER ITEMS (Critical - was missing!)
DROP TABLE IF EXISTS order_items CASCADE;
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(500) NOT NULL,
    variant_name VARCHAR(255),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    discount_per_unit DECIMAL(12, 2) DEFAULT 0.00,
    total_price DECIMAL(12, 2) NOT NULL,
    fulfilled_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- 4.3 ORDER LOGS
DROP TABLE IF EXISTS order_logs CASCADE;
CREATE TABLE order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status order_status,
    new_status order_status NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    changed_by UUID,
    ip_address INET,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.4 ORDER COMMENTS
DROP TABLE IF EXISTS order_comments CASCADE;
CREATE TABLE order_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    source comment_source NOT NULL DEFAULT 'staff',
    is_internal BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 5: INVENTORY (Critical for Bug 4, 5)
-- =============================================================================

-- 5.1 INVENTORY TRANSACTIONS
DROP TABLE IF EXISTS inventory_transactions CASCADE;
CREATE TABLE inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type inventory_transaction_type NOT NULL,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    performed_by UUID NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT,
    notes TEXT,
    status inventory_transaction_status NOT NULL DEFAULT 'approved',
    reference_transaction_id UUID,
    approved_by UUID,
    approval_date TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    rejected_by UUID,
    rejected_at TIMESTAMPTZ,
    voided_by UUID,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    total_quantity INTEGER DEFAULT 0,
    total_cost DECIMAL(14, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.2 INVENTORY TRANSACTION ITEMS
DROP TABLE IF EXISTS inventory_transaction_items CASCADE;
CREATE TABLE inventory_transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES inventory_transactions(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12, 2) DEFAULT 0.00,
    source_type stock_source_type DEFAULT 'fresh',
    stock_before INTEGER,
    stock_after INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT non_zero_quantity CHECK (quantity <> 0)
);

-- 5.3 STOCK MOVEMENTS
DROP TABLE IF EXISTS stock_movements CASCADE;
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL, -- Added for purchase tracking (migration 045)
    movement_type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    balance_before INTEGER,
    balance_after INTEGER,
    stock_before INTEGER,
    stock_after INTEGER,
    reference_id UUID,
    order_id UUID,
    source VARCHAR(50),
    reason TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes for stock_movements (migration 045)
CREATE INDEX idx_stock_movements_vendor ON stock_movements(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX idx_stock_movements_variant_created ON stock_movements(variant_id, created_at DESC);
CREATE INDEX idx_stock_movements_type_created ON stock_movements(movement_type, created_at DESC);

-- =============================================================================
-- SECTION 6: VENDOR MANAGEMENT (Critical for Bug 5)
-- =============================================================================

-- 6.1 VENDOR LEDGER (was missing!)
DROP TABLE IF EXISTS vendor_ledger CASCADE;
CREATE TABLE vendor_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    entry_type vendor_ledger_type NOT NULL,
    reference_id UUID,
    reference_no VARCHAR(50),
    debit DECIMAL(14, 2) DEFAULT 0,
    credit DECIMAL(14, 2) DEFAULT 0,
    running_balance DECIMAL(14, 2) NOT NULL DEFAULT 0,
    description TEXT,
    notes TEXT,
    performed_by UUID,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_debit_credit CHECK (
        (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0)
    )
);

-- 6.2 VENDOR PAYMENTS
DROP TABLE IF EXISTS vendor_payments CASCADE;
CREATE TABLE vendor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    payment_no VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
    reference_number VARCHAR(100),
    balance_before DECIMAL(14, 2) NOT NULL DEFAULT 0,
    balance_after DECIMAL(14, 2) NOT NULL DEFAULT 0,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    receipt_url TEXT,
    attachments JSONB DEFAULT '[]',
    created_by UUID,
    approved_by UUID,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6.3 VENDOR USERS
DROP TABLE IF EXISTS vendor_users CASCADE;
CREATE TABLE vendor_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    is_primary BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    password_changed_at TIMESTAMPTZ,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 7: SMS & NOTIFICATIONS (Critical for Bug 6)
-- =============================================================================

-- 7.1 SMS TEMPLATES (was missing!)
DROP TABLE IF EXISTS sms_templates CASCADE;
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

-- 7.2 SMS LOGS
DROP TABLE IF EXISTS sms_logs CASCADE;
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
    order_id UUID,
    customer_id UUID,
    status sms_status NOT NULL DEFAULT 'pending',
    provider VARCHAR(50),
    provider_response JSONB DEFAULT '{}',
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 8: LOGISTICS & DELIVERY
-- =============================================================================

-- 8.1 COURIER PARTNERS
DROP TABLE IF EXISTS courier_partners CASCADE;
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

-- 8.2 DELIVERY ZONES
DROP TABLE IF EXISTS delivery_zones CASCADE;
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_name VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    state_province VARCHAR(100),
    zone_type zone_type NOT NULL DEFAULT 'outside_valley',
    delivery_charge DECIMAL(10, 2) DEFAULT 0.00,
    delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
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

-- 8.3 RIDERS
DROP TABLE IF EXISTS riders CASCADE;
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

-- 8.4 DELIVERY RUNS
DROP TABLE IF EXISTS delivery_runs CASCADE;
CREATE TABLE delivery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_number VARCHAR(20) UNIQUE NOT NULL,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    assigned_by UUID,
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

-- =============================================================================
-- SECTION 9: SUPPORT & TICKETING
-- =============================================================================

DROP TABLE IF EXISTS tickets CASCADE;
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    type ticket_type NOT NULL DEFAULT 'issue',
    priority ticket_priority NOT NULL DEFAULT 'medium',
    status ticket_status NOT NULL DEFAULT 'open',
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    related_order_id UUID,
    customer_id UUID,
    vendor_id UUID,
    product_id UUID,
    assigned_to UUID,
    assigned_at TIMESTAMPTZ,
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
    due_date TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

DROP TABLE IF EXISTS ticket_messages CASCADE;
CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    sender_id UUID,
    sender_name VARCHAR(100),
    is_internal BOOLEAN DEFAULT FALSE,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 10: SYSTEM TABLES
-- =============================================================================

DROP TABLE IF EXISTS categories CASCADE;
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

DROP TABLE IF EXISTS brands CASCADE;
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TABLE IF EXISTS app_settings CASCADE;
CREATE TABLE app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 11: INDEXES (Performance Critical)
-- =============================================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_vendor ON users(vendor_id);

-- Vendors
CREATE INDEX idx_vendors_phone ON vendors(phone);
CREATE INDEX idx_vendors_active ON vendors(is_active) WHERE is_active = TRUE;

-- Customers
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX idx_customers_tier ON customers(tier);

-- Products
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_active ON products(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_products_vendor ON products(vendor_id);

-- Product Variants
CREATE UNIQUE INDEX idx_unique_sku ON product_variants(sku) WHERE sku IS NOT NULL AND sku != '';
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_low_stock ON product_variants(current_stock) WHERE current_stock < 10;

-- Orders
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_rider ON orders(rider_id) WHERE rider_id IS NOT NULL;

-- Order Items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);

-- Inventory
CREATE INDEX idx_inv_tx_type ON inventory_transactions(transaction_type);
CREATE INDEX idx_inv_tx_invoice ON inventory_transactions(invoice_no);
CREATE INDEX idx_inv_tx_vendor ON inventory_transactions(vendor_id);
CREATE INDEX idx_inv_tx_status ON inventory_transactions(status);
CREATE INDEX idx_inv_tx_date ON inventory_transactions(transaction_date DESC);

-- Vendor Ledger
CREATE INDEX idx_vendor_ledger_vendor ON vendor_ledger(vendor_id);
CREATE INDEX idx_vendor_ledger_type ON vendor_ledger(entry_type);
CREATE INDEX idx_vendor_ledger_date ON vendor_ledger(transaction_date DESC);

-- SMS
CREATE INDEX idx_sms_logs_phone ON sms_logs(phone);
CREATE INDEX idx_sms_logs_status ON sms_logs(status);

-- =============================================================================
-- SECTION 12: ROW LEVEL SECURITY
-- =============================================================================

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
ALTER TABLE vendor_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Create default policies for all tables
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'users', 'vendors', 'customers', 'products', 'product_variants',
        'orders', 'order_items', 'order_logs', 'order_comments',
        'inventory_transactions', 'inventory_transaction_items', 'stock_movements',
        'vendor_ledger', 'vendor_payments', 'vendor_users',
        'sms_templates', 'sms_logs', 'tickets', 'ticket_messages',
        'courier_partners', 'delivery_zones', 'riders', 'delivery_runs',
        'categories', 'brands', 'app_settings'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS authenticated_all ON %I', tbl);
        EXECUTE format('CREATE POLICY authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
    END LOOP;
END $$;

-- =============================================================================
-- SECTION 13: GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- =============================================================================
-- SECTION 14: VERIFICATION
-- =============================================================================

DO $$
DECLARE
    v_tables INTEGER;
    v_indexes INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_tables FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    SELECT COUNT(*) INTO v_indexes FROM pg_indexes WHERE schemaname = 'public';
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MASTER SCHEMA v3.1.0 INSTALLED SUCCESSFULLY!';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  Tables Created: %', v_tables;
    RAISE NOTICE '  Indexes Created: %', v_indexes;
    RAISE NOTICE '  ✓ sms_templates - CREATED';
    RAISE NOTICE '  ✓ vendor_ledger - CREATED';
    RAISE NOTICE '  ✓ order_items - CREATED';
    RAISE NOTICE '  ✓ inventory_transactions - CREATED';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
