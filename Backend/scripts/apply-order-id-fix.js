/**
 * P0 CRITICAL FIX: Apply bulletproof order ID migration
 * 
 * Fixes the "invalid input syntax for type integer: 'IV-001'" error
 * that breaks POS Exchange/Refund functionality.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

console.log('🔧 P0 CRITICAL FIX: Bulletproof Order ID Migration');
console.log('='.repeat(70));
console.log('');
console.log('This fixes the "IV-001" parsing error that breaks POS Exchange/Refund');
console.log('');

// The migration SQL
const migrationSQL = `
-- =============================================================================
-- Migration 096: BULLETPROOF Order ID Generation
-- =============================================================================

-- STEP 1: DROP ALL EXISTING ORDER ID TRIGGERS
DROP TRIGGER IF EXISTS trg_generate_readable_id ON orders;
DROP TRIGGER IF EXISTS trg_prevent_readable_id_change ON orders;
DROP TRIGGER IF EXISTS trg_generate_smart_order_id ON orders;
DROP TRIGGER IF EXISTS generate_smart_order_id_trigger ON orders;

-- Drop old functions too (CASCADE to drop dependent triggers)
DROP FUNCTION IF EXISTS generate_smart_order_id() CASCADE;
DROP FUNCTION IF EXISTS prevent_readable_id_change() CASCADE;

-- STEP 2: Create BULLETPROOF order ID generation function
CREATE OR REPLACE FUNCTION generate_order_readable_id_safe()
RETURNS TRIGGER AS $$
DECLARE
    v_date_prefix TEXT;
    v_max_seq INT := 100;
    v_new_seq INT;
    v_candidate TEXT;
    v_extracted INT;
    rec RECORD;
BEGIN
    -- CRITICAL: Skip if readable_id is already set
    -- This is the primary path for POS reconciliation orders
    IF NEW.readable_id IS NOT NULL AND LENGTH(TRIM(NEW.readable_id)) > 0 THEN
        RETURN NEW;
    END IF;
    
    -- Generate today's date prefix in YY-MM-DD format
    v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
    
    -- ULTRA-SAFE sequence finding: Loop through candidates one by one
    BEGIN
        FOR rec IN 
            SELECT readable_id 
            FROM orders 
            WHERE readable_id IS NOT NULL
              AND readable_id LIKE v_date_prefix || '-%'
              AND array_length(string_to_array(readable_id, '-'), 1) = 4
        LOOP
            BEGIN
                -- Extract the 4th part (after YY-MM-DD-)
                v_candidate := SPLIT_PART(rec.readable_id, '-', 4);
                
                -- Remove any letter suffix (like 'E' for exchange)
                v_candidate := REGEXP_REPLACE(v_candidate, '[^0-9]', '', 'g');
                
                -- Only try to convert if it looks like a number
                IF v_candidate ~ '^[0-9]+$' AND LENGTH(v_candidate) > 0 THEN
                    v_extracted := v_candidate::INT;
                    IF v_extracted > v_max_seq THEN
                        v_max_seq := v_extracted;
                    END IF;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- Skip this row silently - it's a legacy format
                NULL;
            END;
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        -- If the entire loop fails, use a safe default
        v_max_seq := 100 + (EXTRACT(EPOCH FROM NOW())::INT % 800);
    END;
    
    -- Generate new sequence
    v_new_seq := v_max_seq + 1;
    
    -- Set the readable_id
    NEW.readable_id := v_date_prefix || '-' || v_new_seq::TEXT;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 3: Create the trigger
DROP TRIGGER IF EXISTS trg_generate_order_readable_id ON orders;
CREATE TRIGGER trg_generate_order_readable_id
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_order_readable_id_safe();
`;

async function applyMigration() {
  console.log('📋 Applying migration...');
  console.log('');
  
  try {
    // Execute the migration using Supabase's rpc or direct query
    // Note: Supabase JS client doesn't support raw SQL directly,
    // so we need to use the REST API or create an RPC function
    
    // Try using the pg_execute_sql RPC if it exists, otherwise fall back
    const { data, error } = await supabase.rpc('execute_sql', {
      sql_query: migrationSQL
    });
    
    if (error) {
      // The RPC probably doesn't exist, let's try splitting into individual statements
      console.log('⚠️  Direct SQL execution not available via RPC.');
      console.log('');
      console.log('📋 Please run this migration manually:');
      console.log('');
      console.log('   1. Go to Supabase Dashboard -> SQL Editor');
      console.log('   2. Copy and paste the SQL below');
      console.log('   3. Click "Run"');
      console.log('');
      console.log('='.repeat(70));
      console.log('MIGRATION SQL:');
      console.log('='.repeat(70));
      console.log(migrationSQL);
      console.log('='.repeat(70));
      console.log('');
      console.log('After running the migration, test the Exchange/Refund feature again.');
      return;
    }
    
    console.log('✅ Migration executed successfully!');
    console.log('');
    console.log('🎉 P0 FIX APPLIED!');
    console.log('   POS Exchange/Refund should now work correctly.');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.log('');
    console.log('📋 Please run this migration manually in Supabase SQL Editor:');
    console.log('');
    console.log('='.repeat(70));
    console.log('MIGRATION SQL:');
    console.log('='.repeat(70));
    console.log(migrationSQL);
  }
}

applyMigration();
