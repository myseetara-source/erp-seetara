/**
 * Static Data Routes (PERF-003)
 * 
 * Cacheable endpoints for rarely-changing data.
 * These endpoints have Cache-Control headers set for long-term caching.
 * 
 * CACHING STRATEGY:
 * - Categories: 1 hour (changes rarely)
 * - Delivery Zones: 1 hour (changes rarely)
 * - Order Statuses: 24 hours (never changes)
 * - App Config: 5 minutes (may change with settings)
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { longCache, staticCache, CACHE_DURATION, setCacheHeaders } from '../middleware/cache.middleware.js';
import config from '../config/index.js';

const router = Router();

// =============================================================================
// PRODUCT CATEGORIES (Long Cache - 1 hour)
// =============================================================================

/**
 * Get all product categories
 * GET /static/categories
 * 
 * Cache: 1 hour (public)
 */
router.get('/categories', longCache(), asyncHandler(async (req, res) => {
  // Get unique categories from products
  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('category')
    .eq('is_active', true)
    .not('category', 'is', null);

  if (error) {
    console.error('[StaticRoutes] Categories error:', error);
    return res.json({ success: true, data: [] });
  }

  // Extract unique categories
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  
  res.json({
    success: true,
    data: categories.sort(),
    meta: { count: categories.length, cache_ttl: CACHE_DURATION.LONG },
  });
}));

// =============================================================================
// DELIVERY ZONES (Long Cache - 1 hour)
// =============================================================================

/**
 * Get all delivery zones
 * GET /static/delivery-zones
 * 
 * Cache: 1 hour (public)
 */
router.get('/delivery-zones', longCache(), asyncHandler(async (req, res) => {
  const { data: zones, error } = await supabaseAdmin
    .from('delivery_zones')
    .select('id, name, type, base_charge, per_kg_charge, is_active')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('[StaticRoutes] Delivery zones error:', error);
    return res.json({ success: true, data: [] });
  }

  res.json({
    success: true,
    data: zones || [],
    meta: { count: zones?.length || 0, cache_ttl: CACHE_DURATION.LONG },
  });
}));

// =============================================================================
// FULFILLMENT TYPES (Static Cache - 24 hours)
// =============================================================================

/**
 * Get fulfillment type options
 * GET /static/fulfillment-types
 * 
 * Cache: 24 hours (static enum)
 */
router.get('/fulfillment-types', staticCache(), (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'inside_valley', label: 'Inside Valley', description: 'Kathmandu Valley - Same day delivery' },
      { value: 'outside_valley', label: 'Outside Valley', description: 'Outside Kathmandu - 3-7 days' },
      { value: 'store', label: 'Store Pickup', description: 'Customer picks up from store' },
    ],
    meta: { cache_ttl: CACHE_DURATION.STATIC },
  });
});

// =============================================================================
// ORDER STATUSES (Static Cache - 24 hours)
// =============================================================================

/**
 * Get order status configuration
 * GET /static/order-statuses
 * 
 * Cache: 24 hours (static enum)
 */
router.get('/order-statuses', staticCache(), (req, res) => {
  res.json({
    success: true,
    data: config.orderStatuses,
    meta: { cache_ttl: CACHE_DURATION.STATIC },
  });
});

/**
 * Get order status transitions (State Machine)
 * GET /static/status-transitions
 * 
 * Cache: 24 hours (static config)
 */
router.get('/status-transitions', staticCache(), (req, res) => {
  res.json({
    success: true,
    data: config.statusTransitions,
    meta: { cache_ttl: CACHE_DURATION.STATIC },
  });
});

// =============================================================================
// PAYMENT METHODS (Static Cache - 24 hours)
// =============================================================================

/**
 * Get available payment methods
 * GET /static/payment-methods
 * 
 * Cache: 24 hours (static)
 */
router.get('/payment-methods', staticCache(), (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'cod', label: 'Cash on Delivery', icon: 'cash' },
      { value: 'esewa', label: 'eSewa', icon: 'wallet' },
      { value: 'khalti', label: 'Khalti', icon: 'wallet' },
      { value: 'bank_transfer', label: 'Bank Transfer', icon: 'bank' },
      { value: 'cash', label: 'Cash', icon: 'cash' },
    ],
    meta: { cache_ttl: CACHE_DURATION.STATIC },
  });
});

// =============================================================================
// ORDER SOURCES (Static Cache - 24 hours)
// =============================================================================

/**
 * Get order source options
 * GET /static/order-sources
 * 
 * Cache: 24 hours (static)
 */
router.get('/order-sources', staticCache(), (req, res) => {
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
    meta: { cache_ttl: CACHE_DURATION.STATIC },
  });
});

// =============================================================================
// BRANDS (Long Cache - 1 hour)
// =============================================================================

/**
 * Get all product brands
 * GET /static/brands
 * 
 * Cache: 1 hour
 */
router.get('/brands', longCache(), asyncHandler(async (req, res) => {
  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('brand')
    .eq('is_active', true)
    .not('brand', 'is', null);

  if (error) {
    console.error('[StaticRoutes] Brands error:', error);
    return res.json({ success: true, data: [] });
  }

  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
  
  res.json({
    success: true,
    data: brands.sort(),
    meta: { count: brands.length, cache_ttl: CACHE_DURATION.LONG },
  });
}));

// =============================================================================
// APP CONFIG (Medium Cache - 5 minutes) - Authenticated
// =============================================================================

/**
 * Get app configuration
 * GET /static/app-config
 * 
 * Cache: 5 minutes (may change with settings)
 * Auth: Required
 */
router.get('/app-config', authenticate, asyncHandler(async (req, res) => {
  // Set cache headers manually (private - user-specific)
  setCacheHeaders(res, 300, true);

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
}));

export default router;
