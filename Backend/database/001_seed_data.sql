-- =============================================================================
-- SEETARA ERP - SEED DATA
-- =============================================================================
--
-- Run this AFTER 000_schema_final.sql
--
-- Contains:
-- 1. Initial Admin User
-- 2. Default App Settings
-- 3. Default Delivery Zones (Nepal)
-- 4. Sample Categories & Brands
-- 5. SMS Templates
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: INITIAL ADMIN USER
-- =============================================================================

-- Create admin user (password: admin123 - CHANGE IN PRODUCTION!)
-- Using bcrypt hash for 'admin123'
INSERT INTO users (id, email, password_hash, name, role, phone, is_active)
VALUES (
    gen_random_uuid(),
    'admin@seetara.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.ALdxGGOY1Kyjvi', -- bcrypt hash of 'admin123'
    'System Admin',
    'admin',
    '9800000000',
    TRUE
) ON CONFLICT (email) DO NOTHING;

-- Create a sample manager
INSERT INTO users (id, email, password_hash, name, role, phone, is_active)
VALUES (
    gen_random_uuid(),
    'manager@seetara.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.ALdxGGOY1Kyjvi',
    'Store Manager',
    'manager',
    '9800000001',
    TRUE
) ON CONFLICT (email) DO NOTHING;

-- Create a sample operator
INSERT INTO users (id, email, password_hash, name, role, phone, is_active)
VALUES (
    gen_random_uuid(),
    'operator@seetara.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.ALdxGGOY1Kyjvi',
    'Order Operator',
    'operator',
    '9800000002',
    TRUE
) ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- SECTION 2: APP SETTINGS
-- =============================================================================

INSERT INTO app_settings (key, value, description) VALUES
    -- Shipping Defaults
    ('shipping_inside_valley', '100', 'Default shipping charge for Inside Valley (NPR)'),
    ('shipping_outside_valley', '150', 'Default shipping charge for Outside Valley (NPR)'),
    ('shipping_store_pickup', '0', 'Shipping charge for store pickup'),
    
    -- COD Settings
    ('cod_charge', '0', 'COD handling charge (NPR)'),
    ('min_order_value', '500', 'Minimum order value for free shipping'),
    ('free_shipping_threshold', '3000', 'Order value for free shipping'),
    
    -- Stock Settings
    ('low_stock_threshold', '10', 'Threshold for low stock alerts'),
    ('reorder_level_default', '5', 'Default reorder level for new variants'),
    
    -- Order Settings
    ('order_number_prefix', '"ORD-"', 'Prefix for order numbers'),
    ('invoice_number_start', '1000', 'Starting number for invoices'),
    
    -- SMS Settings
    ('sms_enabled', 'true', 'Enable/disable SMS notifications'),
    ('sms_provider', '"aakash"', 'Default SMS provider'),
    
    -- Business Info
    ('company_name', '"Seetara"', 'Company name'),
    ('company_phone', '"01-4000000"', 'Company phone'),
    ('company_email', '"info@seetara.com"', 'Company email'),
    ('company_address', '"Kathmandu, Nepal"', 'Company address')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- SECTION 3: DELIVERY ZONES (Nepal)
-- =============================================================================

-- Inside Valley (Kathmandu Valley)
INSERT INTO delivery_zones (city_name, district, state_province, zone_type, delivery_charge, estimated_days, is_cod_available, is_active)
VALUES
    ('Kathmandu', 'Kathmandu', 'Bagmati', 'inside_valley', 100, 1, TRUE, TRUE),
    ('Lalitpur', 'Lalitpur', 'Bagmati', 'inside_valley', 100, 1, TRUE, TRUE),
    ('Bhaktapur', 'Bhaktapur', 'Bagmati', 'inside_valley', 100, 1, TRUE, TRUE),
    ('Kirtipur', 'Kathmandu', 'Bagmati', 'inside_valley', 120, 1, TRUE, TRUE),
    ('Madhyapur Thimi', 'Bhaktapur', 'Bagmati', 'inside_valley', 100, 1, TRUE, TRUE)
ON CONFLICT (city_name, district) DO NOTHING;

-- Outside Valley (Major Cities)
INSERT INTO delivery_zones (city_name, district, state_province, zone_type, delivery_charge, estimated_days, is_cod_available, is_active)
VALUES
    ('Pokhara', 'Kaski', 'Gandaki', 'outside_valley', 150, 3, TRUE, TRUE),
    ('Biratnagar', 'Morang', 'Province 1', 'outside_valley', 180, 4, TRUE, TRUE),
    ('Birgunj', 'Parsa', 'Madhesh', 'outside_valley', 180, 4, TRUE, TRUE),
    ('Dharan', 'Sunsari', 'Province 1', 'outside_valley', 180, 4, TRUE, TRUE),
    ('Butwal', 'Rupandehi', 'Lumbini', 'outside_valley', 170, 3, TRUE, TRUE),
    ('Bharatpur', 'Chitwan', 'Bagmati', 'outside_valley', 150, 2, TRUE, TRUE),
    ('Hetauda', 'Makwanpur', 'Bagmati', 'outside_valley', 150, 2, TRUE, TRUE),
    ('Nepalgunj', 'Banke', 'Lumbini', 'outside_valley', 200, 5, TRUE, TRUE),
    ('Dhangadhi', 'Kailali', 'Sudurpashchim', 'outside_valley', 220, 5, TRUE, TRUE),
    ('Itahari', 'Sunsari', 'Province 1', 'outside_valley', 180, 4, TRUE, TRUE),
    ('Janakpur', 'Dhanusha', 'Madhesh', 'outside_valley', 180, 4, TRUE, TRUE),
    ('Damak', 'Jhapa', 'Province 1', 'outside_valley', 200, 5, TRUE, TRUE)
ON CONFLICT (city_name, district) DO NOTHING;

-- =============================================================================
-- SECTION 4: DEFAULT CATEGORIES
-- =============================================================================

INSERT INTO categories (name, slug, is_active, sort_order) VALUES
    ('Clothing', 'clothing', TRUE, 1),
    ('Electronics', 'electronics', TRUE, 2),
    ('Accessories', 'accessories', TRUE, 3),
    ('Home & Living', 'home-living', TRUE, 4),
    ('Beauty & Care', 'beauty-care', TRUE, 5),
    ('Sports & Fitness', 'sports-fitness', TRUE, 6),
    ('Kids & Baby', 'kids-baby', TRUE, 7),
    ('Bags & Wallets', 'bags-wallets', TRUE, 8),
    ('Footwear', 'footwear', TRUE, 9),
    ('Jewelry', 'jewelry', TRUE, 10)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- SECTION 5: DEFAULT BRANDS
-- =============================================================================

INSERT INTO brands (name, slug, is_active) VALUES
    ('Seetara', 'seetara', TRUE),
    ('Today Trend', 'today-trend', TRUE),
    ('Generic', 'generic', TRUE),
    ('Premium', 'premium', TRUE),
    ('Imported', 'imported', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- SECTION 6: COURIER PARTNERS
-- =============================================================================

INSERT INTO courier_partners (name, code, phone, base_rate, per_kg_rate, cod_percentage, is_active, coverage_areas)
VALUES
    ('NCM Express', 'ncm', '01-4444444', 120, 20, 2.0, TRUE, ARRAY['All Nepal']),
    ('Fastload', 'fastload', '01-5555555', 100, 15, 1.5, TRUE, ARRAY['Major Cities']),
    ('Sundar Yatayat', 'sundar', '01-6666666', 80, 10, 2.0, TRUE, ARRAY['Terai Region'])
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECTION 7: SMS TEMPLATES
-- =============================================================================

INSERT INTO sms_templates (name, code, trigger_status, template_text, variables, is_active)
VALUES
    (
        'Order Confirmation',
        'ORDER_CONFIRMED',
        'converted',
        'Dear {customer_name}, your order #{order_number} for Rs.{total_amount} has been confirmed. Thank you for shopping with Seetara!',
        ARRAY['customer_name', 'order_number', 'total_amount'],
        TRUE
    ),
    (
        'Order Packed',
        'ORDER_PACKED',
        'packed',
        'Hi {customer_name}, your order #{order_number} is packed and ready for dispatch. You will receive it soon!',
        ARRAY['customer_name', 'order_number'],
        TRUE
    ),
    (
        'Out for Delivery',
        'OUT_FOR_DELIVERY',
        'out_for_delivery',
        'Hi {customer_name}, your order #{order_number} is out for delivery! Our rider will reach you shortly. Contact: {rider_phone}',
        ARRAY['customer_name', 'order_number', 'rider_phone'],
        TRUE
    ),
    (
        'Order Delivered',
        'ORDER_DELIVERED',
        'delivered',
        'Your order #{order_number} has been delivered successfully. Thank you for shopping with Seetara! Rate us: {feedback_link}',
        ARRAY['order_number', 'feedback_link'],
        TRUE
    ),
    (
        'Handover to Courier',
        'HANDOVER_COURIER',
        'handover_to_courier',
        'Hi {customer_name}, your order #{order_number} has been handed over to {courier_name}. Track: {tracking_url}',
        ARRAY['customer_name', 'order_number', 'courier_name', 'tracking_url'],
        TRUE
    ),
    (
        'Follow Up Reminder',
        'FOLLOWUP_REMINDER',
        'follow_up',
        'Hi {customer_name}, we noticed you have items in your cart. Complete your order now! Call us: {company_phone}',
        ARRAY['customer_name', 'company_phone'],
        FALSE
    )
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECTION 8: SAMPLE VENDOR (Optional)
-- =============================================================================

INSERT INTO vendors (name, company_name, phone, email, address, is_active, balance, payment_terms)
VALUES
    ('Sample Vendor', 'Sample Trading Co.', '9801234567', 'vendor@sample.com', 'Kathmandu, Nepal', TRUE, 0, 30)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES (Run to verify data was inserted)
-- =============================================================================

-- Check counts
-- SELECT 'users' as table_name, COUNT(*) as count FROM users
-- UNION ALL SELECT 'app_settings', COUNT(*) FROM app_settings
-- UNION ALL SELECT 'delivery_zones', COUNT(*) FROM delivery_zones
-- UNION ALL SELECT 'categories', COUNT(*) FROM categories
-- UNION ALL SELECT 'brands', COUNT(*) FROM brands
-- UNION ALL SELECT 'courier_partners', COUNT(*) FROM courier_partners
-- UNION ALL SELECT 'sms_templates', COUNT(*) FROM sms_templates;

-- =============================================================================
-- END OF SEED DATA
-- =============================================================================
