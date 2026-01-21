/**
 * Create Initial Admin User
 * 
 * Usage: node scripts/create-admin.js
 * 
 * This script creates an admin user for the ERP system.
 * Run this AFTER setting up the database schema.
 */

import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@seetara.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';
const ADMIN_NAME = process.env.ADMIN_NAME || 'System Admin';

async function createAdmin() {
  console.log('🚀 Creating admin user...\n');

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Check if admin already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', ADMIN_EMAIL.toLowerCase())
      .single();

    if (existing) {
      console.log(`⚠️  Admin user already exists: ${existing.email}`);
      console.log('   Use this email to login.');
      process.exit(0);
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

    // Create admin user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: ADMIN_EMAIL.toLowerCase(),
        password_hash,
        name: ADMIN_NAME,
        role: 'admin',
        is_active: true,
      })
      .select('id, email, name, role')
      .single();

    if (error) {
      console.error('❌ Failed to create admin:', error.message);
      process.exit(1);
    }

    console.log('✅ Admin user created successfully!\n');
    console.log('   ╔══════════════════════════════════════════╗');
    console.log('   ║         ADMIN LOGIN CREDENTIALS          ║');
    console.log('   ╠══════════════════════════════════════════╣');
    console.log(`   ║  Email:    ${ADMIN_EMAIL.padEnd(28)}║`);
    console.log(`   ║  Password: ${ADMIN_PASSWORD.padEnd(28)}║`);
    console.log('   ╚══════════════════════════════════════════╝');
    console.log('\n⚠️  IMPORTANT: Change this password after first login!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
