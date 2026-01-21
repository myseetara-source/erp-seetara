/**
 * External API Routes
 * 
 * Endpoints for external websites (Shopify, WordPress, Custom) to integrate with ERP
 * 
 * Base Path: /api/v1/external
 * 
 * Authentication: API Key via x-api-key header
 * Idempotency: Required for order creation to prevent duplicates
 */

import { Router } from 'express';
import {
  authenticateExternalApi,
  createExternalOrder,
  getExternalOrderStatus,
  cancelExternalOrder,
} from '../controllers/external.controller.js';
import { idempotency } from '../middleware/idempotency.middleware.js';

const router = Router();

// =============================================================================
// ALL ROUTES REQUIRE API KEY AUTHENTICATION
// =============================================================================
router.use(authenticateExternalApi);

// =============================================================================
// ORDER ENDPOINTS
// =============================================================================

/**
 * @route   POST /api/v1/external/orders
 * @desc    Create order from external website
 * @access  API Key Required
 * @header  Idempotency-Key: UUID (Recommended - prevents duplicate orders on retry)
 * 
 * @body    {
 *            customer: { name, phone, email?, address?, city?, district? },
 *            items: [{ sku, quantity, unit_price }],
 *            total_amount: number,
 *            marketing_meta?: { event_id, fbp?, fbc?, user_agent? }
 *          }
 * 
 * @security Idempotency middleware caches responses for 24 hours
 *           Same Idempotency-Key returns cached response (no duplicate order)
 */
router.post(
  '/orders', 
  idempotency({ ttlSeconds: 86400, required: false }), // 24 hour cache, optional but recommended
  createExternalOrder
);

/**
 * @route   GET /api/v1/external/orders/:orderNumber
 * @desc    Get order status
 * @access  API Key Required
 */
router.get('/orders/:orderNumber', getExternalOrderStatus);

/**
 * @route   POST /api/v1/external/orders/:orderNumber/cancel
 * @desc    Cancel an order
 * @access  API Key Required
 * 
 * @body    { reason?: string }
 */
router.post('/orders/:orderNumber/cancel', cancelExternalOrder);

// =============================================================================
// HEALTH CHECK (No Auth)
// =============================================================================

/**
 * @route   GET /api/v1/external/health
 * @desc    Check if external API is working
 * @access  Public (for monitoring)
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'External API is healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
