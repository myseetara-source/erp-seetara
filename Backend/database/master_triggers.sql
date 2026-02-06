-- =============================================================================
-- SEETARA ERP - MASTER TRIGGERS (Consolidated)
-- =============================================================================
--
-- Version: 3.0.0
-- Generated: 2026-01-24
--
-- Contains all triggers consolidated from migrations 000-042.
--
-- EXECUTION ORDER:
-- 1. master_schema.sql
-- 2. master_functions.sql
-- 3. master_triggers.sql (this file)
-- 4. master_seed.sql
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: UPDATED_AT TRIGGERS (Auto-update timestamps)
-- =============================================================================

-- Users
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Vendors
DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at 
    BEFORE UPDATE ON vendors 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Customers
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at 
    BEFORE UPDATE ON customers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Products
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Product Variants
DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON product_variants;
CREATE TRIGGER trg_product_variants_updated_at 
    BEFORE UPDATE ON product_variants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Orders
DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at 
    BEFORE UPDATE ON orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Inventory Transactions
DROP TRIGGER IF EXISTS trg_inv_tx_updated_at ON inventory_transactions;
CREATE TRIGGER trg_inv_tx_updated_at 
    BEFORE UPDATE ON inventory_transactions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tickets
DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at 
    BEFORE UPDATE ON tickets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Riders
DROP TRIGGER IF EXISTS trg_riders_updated_at ON riders;
CREATE TRIGGER trg_riders_updated_at 
    BEFORE UPDATE ON riders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Delivery Runs
DROP TRIGGER IF EXISTS trg_delivery_runs_updated_at ON delivery_runs;
CREATE TRIGGER trg_delivery_runs_updated_at 
    BEFORE UPDATE ON delivery_runs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Vendor Payments
DROP TRIGGER IF EXISTS trg_vendor_payments_updated_at ON vendor_payments;
CREATE TRIGGER trg_vendor_payments_updated_at 
    BEFORE UPDATE ON vendor_payments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- SMS Templates
DROP TRIGGER IF EXISTS trg_sms_templates_updated_at ON sms_templates;
CREATE TRIGGER trg_sms_templates_updated_at 
    BEFORE UPDATE ON sms_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Courier Partners
DROP TRIGGER IF EXISTS trg_courier_partners_updated_at ON courier_partners;
CREATE TRIGGER trg_courier_partners_updated_at 
    BEFORE UPDATE ON courier_partners 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Delivery Zones
DROP TRIGGER IF EXISTS trg_delivery_zones_updated_at ON delivery_zones;
CREATE TRIGGER trg_delivery_zones_updated_at 
    BEFORE UPDATE ON delivery_zones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- SECTION 2: ORDER TRIGGERS
-- =============================================================================

-- Auto-generate order number
DROP TRIGGER IF EXISTS trg_generate_order_number ON orders;
CREATE TRIGGER trg_generate_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- =============================================================================
-- SECTION 3: INVENTORY TRIGGERS
-- =============================================================================

-- Stock update on inventory transaction item insert
DROP TRIGGER IF EXISTS trg_inventory_item_stock_update ON inventory_transaction_items;
CREATE TRIGGER trg_inventory_item_stock_update
    BEFORE INSERT ON inventory_transaction_items
    FOR EACH ROW EXECUTE FUNCTION update_stock_on_transaction_item();

-- =============================================================================
-- SECTION 4: VENDOR LEDGER TRIGGERS
-- =============================================================================

-- Auto-create vendor ledger entry on inventory transaction approval
CREATE OR REPLACE FUNCTION fn_sync_inventory_to_vendor_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_entry_type TEXT;
    v_debit DECIMAL(15,2) := 0;
    v_credit DECIMAL(15,2) := 0;
    v_description TEXT;
    v_running_balance DECIMAL(15,2);
    v_existing_entry UUID;
BEGIN
    IF NEW.vendor_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    IF NEW.transaction_type NOT IN ('purchase', 'purchase_return') THEN
        RETURN NEW;
    END IF;
    
    IF NEW.status != 'approved' THEN
        RETURN NEW;
    END IF;
    
    -- Skip if already has ledger entry
    SELECT id INTO v_existing_entry
    FROM vendor_ledger
    WHERE reference_id = NEW.id
    LIMIT 1;
    
    IF v_existing_entry IS NOT NULL THEN
        UPDATE vendor_ledger
        SET 
            debit = CASE WHEN NEW.transaction_type = 'purchase' THEN COALESCE(NEW.total_cost, 0) ELSE 0 END,
            credit = CASE WHEN NEW.transaction_type = 'purchase_return' THEN COALESCE(NEW.total_cost, 0) ELSE 0 END,
            transaction_date = NEW.transaction_date
        WHERE id = v_existing_entry;
        
        RETURN NEW;
    END IF;
    
    -- CRITICAL FIX: Cast enum to TEXT before comparison to avoid type casting issues
    -- This maps inventory_transaction_type values to vendor_ledger_type compatible strings
    CASE NEW.transaction_type::TEXT
        WHEN 'purchase' THEN
            v_entry_type := 'purchase';
            v_debit := COALESCE(NEW.total_cost, 0);
            v_credit := 0;
            v_description := 'Purchase: ' || COALESCE(NEW.invoice_no, 'N/A');
        WHEN 'purchase_return' THEN
            v_entry_type := 'purchase_return';
            v_debit := 0;
            v_credit := COALESCE(NEW.total_cost, 0);
            v_description := 'Purchase Return: ' || COALESCE(NEW.invoice_no, 'N/A');
        WHEN 'damage' THEN
            -- Damage transactions don't affect vendor ledger
            RETURN NEW;
        WHEN 'adjustment' THEN
            v_entry_type := 'adjustment';
            v_debit := CASE WHEN COALESCE(NEW.total_cost, 0) > 0 THEN COALESCE(NEW.total_cost, 0) ELSE 0 END;
            v_credit := CASE WHEN COALESCE(NEW.total_cost, 0) < 0 THEN ABS(COALESCE(NEW.total_cost, 0)) ELSE 0 END;
            v_description := 'Adjustment: ' || COALESCE(NEW.invoice_no, 'N/A');
        ELSE
            RETURN NEW;
    END CASE;
    
    IF v_debit = 0 AND v_credit = 0 THEN
        RETURN NEW;
    END IF;
    
    SELECT COALESCE(
        (SELECT running_balance 
         FROM vendor_ledger 
         WHERE vendor_id = NEW.vendor_id 
         ORDER BY transaction_date DESC, created_at DESC 
         LIMIT 1),
        0
    ) + v_debit - v_credit INTO v_running_balance;
    
    INSERT INTO vendor_ledger (
        vendor_id, entry_type, reference_id, reference_no,
        debit, credit, running_balance, description,
        transaction_date, performed_by, created_at
    ) VALUES (
        NEW.vendor_id, v_entry_type::vendor_ledger_type, NEW.id, NEW.invoice_no,
        v_debit, v_credit, v_running_balance, v_description,
        NEW.transaction_date, NEW.performed_by, NOW()
    );
    
    UPDATE vendors
    SET 
        balance = v_running_balance,
        total_purchases = COALESCE(total_purchases, 0) + v_debit,
        updated_at = NOW()
    WHERE id = NEW.vendor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_inventory_to_vendor_ledger ON inventory_transactions;
CREATE TRIGGER trg_sync_inventory_to_vendor_ledger
    AFTER INSERT OR UPDATE ON inventory_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_inventory_to_vendor_ledger();

-- =============================================================================
-- SECTION 5: AUTH SYNC TRIGGERS (Supabase Auth)
-- =============================================================================

-- Handle new auth user - create profile in public.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role, is_active, created_at, updated_at)
    VALUES (
        NEW.id,
        LOWER(NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operator'),
        TRUE,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, users.name),
        updated_at = NOW();
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to create user profile: %', SQLERRM;
        RETURN NEW;
END;
$$;

-- Note: This trigger should be created in auth schema by Supabase admin
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--     AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- =============================================================================
-- SECTION 6: CUSTOMER METRICS TRIGGERS
-- =============================================================================

-- Update customer metrics after order delivery
CREATE OR REPLACE FUNCTION update_customer_metrics_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process when status changes to 'delivered'
    IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
        UPDATE customers
        SET 
            total_orders = total_orders + 1,
            total_spent = total_spent + NEW.total_amount,
            last_order_at = NEW.delivered_at,
            avg_order_value = (total_spent + NEW.total_amount) / (total_orders + 1),
            updated_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;
    
    -- Handle returns
    IF NEW.status = 'returned' AND (OLD.status IS NULL OR OLD.status != 'returned') THEN
        UPDATE customers
        SET 
            return_count = return_count + 1,
            total_spent = GREATEST(0, total_spent - NEW.total_amount),
            delivery_success_rate = CASE 
                WHEN total_orders > 0 THEN 
                    ((total_orders - return_count - 1)::DECIMAL / total_orders) * 100
                ELSE 100
            END,
            updated_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_customer_metrics ON orders;
CREATE TRIGGER trg_update_customer_metrics
    AFTER UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_customer_metrics_on_delivery();

-- =============================================================================
-- SECTION 7: ORDER LOG TRIGGERS
-- =============================================================================

-- Auto-create order log on status change
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_logs (
            order_id, old_status, new_status, action, 
            description, changed_by, created_at
        ) VALUES (
            NEW.id, OLD.status, NEW.status, 'status_change',
            'Status changed from ' || COALESCE(OLD.status::TEXT, 'none') || ' to ' || NEW.status::TEXT,
            NEW.assigned_to,
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_order_status_change ON orders;
CREATE TRIGGER trg_log_order_status_change
    AFTER UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- =============================================================================
-- SECTION 8: INVENTORY TRANSACTION TOTALS TRIGGER
-- =============================================================================

-- Update transaction totals when items are added
CREATE OR REPLACE FUNCTION update_transaction_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_total_qty INTEGER;
    v_total_cost DECIMAL(14,2);
BEGIN
    SELECT 
        COALESCE(SUM(ABS(quantity)), 0),
        COALESCE(SUM(ABS(quantity) * COALESCE(unit_cost, 0)), 0)
    INTO v_total_qty, v_total_cost
    FROM inventory_transaction_items
    WHERE transaction_id = COALESCE(NEW.transaction_id, OLD.transaction_id);
    
    UPDATE inventory_transactions
    SET 
        total_quantity = v_total_qty,
        total_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.transaction_id, OLD.transaction_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_transaction_totals ON inventory_transaction_items;
CREATE TRIGGER trg_update_transaction_totals
    AFTER INSERT OR UPDATE OR DELETE ON inventory_transaction_items
    FOR EACH ROW EXECUTE FUNCTION update_transaction_totals();

-- =============================================================================
-- END OF MASTER TRIGGERS
-- =============================================================================

-- Verification
DO $$
DECLARE
    v_trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND NOT t.tgisinternal;
    
    RAISE NOTICE 'Master Triggers Installed: % triggers active', v_trigger_count;
END $$;
