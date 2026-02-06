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
  productSearchQuerySchema,
} from '../validations/product.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// PRODUCT ROUTES
// =============================================================================

// Search products (must be before /:id to avoid conflict)
// Validated with: q (optional), limit (default 15), mode (default 'SALES')
router.get(
  '/search',
  validateQuery(productSearchQuerySchema),
  productController.searchProducts
);

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

/**
 * Get product variants (Lazy Loading - PERF-002)
 * GET /products/:id/variants
 * 
 * Returns full variant data for a specific product.
 * Use this for lazy loading when user expands/selects a product.
 * 
 * @query mode - 'SALES' (only in-stock) | 'INVENTORY' (all variants)
 */
router.get(
  '/:id/variants',
  validateParams(productIdSchema),
  productController.getProductVariants
);

/**
 * Get product stock configuration (for Low Stock Alert settings)
 * GET /products/:id/stock-config
 * 
 * Returns product with all variants and their reorder_level settings.
 * SECURITY: Admin only
 */
router.get(
  '/:id/stock-config',
  authorize('admin'),
  validateParams(productIdSchema),
  productController.getProductStockConfig
);

/**
 * Update reorder levels for product variants (Low Stock Alert)
 * PATCH /products/:id/reorder-levels
 * 
 * Sets the minimum stock threshold for low stock alerts.
 * SECURITY: Admin only
 */
router.patch(
  '/:id/reorder-levels',
  authorize('admin'),
  validateParams(productIdSchema),
  productController.updateReorderLevels
);

export default router;
