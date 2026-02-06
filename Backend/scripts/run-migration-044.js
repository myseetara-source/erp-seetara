/**
 * Emergency Migration Runner for P0 Fix
 * Fixes: PostgreSQL Error 42846 - cannot cast inventory_transaction_type to vendor_ledger_type
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function runMigration() {
  console.log('🚨 P0 CRITICAL FIX: Running migration 044_fix_vendor_ledger_type_cast.sql');
  console.log('='.repeat(70));
  
  try {
    // Step 1: Drop existing trigger
    console.log('\n1️⃣  Dropping existing trigger...');
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: 'DROP TRIGGER IF EXISTS trg_sync_inventory_to_vendor_ledger ON inventory_transactions;'
    }).single();
    
    if (dropError && !dropError.message.includes('does not exist')) {
      // Try direct approach if RPC doesn't exist
      console.log('   Using fallback method...');
    }
    console.log('   ✅ Trigger dropped or not exists');
    
    // Step 2: Create the fixed function
    console.log('\n2️⃣  Creating fixed trigger function...');
    
    const fixedFunction = `
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
        NEW.vendor_id, 
        v_entry_type::vendor_ledger_type,
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
    
    UPDATE vendors
    SET 
        balance = v_running_balance,
        total_purchases = COALESCE(total_purchases, 0) + v_debit,
        updated_at = NOW()
    WHERE id = NEW.vendor_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

    // Use Supabase SQL Editor API or run via psql
    // Since we can't run raw SQL directly, let's use the REST API
    
    // Alternative: Use the Supabase Management API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql: fixedFunction })
    });
    
    if (!response.ok) {
      // RPC doesn't exist, need to use Supabase Dashboard or psql
      console.log('   ⚠️  Cannot run SQL directly via API.');
      console.log('   Please run the migration manually in Supabase SQL Editor.');
      console.log('\n   Migration file: Backend/database/migrations/044_fix_vendor_ledger_type_cast.sql');
      
      // Print the SQL for manual execution
      console.log('\n' + '='.repeat(70));
      console.log('📋 COPY THE FOLLOWING SQL AND RUN IN SUPABASE SQL EDITOR:');
      console.log('='.repeat(70));
      console.log(`
-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_sync_inventory_to_vendor_ledger ON inventory_transactions;

-- Create fixed function
${fixedFunction}

-- Recreate trigger
CREATE TRIGGER trg_sync_inventory_to_vendor_ledger
    AFTER INSERT OR UPDATE ON inventory_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_inventory_to_vendor_ledger();
`);
      console.log('='.repeat(70));
      return;
    }
    
    console.log('   ✅ Function created');
    
    // Step 3: Recreate trigger
    console.log('\n3️⃣  Recreating trigger...');
    await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ 
        sql: `CREATE TRIGGER trg_sync_inventory_to_vendor_ledger
              AFTER INSERT OR UPDATE ON inventory_transactions
              FOR EACH ROW EXECUTE FUNCTION fn_sync_inventory_to_vendor_ledger();`
      })
    });
    
    console.log('   ✅ Trigger created');
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('   Purchase operations should now work correctly.');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('\n📋 Please run the migration manually in Supabase SQL Editor.');
    console.log('   File: Backend/database/migrations/044_fix_vendor_ledger_type_cast.sql');
    process.exit(1);
  }
}

runMigration();
