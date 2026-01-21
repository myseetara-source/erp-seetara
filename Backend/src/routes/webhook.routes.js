/**
 * Webhook Routes
 * External platform integrations
 * 
 * Includes:
 * - E-commerce platforms (Shopify, WooCommerce)
 * - Logistics providers (NCM, Sundar, Pathao, etc.)
 * - Shipping aggregators (Shiprocket)
 */

import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { apiOrderSchema } from '../validations/order.validation.js';

const router = Router();

// Note: Webhooks are typically NOT authenticated via JWT
// They use their own verification methods (HMAC, API keys, etc.)

// =============================================================================
// E-COMMERCE PLATFORM WEBHOOKS
// =============================================================================

// Shopify webhooks
router.post('/shopify/orders', webhookController.shopifyOrder);

// WooCommerce webhooks
router.post('/woocommerce/orders', webhookController.woocommerceOrder);

// Generic API order creation (for custom integrations)
router.post(
  '/orders',
  validateBody(apiOrderSchema),
  webhookController.createApiOrder
);

// =============================================================================
// LOGISTICS WEBHOOKS - 3PL Integration
// =============================================================================

/**
 * Generic logistics webhook receiver
 * Handles status updates from any 3PL courier partner
 * 
 * Headers required:
 * - x-logistics-provider: Provider code (ncm, sundar, pathao, etc.)
 * - x-logistics-secret: Webhook secret for verification
 * 
 * Alternatively, provider can be specified in URL:
 * POST /webhooks/logistics/ncm
 * POST /webhooks/logistics/sundar
 */
router.post('/logistics', webhookController.logisticsWebhook);
router.post('/logistics/:provider', webhookController.logisticsWebhook);

// Individual provider endpoints (for backwards compatibility / specific configs)
router.post('/ncm/status', webhookController.logisticsWebhook);
router.post('/sundar/status', webhookController.logisticsWebhook);
router.post('/pathao/status', webhookController.logisticsWebhook);

// Shiprocket status updates (legacy, kept for backwards compatibility)
router.post('/shiprocket/status', webhookController.shiprocketStatus);

// =============================================================================
// TEST ENDPOINTS (Development only)
// =============================================================================

// Test logistics webhook
router.post('/logistics/test', webhookController.testLogisticsWebhook);

export default router;
