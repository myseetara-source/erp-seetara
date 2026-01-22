/**
 * Admin Routes
 * 
 * SECURITY: All routes require admin role
 * Uses Service Role Key for privileged operations
 */

import { Router } from 'express';
import * as adminUserController from '../controllers/admin/user.controller.js';
import * as adminProductController from '../controllers/admin/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All admin routes require authentication and admin/manager role
router.use(authenticate);

// =============================================================================
// USER MANAGEMENT (Admin only)
// =============================================================================

/**
 * List all users
 * GET /api/v1/admin/users
 */
router.get('/users', authorize('admin'), adminUserController.listUsers);

/**
 * Get user by ID
 * GET /api/v1/admin/users/:id
 */
router.get('/users/:id', authorize('admin'), adminUserController.getUser);

/**
 * Create new user
 * POST /api/v1/admin/users
 */
router.post('/users', authorize('admin'), adminUserController.createUser);

/**
 * Update user
 * PATCH /api/v1/admin/users/:id
 */
router.patch('/users/:id', authorize('admin'), adminUserController.updateUser);

/**
 * Delete (deactivate) user
 * DELETE /api/v1/admin/users/:id
 */
router.delete('/users/:id', authorize('admin'), adminUserController.deleteUser);

// =============================================================================
// PRODUCT CHANGE REQUESTS (Admin/Manager)
// =============================================================================

/**
 * List change requests
 * GET /api/v1/admin/products/change-requests
 */
router.get(
  '/products/change-requests',
  authorize('admin', 'manager'),
  adminProductController.listChangeRequests
);

/**
 * Create change request (Non-admin users)
 * POST /api/v1/admin/products/change-requests
 */
router.post(
  '/products/change-requests',
  adminProductController.createChangeRequest
);

/**
 * Get change request details
 * GET /api/v1/admin/products/change-requests/:id
 */
router.get(
  '/products/change-requests/:id',
  adminProductController.getChangeRequest
);

/**
 * Review (approve/reject) change request
 * PATCH /api/v1/admin/products/change-requests/:id
 */
router.patch(
  '/products/change-requests/:id',
  authorize('admin'),
  adminProductController.reviewChangeRequest
);

export default router;
