/**
 * Stock Management Routes
 */

import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  stockAdjustmentSchema,
  bulkStockAdjustmentSchema,
  stockCheckSchema,
} from '../validations/product.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Check stock availability
router.post(
  '/check',
  validateBody(stockCheckSchema),
  productController.checkStock
);

// Get low stock alerts
router.get(
  '/alerts',
  productController.getStockAlerts
);

// Adjust stock (manager/admin)
router.post(
  '/adjust',
  authorize('admin', 'manager'),
  validateBody(stockAdjustmentSchema),
  productController.adjustStock
);

// Bulk stock adjustment (manager/admin)
router.post(
  '/adjust/bulk',
  authorize('admin', 'manager'),
  validateBody(bulkStockAdjustmentSchema),
  productController.bulkAdjustStock
);

export default router;
