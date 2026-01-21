/**
 * Product Variant Routes
 */

import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createVariantSchema,
  updateVariantSchema,
  variantIdSchema,
  skuParamSchema,
  variantListQuerySchema,
} from '../validations/product.validation.js';
import { paginationSchema } from '../validations/common.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List variants
router.get(
  '/',
  validateQuery(variantListQuerySchema),
  productController.listVariants
);

// Create variant (manager/admin)
router.post(
  '/',
  authorize('admin', 'manager'),
  validateBody(createVariantSchema),
  productController.createVariant
);

// Get variant by ID
router.get(
  '/:id',
  validateParams(variantIdSchema),
  productController.getVariant
);

// Get variant by SKU
router.get(
  '/sku/:sku',
  validateParams(skuParamSchema),
  productController.getVariantBySku
);

// Update variant (manager/admin)
router.patch(
  '/:id',
  authorize('admin', 'manager'),
  validateParams(variantIdSchema),
  validateBody(updateVariantSchema),
  productController.updateVariant
);

// Get stock movements for variant
router.get(
  '/:id/movements',
  validateParams(variantIdSchema),
  validateQuery(paginationSchema),
  productController.getStockMovements
);

export default router;
