/**
 * User Controller - Admin Team Management
 * 
 * SECURITY: All endpoints require admin role
 * 
 * Features:
 * - Create staff accounts (using Supabase Admin API)
 * - Toggle user active status (ban/unban)
 * - Update user roles
 * - View team members
 */

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { createLogger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

const logger = createLogger('UserController');

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const VALID_ROLES = ['admin', 'manager', 'operator', 'staff', 'csr', 'rider', 'viewer'];

const createUserSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
  role: z.enum(VALID_ROLES, { message: 'Invalid role' }),
  department: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: z.enum(VALID_ROLES).optional(),
  department: z.string().optional(),
});

// =============================================================================
// HELPER: Get available roles for dropdown
// =============================================================================

const ROLE_CONFIG = [
  { key: 'admin', label: 'Administrator', level: 1, color: 'red' },
  { key: 'manager', label: 'Manager', level: 2, color: 'purple' },
  { key: 'operator', label: 'Operator', level: 3, color: 'blue' },
  { key: 'staff', label: 'Staff', level: 3, color: 'blue' },
  { key: 'csr', label: 'Customer Service', level: 4, color: 'green' },
  { key: 'rider', label: 'Rider', level: 5, color: 'orange' },
  { key: 'viewer', label: 'Viewer', level: 6, color: 'gray' },
];

// =============================================================================
// LIST TEAM MEMBERS
// =============================================================================

/**
 * Get all team members
 * GET /users
 * 
 * SECURITY: Admin only
 */
export const listUsers = asyncHandler(async (req, res) => {
  const { role, is_active, search, page = 1, limit = 50 } = req.query;
  
  let query = supabaseAdmin
    .from('users')
    .select('*', { count: 'exact' })
    .neq('role', 'vendor'); // Exclude vendors

  // Filters
  if (role) query = query.eq('role', role);
  if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  // Pagination
  const from = (parseInt(page) - 1) * parseInt(limit);
  const to = from + parseInt(limit) - 1;

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    logger.error('Failed to list users', { error });
    throw new AppError('Failed to load team members', 500);
  }

  res.json({
    success: true,
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / parseInt(limit)),
    },
  });
});

// =============================================================================
// GET USER BY ID
// =============================================================================

/**
 * Get single user details
 * GET /users/:id
 * 
 * SECURITY: Admin only
 */
export const getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, phone, role, vendor_id, is_active, avatar_url, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: user,
  });
});

// =============================================================================
// CREATE NEW USER
// =============================================================================

/**
 * Create new staff member
 * POST /users
 * 
 * SECURITY: Admin only
 * 
 * Uses Supabase Admin API to:
 * 1. Create auth user (bypassing email verification)
 * 2. Insert profile into public.users
 */
export const createUser = asyncHandler(async (req, res) => {
  // Validate input
  const validationResult = createUserSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new AppError(validationResult.error.errors[0].message, 400);
  }

  const { email, password, name, phone, role, department } = validationResult.data;
  const adminId = req.user?.id;

  logger.info('Creating new user', { email, role, createdBy: adminId });

  // Check if email already exists
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    throw new AppError('A user with this email already exists', 409, 'EMAIL_EXISTS');
  }

  // Step 1: Create auth user using Supabase Admin API
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Skip email verification for staff
    user_metadata: {
      name,
      role,
    },
  });

  if (authError) {
    logger.error('Supabase Auth createUser failed', { error: authError });
    
    if (authError.message.includes('already been registered')) {
      throw new AppError('This email is already registered', 409, 'EMAIL_EXISTS');
    }
    
    throw new AppError('Failed to create user account', 500);
  }

  const authUserId = authData.user.id;

  // Step 2: Insert profile into public.users table
  const { data: userProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authUserId, // Use same ID as auth user
      email,
      name,
      phone: phone || null,
      role,
      department: department || null,
      is_active: true,
      created_by: adminId,
      password_hash: 'managed_by_supabase_auth', // Placeholder
    })
    .select()
    .single();

  if (profileError) {
    // Rollback: Delete auth user
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    
    logger.error('Failed to create user profile, rolled back auth user', { error: profileError });
    throw new AppError('Failed to create user profile', 500);
  }

  // Step 3: Log activity
  await supabaseAdmin.from('user_activity_log').insert({
    user_id: authUserId,
    action: 'created',
    performed_by: adminId,
    new_value: { email, name, role },
  });

  logger.info('User created successfully', { userId: authUserId, email, role });

  res.status(201).json({
    success: true,
    message: 'Team member created successfully',
    data: userProfile,
  });
});

// =============================================================================
// UPDATE USER
// =============================================================================

/**
 * Update user details
 * PATCH /users/:id
 * 
 * SECURITY: Admin only
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  // Validate input
  const validationResult = updateUserSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new AppError(validationResult.error.errors[0].message, 400);
  }

  const updateData = validationResult.data;

  // Get current user data
  const { data: currentUser, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('id, email, name, phone, role, vendor_id, is_active, avatar_url, created_at, updated_at')
    .eq('id', id)
    .single();

  if (fetchError || !currentUser) {
    throw new AppError('User not found', 404);
  }

  // Prevent role change for admins (protection)
  if (currentUser.role === 'admin' && updateData.role && updateData.role !== 'admin') {
    throw new AppError('Cannot change admin role', 403);
  }

  // Update user
  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      ...updateData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    throw new AppError('Failed to update user', 500);
  }

  // Log role change specifically
  if (updateData.role && updateData.role !== currentUser.role) {
    await supabaseAdmin.from('user_activity_log').insert({
      user_id: id,
      action: 'role_changed',
      performed_by: adminId,
      old_value: { role: currentUser.role },
      new_value: { role: updateData.role },
    });
  }

  logger.info('User updated', { userId: id, updatedBy: adminId });

  res.json({
    success: true,
    message: 'User updated successfully',
    data: updatedUser,
  });
});

// =============================================================================
// TOGGLE USER STATUS (ACTIVATE/DEACTIVATE)
// =============================================================================

/**
 * Toggle user active status
 * PATCH /users/:id/status
 * 
 * SECURITY: Admin only
 * 
 * When deactivating:
 * - Sets is_active = false in public.users
 * - Bans the user in Supabase Auth (prevents login)
 * 
 * When activating:
 * - Sets is_active = true
 * - Unbans the user in Supabase Auth
 */
export const toggleUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  // Cannot toggle your own status
  if (id === adminId) {
    throw new AppError('Cannot change your own status', 400);
  }

  // Get current user
  const { data: user, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('id, email, name, phone, role, vendor_id, is_active, avatar_url, created_at, updated_at')
    .eq('id', id)
    .single();

  if (fetchError || !user) {
    throw new AppError('User not found', 404);
  }

  // Cannot deactivate admin users (protection)
  if (user.role === 'admin') {
    throw new AppError('Cannot change admin user status', 403);
  }

  const newStatus = !user.is_active;

  // Step 1: Update public.users table
  const updateData = {
    is_active: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (!newStatus) {
    // Deactivating
    updateData.deactivated_at = new Date().toISOString();
    updateData.deactivated_by = adminId;
  } else {
    // Activating
    updateData.deactivated_at = null;
    updateData.deactivated_by = null;
  }

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('id', id);

  if (updateError) {
    throw new AppError('Failed to update user status', 500);
  }

  // Step 2: Ban/Unban in Supabase Auth
  if (newStatus) {
    // Unban user
    await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: 'none',
    });
  } else {
    // Ban user indefinitely
    await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: '876000h', // ~100 years (effectively permanent)
    });
  }

  // Step 3: Log activity
  await supabaseAdmin.from('user_activity_log').insert({
    user_id: id,
    action: newStatus ? 'reactivated' : 'deactivated',
    performed_by: adminId,
    old_value: { is_active: user.is_active },
    new_value: { is_active: newStatus },
  });

  logger.info('User status toggled', { 
    userId: id, 
    newStatus: newStatus ? 'active' : 'inactive',
    performedBy: adminId 
  });

  res.json({
    success: true,
    message: newStatus ? 'User activated successfully' : 'User deactivated successfully',
    data: { is_active: newStatus },
  });
});

// =============================================================================
// RESET USER PASSWORD
// =============================================================================

/**
 * Reset user password (Admin initiated)
 * POST /users/:id/reset-password
 * 
 * SECURITY: Admin only
 * 
 * Generates a password reset link or sets a temporary password
 */
export const resetUserPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;
  const adminId = req.user?.id;

  if (!new_password || new_password.length < 8) {
    throw new AppError('New password must be at least 8 characters', 400);
  }

  // Get user
  const { data: user, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('email, name')
    .eq('id', id)
    .single();

  if (fetchError || !user) {
    throw new AppError('User not found', 404);
  }

  // Update password in Supabase Auth
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
    password: new_password,
  });

  if (authError) {
    logger.error('Failed to reset password', { userId: id, error: authError });
    throw new AppError('Failed to reset password', 500);
  }

  // Log activity
  await supabaseAdmin.from('user_activity_log').insert({
    user_id: id,
    action: 'password_reset',
    performed_by: adminId,
  });

  logger.info('User password reset', { userId: id, performedBy: adminId });

  res.json({
    success: true,
    message: `Password reset for ${user.name}. Please share the new password securely.`,
  });
});

// =============================================================================
// DELETE USER (Soft Delete)
// =============================================================================

/**
 * Delete user (soft delete - deactivate)
 * DELETE /users/:id
 * 
 * SECURITY: Admin only
 * 
 * This is a soft delete - just deactivates the user
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?.id;

  // Cannot delete yourself
  if (id === adminId) {
    throw new AppError('Cannot delete your own account', 400);
  }

  // Get user
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', id)
    .single();

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Cannot delete admin users
  if (user.role === 'admin') {
    throw new AppError('Cannot delete admin users', 403);
  }

  // Soft delete: Deactivate instead of hard delete
  await supabaseAdmin
    .from('users')
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivated_by: adminId,
    })
    .eq('id', id);

  // Ban in auth
  await supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: '876000h',
  });

  // Log
  await supabaseAdmin.from('user_activity_log').insert({
    user_id: id,
    action: 'deleted',
    performed_by: adminId,
  });

  logger.info('User deleted (soft)', { userId: id, deletedBy: adminId });

  res.json({
    success: true,
    message: 'User deleted successfully',
  });
});

// =============================================================================
// GET AVAILABLE ROLES
// =============================================================================

/**
 * Get list of available roles for dropdown
 * GET /users/roles
 * 
 * SECURITY: Admin only
 */
export const getRoles = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: ROLE_CONFIG,
  });
});

// =============================================================================
// GET USER ACTIVITY LOG
// =============================================================================

/**
 * Get activity log for a user
 * GET /users/:id/activity
 * 
 * SECURITY: Admin only
 */
export const getUserActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 20 } = req.query;

  const { data, error } = await supabaseAdmin
    .from('user_activity_log')
    .select(`
      *,
      performer:users!performed_by(id, name, email)
    `)
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .limit(parseInt(limit));

  if (error) {
    throw new AppError('Failed to load activity log', 500);
  }

  res.json({
    success: true,
    data,
  });
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  listUsers,
  getUser,
  createUser,
  updateUser,
  toggleUserStatus,
  resetUserPassword,
  deleteUser,
  getRoles,
  getUserActivity,
};
