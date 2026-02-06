/**
 * Create/Sync Admin User in Supabase Auth + users table
 * 
 * Run: node scripts/sync-auth-admin.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_EMAIL = 'admin@seetara.com';
const ADMIN_PASSWORD = 'Admin@123456';

async function syncAuthAdmin() {
  console.log('🔄 Syncing admin user...\n');
  
  try {
    // Check if user exists in Supabase Auth
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError.message);
      process.exit(1);
    }
    
    const existing = existingUsers?.users?.find(u => u.email === ADMIN_EMAIL);
    
    if (existing) {
      console.log('✅ User exists in Supabase Auth:', existing.id);
      console.log('   Updating password and syncing role to app_metadata...');
      
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, { 
        password: ADMIN_PASSWORD,
        email_confirm: true,
        // CRITICAL FIX: Sync role to app_metadata so frontend useAuth() sees it
        user_metadata: { name: 'System Admin', role: 'admin' },
        app_metadata: { role: 'admin' }
      });
      
      if (updateError) {
        console.error('❌ Update error:', updateError.message);
      } else {
        console.log('✅ Password updated and role synced to app_metadata!');
      }
      
      // Sync to users table
      const { error: syncError } = await supabase.from('users').upsert({
        id: existing.id,
        email: ADMIN_EMAIL,
        name: 'System Admin',
        role: 'admin',
        is_active: true,
        password_hash: 'managed_by_supabase_auth'
      }, { onConflict: 'id' });
      
      if (syncError) {
        console.error('❌ Sync error:', syncError.message);
      } else {
        console.log('✅ Synced to users table!');
      }
      
    } else {
      console.log('Creating new user in Supabase Auth...');
      
      const { data, error: createError } = await supabase.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { name: 'System Admin', role: 'admin' },
        // CRITICAL: Set role in app_metadata for frontend useAuth() hook
        app_metadata: { role: 'admin' }
      });
      
      if (createError) {
        console.error('❌ Create error:', createError.message);
        process.exit(1);
      }
      
      console.log('✅ Created Auth user:', data.user.id);
      
      // Create in users table
      const { error: insertError } = await supabase.from('users').upsert({
        id: data.user.id,
        email: ADMIN_EMAIL,
        name: 'System Admin',
        role: 'admin',
        is_active: true,
        password_hash: 'managed_by_supabase_auth'
      }, { onConflict: 'id' });
      
      if (insertError) {
        console.error('❌ Insert error:', insertError.message);
      } else {
        console.log('✅ Created in users table!');
      }
    }
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║            📋 LOGIN CREDENTIALS                     ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║  Email:    ${ADMIN_EMAIL.padEnd(38)}║`);
    console.log(`║  Password: ${ADMIN_PASSWORD.padEnd(38)}║`);
    console.log('║  URL:      http://localhost:3001/login              ║');
    console.log('╚════════════════════════════════════════════════════╝');
    
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

syncAuthAdmin()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
