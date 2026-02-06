-- =============================================================================
-- SEETARA ERP - MASTER SEED DATA v3.1.0
-- =============================================================================
-- 
-- DATE: 2026-01-24
-- PURPOSE: Initial data - Run AFTER 01_master_schema.sql and 02_master_functions.sql
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: ADMIN USERS
-- =============================================================================

INSERT INTO users (email, password_hash, name, role, phone, is_active) VALUES
    ('admin@seetara.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.ALdxGGOY1Kyjvi', 'System Admin', 'admin', '9800000000', TRUE),
    ('manager@seetara.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.ALdxGGOY1Kyjvi', 'Store Manager', 'manager', '9800000001', TRUE),
    ('operator@seetara.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.ALdxGGOY1Kyjvi', 'Order Operator', 'operator', '9800000002', TRUE)
ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- SECTION 2: APP SETTINGS
-- =============================================================================

INSERT INTO app_settings (key, value, description) VALUES
    ('shipping_inside_valley', '100', 'Inside Valley shipping (NPR)'),
    ('shipping_outside_valley', '150', 'Outside Valley shipping (NPR)'),
    ('shipping_store_pickup', '0', 'Store pickup charge'),
    ('cod_charge', '0', 'COD handling charge'),
    ('min_order_value', '500', 'Minimum order value'),
    ('free_shipping_threshold', '3000', 'Free shipping threshold'),
    ('low_stock_threshold', '10', 'Low stock alert threshold'),
    ('order_number_prefix', '"ORD-"', 'Order number prefix'),
    ('sms_enabled', 'true', 'SMS notifications enabled'),
    ('sms_provider', '"aakash"', 'SMS provider'),
    ('company_name', '"Seetara"', 'Company name'),
    ('company_phone', '"01-4000000"', 'Company phone'),
    ('company_email', '"info@seetara.com"', 'Company email'),
    ('company_address', '"Kathmandu, Nepal"', 'Company address')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- SECTION 3: DELIVERY ZONES (Nepal)
-- =============================================================================

INSERT INTO delivery_zones (city_name, district, state_province, zone_type, delivery_charge, estimated_days, is_active) VALUES
    ('Kathmandu', 'Kathmandu', 'Bagmati', 'inside_valley', 100, 1, TRUE),
    ('Lalitpur', 'Lalitpur', 'Bagmati', 'inside_valley', 100, 1, TRUE),
    ('Bhaktapur', 'Bhaktapur', 'Bagmati', 'inside_valley', 100, 1, TRUE),
    ('Kirtipur', 'Kathmandu', 'Bagmati', 'inside_valley', 120, 1, TRUE),
    ('Pokhara', 'Kaski', 'Gandaki', 'outside_valley', 150, 3, TRUE),
    ('Biratnagar', 'Morang', 'Province 1', 'outside_valley', 180, 4, TRUE),
    ('Birgunj', 'Parsa', 'Madhesh', 'outside_valley', 180, 4, TRUE),
    ('Butwal', 'Rupandehi', 'Lumbini', 'outside_valley', 170, 3, TRUE),
    ('Bharatpur', 'Chitwan', 'Bagmati', 'outside_valley', 150, 2, TRUE),
    ('Hetauda', 'Makwanpur', 'Bagmati', 'outside_valley', 150, 2, TRUE),
    ('Nepalgunj', 'Banke', 'Lumbini', 'outside_valley', 200, 5, TRUE),
    ('Dhangadhi', 'Kailali', 'Sudurpashchim', 'outside_valley', 220, 5, TRUE)
ON CONFLICT (city_name, district) DO NOTHING;

-- =============================================================================
-- SECTION 4: CATEGORIES
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
-- SECTION 5: BRANDS
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

INSERT INTO courier_partners (name, code, phone, base_rate, per_kg_rate, cod_percentage, is_active, coverage_areas) VALUES
    ('NCM Express', 'ncm', '01-4444444', 120, 20, 2.0, TRUE, ARRAY['All Nepal']),
    ('Fastload', 'fastload', '01-5555555', 100, 15, 1.5, TRUE, ARRAY['Major Cities']),
    ('Sundar Yatayat', 'sundar', '01-6666666', 80, 10, 2.0, TRUE, ARRAY['Terai Region'])
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECTION 7: SMS TEMPLATES (Critical for Bug 6)
-- =============================================================================

INSERT INTO sms_templates (name, code, trigger_status, template_text, variables, is_active) VALUES
    ('Order Confirmation', 'ORDER_CONFIRMED', 'converted', 
     'Dear {customer_name}, your order #{order_number} for Rs.{total_amount} has been confirmed. Thank you for shopping with Seetara!',
     ARRAY['customer_name', 'order_number', 'total_amount'], TRUE),
    ('Order Packed', 'ORDER_PACKED', 'packed',
     'Hi {customer_name}, your order #{order_number} is packed and ready for dispatch!',
     ARRAY['customer_name', 'order_number'], TRUE),
    ('Out for Delivery', 'OUT_FOR_DELIVERY', 'out_for_delivery',
     'Hi {customer_name}, your order #{order_number} is out for delivery! Rider: {rider_phone}',
     ARRAY['customer_name', 'order_number', 'rider_phone'], TRUE),
    ('Order Delivered', 'ORDER_DELIVERED', 'delivered',
     'Your order #{order_number} has been delivered. Thank you for shopping with Seetara!',
     ARRAY['order_number'], TRUE),
    ('Handover to Courier', 'HANDOVER_COURIER', 'handover_to_courier',
     'Hi {customer_name}, your order #{order_number} has been handed to {courier_name}. Track: {tracking_url}',
     ARRAY['customer_name', 'order_number', 'courier_name', 'tracking_url'], TRUE),
    ('Follow Up Reminder', 'FOLLOWUP_REMINDER', 'follow_up',
     'Hi {customer_name}, complete your order now! Call: {company_phone}',
     ARRAY['customer_name', 'company_phone'], FALSE)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECTION 8: SAMPLE VENDOR
-- =============================================================================

INSERT INTO vendors (name, company_name, phone, email, address, is_active, balance, payment_terms) VALUES
    ('Sample Vendor', 'Sample Trading Co.', '9801234567', 'vendor@sample.com', 'Kathmandu, Nepal', TRUE, 0, 30)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    v_users INTEGER;
    v_zones INTEGER;
    v_templates INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_users FROM users;
    SELECT COUNT(*) INTO v_zones FROM delivery_zones;
    SELECT COUNT(*) INTO v_templates FROM sms_templates;
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MASTER SEED DATA INSTALLED!';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  Users: %', v_users;
    RAISE NOTICE '  Delivery Zones: %', v_zones;
    RAISE NOTICE '  SMS Templates: %', v_templates;
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
