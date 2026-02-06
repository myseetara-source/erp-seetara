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

    // Find variants by SKU (BATCH QUERY - N+1 FIX)
    // Performance: Single query for all SKUs instead of N queries
    const skus = normalizedOrder.items.map(item => item.sku);
    const variantsResult = await productService.getVariantsBySkus(skus);
    const variantMap = new Map(variantsResult.map(v => [v.sku, v]));

    const items = [];
    for (const item of normalizedOrder.items) {
      const variant = variantMap.get(item.sku);
      if (variant) {
        items.push({
          variant_id: variant.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        });
      } else {
        logger.warn('Variant not found for Shopify item', { sku: item.sku });
        // Skip items with missing variants
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

    // Find variants by SKU (BATCH QUERY - N+1 FIX)
    // Performance: Single query for all SKUs instead of N queries
    const skus = normalizedOrder.items.map(item => item.sku);
    const variantsResult = await productService.getVariantsBySkus(skus);
    const variantMap = new Map(variantsResult.map(v => [v.sku, v]));

    const items = [];
    for (const item of normalizedOrder.items) {
      const variant = variantMap.get(item.sku);
      if (variant) {
        items.push({
          variant_id: variant.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        });
      } else {
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

  // Find variants by SKU (BATCH QUERY - N+1 FIX)
  // Performance: Single query for all SKUs instead of N queries
  const skus = items.map(item => item.sku);
  const variantsResult = await productService.getVariantsBySkus(skus);
  const variantMap = new Map(variantsResult.map(v => [v.sku, v]));

  const resolvedItems = [];
  for (const item of items) {
    const variant = variantMap.get(item.sku?.toUpperCase());
    if (!variant) {
      throw new ValidationError(`Product with SKU '${item.sku}' not found`);
    }
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
  req.headers['x-logistics-secret'] = process.env.LOGISTICS_WEBHOOK_SECRET || 'test_mode';
  req.body = testPayload;

  return logisticsWebhook(req, res);
});

// =============================================================================
// NCM (NEPAL CAN MOVE) WEBHOOK LISTENER
// =============================================================================

/**
 * NCM Status Mapping
 * Maps NCM status strings to our internal status codes
 * 
 * Reference: NCM Portal statuses observed in production
 * - "Pickup Order Created" -> Order just synced to NCM
 * - "Order Picked" -> Rider picked up from warehouse
 * - "Dispatched" -> Sent to destination branch
 * - "Arrived" -> Arrived at destination branch
 * - "Sent for Delivery" -> Out for delivery
 * - "Delivery Completed" -> Successfully delivered
 * - "Undelivered" -> Delivery attempt failed
 * - "Return Request" -> Customer wants to return
 * - "RTO" -> Return to Origin initiated
 * - "Return Completed" -> Returned to warehouse
 */
const NCM_STATUS_MAP = {
  // =========================================================================
  // PICKUP PHASE (Order Created -> Picked Up)
  // =========================================================================
  'pickup_order_created': 'processing',       // NCM received the order
  'pickup_order created': 'processing',       // Alternative format
  'order_created': 'processing',
  'pickup_completed': 'in_transit',
  'picked_up': 'in_transit',
  'order_picked': 'in_transit',
  'order picked': 'in_transit',               // NCM uses space-separated
  
  // =========================================================================
  // TRANSIT PHASE (Moving between hubs)
  // =========================================================================
  'order_dispatched': 'in_transit',
  'dispatched': 'in_transit',
  'order_arrived': 'in_transit',
  'arrived': 'in_transit',
  'in_transit': 'in_transit',
  'in transit': 'in_transit',
  'hub_received': 'in_transit',
  
  // =========================================================================
  // OUT FOR DELIVERY
  // =========================================================================
  'sent_for_delivery': 'out_for_delivery',
  'sent for delivery': 'out_for_delivery',    // NCM uses space-separated
  'out_for_delivery': 'out_for_delivery',
  'ofd': 'out_for_delivery',
  
  // =========================================================================
  // DELIVERED (Success!)
  // =========================================================================
  'delivery_completed': 'delivered',
  'delivery completed': 'delivered',           // NCM uses space-separated
  'delivered': 'delivered',
  'dlvd': 'delivered',
  
  // =========================================================================
  // DELIVERY ISSUES / HOLD
  // =========================================================================
  'undelivered': 'hold',
  'on_hold': 'hold',
  'hold': 'hold',
  'address_issue': 'hold',
  'customer_not_available': 'hold',
  'phone_unreachable': 'hold',
  'rescheduled': 'hold',
  
  // =========================================================================
  // P0: RETURNS (RTO - Return to Origin) WITH HOLDING STATE LOGIC
  // =========================================================================
  // CRITICAL: Courier "Returned" statuses do NOT go directly to 'returned'
  // They go to holding states until warehouse physically verifies
  // =========================================================================
  
  // Step 1: Customer rejects → RTO_INITIATED
  'return_request': 'rto_initiated',
  'return request': 'rto_initiated',
  'return_initiated': 'rto_initiated',
  'rto': 'rto_initiated',
  'rto_initiated': 'rto_initiated',
  'return_in_transit': 'rto_initiated',
  'customer_rejected': 'rto_initiated',
  'customer rejected': 'rto_initiated',
  'undelivered': 'rto_initiated',
  
  // Step 2: Courier says "returned" → RTO_VERIFICATION_PENDING (HOLDING STATE)
  // ⚠️ NOT 'returned' - awaiting physical verification at warehouse
  'return_completed': 'rto_verification_pending',
  'return completed': 'rto_verification_pending',    // NCM uses space-separated
  'returned': 'rto_verification_pending',            // ← P0 FIX: HOLDING STATE
  'rto_completed': 'rto_verification_pending',
  'returned_to_vendor': 'rto_verification_pending',
  'returned to vendor': 'rto_verification_pending',
  'delivered_to_merchant': 'rto_verification_pending',
  'delivered to merchant': 'rto_verification_pending',
  
  // Step 3: 'returned' status can ONLY be set via verify_rto_return() at warehouse
  
  // =========================================================================
  // CANCELLED
  // =========================================================================
  'cancelled': 'cancelled',
  'order_cancelled': 'cancelled',
  'cancel': 'cancelled',
  
  // =========================================================================
  // REDIRECT (Special case - forwarded to another address)
  // =========================================================================
  'redirect': 'in_transit',
  'redirected': 'in_transit',
};

/**
 * NCM Webhook Listener
 * POST /webhooks/ncm-listener
 * 
 * Receives real-time order status updates from NCM (Nepal Can Move).
 * This endpoint should be added to NCM's "Order Delivery Webhook URL" field.
 * 
 * NCM Test Verification:
 * - NCM sends test requests to verify URL before saving
 * - We must return { success: true, response: "OK" } for test pings
 * 
 * Payload Examples:
 * Test ping: { test: true } or { event: "test" }
 * Status update: { order_id: "123", status: "delivered", ... }
 */
export const ncmWebhookListener = async (req, res) => {
  const LOG_PREFIX = '[NCM-Webhook]';
  
  try {
    const payload = req.body;
    const userAgent = req.headers['user-agent'] || '';
    
    logger.info(`${LOG_PREFIX} Webhook received`, {
      userAgent,
      bodyKeys: Object.keys(payload || {}),
      ip: req.ip,
    });

    // =========================================================================
    // TEST VERIFICATION - Required by NCM to save the webhook URL
    // =========================================================================
    
    // NCM sends test pings to verify the webhook URL is valid
    // We MUST return 200 with { success: true, response: "OK" }
    if (
      payload.test === true ||
      payload.test === 'true' ||
      payload.event === 'test' ||
      payload.event === 'webhook.test' ||
      payload.type === 'test' ||
      !payload.order_id // If no order_id, treat as test ping
    ) {
      logger.info(`${LOG_PREFIX} Test verification request - returning OK`);
      return res.status(200).json({
        success: true,
        response: 'OK',
        message: 'NCM webhook URL verified successfully',
        timestamp: new Date().toISOString(),
      });
    }

    // =========================================================================
    // SECURITY CHECK (Optional but recommended)
    // =========================================================================
    
    // NCM should include their identifier in User-Agent
    // This is a soft check - we log but don't reject
    if (!userAgent.toLowerCase().includes('ncm')) {
      logger.warn(`${LOG_PREFIX} User-Agent does not contain 'NCM'`, { userAgent });
      // Don't reject - might be valid request from different client
    }

    // =========================================================================
    // EXTRACT EVENT DATA
    // =========================================================================
    
    const {
      order_id,          // NCM's tracking ID (our courier_tracking_id)
      tracking_id,       // Alternative field name
      status,            // Current status (e.g., 'delivered', 'returned')
      event,             // Event type (e.g., 'order.status.changed')
      remarks,           // Additional notes
      location,          // Current location
      receiver_name,     // Person who received (for delivered)
      timestamp,         // Event timestamp
      delivery_date,     // Delivery date (if delivered)
      cod_amount,        // COD amount collected
      cod_collected,     // Whether COD was collected
    } = payload;

    const trackingId = order_id || tracking_id;
    const ncmStatus = (status || '').toLowerCase().replace(/\s+/g, '_');

    logger.info(`${LOG_PREFIX} Processing status update`, {
      trackingId,
      ncmStatus,
      event,
      remarks,
    });

    if (!trackingId) {
      logger.warn(`${LOG_PREFIX} Missing order_id/tracking_id in payload`);
      // Return 200 to prevent NCM from retrying endlessly
      return res.status(200).json({
        success: false,
        message: 'Missing order_id in payload',
      });
    }

    // =========================================================================
    // FIND ORDER IN DATABASE
    // =========================================================================
    
    const { supabaseAdmin } = await import('../config/supabase.js');
    
    // Find order by:
    // 1. external_order_id (NCM's internal order ID - primary lookup)
    // 2. courier_tracking_id (tracking number)
    // 3. awb_number (legacy field)
    const { data: order, error: findError } = await supabaseAdmin
      .from('orders')
      .select('id, readable_id, status, payment_method, payment_status, total_amount, courier_partner, external_order_id')
      .or(`external_order_id.eq.${trackingId},courier_tracking_id.eq.${trackingId},awb_number.eq.${trackingId}`)
      .single();
    
    // Log the lookup details for debugging
    logger.info(`${LOG_PREFIX} Order lookup`, {
      searchValue: trackingId,
      found: !!order,
      externalOrderId: order?.external_order_id,
    });

    if (findError || !order) {
      logger.warn(`${LOG_PREFIX} Order not found for tracking ID`, { trackingId });
      // Return 200 to prevent NCM from retrying
      return res.status(200).json({
        success: true,
        message: 'Order not found for this tracking ID',
        tracking_id: trackingId,
      });
    }

    logger.info(`${LOG_PREFIX} Order found`, {
      orderId: order.id,
      readableId: order.readable_id,
      currentStatus: order.status,
    });

    // =========================================================================
    // MAP NCM STATUS TO INTERNAL STATUS
    // =========================================================================
    
    const internalStatus = NCM_STATUS_MAP[ncmStatus] || null;
    
    if (!internalStatus) {
      logger.warn(`${LOG_PREFIX} Unknown NCM status`, { ncmStatus });
      // Log as activity but don't update status
    }

    // =========================================================================
    // LOG ACTIVITY (Always log the webhook event)
    // =========================================================================
    
    const { logActivity, ACTIVITY_TYPES } = await import('../services/ActivityLogger.service.js');
    
    const activityMessage = internalStatus
      ? `NCM: Status updated to "${status}"${remarks ? ` - ${remarks}` : ''}${location ? ` (${location})` : ''}`
      : `NCM: Event received - "${status || event}"${remarks ? ` - ${remarks}` : ''}`;

    await logActivity(supabaseAdmin, {
      orderId: order.id,
      user: null, // System event
      message: activityMessage,
      type: ACTIVITY_TYPES.SYSTEM_LOG,
      metadata: {
        source: 'ncm_webhook',
        tracking_id: trackingId,
        ncm_status: status,
        internal_status: internalStatus,
        location,
        remarks,
        receiver_name,
        timestamp: timestamp || new Date().toISOString(),
        raw_payload: payload,
      },
    });

    // =========================================================================
    // UPDATE ORDER STATUS (If status changed)
    // P0 FIX: Save exact status text for dynamic courier status display
    // =========================================================================
    
    const updateData = {
      logistics_status: status,      // P0: Exact status text for display
      courier_raw_status: status,    // Backup field
      updated_at: new Date().toISOString(),
    };

    // Only update status if we have a valid mapping AND it's different
    if (internalStatus && internalStatus !== order.status) {
      updateData.status = internalStatus;
      
      // If delivered, set delivered_at timestamp
      if (internalStatus === 'delivered') {
        updateData.delivered_at = delivery_date || timestamp || new Date().toISOString();
        
        // If COD, mark payment as collected
        if (order.payment_method === 'cod') {
          updateData.payment_status = 'paid';
          updateData.paid_amount = cod_amount || order.total_amount;
        }
      }
      
      // =========================================================================
      // P0: RTO HOLDING STATE LOGIC - CRITICAL
      // =========================================================================
      
      // If RTO initiated (customer rejected), set rto_initiated_at
      if (internalStatus === 'rto_initiated') {
        if (!order.rto_initiated_at) {
          updateData.rto_initiated_at = timestamp || new Date().toISOString();
        }
        updateData.rto_reason = status || remarks || 'Customer rejected';
        logger.warn(`${LOG_PREFIX} 🚨 RTO INITIATED for ${order.readable_id}: "${status}"`);
      }
      
      // If RTO verification pending (courier says returned) - HOLDING STATE
      // ⚠️ CRITICAL: Do NOT set returned_at here, do NOT update inventory
      // This is the HOLDING STATE until warehouse physically verifies
      if (internalStatus === 'rto_verification_pending') {
        if (!order.rto_initiated_at) {
          updateData.rto_initiated_at = timestamp || new Date().toISOString();
        }
        logger.warn(`${LOG_PREFIX} ⏳ RTO VERIFICATION PENDING for ${order.readable_id} - awaiting warehouse scan`);
        // ⚠️ IMPORTANT: We do NOT set return_received_at here
        // That is ONLY set when warehouse calls verify_rto_return()
      }
      
      // If lost in transit (manual marking via admin)
      if (internalStatus === 'lost_in_transit') {
        logger.error(`${LOG_PREFIX} ❌ LOST IN TRANSIT: ${order.readable_id}`);
      }
      
      // REMOVED: Old 'returned' logic - 'returned' status is ONLY set via
      // verify_rto_return() function at warehouse level
      // This ensures no order is marked as fully returned automatically
    }

    // Perform the update
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', order.id);

    if (updateError) {
      logger.error(`${LOG_PREFIX} Failed to update order`, {
        orderId: order.id,
        error: updateError.message,
      });
      // Still return 200 - we don't want NCM to retry
    } else {
      logger.info(`${LOG_PREFIX} Order updated successfully`, {
        orderId: order.id,
        readableId: order.readable_id,
        oldStatus: order.status,
        newStatus: updateData.status || order.status,
      });
    }

    // =========================================================================
    // RETURN SUCCESS
    // =========================================================================
    
    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: {
        order_id: order.readable_id,
        tracking_id: trackingId,
        status_received: status,
        status_mapped: internalStatus,
        status_updated: !!updateData.status,
      },
    });

  } catch (error) {
    logger.error(`${LOG_PREFIX} Webhook processing error`, {
      error: error.message,
      stack: error.stack,
    });

    // ALWAYS return 200 to prevent NCM from retrying endlessly
    // The error is logged for our investigation
    return res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message,
    });
  }
};

export default {
  shopifyOrder,
  woocommerceOrder,
  createApiOrder,
  shiprocketStatus,
  // Logistics webhooks
  logisticsWebhook,
  testLogisticsWebhook,
  // NCM specific webhook
  ncmWebhookListener,
};
