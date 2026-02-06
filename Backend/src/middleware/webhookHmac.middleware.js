/**
 * Webhook HMAC Verification Middleware
 * 
 * P0 SECURITY FIX: Implements HMAC signature verification for Shopify and WooCommerce webhooks.
 * This prevents unauthorized webhook calls from malicious actors.
 * 
 * @module webhookHmac
 */

import crypto from 'crypto';
import { createLogger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

const logger = createLogger('WebhookHMAC');

/**
 * Verify Shopify webhook HMAC signature
 * 
 * Shopify sends HMAC-SHA256 in the header 'x-shopify-hmac-sha256'.
 * We compute the HMAC of the raw request body using the shared secret
 * and compare it with the signature.
 * 
 * @see https://shopify.dev/docs/apps/webhooks/configuration/https#step-5-verify-the-webhook
 */
export function verifyShopifyHmac(req, res, next) {
  const LOG_PREFIX = '[ShopifyHMAC]';
  
  try {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    
    // In development, skip verification if secret is not set
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        logger.error(`${LOG_PREFIX} SHOPIFY_WEBHOOK_SECRET is not set in production!`);
        return res.status(401).json({ 
          success: false, 
          message: 'Webhook verification not configured' 
        });
      }
      logger.warn(`${LOG_PREFIX} Skipping verification - SHOPIFY_WEBHOOK_SECRET not set (dev mode)`);
      return next();
    }

    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    
    if (!hmacHeader) {
      logger.warn(`${LOG_PREFIX} Missing HMAC header`);
      return res.status(401).json({ 
        success: false, 
        message: 'Missing Shopify HMAC signature' 
      });
    }

    // Get raw body - Express raw body parser should have set this
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    // Compute HMAC
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    // Compare using timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hmacHeader, 'base64'),
      Buffer.from(computedHmac, 'base64')
    );

    if (!isValid) {
      logger.warn(`${LOG_PREFIX} Invalid HMAC signature`, {
        shop: req.headers['x-shopify-shop-domain'],
        topic: req.headers['x-shopify-topic'],
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid Shopify webhook signature' 
      });
    }

    logger.info(`${LOG_PREFIX} ✅ HMAC verified`, {
      shop: req.headers['x-shopify-shop-domain'],
      topic: req.headers['x-shopify-topic'],
    });
    
    next();
  } catch (error) {
    logger.error(`${LOG_PREFIX} Verification error`, { error: error.message });
    return res.status(500).json({ 
      success: false, 
      message: 'Webhook verification failed' 
    });
  }
}

/**
 * Verify WooCommerce webhook signature
 * 
 * WooCommerce sends signature in 'x-wc-webhook-signature' header.
 * It uses HMAC-SHA256 with the webhook secret.
 * 
 * @see https://woocommerce.github.io/woocommerce-rest-api-docs/#webhooks
 */
export function verifyWooCommerceHmac(req, res, next) {
  const LOG_PREFIX = '[WooCommerceHMAC]';
  
  try {
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
    
    // In development, skip verification if secret is not set
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        logger.error(`${LOG_PREFIX} WOOCOMMERCE_WEBHOOK_SECRET is not set in production!`);
        return res.status(401).json({ 
          success: false, 
          message: 'Webhook verification not configured' 
        });
      }
      logger.warn(`${LOG_PREFIX} Skipping verification - WOOCOMMERCE_WEBHOOK_SECRET not set (dev mode)`);
      return next();
    }

    const signatureHeader = req.headers['x-wc-webhook-signature'];
    
    if (!signatureHeader) {
      logger.warn(`${LOG_PREFIX} Missing signature header`);
      return res.status(401).json({ 
        success: false, 
        message: 'Missing WooCommerce webhook signature' 
      });
    }

    // Get raw body
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    // WooCommerce uses base64(HMAC-SHA256(payload, secret))
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    // Compare using timing-safe comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'base64'),
      Buffer.from(computedSignature, 'base64')
    );

    if (!isValid) {
      logger.warn(`${LOG_PREFIX} Invalid signature`, {
        source: req.headers['x-wc-webhook-source'],
        topic: req.headers['x-wc-webhook-topic'],
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid WooCommerce webhook signature' 
      });
    }

    logger.info(`${LOG_PREFIX} ✅ Signature verified`, {
      source: req.headers['x-wc-webhook-source'],
      topic: req.headers['x-wc-webhook-topic'],
    });
    
    next();
  } catch (error) {
    logger.error(`${LOG_PREFIX} Verification error`, { error: error.message });
    return res.status(500).json({ 
      success: false, 
      message: 'Webhook verification failed' 
    });
  }
}

/**
 * Generic webhook signature verification
 * Uses header 'x-webhook-signature' or 'authorization'
 */
export function verifyGenericWebhookSignature(req, res, next) {
  const LOG_PREFIX = '[GenericWebhook]';
  
  try {
    const secret = process.env.WEBHOOK_SECRET;
    
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        logger.warn(`${LOG_PREFIX} WEBHOOK_SECRET not set - skipping verification`);
      }
      return next();
    }

    const signature = req.headers['x-webhook-signature'] || 
                      req.headers['authorization']?.replace('Bearer ', '');
    
    if (!signature) {
      logger.warn(`${LOG_PREFIX} Missing signature`);
      return res.status(401).json({ 
        success: false, 
        message: 'Missing webhook signature' 
      });
    }

    // Simple comparison for API key style auth
    if (signature === secret) {
      return next();
    }

    // Try HMAC comparison for signed payloads
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    if (signature === computedHmac) {
      return next();
    }

    logger.warn(`${LOG_PREFIX} Invalid signature`);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid webhook signature' 
    });
    
  } catch (error) {
    logger.error(`${LOG_PREFIX} Verification error`, { error: error.message });
    return res.status(500).json({ 
      success: false, 
      message: 'Webhook verification failed' 
    });
  }
}

/**
 * Middleware to capture raw body for HMAC verification
 * Must be applied BEFORE json/urlencoded parsers for specific routes
 */
export function captureRawBody(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}

export default {
  verifyShopifyHmac,
  verifyWooCommerceHmac,
  verifyGenericWebhookSignature,
  captureRawBody,
};
