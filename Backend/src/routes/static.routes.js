/**
 * Static Data Routes (PERF-003)
 * 
 * Cacheable endpoints for rarely-changing data.
 * These endpoints have Cache-Control headers set for long-term caching.
 * 
 * CACHING STRATEGY:
 * - Categories: 1 hour (changes rarely)
 * - Brands: 1 hour (changes rarely)
 * - Delivery Zones: 1 hour (changes rarely)
 * - Order Statuses: 24 hours (never changes)
 * - App Config: 5 minutes (may change with settings)
 * 
 * BACKWARD COMPATIBILITY:
 * This router also handles /categories and /brands at root level
 * for older frontend code that doesn't use /static prefix.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { longCache, staticCache, setCacheHeaders } from '../middleware/cache.middleware.js';
import * as staticController from '../controllers/static.controller.js';

const router = Router();

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * Get all product categories
 * GET /static/categories
 * Cache: 1 hour (public)
 */
router.get('/categories', longCache(), staticController.getCategories);

// =============================================================================
// BRANDS
// =============================================================================

/**
 * Get all product brands
 * GET /static/brands
 * Cache: 1 hour
 */
router.get('/brands', longCache(), staticController.getBrands);

// =============================================================================
// DELIVERY ZONES
// =============================================================================

/**
 * Get all delivery zones
 * GET /static/delivery-zones
 * Cache: 1 hour (public)
 */
router.get('/delivery-zones', longCache(), staticController.getDeliveryZones);

// =============================================================================
// STATIC ENUMS (No database needed - 24 hour cache)
// =============================================================================

/**
 * Get fulfillment type options
 * GET /static/fulfillment-types
 * Cache: 24 hours (static enum)
 */
router.get('/fulfillment-types', staticCache(), staticController.getFulfillmentTypes);

/**
 * Get order status configuration
 * GET /static/order-statuses
 * Cache: 24 hours (static enum)
 */
router.get('/order-statuses', staticCache(), staticController.getOrderStatuses);

/**
 * Get order status transitions (State Machine)
 * GET /static/status-transitions
 * Cache: 24 hours (static config)
 */
router.get('/status-transitions', staticCache(), staticController.getStatusTransitions);

/**
 * Get available payment methods
 * GET /static/payment-methods
 * Cache: 24 hours (static)
 */
router.get('/payment-methods', staticCache(), staticController.getPaymentMethods);

/**
 * Get order source options
 * GET /static/order-sources
 * Cache: 24 hours (static)
 */
router.get('/order-sources', staticCache(), staticController.getOrderSources);

// =============================================================================
// APP CONFIG (Authenticated)
// =============================================================================

/**
 * Get app configuration
 * GET /static/app-config
 * Cache: 5 minutes (may change with settings)
 * Auth: Required
 */
router.get('/app-config', authenticate, (req, res, next) => {
  setCacheHeaders(res, 300, true); // Private cache
  next();
}, staticController.getAppConfig);

export default router;
