/**
 * Category Routes
 * 
 * Full CRUD for product category management.
 * 
 * GET    /api/v1/categories       - List all categories (authenticated)
 * GET    /api/v1/categories/:id   - Get single category (authenticated)
 * POST   /api/v1/categories       - Create category (admin/manager)
 * PATCH  /api/v1/categories/:id   - Update category (admin/manager)
 * DELETE /api/v1/categories/:id   - Delete category (admin)
 */

import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  categoryIdSchema,
  categoryListQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from '../validations/category.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// CATEGORY ROUTES
// =============================================================================

// List categories (all authenticated users)
router.get(
  '/',
  validateQuery(categoryListQuerySchema),
  categoryController.listCategories
);

// Get single category
router.get(
  '/:id',
  validateParams(categoryIdSchema),
  categoryController.getCategory
);

// Create category (admin/manager)
router.post(
  '/',
  authorize('admin', 'manager'),
  validateBody(createCategorySchema),
  categoryController.createCategory
);

// Update category (admin/manager)
router.patch(
  '/:id',
  authorize('admin', 'manager'),
  validateParams(categoryIdSchema),
  validateBody(updateCategorySchema),
  categoryController.updateCategory
);

// Delete category (admin only)
router.delete(
  '/:id',
  authorize('admin'),
  validateParams(categoryIdSchema),
  categoryController.deleteCategory
);

export default router;
