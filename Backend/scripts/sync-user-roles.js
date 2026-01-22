#!/usr/bin/env node

/**
 * Sync User Roles Script
 * 
 * Syncs all users from public.users to auth.users.raw_app_meta_data
 * 
 * Usage:
 *   node scripts/sync-user-roles.js
 *   npm run sync:roles
 */

import { syncAllUsers, processPendingRoleSyncs, getSyncStatus } from '../src/services/authSync.service.js';

const args = process.argv.slice(2);
const command = args[0] || 'all';

async function main() {
  console.log('🔄 User Role Sync Tool\n');

  try {
    switch (command) {
      case 'all':
        console.log('📋 Syncing ALL users to auth metadata...\n');
        const allResult = await syncAllUsers();
        console.log('\n✅ Sync Complete!');
        console.log(`   Synced: ${allResult.synced}`);
        console.log(`   Failed: ${allResult.failed || 0}`);
        if (allResult.errors) {
          console.log('\n❌ Errors:');
          allResult.errors.forEach(e => console.log(`   - ${e.email}: ${e.error}`));
        }
        break;

      case 'pending':
        console.log('📋 Processing pending role syncs...\n');
        const pendingResult = await processPendingRoleSyncs();
        console.log('\n✅ Processing Complete!');
        console.log(`   Synced: ${pendingResult.synced}`);
        console.log(`   Failed: ${pendingResult.failed || 0}`);
        break;

      case 'status':
        console.log('📋 Checking sync status...\n');
        const statusResult = await getSyncStatus();
        if (statusResult.success && statusResult.data) {
          console.log('Current Status:');
          statusResult.data.forEach(u => {
            const status = u.sync_status || '✅ synced';
            console.log(`   ${u.email}: ${u.current_role} (${status})`);
          });
        } else {
          console.log('Failed to get status:', statusResult.error);
        }
        break;

      case 'help':
      default:
        console.log('Commands:');
        console.log('  all      - Sync all users (default)');
        console.log('  pending  - Process only pending syncs');
        console.log('  status   - Check current sync status');
        console.log('  help     - Show this help');
        break;
    }
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
