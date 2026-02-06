-- ============================================================================
-- MIGRATION 044: FIX VENDOR LEDGER TYPE CAST ERROR
-- ============================================================================
-- Issue: PostgreSQL Error 42846 - cannot cast type inventory_transaction_type to vendor_ledger_type
-- Root Cause: Database triggers were casting directly between incompatible enums
-- Solution: Map inventory_transaction_type values to vendor_ledger_type via TEXT intermediate
-- Date: 2026-01-25
-- Priority: P0 - CRITICAL
-- ============================================================================

-- =============================================================================
-- PART 1: Fix auto_create_vendor_ledger_entry() function
-- =============================================================================

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
-- PART 2: Fix fn_sync_inventory_to_vendor_ledger() function
-- =============================================================================

-- Drop existing trigger first
DROP TRIGGER IF EXISTS trg_sync_inventory_to_vendor_ledger ON inventory_transactions;

-- Recreate the function with proper type mapping
CREATE OR REPLACE FUNCTION fn_sync_inventory_to_vendor_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_entry_type TEXT;  -- Use TEXT as intermediate type for mapping
    v_debit DECIMAL(15,2) := 0;
    v_credit DECIMAL(15,2) := 0;
    v_description TEXT;
    v_running_balance DECIMAL(15,2);
    v_existing_entry UUID;
BEGIN
    -- Skip if no vendor
    IF NEW.vendor_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Only process purchase and purchase_return transactions
    IF NEW.transaction_type NOT IN ('purchase', 'purchase_return') THEN
        RETURN NEW;
    END IF;
    
    -- Only process approved transactions
    IF NEW.status != 'approved' THEN
        RETURN NEW;
    END IF;
    
    -- Check if ledger entry already exists for this transaction
    SELECT id INTO v_existing_entry
    FROM vendor_ledger
    WHERE reference_id = NEW.id
    LIMIT 1;
    
    -- If entry exists, update it
    IF v_existing_entry IS NOT NULL THEN
        UPDATE vendor_ledger
        SET 
            debit = CASE WHEN NEW.transaction_type = 'purchase' THEN COALESCE(NEW.total_cost, 0) ELSE 0 END,
            credit = CASE WHEN NEW.transaction_type = 'purchase_return' THEN COALESCE(NEW.total_cost, 0) ELSE 0 END,
            transaction_date = NEW.transaction_date
        WHERE id = v_existing_entry;
        
        RETURN NEW;
    END IF;
    
    -- ========================================================================
    -- MAP inventory_transaction_type TO vendor_ledger_type
    -- This is the CRITICAL FIX - explicitly map instead of casting
    -- ========================================================================
    CASE NEW.transaction_type::TEXT
        WHEN 'purchase' THEN
            v_entry_type := 'purchase';  -- Maps to vendor_ledger_type 'purchase'
            v_debit := COALESCE(NEW.total_cost, 0);
            v_credit := 0;
            v_description := 'Purchase: ' || COALESCE(NEW.invoice_no, 'N/A');
        WHEN 'purchase_return' THEN
            v_entry_type := 'purchase_return';  -- Maps to vendor_ledger_type 'purchase_return'
            v_debit := 0;
            v_credit := COALESCE(NEW.total_cost, 0);
            v_description := 'Purchase Return: ' || COALESCE(NEW.invoice_no, 'N/A');
        WHEN 'damage' THEN
            -- Damage doesn't affect vendor ledger directly
            RETURN NEW;
        WHEN 'adjustment' THEN
            -- Adjustment might need vendor ledger entry if linked to vendor
            v_entry_type := 'adjustment';
            v_debit := CASE WHEN COALESCE(NEW.total_cost, 0) > 0 THEN COALESCE(NEW.total_cost, 0) ELSE 0 END;
            v_credit := CASE WHEN COALESCE(NEW.total_cost, 0) < 0 THEN ABS(COALESCE(NEW.total_cost, 0)) ELSE 0 END;
            v_description := 'Adjustment: ' || COALESCE(NEW.invoice_no, 'N/A');
        ELSE
            -- Unknown transaction type - skip
            RETURN NEW;
    END CASE;
    
    -- Skip if no financial impact
    IF v_debit = 0 AND v_credit = 0 THEN
        RETURN NEW;
    END IF;
    
    -- Calculate running balance
    SELECT COALESCE(
        (SELECT running_balance 
         FROM vendor_ledger 
         WHERE vendor_id = NEW.vendor_id 
         ORDER BY transaction_date DESC, created_at DESC 
         LIMIT 1),
        0
    ) + v_debit - v_credit INTO v_running_balance;
    
    -- Insert ledger entry with proper type casting via TEXT
    INSERT INTO vendor_ledger (
        vendor_id, entry_type, reference_id, reference_no,
        debit, credit, running_balance, description,
        transaction_date, performed_by, created_at
    ) VALUES (
        NEW.vendor_id, 
        v_entry_type::vendor_ledger_type,  -- Safe cast: TEXT -> vendor_ledger_type
        NEW.id, 
        NEW.invoice_no,
        v_debit, 
        v_credit, 
        v_running_balance, 
        v_description,
        NEW.transaction_date, 
        NEW.performed_by, 
        NOW()
    );
    
    -- Update vendor balance and totals
    UPDATE vendors
    SET 
        balance = v_running_balance,
        total_purchases = COALESCE(total_purchases, 0) + v_debit,
        updated_at = NOW()
    WHERE id = NEW.vendor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trg_sync_inventory_to_vendor_ledger
    AFTER INSERT OR UPDATE ON inventory_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_inventory_to_vendor_ledger();

-- ============================================================================
-- VERIFICATION: Test the fix
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 044 completed successfully';
    RAISE NOTICE '   - Trigger fn_sync_inventory_to_vendor_ledger recreated with type mapping';
    RAISE NOTICE '   - inventory_transaction_type -> vendor_ledger_type mapping fixed';
    RAISE NOTICE '   - Purchase operations should now work correctly';
END $$;
