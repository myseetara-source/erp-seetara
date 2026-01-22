/**
 * Static Data Controller
 * 
 * Handles cacheable endpoints for rarely-changing data:
 * - Categories
 * - Brands  
 * - Delivery Zones
 * - Order Statuses
 * - Payment Methods
 * - App Config
 * 
 * DESIGN: These are "reference data" endpoints that rarely change.
 * Frontend should cache these aggressively.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { catchAsync } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
import config from '../config/index.js';
import { CACHE_DURATION } from '../middleware/cache.middleware.js';

const logger = createLogger('StaticController');

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * Get all product categories
 * GET /categories or /static/categories
 */
export const getCategories = catchAsync(async (req, res) => {
  const { search, limit = 100 } = req.query;

  // Try to get from dedicated categories table first
  let query = supabaseAdmin
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(Number(limit));

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;

  if (!error && data && data.length > 0) {
    return res.json({
      success: true,
      data: data.map(c => c.name),
      meta: { count: data.length, source: 'categories_table', cache_ttl: CACHE_DURATION?.LONG || 3600 },
    });
  }

  // Fallback: Extract unique categories from products
  logger.debug('Categories table not available, falling back to products');
  
  const { data: products, error: productsError } = await supabaseAdmin
    .from('products')
    .select('category')
    .eq('is_active', true)
    .not('category', 'is', null);

  if (productsError) {
    logger.error('Failed to fetch categories', { error: productsError });
    return res.json({ success: true, data: [] });
  }

  const categories = [...new Set((products || []).map(p => p.category).filter(Boolean))].sort();

  res.json({
    success: true,
    data: categories,
    meta: { count: categories.length, source: 'products_table', cache_ttl: CACHE_DURATION?.LONG || 3600 },
  });
});

/**
 * Create a new category
 * POST /categories
 */
export const createCategory = catchAsync(async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Category name is required (minimum 2 characters)',
    });
  }

  const { data, error } = await supabaseAdmin
    .from('categories')
    .upsert({ name: name.trim(), is_active: true }, { onConflict: 'name' })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create category', { error, name });
    return res.status(500).json({
      success: false,
      error: 'Failed to create category',
    });
  }

  res.status(201).json({
    success: true,
    data,
    message: 'Category created successfully',
  });
});

// =============================================================================
// BRANDS
// =============================================================================

/**
 * Get all product brands
 * GET /brands or /static/brands
 */
export const getBrands = catchAsync(async (req, res) => {
  const { search, limit = 100 } = req.query;

  // Try to get from dedicated brands table first
  let query = supabaseAdmin
    .from('brands')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(Number(limit));

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;

  if (!error && data && data.length > 0) {
    return res.json({
      success: true,
      data: data.map(b => b.name),
      meta: { count: data.length, source: 'brands_table', cache_ttl: CACHE_DURATION?.LONG || 3600 },
    });
  }

  // Fallback: Extract unique brands from products
  logger.debug('Brands table not available, falling back to products');

  const { data: products, error: productsError } = await supabaseAdmin
    .from('products')
    .select('brand')
    .eq('is_active', true)
    .not('brand', 'is', null);

  if (productsError) {
    logger.error('Failed to fetch brands', { error: productsError });
    return res.json({ success: true, data: [] });
  }

  const brands = [...new Set((products || []).map(p => p.brand).filter(Boolean))].sort();

  res.json({
    success: true,
    data: brands,
    meta: { count: brands.length, source: 'products_table', cache_ttl: CACHE_DURATION?.LONG || 3600 },
  });
});

/**
 * Create a new brand
 * POST /brands
 */
export const createBrand = catchAsync(async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Brand name is required (minimum 2 characters)',
    });
  }

  const { data, error } = await supabaseAdmin
    .from('brands')
    .upsert({ name: name.trim(), is_active: true }, { onConflict: 'name' })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create brand', { error, name });
    return res.status(500).json({
      success: false,
      error: 'Failed to create brand',
    });
  }

  res.status(201).json({
    success: true,
    data,
    message: 'Brand created successfully',
  });
});

// =============================================================================
// DELIVERY ZONES
// =============================================================================

/**
 * Get all delivery zones
 * GET /static/delivery-zones
 */
export const getDeliveryZones = catchAsync(async (req, res) => {
  const { data: zones, error } = await supabaseAdmin
    .from('delivery_zones')
    .select('id, name, type, base_charge, per_kg_charge, is_active')
    .eq('is_active', true)
    .order('name');

  if (error) {
    logger.error('Failed to fetch delivery zones', { error });
    return res.json({ success: true, data: [] });
  }

  res.json({
    success: true,
    data: zones || [],
    meta: { count: zones?.length || 0, cache_ttl: CACHE_DURATION?.LONG || 3600 },
  });
});

// =============================================================================
// STATIC ENUMS (No database needed)
// =============================================================================

/**
 * Get fulfillment type options
 * GET /static/fulfillment-types
 */
export const getFulfillmentTypes = (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'inside_valley', label: 'Inside Valley', description: 'Kathmandu Valley - Same day delivery' },
      { value: 'outside_valley', label: 'Outside Valley', description: 'Outside Kathmandu - 3-7 days' },
      { value: 'store', label: 'Store Pickup', description: 'Customer picks up from store' },
    ],
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get order status configuration
 * GET /static/order-statuses
 */
export const getOrderStatuses = (req, res) => {
  res.json({
    success: true,
    data: config.orderStatuses,
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get order status transitions (State Machine)
 * GET /static/status-transitions
 */
export const getStatusTransitions = (req, res) => {
  res.json({
    success: true,
    data: config.statusTransitions,
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get available payment methods
 * GET /static/payment-methods
 */
export const getPaymentMethods = (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'cod', label: 'Cash on Delivery', icon: 'cash' },
      { value: 'esewa', label: 'eSewa', icon: 'wallet' },
      { value: 'khalti', label: 'Khalti', icon: 'wallet' },
      { value: 'bank_transfer', label: 'Bank Transfer', icon: 'bank' },
      { value: 'cash', label: 'Cash', icon: 'cash' },
    ],
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get order source options
 * GET /static/order-sources
 */
export const getOrderSources = (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'manual', label: 'Manual Entry' },
      { value: 'website', label: 'Website' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'store', label: 'Store Walk-in' },
      { value: 'todaytrend', label: 'Today Trend' },
      { value: 'seetara', label: 'Seetara' },
    ],
    meta: { cache_ttl: CACHE_DURATION?.STATIC || 86400 },
  });
};

/**
 * Get app configuration
 * GET /static/app-config
 */
export const getAppConfig = (req, res) => {
  res.json({
    success: true,
    data: {
      company: {
        name: 'Seetara / Today Trend',
        currency: 'NPR',
        country: 'Nepal',
      },
      shipping: {
        defaultInsideValley: 100,
        defaultOutsideValley: 150,
        storePickup: 0,
      },
      inventory: {
        lowStockThreshold: 10,
        reorderLevel: 5,
      },
      features: {
        smsEnabled: process.env.SMS_ENABLED === 'true',
        metaCAPIEnabled: !!process.env.FB_PIXEL_ID,
      },
    },
    meta: { cache_ttl: 300 },
  });
};

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * API Health Check
 * GET /health
 */
export const getHealthStatus = (req, res) => {
  res.json({
    success: true,
    message: 'ERP API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
};

export default {
  getCategories,
  createCategory,
  getBrands,
  createBrand,
  getDeliveryZones,
  getFulfillmentTypes,
  getOrderStatuses,
  getStatusTransitions,
  getPaymentMethods,
  getOrderSources,
  getAppConfig,
  getHealthStatus,
};
