-- =============================================================================
-- SEETARA ERP - MASTER FUNCTIONS v3.1.0
-- =============================================================================
-- 
-- DATE: 2026-01-24
-- PURPOSE: All RPC functions - Run AFTER 01_master_schema.sql
--
-- =============================================================================

-- =============================================================================
-- SECTION 0: CLEANUP OLD FUNCTIONS
-- =============================================================================

DO $$
DECLARE
    func_names TEXT[] := ARRAY[
        'update_updated_at_column', 'generate_order_number', 'get_next_invoice_number',
        'generate_payment_number', 'deduct_stock_atomic', 'deduct_stock_batch_atomic',
        'restore_stock_atomic', 'confirm_stock_deduction_atomic', 'update_stock_on_transaction_item',
        'approve_inventory_transaction', 'reject_inventory_transaction', 'get_vendor_stats',
        'record_vendor_payment', 'get_dashboard_analytics', 'create_user_with_profile',
        'auto_create_vendor_ledger_entry'
    ];
    func_name TEXT;
    func_oid OID;
BEGIN
    FOREACH func_name IN ARRAY func_names
    LOOP
        FOR func_oid IN 
            SELECT p.oid FROM pg_proc p 
            JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'public' AND p.proname = func_name
        LOOP
            EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_oid::regprocedure);
        END LOOP;
    END LOOP;
    RAISE NOTICE 'Old functions cleaned up';
END $$;

-- =============================================================================
-- SECTION 1: UTILITY FUNCTIONS
-- =============================================================================

-- Updated At Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate Order Number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    v_seq INTEGER;
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER)), 0) + 1
        INTO v_seq FROM orders WHERE order_number LIKE 'ORD-%';
        NEW.order_number := 'ORD-' || LPAD(v_seq::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Invoice Number Generator
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_type inventory_transaction_type)
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_last_num INTEGER;
BEGIN
    v_prefix := CASE p_type
        WHEN 'purchase' THEN 'PUR-'
        WHEN 'purchase_return' THEN 'RET-'
        WHEN 'damage' THEN 'DMG-'
        WHEN 'adjustment' THEN 'ADJ-'
    END;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no FROM LENGTH(v_prefix) + 1) AS INTEGER)), 0)
    INTO v_last_num FROM inventory_transactions WHERE invoice_no LIKE v_prefix || '%';
    
    RETURN v_prefix || LPAD((v_last_num + 1)::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Payment Number Generator
CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    next_num INTEGER;
    year_suffix VARCHAR(4);
BEGIN
    year_suffix := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(payment_no, '[^0-9]', '', 'g') AS INTEGER)), 0) + 1
    INTO next_num FROM vendor_payments WHERE payment_no LIKE 'PAY-' || year_suffix || '-%';
    RETURN 'PAY-' || year_suffix || '-' || LPAD(next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 2: STOCK OPERATIONS (Atomic)
-- =============================================================================

-- Deduct Stock Atomic
CREATE OR REPLACE FUNCTION deduct_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_sku VARCHAR(100);
BEGIN
    SELECT current_stock, sku INTO v_current_stock, v_sku
    FROM product_variants WHERE id = p_variant_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    IF v_current_stock < p_quantity THEN
        RETURN json_build_object('success', FALSE, 'error', 
            format('Insufficient stock for %s. Available: %s, Requested: %s', v_sku, v_current_stock, p_quantity));
    END IF;
    
    v_new_stock := v_current_stock - p_quantity;
    
    UPDATE product_variants SET 
        current_stock = v_new_stock,
        reserved_stock = reserved_stock + p_quantity,
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    INSERT INTO stock_movements (variant_id, order_id, movement_type, quantity, balance_before, balance_after, source, notes)
    VALUES (p_variant_id, p_order_id, 'reserved', -p_quantity, v_current_stock, v_new_stock, 'fresh', 'Order reservation');
    
    RETURN json_build_object('success', TRUE, 'variant_id', p_variant_id, 'previous_stock', v_current_stock, 'new_stock', v_new_stock);
END;
$$;

-- Restore Stock Atomic
CREATE OR REPLACE FUNCTION restore_stock_atomic(
    p_variant_id UUID,
    p_quantity INTEGER,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Order cancelled'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
BEGIN
    SELECT current_stock INTO v_current_stock FROM product_variants WHERE id = p_variant_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    v_new_stock := v_current_stock + p_quantity;
    
    UPDATE product_variants SET 
        current_stock = v_new_stock,
        reserved_stock = GREATEST(0, reserved_stock - p_quantity),
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    INSERT INTO stock_movements (variant_id, order_id, movement_type, quantity, balance_before, balance_after, source, notes)
    VALUES (p_variant_id, p_order_id, 'restored', p_quantity, v_current_stock, v_new_stock, 'fresh', p_reason);
    
    RETURN json_build_object('success', TRUE, 'variant_id', p_variant_id, 'previous_stock', v_current_stock, 'new_stock', v_new_stock);
END;
$$;

-- =============================================================================
-- SECTION 3: INVENTORY TRANSACTION FUNCTIONS
-- =============================================================================

-- Stock Update Trigger Function
CREATE OR REPLACE FUNCTION update_stock_on_transaction_item()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_type inventory_transaction_type;
    v_transaction_status inventory_transaction_status;
    v_current_stock INTEGER;
    v_quantity_change INTEGER;
BEGIN
    SELECT transaction_type, status INTO v_transaction_type, v_transaction_status
    FROM inventory_transactions WHERE id = NEW.transaction_id;
    
    IF v_transaction_status != 'approved' THEN
        RETURN NEW;
    END IF;
    
    SELECT current_stock INTO v_current_stock FROM product_variants WHERE id = NEW.variant_id;
    NEW.stock_before := v_current_stock;
    
    CASE v_transaction_type
        WHEN 'purchase' THEN
            v_quantity_change := ABS(NEW.quantity);
            UPDATE product_variants SET current_stock = current_stock + v_quantity_change, updated_at = NOW() WHERE id = NEW.variant_id;
            NEW.stock_after := v_current_stock + v_quantity_change;
            
        WHEN 'purchase_return' THEN
            v_quantity_change := ABS(NEW.quantity);
            UPDATE product_variants SET current_stock = GREATEST(0, current_stock - v_quantity_change), updated_at = NOW() WHERE id = NEW.variant_id;
            NEW.stock_after := GREATEST(0, v_current_stock - v_quantity_change);
            
        WHEN 'damage' THEN
            v_quantity_change := ABS(NEW.quantity);
            UPDATE product_variants SET 
                current_stock = GREATEST(0, current_stock - v_quantity_change),
                damaged_stock = damaged_stock + v_quantity_change,
                updated_at = NOW()
            WHERE id = NEW.variant_id;
            NEW.stock_after := GREATEST(0, v_current_stock - v_quantity_change);
            
        WHEN 'adjustment' THEN
            v_quantity_change := NEW.quantity;
            UPDATE product_variants SET current_stock = GREATEST(0, current_stock + v_quantity_change), updated_at = NOW() WHERE id = NEW.variant_id;
            NEW.stock_after := GREATEST(0, v_current_stock + v_quantity_change);
    END CASE;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, stock_before, stock_after, reference_id, reason)
    VALUES (NEW.variant_id, v_transaction_type::text, NEW.quantity, NEW.stock_before, NEW.stock_after, NEW.transaction_id, NEW.notes);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 4: VENDOR FUNCTIONS
-- =============================================================================

-- Get Vendor Stats
CREATE OR REPLACE FUNCTION get_vendor_stats(p_vendor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_purchases DECIMAL(14,2) := 0;
    v_returns DECIMAL(14,2) := 0;
    v_payments DECIMAL(14,2) := 0;
    v_purchase_count INTEGER := 0;
    v_balance DECIMAL(14,2) := 0;
BEGIN
    SELECT COUNT(*), COALESCE(SUM(ABS(total_cost)), 0)
    INTO v_purchase_count, v_purchases
    FROM inventory_transactions
    WHERE vendor_id = p_vendor_id AND transaction_type = 'purchase' AND status = 'approved';
    
    SELECT COALESCE(SUM(ABS(total_cost)), 0) INTO v_returns
    FROM inventory_transactions
    WHERE vendor_id = p_vendor_id AND transaction_type = 'purchase_return' AND status = 'approved';
    
    SELECT COALESCE(SUM(credit), 0) INTO v_payments
    FROM vendor_ledger
    WHERE vendor_id = p_vendor_id AND entry_type = 'payment';
    
    SELECT COALESCE(balance, 0) INTO v_balance FROM vendors WHERE id = p_vendor_id;
    
    RETURN json_build_object(
        'purchase_count', v_purchase_count,
        'purchases', v_purchases,
        'returns', v_returns,
        'payments', v_payments,
        'balance', COALESCE(v_balance, v_purchases - v_returns - v_payments)
    );
END;
$$;

-- Record Vendor Payment
CREATE OR REPLACE FUNCTION record_vendor_payment(
    p_vendor_id UUID,
    p_amount DECIMAL(14, 2),
    p_payment_method VARCHAR(50),
    p_reference_number VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_performed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_vendor RECORD;
    v_payment_no VARCHAR(50);
    v_new_balance DECIMAL(14, 2);
    v_payment_id UUID;
BEGIN
    SELECT id, name, balance INTO v_vendor FROM vendors WHERE id = p_vendor_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Vendor not found');
    END IF;
    
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Amount must be positive');
    END IF;
    
    v_payment_no := generate_payment_number();
    v_new_balance := v_vendor.balance - p_amount;
    
    INSERT INTO vendor_payments (vendor_id, payment_no, amount, payment_method, reference_number, balance_before, balance_after, notes, created_by)
    VALUES (p_vendor_id, v_payment_no, p_amount, p_payment_method, p_reference_number, v_vendor.balance, v_new_balance, p_notes, p_performed_by)
    RETURNING id INTO v_payment_id;
    
    INSERT INTO vendor_ledger (vendor_id, entry_type, reference_id, reference_no, debit, credit, running_balance, description, performed_by)
    VALUES (p_vendor_id, 'payment', v_payment_id, v_payment_no, 0, p_amount, v_new_balance, 'Payment via ' || p_payment_method, p_performed_by);
    
    UPDATE vendors SET balance = v_new_balance, updated_at = NOW() WHERE id = p_vendor_id;
    
    RETURN jsonb_build_object('success', TRUE, 'payment_id', v_payment_id, 'payment_no', v_payment_no, 'balance_after', v_new_balance);
END;
$$;

-- Auto-create vendor ledger on inventory transaction approval
-- P0 FIX: Cast enum to TEXT first to avoid PostgreSQL Error 42846
CREATE OR REPLACE FUNCTION auto_create_vendor_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_running_balance DECIMAL(14, 2);
    v_debit DECIMAL(14, 2) := 0;
    v_credit DECIMAL(14, 2) := 0;
    v_entry_type TEXT;
BEGIN
    IF NEW.vendor_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.transaction_type NOT IN ('purchase', 'purchase_return') THEN RETURN NEW; END IF;
    IF NEW.status != 'approved' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;
    
    -- CRITICAL FIX: Map inventory_transaction_type to vendor_ledger_type via TEXT
    v_entry_type := NEW.transaction_type::TEXT;
    
    IF NEW.transaction_type = 'purchase' THEN
        v_debit := COALESCE(NEW.total_cost, 0);
    ELSE
        v_credit := COALESCE(NEW.total_cost, 0);
    END IF;
    
    SELECT COALESCE((SELECT running_balance FROM vendor_ledger WHERE vendor_id = NEW.vendor_id ORDER BY created_at DESC LIMIT 1), 0) + v_debit - v_credit INTO v_running_balance;
    
    INSERT INTO vendor_ledger (vendor_id, entry_type, reference_id, reference_no, debit, credit, running_balance, description, performed_by, transaction_date)
    VALUES (NEW.vendor_id, v_entry_type::vendor_ledger_type, NEW.id, NEW.invoice_no, v_debit, v_credit, v_running_balance, 
            CASE WHEN NEW.transaction_type = 'purchase' THEN 'Purchase: ' ELSE 'Return: ' END || COALESCE(NEW.invoice_no, 'N/A'), NEW.performed_by, NEW.transaction_date);
    
    UPDATE vendors SET balance = v_running_balance, updated_at = NOW() WHERE id = NEW.vendor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 5: DASHBOARD ANALYTICS
-- =============================================================================

CREATE OR REPLACE FUNCTION get_dashboard_analytics(
    p_date_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_date_to DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'orders', (
            SELECT json_build_object(
                'total', COUNT(*),
                'pending', COUNT(*) FILTER (WHERE status IN ('intake', 'follow_up')),
                'processing', COUNT(*) FILTER (WHERE status IN ('converted', 'packed', 'assigned')),
                'delivered', COUNT(*) FILTER (WHERE status = 'delivered'),
                'cancelled', COUNT(*) FILTER (WHERE status IN ('cancelled', 'rejected', 'returned')),
                'today', COUNT(*) FILTER (WHERE created_at::DATE = CURRENT_DATE)
            ) FROM orders WHERE is_deleted = FALSE AND created_at::DATE BETWEEN p_date_from AND p_date_to
        ),
        'inventory', (
            SELECT json_build_object(
                'total_variants', COUNT(*),
                'total_stock', COALESCE(SUM(current_stock), 0),
                'low_stock', COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock < 10),
                'out_of_stock', COUNT(*) FILTER (WHERE current_stock = 0),
                'stock_value', COALESCE(SUM(current_stock * cost_price), 0)
            ) FROM product_variants WHERE is_active = TRUE
        ),
        'vendors', (
            SELECT json_build_object(
                'total', COUNT(*),
                'active', COUNT(*) FILTER (WHERE is_active = TRUE),
                'total_balance', COALESCE(SUM(balance), 0)
            ) FROM vendors
        ),
        'revenue', (
            SELECT json_build_object(
                'total', COALESCE(SUM(total_amount), 0),
                'paid', COALESCE(SUM(paid_amount), 0)
            ) FROM orders WHERE is_deleted = FALSE AND created_at::DATE BETWEEN p_date_from AND p_date_to
        ),
        'generated_at', NOW()
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- =============================================================================
-- SECTION 6: USER MANAGEMENT
-- =============================================================================

CREATE OR REPLACE FUNCTION create_user_with_profile(
    p_user_id UUID,
    p_email TEXT,
    p_name TEXT,
    p_phone TEXT DEFAULT NULL,
    p_role user_role DEFAULT 'operator',
    p_vendor_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_role = 'vendor' AND p_vendor_id IS NULL THEN
        RAISE EXCEPTION 'vendor_id is required for vendor role';
    END IF;

    INSERT INTO users (id, email, name, phone, role, vendor_id, is_active, created_at, updated_at)
    VALUES (p_user_id, LOWER(p_email), p_name, p_phone, p_role, p_vendor_id, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone,
        role = EXCLUDED.role, vendor_id = EXCLUDED.vendor_id, updated_at = NOW();

    RETURN json_build_object('success', TRUE, 'user_id', p_user_id);
END;
$$;

-- =============================================================================
-- SECTION 7: TRIGGERS
-- =============================================================================

-- Updated At Triggers
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_inv_tx_updated_at BEFORE UPDATE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Order Number Generator
CREATE TRIGGER trg_generate_order_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- Stock Update Trigger
CREATE TRIGGER trg_inventory_item_stock_update BEFORE INSERT ON inventory_transaction_items FOR EACH ROW EXECUTE FUNCTION update_stock_on_transaction_item();

-- Vendor Ledger Auto-Sync
CREATE TRIGGER trg_auto_vendor_ledger AFTER INSERT OR UPDATE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION auto_create_vendor_ledger_entry();

-- =============================================================================
-- SECTION 8: GRANTS
-- =============================================================================

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =============================================================================
-- SECTION 7: HIGH-PERFORMANCE RPC FUNCTIONS (Added in migration 045)
-- =============================================================================

-- Generate Purchase Invoice Number (Atomic)
CREATE OR REPLACE FUNCTION generate_purchase_invoice_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_year TEXT := TO_CHAR(NOW(), 'YYYY');
    v_prefix TEXT := 'PUR-' || v_year || '-';
    v_last_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_no, '^' || v_prefix, ''), '')::INTEGER), 0) INTO v_last_num
    FROM inventory_transactions
    WHERE transaction_type = 'purchase' AND invoice_no LIKE v_prefix || '%';
    
    RETURN v_prefix || LPAD((v_last_num + 1)::TEXT, 6, '0');
END;
$$;

-- Get Inventory Metrics (Dashboard RPC)
CREATE OR REPLACE FUNCTION get_inventory_metrics(
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
    p_end_date DATE DEFAULT CURRENT_DATE,
    p_user_role TEXT DEFAULT 'admin',
    p_vendor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_total_stock_value DECIMAL(15,2);
    v_low_stock_count INTEGER;
    v_out_of_stock_count INTEGER;
BEGIN
    SELECT 
        COALESCE(SUM(pv.current_stock * pv.cost_price), 0),
        COUNT(*) FILTER (WHERE pv.current_stock > 0 AND pv.current_stock < 10),
        COUNT(*) FILTER (WHERE pv.current_stock <= 0)
    INTO v_total_stock_value, v_low_stock_count, v_out_of_stock_count
    FROM product_variants pv WHERE pv.is_active = TRUE;

    v_result := jsonb_build_object(
        'summary', jsonb_build_object(
            'total_stock_value', v_total_stock_value,
            'low_stock_count', v_low_stock_count,
            'out_of_stock_count', v_out_of_stock_count
        ),
        'low_stock_items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object('variant_id', pv.id, 'sku', pv.sku, 'current_stock', pv.current_stock) ORDER BY pv.current_stock), '[]'::jsonb)
            FROM product_variants pv WHERE pv.is_active = TRUE AND pv.current_stock > 0 AND pv.current_stock < 10 LIMIT 20
        ),
        'generated_at', NOW()
    );
    RETURN v_result;
END;
$$;

-- Grants for RPC functions
GRANT EXECUTE ON FUNCTION generate_purchase_invoice_no() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_inventory_metrics(DATE, DATE, TEXT, UUID) TO authenticated, service_role;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    v_func_count INTEGER;
    v_trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_func_count FROM pg_proc WHERE pronamespace = 'public'::regnamespace;
    SELECT COUNT(*) INTO v_trigger_count FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname = 'public' AND NOT t.tgisinternal;
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ MASTER FUNCTIONS v3.2.0 INSTALLED!';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  Functions: %', v_func_count;
    RAISE NOTICE '  Triggers: %', v_trigger_count;
    RAISE NOTICE '  ⚡ High-Performance RPC: generate_purchase_invoice_no()';
    RAISE NOTICE '  ⚡ High-Performance RPC: get_inventory_metrics()';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
