/**
 * Webhook Routes
 * External platform integrations
 * 
 * Includes:
 * - E-commerce platforms (Shopify, WooCommerce)
 * - Logistics providers (NCM, Sundar, Pathao, etc.)
 * - Shipping aggregators (Shiprocket)
 * 
 * IMPORTANT: All webhook routes are PUBLIC (no JWT auth)
 * Verification is done via HMAC, API keys, or User-Agent headers
 * 
 * P0 SECURITY FIX: HMAC verification now implemented for Shopify and WooCommerce
 */

import { Router } from 'express';
import * as webhookController from '../controllers/webhook.controller.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { apiOrderSchema } from '../validations/order.validation.js';
import { 
  verifyShopifyHmac, 
  verifyWooCommerceHmac,
  verifyGenericWebhookSignature 
} from '../middleware/webhookHmac.middleware.js';

const router = Router();

// Note: Webhooks are typically NOT authenticated via JWT
// They use their own verification methods (HMAC, API keys, etc.)

// =============================================================================
// E-COMMERCE PLATFORM WEBHOOKS (P0 SECURITY: HMAC Verified)
// =============================================================================

// Shopify webhooks - HMAC verified
router.post('/shopify/orders', verifyShopifyHmac, webhookController.shopifyOrder);

// WooCommerce webhooks - HMAC verified
router.post('/woocommerce/orders', verifyWooCommerceHmac, webhookController.woocommerceOrder);

// Generic API order creation (for custom integrations)
router.post(
  '/orders',
  validateBody(apiOrderSchema),
  webhookController.createApiOrder
);

// =============================================================================
// NCM (NEPAL CAN MOVE) DEDICATED WEBHOOK
// This is the primary endpoint for NCM integration
// URL to paste in NCM Portal: https://your-domain.com/api/v1/webhooks/ncm-listener
// =============================================================================

/**
 * NCM Webhook Listener
 * POST /webhooks/ncm-listener
 * 
 * Receives real-time order status updates from NCM.
 * 
 * Features:
 * - Test verification (returns 200 OK for test pings)
 * - Status mapping (NCM status -> Internal status)
 * - Activity logging
 * - COD payment status update on delivery
 * 
 * Test: Send { test: true } to verify endpoint
 * Status Update: Send { order_id, status, remarks, ... }
 */
router.post('/ncm-listener', webhookController.ncmWebhookListener);

// Alternative NCM endpoints (backwards compatibility)
router.post('/ncm/delivery', webhookController.ncmWebhookListener);
router.post('/ncm/webhook', webhookController.ncmWebhookListener);

// =============================================================================
// LOGISTICS WEBHOOKS - 3PL Integration (Generic)
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
