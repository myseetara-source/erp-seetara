/**
 * Order Controller
 * Handles HTTP requests for order management
 * Zero business logic - delegates to OrderService
 * 
 * Nepal E-Commerce Context:
 * - Inside Valley: Our own 7 riders deliver within Kathmandu Valley
 * - Outside Valley: 3rd party couriers (NCM, Sundar, etc.)
 * - Store: Walk-in customers with immediate handover
 */

import { orderService } from '../services/order.service.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { extractContext } from '../middleware/auth.middleware.js';
import { supabaseAdmin } from '../config/supabase.js';
import { 
  determineFulfillmentType,
  determineFulfillmentTypeFromDB,
  FULFILLMENT_TYPES,
  getNotificationTrigger,
  executePostTransitionHooks,
} from '../services/orderStateMachine.js';
import { smsService } from '../services/sms/index.js';
import { metaCAPIService } from '../services/meta/MetaCAPIService.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('OrderController');

// Status constants for CAPI triggers
const REFUND_STATUSES = ['refunded', 'cancelled', 'returned'];

/**
 * Create a new order
 * POST /orders
 * 
 * Website orders: If City is Kathmandu/Lalitpur/Bhaktapur -> inside_valley
 * Store orders: Set fulfillment_type = 'store_pickup'
 * Manual orders: Operator can choose fulfillment_type
 * 
 * FIX: Now uses database-driven delivery_zones table instead of hardcoded values
 */
export const createOrder = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const orderData = { ...req.body };

  // ==========================================================================
  // AUTO-DETECT FULFILLMENT TYPE FROM DATABASE
  // ==========================================================================
  
  // If source is 'store', set fulfillment to store_pickup
  if (orderData.source === 'store') {
    orderData.fulfillment_type = FULFILLMENT_TYPES.STORE_PICKUP;
    logger.debug('Store order detected, setting fulfillment_type to store_pickup');
  }
  
  // If source is 'website' or 'api', auto-detect from customer address using DB
  if (['website', 'api', 'todaytrend', 'seetara', 'shopify', 'woocommerce'].includes(orderData.source)) {
    // Get city from customer or shipping address
    const city = orderData.customer?.city || 
                 orderData.shipping_city || 
                 orderData.customer?.district;
    
    // Auto-determine fulfillment type if not explicitly set
    if (!orderData.fulfillment_type && city) {
      // Use database-driven zone lookup
      const zoneResult = await determineFulfillmentTypeFromDB(city, supabaseAdmin);
      
      orderData.fulfillment_type = zoneResult.fulfillment_type;
      
      // Store zone info for later use (e.g., shipping charges calculation)
      if (zoneResult.zone_info) {
        // Auto-populate shipping charges from zone config if not set
        if (!orderData.shipping_charges && zoneResult.zone_info.delivery_charge) {
          orderData.shipping_charges = zoneResult.zone_info.delivery_charge;
        }
        
        // Set expected delivery date based on zone's estimated days
        if (zoneResult.zone_info.estimated_days) {
          const expectedDate = new Date();
          expectedDate.setDate(expectedDate.getDate() + zoneResult.zone_info.estimated_days);
          orderData.expected_delivery_date = expectedDate.toISOString().split('T')[0];
        }

        logger.info('Fulfillment type determined from delivery_zones', {
          city,
          fulfillmentType: zoneResult.fulfillment_type,
          source: zoneResult.source,
          deliveryCharge: zoneResult.zone_info.delivery_charge,
          estimatedDays: zoneResult.zone_info.estimated_days,
        });
      } else {
        logger.info('Fulfillment type determined (fallback)', {
          city,
          fulfillmentType: zoneResult.fulfillment_type,
          source: zoneResult.source,
        });
      }
    } else if (!orderData.fulfillment_type) {
      // No city provided, use default
      orderData.fulfillment_type = FULFILLMENT_TYPES.INSIDE_VALLEY;
      logger.debug('No city provided, defaulting to inside_valley');
    }
  }

  // Default to inside_valley if still not set
  if (!orderData.fulfillment_type) {
    orderData.fulfillment_type = FULFILLMENT_TYPES.INSIDE_VALLEY;
  }

  // Create the order
  const order = await orderService.createOrder(orderData, context);

  // ==========================================================================
  // SEND SMS NOTIFICATION (Order Created)
  // ==========================================================================
  try {
    const customerPhone = order.customer?.phone || order.shipping_phone;
    if (customerPhone) {
      await smsService.sendTemplate(customerPhone, 'ORDER_CREATED', {
        customer_name: order.customer?.name || order.shipping_name || 'Customer',
        order_number: order.order_number,
        amount: order.total_amount?.toLocaleString('en-NP') || '0',
      }, {
        context: 'order_created',
        contextId: order.id,
        recipientName: order.customer?.name,
        messageType: 'transactional',
        userId: context?.userId,
      });
    }
  } catch (smsError) {
    // Don't fail the order creation if SMS fails
    logger.error('Failed to send order creation SMS', { 
      orderId: order.id, 
      error: smsError.message 
    });
  }

  // ==========================================================================
  // TRIGGER META CAPI FOR MANUAL/STORE ORDERS (Product-Led Routing)
  // ==========================================================================
  // Online orders trigger CAPI from external.controller.js with browser event_id
  // Manual/Store orders need server-side CAPI trigger here
  
  if (['manual', 'store', 'phone'].includes(orderData.source)) {
    try {
      // Extract order items from the created order
      const orderItems = order.items || order.order_items || [];
      
      // Fire CAPI with automatic channel detection from product
      const capiResult = await metaCAPIService.sendManualPurchaseEvent({
        order: {
          id: order.id,
          order_number: order.order_number,
          total_amount: order.total_amount,
          currency: 'NPR',
        },
        customer: {
          id: order.customer?.id,
          name: order.customer?.name || order.shipping_name,
          phone: order.customer?.phone || order.shipping_phone,
          email: order.customer?.email,
          city: order.shipping_city,
          district: order.shipping_district,
        },
        items: orderItems.map(item => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          sku: item.sku,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      });

      if (capiResult.success) {
        logger.info('Manual order CAPI event sent successfully', {
          orderId: order.id,
          orderNumber: order.order_number,
          source: orderData.source,
          eventId: capiResult.event_id,
        });
      } else {
        logger.warn('Manual order CAPI event failed', {
          orderId: order.id,
          error: capiResult.error,
        });
      }
    } catch (capiError) {
      // Don't fail order creation if CAPI fails
      logger.error('Failed to send manual order CAPI event', {
        orderId: order.id,
        error: capiError.message,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    data: order,
  });
});

/**
 * Get order by ID
 * GET /orders/:id
 */
export const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id);

  res.json({
    success: true,
    data: order,
  });
});

/**
 * Get order by order number
 * GET /orders/number/:orderNumber
 */
export const getOrderByNumber = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderByNumber(req.params.orderNumber);

  res.json({
    success: true,
    data: order,
  });
});

/**
 * List orders with filters
 * GET /orders
 */
export const listOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listOrders(req.query);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

/**
 * Update order details (not status)
 * PATCH /orders/:id
 */
export const updateOrder = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const order = await orderService.updateOrder(req.params.id, req.body, context);

  res.json({
    success: true,
    message: 'Order updated successfully',
    data: order,
  });
});

/**
 * Update order status
 * PATCH /orders/:id/status
 * 
 * State Machine Validation:
 * - Inside Valley: Cannot use 'handover_to_courier' or 'in_transit'
 * - Outside Valley: Cannot use 'out_for_delivery'
 * - Store: Cannot use delivery statuses
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const { status, reason, ...additionalData } = req.body;
  
  // Get current order status before update
  const currentOrder = await orderService.getOrderById(req.params.id);
  const oldStatus = currentOrder?.status;
  
  // Service handles validation via OrderStateMachine
  const order = await orderService.updateStatus(
    req.params.id, 
    { status, reason, ...additionalData },
    context
  );

  // Execute post-transition hooks (SMS, feedback tickets, etc.)
  if (oldStatus !== status) {
    try {
      await executePostTransitionHooks(order, oldStatus, status);
    } catch (hookError) {
      // Don't fail the status update if hooks fail
      logger.error('Post-transition hook failed', { 
        orderId: order.id, 
        from: oldStatus, 
        to: status,
        error: hookError.message 
      });
    }

    // ==========================================================================
    // TRIGGER META CAPI REFUND EVENT (For Cancelled/Refunded Orders)
    // ==========================================================================
    // When order is cancelled or refunded, we need to notify Meta so they can
    // reverse the conversion and improve ad optimization accuracy
    
    if (REFUND_STATUSES.includes(status.toLowerCase()) && !REFUND_STATUSES.includes(oldStatus?.toLowerCase())) {
      try {
        // Fetch full order details with items for refund event
        const fullOrder = await orderService.getOrderById(order.id);
        const orderItems = fullOrder.items || fullOrder.order_items || [];

        const refundResult = await metaCAPIService.sendRefundEvent({
          order: {
            id: fullOrder.id,
            order_number: fullOrder.order_number,
            total_amount: fullOrder.total_amount,
            currency: 'NPR',
            technical_meta: fullOrder.technical_meta || {},
          },
          customer: {
            id: fullOrder.customer?.id,
            name: fullOrder.customer?.name || fullOrder.shipping_name,
            phone: fullOrder.customer?.phone || fullOrder.shipping_phone,
            email: fullOrder.customer?.email,
            city: fullOrder.shipping_city,
          },
          items: orderItems.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            sku: item.sku,
            quantity: item.quantity,
            unit_price: item.unit_price,
          })),
          refund_reason: reason || status,
        });

        if (refundResult.success) {
          logger.info('Refund CAPI event sent successfully', {
            orderId: order.id,
            orderNumber: order.order_number,
            newStatus: status,
            originalEventId: fullOrder.technical_meta?.event_id,
          });
        } else {
          logger.warn('Refund CAPI event failed', {
            orderId: order.id,
            error: refundResult.error,
          });
        }
      } catch (capiError) {
        // Don't fail status update if CAPI fails
        logger.error('Failed to send refund CAPI event', {
          orderId: order.id,
          error: capiError.message,
        });
      }
    }
  }

  res.json({
    success: true,
    message: `Order status updated to ${order.status}`,
    data: order,
  });
});

/**
 * Assign rider to order (Inside Valley only)
 * POST /orders/:id/assign-rider
 * 
 * Requirements:
 * - Order must be 'packed' status
 * - Order must be 'inside_valley' fulfillment type
 * - Rider must exist and be available
 */
export const assignRider = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const { rider_id } = req.body;
  
  const order = await orderService.assignRider(
    req.params.id,
    rider_id,
    context
  );

  // Send SMS to customer with rider info
  try {
    const customerPhone = order.customer?.phone || order.shipping_phone;
    if (customerPhone && order.rider) {
      await smsService.sendTemplate(customerPhone, 'RIDER_ASSIGNED', {
        customer_name: order.customer?.name || 'Customer',
        order_number: order.order_number,
        rider_name: order.rider?.name || 'Our Rider',
        rider_phone: order.rider?.phone || '',
      }, {
        context: 'rider_assigned',
        contextId: order.id,
        userId: context?.userId,
      });
    }
  } catch (smsError) {
    logger.error('Failed to send rider assigned SMS', { orderId: order.id, error: smsError.message });
  }

  res.json({
    success: true,
    message: 'Rider assigned successfully',
    data: order,
  });
});

/**
 * Mark order as out for delivery (Inside Valley)
 * POST /orders/:id/out-for-delivery
 * 
 * Requirements:
 * - Order must have rider_id assigned
 * - Order must be 'packed' status
 * - Order must be 'inside_valley' fulfillment type
 */
export const markOutForDelivery = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  
  const order = await orderService.markOutForDelivery(
    req.params.id,
    context
  );

  // Send SMS: "Your order is out for delivery"
  try {
    const customerPhone = order.customer?.phone || order.shipping_phone;
    if (customerPhone) {
      await smsService.sendTemplate(customerPhone, 'ORDER_SHIPPED', {
        customer_name: order.customer?.name || 'Customer',
        order_number: order.order_number,
        rider_name: order.rider?.name || 'Our Rider',
        rider_phone: order.rider?.phone || '',
      }, {
        context: 'out_for_delivery',
        contextId: order.id,
        userId: context?.userId,
      });
    }
  } catch (smsError) {
    logger.error('Failed to send out for delivery SMS', { orderId: order.id, error: smsError.message });
  }

  res.json({
    success: true,
    message: 'Order marked as out for delivery',
    data: order,
  });
});

/**
 * Handover order to courier (Outside Valley only)
 * POST /orders/:id/handover-courier
 * 
 * Requirements:
 * - Order must be 'packed' status
 * - Order must be 'outside_valley' fulfillment type
 * - Must provide courier_partner and courier_tracking_id
 */
export const handoverToCourier = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const { courier_partner, courier_tracking_id, awb_number } = req.body;
  
  const order = await orderService.handoverToCourier(
    req.params.id,
    {
      courier_partner,
      courier_tracking_id: courier_tracking_id || awb_number,
      awb_number,
    },
    context
  );

  // Send SMS with tracking info
  try {
    const customerPhone = order.customer?.phone || order.shipping_phone;
    if (customerPhone) {
      const trackingMessage = `${order.customer?.name || 'Customer'}, your order #${order.order_number} is shipped via ${courier_partner}. Track: ${order.tracking_url || courier_tracking_id}. - Seetara`;
      
      await smsService.send(customerPhone, trackingMessage, {
        context: 'handover_to_courier',
        contextId: order.id,
        userId: context?.userId,
      });
    }
  } catch (smsError) {
    logger.error('Failed to send courier handover SMS', { orderId: order.id, error: smsError.message });
  }

  res.json({
    success: true,
    message: 'Order handed over to courier',
    data: order,
  });
});

/**
 * Mark order as delivered
 * POST /orders/:id/deliver
 * 
 * Common endpoint for all fulfillment types
 * Can optionally include proof of delivery
 */
export const markDelivered = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const { receiver_name, receiver_phone, pod_image_url, notes } = req.body;
  
  const order = await orderService.markDelivered(
    req.params.id,
    { receiver_name, receiver_phone, pod_image_url, notes },
    context
  );

  // Send thank you SMS to customer
  try {
    const customerPhone = order.customer?.phone || order.shipping_phone;
    if (customerPhone) {
      await smsService.sendTemplate(customerPhone, 'ORDER_DELIVERED', {
        customer_name: order.customer?.name || 'Customer',
        order_number: order.order_number,
      }, {
        context: 'order_delivered',
        contextId: order.id,
        userId: context?.userId,
      });
    }
  } catch (smsError) {
    logger.error('Failed to send delivery confirmation SMS', { orderId: order.id, error: smsError.message });
  }

  // TODO: Trigger review request after 24 hours (scheduled job)

  res.json({
    success: true,
    message: 'Order marked as delivered',
    data: order,
  });
});

/**
 * Mark order as returned
 * POST /orders/:id/return
 */
export const markReturned = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const { return_reason, notes } = req.body;
  
  const order = await orderService.markReturned(
    req.params.id,
    { return_reason, notes },
    context
  );

  // TODO: Update rider/courier metrics
  // TODO: Restore inventory

  res.json({
    success: true,
    message: 'Order marked as returned',
    data: order,
  });
});

/**
 * Get available riders
 * GET /orders/riders/available
 */
export const getAvailableRiders = asyncHandler(async (req, res) => {
  const riders = await orderService.getAvailableRiders();

  res.json({
    success: true,
    data: riders,
  });
});

/**
 * Get courier partners
 * GET /orders/couriers
 */
export const getCourierPartners = asyncHandler(async (req, res) => {
  const couriers = await orderService.getCourierPartners();

  res.json({
    success: true,
    data: couriers,
  });
});

/**
 * Bulk update order status
 * POST /orders/bulk/status
 */
export const bulkUpdateStatus = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const { order_ids, status, reason } = req.body;
  
  const results = await orderService.bulkUpdateStatus(order_ids, status, reason, context);

  res.json({
    success: true,
    message: `Updated ${results.success.length} orders, ${results.failed.length} failed`,
    data: results,
  });
});

/**
 * Delete order (soft delete)
 * DELETE /orders/:id
 */
export const deleteOrder = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  await orderService.deleteOrder(req.params.id, context);

  res.json({
    success: true,
    message: 'Order deleted successfully',
  });
});

/**
 * Get order logs
 * GET /orders/:id/logs
 */
export const getOrderLogs = asyncHandler(async (req, res) => {
  const result = await orderService.getOrderLogs(req.params.id, req.query);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

/**
 * Get order statistics
 * GET /orders/stats
 */
export const getOrderStats = asyncHandler(async (req, res) => {
  const stats = await orderService.getOrderStats(req.query);

  res.json({
    success: true,
    data: stats,
  });
});

export default {
  createOrder,
  getOrder,
  getOrderByNumber,
  listOrders,
  updateOrder,
  updateOrderStatus,
  bulkUpdateStatus,
  deleteOrder,
  getOrderLogs,
  getOrderStats,
  // Nepal Logistics specific
  assignRider,
  markOutForDelivery,
  handoverToCourier,
  markDelivered,
  markReturned,
  getAvailableRiders,
  getCourierPartners,
};
