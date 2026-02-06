/**
 * Brand Routes
 * 
 * Full CRUD for product brand management.
 * 
 * GET    /api/v1/brands       - List all brands (authenticated)
 * GET    /api/v1/brands/:id   - Get single brand (authenticated)
 * POST   /api/v1/brands       - Create brand (admin/manager)
 * PATCH  /api/v1/brands/:id   - Update brand (admin/manager)
 * DELETE /api/v1/brands/:id   - Delete brand (admin)
 */

import { Router } from 'express';
import * as brandController from '../controllers/brand.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  brandIdSchema,
  brandListQuerySchema,
  createBrandSchema,
  updateBrandSchema,
} from '../validations/brand.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// BRAND ROUTES
// =============================================================================

// List brands (all authenticated users)
router.get(
  '/',
  validateQuery(brandListQuerySchema),
  brandController.listBrands
);

// Get single brand
router.get(
  '/:id',
  validateParams(brandIdSchema),
  brandController.getBrand
);

// Create brand (admin/manager)
router.post(
  '/',
  authorize('admin', 'manager'),
  validateBody(createBrandSchema),
  brandController.createBrand
);

// Update brand (admin/manager)
router.patch(
  '/:id',
  authorize('admin', 'manager'),
  validateParams(brandIdSchema),
  validateBody(updateBrandSchema),
  brandController.updateBrand
);

// Delete brand (admin only)
router.delete(
  '/:id',
  authorize('admin'),
  validateParams(brandIdSchema),
  brandController.deleteBrand
);

export default router;
