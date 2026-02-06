/**
 * P0 CRITICAL FIX: Direct PostgreSQL connection to execute migration
 * 
 * This script connects directly to the Supabase PostgreSQL database
 * and executes the migration to fix the vendor_ledger_type cast error.
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Supabase PostgreSQL connection string format:
// postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

// Extract project ref from SUPABASE_URL
const supabaseUrl = process.env.SUPABASE_URL;
const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error('Could not extract project ref from SUPABASE_URL');
  process.exit(1);
}

// Get database password from service key (it's the DB password for postgres user in Supabase)
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase database connection
// Note: You may need to get the actual password from Supabase Dashboard -> Settings -> Database
const connectionString = process.env.DATABASE_URL || 
  `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;

console.log('🚨 P0 CRITICAL FIX: Applying database migration...');
console.log('='.repeat(70));
console.log(`Project: ${projectRef}`);
console.log('');

const migrationSQL = `
-- ============================================================================
-- P0 FIX: vendor_ledger_type cast error
-- ============================================================================

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

async function runMigration() {
  // First try with pg package if available
  try {
    const { Pool } = pg;
    
    // Try to connect using the pooler connection string
    const pool = new Pool({
      connectionString: `postgresql://postgres.${projectRef}:${process.env.DB_PASSWORD || 'YOUR_DB_PASSWORD'}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require`,
      ssl: { rejectUnauthorized: false }
    });
    
    const client = await pool.connect();
    console.log('✅ Connected to database');
    
    await client.query(migrationSQL);
    console.log('✅ Migration executed successfully!');
    
    client.release();
    await pool.end();
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 P0 FIX APPLIED SUCCESSFULLY!');
    console.log('   Purchase operations should now work correctly.');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.log('\n⚠️  Could not connect directly to database.');
    console.log('   Error:', error.message);
    console.log('\n📋 Please run the migration manually:');
    console.log('\n   Option 1: Supabase Dashboard -> SQL Editor');
    console.log('   Option 2: Use psql with your database password');
    console.log('\n   The migration SQL is saved at:');
    console.log('   Backend/database/migrations/044_fix_vendor_ledger_type_cast.sql');
    console.log('\n' + '='.repeat(70));
    console.log('MIGRATION SQL:');
    console.log('='.repeat(70));
    console.log(migrationSQL);
  }
}

runMigration();
