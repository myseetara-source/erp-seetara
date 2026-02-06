-- =============================================================================
-- MIGRATION: 070_seed_test_data.sql
-- PURPOSE: Seed realistic test data for Unified Orders Dashboard
-- CREATED: 2026-01-25
-- =============================================================================

BEGIN;

-- =============================================================================
-- HELPER: Get or create test users for assignment
-- =============================================================================

DO $$
DECLARE
    v_admin_id UUID;
    v_operator_id UUID;
BEGIN
    -- Get existing admin user or use a placeholder
    SELECT id INTO v_admin_id FROM users WHERE role = 'admin'::user_role LIMIT 1;
    IF v_admin_id IS NULL THEN
        v_admin_id := gen_random_uuid();
    END IF;

    -- Get existing operator user or use a placeholder
    SELECT id INTO v_operator_id FROM users WHERE role = 'operator'::user_role LIMIT 1;
    IF v_operator_id IS NULL THEN
        v_operator_id := gen_random_uuid();
    END IF;

    RAISE NOTICE '✅ Using Admin ID: %, Operator ID: %', v_admin_id, v_operator_id;
END $$;

-- =============================================================================
-- 1. SEED LEADS (Sales Engine) - Intake Tab
-- =============================================================================

-- Clear existing test leads (optional - comment out if you want to keep existing)
-- DELETE FROM leads WHERE source = 'SEED_DATA';

-- Inside Valley Leads (5)
INSERT INTO leads (id, customer_info, status, location, items_interest, source, followup_date, notes, created_at)
VALUES
    -- Lead 1: New intake
    (
        gen_random_uuid(),
        '{"name": "Ramesh Sharma", "phone": "9841234567", "address": "Kathmandu, Baluwatar", "city": "Kathmandu"}'::jsonb,
        'INTAKE'::lead_status,
        'INSIDE_VALLEY'::location_type,
        '[{"name": "Silk Saree - Red", "qty": 2, "price": 4500}, {"name": "Cotton Kurta", "qty": 1, "price": 1200}]'::jsonb,
        'SEED_DATA',
        NOW() + INTERVAL '1 day',
        'Customer interested in wedding collection',
        NOW() - INTERVAL '2 hours'
    ),
    -- Lead 2: Follow-up needed
    (
        gen_random_uuid(),
        '{"name": "Sita Thapa", "phone": "9851987654", "address": "Lalitpur, Pulchowk", "city": "Lalitpur"}'::jsonb,
        'FOLLOW_UP'::lead_status,
        'INSIDE_VALLEY'::location_type,
        '[{"name": "Designer Lehenga", "qty": 1, "price": 15000}]'::jsonb,
        'SEED_DATA',
        NOW() + INTERVAL '3 hours',
        'Asked for discount, needs follow-up call',
        NOW() - INTERVAL '1 day'
    ),
    -- Lead 3: New intake
    (
        gen_random_uuid(),
        '{"name": "Hari Prasad", "phone": "9801112233", "address": "Bhaktapur, Suryabinayak", "city": "Bhaktapur"}'::jsonb,
        'INTAKE'::lead_status,
        'INSIDE_VALLEY'::location_type,
        '[{"name": "Men Formal Shirt", "qty": 3, "price": 2500}]'::jsonb,
        'SEED_DATA',
        NULL,
        'Bulk order inquiry for office',
        NOW() - INTERVAL '30 minutes'
    ),
    -- Lead 4: Follow-up
    (
        gen_random_uuid(),
        '{"name": "Gita Adhikari", "phone": "9841556677", "address": "Kathmandu, Maharajgunj", "city": "Kathmandu"}'::jsonb,
        'FOLLOW_UP'::lead_status,
        'INSIDE_VALLEY'::location_type,
        '[{"name": "Pashmina Shawl", "qty": 2, "price": 3500}, {"name": "Woolen Sweater", "qty": 1, "price": 2200}]'::jsonb,
        'SEED_DATA',
        NOW() + INTERVAL '2 days',
        'Comparing with other stores',
        NOW() - INTERVAL '6 hours'
    ),
    -- Lead 5: New intake
    (
        gen_random_uuid(),
        '{"name": "Krishna Maharjan", "phone": "9818889900", "address": "Kathmandu, Thamel", "city": "Kathmandu"}'::jsonb,
        'INTAKE'::lead_status,
        'INSIDE_VALLEY'::location_type,
        '[{"name": "Party Wear Dress", "qty": 1, "price": 5500}]'::jsonb,
        'SEED_DATA',
        NULL,
        'Looking for party collection',
        NOW() - INTERVAL '15 minutes'
    )
ON CONFLICT DO NOTHING;

-- Outside Valley Leads (5)
INSERT INTO leads (id, customer_info, status, location, items_interest, source, followup_date, notes, created_at)
VALUES
    -- Lead 6: Pokhara customer
    (
        gen_random_uuid(),
        '{"name": "Bikram Gurung", "phone": "9846123456", "address": "Pokhara, Lakeside", "city": "Pokhara"}'::jsonb,
        'INTAKE'::lead_status,
        'OUTSIDE_VALLEY'::location_type,
        '[{"name": "Traditional Dhaka Topi", "qty": 5, "price": 800}, {"name": "Daura Suruwal Set", "qty": 2, "price": 4500}]'::jsonb,
        'SEED_DATA',
        NULL,
        'Wedding order - needs courier delivery',
        NOW() - INTERVAL '1 hour'
    ),
    -- Lead 7: Chitwan customer
    (
        gen_random_uuid(),
        '{"name": "Sunita Chaudhary", "phone": "9855234567", "address": "Chitwan, Bharatpur", "city": "Chitwan"}'::jsonb,
        'FOLLOW_UP'::lead_status,
        'OUTSIDE_VALLEY'::location_type,
        '[{"name": "Printed Maxi Dress", "qty": 2, "price": 3200}]'::jsonb,
        'SEED_DATA',
        NOW() + INTERVAL '1 day',
        'Requested size chart, waiting for confirmation',
        NOW() - INTERVAL '8 hours'
    ),
    -- Lead 8: Butwal customer
    (
        gen_random_uuid(),
        '{"name": "Rajan Pandey", "phone": "9867345678", "address": "Butwal, Traffic Chowk", "city": "Butwal"}'::jsonb,
        'INTAKE'::lead_status,
        'OUTSIDE_VALLEY'::location_type,
        '[{"name": "Kids Party Wear", "qty": 3, "price": 1800}]'::jsonb,
        'SEED_DATA',
        NULL,
        'Birthday party collection',
        NOW() - INTERVAL '45 minutes'
    ),
    -- Lead 9: Biratnagar customer
    (
        gen_random_uuid(),
        '{"name": "Priya Rai", "phone": "9842456789", "address": "Biratnagar, Main Road", "city": "Biratnagar"}'::jsonb,
        'FOLLOW_UP'::lead_status,
        'OUTSIDE_VALLEY'::location_type,
        '[{"name": "Bridal Lehenga Set", "qty": 1, "price": 25000}]'::jsonb,
        'SEED_DATA',
        NOW() + INTERVAL '4 hours',
        'High-value order, custom measurements needed',
        NOW() - INTERVAL '2 days'
    ),
    -- Lead 10: Nepalgunj customer
    (
        gen_random_uuid(),
        '{"name": "Mohan Tharu", "phone": "9858567890", "address": "Nepalgunj, Surkhet Road", "city": "Nepalgunj"}'::jsonb,
        'INTAKE'::lead_status,
        'OUTSIDE_VALLEY'::location_type,
        '[{"name": "Cotton Saree", "qty": 4, "price": 2800}]'::jsonb,
        'SEED_DATA',
        NULL,
        'Bulk order for shop',
        NOW() - INTERVAL '3 hours'
    )
ON CONFLICT DO NOTHING;

-- ✅ Inserted 10 test leads (5 Inside Valley, 5 Outside Valley)

-- =============================================================================
-- 2. SEED CUSTOMERS (Required for Orders)
-- =============================================================================

INSERT INTO customers (id, name, phone, email, address_line1, city, created_at)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Anil Kumar Shrestha', '9841111111', 'anil@test.com', 'Baneshwor, Near Big Mart', 'Kathmandu', NOW()),
    ('22222222-2222-2222-2222-222222222222', 'Maya Devi Tamang', '9841222222', 'maya@test.com', 'Jawalakhel, Opposite Zoo', 'Lalitpur', NOW()),
    ('33333333-3333-3333-3333-333333333333', 'Binod Karki', '9841333333', 'binod@test.com', 'Durbarsquare, Near Temple', 'Bhaktapur', NOW()),
    ('44444444-4444-4444-4444-444444444444', 'Laxmi Basnet', '9841444444', 'laxmi@test.com', 'Koteshwor, Block A', 'Kathmandu', NOW()),
    ('55555555-5555-5555-5555-555555555555', 'Deepak Rana', '9841555555', 'deepak@test.com', 'Chabahil, Near Ganesh Mandir', 'Kathmandu', NOW()),
    ('66666666-6666-6666-6666-666666666666', 'Kamala Bhandari', '9846666666', 'kamala@test.com', 'Mahendrapul, Ward 5', 'Pokhara', NOW()),
    ('77777777-7777-7777-7777-777777777777', 'Rajesh Mahato', '9847777777', 'rajesh@test.com', 'Narayanghat, Pulchowk', 'Chitwan', NOW()),
    ('88888888-8888-8888-8888-888888888888', 'Sushila KC', '9848888888', 'sushila@test.com', 'Milanchowk, Near Bus Park', 'Butwal', NOW()),
    ('99999999-9999-9999-9999-999999999999', 'Dipendra Shah', '9849999999', 'dipendra@test.com', 'Koshi Highway, Ward 10', 'Biratnagar', NOW())
ON CONFLICT (id) DO NOTHING;

-- ✅ Inserted 9 test customers

-- =============================================================================
-- 3. SEED ORDERS (Logistics Engine) - Inside Valley
-- =============================================================================

-- Inside Valley: 2 Processing Orders
INSERT INTO orders (id, order_number, readable_id, customer_id, status, fulfillment_type, location, total_amount, shipping_name, shipping_phone, shipping_address, payment_status, created_at)
VALUES
    -- Order 1: Processing (Packed)
    (
        'a1111111-1111-1111-1111-111111111111',
        'ORD-IV-001',
        'TT-2026-0001',
        '11111111-1111-1111-1111-111111111111',
        'packed',
        'inside_valley',
        'INSIDE_VALLEY'::location_type,
        4500.00,
        'Anil Kumar Shrestha',
        '9841111111',
        'Kathmandu, Baneshwor, Near Big Mart',
        'paid',
        NOW() - INTERVAL '3 hours'
    ),
    -- Order 2: Processing (Intake/Pending)
    (
        'a2222222-2222-2222-2222-222222222222',
        'ORD-IV-002',
        'TT-2026-0002',
        '22222222-2222-2222-2222-222222222222',
        'intake',
        'inside_valley',
        'INSIDE_VALLEY'::location_type,
        7800.00,
        'Maya Devi Tamang',
        '9841222222',
        'Lalitpur, Jawalakhel, Opposite Zoo',
        'cod',
        NOW() - INTERVAL '1 hour'
    )
ON CONFLICT (id) DO NOTHING;

-- Inside Valley: 2 Sent for Delivery Orders
INSERT INTO orders (id, order_number, readable_id, customer_id, status, fulfillment_type, location, total_amount, shipping_name, shipping_phone, shipping_address, payment_status, delivery_metadata, dispatched_at, created_at)
VALUES
    -- Order 3: Out for Delivery
    (
        'a3333333-3333-3333-3333-333333333333',
        'ORD-IV-003',
        'TT-2026-0003',
        '33333333-3333-3333-3333-333333333333',
        'out_for_delivery',
        'inside_valley',
        'INSIDE_VALLEY'::location_type,
        3200.00,
        'Binod Karki',
        '9841333333',
        'Bhaktapur, Durbarsquare, Near Temple',
        'paid',
        '{"rider_name": "Santosh Tamang", "rider_phone": "9801234567", "vehicle_number": "BA 12 PA 4567"}'::jsonb,
        NOW() - INTERVAL '2 hours',
        NOW() - INTERVAL '6 hours'
    ),
    -- Order 4: Out for Delivery
    (
        'a4444444-4444-4444-4444-444444444444',
        'ORD-IV-004',
        'TT-2026-0004',
        '44444444-4444-4444-4444-444444444444',
        'out_for_delivery',
        'inside_valley',
        'INSIDE_VALLEY'::location_type,
        5600.00,
        'Laxmi Basnet',
        '9841444444',
        'Kathmandu, Koteshwor, Block A',
        'cod',
        '{"rider_name": "Bikash Lama", "rider_phone": "9802345678", "vehicle_number": "BA 15 PA 7890"}'::jsonb,
        NOW() - INTERVAL '1 hour',
        NOW() - INTERVAL '5 hours'
    )
ON CONFLICT (id) DO NOTHING;

-- Inside Valley: 1 Delivered Order
INSERT INTO orders (id, order_number, readable_id, customer_id, status, fulfillment_type, location, total_amount, shipping_name, shipping_phone, shipping_address, payment_status, delivery_metadata, dispatched_at, delivered_at, created_at)
VALUES
    (
        'a5555555-5555-5555-5555-555555555555',
        'ORD-IV-005',
        'TT-2026-0005',
        '55555555-5555-5555-5555-555555555555',
        'delivered',
        'inside_valley',
        'INSIDE_VALLEY'::location_type,
        9200.00,
        'Deepak Rana',
        '9841555555',
        'Kathmandu, Chabahil, Near Ganesh Mandir',
        'paid',
        '{"rider_name": "Ramesh Shrestha", "rider_phone": "9803456789", "vehicle_number": "BA 18 PA 1234", "delivery_note": "Left with neighbor"}'::jsonb,
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '20 hours',
        NOW() - INTERVAL '2 days'
    )
ON CONFLICT (id) DO NOTHING;

-- ✅ Inserted 5 Inside Valley orders (2 Processing, 2 Out for Delivery, 1 Delivered)

-- =============================================================================
-- 4. SEED ORDERS (Logistics Engine) - Outside Valley
-- =============================================================================

-- Outside Valley: 2 Packed Orders
INSERT INTO orders (id, order_number, readable_id, customer_id, status, fulfillment_type, location, total_amount, shipping_name, shipping_phone, shipping_address, payment_status, created_at)
VALUES
    -- Order 6: Packed (Ready for Courier)
    (
        'b1111111-1111-1111-1111-111111111111',
        'ORD-OV-001',
        'TT-2026-0006',
        '66666666-6666-6666-6666-666666666666',
        'packed',
        'outside_valley',
        'OUTSIDE_VALLEY'::location_type,
        12500.00,
        'Kamala Bhandari',
        '9846666666',
        'Pokhara, Mahendrapul, Ward 5',
        'paid',
        NOW() - INTERVAL '4 hours'
    ),
    -- Order 7: Packed
    (
        'b2222222-2222-2222-2222-222222222222',
        'ORD-OV-002',
        'TT-2026-0007',
        '77777777-7777-7777-7777-777777777777',
        'packed',
        'outside_valley',
        'OUTSIDE_VALLEY'::location_type,
        8900.00,
        'Rajesh Mahato',
        '9847777777',
        'Chitwan, Narayanghat, Pulchowk',
        'cod',
        NOW() - INTERVAL '2 hours'
    )
ON CONFLICT (id) DO NOTHING;

-- Outside Valley: 2 Dispatched Orders (with Courier Info)
INSERT INTO orders (id, order_number, readable_id, customer_id, status, fulfillment_type, location, total_amount, shipping_name, shipping_phone, shipping_address, payment_status, delivery_metadata, dispatched_at, created_at)
VALUES
    -- Order 8: Dispatched via NCM Courier
    (
        'b3333333-3333-3333-3333-333333333333',
        'ORD-OV-003',
        'TT-2026-0008',
        '88888888-8888-8888-8888-888888888888',
        'handover_to_courier',
        'outside_valley',
        'OUTSIDE_VALLEY'::location_type,
        15600.00,
        'Sushila KC',
        '9848888888',
        'Butwal, Milanchowk, Near Bus Park',
        'paid',
        '{"courier_name": "NCM Express", "tracking_number": "NCM123456789", "dispatch_date": "2026-01-25", "estimated_delivery": "2026-01-28"}'::jsonb,
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '2 days'
    ),
    -- Order 9: Dispatched via Sundarban
    (
        'b4444444-4444-4444-4444-444444444444',
        'ORD-OV-004',
        'TT-2026-0009',
        '99999999-9999-9999-9999-999999999999',
        'handover_to_courier',
        'outside_valley',
        'OUTSIDE_VALLEY'::location_type,
        22000.00,
        'Dipendra Shah',
        '9849999999',
        'Biratnagar, Koshi Highway, Ward 10',
        'cod',
        '{"courier_name": "Sundarban Courier", "tracking_number": "SUN987654321", "dispatch_date": "2026-01-24", "estimated_delivery": "2026-01-27"}'::jsonb,
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '3 days'
    )
ON CONFLICT (id) DO NOTHING;

-- ✅ Inserted 4 Outside Valley orders (2 Packed, 2 Dispatched with Courier)

-- =============================================================================
-- 5. SEED ORDER ITEMS (for all orders)
-- =============================================================================

-- Get sample product/variant IDs or use placeholders
DO $$
DECLARE
    v_variant_id UUID;
BEGIN
    -- Try to get a real variant ID
    SELECT id INTO v_variant_id FROM product_variants LIMIT 1;
    
    IF v_variant_id IS NULL THEN
        v_variant_id := gen_random_uuid();
        RAISE NOTICE '⚠️ No product variants found, using placeholder ID';
    END IF;

    -- Insert order items for Inside Valley orders
    INSERT INTO order_items (id, order_id, variant_id, sku, product_name, quantity, unit_price, unit_cost, total_price)
    VALUES
        (gen_random_uuid(), 'a1111111-1111-1111-1111-111111111111', v_variant_id, 'SKU-SAREE-001', 'Silk Saree - Maroon', 1, 4500.00, 2500.00, 4500.00),
        (gen_random_uuid(), 'a2222222-2222-2222-2222-222222222222', v_variant_id, 'SKU-KURTA-001', 'Designer Kurta Set', 2, 3900.00, 2000.00, 7800.00),
        (gen_random_uuid(), 'a3333333-3333-3333-3333-333333333333', v_variant_id, 'SKU-DRESS-001', 'Cotton Dress', 2, 1600.00, 800.00, 3200.00),
        (gen_random_uuid(), 'a4444444-4444-4444-4444-444444444444', v_variant_id, 'SKU-GOWN-001', 'Party Wear Gown', 1, 5600.00, 3000.00, 5600.00),
        (gen_random_uuid(), 'a5555555-5555-5555-5555-555555555555', v_variant_id, 'SKU-BRIDAL-001', 'Bridal Collection Set', 1, 9200.00, 5000.00, 9200.00)
    ON CONFLICT DO NOTHING;

    -- Insert order items for Outside Valley orders
    INSERT INTO order_items (id, order_id, variant_id, sku, product_name, quantity, unit_price, unit_cost, total_price)
    VALUES
        (gen_random_uuid(), 'b1111111-1111-1111-1111-111111111111', v_variant_id, 'SKU-LEHENGA-001', 'Traditional Lehenga', 1, 12500.00, 7000.00, 12500.00),
        (gen_random_uuid(), 'b2222222-2222-2222-2222-222222222222', v_variant_id, 'SKU-FORMAL-001', 'Formal Wear Bundle', 3, 2966.67, 1500.00, 8900.00),
        (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333', v_variant_id, 'SKU-PREMIUM-001', 'Premium Saree Set', 2, 7800.00, 4000.00, 15600.00),
        (gen_random_uuid(), 'b4444444-4444-4444-4444-444444444444', v_variant_id, 'SKU-WEDDING-001', 'Wedding Collection', 1, 22000.00, 12000.00, 22000.00)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Inserted order items for all orders';
END $$;

-- =============================================================================
-- 6. SEED ARCHIVES (History Engine)
-- =============================================================================

-- 2 Cancelled Leads
INSERT INTO archives (id, original_id, source_table, original_data, reason, archived_at)
VALUES
    (
        gen_random_uuid(),
        gen_random_uuid(),
        'leads'::archive_source,
        '{
            "customer_info": {"name": "Cancelled Customer 1", "phone": "9800000001", "address": "Kathmandu"},
            "status": "CANCELLED",
            "location": "INSIDE_VALLEY",
            "items_interest": [{"name": "Test Product", "qty": 1}],
            "source": "SEED_DATA",
            "notes": "Customer changed mind"
        }'::jsonb,
        'Customer cancelled - changed mind',
        NOW() - INTERVAL '5 days'
    ),
    (
        gen_random_uuid(),
        gen_random_uuid(),
        'leads'::archive_source,
        '{
            "customer_info": {"name": "Cancelled Customer 2", "phone": "9800000002", "address": "Pokhara"},
            "status": "BAD_LEAD",
            "location": "OUTSIDE_VALLEY",
            "items_interest": [{"name": "Fake Inquiry", "qty": 1}],
            "source": "SEED_DATA",
            "notes": "Spam/fake inquiry"
        }'::jsonb,
        'Bad lead - spam inquiry',
        NOW() - INTERVAL '3 days'
    )
ON CONFLICT DO NOTHING;

-- 1 Returned Order
INSERT INTO archives (id, original_id, source_table, original_data, reason, archived_at)
VALUES
    (
        gen_random_uuid(),
        gen_random_uuid(),
        'orders'::archive_source,
        '{
            "order_number": "ORD-RET-001",
            "readable_id": "TT-2026-R001",
            "customer": {"name": "Return Customer", "phone": "9800000003"},
            "status": "RETURNED",
            "fulfillment_type": "inside_valley",
            "total_amount": 6500,
            "items": [{"name": "Defective Product", "qty": 1, "price": 6500}],
            "return_reason": "Product defect - color mismatch"
        }'::jsonb,
        'Product returned - color mismatch with customer expectation',
        NOW() - INTERVAL '1 day'
    )
ON CONFLICT DO NOTHING;

-- ✅ Inserted 3 archive records (2 Cancelled Leads, 1 Returned Order)

-- =============================================================================
-- SUMMARY
-- =============================================================================

DO $$
DECLARE
    v_lead_count INT;
    v_order_count INT;
    v_archive_count INT;
BEGIN
    SELECT COUNT(*) INTO v_lead_count FROM leads WHERE source = 'SEED_DATA';
    SELECT COUNT(*) INTO v_order_count FROM orders WHERE order_number LIKE 'ORD-%';
    SELECT COUNT(*) INTO v_archive_count FROM archives;

    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║           🎉 SEED DATA INSERTION COMPLETE                    ║';
    RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║  Leads (Sales Engine):      % records                        ║', LPAD(v_lead_count::text, 3, ' ');
    RAISE NOTICE '║  Orders (Logistics Engine): % records                        ║', LPAD(v_order_count::text, 3, ' ');
    RAISE NOTICE '║  Archives (History Engine): % records                        ║', LPAD(v_archive_count::text, 3, ' ');
    RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
    RAISE NOTICE '║  Dashboard should now show data in every tab!                ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
END $$;

COMMIT;
