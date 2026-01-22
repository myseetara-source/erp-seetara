/**
 * Admin User Management Controller
 * 
 * SECURITY: Uses Service Role Key (Server-side only)
 * All routes require admin authentication
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { AppError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AdminUserController');

// Valid roles matching database ENUM
const VALID_ROLES = ['admin', 'manager', 'operator', 'vendor', 'rider'];

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
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
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
 */
export const createUser = asyncHandler(async (req, res, next) => {
  const { email, password, name, phone, role, vendor_id } = req.body;

  // Validation
  if (!email || !password || !name || !role) {
    throw new AppError('Email, password, name, and role are required', 400);
  }

  if (!VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }

  if (role === 'vendor' && !vendor_id) {
    throw new AppError('Vendor ID is required for vendor role', 400);
  }

  // Check if email already exists
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (existingUser) {
    throw new AppError('Email already exists', 409);
  }

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name, phone, role },
    app_metadata: { role, vendor_id: vendor_id || null },
  });

  if (authError) {
    logger.error('Auth user creation failed', { error: authError });
    throw new AppError(authError.message, 400);
  }

  if (!authData.user) {
    throw new AppError('Failed to create user', 500);
  }

  // Wait for trigger to create public user
  await new Promise(resolve => setTimeout(resolve, 100));

  // Update the user record with full details
  const { data: publicUser, error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      name,
      phone: phone || null,
      role,
      vendor_id: vendor_id || null,
      is_active: true,
    })
    .eq('id', authData.user.id)
    .select()
    .single();

  if (updateError) {
    logger.warn('Public user update had issues', { error: updateError });
  }

  logger.info('User created', { userId: authData.user.id, role, createdBy: req.user?.id });

  res.status(201).json({
    success: true,
    data: publicUser || { id: authData.user.id, email: email.toLowerCase(), name, role },
    message: `User ${name} created successfully with role: ${role}`,
  });
});

/**
 * Update user
 * PATCH /api/v1/admin/users/:id
 */
export const updateUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { name, phone, role, is_active, vendor_id } = req.body;

  // Get existing user
  const { data: existingUser, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('id, email, name, phone, role, vendor_id, is_active')
    .eq('id', id)
    .single();

  if (fetchError || !existingUser) {
    throw new AppError('User not found', 404);
  }

  // Validate role if provided
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400);
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

export default {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
