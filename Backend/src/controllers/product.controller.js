/**
 * Product Controller
 * 
 * SECURITY: Implements "Operational vs. Financial" separation.
 * 
 * Data Visibility:
 * - Staff: Can see product info, variants, selling_price, stock
 *          CANNOT see: cost_price, profit, margin
 * - Admin: Sees everything including cost_price
 * 
 * Handles HTTP requests for products and variants
 * Zero business logic - delegates to ProductService
 */

import { productService } from '../services/product.service.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { 
  maskSensitiveData, 
  maskProductFinancials,
  canSeeFinancials,
} from '../utils/dataMasking.js';

/**
 * Create a new product
 * POST /products
 * 
 * SECURITY: Admin only (product pricing involves cost data)
 */
export const createProduct = asyncHandler(async (req, res) => {
  // Log the incoming request body for debugging
  console.log('[ProductController] Create product request:', JSON.stringify(req.body, null, 2));
  
  try {
    const product = await productService.createProduct(req.body);
    const userRole = req.user?.role;

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: maskProductFinancials(product, userRole),
    });
  } catch (error) {
    console.error('[ProductController] Create product error:', error.message, error.details || '');
    throw error;
  }
});

/**
 * Get product by ID
 * GET /products/:id
 * 
 * SECURITY: All authenticated, cost_price masked for non-admins
 */
export const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  const userRole = req.user?.role;

  res.json({
    success: true,
    data: maskProductFinancials(product, userRole),
  });
});

/**
 * Update product
 * PATCH /products/:id
 * 
 * SECURITY: Admin only for pricing, others for non-financial fields
 */
export const updateProduct = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  
  // Non-admins cannot update pricing
  if (!canSeeFinancials(userRole)) {
    delete req.body.cost_price;
    delete req.body.buy_price;
    
    // Also strip from variants if present
    if (req.body.variants) {
      req.body.variants = req.body.variants.map(v => {
        const { cost_price, buy_price, ...rest } = v;
        return rest;
      });
    }
  }

  const product = await productService.updateProduct(req.params.id, req.body);

  res.json({
    success: true,
    message: 'Product updated successfully',
    data: maskProductFinancials(product, userRole),
  });
});

/**
 * List products with filters
 * GET /products
 * 
 * SECURITY: All authenticated, cost_price masked for non-admins
 */
export const listProducts = asyncHandler(async (req, res) => {
  const result = await productService.listProducts(req.query);
  const userRole = req.user?.role;

  // Mask cost data for non-admin users
  const maskedData = canSeeFinancials(userRole) 
    ? result.data 
    : result.data.map(p => maskProductFinancials(p, userRole));

  res.json({
    success: true,
    data: maskedData,
    pagination: result.pagination,
    _meta: {
      dataLevel: canSeeFinancials(userRole) ? 'full' : 'operational',
    },
  });
});

/**
 * Search products with variants
 * GET /products/search?q=query&limit=10&include_variants=true
 * 
 * Used by Order Form to search products
 */
export const searchProducts = asyncHandler(async (req, res) => {
  const { q, limit = 10, include_variants = 'true' } = req.query;
  
  if (!q || q.length < 2) {
    return res.json({
      success: true,
      data: [],
    });
  }

  const result = await productService.listProducts({
    search: q,
    limit: parseInt(limit, 10),
    page: 1,
    is_active: true,
  });

  const userRole = req.user?.role;

  // If include_variants, fetch variants for each product
  let productsWithVariants = result.data;
  
  if (include_variants === 'true' || include_variants === true) {
    productsWithVariants = await Promise.all(
      result.data.map(async (product) => {
        const variantsResult = await productService.listVariants({
          product_id: product.id,
          is_active: true,
          limit: 50,
        });
        
        return {
          ...product,
          variants: variantsResult.data || [],
        };
      })
    );
  }

  // Mask cost data for non-admin users
  const maskedData = canSeeFinancials(userRole)
    ? productsWithVariants
    : productsWithVariants.map(p => maskProductFinancials(p, userRole));

  res.json({
    success: true,
    data: maskedData,
  });
});

/**
 * Delete product (soft delete)
 * DELETE /products/:id
 * 
 * SECURITY: Admin only
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);

  res.json({
    success: true,
    message: 'Product deleted successfully',
  });
});

/**
 * Toggle product active status
 * PATCH /products/:id/toggle-status
 */
export const toggleProductStatus = asyncHandler(async (req, res) => {
  const product = await productService.toggleStatus(req.params.id);
  const userRole = req.user?.role;

  res.json({
    success: true,
    message: `Product ${product.is_active ? 'activated' : 'deactivated'} successfully`,
    data: maskProductFinancials(product, userRole),
  });
});

// =============================================================================
// VARIANT ENDPOINTS
// =============================================================================

/**
 * Create a new variant
 * POST /variants
 * 
 * SECURITY: Admin only (involves cost pricing)
 */
export const createVariant = asyncHandler(async (req, res) => {
  const variant = await productService.createVariant(req.body);
  const userRole = req.user?.role;

  res.status(201).json({
    success: true,
    message: 'Variant created successfully',
    data: maskProductFinancials(variant, userRole),
  });
});

/**
 * Get variant by ID
 * GET /variants/:id
 * 
 * SECURITY: All authenticated, cost_price masked for non-admins
 */
export const getVariant = asyncHandler(async (req, res) => {
  const variant = await productService.getVariantById(req.params.id);
  const userRole = req.user?.role;

  res.json({
    success: true,
    data: maskProductFinancials(variant, userRole),
  });
});

/**
 * Get variant by SKU
 * GET /variants/sku/:sku
 * 
 * SECURITY: All authenticated, cost_price masked for non-admins
 */
export const getVariantBySku = asyncHandler(async (req, res) => {
  const variant = await productService.getVariantBySku(req.params.sku);
  const userRole = req.user?.role;

  res.json({
    success: true,
    data: maskProductFinancials(variant, userRole),
  });
});

/**
 * Update variant
 * PATCH /variants/:id
 * 
 * SECURITY: Admin for pricing, others for non-financial fields
 */
export const updateVariant = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  
  // Non-admins cannot update cost pricing
  if (!canSeeFinancials(userRole)) {
    delete req.body.cost_price;
    delete req.body.buy_price;
  }

  const variant = await productService.updateVariant(req.params.id, req.body);

  res.json({
    success: true,
    message: 'Variant updated successfully',
    data: maskProductFinancials(variant, userRole),
  });
});

/**
 * List variants with filters
 * GET /variants
 * 
 * SECURITY: All authenticated, cost_price masked for non-admins
 */
export const listVariants = asyncHandler(async (req, res) => {
  const result = await productService.listVariants(req.query);
  const userRole = req.user?.role;

  const maskedData = canSeeFinancials(userRole)
    ? result.data
    : result.data.map(v => maskProductFinancials(v, userRole));

  res.json({
    success: true,
    data: maskedData,
    pagination: result.pagination,
  });
});

// =============================================================================
// STOCK MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * Check stock availability
 * POST /stock/check
 * 
 * SECURITY: All authenticated (operational data)
 */
export const checkStock = asyncHandler(async (req, res) => {
  const result = await productService.checkStock(req.body.items);

  res.json({
    success: true,
    data: result,
  });
});

/**
 * Adjust stock manually
 * POST /stock/adjust
 * 
 * SECURITY: All authenticated for operational adjustments
 * Financial impact hidden from non-admins
 */
export const adjustStock = asyncHandler(async (req, res) => {
  const movement = await productService.adjustStock(req.body, req.user?.id);
  const userRole = req.user?.role;

  // Hide cost data from non-admins
  const responseData = canSeeFinancials(userRole)
    ? movement
    : { 
        ...movement, 
        cost_at_movement: undefined,
        financial_impact: undefined,
      };

  res.json({
    success: true,
    message: 'Stock adjusted successfully', // Generic message for all
    data: responseData,
  });
});

/**
 * Bulk stock adjustment
 * POST /stock/adjust/bulk
 */
export const bulkAdjustStock = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  const results = {
    success: [],
    failed: [],
  };

  for (const adjustment of req.body.adjustments) {
    try {
      const movement = await productService.adjustStock(adjustment, req.user?.id);
      
      // Mask financial data
      const maskedMovement = canSeeFinancials(userRole)
        ? movement
        : { ...movement, cost_at_movement: undefined };
      
      results.success.push({ variant_id: adjustment.variant_id, movement: maskedMovement });
    } catch (error) {
      results.failed.push({
        variant_id: adjustment.variant_id,
        error: error.message,
      });
    }
  }

  res.json({
    success: true,
    message: `Processed ${results.success.length} adjustments, ${results.failed.length} failed`,
    data: results,
  });
});

/**
 * Get low stock alerts
 * GET /stock/alerts
 * 
 * SECURITY: All authenticated (operational alert)
 */
export const getStockAlerts = asyncHandler(async (req, res) => {
  const alerts = await productService.getLowStockAlerts();
  const userRole = req.user?.role;

  // Mask cost data in alerts
  const maskedAlerts = canSeeFinancials(userRole)
    ? alerts
    : alerts.map(a => {
        const { cost_price, ...rest } = a;
        return rest;
      });

  res.json({
    success: true,
    data: maskedAlerts,
  });
});

/**
 * Get stock movements for a variant
 * GET /variants/:id/movements
 * 
 * SECURITY: All authenticated, cost data masked for non-admins
 */
export const getStockMovements = asyncHandler(async (req, res) => {
  const result = await productService.getStockMovements(req.params.id, req.query);
  const userRole = req.user?.role;

  const maskedData = canSeeFinancials(userRole)
    ? result.data
    : result.data.map(m => {
        const { cost_at_movement, ...rest } = m;
        return rest;
      });

  res.json({
    success: true,
    data: maskedData,
    pagination: result.pagination,
  });
});

export default {
  // Products
  createProduct,
  getProduct,
  updateProduct,
  listProducts,
  deleteProduct,
  toggleProductStatus,
  // Variants
  createVariant,
  getVariant,
  getVariantBySku,
  updateVariant,
  listVariants,
  // Stock
  checkStock,
  adjustStock,
  bulkAdjustStock,
  getStockAlerts,
  getStockMovements,
};
