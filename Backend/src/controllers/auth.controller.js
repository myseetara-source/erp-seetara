/**
 * Authentication Controller
 * Handles login, registration, and token management
 */

import bcrypt from 'bcrypt';
import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { generateTokens } from '../middleware/auth.middleware.js';
import { createLogger } from '../utils/logger.js';
import {
  AuthenticationError,
  ValidationError,
  ConflictError,
} from '../utils/errors.js';

const logger = createLogger('AuthController');

/**
 * User login
 * POST /auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !user) {
    throw new AuthenticationError('Invalid email or password');
  }

  if (!user.is_active) {
    throw new AuthenticationError('Account is deactivated');
  }

  // Verify password
  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Generate tokens
  const tokens = generateTokens(user);

  // Update last login
  await supabaseAdmin
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', user.id);

  logger.info('User logged in', { userId: user.id, email: user.email });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    },
  });
});

/**
 * Register new user (admin only)
 * POST /auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const { email, password, name, role, phone, vendor_id } = req.body;

  // Check if email exists
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (existing) {
    throw new ConflictError('Email already registered');
  }

  // Hash password
  const saltRounds = 10;
  const password_hash = await bcrypt.hash(password, saltRounds);

  // Create user
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .insert({
      email: email.toLowerCase(),
      password_hash,
      name,
      role: role || 'operator',
      phone,
      vendor_id,
    })
    .select('id, email, name, role')
    .single();

  if (error) {
    logger.error('Failed to create user', { error });
    throw new ValidationError('Failed to create user');
  }

  logger.info('User registered', { userId: user.id, email: user.email, role: user.role });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: user,
  });
});

/**
 * Refresh access token
 * POST /auth/refresh
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw new ValidationError('Refresh token required');
  }

  try {
    // Verify refresh token
    const jwt = await import('jsonwebtoken');
    const config = (await import('../config/index.js')).default;
    
    const decoded = jwt.default.verify(token, config.jwt.secret);

    // Get user
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, vendor_id, is_active')
      .eq('id', decoded.userId)
      .single();

    if (error || !user || !user.is_active) {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }
});

/**
 * Get current user profile
 * GET /auth/me
 */
export const getMe = asyncHandler(async (req, res) => {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, phone, vendor_id, last_login, created_at')
    .eq('id', req.user.id)
    .single();

  if (error || !user) {
    throw new AuthenticationError('User not found');
  }

  res.json({
    success: true,
    data: user,
  });
});

/**
 * Update password
 * POST /auth/change-password
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, password_hash')
    .eq('id', req.user.id)
    .single();

  if (error || !user) {
    throw new AuthenticationError('User not found');
  }

  // Verify current password
  const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
  if (!validPassword) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Hash new password
  const saltRounds = 10;
  const password_hash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await supabaseAdmin
    .from('users')
    .update({ password_hash })
    .eq('id', req.user.id);

  logger.info('Password changed', { userId: req.user.id });

  res.json({
    success: true,
    message: 'Password changed successfully',
  });
});

/**
 * Logout (client-side only, but log for audit)
 * POST /auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  logger.info('User logged out', { userId: req.user.id });

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * Verify current user's password
 * POST /auth/verify-password
 * 
 * Used for "Secure Action Gate" - before critical actions like:
 * - Deleting vendors/products
 * - Adding admin users
 * - Viewing sensitive financial data
 * 
 * Rate Limited: Max 5 attempts per minute per user
 */
export const verifyPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    throw new ValidationError('Password is required');
  }

  // Get current user's password hash
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, password_hash, email, name')
    .eq('id', req.user.id)
    .single();

  if (error || !user) {
    throw new AuthenticationError('User not found');
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) {
    logger.warn('Password verification failed', { 
      userId: req.user.id, 
      email: user.email,
      action: 'secure_action_gate' 
    });

    // Return 200 with valid: false (don't throw to avoid leaking info)
    return res.json({
      success: true,
      data: {
        valid: false,
        message: 'Incorrect password',
      },
    });
  }

  logger.info('Password verified for secure action', { 
    userId: req.user.id,
    email: user.email 
  });

  res.json({
    success: true,
    data: {
      valid: true,
      message: 'Password verified',
      // Optionally: Return a short-lived "sudo token" for multiple actions
      // sudoToken: generateSudoToken(user.id), // 5 min validity
    },
  });
});

export default {
  login,
  register,
  refreshToken,
  getMe,
  changePassword,
  logout,
  verifyPassword,
};
