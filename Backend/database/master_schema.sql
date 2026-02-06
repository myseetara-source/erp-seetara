-- =============================================================================
-- SEETARA ERP - MASTER SCHEMA (Consolidated)
-- =============================================================================
--
-- Version: 3.0.0
-- Generated: 2026-01-24
-- 
-- This is the CONSOLIDATED SCHEMA containing all tables, types, indexes,
-- and RLS policies from migrations 000-042.
--
-- EXECUTION ORDER:
-- 1. master_schema.sql   (this file)
-- 2. master_functions.sql
-- 3. master_triggers.sql
-- 4. master_seed.sql
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- =============================================================================
-- SECTION 2: ENUMS (Type Definitions)
-- =============================================================================

-- User Roles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'admin', 'manager', 'operator', 'vendor', 'rider', 'viewer'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Order Status State Machine
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'intake', 'follow_up', 'converted', 'hold', 'packed', 'assigned',
        'out_for_delivery', 'handover_to_courier', 'in_transit', 'store_sale',
        'delivered', 'cancelled', 'rejected', 'return_initiated', 'returned'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Order Source Channels
DO $$ BEGIN
    CREATE TYPE order_source AS ENUM (
        'manual', 'website', 'facebook', 'instagram', 'store',
        'todaytrend', 'seetara', 'shopify', 'woocommerce', 'api'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Fulfillment Type
DO $$ BEGIN
    CREATE TYPE fulfillment_type AS ENUM ('inside_valley', 'outside_valley', 'store');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Payment Status
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partial', 'refunded', 'cod');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Payment Method
DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('cod', 'esewa', 'khalti', 'bank_transfer', 'cash');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Inventory Transaction Type
DO $$ BEGIN
    CREATE TYPE inventory_transaction_type AS ENUM ('purchase', 'purchase_return', 'damage', 'adjustment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Inventory Transaction Status
DO $$ BEGIN
    CREATE TYPE inventory_transaction_status AS ENUM ('pending', 'approved', 'rejected', 'voided');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Stock Source Type
DO $$ BEGIN
    CREATE TYPE stock_source_type AS ENUM ('fresh', 'damaged');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Customer Tier
DO $$ BEGIN
    CREATE TYPE customer_tier AS ENUM ('new', 'regular', 'vip', 'gold', 'platinum', 'warning', 'blacklisted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Zone Type
DO $$ BEGIN
    CREATE TYPE zone_type AS ENUM ('inside_valley', 'outside_valley');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Rider Status
DO $$ BEGIN
    CREATE TYPE rider_status AS ENUM ('available', 'on_delivery', 'on_break', 'off_duty', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Delivery Result
DO $$ BEGIN
    CREATE TYPE delivery_result AS ENUM ('delivered', 'rejected', 'not_home', 'wrong_address', 'rescheduled', 'returned');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Delivery Status
DO $$ BEGIN
    CREATE TYPE delivery_status AS ENUM ('assigned', 'picked', 'in_transit', 'delivered', 'failed', 'returned');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Ticket Types
DO $$ BEGIN
    CREATE TYPE ticket_type AS ENUM ('issue', 'task', 'feedback', 'vendor_dispute', 'return_request', 'inquiry');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('open', 'pending', 'in_progress', 'escalated', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- SMS Status
DO $$ BEGIN
    CREATE TYPE sms_status AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed', 'blocked', 'skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Comment Source
DO $$ BEGIN
    CREATE TYPE comment_source AS ENUM ('staff', 'logistics', 'system', 'customer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Vendor Ledger Type
DO $$ BEGIN
    CREATE TYPE vendor_ledger_type AS ENUM (
        'purchase', 'purchase_return', 'payment', 'debit_note', 
        'credit_note', 'void_purchase', 'void_return', 'adjustment', 'opening_balance'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =============================================================================
-- SECTION 3: CORE TABLES
-- =============================================================================

-- 3.1 USERS (RBAC)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
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

-- 3.2 VENDORS (Suppliers)
CREATE TABLE IF NOT EXISTS vendors (
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

-- 3.3 CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
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
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(500) NOT NULL,
    description TEXT,
    brand VARCHAR(255),
    category VARCHAR(255),
    image_url TEXT,
    shipping_inside INTEGER DEFAULT NULL,
    shipping_outside INTEGER DEFAULT NULL,
    vendor_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.5 PRODUCT VARIANTS
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
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
    CONSTRAINT positive_reserved CHECK (reserved_stock >= 0),
    CONSTRAINT valid_prices CHECK (cost_price >= 0 AND selling_price >= 0)
);

-- =============================================================================
-- SECTION 4: ORDER MANAGEMENT
-- =============================================================================

-- 4.1 ORDERS
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL,
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
    -- Soft delete tracking
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_by UUID,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    vendor_id UUID,
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
CREATE TABLE IF NOT EXISTS order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
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
CREATE TABLE IF NOT EXISTS order_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    comment TEXT NOT NULL,
    source comment_source NOT NULL DEFAULT 'staff',
    is_internal BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.5 ORDER FOLLOWUPS (from 042)
CREATE TABLE IF NOT EXISTS order_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    followup_number INTEGER NOT NULL DEFAULT 1,
    scheduled_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',
    outcome VARCHAR(50),
    notes TEXT,
    performed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_order_followup UNIQUE(order_id, followup_number)
);

-- 4.6 ORDER TIMELINE (from 042)
CREATE TABLE IF NOT EXISTS order_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    performed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 5: INVENTORY MANAGEMENT
-- =============================================================================

-- 5.1 INVENTORY TRANSACTIONS
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type inventory_transaction_type NOT NULL,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    vendor_id UUID,
    performed_by UUID NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT,
    notes TEXT,
    status inventory_transaction_status NOT NULL DEFAULT 'approved',
    reference_transaction_id UUID,
    -- Approval tracking
    approved_by UUID,
    approval_date TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    -- Rejection tracking
    rejection_reason TEXT,
    rejected_by UUID,
    rejected_at TIMESTAMPTZ,
    -- Void tracking
    voided_by UUID,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    -- Totals
    total_quantity INTEGER DEFAULT 0,
    total_cost DECIMAL(14, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5.2 INVENTORY TRANSACTION ITEMS
CREATE TABLE IF NOT EXISTS inventory_transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL,
    variant_id UUID NOT NULL,
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
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL,
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

-- =============================================================================
-- SECTION 6: VENDOR MANAGEMENT (from 004)
-- =============================================================================

-- 6.1 VENDOR USERS
CREATE TABLE IF NOT EXISTS vendor_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL,
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

-- 6.2 VENDOR LEDGER
CREATE TABLE IF NOT EXISTS vendor_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL,
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

-- 6.3 VENDOR PAYMENTS
CREATE TABLE IF NOT EXISTS vendor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL,
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

-- 6.4 VENDOR ACCESS LOGS (from 042)
CREATE TABLE IF NOT EXISTS vendor_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL,
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 7: LOGISTICS & DELIVERY
-- =============================================================================

-- 7.1 COURIER PARTNERS
CREATE TABLE IF NOT EXISTS courier_partners (
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

-- 7.2 DELIVERY ZONES
CREATE TABLE IF NOT EXISTS delivery_zones (
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
    default_courier_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_city_district UNIQUE(city_name, district)
);

-- 7.3 RIDERS
CREATE TABLE IF NOT EXISTS riders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
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

-- 7.4 DELIVERY RUNS
CREATE TABLE IF NOT EXISTS delivery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_number VARCHAR(20) UNIQUE NOT NULL,
    rider_id UUID NOT NULL,
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

-- 7.5 COURIER MANIFESTS (from 042)
CREATE TABLE IF NOT EXISTS courier_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_number VARCHAR(30) UNIQUE NOT NULL,
    courier_partner VARCHAR(100) NOT NULL,
    manifest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'draft',
    total_orders INTEGER DEFAULT 0,
    total_weight_grams INTEGER DEFAULT 0,
    total_cod DECIMAL(14, 2) DEFAULT 0,
    handed_over_at TIMESTAMPTZ,
    handed_over_to VARCHAR(100),
    handover_notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7.6 DELIVERY ASSIGNMENTS (from 042)
CREATE TABLE IF NOT EXISTS delivery_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    rider_id UUID NOT NULL,
    delivery_run_id UUID,
    status delivery_status DEFAULT 'assigned',
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    picked_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    result delivery_result,
    failure_reason TEXT,
    customer_feedback TEXT,
    customer_rating INTEGER CHECK (customer_rating BETWEEN 1 AND 5),
    collected_amount DECIMAL(12, 2) DEFAULT 0,
    photo_proof TEXT,
    signature_url TEXT,
    location_lat DECIMAL(10, 6),
    location_lng DECIMAL(10, 6),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7.7 DELIVERY ATTEMPTS (from 042)
CREATE TABLE IF NOT EXISTS delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    assignment_id UUID,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    result delivery_result NOT NULL,
    reason TEXT,
    notes TEXT,
    rescheduled_for DATE,
    performed_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7.8 RIDER SETTLEMENTS (from 042)
CREATE TABLE IF NOT EXISTS rider_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL,
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'pending',
    total_cod_collected DECIMAL(14, 2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    amount_deposited DECIMAL(14, 2) DEFAULT 0,
    deposit_reference VARCHAR(100),
    deposited_at TIMESTAMPTZ,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_rider_date_settlement UNIQUE(rider_id, settlement_date)
);

-- =============================================================================
-- SECTION 8: SUPPORT & TICKETING
-- =============================================================================

-- 8.1 TICKETS
CREATE TABLE IF NOT EXISTS tickets (
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

-- 8.2 TICKET MESSAGES
CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL,
    message TEXT NOT NULL,
    sender_id UUID,
    sender_name VARCHAR(100),
    is_internal BOOLEAN DEFAULT FALSE,
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 9: SMS & NOTIFICATIONS
-- =============================================================================

-- 9.1 SMS TEMPLATES
CREATE TABLE IF NOT EXISTS sms_templates (
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

-- 9.2 SMS LOGS
CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    template_id UUID,
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
-- SECTION 10: SYSTEM TABLES
-- =============================================================================

-- 10.1 CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    parent_id UUID,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10.2 BRANDS
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10.3 APP SETTINGS
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10.4 USER ACTIVITY LOG (from 042)
CREATE TABLE IF NOT EXISTS user_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10.5 PRODUCT CHANGE REQUESTS (from 042)
CREATE TABLE IF NOT EXISTS product_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID,
    variant_id UUID,
    request_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    requested_changes JSONB NOT NULL,
    reason TEXT,
    requested_by UUID NOT NULL,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10.6 REVIEWS (from 042)
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    order_id UUID,
    customer_id UUID,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255),
    content TEXT,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    helpful_count INTEGER DEFAULT 0,
    images JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 11: FOREIGN KEY CONSTRAINTS
-- =============================================================================

-- Add FK after all tables exist (using DO block for idempotency)
DO $$
BEGIN
    -- users -> vendors
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_vendor') THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_vendor 
            FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
    END IF;
    
    -- products -> vendors
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_products_vendor') THEN
        ALTER TABLE products ADD CONSTRAINT fk_products_vendor 
            FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
    END IF;
    
    -- product_variants -> products
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_variants_product') THEN
        ALTER TABLE product_variants ADD CONSTRAINT fk_variants_product 
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    END IF;
    
    -- orders -> customers
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_customer') THEN
        ALTER TABLE orders ADD CONSTRAINT fk_orders_customer 
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
    END IF;
    
    -- order_items -> orders
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_order') THEN
        ALTER TABLE order_items ADD CONSTRAINT fk_order_items_order 
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
    END IF;
    
    -- order_items -> product_variants
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_variant') THEN
        ALTER TABLE order_items ADD CONSTRAINT fk_order_items_variant 
            FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
    END IF;
    
    RAISE NOTICE 'Foreign key constraints verified';
END $$;

-- =============================================================================
-- SECTION 12: INDEXES (Performance Critical)
-- =============================================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Vendors
CREATE INDEX IF NOT EXISTS idx_vendors_phone ON vendors(phone);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors(is_active) WHERE is_active = TRUE;

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_tier ON customers(tier);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(vendor_id);

-- Product Variants
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_variant_sku ON product_variants(sku) WHERE sku IS NOT NULL AND sku != '';
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_is_active ON product_variants(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_variants_low_stock ON product_variants(current_stock) WHERE current_stock <= 10;

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment ON orders(fulfillment_type);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_rider_id ON orders(rider_id) WHERE rider_id IS NOT NULL;

-- Inventory
CREATE INDEX IF NOT EXISTS idx_inv_tx_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inv_tx_invoice ON inventory_transactions(invoice_no);
CREATE INDEX IF NOT EXISTS idx_inv_tx_vendor ON inventory_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_date ON inventory_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_status ON inventory_transactions(status);

-- Vendor Ledger
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_vendor_id ON vendor_ledger(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_entry_type ON vendor_ledger(entry_type);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_reference_id ON vendor_ledger(reference_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ledger_transaction_date ON vendor_ledger(transaction_date);

-- =============================================================================
-- SECTION 13: ROW LEVEL SECURITY (RLS)
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
ALTER TABLE vendor_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_users ENABLE ROW LEVEL SECURITY;
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

-- Default policies for authenticated users (DROP first for idempotency)
DROP POLICY IF EXISTS "authenticated_all" ON users;
DROP POLICY IF EXISTS "authenticated_all" ON vendors;
DROP POLICY IF EXISTS "authenticated_all" ON customers;
DROP POLICY IF EXISTS "authenticated_all" ON products;
DROP POLICY IF EXISTS "authenticated_all" ON product_variants;
DROP POLICY IF EXISTS "authenticated_all" ON orders;
DROP POLICY IF EXISTS "authenticated_all" ON order_items;
DROP POLICY IF EXISTS "authenticated_all" ON order_logs;
DROP POLICY IF EXISTS "authenticated_all" ON order_comments;
DROP POLICY IF EXISTS "authenticated_all" ON inventory_transactions;
DROP POLICY IF EXISTS "authenticated_all" ON inventory_transaction_items;
DROP POLICY IF EXISTS "authenticated_all" ON stock_movements;
DROP POLICY IF EXISTS "authenticated_all" ON vendor_ledger;
DROP POLICY IF EXISTS "authenticated_all" ON vendor_payments;
DROP POLICY IF EXISTS "authenticated_all" ON tickets;
DROP POLICY IF EXISTS "authenticated_all" ON ticket_messages;
DROP POLICY IF EXISTS "authenticated_all" ON sms_logs;
DROP POLICY IF EXISTS "authenticated_all" ON sms_templates;
DROP POLICY IF EXISTS "authenticated_all" ON riders;
DROP POLICY IF EXISTS "authenticated_all" ON delivery_runs;
DROP POLICY IF EXISTS "authenticated_all" ON courier_partners;
DROP POLICY IF EXISTS "authenticated_all" ON delivery_zones;
DROP POLICY IF EXISTS "authenticated_all" ON categories;
DROP POLICY IF EXISTS "authenticated_all" ON brands;
DROP POLICY IF EXISTS "authenticated_all" ON app_settings;

-- Create policies
CREATE POLICY "authenticated_all" ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON vendors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON product_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON order_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON order_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON inventory_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON inventory_transaction_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON vendor_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON vendor_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON ticket_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sms_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sms_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON riders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON delivery_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON courier_partners FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON delivery_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON brands FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- SECTION 14: GRANTS
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
-- END OF MASTER SCHEMA
-- =============================================================================

COMMENT ON SCHEMA public IS 'Seetara ERP - Master Schema v3.0.0 (Consolidated 2026-01-24)';
