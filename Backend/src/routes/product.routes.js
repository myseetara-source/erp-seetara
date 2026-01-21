/**
 * Product & Variant Routes
 */

import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createProductSchema,
  updateProductSchema,
  productIdSchema,
  createVariantSchema,
  updateVariantSchema,
  variantIdSchema,
  skuParamSchema,
  stockAdjustmentSchema,
  bulkStockAdjustmentSchema,
  stockCheckSchema,
  productListQuerySchema,
  variantListQuerySchema,
} from '../validations/product.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// PRODUCT ROUTES
// =============================================================================

// Search products (must be before /:id to avoid conflict)
router.get('/search', productController.searchProducts);

// List products
router.get(
  '/',
  validateQuery(productListQuerySchema),
  productController.listProducts
);

// Create product (manager/admin)
router.post(
  '/',
  authorize('admin', 'manager'),
  validateBody(createProductSchema),
  productController.createProduct
);

// Get product by ID
router.get(
  '/:id',
  validateParams(productIdSchema),
  productController.getProduct
);

// Update product (manager/admin)
router.patch(
  '/:id',
  authorize('admin', 'manager'),
  validateParams(productIdSchema),
  validateBody(updateProductSchema),
  productController.updateProduct
);

// Delete product (admin only)
router.delete(
  '/:id',
  authorize('admin'),
  validateParams(productIdSchema),
  productController.deleteProduct
);

// Toggle product status
router.patch(
  '/:id/toggle-status',
  authorize('admin', 'manager'),
  validateParams(productIdSchema),
  productController.toggleProductStatus
);

export default router;
