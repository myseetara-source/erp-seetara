-- =============================================================================
-- SEETARA ERP - FINAL PRODUCTION SCHEMA
-- =============================================================================
-- 
-- Version: 1.0.0
-- Generated: 2026-01-20
-- 
-- This is a CONSOLIDATED schema merging all migrations (002-014).
-- RUN THIS ONCE on a fresh Supabase database for production.
-- 
-- ORDER OF EXECUTION:
-- 1. Extensions & Enums
-- 2. Core Tables (Users, Products, Vendors, Customers)
-- 3. Order Management Tables
-- 4. Rider & Logistics Tables
-- 5. Support & Ticketing Tables
-- 6. SMS & Notifications Tables
-- 7. Meta CAPI & Marketing Tables
-- 8. Functions & Triggers
-- 9. Row Level Security Policies
-- 10. Seed Data
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- SECTION 2: ENUMS
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
    'shipped',
    'delivered',
    'cancelled',
    'rejected',
    'return_initiated',
    'returned',
    'refund'
);

-- Order Source Channels
CREATE TYPE order_source AS ENUM (
    'manual',
    'phone',
    'store',
    'website',
    'todaytrend',
    'seetara',
    'shopify',
    'woocommerce',
    'api'
);

-- Fulfillment Type
CREATE TYPE fulfillment_type AS ENUM (
    'inside_valley',
    'outside_valley',
    'store'
);

-- Transaction Types
CREATE TYPE transaction_type AS ENUM (
    'income',
    'expense',
    'vendor_payment',
    'refund',
    'adjustment'
);

-- Zone Type
CREATE TYPE zone_type AS ENUM (
    'inside_valley',
    'outside_valley'
);

-- Comment Source
CREATE TYPE comment_source AS ENUM (
    'staff',
    'logistics',
    'system',
    'customer'
);

-- Logistics Event Type
CREATE TYPE logistics_event_type AS ENUM (
    'order_received',
    'pickup_scheduled',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivery_attempted',
    'delivered',
    'returned',
    'cancelled',
    'exception',
    'comment'
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

-- Rider Status
CREATE TYPE rider_status AS ENUM (
    'available',
    'on_delivery',
    'on_break',
    'off_duty',
    'suspended'
);

-- Delivery Run Status
CREATE TYPE delivery_run_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
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

-- Manifest Status
CREATE TYPE manifest_status AS ENUM (
    'draft',
    'dispatched',
    'in_transit',
    'delivered',
    'partial'
);

-- Settlement Status
CREATE TYPE settlement_status AS ENUM (
    'pending',
    'verified',
    'settled',
    'discrepancy'
);

-- Ticket Type
CREATE TYPE ticket_type AS ENUM (
    'issue',
    'task',
    'feedback',
    'vendor_dispute',
    'return_request',
    'inquiry'
);

-- Ticket Priority
CREATE TYPE ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

-- Ticket Status
CREATE TYPE ticket_status AS ENUM (
    'open',
    'pending',
    'in_progress',
    'escalated',
    'resolved',
    'closed'
);

-- Message Source
CREATE TYPE message_source AS ENUM (
    'customer',
    'staff',
    'vendor',
    'system',
    'sms',
    'email'
);

-- SMS Status
CREATE TYPE sms_status AS ENUM (
    'pending',
    'queued',
    'sent',
    'delivered',
    'failed',
    'invalid_number',
    'blocked',
    'disabled',
    'skipped'
);

-- SMS Category
CREATE TYPE sms_category AS ENUM (
    'transactional',
    'promotional',
    'alert',
    'reminder',
    'feedback'
);

-- SMS Provider
CREATE TYPE sms_provider AS ENUM (
    'aakash',
    'sparrow',
    'msg91',
    'twilio',
    'mock'
);

-- Stock Deduction Item Type
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_deduction_item') THEN
        CREATE TYPE stock_deduction_item AS (
            variant_id UUID,
            quantity INTEGER
        );
    END IF;
END $$;

-- =============================================================================
-- SECTION 3: CORE TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 SALES CHANNELS (BRANDS/WEBSITES)
-- -----------------------------------------------------------------------------
CREATE TABLE sales_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    website_url VARCHAR(500),
    pixel_id VARCHAR(50),
    capi_token TEXT,
    test_event_code VARCHAR(50),
    currency VARCHAR(3) DEFAULT 'NPR',
    is_capi_enabled BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    api_key VARCHAR(100) UNIQUE,
    api_secret_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.2 USERS
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'operator',
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    vendor_id UUID,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.3 VENDORS
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
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK to users for vendor_id
ALTER TABLE users ADD CONSTRAINT fk_users_vendor 
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

-- Constraint for vendor role
ALTER TABLE users ADD CONSTRAINT vendor_id_required_for_vendor_role
    CHECK ((role = 'vendor' AND vendor_id IS NOT NULL) OR (role != 'vendor'));

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
    is_active BOOLEAN DEFAULT true,
    meta JSONB DEFAULT '{}',
    vendor_id UUID REFERENCES vendors(id),
    channel_id UUID REFERENCES sales_channels(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.5 PRODUCT VARIANTS
-- -----------------------------------------------------------------------------
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100),
    color VARCHAR(100),
    size VARCHAR(50),
    material VARCHAR(100),
    attributes JSONB NOT NULL DEFAULT '{}',
    weight_grams INTEGER,
    cost_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    mrp DECIMAL(12, 2),
    current_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT positive_stock CHECK (current_stock >= 0),
    CONSTRAINT positive_reserved CHECK (reserved_stock >= 0),
    CONSTRAINT valid_prices CHECK (cost_price >= 0 AND selling_price >= 0)
);

-- -----------------------------------------------------------------------------
-- 3.6 CUSTOMERS
-- -----------------------------------------------------------------------------
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
    ip_addresses TEXT[] DEFAULT '{}',
    fbid VARCHAR(100),
    fb_ids TEXT[] DEFAULT '{}',
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
    last_order_date TIMESTAMPTZ,
    notes TEXT,
    tags TEXT[],
    is_blocked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 4: LOGISTICS & DELIVERY TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 COURIER PARTNERS
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
    webhook_secret VARCHAR(255),
    status_mapping JSONB DEFAULT '{}',
    base_rate DECIMAL(10, 2) DEFAULT 0.00,
    per_kg_rate DECIMAL(10, 2) DEFAULT 0.00,
    cod_percentage DECIMAL(5, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    coverage_areas TEXT[],
    last_webhook_at TIMESTAMPTZ,
    webhook_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4.2 DELIVERY ZONES
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city_name VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    state_province VARCHAR(100),
    zone_type zone_type NOT NULL DEFAULT 'outside_valley',
    delivery_charge DECIMAL(10, 2) DEFAULT 0.00,
    estimated_days INTEGER DEFAULT 3,
    is_cod_available BOOLEAN DEFAULT true,
    is_prepaid_available BOOLEAN DEFAULT true,
    default_courier_id UUID REFERENCES courier_partners(id),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_city_district UNIQUE(city_name, district)
);

-- -----------------------------------------------------------------------------
-- 4.3 RIDERS
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
    avg_delivery_time INTEGER DEFAULT 30,
    total_deliveries INTEGER DEFAULT 0,
    successful_deliveries INTEGER DEFAULT 0,
    failed_deliveries INTEGER DEFAULT 0,
    returns_count INTEGER DEFAULT 0,
    rating DECIMAL(3,2) DEFAULT 5.00,
    average_rating DECIMAL(3, 2) DEFAULT 5.00,
    current_cash_balance DECIMAL(12,2) DEFAULT 0.00,
    total_cash_collected DECIMAL(12,2) DEFAULT 0.00,
    last_known_lat DECIMAL(10,8),
    last_known_lng DECIMAL(11,8),
    last_location_update TIMESTAMPTZ,
    current_location POINT,
    current_zone VARCHAR(100),
    max_daily_orders INTEGER DEFAULT 20,
    current_order_count INTEGER DEFAULT 0,
    shift_start TIME,
    shift_end TIME,
    working_days INTEGER[] DEFAULT '{1,2,3,4,5,6}',
    joined_at DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- -----------------------------------------------------------------------------
-- 4.4 DELIVERY RUNS
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_number VARCHAR(20) UNIQUE NOT NULL,
    rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status delivery_run_status NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    total_orders INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    rejected_count INTEGER DEFAULT 0,
    pending_count INTEGER DEFAULT 0,
    expected_cod DECIMAL(12,2) DEFAULT 0.00,
    collected_cod DECIMAL(12,2) DEFAULT 0.00,
    estimated_distance_km DECIMAL(10,2),
    estimated_duration_min INTEGER,
    actual_distance_km DECIMAL(10,2),
    actual_duration_min INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 5: ORDERS & ORDER ITEMS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 ORDERS
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
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
    payment_method VARCHAR(50) DEFAULT 'cod',
    payment_status VARCHAR(50) DEFAULT 'pending',
    paid_amount DECIMAL(12, 2) DEFAULT 0.00,
    shipping_name VARCHAR(255),
    shipping_phone VARCHAR(20),
    shipping_address TEXT,
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_pincode VARCHAR(10),
    courier_partner VARCHAR(100),
    awb_number VARCHAR(100),
    courier_tracking_id VARCHAR(100),
    tracking_url TEXT,
    assigned_to UUID REFERENCES users(id),
    assigned_rider_id UUID REFERENCES riders(id),
    rider_id UUID REFERENCES users(id),
    delivery_run_id UUID REFERENCES delivery_runs(id),
    delivery_sequence INTEGER,
    delivery_attempt_count INTEGER DEFAULT 0,
    delivery_attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    last_attempt_result delivery_result,
    cash_collected DECIMAL(12,2),
    cash_collected_at TIMESTAMPTZ,
    delivery_proof_url TEXT,
    courier_manifest_id UUID,
    followup_date TIMESTAMPTZ,
    followup_reason TEXT,
    followup_count INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    internal_notes TEXT,
    customer_notes TEXT,
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    rejection_reason TEXT,
    rejected_by UUID REFERENCES users(id),
    return_reason TEXT,
    return_initiated_at TIMESTAMPTZ,
    returned_at TIMESTAMPTZ,
    expected_delivery_date DATE,
    rider_assigned_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    handover_at TIMESTAMPTZ,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    technical_meta JSONB DEFAULT '{}',
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5.2 ORDER ITEMS
-- -----------------------------------------------------------------------------
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    vendor_id UUID REFERENCES vendors(id),
    sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(500) NOT NULL,
    variant_name VARCHAR(255),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(12, 2) NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL,
    discount_per_unit DECIMAL(12, 2) DEFAULT 0.00,
    total_price DECIMAL(12, 2) NOT NULL,
    fulfilled_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT positive_quantity CHECK (quantity > 0)
);

-- -----------------------------------------------------------------------------
-- 5.3 ORDER LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status order_status,
    new_status order_status NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    changed_by UUID REFERENCES users(id),
    ip_address INET,
    user_agent TEXT,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5.4 ORDER COMMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE order_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    source comment_source NOT NULL DEFAULT 'staff',
    external_comment_id VARCHAR(255),
    external_event_type logistics_event_type,
    is_internal BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_external_comment UNIQUE(order_id, external_comment_id)
);

-- -----------------------------------------------------------------------------
-- 5.5 ORDER STATUS HISTORY
-- -----------------------------------------------------------------------------
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,
    to_status order_status NOT NULL,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 6: DELIVERY & LOGISTICS TRACKING
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6.1 DELIVERY ASSIGNMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES users(id),
    status delivery_status NOT NULL DEFAULT 'assigned',
    attempt_number INTEGER NOT NULL DEFAULT 1,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    picked_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    notes TEXT,
    failure_reason TEXT,
    proof_image_url TEXT,
    recipient_name VARCHAR(255),
    recipient_signature_url TEXT,
    pickup_lat DECIMAL(10, 8),
    pickup_lng DECIMAL(11, 8),
    delivery_lat DECIMAL(10, 8),
    delivery_lng DECIMAL(11, 8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6.2 DELIVERY ATTEMPTS
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES riders(id),
    run_id UUID REFERENCES delivery_runs(id),
    attempt_number INTEGER NOT NULL DEFAULT 1,
    result delivery_result,
    reason TEXT,
    customer_present BOOLEAN,
    customer_signature TEXT,
    proof_photo_url TEXT,
    cash_collected DECIMAL(12,2) DEFAULT 0.00,
    payment_confirmed BOOLEAN DEFAULT FALSE,
    delivery_lat DECIMAL(10,8),
    delivery_lng DECIMAL(11,8),
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    duration_minutes INTEGER,
    rider_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6.3 DELIVERY LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    rider_id UUID REFERENCES users(id),
    status VARCHAR(50) NOT NULL,
    notes TEXT,
    customer_feedback TEXT,
    delivery_location POINT,
    pod_image_url TEXT,
    receiver_name VARCHAR(255),
    receiver_phone VARCHAR(20),
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 6.4 COURIER MANIFESTS
-- -----------------------------------------------------------------------------
CREATE TABLE courier_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_number VARCHAR(50) UNIQUE NOT NULL,
    courier_partner VARCHAR(100) NOT NULL,
    tracking_codes TEXT[],
    status manifest_status NOT NULL DEFAULT 'draft',
    order_ids UUID[] NOT NULL,
    order_count INTEGER NOT NULL DEFAULT 0,
    total_cod_amount DECIMAL(14, 2) DEFAULT 0,
    courier_charge DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    dispatched_at TIMESTAMPTZ,
    pickup_expected_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    dispatched_by UUID REFERENCES users(id)
);

-- -----------------------------------------------------------------------------
-- 6.5 RIDER SETTLEMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE rider_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_number VARCHAR(20) UNIQUE NOT NULL,
    rider_id UUID NOT NULL REFERENCES riders(id),
    expected_amount DECIMAL(12,2) NOT NULL,
    actual_amount DECIMAL(12,2),
    discrepancy DECIMAL(12,2) DEFAULT 0.00,
    status settlement_status NOT NULL DEFAULT 'pending',
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    settlement_method VARCHAR(50),
    reference_number VARCHAR(50),
    run_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 6.6 LOGISTICS WEBHOOK LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE logistics_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_code VARCHAR(50) NOT NULL,
    tracking_id VARCHAR(100),
    request_headers JSONB DEFAULT '{}',
    request_body JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    order_id UUID REFERENCES orders(id),
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- =============================================================================
-- SECTION 7: FINANCIAL TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 TRANSACTIONS
-- -----------------------------------------------------------------------------
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_number VARCHAR(50) UNIQUE NOT NULL,
    type transaction_type NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    vendor_id UUID REFERENCES vendors(id),
    order_id UUID REFERENCES orders(id),
    payment_mode VARCHAR(50),
    reference_number VARCHAR(100),
    description TEXT,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'completed',
    approved_by UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7.2 STOCK MOVEMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    movement_type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    order_id UUID REFERENCES orders(id),
    vendor_id UUID REFERENCES vendors(id),
    stock_before INTEGER NOT NULL,
    stock_after INTEGER NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7.3 VENDOR SUPPLIES
-- -----------------------------------------------------------------------------
CREATE TABLE vendor_supplies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supply_number VARCHAR(50) UNIQUE NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    status VARCHAR(50) DEFAULT 'pending',
    total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(14, 2) DEFAULT 0.00,
    invoice_number VARCHAR(100),
    invoice_date DATE,
    notes TEXT,
    received_by UUID REFERENCES users(id),
    received_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7.4 VENDOR SUPPLY ITEMS
-- -----------------------------------------------------------------------------
CREATE TABLE vendor_supply_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supply_id UUID NOT NULL REFERENCES vendor_supplies(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_cost DECIMAL(12, 2) NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7.5 VENDOR PAYMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE vendor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    amount DECIMAL(14, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    reference_number VARCHAR(100),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT positive_amount CHECK (amount > 0)
);

-- =============================================================================
-- SECTION 8: SUPPORT & TICKETING
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 8.1 TICKETS
-- -----------------------------------------------------------------------------
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    type ticket_type NOT NULL DEFAULT 'issue',
    priority ticket_priority NOT NULL DEFAULT 'medium',
    status ticket_status NOT NULL DEFAULT 'open',
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    escalated_to UUID REFERENCES users(id) ON DELETE SET NULL,
    escalated_at TIMESTAMPTZ,
    escalation_reason TEXT,
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMPTZ,
    first_response_at TIMESTAMPTZ,
    sla_breached BOOLEAN DEFAULT FALSE,
    feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
    feedback_collected_at TIMESTAMPTZ,
    tags TEXT[] DEFAULT '{}',
    channel VARCHAR(50) DEFAULT 'dashboard',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 8.2 TICKET MESSAGES
-- -----------------------------------------------------------------------------
CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    source message_source NOT NULL DEFAULT 'staff',
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sender_name VARCHAR(100),
    attachments JSONB DEFAULT '[]',
    is_internal BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    read_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8.3 REVIEWS
-- -----------------------------------------------------------------------------
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title VARCHAR(255),
    comment TEXT,
    delivery_rating INTEGER CHECK (delivery_rating BETWEEN 1 AND 5),
    product_rating INTEGER CHECK (product_rating BETWEEN 1 AND 5),
    service_rating INTEGER CHECK (service_rating BETWEEN 1 AND 5),
    images TEXT[] DEFAULT '{}',
    is_verified BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT TRUE,
    moderated_at TIMESTAMPTZ,
    moderated_by UUID REFERENCES users(id),
    moderation_notes TEXT,
    response TEXT,
    response_at TIMESTAMPTZ,
    response_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8.4 TICKET ACTIVITIES
-- -----------------------------------------------------------------------------
CREATE TABLE ticket_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    description TEXT,
    performed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 9: SMS & NOTIFICATIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 9.1 SMS TEMPLATES
-- -----------------------------------------------------------------------------
CREATE TABLE sms_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(50) UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    template_text TEXT,
    category sms_category NOT NULL DEFAULT 'transactional',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    available_variables TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id),
    CONSTRAINT slug_format CHECK (slug ~ '^[A-Z][A-Z0-9_]*$')
);

-- -----------------------------------------------------------------------------
-- 9.2 SMS LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient VARCHAR(20),
    recipient_phone VARCHAR(20) NOT NULL,
    recipient_name VARCHAR(255),
    message TEXT,
    message_content TEXT NOT NULL,
    message_type VARCHAR(50),
    template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
    template_slug VARCHAR(50),
    provider sms_provider,
    provider_message_id VARCHAR(255),
    provider_response JSONB DEFAULT '{}',
    status sms_status NOT NULL DEFAULT 'pending',
    error_message TEXT,
    response JSONB DEFAULT '{}',
    context VARCHAR(100),
    context_id UUID,
    variables_used JSONB DEFAULT '{}',
    credits_used INTEGER DEFAULT 1,
    cost_units INTEGER DEFAULT 1,
    ip_address INET,
    created_by UUID REFERENCES users(id),
    triggered_by UUID REFERENCES users(id),
    trigger_event VARCHAR(100),
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 9.3 SMS SETTINGS
-- -----------------------------------------------------------------------------
CREATE TABLE sms_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(50) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);

-- =============================================================================
-- SECTION 10: META CAPI & MARKETING
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 10.1 CAPI EVENTS
-- -----------------------------------------------------------------------------
CREATE TABLE capi_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    channel_id UUID REFERENCES sales_channels(id),
    event_id VARCHAR(100) NOT NULL,
    event_name VARCHAR(50) NOT NULL,
    event_time TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    response JSONB,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    CONSTRAINT unique_event_per_order UNIQUE (order_id, event_name, event_id)
);

-- -----------------------------------------------------------------------------
-- 10.2 EXTERNAL API KEYS
-- -----------------------------------------------------------------------------
CREATE TABLE external_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES sales_channels(id),
    key_name VARCHAR(100) NOT NULL,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    api_secret_hash TEXT NOT NULL,
    permissions JSONB DEFAULT '["orders:create", "orders:read"]',
    rate_limit_per_minute INT DEFAULT 60,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    request_count BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- =============================================================================
-- SECTION 11: MISCELLANEOUS TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 11.1 VALLEY DISTRICTS
-- -----------------------------------------------------------------------------
CREATE TABLE valley_districts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    district_name VARCHAR(100) NOT NULL UNIQUE,
    is_inside_valley BOOLEAN DEFAULT false,
    delivery_charge DECIMAL(10, 2) DEFAULT 0.00,
    estimated_days INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 11.2 PRODUCT ATTRIBUTE TEMPLATES
-- -----------------------------------------------------------------------------
CREATE TABLE product_attribute_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(255) NOT NULL,
    attribute_key VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    input_type VARCHAR(50) DEFAULT 'text',
    options JSONB,
    is_required BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_category_attribute UNIQUE(category, attribute_key)
);

-- -----------------------------------------------------------------------------
-- 11.3 VENDOR ACCESS LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE vendor_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECTION 12: INDEXES
-- =============================================================================

-- Products
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_channel_id ON products(channel_id);
CREATE INDEX idx_products_vendor ON products(vendor_id);

-- Product Variants
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku);
CREATE INDEX idx_variants_stock ON product_variants(current_stock);
CREATE INDEX idx_variant_attributes_gin ON product_variants USING gin (attributes);
CREATE INDEX idx_variant_attributes_keys ON product_variants USING gin (attributes jsonb_path_ops);

-- Vendors
CREATE INDEX idx_vendors_phone ON vendors(phone);
CREATE INDEX idx_vendors_active ON vendors(is_active);

-- Customers
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_fbid ON customers(fbid);
CREATE INDEX idx_customers_score ON customers(customer_score DESC);
CREATE INDEX idx_customers_tier ON customers(tier);
CREATE INDEX idx_customers_total_spent ON customers(total_spent DESC);
CREATE INDEX idx_customers_total_orders ON customers(total_orders DESC);
CREATE INDEX idx_customers_last_order ON customers(last_order_at DESC);
CREATE INDEX idx_customers_return_count ON customers(return_count);
CREATE INDEX idx_customers_phone_lookup ON customers(phone);

-- Orders
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_source ON orders(source);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_awb ON orders(awb_number);
CREATE INDEX idx_orders_fulfillment ON orders(fulfillment_type);
CREATE INDEX idx_orders_rider ON orders(rider_id);
CREATE INDEX idx_orders_courier_tracking ON orders(courier_tracking_id);
CREATE INDEX idx_orders_shipping_phone ON orders(shipping_phone);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX idx_orders_fulfillment_status ON orders(fulfillment_type, status);
CREATE INDEX idx_orders_assigned_rider ON orders(assigned_rider_id) WHERE assigned_rider_id IS NOT NULL;
CREATE INDEX idx_orders_delivery_sequence ON orders(assigned_rider_id, delivery_sequence);
CREATE INDEX idx_orders_delivery_run ON orders(delivery_run_id);
CREATE INDEX idx_orders_courier_manifest ON orders(courier_manifest_id);
CREATE INDEX idx_orders_followup_date ON orders(followup_date) WHERE status = 'follow_up';
CREATE INDEX idx_orders_technical_meta ON orders USING GIN (technical_meta);

-- Order Items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);
CREATE INDEX idx_order_items_vendor ON order_items(vendor_id);

-- Order Logs
CREATE INDEX idx_order_logs_order ON order_logs(order_id);
CREATE INDEX idx_order_logs_created ON order_logs(created_at DESC);
CREATE INDEX idx_order_logs_order_date ON order_logs(order_id, created_at DESC);

-- Order Comments
CREATE INDEX idx_order_comments_order ON order_comments(order_id);
CREATE INDEX idx_order_comments_source ON order_comments(source);
CREATE INDEX idx_order_comments_created ON order_comments(created_at DESC);
CREATE INDEX idx_order_comments_external ON order_comments(external_comment_id);

-- Order Status History
CREATE INDEX idx_order_status_history_order ON order_status_history(order_id);
CREATE INDEX idx_order_status_history_date ON order_status_history(created_at);

-- Transactions
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_vendor ON transactions(vendor_id);
CREATE INDEX idx_transactions_order ON transactions(order_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- Stock Movements
CREATE INDEX idx_stock_movements_variant ON stock_movements(variant_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at DESC);

-- Vendor Supplies
CREATE INDEX idx_vendor_supplies_vendor ON vendor_supplies(vendor_id);

-- Vendor Supply Items
CREATE INDEX idx_vendor_supply_items_supply ON vendor_supply_items(supply_id);

-- Delivery Zones
CREATE INDEX idx_delivery_zones_city ON delivery_zones(LOWER(city_name));
CREATE INDEX idx_delivery_zones_district ON delivery_zones(LOWER(district));
CREATE INDEX idx_delivery_zones_type ON delivery_zones(zone_type);

-- Riders
CREATE INDEX idx_riders_user_id ON riders(user_id);
CREATE INDEX idx_riders_status ON riders(status);
CREATE INDEX idx_riders_rider_code ON riders(rider_code);
CREATE INDEX idx_riders_active ON riders(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_riders_available ON riders(is_available);
CREATE INDEX idx_riders_zone ON riders(current_zone);

-- Delivery Runs
CREATE INDEX idx_delivery_runs_rider ON delivery_runs(rider_id);
CREATE INDEX idx_delivery_runs_date ON delivery_runs(run_date);
CREATE INDEX idx_delivery_runs_status ON delivery_runs(status);
CREATE INDEX idx_delivery_runs_rider_date ON delivery_runs(rider_id, run_date);

-- Delivery Assignments
CREATE INDEX idx_delivery_assignments_order ON delivery_assignments(order_id);
CREATE INDEX idx_delivery_assignments_rider ON delivery_assignments(rider_id);
CREATE INDEX idx_delivery_assignments_status ON delivery_assignments(status);
CREATE INDEX idx_delivery_assignments_date ON delivery_assignments(assigned_at);
CREATE UNIQUE INDEX idx_delivery_assignments_active ON delivery_assignments(order_id) WHERE status IN ('assigned', 'picked', 'in_transit');

-- Delivery Attempts
CREATE INDEX idx_delivery_attempts_order ON delivery_attempts(order_id);
CREATE INDEX idx_delivery_attempts_rider ON delivery_attempts(rider_id);
CREATE INDEX idx_delivery_attempts_run ON delivery_attempts(run_id);
CREATE INDEX idx_delivery_attempts_date ON delivery_attempts(attempted_at);

-- Delivery Logs
CREATE INDEX idx_delivery_logs_order ON delivery_logs(order_id);
CREATE INDEX idx_delivery_logs_rider ON delivery_logs(rider_id);

-- Courier Manifests
CREATE INDEX idx_courier_manifests_status ON courier_manifests(status);
CREATE INDEX idx_courier_manifests_courier ON courier_manifests(courier_partner);
CREATE INDEX idx_courier_manifests_date ON courier_manifests(created_at);

-- Rider Settlements
CREATE INDEX idx_rider_settlements_rider ON rider_settlements(rider_id);
CREATE INDEX idx_rider_settlements_status ON rider_settlements(status);

-- Logistics Webhook Logs
CREATE INDEX idx_webhook_logs_provider ON logistics_webhook_logs(provider_code);
CREATE INDEX idx_webhook_logs_tracking ON logistics_webhook_logs(tracking_id);
CREATE INDEX idx_webhook_logs_status ON logistics_webhook_logs(status);
CREATE INDEX idx_webhook_logs_created ON logistics_webhook_logs(created_at DESC);

-- Tickets
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_type ON tickets(type);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_ticket_number ON tickets(ticket_number);
CREATE INDEX idx_tickets_order ON tickets(related_order_id);
CREATE INDEX idx_tickets_customer ON tickets(customer_id);
CREATE INDEX idx_tickets_vendor ON tickets(vendor_id);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_tickets_due_date ON tickets(due_date) WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX idx_tickets_sla_breached ON tickets(sla_breached) WHERE sla_breached = TRUE;

-- Ticket Messages
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created ON ticket_messages(ticket_id, created_at);

-- Reviews
CREATE INDEX idx_reviews_order ON reviews(order_id);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_customer ON reviews(customer_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_published ON reviews(is_published) WHERE is_published = TRUE;

-- Ticket Activities
CREATE INDEX idx_ticket_activities_ticket ON ticket_activities(ticket_id);
CREATE INDEX idx_ticket_activities_created ON ticket_activities(created_at DESC);

-- SMS Templates
CREATE INDEX idx_sms_templates_slug ON sms_templates(slug);
CREATE INDEX idx_sms_templates_active ON sms_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_sms_templates_category ON sms_templates(category);

-- SMS Logs
CREATE INDEX idx_sms_logs_recipient ON sms_logs(recipient_phone);
CREATE INDEX idx_sms_logs_template ON sms_logs(template_slug);
CREATE INDEX idx_sms_logs_status ON sms_logs(status);
CREATE INDEX idx_sms_logs_sent_at ON sms_logs(sent_at DESC);
CREATE INDEX idx_sms_logs_queued_at ON sms_logs(queued_at DESC);
CREATE INDEX idx_sms_logs_context ON sms_logs(context);
CREATE INDEX idx_sms_logs_recipient_date ON sms_logs(recipient_phone, queued_at DESC);

-- Sales Channels
CREATE INDEX idx_sales_channels_slug ON sales_channels(slug);
CREATE INDEX idx_sales_channels_api_key ON sales_channels(api_key);

-- CAPI Events
CREATE INDEX idx_capi_events_order_id ON capi_events(order_id);
CREATE INDEX idx_capi_events_status ON capi_events(status);
CREATE INDEX idx_capi_events_created_at ON capi_events(created_at);

-- External API Keys
CREATE INDEX idx_external_api_keys_api_key ON external_api_keys(api_key);

-- Vendor Payments
CREATE INDEX idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX idx_vendor_payments_date ON vendor_payments(payment_date);

-- Vendor Access Logs
CREATE INDEX idx_vendor_access_logs_vendor ON vendor_access_logs(vendor_id);
CREATE INDEX idx_vendor_access_logs_created ON vendor_access_logs(created_at);

-- Users
CREATE INDEX idx_users_vendor_id ON users(vendor_id);
CREATE INDEX idx_users_role ON users(role);

-- Product Attribute Templates
CREATE INDEX idx_attribute_templates_category ON product_attribute_templates(category);

-- =============================================================================
-- SECTION 13: FUNCTIONS
-- =============================================================================

-- Generate Order Number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    seq_num INTEGER;
    order_num TEXT;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(CAST(SPLIT_PART(order_number, '-', 3) AS INTEGER)), 0) + 1 INTO seq_num
    FROM orders WHERE order_number LIKE 'ORD-' || year_part || '-%';
    order_num := 'ORD-' || year_part || '-' || LPAD(seq_num::TEXT, 6, '0');
    RETURN order_num;
END;
$$ LANGUAGE plpgsql;

-- Generate Transaction Number
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    seq_num INTEGER;
    txn_num TEXT;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(CAST(SPLIT_PART(transaction_number, '-', 3) AS INTEGER)), 0) + 1 INTO seq_num
    FROM transactions WHERE transaction_number LIKE 'TXN-' || year_part || '-%';
    txn_num := 'TXN-' || year_part || '-' || LPAD(seq_num::TEXT, 6, '0');
    RETURN txn_num;
END;
$$ LANGUAGE plpgsql;

-- Generate Supply Number
CREATE OR REPLACE FUNCTION generate_supply_number()
RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    seq_num INTEGER;
    sup_num TEXT;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(CAST(SPLIT_PART(supply_number, '-', 3) AS INTEGER)), 0) + 1 INTO seq_num
    FROM vendor_supplies WHERE supply_number LIKE 'SUP-' || year_part || '-%';
    sup_num := 'SUP-' || year_part || '-' || LPAD(seq_num::TEXT, 6, '0');
    RETURN sup_num;
END;
$$ LANGUAGE plpgsql;

-- Generate Rider Code
CREATE OR REPLACE FUNCTION generate_rider_code()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(rider_code FROM 2) AS INTEGER)), 0) + 1 INTO next_num FROM riders;
    RETURN 'R' || LPAD(next_num::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate Ticket Number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 5) AS INTEGER)), 1000) + 1 INTO next_num
    FROM tickets WHERE ticket_number LIKE 'TKT-%';
    RETURN 'TKT-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate Run Number
CREATE OR REPLACE FUNCTION generate_run_number(p_rider_code TEXT, p_date DATE)
RETURNS TEXT AS $$
DECLARE
    run_count INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO run_count FROM delivery_runs
    WHERE rider_id = (SELECT id FROM riders WHERE rider_code = p_rider_code) AND run_date = p_date;
    RETURN 'RUN-' || TO_CHAR(p_date, 'YYYYMMDD') || '-' || p_rider_code || '-' || run_count;
END;
$$ LANGUAGE plpgsql;

-- Generate Settlement Number
CREATE OR REPLACE FUNCTION generate_settlement_number()
RETURNS TEXT AS $$
DECLARE
    today_count INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO today_count FROM rider_settlements WHERE DATE(created_at) = CURRENT_DATE;
    RETURN 'SET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(today_count::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- Update Updated At Timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Set Rider Code on Insert
CREATE OR REPLACE FUNCTION set_rider_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rider_code IS NULL OR NEW.rider_code = '' THEN
        NEW.rider_code := generate_rider_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Set Ticket Number on Insert
CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
        NEW.ticket_number := generate_ticket_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Populate Order Item Vendor ID
CREATE OR REPLACE FUNCTION populate_order_item_vendor_id()
RETURNS TRIGGER AS $$
BEGIN
    SELECT p.vendor_id INTO NEW.vendor_id
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.id = NEW.variant_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Calculate Customer Score
CREATE OR REPLACE FUNCTION calculate_customer_score(
    p_total_orders INTEGER,
    p_total_spent DECIMAL,
    p_return_count INTEGER,
    p_delivery_success_rate DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    v_base_score DECIMAL := 50.00;
    v_order_score DECIMAL := 0;
    v_spend_score DECIMAL := 0;
    v_return_penalty DECIMAL := 0;
    v_delivery_bonus DECIMAL := 0;
    v_final_score DECIMAL;
BEGIN
    v_order_score := LEAST(p_total_orders * 2, 20);
    v_spend_score := LEAST(p_total_spent / 1000, 20);
    IF p_total_orders > 0 THEN
        v_return_penalty := LEAST(p_return_count * 10, 50);
    END IF;
    v_delivery_bonus := (p_delivery_success_rate / 100) * 10;
    v_final_score := v_base_score + v_order_score + v_spend_score - v_return_penalty + v_delivery_bonus;
    v_final_score := GREATEST(LEAST(v_final_score, 100), 0);
    RETURN ROUND(v_final_score, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get Customer Tier
CREATE OR REPLACE FUNCTION get_customer_tier(p_score DECIMAL, p_return_count INTEGER)
RETURNS customer_tier AS $$
BEGIN
    IF p_return_count >= 5 THEN RETURN 'blacklisted'; END IF;
    IF p_return_count >= 3 THEN RETURN 'warning'; END IF;
    IF p_score >= 90 THEN RETURN 'platinum'; END IF;
    IF p_score >= 80 THEN RETURN 'gold'; END IF;
    IF p_score >= 65 THEN RETURN 'vip'; END IF;
    IF p_score >= 40 THEN RETURN 'regular'; END IF;
    IF p_score >= 20 THEN RETURN 'warning'; END IF;
    RETURN 'blacklisted';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get Delivery Zone
CREATE OR REPLACE FUNCTION get_delivery_zone(p_city_name VARCHAR(100), p_district VARCHAR(100) DEFAULT NULL)
RETURNS TABLE (
    zone_id UUID,
    city VARCHAR(100),
    district VARCHAR(100),
    zone_type zone_type,
    delivery_charge DECIMAL(10,2),
    estimated_days INTEGER,
    is_cod_available BOOLEAN,
    default_courier_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT dz.id, dz.city_name, dz.district, dz.zone_type, dz.delivery_charge,
           dz.estimated_days, dz.is_cod_available, dz.default_courier_id
    FROM delivery_zones dz
    WHERE dz.is_active = true
      AND (LOWER(dz.city_name) = LOWER(TRIM(p_city_name)) OR LOWER(dz.district) = LOWER(TRIM(p_city_name)))
      AND (p_district IS NULL OR LOWER(dz.district) = LOWER(TRIM(p_district)))
    ORDER BY CASE WHEN LOWER(dz.city_name) = LOWER(TRIM(p_city_name)) THEN 0 ELSE 1 END
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, p_city_name, p_district, 'outside_valley'::zone_type,
                            300.00::DECIMAL(10,2), 3::INTEGER, true::BOOLEAN, NULL::UUID;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Get Zone Type
CREATE OR REPLACE FUNCTION get_zone_type(p_city_name VARCHAR(100))
RETURNS zone_type AS $$
DECLARE
    v_zone_type zone_type;
BEGIN
    SELECT dz.zone_type INTO v_zone_type FROM delivery_zones dz
    WHERE dz.is_active = true
      AND (LOWER(dz.city_name) = LOWER(TRIM(p_city_name)) OR LOWER(dz.district) = LOWER(TRIM(p_city_name)))
    LIMIT 1;
    RETURN COALESCE(v_zone_type, 'outside_valley'::zone_type);
END;
$$ LANGUAGE plpgsql;

-- Get Pixel for Product
CREATE OR REPLACE FUNCTION get_pixel_for_product(p_product_id UUID)
RETURNS TABLE (
    pixel_id VARCHAR(50),
    capi_token TEXT,
    channel_id UUID,
    channel_name VARCHAR(255),
    currency VARCHAR(3)
) AS $$
BEGIN
    RETURN QUERY
    SELECT sc.pixel_id, sc.capi_token, sc.id AS channel_id, sc.name AS channel_name, sc.currency
    FROM products p
    JOIN sales_channels sc ON p.channel_id = sc.id
    WHERE p.id = p_product_id AND sc.is_capi_enabled = true AND sc.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Hash for CAPI
CREATE OR REPLACE FUNCTION hash_for_capi(p_value TEXT)
RETURNS TEXT AS $$
BEGIN
    IF p_value IS NULL OR p_value = '' THEN RETURN NULL; END IF;
    RETURN encode(sha256(lower(trim(p_value))::bytea), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- JWT Helper Functions
CREATE OR REPLACE FUNCTION get_jwt_vendor_id()
RETURNS UUID AS $$
BEGIN
    RETURN (auth.jwt()->>'vendor_id')::UUID;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_vendor()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (auth.jwt()->>'role') = 'vendor';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_manager()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (auth.jwt()->>'role') IN ('admin', 'manager');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (auth.jwt()->>'role') IN ('admin', 'manager', 'operator');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_current_user_rider()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (auth.jwt()->>'role') = 'rider';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_rider_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT id FROM riders WHERE user_id = (auth.jwt()->>'sub')::UUID);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic Stock Functions
CREATE OR REPLACE FUNCTION deduct_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Order reservation'
)
RETURNS TABLE (
    success BOOLEAN,
    variant_id UUID,
    sku VARCHAR(100),
    stock_before INTEGER,
    stock_after INTEGER,
    reserved_before INTEGER,
    reserved_after INTEGER,
    available_stock INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_variant RECORD;
    v_available INTEGER;
BEGIN
    SELECT pv.id, pv.sku, pv.current_stock, pv.reserved_stock, pv.current_stock - pv.reserved_stock AS available
    INTO v_variant FROM product_variants pv WHERE pv.id = p_variant_id FOR UPDATE;

    IF v_variant IS NULL THEN
        RETURN QUERY SELECT false, p_variant_id, NULL::VARCHAR(100), 0, 0, 0, 0, 0, 'Variant not found'::TEXT;
        RETURN;
    END IF;

    IF v_variant.available < p_quantity THEN
        RETURN QUERY SELECT false, v_variant.id, v_variant.sku, v_variant.current_stock, v_variant.current_stock,
                            v_variant.reserved_stock, v_variant.reserved_stock, v_variant.available,
                            format('Insufficient stock for %s. Requested: %s, Available: %s', v_variant.sku, p_quantity, v_variant.available)::TEXT;
        RETURN;
    END IF;

    UPDATE product_variants SET reserved_stock = reserved_stock + p_quantity, updated_at = NOW() WHERE id = p_variant_id;

    INSERT INTO stock_movements (variant_id, movement_type, quantity, order_id, stock_before, stock_after, reason, created_at)
    VALUES (p_variant_id, 'reserved', -p_quantity, p_order_id, v_variant.current_stock, v_variant.current_stock, p_reason, NOW());

    RETURN QUERY SELECT true, v_variant.id, v_variant.sku, v_variant.current_stock, v_variant.current_stock,
                        v_variant.reserved_stock, v_variant.reserved_stock + p_quantity, v_variant.available - p_quantity, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION restore_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Order cancelled/returned'
)
RETURNS TABLE (success BOOLEAN, variant_id UUID, sku VARCHAR(100), stock_before INTEGER, stock_after INTEGER, error_message TEXT) AS $$
DECLARE
    v_variant RECORD;
BEGIN
    SELECT pv.id, pv.sku, pv.current_stock, pv.reserved_stock INTO v_variant
    FROM product_variants pv WHERE pv.id = p_variant_id FOR UPDATE;

    IF v_variant IS NULL THEN
        RETURN QUERY SELECT false, p_variant_id, NULL::VARCHAR(100), 0, 0, 'Variant not found'::TEXT;
        RETURN;
    END IF;

    UPDATE product_variants SET reserved_stock = GREATEST(0, reserved_stock - p_quantity),
                                current_stock = current_stock + p_quantity, updated_at = NOW() WHERE id = p_variant_id;

    INSERT INTO stock_movements (variant_id, movement_type, quantity, order_id, stock_before, stock_after, reason, created_at)
    VALUES (p_variant_id, 'return', p_quantity, p_order_id, v_variant.current_stock, v_variant.current_stock + p_quantity, p_reason, NOW());

    RETURN QUERY SELECT true, v_variant.id, v_variant.sku, v_variant.current_stock, v_variant.current_stock + p_quantity, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 14: TRIGGERS
-- =============================================================================

-- Updated At Triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendor_supplies_updated_at BEFORE UPDATE ON vendor_supplies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_zones_updated_at BEFORE UPDATE ON delivery_zones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_order_comments_updated_at BEFORE UPDATE ON order_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sms_templates_updated_at BEFORE UPDATE ON sms_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_attribute_templates_updated_at BEFORE UPDATE ON product_attribute_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-populate triggers
CREATE TRIGGER trigger_set_rider_code BEFORE INSERT ON riders FOR EACH ROW EXECUTE FUNCTION set_rider_code();
CREATE TRIGGER trigger_set_ticket_number BEFORE INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION set_ticket_number();
CREATE TRIGGER trigger_populate_vendor_id BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION populate_order_item_vendor_id();

-- =============================================================================
-- SECTION 15: ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_supplies ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_supply_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Admin policies (full access)
CREATE POLICY admin_all_users ON users FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_products ON products FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_variants ON product_variants FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_vendors ON vendors FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_customers ON customers FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_orders ON orders FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_order_items ON order_items FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_order_logs ON order_logs FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_comments ON order_comments FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_transactions ON transactions FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_stock_movements ON stock_movements FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_vendor_supplies ON vendor_supplies FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_vendor_supply_items ON vendor_supply_items FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_sms_logs ON sms_logs FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_all_sms_templates ON sms_templates FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY admin_webhook_logs ON logistics_webhook_logs FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Operator policies (limited access)
CREATE POLICY operator_read_products ON products FOR SELECT USING (auth.jwt() ->> 'role' IN ('operator', 'manager'));
CREATE POLICY operator_read_variants ON product_variants FOR SELECT USING (auth.jwt() ->> 'role' IN ('operator', 'manager'));
CREATE POLICY operator_manage_orders ON orders FOR ALL USING (auth.jwt() ->> 'role' IN ('operator', 'manager'));
CREATE POLICY operator_manage_order_items ON order_items FOR ALL USING (auth.jwt() ->> 'role' IN ('operator', 'manager'));
CREATE POLICY operator_manage_customers ON customers FOR ALL USING (auth.jwt() ->> 'role' IN ('operator', 'manager'));

-- Vendor policies (restricted)
CREATE POLICY vendor_view_own ON vendors FOR SELECT USING ((is_vendor() AND id = get_jwt_vendor_id()) OR is_staff());
CREATE POLICY vendor_view_own_txn ON transactions FOR SELECT USING ((is_vendor() AND vendor_id = get_jwt_vendor_id()) OR is_staff());
CREATE POLICY vendor_view_own_supply ON vendor_supplies FOR SELECT USING ((is_vendor() AND vendor_id = get_jwt_vendor_id()) OR is_staff());
CREATE POLICY vendor_view_order_items ON order_items FOR SELECT USING ((auth.jwt() ->> 'role' = 'vendor' AND vendor_id = (auth.jwt() ->> 'vendor_id')::UUID));

-- Rider policies
CREATE POLICY riders_staff_all ON riders FOR ALL USING ((auth.jwt()->>'role') IN ('admin', 'staff', 'operator'));
CREATE POLICY riders_self_view ON riders FOR SELECT USING (user_id = (auth.jwt()->>'sub')::UUID);
CREATE POLICY runs_staff_all ON delivery_runs FOR ALL USING ((auth.jwt()->>'role') IN ('admin', 'staff'));
CREATE POLICY runs_rider_own ON delivery_runs FOR SELECT USING (rider_id = get_current_rider_id());
CREATE POLICY attempts_staff_all ON delivery_attempts FOR ALL USING ((auth.jwt()->>'role') IN ('admin', 'staff'));
CREATE POLICY attempts_rider_own ON delivery_attempts FOR ALL USING (rider_id = get_current_rider_id());
CREATE POLICY settlements_admin_all ON rider_settlements FOR ALL USING ((auth.jwt()->>'role') = 'admin');
CREATE POLICY settlements_rider_view ON rider_settlements FOR SELECT USING (rider_id = get_current_rider_id());

-- Ticket policies
CREATE POLICY tickets_staff_all ON tickets FOR ALL USING ((auth.jwt()->>'role') IN ('admin', 'staff', 'operator'));
CREATE POLICY messages_staff_all ON ticket_messages FOR ALL USING ((auth.jwt()->>'role') IN ('admin', 'staff', 'operator'));
CREATE POLICY reviews_staff_all ON reviews FOR ALL USING ((auth.jwt()->>'role') IN ('admin', 'staff'));
CREATE POLICY reviews_public_view ON reviews FOR SELECT USING (is_published = TRUE);

-- =============================================================================
-- SECTION 16: VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW order_summary AS
SELECT o.id, o.order_number, o.status, o.source, o.fulfillment_type, o.total_amount, o.payment_status, o.created_at,
       o.rider_id, o.courier_partner, o.courier_tracking_id, c.name as customer_name, c.phone as customer_phone,
       c.city as customer_city, r.name as rider_name, COUNT(oi.id) as item_count, SUM(oi.quantity) as total_quantity
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.id
LEFT JOIN users r ON o.rider_id = r.id
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.is_deleted = false
GROUP BY o.id, c.name, c.phone, c.city, r.name;

CREATE OR REPLACE VIEW inventory_alerts AS
SELECT pv.id, pv.sku, p.name as product_name, pv.color, pv.size, pv.current_stock, pv.reserved_stock,
       (pv.current_stock - pv.reserved_stock) as available_stock, pv.reorder_level
FROM product_variants pv
JOIN products p ON pv.product_id = p.id
WHERE pv.is_active = true AND pv.current_stock <= pv.reorder_level;

CREATE OR REPLACE VIEW vendor_ledger AS
SELECT v.id, v.name, v.phone, v.balance, COUNT(DISTINCT vs.id) as total_supplies,
       COALESCE(SUM(vs.total_amount), 0) as total_purchase_amount, COALESCE(SUM(vs.paid_amount), 0) as total_paid_amount
FROM vendors v
LEFT JOIN vendor_supplies vs ON v.id = vs.vendor_id
WHERE v.is_active = true
GROUP BY v.id;

CREATE OR REPLACE VIEW customer_rankings AS
SELECT c.*, RANK() OVER (ORDER BY c.customer_score DESC, c.total_spent DESC) as overall_rank,
       CASE WHEN c.tier IN ('blacklisted', 'warning') THEN 'at_risk'
            WHEN c.tier IN ('platinum', 'gold') THEN 'high_value'
            WHEN c.tier = 'vip' THEN 'loyal'
            ELSE 'standard' END as customer_segment,
       CASE WHEN c.return_count >= 3 THEN true ELSE false END as is_high_return_risk,
       CASE WHEN c.last_order_at < NOW() - INTERVAL '90 days' THEN true ELSE false END as is_dormant
FROM customers c WHERE c.is_blocked = false;

-- =============================================================================
-- SECTION 17: SEED DATA
-- =============================================================================

-- Courier Partners
INSERT INTO courier_partners (name, code, tracking_url_template, is_active, status_mapping) VALUES
('NCM Express', 'ncm', 'https://ncm.com.np/track/{tracking_id}', true, '{"RCVD": "handover_to_courier", "PKD": "in_transit", "OFD": "in_transit", "DLVD": "delivered", "RTO": "return", "CNCL": "cancelled", "HLD": "hold"}'::jsonb),
('Sundar Express', 'sundar', 'https://sundarexpress.com/track/{tracking_id}', true, '{"RCVD": "handover_to_courier", "PKD": "in_transit", "OFD": "in_transit", "DLVD": "delivered", "RTO": "return", "CNCL": "cancelled", "HLD": "hold"}'::jsonb),
('FastTrack Courier', 'fasttrack', 'https://fasttrack.com.np/track/{tracking_id}', true, '{}'),
('DTDC Nepal', 'dtdc', 'https://dtdc.com.np/track/{tracking_id}', true, '{}')
ON CONFLICT (code) DO NOTHING;

-- Delivery Zones
INSERT INTO delivery_zones (city_name, district, zone_type, delivery_charge, estimated_days) VALUES
('Kathmandu', 'Kathmandu', 'inside_valley', 100.00, 1),
('Lalitpur', 'Lalitpur', 'inside_valley', 100.00, 1),
('Patan', 'Lalitpur', 'inside_valley', 100.00, 1),
('Bhaktapur', 'Bhaktapur', 'inside_valley', 100.00, 1),
('Kirtipur', 'Kathmandu', 'inside_valley', 120.00, 1),
('Madhyapur Thimi', 'Bhaktapur', 'inside_valley', 120.00, 1),
('Budhanilkantha', 'Kathmandu', 'inside_valley', 150.00, 1),
('Tokha', 'Kathmandu', 'inside_valley', 150.00, 1),
('Pokhara', 'Kaski', 'outside_valley', 250.00, 2),
('Bharatpur', 'Chitwan', 'outside_valley', 280.00, 2),
('Biratnagar', 'Morang', 'outside_valley', 350.00, 3),
('Birgunj', 'Parsa', 'outside_valley', 320.00, 3),
('Dharan', 'Sunsari', 'outside_valley', 350.00, 3),
('Butwal', 'Rupandehi', 'outside_valley', 300.00, 3),
('Hetauda', 'Makwanpur', 'outside_valley', 250.00, 2),
('Nepalgunj', 'Banke', 'outside_valley', 400.00, 4),
('Dhangadhi', 'Kailali', 'outside_valley', 450.00, 5)
ON CONFLICT (city_name, district) DO NOTHING;

-- Sales Channels
INSERT INTO sales_channels (name, slug, website_url, pixel_id, capi_token, test_event_code, currency, is_capi_enabled, is_active, api_key)
VALUES 
('Today Trend', 'todaytrend', 'https://todaytrend.com.np', 'PIXEL_TODAYTREND_123', 'CAPI_TOKEN_TODAYTREND_REPLACE', 'TEST_TODAYTREND', 'NPR', false, true, 'erp_tt_' || encode(gen_random_bytes(16), 'hex')),
('Seetara', 'seetara', 'https://seetara.com.np', 'PIXEL_SEETARA_456', 'CAPI_TOKEN_SEETARA_REPLACE', 'TEST_SEETARA', 'NPR', false, true, 'erp_st_' || encode(gen_random_bytes(16), 'hex')),
('Default/Manual', 'default', NULL, 'PIXEL_DEFAULT_789', 'CAPI_TOKEN_DEFAULT_REPLACE', 'TEST_DEFAULT', 'NPR', false, true, NULL)
ON CONFLICT (slug) DO NOTHING;

-- SMS Settings
INSERT INTO sms_settings (key, value, description) VALUES
('SMS_ENABLED', 'true', 'Master switch for all SMS sending'),
('SMS_PROVIDER', 'aakash', 'Current SMS provider (aakash, sparrow)'),
('SMS_SENDER_ID', 'SEETARA', 'Sender ID shown to recipients'),
('SMS_DAILY_LIMIT', '10000', 'Maximum SMS per day'),
('SMS_RATE_LIMIT_PER_NUMBER', '10', 'Max SMS to same number per hour')
ON CONFLICT (key) DO NOTHING;

-- Product Attribute Templates
INSERT INTO product_attribute_templates (category, attribute_key, display_name, input_type, options, is_required, sort_order) VALUES
('Clothing', 'color', 'Color', 'select', '["Red", "Blue", "Green", "Black", "White", "Yellow", "Pink", "Purple", "Orange", "Brown", "Gray", "Navy", "Beige", "Multicolor"]', false, 1),
('Clothing', 'size', 'Size', 'select', '["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free Size"]', false, 2),
('Clothing', 'material', 'Material', 'select', '["Cotton", "Polyester", "Silk", "Wool", "Linen", "Denim", "Leather", "Rayon", "Nylon", "Velvet"]', false, 3),
('Footwear', 'color', 'Color', 'select', '["Black", "Brown", "White", "Tan", "Navy", "Gray", "Red", "Multicolor"]', false, 1),
('Footwear', 'size', 'Size (UK)', 'select', '["5", "6", "7", "8", "9", "10", "11", "12"]', true, 2),
('Electronics', 'color', 'Color', 'select', '["Black", "White", "Silver", "Gold", "Blue", "Red", "Green"]', false, 1),
('Electronics', 'storage', 'Storage', 'select', '["32GB", "64GB", "128GB", "256GB", "512GB", "1TB", "2TB"]', false, 2),
('Electronics', 'ram', 'RAM', 'select', '["4GB", "8GB", "16GB", "32GB", "64GB"]', false, 3),
('Bags', 'color', 'Color', 'select', '["Black", "Brown", "Tan", "Navy", "Burgundy", "Beige", "White"]', false, 1),
('Bags', 'size', 'Size', 'select', '["Small", "Medium", "Large", "Extra Large"]', false, 2)
ON CONFLICT (category, attribute_key) DO NOTHING;

-- =============================================================================
-- FINAL PRODUCTION SCHEMA COMPLETE
-- =============================================================================
-- 
-- To use this schema:
-- 1. Go to Supabase Dashboard > SQL Editor
-- 2. Copy and paste this entire file
-- 3. Click "Run"
-- 
-- After running:
-- - Create an admin user using the seed-admin.js script
-- - Update sales_channels with real Pixel IDs and CAPI tokens
-- - Configure SMS provider tokens in .env
-- =============================================================================
