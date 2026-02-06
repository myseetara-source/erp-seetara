-- =============================================================================
-- SEETARA ERP - MASTER FUNCTIONS (Consolidated)
-- =============================================================================
--
-- Version: 3.0.0
-- Generated: 2026-01-24
--
-- Contains all RPC functions and utility functions consolidated from
-- migrations 000-042.
--
-- EXECUTION ORDER:
-- 1. master_schema.sql
-- 2. master_functions.sql (this file)
-- 3. master_triggers.sql
-- 4. master_seed.sql
--
-- =============================================================================

-- =============================================================================
-- SECTION 0: AGGRESSIVE FUNCTION CLEANUP
-- =============================================================================
-- Drop all existing function overloads to prevent "cannot change return type" errors

DO $$
DECLARE
    func_names TEXT[] := ARRAY[
        'update_updated_at_column',
        'generate_order_number',
        'get_next_invoice_number',
        'generate_payment_number',
        'generate_supply_number',
        'deduct_stock_atomic',
        'deduct_stock_batch_atomic',
        'restore_stock_atomic',
        'confirm_stock_deduction_atomic',
        'update_stock_on_transaction_item',
        'approve_inventory_transaction',
        'reject_inventory_transaction',
        'get_vendor_stats',
        'record_vendor_payment',
        'get_dashboard_analytics',
        'get_inventory_metrics',
        'get_next_followup_attempt',
        'increment_rider_stats',
        'append_unique_to_array',
        'get_delivery_zone',
        'get_zone_type',
        'create_user_with_profile',
        'soft_delete_user'
    ];
    func_name TEXT;
    func_oid OID;
BEGIN
    FOREACH func_name IN ARRAY func_names
    LOOP
        FOR func_oid IN 
            SELECT p.oid 
            FROM pg_proc p 
            JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'public' 
            AND p.proname = func_name
        LOOP
            EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_oid::regprocedure);
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Function cleanup completed';
END $$;

-- =============================================================================
-- SECTION 1: UTILITY FUNCTIONS
-- =============================================================================

-- 1.1 Updated At Column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1.2 Generate Order Number
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

-- 1.3 Invoice Number Generator
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_type inventory_transaction_type)
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT;
    v_last_num INTEGER;
    v_new_num TEXT;
BEGIN
    v_prefix := CASE p_type
        WHEN 'purchase' THEN 'PUR-'
        WHEN 'purchase_return' THEN 'RET-'
        WHEN 'damage' THEN 'DMG-'
        WHEN 'adjustment' THEN 'ADJ-'
    END;
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no FROM LENGTH(v_prefix) + 1) AS INTEGER)), 0)
    INTO v_last_num
    FROM inventory_transactions
    WHERE invoice_no LIKE v_prefix || '%';
    
    v_new_num := v_prefix || LPAD((v_last_num + 1)::text, 6, '0');
    
    RETURN v_new_num;
END;
$$ LANGUAGE plpgsql;

-- 1.4 Generate Payment Number
CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    next_num INTEGER;
    year_suffix VARCHAR(4);
BEGIN
    year_suffix := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(REGEXP_REPLACE(payment_no, '[^0-9]', '', 'g') AS INTEGER)
    ), 0) + 1
    INTO next_num
    FROM vendor_payments
    WHERE payment_no LIKE 'PAY-' || year_suffix || '-%';
    
    RETURN 'PAY-' || year_suffix || '-' || LPAD(next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 1.5 Generate Supply Number
CREATE OR REPLACE FUNCTION generate_supply_number()
RETURNS TEXT AS $$
DECLARE
    v_prefix TEXT := 'PO';
    v_date_part TEXT := TO_CHAR(NOW(), 'YYMMDD');
    v_sequence INTEGER;
    v_result TEXT;
BEGIN
    SELECT COALESCE(MAX(
        CAST(RIGHT(invoice_no, 3) AS INTEGER)
    ), 0) + 1 INTO v_sequence
    FROM inventory_transactions
    WHERE invoice_no LIKE v_prefix || v_date_part || '%'
      AND created_at::DATE = CURRENT_DATE;
    
    v_result := v_prefix || v_date_part || LPAD(v_sequence::TEXT, 3, '0');
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SECTION 2: STOCK OPERATIONS (Atomic)
-- =============================================================================

-- 2.1 Deduct Stock Atomic (Single Variant)
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
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    IF v_current_stock < p_quantity THEN
        RETURN json_build_object(
            'success', FALSE, 
            'error', format('Insufficient stock for %s. Available: %s, Requested: %s', 
                           v_sku, v_current_stock, p_quantity)
        );
    END IF;
    
    v_new_stock := v_current_stock - p_quantity;
    
    UPDATE product_variants
    SET 
        current_stock = v_new_stock,
        reserved_stock = reserved_stock + p_quantity,
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    INSERT INTO stock_movements (
        variant_id, order_id, movement_type, quantity, 
        balance_before, balance_after, source, notes
    ) VALUES (
        p_variant_id, p_order_id, 'reserved', -p_quantity,
        v_current_stock, v_new_stock, 'fresh', 
        'Order reservation'
    );
    
    RETURN json_build_object(
        'success', TRUE,
        'variant_id', p_variant_id,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'reserved', p_quantity
    );
END;
$$;

-- 2.2 Deduct Stock Batch Atomic
CREATE OR REPLACE FUNCTION deduct_stock_batch_atomic(
    p_items JSONB,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_result JSON;
    v_failed JSONB := '[]'::JSONB;
    v_success INTEGER := 0;
    v_variant_id UUID;
    v_quantity INTEGER;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        SELECT deduct_stock_atomic(v_variant_id, v_quantity, p_order_id) INTO v_result;
        
        IF (v_result->>'success')::BOOLEAN THEN
            v_success := v_success + 1;
        ELSE
            v_failed := v_failed || jsonb_build_object(
                'variant_id', v_variant_id,
                'error', v_result->>'error'
            );
        END IF;
    END LOOP;
    
    IF jsonb_array_length(v_failed) > 0 THEN
        RETURN json_build_object(
            'success', FALSE,
            'processed', v_success,
            'failed', v_failed
        );
    ELSE
        RETURN json_build_object(
            'success', TRUE,
            'processed', v_success
        );
    END IF;
END;
$$;

-- 2.3 Restore Stock Atomic
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
    v_reserved_stock INTEGER;
    v_new_stock INTEGER;
BEGIN
    SELECT current_stock, reserved_stock INTO v_current_stock, v_reserved_stock
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    v_new_stock := v_current_stock + p_quantity;
    
    UPDATE product_variants
    SET 
        current_stock = v_new_stock,
        reserved_stock = GREATEST(0, reserved_stock - p_quantity),
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    INSERT INTO stock_movements (
        variant_id, order_id, movement_type, quantity,
        balance_before, balance_after, source, notes
    ) VALUES (
        p_variant_id, p_order_id, 'restored', p_quantity,
        v_current_stock, v_new_stock, 'fresh', p_reason
    );
    
    RETURN json_build_object(
        'success', TRUE,
        'variant_id', p_variant_id,
        'previous_stock', v_current_stock,
        'new_stock', v_new_stock,
        'restored', p_quantity
    );
END;
$$;

-- 2.4 Confirm Stock Deduction
CREATE OR REPLACE FUNCTION confirm_stock_deduction_atomic(
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
    v_reserved_stock INTEGER;
BEGIN
    SELECT reserved_stock INTO v_reserved_stock
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'Variant not found');
    END IF;
    
    UPDATE product_variants
    SET 
        reserved_stock = GREATEST(0, reserved_stock - p_quantity),
        updated_at = NOW()
    WHERE id = p_variant_id;
    
    INSERT INTO stock_movements (
        variant_id, order_id, movement_type, quantity,
        balance_before, balance_after, source, notes
    ) VALUES (
        p_variant_id, p_order_id, 'confirmed', -p_quantity,
        v_reserved_stock, GREATEST(0, v_reserved_stock - p_quantity), 
        'reserved', 'Delivery confirmed'
    );
    
    RETURN json_build_object('success', TRUE, 'confirmed', p_quantity);
END;
$$;

-- =============================================================================
-- SECTION 3: INVENTORY TRANSACTION FUNCTIONS
-- =============================================================================

-- 3.1 Stock Update on Transaction Item
CREATE OR REPLACE FUNCTION update_stock_on_transaction_item()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_type inventory_transaction_type;
    v_transaction_status inventory_transaction_status;
    v_current_stock INTEGER;
    v_damaged_stock INTEGER;
    v_quantity_change INTEGER;
BEGIN
    SELECT transaction_type, status INTO v_transaction_type, v_transaction_status
    FROM inventory_transactions WHERE id = NEW.transaction_id;
    
    IF v_transaction_status != 'approved' THEN
        RETURN NEW;
    END IF;
    
    SELECT current_stock, damaged_stock INTO v_current_stock, v_damaged_stock
    FROM product_variants WHERE id = NEW.variant_id;
    
    NEW.stock_before := v_current_stock;
    
    CASE v_transaction_type
        WHEN 'purchase' THEN
            v_quantity_change := ABS(NEW.quantity);
            UPDATE product_variants
            SET current_stock = current_stock + v_quantity_change, updated_at = NOW()
            WHERE id = NEW.variant_id;
            NEW.stock_after := v_current_stock + v_quantity_change;
            
        WHEN 'purchase_return' THEN
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
            v_quantity_change := ABS(NEW.quantity);
            UPDATE product_variants
            SET current_stock = GREATEST(0, current_stock - v_quantity_change),
                damaged_stock = damaged_stock + v_quantity_change,
                updated_at = NOW()
            WHERE id = NEW.variant_id;
            NEW.stock_after := GREATEST(0, v_current_stock - v_quantity_change);
            
        WHEN 'adjustment' THEN
            v_quantity_change := NEW.quantity;
            UPDATE product_variants
            SET current_stock = GREATEST(0, current_stock + v_quantity_change), updated_at = NOW()
            WHERE id = NEW.variant_id;
            NEW.stock_after := GREATEST(0, v_current_stock + v_quantity_change);
    END CASE;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, stock_before, stock_after, reference_id, reason)
    VALUES (NEW.variant_id, v_transaction_type::text, NEW.quantity, NEW.stock_before, NEW.stock_after, NEW.transaction_id, NEW.notes);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3.2 Approve Inventory Transaction
CREATE OR REPLACE FUNCTION approve_inventory_transaction(
    p_transaction_id UUID,
    p_approved_by UUID
)
RETURNS TABLE (id UUID, status inventory_transaction_status) AS $$
DECLARE
    v_current_status inventory_transaction_status;
BEGIN
    SELECT it.status INTO v_current_status
    FROM inventory_transactions it WHERE it.id = p_transaction_id;
    
    IF v_current_status != 'pending' THEN
        RAISE EXCEPTION 'Transaction is not pending (current: %)', v_current_status;
    END IF;
    
    UPDATE inventory_transactions
    SET status = 'approved',
        approved_by = p_approved_by,
        approval_date = NOW(),
        updated_at = NOW()
    WHERE inventory_transactions.id = p_transaction_id;
    
    UPDATE inventory_transaction_items
    SET notes = COALESCE(notes, '')
    WHERE transaction_id = p_transaction_id;
    
    RETURN QUERY SELECT inventory_transactions.id, inventory_transactions.status FROM inventory_transactions WHERE inventory_transactions.id = p_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- 3.3 Reject Inventory Transaction
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
-- SECTION 4: VENDOR FUNCTIONS
-- =============================================================================

-- 4.1 Get Vendor Stats
CREATE OR REPLACE FUNCTION get_vendor_stats(p_vendor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSON;
    v_purchases DECIMAL(14,2) := 0;
    v_returns DECIMAL(14,2) := 0;
    v_payments DECIMAL(14,2) := 0;
    v_purchase_count INTEGER := 0;
    v_last_purchase_date DATE;
    v_last_payment_date DATE;
    v_balance DECIMAL(14,2) := 0;
BEGIN
    SELECT 
        COALESCE(COUNT(*), 0),
        COALESCE(SUM(ABS(total_cost)), 0),
        MAX(transaction_date)
    INTO v_purchase_count, v_purchases, v_last_purchase_date
    FROM inventory_transactions
    WHERE vendor_id = p_vendor_id 
      AND transaction_type = 'purchase'
      AND status = 'approved';
    
    SELECT COALESCE(SUM(ABS(total_cost)), 0)
    INTO v_returns
    FROM inventory_transactions
    WHERE vendor_id = p_vendor_id 
      AND transaction_type = 'purchase_return'
      AND status = 'approved';
    
    SELECT 
        COALESCE(SUM(credit), 0),
        MAX(transaction_date)
    INTO v_payments, v_last_payment_date
    FROM vendor_ledger
    WHERE vendor_id = p_vendor_id 
      AND entry_type = 'payment';
    
    SELECT COALESCE(balance, 0) INTO v_balance
    FROM vendors
    WHERE id = p_vendor_id;
    
    v_result := json_build_object(
        'purchase_count', v_purchase_count,
        'purchases', v_purchases,
        'returns', v_returns,
        'payments', v_payments,
        'balance', COALESCE(v_balance, v_purchases - v_returns - v_payments),
        'last_purchase_date', v_last_purchase_date,
        'last_payment_date', v_last_payment_date,
        'last_activity_date', GREATEST(v_last_purchase_date, v_last_payment_date)
    );
    
    RETURN v_result;
END;
$$;

-- 4.2 Record Vendor Payment
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
    v_ledger_id UUID;
BEGIN
    SELECT id, name, balance INTO v_vendor
    FROM vendors
    WHERE id = p_vendor_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Vendor not found');
    END IF;
    
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Amount must be positive');
    END IF;
    
    v_payment_no := generate_payment_number();
    v_new_balance := v_vendor.balance - p_amount;
    
    INSERT INTO vendor_payments (
        vendor_id, payment_no, amount, payment_method, 
        reference_number, balance_before, balance_after, 
        notes, created_by
    ) VALUES (
        p_vendor_id, v_payment_no, p_amount, p_payment_method,
        p_reference_number, v_vendor.balance, v_new_balance,
        p_notes, p_performed_by
    )
    RETURNING id INTO v_payment_id;
    
    INSERT INTO vendor_ledger (
        vendor_id, entry_type, reference_id, reference_no,
        debit, credit, running_balance, description, performed_by
    ) VALUES (
        p_vendor_id, 'payment', v_payment_id, v_payment_no,
        0, p_amount, v_new_balance,
        'Payment via ' || p_payment_method,
        p_performed_by
    )
    RETURNING id INTO v_ledger_id;
    
    UPDATE vendors
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = p_vendor_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'ledger_id', v_ledger_id,
        'balance_before', v_vendor.balance,
        'balance_after', v_new_balance
    );
END;
$$;

-- =============================================================================
-- SECTION 5: DASHBOARD & ANALYTICS
-- =============================================================================

-- 5.1 Get Dashboard Analytics (Consolidated)
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
    v_orders_stats JSON;
    v_inventory_stats JSON;
    v_vendor_stats JSON;
    v_revenue_stats JSON;
BEGIN
    SELECT json_build_object(
        'total_orders', COUNT(*),
        'pending_orders', COUNT(*) FILTER (WHERE status IN ('intake', 'follow_up')),
        'processing_orders', COUNT(*) FILTER (WHERE status IN ('converted', 'packed', 'assigned')),
        'delivered_orders', COUNT(*) FILTER (WHERE status = 'delivered'),
        'cancelled_orders', COUNT(*) FILTER (WHERE status IN ('cancelled', 'rejected', 'returned')),
        'orders_today', COUNT(*) FILTER (WHERE created_at::DATE = CURRENT_DATE),
        'orders_this_week', COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE))
    ) INTO v_orders_stats
    FROM orders
    WHERE is_deleted = FALSE
      AND created_at::DATE BETWEEN p_date_from AND p_date_to;
    
    SELECT json_build_object(
        'total_products', COUNT(DISTINCT product_id),
        'total_variants', COUNT(*),
        'total_stock', COALESCE(SUM(current_stock), 0),
        'low_stock_count', COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock < 10),
        'out_of_stock_count', COUNT(*) FILTER (WHERE current_stock = 0),
        'stock_value', COALESCE(SUM(current_stock * cost_price), 0),
        'pending_transactions', (
            SELECT COUNT(*) FROM inventory_transactions 
            WHERE status = 'pending'
        )
    ) INTO v_inventory_stats
    FROM product_variants
    WHERE is_active = TRUE;
    
    SELECT json_build_object(
        'total_vendors', COUNT(*),
        'active_vendors', COUNT(*) FILTER (WHERE is_active = TRUE),
        'total_balance', COALESCE(SUM(balance), 0)
    ) INTO v_vendor_stats
    FROM vendors;
    
    SELECT json_build_object(
        'total_revenue', COALESCE(SUM(total_amount), 0),
        'total_paid', COALESCE(SUM(paid_amount), 0),
        'avg_order_value', COALESCE(AVG(total_amount), 0)
    ) INTO v_revenue_stats
    FROM orders
    WHERE is_deleted = FALSE
      AND created_at::DATE BETWEEN p_date_from AND p_date_to;
    
    v_result := json_build_object(
        'orders', v_orders_stats,
        'inventory', v_inventory_stats,
        'vendors', v_vendor_stats,
        'revenue', v_revenue_stats,
        'period', json_build_object('from', p_date_from, 'to', p_date_to),
        'generated_at', NOW()
    );
    
    RETURN v_result;
END;
$$;

-- 5.2 Get Inventory Metrics
CREATE OR REPLACE FUNCTION get_inventory_metrics(
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL
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
        'total_variants', COUNT(*),
        'total_stock', COALESCE(SUM(current_stock), 0),
        'total_damaged', COALESCE(SUM(damaged_stock), 0),
        'total_reserved', COALESCE(SUM(reserved_stock), 0),
        'stock_value', COALESCE(SUM(current_stock * cost_price), 0),
        'low_stock_items', COUNT(*) FILTER (WHERE current_stock > 0 AND current_stock < reorder_level),
        'out_of_stock_items', COUNT(*) FILTER (WHERE current_stock = 0)
    ) INTO v_result
    FROM product_variants
    WHERE is_active = TRUE;
    
    RETURN v_result;
END;
$$;

-- =============================================================================
-- SECTION 6: UTILITY FUNCTIONS
-- =============================================================================

-- 6.1 Get Next Followup Attempt
CREATE OR REPLACE FUNCTION get_next_followup_attempt(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_attempt INTEGER;
BEGIN
    SELECT COALESCE(MAX(followup_number), 0) + 1 INTO v_max_attempt
    FROM order_followups
    WHERE order_id = p_order_id;
    
    RETURN v_max_attempt;
END;
$$;

-- 6.2 Increment Rider Stats
CREATE OR REPLACE FUNCTION increment_rider_stats(
    p_rider_id UUID,
    p_delivered INTEGER DEFAULT 0,
    p_failed INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE riders
    SET 
        total_deliveries = total_deliveries + p_delivered + p_failed,
        successful_deliveries = successful_deliveries + p_delivered,
        failed_deliveries = failed_deliveries + p_failed,
        updated_at = NOW()
    WHERE id = p_rider_id;
    
    RETURN FOUND;
END;
$$;

-- 6.3 Append Unique to Array
CREATE OR REPLACE FUNCTION append_unique_to_array(
    p_table_name TEXT,
    p_column_name TEXT,
    p_id UUID,
    p_value TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE format(
        'UPDATE %I SET %I = array_append(
            COALESCE(%I, ARRAY[]::TEXT[]), 
            $1
        ) WHERE id = $2 AND NOT ($1 = ANY(COALESCE(%I, ARRAY[]::TEXT[])))',
        p_table_name, p_column_name, p_column_name, p_column_name
    ) USING p_value, p_id;
    
    RETURN FOUND;
END;
$$;

-- 6.4 Get Delivery Zone
CREATE OR REPLACE FUNCTION get_delivery_zone(p_city TEXT, p_district TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_zone RECORD;
BEGIN
    SELECT * INTO v_zone
    FROM delivery_zones
    WHERE LOWER(city_name) = LOWER(p_city)
       OR (p_district IS NOT NULL AND LOWER(district) = LOWER(p_district))
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'found', FALSE,
            'zone_type', 'outside_valley',
            'delivery_fee', 150
        );
    END IF;
    
    RETURN json_build_object(
        'found', TRUE,
        'zone_id', v_zone.id,
        'zone_type', v_zone.zone_type,
        'city_name', v_zone.city_name,
        'delivery_fee', COALESCE(v_zone.delivery_fee, v_zone.delivery_charge),
        'estimated_days', v_zone.estimated_days
    );
END;
$$;

-- 6.5 Get Zone Type
CREATE OR REPLACE FUNCTION get_zone_type(p_zone_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_zone_type TEXT;
BEGIN
    SELECT zone_type::TEXT INTO v_zone_type
    FROM delivery_zones
    WHERE id = p_zone_id;
    
    RETURN COALESCE(v_zone_type, 'outside_valley');
END;
$$;

-- 6.6 User Profile Creation (Transactional)
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
DECLARE
    v_result JSON;
BEGIN
    IF p_role = 'vendor' AND p_vendor_id IS NULL THEN
        RAISE EXCEPTION 'vendor_id is required for vendor role';
    END IF;

    IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
        UPDATE users SET
            email = LOWER(p_email),
            name = p_name,
            phone = p_phone,
            role = p_role,
            vendor_id = p_vendor_id,
            is_active = TRUE,
            updated_at = NOW()
        WHERE id = p_user_id;
    ELSE
        INSERT INTO users (id, email, name, phone, role, vendor_id, is_active, created_at, updated_at)
        VALUES (
            p_user_id,
            LOWER(p_email),
            p_name,
            p_phone,
            p_role,
            p_vendor_id,
            TRUE,
            NOW(),
            NOW()
        );
    END IF;

    SELECT json_build_object(
        'success', TRUE,
        'user', json_build_object(
            'id', u.id,
            'email', u.email,
            'name', u.name,
            'role', u.role
        )
    )
    INTO v_result
    FROM users u
    WHERE u.id = p_user_id;

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'User profile creation failed: %', SQLERRM;
END;
$$;

-- 6.7 Soft Delete User
CREATE OR REPLACE FUNCTION soft_delete_user(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user RECORD;
    v_result JSON;
BEGIN
    SELECT * INTO v_user FROM users WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    UPDATE users SET
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = p_user_id;

    SELECT json_build_object(
        'success', TRUE,
        'message', 'User ' || v_user.name || ' has been deactivated'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- =============================================================================
-- SECTION 7: GRANT PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =============================================================================
-- END OF MASTER FUNCTIONS
-- =============================================================================
