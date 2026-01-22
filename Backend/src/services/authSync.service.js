/**
 * Auth Sync Service
 * 
 * Syncs public.users.role to auth.users.raw_app_meta_data
 * Uses Supabase Admin API (service_role key required)
 * 
 * ARCHITECTURE:
 * 1. Trigger on public.users logs changes to pending_role_syncs
 * 2. This service processes pending syncs using Admin API
 * 3. Updates auth.users.raw_app_meta_data with role and vendor_id
 */

import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

// =============================================================================
// SYNC PENDING ROLE CHANGES
// =============================================================================

/**
 * Process all pending role syncs
 * Should be called periodically or triggered by pg_notify
 */
export async function processPendingRoleSyncs() {
  try {
    // Get all pending syncs
    const { data: pendingSyncs, error: fetchError } = await supabaseAdmin
      .from('pending_role_syncs')
      .select('id, email, name, phone, role, vendor_id, is_active')
      .eq('sync_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);

    if (fetchError) {
      logger.error('Failed to fetch pending role syncs', { error: fetchError });
      return { success: false, error: fetchError.message };
    }

    if (!pendingSyncs || pendingSyncs.length === 0) {
      return { success: true, synced: 0, message: 'No pending syncs' };
    }

    logger.info(`Processing ${pendingSyncs.length} pending role syncs`);

    let successCount = 0;
    let failCount = 0;

    for (const sync of pendingSyncs) {
      try {
        await syncUserRole(sync.user_id, sync.new_role, sync.vendor_id);
        
        // Mark as synced
        await supabaseAdmin.rpc('mark_role_sync_complete', {
          p_user_id: sync.user_id,
          p_success: true,
        });
        
        successCount++;
      } catch (err) {
        logger.error('Failed to sync role for user', {
          userId: sync.user_id,
          role: sync.new_role,
          error: err.message,
        });

        // Mark as failed
        await supabaseAdmin.rpc('mark_role_sync_complete', {
          p_user_id: sync.user_id,
          p_success: false,
          p_error_message: err.message,
        });

        failCount++;
      }
    }

    logger.info('Role sync batch complete', { successCount, failCount });

    return {
      success: true,
      synced: successCount,
      failed: failCount,
    };
  } catch (err) {
    logger.error('processPendingRoleSyncs failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

// =============================================================================
// SYNC SINGLE USER ROLE
// =============================================================================

/**
 * Sync a single user's role to auth.users metadata
 * Uses Supabase Admin API
 */
export async function syncUserRole(userId, role, vendorId = null) {
  if (!userId || !role) {
    throw new Error('userId and role are required');
  }

  // Build metadata object
  const appMetadata = { role };
  if (vendorId) {
    appMetadata.vendor_id = vendorId;
  }

  // Update auth.users using Admin API
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: appMetadata,
  });

  if (error) {
    logger.error('Failed to update auth user metadata', {
      userId,
      role,
      error: error.message,
    });
    throw error;
  }

  logger.info('User role synced to auth metadata', {
    userId,
    role,
    vendorId,
  });

  return data;
}

// =============================================================================
// SYNC ALL USERS (Initial Migration)
// =============================================================================

/**
 * Sync ALL users from public.users to auth.users metadata
 * Use this for initial migration or to fix mismatches
 */
export async function syncAllUsers() {
  try {
    // Get all users from public.users
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, vendor_id')
      .order('created_at', { ascending: true });

    if (fetchError) {
      logger.error('Failed to fetch users for sync', { error: fetchError });
      return { success: false, error: fetchError.message };
    }

    if (!users || users.length === 0) {
      return { success: true, synced: 0, message: 'No users to sync' };
    }

    logger.info(`Starting full sync for ${users.length} users`);

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const user of users) {
      try {
        await syncUserRole(user.id, user.role, user.vendor_id);
        successCount++;
      } catch (err) {
        logger.error('Failed to sync user', {
          userId: user.id,
          email: user.email,
          error: err.message,
        });
        failCount++;
        errors.push({ userId: user.id, email: user.email, error: err.message });
      }
    }

    logger.info('Full user sync complete', { successCount, failCount });

    return {
      success: failCount === 0,
      synced: successCount,
      failed: failCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    logger.error('syncAllUsers failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

// =============================================================================
// GET SYNC STATUS
// =============================================================================

/**
 * Get current sync status for all users
 */
export async function getSyncStatus() {
  const { data, error } = await supabaseAdmin
    .from('role_sync_status')
    .select('id, email, name, phone, role, vendor_id, is_active')
    .limit(100);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  processPendingRoleSyncs,
  syncUserRole,
  syncAllUsers,
  getSyncStatus,
};
