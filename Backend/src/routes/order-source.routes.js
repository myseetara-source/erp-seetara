/**
 * Order Source Routes
 * 
 * CRUD endpoints for managing order sources (Facebook Pages / Brands).
 * 
 * Access Rules:
 * - GET /sources       : All authenticated (list active sources)
 * - GET /sources/:id   : All authenticated
 * - POST /sources      : Admin/Manager only
 * - PATCH /sources/:id : Admin/Manager only
 * - DELETE /sources/:id: Admin only
 */

import { Router } from 'express';
import {
  listOrderSources,
  getOrderSource,
  createOrderSource,
  updateOrderSource,
  deleteOrderSource,
} from '../controllers/order-source.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  orderSourceIdSchema,
  orderSourceListQuerySchema,
  createOrderSourceSchema,
  updateOrderSourceSchema,
} from '../validations/order-source.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// READ ROUTES (All authenticated users)
// =============================================================================

router.get(
  '/',
  validateQuery(orderSourceListQuerySchema),
  listOrderSources
);

router.get(
  '/:id',
  validateParams(orderSourceIdSchema),
  getOrderSource
);

// =============================================================================
// WRITE ROUTES (Admin/Manager only)
// =============================================================================

router.post(
  '/',
  authorize('admin', 'manager'),
  validateBody(createOrderSourceSchema),
  createOrderSource
);

router.patch(
  '/:id',
  authorize('admin', 'manager'),
  validateParams(orderSourceIdSchema),
  validateBody(updateOrderSourceSchema),
  updateOrderSource
);

router.delete(
  '/:id',
  authorize('admin'),
  validateParams(orderSourceIdSchema),
  deleteOrderSource
);

export default router;
