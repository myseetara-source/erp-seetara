/**
 * Add columns to orders table
 * 
 * This script adds alt_phone and staff_remarks columns
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

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkColumn(columnName) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(columnName)
      .limit(1);
    
    if (error && error.message.includes('does not exist')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function runMigration() {
  console.log('🔧 Checking order table columns...');
  console.log('='.repeat(50));
  
  // Check alt_phone
  const hasAltPhone = await checkColumn('alt_phone');
  console.log(`alt_phone: ${hasAltPhone ? '✅ exists' : '❌ missing'}`);
  
  // Check staff_remarks
  const hasStaffRemarks = await checkColumn('staff_remarks');
  console.log(`staff_remarks: ${hasStaffRemarks ? '✅ exists' : '❌ missing'}`);
  
  if (!hasAltPhone || !hasStaffRemarks) {
    console.log('\n📋 Please run the following SQL in Supabase Dashboard -> SQL Editor:');
    console.log('\n' + '='.repeat(50));
    if (!hasAltPhone) {
      console.log(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS alt_phone VARCHAR(20);`);
    }
    if (!hasStaffRemarks) {
      console.log(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_remarks TEXT;`);
    }
    console.log('='.repeat(50));
  } else {
    console.log('\n✅ All columns exist!');
  }
}

runMigration();
