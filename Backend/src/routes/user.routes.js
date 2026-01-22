/**
 * User Management Routes
 * 
 * SECURITY: ALL routes require admin authentication
 * 
 * These routes are for team management in the admin dashboard.
 * Regular users cannot access these endpoints.
 */

import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// =============================================================================
// ALL ROUTES REQUIRE ADMIN AUTHENTICATION
// =============================================================================

// Apply auth middleware to all routes
router.use(authenticate);
router.use(authorize('admin'));

// =============================================================================
// ROLE CONFIG (Static data for frontend)
// =============================================================================

/**
 * Get available roles
 * GET /users/roles
 */
router.get('/roles', userController.getRoles);

// =============================================================================
// USER CRUD
// =============================================================================

/**
 * List all team members
 * GET /users
 * Query: ?role=staff&is_active=true&search=john&page=1&limit=20
 */
router.get('/', userController.listUsers);

/**
 * Create new team member
 * POST /users
 * Body: { email, password, name, phone, role, department }
 */
router.post('/', userController.createUser);

/**
 * Get user by ID
 * GET /users/:id
 */
router.get('/:id', userController.getUser);

/**
 * Update user
 * PATCH /users/:id
 * Body: { name, phone, role, department }
 */
router.patch('/:id', userController.updateUser);

/**
 * Delete user (soft delete)
 * DELETE /users/:id
 */
router.delete('/:id', userController.deleteUser);

// =============================================================================
// USER ACTIONS
// =============================================================================

/**
 * Toggle user active status
 * PATCH /users/:id/status
 * 
 * Toggles between active/inactive
 * Also bans/unbans in Supabase Auth
 */
router.patch('/:id/status', userController.toggleUserStatus);

/**
 * Reset user password
 * POST /users/:id/reset-password
 * Body: { new_password }
 */
router.post('/:id/reset-password', userController.resetUserPassword);

/**
 * Get user activity log
 * GET /users/:id/activity
 */
router.get('/:id/activity', userController.getUserActivity);

export default router;
