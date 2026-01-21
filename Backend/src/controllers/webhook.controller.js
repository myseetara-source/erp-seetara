/**
 * Webhook Controller
 * Handles incoming webhooks from external platforms
 * 
 * Includes:
 * - E-commerce platforms (Shopify, WooCommerce)
 * - Logistics providers (NCM, Sundar, Pathao, etc.)
 * - Shipping aggregators (Shiprocket)
 */

import { orderService } from '../services/order.service.js';
import { integrationService } from '../services/integration.service.js';
import { productService } from '../services/product.service.js';
import { LogisticsAdapterFactory } from '../services/logistics/index.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, AppError } from '../utils/errors.js';

const logger = createLogger('WebhookController');

/**
 * Handle Shopify order webhook
 * POST /webhooks/shopify/orders
 */
export const shopifyOrder = asyncHandler(async (req, res) => {
  const topic = req.headers['x-shopify-topic'];
  const shopDomain = req.headers['x-shopify-shop-domain'];

  logger.info('Shopify webhook received', { topic, shop: shopDomain });

  // Verify webhook signature (implement HMAC verification in production)
  // const hmac = req.headers['x-shopify-hmac-sha256'];
  // verifyShopifyWebhook(req.rawBody, hmac);

  if (topic === 'orders/create' || topic === 'orders/paid') {
    const normalizedOrder = integrationService.normalizeExternalOrder('shopify', req.body);
    
    // Check if order already exists
    const existingOrderId = req.body.id?.toString();
    const { data: existing } = await orderService.listOrders({
      source: 'shopify',
      limit: 1,
    });

    if (existing?.some(o => o.source_order_id === existingOrderId)) {
      logger.info('Duplicate Shopify order, skipping', { orderId: existingOrderId });
      return res.json({ success: true, message: 'Order already exists' });
    }

    // Find variants by SKU
    const items = [];
    for (const item of normalizedOrder.items) {
      try {
        const variant = await productService.getVariantBySku(item.sku);
        items.push({
          variant_id: variant.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        });
      } catch (err) {
        logger.warn('Variant not found for Shopify item', { sku: item.sku });
        // You might want to handle this differently - skip or create placeholder
      }
    }

    if (items.length === 0) {
      throw new ValidationError('No valid items found in order');
    }

    // Create order
    const order = await orderService.createOrder({
      customer: normalizedOrder.customer,
      items,
      source: 'shopify',
      source_order_id: existingOrderId,
      discount_amount: normalizedOrder.discount_amount,
      shipping_charges: normalizedOrder.shipping_charges,
      payment_method: normalizedOrder.payment_method,
    }, { userId: null, ipAddress: req.ip });

    logger.info('Shopify order created', { 
      orderId: order.id, 
      shopifyOrderId: existingOrderId 
    });

    return res.json({
      success: true,
      message: 'Order created',
      data: { order_id: order.id, order_number: order.order_number },
    });
  }

  res.json({ success: true, message: 'Webhook received' });
});

/**
 * Handle WooCommerce order webhook
 * POST /webhooks/woocommerce/orders
 */
export const woocommerceOrder = asyncHandler(async (req, res) => {
  const topic = req.headers['x-wc-webhook-topic'];
  const source = req.headers['x-wc-webhook-source'];

  logger.info('WooCommerce webhook received', { topic, source });

  if (topic === 'order.created' || topic === 'order.completed') {
    const normalizedOrder = integrationService.normalizeExternalOrder('woocommerce', req.body);
    
    const existingOrderId = req.body.id?.toString();

    // Find variants by SKU
    const items = [];
    for (const item of normalizedOrder.items) {
      try {
        const variant = await productService.getVariantBySku(item.sku);
        items.push({
          variant_id: variant.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        });
      } catch (err) {
        logger.warn('Variant not found for WooCommerce item', { sku: item.sku });
      }
    }

    if (items.length === 0) {
      throw new ValidationError('No valid items found in order');
    }

    const order = await orderService.createOrder({
      customer: normalizedOrder.customer,
      items,
      source: 'woocommerce',
      source_order_id: existingOrderId,
      discount_amount: normalizedOrder.discount_amount,
      shipping_charges: normalizedOrder.shipping_charges,
      payment_method: normalizedOrder.payment_method,
    }, { userId: null, ipAddress: req.ip });

    logger.info('WooCommerce order created', { 
      orderId: order.id, 
      wcOrderId: existingOrderId 
    });

    return res.json({
      success: true,
      message: 'Order created',
      data: { order_id: order.id, order_number: order.order_number },
    });
  }

  res.json({ success: true, message: 'Webhook received' });
});

/**
 * Generic API order creation
 * POST /webhooks/orders
 * For custom integrations (todaytrend, seetara, etc.)
 */
export const createApiOrder = asyncHandler(async (req, res) => {
  const { source, source_order_id, customer, items, ...orderData } = req.body;

  logger.info('API order received', { source, source_order_id });

  // Validate source
  const validSources = ['todaytrend', 'seetara', 'api'];
  if (!validSources.includes(source)) {
    throw new ValidationError(`Invalid source. Must be one of: ${validSources.join(', ')}`);
  }

  // Find variants by SKU
  const resolvedItems = [];
  for (const item of items) {
    const variant = await productService.getVariantBySku(item.sku);
    resolvedItems.push({
      variant_id: variant.id,
      quantity: item.quantity,
      unit_price: item.unit_price ?? variant.selling_price,
    });
  }

  const order = await orderService.createOrder({
    customer,
    items: resolvedItems,
    source,
    source_order_id,
    ...orderData,
  }, { userId: null, ipAddress: req.ip });

  logger.info('API order created', { 
    orderId: order.id, 
    source,
    sourceOrderId: source_order_id 
  });

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    data: {
      order_id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_amount: order.total_amount,
    },
  });
});

/**
 * Shiprocket status webhook
 * POST /webhooks/shiprocket/status
 */
export const shiprocketStatus = asyncHandler(async (req, res) => {
  const { awb, current_status, current_status_id, shipment_status } = req.body;

  logger.info('Shiprocket status update', { awb, status: current_status });

  // Find order by AWB
  const { data: orders } = await orderService.listOrders({ awb, limit: 1 });
  
  if (!orders || orders.length === 0) {
    logger.warn('Order not found for AWB', { awb });
    return res.json({ success: true, message: 'Order not found' });
  }

  const order = orders[0];

  // Map Shiprocket status to our status
  let newStatus = null;
  
  // Status mapping based on Shiprocket status IDs
  // Reference: https://apidocs.shiprocket.in/#shipment-status
  if ([6, 7].includes(current_status_id)) {
    newStatus = 'shipped';
  } else if (current_status_id === 8) {
    newStatus = 'delivered';
  } else if ([9, 10, 11, 12].includes(current_status_id)) {
    newStatus = 'return';
  } else if ([13, 14, 15, 16].includes(current_status_id)) {
    newStatus = 'cancelled';
  }

  if (newStatus && newStatus !== order.status) {
    await orderService.updateStatus(order.id, {
      status: newStatus,
      reason: `Shiprocket: ${current_status}`,
    }, { userId: null });

    logger.info('Order status updated from Shiprocket', { 
      orderId: order.id, 
      from: order.status, 
      to: newStatus 
    });
  }

  res.json({ success: true, message: 'Status processed' });
});

// =============================================================================
// LOGISTICS WEBHOOKS - 3PL Integration
// =============================================================================

/**
 * Generic logistics webhook receiver
 * POST /webhooks/logistics
 * POST /webhooks/logistics/:provider
 * 
 * Receives status updates from any 3PL courier partner.
 * Uses Adapter Pattern to handle provider-specific formats.
 * 
 * Headers:
 * - x-logistics-provider: Provider code (ncm, sundar, pathao, etc.)
 * - x-logistics-secret: Webhook secret for verification
 * 
 * Body (example):
 * {
 *   "tracking_id": "NCM123456789",
 *   "status": "DLVD",
 *   "remarks": "Delivered to customer",
 *   "location": "Pokhara",
 *   "timestamp": "2026-01-19T10:30:00Z"
 * }
 */
export const logisticsWebhook = asyncHandler(async (req, res) => {
  // Get provider from URL param or header
  const providerCode = req.params.provider || 
                       req.headers['x-logistics-provider'] ||
                       req.body.provider;
  
  if (!providerCode) {
    throw new ValidationError('Missing logistics provider identifier');
  }

  const signature = req.headers['x-logistics-secret'] || 
                    req.headers['x-webhook-secret'] ||
                    req.headers['authorization'];

  logger.info('Logistics webhook received', { 
    provider: providerCode,
    trackingId: req.body.tracking_id || req.body.awb_number,
  });

  let adapter;
  let order = null;

  try {
    // Get the appropriate adapter for this provider
    adapter = await LogisticsAdapterFactory.getAdapter(providerCode);
  } catch (err) {
    logger.warn(`Unknown logistics provider: ${providerCode}`);
    
    // Log the unknown webhook for manual review
    // We don't reject it outright - might be a new provider
    await adapter?.logWebhook(req, 'ignored', null, `Unknown provider: ${providerCode}`);
    
    return res.json({ 
      success: true, 
      message: 'Webhook received but provider not configured' 
    });
  }

  try {
    // Verify webhook signature
    if (!adapter.verifyWebhookSignature(signature, req.body)) {
      logger.warn('Invalid logistics webhook signature', { provider: providerCode });
      await adapter.logWebhook(req, 'failed', null, 'Invalid signature');
      
      throw new AppError('Invalid webhook signature', 401, 'INVALID_SIGNATURE');
    }

    // Log the incoming webhook
    await adapter.logWebhook(req, 'pending');

    // Normalize the webhook data to our internal format
    const normalizedData = adapter.normalizeWebhookData(req.body);

    logger.info('Normalized webhook data', { 
      trackingId: normalizedData.trackingId,
      status: normalizedData.status,
    });

    // Find the order by tracking ID
    order = await adapter.findOrderByTrackingId(normalizedData.trackingId);

    if (!order) {
      logger.warn('Order not found for tracking ID', { 
        trackingId: normalizedData.trackingId,
        provider: providerCode 
      });
      await adapter.logWebhook(req, 'ignored', null, 'Order not found');
      
      return res.json({ 
        success: true, 
        message: 'Order not found for this tracking ID' 
      });
    }

    logger.info('Order found for webhook', { 
      orderId: order.id, 
      orderNumber: order.order_number,
      currentStatus: order.status,
      newStatus: normalizedData.status,
    });

    // Add comment from logistics
    if (normalizedData.remarks) {
      const externalCommentId = `${providerCode}_${normalizedData.trackingId}_${Date.now()}`;
      await adapter.addComment(
        order.id,
        normalizedData.remarks,
        externalCommentId,
        normalizedData.rawData.event_type || 'comment'
      );
    }

    // Update order status if different and valid
    if (normalizedData.status && 
        normalizedData.status !== 'unknown' && 
        normalizedData.status !== order.status) {
      
      try {
        await adapter.updateOrderStatus(order.id, normalizedData.status, {
          // Additional data from webhook
          ...(normalizedData.location && { last_known_location: normalizedData.location }),
        });

        // TODO: Send SMS notification to customer
        // TODO: Trigger internal notification (admin panel)
        // TODO: Update any dashboards/analytics

        logger.info('Order status updated from logistics webhook', {
          orderId: order.id,
          from: order.status,
          to: normalizedData.status,
          provider: providerCode,
        });
      } catch (statusError) {
        // Status update might fail due to state machine validation
        // Log but don't fail the webhook
        logger.warn('Could not update order status', {
          orderId: order.id,
          error: statusError.message,
        });
        
        // Add as a comment instead
        await adapter.addComment(
          order.id,
          `Status update to '${normalizedData.status}' could not be applied: ${statusError.message}`,
          null,
          'exception'
        );
      }
    }

    // Mark webhook as processed
    await adapter.logWebhook(req, 'processed', order.id);

    res.json({
      success: true,
      message: 'Logistics webhook processed successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        status: order.status,
        new_status: normalizedData.status,
      },
    });

  } catch (error) {
    // Log the error
    await adapter?.logWebhook(req, 'failed', order?.id, error.message);
    throw error;
  }
});

/**
 * Test logistics webhook (Development only)
 * POST /webhooks/logistics/test
 * 
 * Simulates a webhook from the Dummy provider for testing.
 */
export const testLogisticsWebhook = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Test endpoint not available in production', 403);
  }

  const { tracking_id, status, remarks } = req.body;

  // Create a simulated webhook payload
  const testPayload = {
    tracking_id: tracking_id || 'TEST123456',
    status: status || 'DELIVERED',
    remarks: remarks || 'Test webhook delivery',
    location: 'Test Location',
    timestamp: new Date().toISOString(),
  };

  // Forward to main handler with dummy provider
  req.params.provider = 'dummy';
  req.headers['x-logistics-secret'] = 'test_mode';
  req.body = testPayload;

  return logisticsWebhook(req, res);
});

export default {
  shopifyOrder,
  woocommerceOrder,
  createApiOrder,
  shiprocketStatus,
  // Logistics webhooks
  logisticsWebhook,
  testLogisticsWebhook,
};
