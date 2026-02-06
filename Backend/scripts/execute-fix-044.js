/**
 * Direct SQL Execution for P0 Fix
 * Uses Supabase postgREST SQL execution
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

const migrationSQL = `
-- Drop existing trigger first
DROP TRIGGER IF EXISTS trg_sync_inventory_to_vendor_ledger ON inventory_transactions;

-- Recreate the function with proper type mapping
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

-- Recreate the trigger
CREATE TRIGGER trg_sync_inventory_to_vendor_ledger
    AFTER INSERT OR UPDATE ON inventory_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_inventory_to_vendor_ledger();
`;

async function executeMigration() {
  console.log('🚨 P0 CRITICAL FIX: Executing migration via SQL...');
  console.log('='.repeat(70));
  
  try {
    // Try using the Supabase SQL function if it exists
    // First, let's check if there's an RPC function we can use
    
    // Create a temporary RPC function to execute SQL
    const createExecFunction = `
      CREATE OR REPLACE FUNCTION temp_exec_sql(sql_query TEXT)
      RETURNS VOID AS $$
      BEGIN
        EXECUTE sql_query;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;
    
    // Try a simple test query first
    const { data, error } = await supabase
      .from('vendors')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('Database connection test failed:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Database connection verified');
    
    // Since we can't run raw SQL via Supabase client, let's output instructions
    console.log('\n📋 The migration SQL has been saved to:');
    console.log('   Backend/database/migrations/044_fix_vendor_ledger_type_cast.sql');
    console.log('\n🔧 To apply the fix, please:');
    console.log('   1. Go to Supabase Dashboard -> SQL Editor');
    console.log('   2. Copy and paste the SQL from the migration file');
    console.log('   3. Click "Run" to execute');
    console.log('\n   OR use psql if you have direct database access:');
    console.log('   psql <DATABASE_URL> -f Backend/database/migrations/044_fix_vendor_ledger_type_cast.sql');
    
    // Output the SQL for easy copying
    console.log('\n' + '='.repeat(70));
    console.log('SQL TO EXECUTE (copy this):');
    console.log('='.repeat(70));
    console.log(migrationSQL);
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

executeMigration();
