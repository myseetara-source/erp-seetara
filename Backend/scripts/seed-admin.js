/**
 * Seed Initial Admin and Rider Users
 * 
 * Run: cd Backend && node scripts/seed-admin.js
 */

import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seedUsers() {
  console.log('🌱 Seeding initial users...\n');

  // Hash passwords
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const riderPassword = await bcrypt.hash('Rider@123', 10);
  const operatorPassword = await bcrypt.hash('Operator@123', 10);

  // Create Admin User
  console.log('Creating Admin user...');
  const { data: admin, error: adminError } = await supabase
    .from('users')
    .upsert({
      email: 'admin@todaytrend.com',
      password_hash: adminPassword,
      name: 'Admin User',
      role: 'admin',
      phone: '9800000000',
      is_active: true,
    }, {
      onConflict: 'email'
    })
    .select()
    .single();

  if (adminError) {
    console.error('❌ Admin creation failed:', adminError.message);
  } else {
    console.log('✅ Admin created:', admin.email);
  }

  // Create Test Rider User
  console.log('Creating Rider user...');
  const { data: rider, error: riderError } = await supabase
    .from('users')
    .upsert({
      email: 'rider@todaytrend.com',
      password_hash: riderPassword,
      name: 'Test Rider',
      role: 'rider',
      phone: '9800000001',
      is_active: true,
    }, {
      onConflict: 'email'
    })
    .select()
    .single();

  if (riderError) {
    console.error('❌ Rider creation failed:', riderError.message);
  } else {
    console.log('✅ Rider created:', rider.email);
  }

  // Create Test Operator User
  console.log('Creating Operator user...');
  const { data: operator, error: operatorError } = await supabase
    .from('users')
    .upsert({
      email: 'operator@todaytrend.com',
      password_hash: operatorPassword,
      name: 'Test Operator',
      role: 'operator',
      phone: '9800000002',
      is_active: true,
    }, {
      onConflict: 'email'
    })
    .select()
    .single();

  if (operatorError) {
    console.error('❌ Operator creation failed:', operatorError.message);
  } else {
    console.log('✅ Operator created:', operator.email);
  }

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║            📋 LOGIN CREDENTIALS                     ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log('║  ADMIN (Full Access)                               ║');
  console.log('║    Email:    admin@todaytrend.com                  ║');
  console.log('║    Password: Admin@123                             ║');
  console.log('║    URL:      http://localhost:3001/dashboard       ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log('║  RIDER (Delivery App)                              ║');
  console.log('║    Email:    rider@todaytrend.com                  ║');
  console.log('║    Password: Rider@123                             ║');
  console.log('║    URL:      http://localhost:3001/portal/rider/login ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log('║  OPERATOR (Order Entry)                            ║');
  console.log('║    Email:    operator@todaytrend.com               ║');
  console.log('║    Password: Operator@123                          ║');
  console.log('║    URL:      http://localhost:3001/dashboard       ║');
  console.log('╚════════════════════════════════════════════════════╝');
}

seedUsers()
  .then(() => {
    console.log('\n✅ Seed completed successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
