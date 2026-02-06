/**
 * Admin User Management Controller
 * 
 * SECURITY: Uses Service Role Key (Server-side only)
 * All routes require admin authentication
 */

import bcrypt from 'bcrypt';
import { supabaseAdmin } from '../../config/supabase.js';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { AppError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';
import { buildSafeOrQuery } from '../../utils/helpers.js';

const logger = createLogger('AdminUserController');

// Valid roles matching database ENUM
// Note: 'staff', 'warehouse', 'csr' map to 'operator' in database for backward compatibility
const VALID_ROLES = ['admin', 'manager', 'operator', 'vendor', 'rider', 'viewer'];
const ROLE_ALIASES = {
  'staff': 'operator',
  'warehouse': 'operator', 
  'csr': 'operator',
};

/**
 * List all users (Admin only)
 * GET /api/v1/admin/users
 */
export const listUsers = asyncHandler(async (req, res, next) => {
  const { role, status, search, page = 1, limit = 50 } = req.query;

  // Build query
  let query = supabaseAdmin
    .from('users')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Apply filters
  if (role && role !== 'all') {
    query = query.eq('role', role);
  }
  if (status === 'active') {
    query = query.eq('is_active', true);
  } else if (status === 'inactive') {
    query = query.eq('is_active', false);
  }
  if (search) {
    const safeQuery = buildSafeOrQuery(search, ['name', 'email', 'phone']);
    if (safeQuery) query = query.or(safeQuery);
  }

  // Pagination
  const offset = (parseInt(page) - 1) * parseInt(limit);
  query = query.range(offset, offset + parseInt(limit) - 1);

  const { data: users, error, count } = await query;

  if (error) {
    logger.error('Failed to fetch users', { error });
    throw new AppError('Failed to fetch users', 500);
  }

  // Get auth users for last sign in info
  const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
  const authUsers = authData?.users || [];

  // Merge data
  const enrichedUsers = users?.map(user => {
    const authUser = authUsers.find(au => au.id === user.id);
    return {
      ...user,
      last_sign_in: authUser?.last_sign_in_at,
      email_confirmed: authUser?.email_confirmed_at != null,
    };
  });

  res.json({
    success: true,
    data: enrichedUsers || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count || 0,
      totalPages: Math.ceil((count || 0) / parseInt(limit)),
    },
  });
});

/**
 * Get single user by ID
 * GET /api/v1/admin/users/:id
 */
export const getUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, phone, role, vendor_id, is_active, avatar_url, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404);
  }

  // Get auth user details
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id);

  res.json({
    success: true,
    data: {
      ...user,
      last_sign_in: authUser?.user?.last_sign_in_at,
      email_confirmed: authUser?.user?.email_confirmed_at != null,
      auth_metadata: authUser?.user?.app_metadata,
    },
  });
});

/**
 * Create new user
 * POST /api/v1/admin/users
 * 
 * SECURITY: Uses database transaction via RPC to prevent orphan auth users
 */
export const createUser = asyncHandler(async (req, res, next) => {
  const { email, password, name, phone, role: inputRole, vendor_id } = req.body;

  // Validation
  if (!email || !password || !name || !inputRole) {
    throw new AppError('Email, password, name, and role are required', 400);
  }

  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  // Map role aliases to valid database roles (e.g., 'csr' -> 'operator')
  const role = ROLE_ALIASES[inputRole.toLowerCase()] || inputRole.toLowerCase();

  if (!VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${[...VALID_ROLES, ...Object.keys(ROLE_ALIASES)].join(', ')}`, 400);
  }

  if (role === 'vendor' && !vendor_id) {
    throw new AppError('Vendor ID is required for vendor role', 400);
  }

  // Verify vendor exists if vendor role
  if (role === 'vendor' && vendor_id) {
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from('vendors')
      .select('id, name')
      .eq('id', vendor_id)
      .single();

    if (vendorError || !vendor) {
      throw new AppError('Selected vendor not found', 404);
    }
  }

  // Check if email already exists in public.users
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (existingUser) {
    throw new AppError('Email already exists in system', 409);
  }

  // Also check Supabase Auth (might exist there but not in public.users)
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingAuthUser = authUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
  
  if (existingAuthUser) {
    // User exists in auth but not in public.users - sync them
    logger.warn('User exists in auth but not in public.users, syncing...', { email });
    
    // Update auth metadata
    await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
      user_metadata: { name, phone, role },
      app_metadata: { role, vendor_id: vendor_id || null },
    });
    
    // Create in public.users
    const password_hash = await bcrypt.hash(password, 10);
    const { data: syncedUser, error: syncError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: existingAuthUser.id,
        email: email.toLowerCase(),
        name,
        phone: phone || null,
        role,
        vendor_id: vendor_id || null,
        is_active: true,
        password_hash,
      })
      .select()
      .single();
    
    if (syncError) {
      throw new AppError('Failed to sync existing auth user: ' + syncError.message, 500);
    }
    
    logger.info('Synced existing auth user to public.users', { userId: existingAuthUser.id });
    
    // P0: If role is rider, also create/update riders table record
    if (role === 'rider') {
      await syncRiderRecord(existingAuthUser.id, name, phone);
    }
    
    return res.status(201).json({
      success: true,
      data: syncedUser,
      message: `User ${name} synced successfully with role: ${role}`,
    });
  }

  // STEP 1: Create user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name, phone, role },
    app_metadata: { role, vendor_id: vendor_id || null },
  });

  if (authError) {
    logger.error('Auth user creation failed', { error: authError });
    throw new AppError('Failed to create user: ' + authError.message, 400);
  }

  if (!authData.user) {
    throw new AppError('Failed to create user', 500);
  }

  // Hash password for local storage (enables faster login + offline auth)
  const saltRounds = 10;
  const password_hash = await bcrypt.hash(password, saltRounds);

  // STEP 2: Create/update public user profile via RPC (atomic)
  try {
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('create_user_with_profile', {
      p_user_id: authData.user.id,
      p_email: email.toLowerCase(),
      p_name: name,
      p_phone: phone || null,
      p_role: role,
      p_vendor_id: vendor_id || null,
    });

    if (rpcError) {
      // Check if RPC doesn't exist - fallback will handle it
      if (rpcError.code === 'PGRST202') {
        throw rpcError; // Let the catch block handle fallback
      }
      // Rollback: Delete the auth user if profile creation fails
      logger.error('Profile RPC failed, rolling back auth user', { error: rpcError });
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new AppError('Failed to create user profile: ' + rpcError.message, 500);
    }
    
    // Update password hash separately since RPC doesn't handle it
    await supabaseAdmin
      .from('users')
      .update({ password_hash })
      .eq('id', authData.user.id);

    const publicUser = rpcResult?.user || { id: authData.user.id, email: email.toLowerCase(), name, role };

    // P0: If role is rider, also create riders table record
    if (role === 'rider') {
      await syncRiderRecord(authData.user.id, name, phone);
    }

    logger.info('User created successfully', { userId: authData.user.id, role, createdBy: req.user?.id });

    res.status(201).json({
      success: true,
      data: publicUser,
      message: `User ${name} created successfully with role: ${role}`,
    });

  } catch (profileError) {
    // If RPC doesn't exist, fallback to direct insert
    if (profileError.code === 'PGRST202') {
      logger.warn('RPC not found, using fallback method');
      
      // Wait for trigger to potentially create the user
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update the user record with full details INCLUDING password_hash
      const { data: publicUser, error: updateError } = await supabaseAdmin
        .from('users')
        .upsert({
          id: authData.user.id,
          email: email.toLowerCase(),
          name,
          phone: phone || null,
          role,
          vendor_id: vendor_id || null,
          is_active: true,
          password_hash, // CRITICAL: Store password hash for login
        })
        .select()
        .single();

      if (updateError) {
        logger.error('Fallback user update failed', { error: updateError });
        // Don't delete auth user - let trigger handle it
      }

      // P0: If role is rider, also create riders table record
      if (role === 'rider') {
        await syncRiderRecord(authData.user.id, name, phone);
      }

      logger.info('User created (fallback)', { userId: authData.user.id, role, createdBy: req.user?.id });

      res.status(201).json({
        success: true,
        data: publicUser || { id: authData.user.id, email: email.toLowerCase(), name, role },
        message: `User ${name} created successfully with role: ${role}`,
      });
    } else {
      throw profileError;
    }
  }
});

/**
 * P0: Sync rider record when user with role='rider' is created
 * Creates or updates the riders table to ensure rider appears in dispatch
 */
async function syncRiderRecord(userId, name, phone) {
  try {
    // Check if rider already exists
    const { data: existingRider } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existingRider) {
      // Update existing rider
      await supabaseAdmin
        .from('riders')
        .update({
          full_name: name,
          phone: phone || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      
      logger.info('Rider record updated', { userId });
    } else {
      // Create new rider record
      const { error: riderError } = await supabaseAdmin
        .from('riders')
        .insert({
          user_id: userId,
          full_name: name,
          phone: phone || null,
          vehicle_type: 'motorcycle', // Default
          status: 'available',
          is_active: true,
          is_on_duty: false,
          is_available: true,
          current_cash_balance: 0,
          total_deliveries: 0,
          today_deliveries: 0,
          average_rating: 5.0,
        });

      if (riderError) {
        logger.error('Failed to create rider record', { error: riderError.message, userId });
      } else {
        logger.info('Rider record created', { userId, name });
      }
    }
  } catch (error) {
    logger.error('syncRiderRecord error', { error: error.message, userId });
    // Don't throw - user creation should still succeed
  }
}

/**
 * Update user
 * PATCH /api/v1/admin/users/:id
 */
export const updateUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { name, phone, role: inputRole, is_active, vendor_id } = req.body;

  // Get existing user
  const { data: existingUser, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('id, email, name, phone, role, vendor_id, is_active')
    .eq('id', id)
    .single();

  if (fetchError || !existingUser) {
    throw new AppError('User not found', 404);
  }

  // Map role aliases to valid database roles
  const role = inputRole !== undefined 
    ? (ROLE_ALIASES[inputRole.toLowerCase()] || inputRole.toLowerCase())
    : undefined;

  // Validate role if provided
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${[...VALID_ROLES, ...Object.keys(ROLE_ALIASES)].join(', ')}`, 400);
  }

  // Build update data
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone;
  if (role !== undefined) updateData.role = role;
  if (is_active !== undefined) updateData.is_active = is_active;
  if (vendor_id !== undefined) updateData.vendor_id = vendor_id;
  updateData.updated_at = new Date().toISOString();

  // Update public.users
  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    logger.error('Update user error', { error: updateError });
    throw new AppError('Failed to update user', 500);
  }

  // Update auth metadata if role changed
  if (role !== undefined && role !== existingUser.role) {
    await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: {
        role,
        vendor_id: vendor_id ?? existingUser.vendor_id ?? null,
      },
    });
  }

  // Ban/unban based on is_active
  if (is_active === false && existingUser.is_active === true) {
    await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' });
    logger.info('User banned', { userId: id, bannedBy: req.user?.id });
  }
  if (is_active === true && existingUser.is_active === false) {
    await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' });
    logger.info('User unbanned', { userId: id, unbannedBy: req.user?.id });
  }

  res.json({
    success: true,
    data: updatedUser,
    message: 'User updated successfully',
  });
});

/**
 * Delete (deactivate) user
 * DELETE /api/v1/admin/users/:id
 */
export const deleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Prevent self-deletion
  if (id === req.user?.id) {
    throw new AppError('Cannot delete your own account', 400);
  }

  // Get user
  const { data: user, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('id, email, name, is_active')
    .eq('id', id)
    .single();

  if (fetchError || !user) {
    throw new AppError('User not found', 404);
  }

  // Soft delete
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    logger.error('Soft delete error', { error: updateError });
    throw new AppError('Failed to delete user', 500);
  }

  // Ban in auth
  await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' });

  logger.info('User deleted', { userId: id, deletedBy: req.user?.id });

  res.json({
    success: true,
    message: `User ${user.name || user.email} has been deactivated`,
  });
});

/**
 * P0: Sync all rider users to riders table
 * POST /api/v1/admin/sync-riders
 * 
 * This endpoint syncs all users with role='rider' to the riders table
 * Ensures all rider accounts appear in dispatch assignment
 */
export const syncAllRiders = asyncHandler(async (req, res) => {
  // Get all users with role = 'rider'
  const { data: riderUsers, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, name, phone, is_active')
    .eq('role', 'rider');

  if (usersError) {
    throw new AppError('Failed to fetch rider users: ' + usersError.message, 500);
  }

  if (!riderUsers || riderUsers.length === 0) {
    return res.json({
      success: true,
      message: 'No rider users found to sync',
      synced: 0,
    });
  }

  let synced = 0;
  let errors = [];

  for (const user of riderUsers) {
    try {
      await syncRiderRecord(user.id, user.name, user.phone);
      synced++;
    } catch (err) {
      errors.push({ userId: user.id, error: err.message });
    }
  }

  logger.info('Rider sync completed', { total: riderUsers.length, synced, errors: errors.length });

  res.json({
    success: true,
    message: `Synced ${synced} of ${riderUsers.length} riders`,
    synced,
    total: riderUsers.length,
    errors: errors.length > 0 ? errors : undefined,
  });
});

export default {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  syncAllRiders,
};
