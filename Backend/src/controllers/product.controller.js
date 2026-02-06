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
import { sanitizeSearchInput } from '../utils/helpers.js';
import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { 
  maskSensitiveData, 
  maskProductFinancials,
  canSeeFinancials,
} from '../utils/dataMasking.js';
import { createLogger } from '../utils/logger.js';
import { buildSafeOrQuery } from '../utils/helpers.js';

const logger = createLogger('ProductController');

/**
 * Create a new product
 * POST /products
 * 
 * SECURITY: Admin only (product pricing involves cost data)
 */
export const createProduct = asyncHandler(async (req, res) => {
  // Log the incoming request body for debugging (debug level only)
  logger.debug('Create product request', { name: req.body?.name });
  
  try {
    const product = await productService.createProduct(req.body);
    const userRole = req.user?.role;

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: maskProductFinancials(product, userRole),
    });
  } catch (error) {
    logger.error('[ProductController] Create product error:', error.message, error.details || '');
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
 * GET /products/search?q=query&limit=10&mode=FULL
 * 
 * Search Modes:
 * - mode=SALES (default): Returns lightweight product summary with stats
 * - mode=FULL: Returns complete product data with all variants
 * 
 * Search fields: name, brand, SKU (from variants)
 * 
 * Used by Order Form to search products
 */
/**
 * Smart Product Search API (v3 - OPTIMIZED)
 * GET /products/search?q=query&limit=15&mode=SALES|INVENTORY|FULL
 * 
 * PERFORMANCE OPTIMIZATION (PERF-002):
 * - Default: Returns lightweight product summaries with variant_count
 * - mode=FULL: Returns full variant data (for backwards compatibility)
 * - Use GET /products/:id/variants for lazy loading full variant data
 * 
 * Payload reduction: ~80% smaller (50 variants × 15 fields → summary stats)
 * 
 * CONTEXT-AWARE SEARCH:
 * - mode=SALES: Only products with stock > 0 (for Order Forms)
 * - mode=INVENTORY: All active products even with 0 stock (for Purchase/Transactions)
 * - mode=FULL: Full variant data (legacy mode for backwards compatibility)
 */
export const searchProducts = asyncHandler(async (req, res) => {
  const { 
    q, 
    limit = 15, 
    mode = 'SALES', // SALES | INVENTORY | FULL
  } = req.query;

  const userRole = req.user?.role;
  const limitNum = Math.min(parseInt(limit, 10) || 15, 50);
  const searchMode = (mode || 'SALES').toUpperCase();
  const hasQuery = q && q.trim().length >= 1;
  
  // FIX: Add logging for debugging product search
  logger.info('[Product Search] Request:', { q, mode: searchMode, limit: limitNum, userRole });

  // FULL MODE: Return complete variant data (legacy/backwards compatibility)
  if (searchMode === 'FULL') {
    return searchProductsFullMode(req, res, { limitNum, hasQuery, q });
  }

  // =========================================================================
  // OPTIMIZED QUERY: Product summary only (no variant join)
  // =========================================================================
  let query = supabaseAdmin
    .from('products')
    .select(`
      id,
      name,
      brand,
      image_url,
      category,
      shipping_inside,
      shipping_outside,
      is_active,
      created_at
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limitNum);

  if (hasQuery) {
    const safeQuery = buildSafeOrQuery(q.trim(), ['name', 'brand']);
    if (safeQuery) query = query.or(safeQuery);
  }

  const { data: products, error } = await query;

  if (error) {
    logger.error('[ProductSearch] Error:', error);
    return res.json({ success: true, data: [] });
  }

  // =========================================================================
  // GET VARIANT STATS (Single aggregated query instead of N+1)
  // =========================================================================
  const productIds = (products || []).map(p => p.id);
  const variantStats = new Map();
  
  if (productIds.length > 0) {
    const { data: variants } = await supabaseAdmin
      .from('product_variants')
      .select('product_id, current_stock, selling_price')
      .in('product_id', productIds)
      .eq('is_active', true);
    
    // Build stats map
    (variants || []).forEach(v => {
      const existing = variantStats.get(v.product_id) || { 
        variant_count: 0, 
        total_stock: 0, 
        in_stock_count: 0,
        min_price: Infinity,
        max_price: 0
      };
      existing.variant_count++;
      existing.total_stock += v.current_stock || 0;
      if (v.current_stock > 0) existing.in_stock_count++;
      existing.min_price = Math.min(existing.min_price, v.selling_price || 0);
      existing.max_price = Math.max(existing.max_price, v.selling_price || 0);
      variantStats.set(v.product_id, existing);
    });
  }

  // =========================================================================
  // BUILD LIGHTWEIGHT RESPONSE
  // =========================================================================
  let processedProducts = (products || []).map(product => {
    const stats = variantStats.get(product.id) || { 
      variant_count: 0, 
      total_stock: 0,
      in_stock_count: 0,
      min_price: 0,
      max_price: 0
    };
    
    // Fix infinity edge case
    if (stats.min_price === Infinity) stats.min_price = 0;
    
    return {
      ...product,
      variant_count: stats.variant_count,
      total_stock: stats.total_stock,
      in_stock_count: stats.in_stock_count,
      price_range: stats.min_price === stats.max_price 
        ? `रु. ${stats.min_price}` 
        : `रु. ${stats.min_price} - ${stats.max_price}`,
    };
  });

  // SALES mode: exclude products with no in-stock variants
  if (searchMode === 'SALES') {
    processedProducts = processedProducts.filter(p => p.in_stock_count > 0);
  }

  // =========================================================================
  // SKU SEARCH
  // =========================================================================
  if (hasQuery && q.trim().length >= 2) {
    const searchTerm = q.trim();
    const existingIds = new Set(processedProducts.map(p => p.id));

    // SECURITY: Sanitize search term to prevent SQL injection
    const sanitizedSearchTerm = sanitizeSearchInput(searchTerm);
    const { data: skuMatches } = await supabaseAdmin
      .from('product_variants')
      .select(`
        id, sku, current_stock, selling_price,
        product:products(id, name, brand, image_url, shipping_inside, shipping_outside, is_active)
      `)
      .eq('is_active', true)
      .ilike('sku', `%${sanitizedSearchTerm || ''}%`)
      .limit(10);

    if (skuMatches) {
      skuMatches.forEach(variant => {
        if (variant.product?.is_active && !existingIds.has(variant.product.id)) {
          if (searchMode === 'SALES' && variant.current_stock <= 0) return;
          
          existingIds.add(variant.product.id);
          processedProducts.push({
            ...variant.product,
            variant_count: 1,
            total_stock: variant.current_stock,
            in_stock_count: variant.current_stock > 0 ? 1 : 0,
            price_range: `रु. ${variant.selling_price}`,
            _matched_sku: variant.sku,
          });
        }
      });
    }
  }

  res.json({
    success: true,
    data: processedProducts,
    meta: { 
      mode: searchMode, 
      query: q || null, 
      count: processedProducts.length,
      _optimized: true,
    },
  });
});

/**
 * Search Products - FULL MODE (Legacy)
 * Returns complete variant data for backwards compatibility
 */
const searchProductsFullMode = async (req, res, { limitNum, hasQuery, q }) => {
  const searchMode = (req.query.mode || 'SALES').toUpperCase();
  const userRole = req.user?.role;
  
  // FIX: Search in both products table AND variants (by SKU)
  let productIds = new Set();
  
  // First, search in products table (name, brand)
  if (hasQuery) {
    const productQuery = supabaseAdmin
      .from('products')
      .select('id')
      .eq('is_active', true)
      .limit(limitNum);
    
    const safeProductQuery = buildSafeOrQuery(q.trim(), ['name', 'brand']);
    if (safeProductQuery) {
      productQuery.or(safeProductQuery);
    }
    
    const { data: productMatches } = await productQuery;
    (productMatches || []).forEach(p => productIds.add(p.id));
    
    // Second, search in variants table (SKU)
    const sanitizedQuery = q.trim();
    const variantQuery = supabaseAdmin
      .from('product_variants')
      .select('product_id')
      .eq('is_active', true)
      .ilike('sku', `%${sanitizedQuery}%`)
      .limit(limitNum);
    
    const { data: variantMatches } = await variantQuery;
    (variantMatches || []).forEach(v => productIds.add(v.product_id));
  }
  
  // Now fetch full product data with variants
  let query = supabaseAdmin
    .from('products')
    .select(`
      id, name, brand, image_url, category,
      shipping_inside, shipping_outside, is_active, created_at,
      variants:product_variants(
        id, sku, attributes, cost_price, selling_price, mrp,
        current_stock, damaged_stock, reserved_stock, reorder_level, is_active
      )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limitNum);

  // If we have search results, filter to those product IDs
  if (hasQuery && productIds.size > 0) {
    query = query.in('id', Array.from(productIds));
  }

  const { data: products, error } = await query;

  if (error) {
    logger.error('[ProductSearch] Error:', error);
    return res.json({ success: true, data: [] });
  }

  let processedProducts = (products || []).map(product => {
    let variants = (product.variants || []).filter(v => v.is_active);

    // FIX: SALES mode should filter by AVAILABLE stock (current - reserved), not just current_stock
    // This ensures products with all stock reserved don't show up in order forms
    if (searchMode === 'SALES') {
      variants = variants.filter(v => {
        const availableStock = (v.current_stock || 0) - (v.reserved_stock || 0);
        return availableStock > 0;
      });
    }

    // SECURITY: Mask cost_price for non-privileged roles (staff, operators, etc.)
    if (!canSeeFinancials(userRole)) {
      variants = variants.map(v => ({
        ...v,
        cost_price: undefined,
        damaged_stock: undefined,
      }));
    }

    return { ...product, variants };
  });

  if (searchMode === 'SALES') {
    processedProducts = processedProducts.filter(p => p.variants.length > 0);
  }

  res.json({
    success: true,
    data: processedProducts,
    meta: { mode: searchMode, query: q || null, count: processedProducts.length },
  });
};

/**
 * Get Product Variants (Lazy Loading - PERF-002)
 * GET /products/:id/variants
 * 
 * Returns full variant data for a specific product.
 * Use this for lazy loading when user expands/selects a product.
 * 
 * SECURITY: cost_price masked for non-admins
 */
export const getProductVariants = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { mode = 'SALES' } = req.query;
  const userRole = req.user?.role;
  const searchMode = (mode || 'SALES').toUpperCase();

  const { data: variants, error } = await supabaseAdmin
    .from('product_variants')
    .select(`
      id, sku, attributes, cost_price, selling_price, mrp,
      current_stock, damaged_stock, reserved_stock, reorder_level, is_active, created_at
    `)
    .eq('product_id', id)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[GetProductVariants] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch variants' });
  }

  let processedVariants = variants || [];

  // SALES mode: only variants with AVAILABLE stock (current - reserved)
  // FIX: Filter by available stock, not just current_stock
  if (searchMode === 'SALES') {
    processedVariants = processedVariants.filter(v => {
      const availableStock = (v.current_stock || 0) - (v.reserved_stock || 0);
      return availableStock > 0;
    });
  }

  // SECURITY: Mask financial data for non-privileged roles
  if (!canSeeFinancials(userRole)) {
    processedVariants = processedVariants.map(v => ({
      ...v,
      cost_price: undefined,
      damaged_stock: undefined,
    }));
  }

  // Set cache headers for performance (1 minute)
  res.set('Cache-Control', 'private, max-age=60');

  res.json({
    success: true,
    data: processedVariants,
    meta: { product_id: id, total: processedVariants.length, mode: searchMode },
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

/**
 * Update reorder levels for product variants
 * PATCH /products/:id/reorder-levels
 * 
 * SECURITY: Admin only - this is a configuration setting
 * 
 * Request body:
 * {
 *   variants: [
 *     { variant_id: "uuid", reorder_level: 10 },
 *     ...
 *   ]
 * }
 */
export const updateReorderLevels = asyncHandler(async (req, res) => {
  const { id: productId } = req.params;
  const { variants } = req.body;
  
  if (!variants || !Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'variants array is required with at least one variant',
    });
  }
  
  logger.info('[ProductController] Updating reorder levels', { 
    productId, 
    variantCount: variants.length 
  });
  
  const results = {
    updated: [],
    failed: [],
  };
  
  for (const item of variants) {
    const { variant_id, reorder_level } = item;
    
    if (!variant_id || reorder_level === undefined || reorder_level === null) {
      results.failed.push({ 
        variant_id, 
        error: 'variant_id and reorder_level are required' 
      });
      continue;
    }
    
    if (typeof reorder_level !== 'number' || reorder_level < 0) {
      results.failed.push({ 
        variant_id, 
        error: 'reorder_level must be a non-negative number' 
      });
      continue;
    }
    
    try {
      const { data, error } = await supabaseAdmin
        .from('product_variants')
        .update({ 
          reorder_level: Math.floor(reorder_level),
          updated_at: new Date().toISOString()
        })
        .eq('id', variant_id)
        .eq('product_id', productId)
        .select('id, sku, reorder_level')
        .single();
      
      if (error) {
        logger.error('[ProductController] Failed to update reorder level', { variant_id, error });
        results.failed.push({ variant_id, error: error.message });
      } else {
        results.updated.push(data);
      }
    } catch (err) {
      results.failed.push({ variant_id, error: err.message });
    }
  }
  
  const allSuccess = results.failed.length === 0;
  
  res.status(allSuccess ? 200 : 207).json({
    success: allSuccess,
    message: allSuccess 
      ? `Updated reorder levels for ${results.updated.length} variants`
      : `Updated ${results.updated.length} variants, ${results.failed.length} failed`,
    data: results,
  });
});

/**
 * Get product with variants including reorder levels
 * GET /products/:id/stock-config
 * 
 * Returns product with all variants and their reorder_level settings
 * SECURITY: Admin only
 */
export const getProductStockConfig = asyncHandler(async (req, res) => {
  const { id: productId } = req.params;
  
  // Fetch product with variants
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select(`
      id, name, image_url,
      variants:product_variants(
        id, sku, attributes, current_stock, reorder_level, is_active
      )
    `)
    .eq('id', productId)
    .single();
  
  if (productError) {
    logger.error('[ProductController] Failed to fetch product stock config', productError);
    return res.status(404).json({
      success: false,
      message: 'Product not found',
    });
  }
  
  // Filter to only active variants
  product.variants = (product.variants || []).filter(v => v.is_active);
  
  res.json({
    success: true,
    data: product,
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
  // Reorder Level (Low Stock Alert)
  updateReorderLevels,
  getProductStockConfig,
};
