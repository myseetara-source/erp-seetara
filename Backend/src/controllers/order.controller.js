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
import { 
  getOrderActivities, 
  getRelatedOrders, 
  logComment,
  logActivity,
  logStatusChange,
  ACTIVITY_TYPES 
} from '../services/ActivityLogger.service.js';
import { supabaseAdmin } from '../config/supabase.js';
import { 
  determineFulfillmentType,
  determineFulfillmentTypeFromDB,
  FULFILLMENT_TYPES,
  getNotificationTrigger,
  executePostTransitionHooks,
} from '../services/orderStateMachine.js';
import { 
  validateTransition,
  executeInventoryTrigger,
  getWorkflowInfoForUI,
  DISPATCH_REQUIREMENTS,
} from '../services/order/WorkflowRules.service.js';
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
 * Store orders: Set fulfillment_type = 'store'
 * Manual orders: Operator can choose fulfillment_type
 * 
 * FIX: Now uses database-driven delivery_zones table instead of hardcoded values
 */
export const createOrder = asyncHandler(async (req, res) => {
  // ==========================================================================
  // P0 FIX: CRASH REPORTER - Wrap entire function in try-catch
  // ==========================================================================
  try {
    const context = extractContext(req);
    const orderData = { ...req.body };
    
    // P0 DEBUG: Log FULL request body to trace data loss
    console.log('='.repeat(60));
    console.log('[CreateOrder] 🔥 P0 DEBUG - RAW REQUEST BODY:');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('='.repeat(60));
    
    // DEBUG: Log zone_code, shipping_charges, discount_amount from request (Bug 1, 2, 3)
    logger.info('[CreateOrder] 🔍 DEBUG - Request data received:', {
      zone_code: orderData.zone_code,
      shipping_charges: orderData.shipping_charges,
      discount_amount: orderData.discount_amount,
      fulfillment_type: orderData.fulfillment_type,
      status: orderData.status,
      itemCount: orderData.items?.length
    });
    
    // ==========================================================================
    // P0 FIX: SANITIZE FULFILLMENT TYPE - Map friendly names to DB enums
    // ==========================================================================
    const FULFILLMENT_TYPE_MAP = {
      'Inside': 'inside_valley',
      'Outside': 'outside_valley',
      'Store': 'store',
      'inside': 'inside_valley',
      'outside': 'outside_valley',
      'store': 'store',
      'inside_valley': 'inside_valley',
      'outside_valley': 'outside_valley',
      'INSIDE_VALLEY': 'inside_valley',
      'OUTSIDE_VALLEY': 'outside_valley',
      'POS': 'store',
      'pos': 'store',
    };
    
    if (orderData.fulfillment_type) {
      orderData.fulfillment_type = FULFILLMENT_TYPE_MAP[orderData.fulfillment_type] || orderData.fulfillment_type;
      logger.debug('[CreateOrder] Normalized fulfillment_type:', orderData.fulfillment_type);
    }

    // ==========================================================================
    // AUTO-DETECT FULFILLMENT TYPE FROM DATABASE
    // ==========================================================================
    
    // If source is 'store', set fulfillment to 'store'
    if (orderData.source === 'store') {
      orderData.fulfillment_type = FULFILLMENT_TYPES.STORE;
      logger.debug('Store order detected, setting fulfillment_type to store');
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
  // LOG ACTIVITY: Order Created (with user name)
  // ==========================================================================
  try {
    await logActivity(supabaseAdmin, {
      orderId: order.id,
      user: req.user,  // Pass the actual user from auth middleware
      message: `${req.user?.name || 'Unknown'} created the order`,
      type: ACTIVITY_TYPES.SYSTEM_LOG,
      metadata: { 
        source: order.source,
        fulfillment_type: order.fulfillment_type,
        total_amount: order.total_amount,
      },
    });
  } catch (activityErr) {
    logger.warn('Failed to log order creation activity', { error: activityErr.message });
  }

  // ==========================================================================
  // SEND SMS NOTIFICATION (Order Created)
  // ==========================================================================
  try {
    const customerPhone = order.customer?.phone || order.shipping_phone;
    if (customerPhone) {
      // FIX: Use sendSms instead of sendTemplate (which doesn't exist)
      await smsService.sendSms('ORDER_CREATED', {
        name: order.customer?.name || order.shipping_name || 'Customer',
        order_number: order.order_number,
        amount: order.total_amount?.toLocaleString('en-NP') || '0',
      }, customerPhone, {
        order_id: order.id,
        trigger_event: 'order_created',
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

  // Build response with stock warnings if any
  const response = {
    success: true,
    message: order.message || 'Order created successfully',
    data: order,
  };
  
  // Include stock warnings in response (P0 Fix: Relaxed validation)
  if (order.stockWarnings && order.stockWarnings.length > 0) {
    response.warnings = order.stockWarnings;
    response.hasStockWarnings = true;
  }
  
  res.status(201).json(response);
  
  } catch (error) {
    // ==========================================================================
    // P0 FIX: CRASH REPORTER - Log detailed error for debugging
    // ==========================================================================
    console.error('🔥 CRITICAL ORDER CRASH:', error);
    console.error('📦 Payload Received:', JSON.stringify(req.body, null, 2));
    logger.error('[CreateOrder] CRITICAL FAILURE', {
      error: error.message,
      stack: error.stack,
      payload: req.body,
    });
    
    // Re-throw to let asyncHandler deal with it
    throw error;
  }
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
 * 
 * TRI-CORE ARCHITECTURE:
 * - Accepts fulfillmentType: 'inside_valley' | 'outside_valley' | 'store'
 * - Accepts status (comma-separated for multiple)
 * - Accepts location: 'INSIDE_VALLEY' | 'OUTSIDE_VALLEY' | 'POS'
 * 
 * P0 FIX: Added crash reporter and fulfillment type sanitization for Store POS tab
 */
export const listOrders = asyncHandler(async (req, res) => {
  try {
    logger.info('[OrderController] listOrders called with query:', req.query);
    
    // ==========================================================================
    // P0 FIX: SANITIZE FULFILLMENT TYPE before passing to service
    // This fixes the "Store POS" tab crash
    // ==========================================================================
    const sanitizedQuery = { ...req.query };
    
    if (sanitizedQuery.fulfillmentType) {
      const FULFILLMENT_TYPE_MAP = {
        // Store variations (the likely culprit for Store POS tab crash)
        'store': 'store',
        'Store': 'store',
        'STORE': 'store',
        'store_sale': 'store',
        'POS': 'store',
        'pos': 'store',
        // Inside Valley variations
        'inside': 'inside_valley',
        'Inside': 'inside_valley',
        'INSIDE': 'inside_valley',
        'inside_valley': 'inside_valley',
        'INSIDE_VALLEY': 'inside_valley',
        // Outside Valley variations
        'outside': 'outside_valley',
        'Outside': 'outside_valley',
        'OUTSIDE': 'outside_valley',
        'outside_valley': 'outside_valley',
        'OUTSIDE_VALLEY': 'outside_valley',
      };
      
      const originalType = sanitizedQuery.fulfillmentType;
      sanitizedQuery.fulfillmentType = FULFILLMENT_TYPE_MAP[originalType] || originalType;
      
      logger.debug('[OrderController] Fulfillment type sanitized:', {
        original: originalType,
        sanitized: sanitizedQuery.fulfillmentType
      });
    }
    
    const result = await orderService.listOrders(sanitizedQuery);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
    
  } catch (error) {
    // ==========================================================================
    // P0 FIX: CRASH REPORTER for Store POS tab
    // ==========================================================================
    console.error('🔥 LIST ORDERS CRASH:', error);
    console.error('📦 Query Params:', JSON.stringify(req.query, null, 2));
    
    logger.error('[OrderController] listOrders CRITICAL FAILURE', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    
    // Re-throw to let asyncHandler deal with it
    throw error;
  }
});

/**
 * Update order details (not status)
 * PATCH /orders/:id
 * 
 * P0 FIX: Zone/branch updates are routed to dedicated method
 * that allows updates regardless of order status (routing metadata)
 */
export const updateOrder = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  
  // P0: Separate customer info, zone/branch, fulfillment_type, and other fields
  const { 
    zone_code, 
    destination_branch,
    fulfillment_type,
    courier_partner,    // P0 FIX: Include courier_partner in routing fields
    delivery_type,      // P0 FIX: NCM delivery type (D2D/D2B)
    shipping_charges,   // P0 FIX: Calculated shipping charge
    shipping_name,
    shipping_phone,
    alt_phone,
    shipping_address,
    shipping_city,
    shipping_state,
    shipping_pincode,
    ...otherData 
  } = req.body;
  
  // Customer info fields (always editable)
  const customerInfoFields = { shipping_name, shipping_phone, alt_phone, shipping_address, shipping_city, shipping_state, shipping_pincode };
  const hasCustomerInfo = Object.values(customerInfoFields).some(v => v !== undefined);
  
  // Zone/branch/fulfillment/courier fields (editable until packed)
  // P0 FIX: Added courier_partner, delivery_type, shipping_charges as routing fields
  const routingFields = { zone_code, destination_branch, fulfillment_type, courier_partner, delivery_type, shipping_charges };
  const hasRoutingFields = Object.values(routingFields).some(v => v !== undefined);
  
  // P0: Debug logging - CRITICAL for delivery_type troubleshooting
  console.log('\n🔴🔴🔴 [OrderController] updateOrder RECEIVED:');
  console.log('   req.body:', JSON.stringify(req.body, null, 2));
  console.log('   delivery_type in body:', req.body.delivery_type);
  console.log('   delivery_type extracted:', delivery_type);
  console.log('   routingFields:', JSON.stringify(routingFields, null, 2));
  
  logger.info('[OrderController] updateOrder received:', {
    body: req.body,
    delivery_type_in_body: req.body.delivery_type,
    delivery_type_extracted: delivery_type,
    routingFields,
    hasCustomerInfo,
    hasRoutingFields,
    otherDataKeys: Object.keys(otherData),
    otherDataLength: Object.keys(otherData).length
  });
  
  let order;
  
  // P0: Route to appropriate method based on fields being updated
  if (hasRoutingFields && !hasCustomerInfo && Object.keys(otherData).length === 0) {
    // Only routing fields (zone/branch/fulfillment_type) - use dedicated method
    // This allows updates until order is packed
    order = await orderService.updateRouting(req.params.id, routingFields, context);
  } else if (hasCustomerInfo && !hasRoutingFields && Object.keys(otherData).length === 0) {
    // Only customer info update - use dedicated method (bypasses status restrictions)
    const filteredCustomerInfo = Object.fromEntries(
      Object.entries(customerInfoFields).filter(([, v]) => v !== undefined)
    );
    order = await orderService.updateCustomerInfo(req.params.id, filteredCustomerInfo, context);
  } else if (hasCustomerInfo && hasRoutingFields && Object.keys(otherData).length === 0) {
    // Both customer info AND routing fields - update separately
    // First update customer info (always allowed)
    const filteredCustomerInfo = Object.fromEntries(
      Object.entries(customerInfoFields).filter(([, v]) => v !== undefined)
    );
    await orderService.updateCustomerInfo(req.params.id, filteredCustomerInfo, context);
    // Then update routing (allowed until packed)
    order = await orderService.updateRouting(req.params.id, routingFields, context);
  } else if (Object.keys(otherData).length > 0) {
    // Has other fields - regular update (status-restricted)
    order = await orderService.updateOrder(req.params.id, req.body, context);
  } else {
    // Nothing to update
    return res.status(400).json({
      success: false,
      message: 'No valid fields to update',
    });
  }

  res.json({
    success: true,
    message: 'Order updated successfully',
    data: order,
  });
});

/**
 * Update order remarks (sticky notes)
 * PATCH /orders/:id/remarks
 * 
 * P1 FEATURE: Remarks can be updated regardless of order status
 * Used for: follow-up notes, customer requests, delivery instructions
 */
export const updateOrderRemarks = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const { remarks } = req.body;
  
  // Allow empty string to clear remarks
  if (remarks === undefined) {
    return res.status(400).json({
      success: false,
      message: 'remarks field is required',
    });
  }
  
  const order = await orderService.updateRemarks(req.params.id, remarks, context);

  res.json({
    success: true,
    message: remarks ? 'Remarks updated successfully' : 'Remarks cleared',
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
 * 
 * P0 FIX: Added status sanitization and error handling
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  // ==========================================================================
  // P0 FIX: CRASH REPORTER & STATUS SANITIZATION
  // ==========================================================================
  try {
    console.log('[StatusUpdate] Request received:', req.body);
    logger.info('[StatusUpdate] Request:', {
      orderId: req.params.id,
      body: req.body,
    });
    
    const context = extractContext(req);
    let { status, reason, ...additionalData } = req.body;
    
    // ==========================================================================
    // P0 FIX: SANITIZE STATUS - Map various inputs to DB ENUM values
    // ==========================================================================
    const STATUS_MAP = {
      // Mixed case handling
      'Intake': 'intake',
      'INTAKE': 'intake',
      'New': 'intake',
      'NEW': 'intake',
      'Follow Up': 'follow_up',
      'FollowUp': 'follow_up',
      'FOLLOW_UP': 'follow_up',
      'Converted': 'converted',
      'CONVERTED': 'converted',
      'Hold': 'hold',
      'HOLD': 'hold',
      'Packed': 'packed',
      'PACKED': 'packed',
      'Assigned': 'assigned',
      'ASSIGNED': 'assigned',
      'Out For Delivery': 'out_for_delivery',
      'OutForDelivery': 'out_for_delivery',
      'OUT_FOR_DELIVERY': 'out_for_delivery',
      'Handover To Courier': 'handover_to_courier',
      'HandoverToCourier': 'handover_to_courier',
      'HANDOVER_TO_COURIER': 'handover_to_courier',
      'In Transit': 'in_transit',
      'InTransit': 'in_transit',
      'IN_TRANSIT': 'in_transit',
      'Store Sale': 'store_sale',
      'StoreSale': 'store_sale',
      'STORE_SALE': 'store_sale',
      'Delivered': 'delivered',
      'DELIVERED': 'delivered',
      'Cancelled': 'cancelled',
      'CANCELLED': 'cancelled',
      'Rejected': 'rejected',
      'REJECTED': 'rejected',
      'Return Initiated': 'return_initiated',
      'ReturnInitiated': 'return_initiated',
      'RETURN_INITIATED': 'return_initiated',
      'Returned': 'returned',
      'RETURNED': 'returned',
    };
    
    // Sanitize status
    const sanitizedStatus = STATUS_MAP[status] || status?.toLowerCase() || status;
    logger.debug('[StatusUpdate] Status sanitized:', { original: status, sanitized: sanitizedStatus });
    
    // Get current order with full details before update
    const currentOrder = await orderService.getOrderById(req.params.id);
    const oldStatus = currentOrder?.status;
    
    logger.info('[StatusUpdate] Transitioning:', {
      orderId: req.params.id,
      from: oldStatus,
      to: sanitizedStatus,
      userRole: context.role,
    });
    
    // =========================================================================
    // P0 FIX: WORKFLOW VALIDATION - "Traffic Police"
    // Validates role-based locks, transition rules, and requirements
    // =========================================================================
    const validationResult = await validateTransition(currentOrder, sanitizedStatus, {
      userId: context.userId,
      userRole: context.role || 'operator',
      additionalData,
    });
    
    if (!validationResult.valid) {
      logger.warn('[StatusUpdate] ❌ Transition blocked by workflow rules', {
        orderId: req.params.id,
        from: oldStatus,
        to: sanitizedStatus,
        error: validationResult.error,
        code: validationResult.code,
      });
      
      return res.status(validationResult.code === 'ACCESS_DENIED' ? 403 : 400).json({
        success: false,
        message: validationResult.error,
        code: validationResult.code,
        isLocked: validationResult.isLocked,
        lockedBy: validationResult.lockedBy,
        requires: validationResult.requires,
        insufficientItems: validationResult.insufficientItems,
      });
    }
    
    // Add warnings to response if any
    const warnings = validationResult.warnings || [];
    
    // Service handles the actual update
    const order = await orderService.updateStatus(
      req.params.id, 
      { status: sanitizedStatus, reason, ...additionalData },
      context
    );
    
    // =========================================================================
    // LOG ACTIVITY: Status Changed (with user name)
    // =========================================================================
    if (oldStatus !== sanitizedStatus) {
      try {
        await logStatusChange(supabaseAdmin, {
          orderId: order.id,
          user: req.user,  // Pass the actual user from auth middleware
          oldStatus: oldStatus,
          newStatus: sanitizedStatus,
          reason: reason,
        });
      } catch (activityErr) {
        logger.warn('Failed to log status change activity', { error: activityErr.message });
      }
    }
    
    // =========================================================================
    // P0 FIX: INVENTORY TRIGGER - Execute stock operations
    // =========================================================================
    if (oldStatus !== sanitizedStatus) {
      const inventoryResult = await executeInventoryTrigger(
        { ...currentOrder, ...order },
        oldStatus,
        sanitizedStatus,
        context
      );
      
      if (!inventoryResult.success) {
        logger.warn('[StatusUpdate] Inventory trigger had issues', {
          orderId: order.id,
          action: inventoryResult.action,
          error: inventoryResult.error,
        });
        warnings.push(`Stock operation note: ${inventoryResult.error || 'Check inventory'}`);
      }
    }

    // Execute post-transition hooks (SMS, feedback tickets, etc.)
    if (oldStatus !== sanitizedStatus) {
      try {
        await executePostTransitionHooks(order, oldStatus, sanitizedStatus);
      } catch (hookError) {
        // Don't fail the status update if hooks fail
        logger.error('Post-transition hook failed', { 
          orderId: order.id, 
          from: oldStatus, 
          to: sanitizedStatus,
          error: hookError.message 
        });
      }

      // ==========================================================================
      // TRIGGER META CAPI REFUND EVENT (For Cancelled/Refunded Orders)
      // ==========================================================================
      // When order is cancelled or refunded, we need to notify Meta so they can
      // reverse the conversion and improve ad optimization accuracy
      
      if (REFUND_STATUSES.includes(sanitizedStatus.toLowerCase()) && !REFUND_STATUSES.includes(oldStatus?.toLowerCase())) {
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
            refund_reason: reason || sanitizedStatus,
          });

          if (refundResult.success) {
            logger.info('Refund CAPI event sent successfully', {
              orderId: order.id,
              orderNumber: order.order_number,
              newStatus: sanitizedStatus,
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
    
  } catch (error) {
    // ==========================================================================
    // P0 FIX: CRASH REPORTER - Catch and log specific errors
    // ==========================================================================
    console.error('🔥 STATUS UPDATE CRASH:', error);
    console.error('📦 Status Update Payload:', JSON.stringify(req.body, null, 2));
    
    logger.error('[StatusUpdate] CRITICAL FAILURE', {
      orderId: req.params.id,
      error: error.message,
      stack: error.stack,
      payload: req.body,
    });
    
    // Return specific error message instead of 500
    if (error.message?.includes('Invalid transition') || error.message?.includes('invalid')) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Invalid status transition',
        error: { code: 'INVALID_TRANSITION', message: error.message }
      });
    }
    
    // Re-throw to let asyncHandler deal with unknown errors
    throw error;
  }
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

/**
 * Refresh the orders materialized view (Admin only)
 * POST /orders/refresh-cache
 * 
 * Used after bulk operations to ensure the list view is up-to-date.
 * The materialized view is also refreshed automatically every 30s via pg_cron.
 */
export const refreshOrdersCache = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Refresh the materialized view concurrently (non-blocking)
    const { error } = await supabaseAdmin.rpc('refresh_mv_orders_list_safe');
    
    if (error) {
      // If RPC doesn't exist, try direct SQL
      const { error: sqlError } = await supabaseAdmin
        .from('_refresh_mv')
        .select('*')
        .limit(0); // This will fail gracefully
      
      logger.warn('[OrderController] Materialized view refresh failed', { 
        error: error.message,
        sqlError: sqlError?.message
      });
      
      return res.json({
        success: true,
        message: 'Cache refresh not available (materialized view may not be set up)',
        duration_ms: Date.now() - startTime,
      });
    }
    
    const duration = Date.now() - startTime;
    logger.info('[OrderController] Materialized view refreshed', { duration_ms: duration });
    
    res.json({
      success: true,
      message: 'Orders cache refreshed successfully',
      duration_ms: duration,
    });
  } catch (err) {
    logger.error('[OrderController] Failed to refresh cache', { error: err.message });
    res.json({
      success: true,
      message: 'Cache refresh skipped (not configured)',
      duration_ms: Date.now() - startTime,
    });
  }
});

/**
 * Get workflow info for an order
 * GET /orders/:id/workflow
 * 
 * Returns allowed transitions, lock status, and requirements for the frontend
 * to render the StatusPopover correctly.
 */
export const getOrderWorkflow = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const orderId = req.params.id;
  
  // Get order details
  const order = await orderService.getOrderById(orderId);
  
  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found',
    });
  }
  
  // Get workflow info for UI
  const workflowInfo = getWorkflowInfoForUI(
    order.status,
    order.fulfillment_type,
    context.role || 'operator',
    order.rider_id,
    context.userId
  );
  
  res.json({
    success: true,
    data: {
      orderId,
      orderNumber: order.order_number || order.readable_id,
      ...workflowInfo,
    },
  });
});

/**
 * Get dispatch requirements for a status
 * GET /orders/dispatch-requirements/:status
 */
export const getDispatchRequirements = asyncHandler(async (req, res) => {
  const { status } = req.params;
  const requirements = DISPATCH_REQUIREMENTS[status] || null;
  
  res.json({
    success: true,
    data: {
      status,
      requirements,
      hasRequirements: !!requirements,
    },
  });
});

// =============================================================================
// ORDER ACTIVITIES (Timeline Feature)
// =============================================================================

/**
 * Get order activities (timeline)
 * GET /orders/:id/activities
 * 
 * Returns comprehensive activity history for order audit trail
 */
export const getOrderActivitiesHandler = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 50, offset = 0, types } = req.query;
  
  // Parse types if provided as comma-separated string
  const typeFilter = types ? types.split(',') : null;
  
  const result = await getOrderActivities(supabaseAdmin, id, {
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    types: typeFilter,
  });
  
  res.json({
    success: true,
    ...result,
  });
});

/**
 * Add activity (comment) to order
 * POST /orders/:id/activities
 * 
 * Allows staff to add manual comments/notes to order timeline
 */
export const addOrderActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message, type = 'comment' } = req.body;
  
  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Message is required',
    });
  }
  
  // Only allow 'comment' type from frontend - system logs are auto-generated
  if (type !== 'comment') {
    return res.status(400).json({
      success: false,
      message: 'Only comment type is allowed from this endpoint',
    });
  }
  
  // Use req.user directly - it has id, name, role from auth middleware
  const result = await logComment(supabaseAdmin, {
    orderId: id,
    user: req.user,
    comment: message.trim(),
  });
  
  if (!result.success) {
    return res.status(500).json({
      success: false,
      message: result.error || 'Failed to add comment',
    });
  }
  
  res.status(201).json({
    success: true,
    message: 'Comment added successfully',
    data: { activityId: result.activityId },
  });
});

/**
 * Get related orders (parent/children)
 * GET /orders/:id/related
 * 
 * Returns parent order (if exchange/refund) and any child orders
 */
export const getRelatedOrdersHandler = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await getRelatedOrders(supabaseAdmin, id);
  
  res.json({
    success: true,
    ...result,
  });
});

export default {
  createOrder,
  getOrder,
  getOrderByNumber,
  listOrders,
  updateOrder,
  updateOrderRemarks,
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
  // Workflow info (P0 - Smart UI)
  getOrderWorkflow,
  getDispatchRequirements,
  // Activities (P0 - Timeline Feature)
  getOrderActivitiesHandler,
  addOrderActivity,
  getRelatedOrdersHandler,
};
