/**
 * Order Core Service
 * 
 * Handles basic CRUD operations for orders:
 * - Create orders
 * - Get/List orders
 * - Update orders
 * - Delete orders
 * - Order logging
 */

import { supabaseAdmin } from '../../config/supabase.js';
import config from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import {
  NotFoundError,
  ValidationError,
  DatabaseError,
  InsufficientStockError,
} from '../../utils/errors.js';
import { calculateOrderTotals, formatVariantName, buildSafeOrQuery } from '../../utils/helpers.js';
import { productService } from '../product.service.js';
import { customerService } from '../customer.service.js';
import { integrationService } from '../integration.service.js';
import {
  normalizeOrderStatuses,
  normalizeFulfillmentType,
  VALID_ORDER_STATUSES,
  VALID_FULFILLMENT_TYPES,
  ORDER_STATUS,
  FULFILLMENT_TYPE,
} from '../../constants/status.constants.js';
import {
  EDITABLE_STATUSES,
  TERMINAL_STATUSES,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from '../../constants/index.js';
import {
  logFieldChanges,
  logRoutingChange,
  logOrderCreated,
  logStatusChange,
} from '../ActivityLogger.service.js';

const logger = createLogger('OrderCore');

// P1 REFACTOR: Status configuration for edit permissions (using constants)
const STATUS_CONFIG = {
  new: { canEdit: true, canCancel: true },
  [ORDER_STATUS.INTAKE]: { canEdit: true, canCancel: true },
  confirmed: { canEdit: true, canCancel: true },
  processing: { canEdit: true, canCancel: true },
  [ORDER_STATUS.PACKED]: { canEdit: false, canCancel: true },
  shipped: { canEdit: false, canCancel: false },
  [ORDER_STATUS.IN_TRANSIT]: { canEdit: false, canCancel: false },
  [ORDER_STATUS.DELIVERED]: { canEdit: false, canCancel: false },
  [ORDER_STATUS.CANCELLED]: { canEdit: false, canCancel: false },
  [ORDER_STATUS.RETURNED]: { canEdit: false, canCancel: false },
};

// Fields that can ALWAYS be updated regardless of order status
// These are customer-facing fields that operators need to correct
const ALWAYS_EDITABLE_FIELDS = [
  'shipping_name',
  'shipping_phone',
  'alt_phone',
  'shipping_address',
  'shipping_city',
  'shipping_state',
  'shipping_pincode',
  'zone_code',
  'destination_branch',
  'remarks',
  'staff_remarks',
];

class OrderCoreService {
  // ===========================================================================
  // HELPER METHODS (Performance Optimizations)
  // ===========================================================================

  /**
   * Map location value to fulfillment_type for database query
   * @private
   */
  _mapLocationToFulfillment(location) {
    const map = {
      'INSIDE_VALLEY': 'inside_valley',
      'OUTSIDE_VALLEY': 'outside_valley',
      'POS': 'store',
      'inside_valley': 'inside_valley',
      'outside_valley': 'outside_valley',
      'store': 'store',
    };
    return map[location] || null;
  }

  /**
   * Normalize status for database query (handles comma-separated)
   * @private
   */
  _normalizeStatus(status) {
    if (!status) return null;
    const statuses = normalizeOrderStatuses(status);
    return statuses.length === 1 ? statuses[0] : null; // RPC only supports single status
  }

  // ===========================================================================
  // ORDER CREATION
  // ===========================================================================

  /**
   * Create a new order
   * Full flow: Validate -> Check Stock -> Create/Find Customer -> Create Order -> Deduct Stock -> Log
   */
  async createOrder(data, context = {}) {
    const { customer: customerData, items, ...orderData } = data;
    const { userId, ipAddress, userAgent } = context;

    logger.info('Creating order', { source: orderData.source, itemCount: items.length });

    // Step 1: Validate and get variant details
    const variantIds = items.map(item => item.variant_id);
    const { data: variants, error: variantsError } = await supabaseAdmin
      .from('product_variants')
      .select(`
        id, sku, current_stock, reserved_stock, selling_price, cost_price, color, size,
        product:products(id, name)
      `)
      .in('id', variantIds)
      .eq('is_active', true);

    if (variantsError || !variants || variants.length !== variantIds.length) {
      const found = new Set(variants?.map(v => v.id) || []);
      const missing = variantIds.filter(id => !found.has(id));
      throw new ValidationError('Some variants not found or inactive', { missing });
    }

    const variantMap = new Map(variants.map(v => [v.id, v]));

    // Step 2: Stock Validation - STATUS-BASED LOGIC
    // ==========================================================================
    // P0 FIX: Relaxed stock validation based on order status
    // 
    // INTAKE/FOLLOW_UP: No validation - just log warning if low stock
    // CONVERTED: Soft validation - allow but flag as "backorder" warning
    // PACKED/ASSIGNED/DISPATCHED/DELIVERED: Strict validation - must have stock
    // STORE POS: Soft validation - selling what's physically present
    // ==========================================================================
    const orderStatus = orderData.status || 'intake';
    const fulfillmentType = orderData.fulfillment_type || 'inside_valley';
    const stockValidation = await this._validateStockByStatus(items, orderStatus, variantMap, fulfillmentType);
    
    logger.info('[OrderCore] Stock validation result', {
      status: orderStatus,
      validationMode: stockValidation.mode,
      hasWarnings: stockValidation.warnings.length > 0,
      isBlocked: stockValidation.blocked
    });
    
    // Only block order creation for STRICT validation failures
    if (stockValidation.blocked) {
      const failedItem = stockValidation.unavailable[0];
      logger.error('[OrderCore] Order BLOCKED due to insufficient stock', {
        status: orderStatus,
        sku: failedItem.sku,
        requested: failedItem.requested,
        available: failedItem.available
      });
      throw new InsufficientStockError(
        failedItem.sku,
        failedItem.requested,
        failedItem.available
      );
    }
    
    // Log warnings for low/no stock (but don't block)
    if (stockValidation.warnings.length > 0) {
      logger.warn('[OrderCore] Order accepted with STOCK WARNINGS', {
        status: orderStatus,
        warnings: stockValidation.warnings
      });
    }

    // Step 3: Find or create customer
    const { customer, isNew: isNewCustomer } = await customerService.findOrCreate(customerData);
    logger.debug('Customer resolved', { customerId: customer.id, isNew: isNewCustomer });

    // Step 4: Prepare order items with snapshot data
    const orderItems = items.map(item => {
      const variant = variantMap.get(item.variant_id);
      const unitPrice = item.unit_price ?? variant.selling_price;
      const discountPerUnit = item.discount_per_unit ?? 0;
      
      return {
        variant_id: item.variant_id,
        sku: variant.sku,
        product_name: variant.product.name,
        variant_name: formatVariantName(variant),
        quantity: item.quantity,
        unit_price: unitPrice,
        unit_cost: variant.cost_price,
        discount_per_unit: discountPerUnit,
        total_price: (unitPrice - discountPerUnit) * item.quantity,
      };
    });

    // Step 5: Calculate totals
    // P0 DEBUG: Log incoming values BEFORE calculation
    logger.info('[OrderCore] 💰 FINANCIAL DEBUG - Raw input values:', {
      'orderData.discount_amount': orderData.discount_amount,
      'orderData.shipping_charges': orderData.shipping_charges,
      'orderData.zone_code': orderData.zone_code,
      'typeof discount_amount': typeof orderData.discount_amount,
      'typeof shipping_charges': typeof orderData.shipping_charges,
    });
    
    const totals = calculateOrderTotals(orderItems, {
      discountAmount: orderData.discount_amount || 0,
      shippingCharges: orderData.shipping_charges || 0,
      codCharges: orderData.cod_charges || 0,
    });
    
    // P0 DEBUG: Log calculated totals
    logger.info('[OrderCore] 💰 FINANCIAL DEBUG - Calculated totals:', {
      'totals.discountAmount': totals.discountAmount,
      'totals.shippingCharges': totals.shippingCharges,
      'totals.totalAmount': totals.totalAmount,
    });

    // Step 6: Build order record with snapshots
    const orderRecord = this._buildOrderRecord(orderData, customerData, customer, totals, context);

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert(orderRecord)
      .select()
      .single();

    if (orderError) {
      logger.error('Failed to create order', { error: orderError });
      throw new DatabaseError('Failed to create order', orderError);
    }

    // Step 7: Insert order items
    const itemRecords = orderItems.map(item => ({
      order_id: order.id,
      ...item,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(itemRecords);

    if (itemsError) {
      logger.error('Failed to create order items', { error: itemsError });
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      throw new DatabaseError('Failed to create order items', itemsError);
    }

    // Step 8: Stock Deduction - STATUS-BASED LOGIC
    // ==========================================================================
    // INTAKE/FOLLOW_UP: NO stock deduction (leads don't reserve inventory)
    // CONVERTED: Reserve stock (soft - allow partial if needed)
    // PACKED+: Must deduct stock (strict)
    // P0 FIX: STORE POS: MUST deduct stock (immediate sale completes instantly)
    // ==========================================================================
    
    // P0 FIX: Detect Store POS orders - these need immediate stock deduction
    // P1 REFACTOR: Using constants
    const isStorePOS = fulfillmentType === FULFILLMENT_TYPE.STORE || orderData.status === ORDER_STATUS.STORE_SALE;
    const shouldDeductStock = stockValidation.shouldReserveStock || isStorePOS;
    
    if (shouldDeductStock) {
      const stockItems = items.map(item => ({
        variant_id: item.variant_id,
        quantity: parseInt(item.quantity, 10) || 0,
      }));

      logger.info('[OrderCore] Attempting stock deduction', {
        orderId: order.id,
        status: orderStatus,
        isStorePOS,
        itemCount: stockItems.length
      });

      // P0 FIX: Use different RPC for Store POS vs Delivery orders
      // Store POS: Immediate sale (deduct_stock_sale_batch) - no reservation, direct deduction
      // Delivery: Reservation (deduct_stock_batch_atomic) - reserves stock until packed
      const rpcFunction = isStorePOS ? 'deduct_stock_sale_batch' : 'deduct_stock_batch_atomic';
      
      logger.info('[OrderCore] Using RPC function:', rpcFunction);

      const { data: stockResult, error: stockError } = await supabaseAdmin
        .rpc(rpcFunction, {
          p_items: stockItems,
          p_order_id: order.id,
        });

      if (stockError || !stockResult?.success) {
        // For CONVERTED status, log error but don't rollback (backorder scenario)
        // P1 REFACTOR: Using ORDER_STATUS constant
        if (orderStatus === ORDER_STATUS.CONVERTED && stockValidation.allowPartial) {
          logger.warn('[OrderCore] Stock deduction failed for CONVERTED order - marked as backorder', {
            orderId: order.id,
            error: stockError?.message || stockResult?.error
          });
          // Update order with backorder flag
          await supabaseAdmin
            .from('orders')
            .update({ internal_notes: (order.internal_notes || '') + ' [BACKORDER: Stock unavailable at creation]' })
            .eq('id', order.id);
        } else if (isStorePOS) {
          // P0 FIX: For Store POS, log warning but allow order (customer already has item)
          logger.warn('[OrderCore] Stock deduction failed for STORE POS - allowing but flagged', {
            orderId: order.id,
            error: stockError?.message || stockResult?.error
          });
          await supabaseAdmin
            .from('orders')
            .update({ internal_notes: (order.internal_notes || '') + ' [STOCK WARNING: Deduction failed at sale time]' })
            .eq('id', order.id);
        } else {
          logger.error('Failed to deduct stock', { 
            error: stockError, 
            result: stockResult,
            orderId: order.id
          });
          // Rollback: Delete order and items
          await supabaseAdmin.from('order_items').delete().eq('order_id', order.id);
          await supabaseAdmin.from('orders').delete().eq('id', order.id);
          
          const errorMsg = stockError?.message || stockResult?.error || 'Stock deduction failed';
          const failedItems = stockResult?.failed || [];
          
          if (failedItems.length > 0) {
            const firstFail = failedItems[0];
            throw new InsufficientStockError(
              firstFail.variant_id,
              firstFail.requested,
              firstFail.available
            );
          }
          
          throw new InsufficientStockError(errorMsg);
        }
      } else {
        logger.info('[OrderCore] Stock deducted successfully', {
          orderId: order.id,
          isStorePOS,
          processed: stockResult?.processed
        });
      }
    } else {
      logger.info('[OrderCore] Skipping stock deduction for status:', orderStatus);
    }

    // Step 9: Create initial log
    await this.createOrderLog({
      order_id: order.id,
      action: 'created',
      old_status: null,
      new_status: order.status,
      description: `Order created via ${order.source}`,
      changed_by: userId,
    });

    // Log to activity timeline
    await logOrderCreated(supabaseAdmin, {
      orderId: order.id,
      user: context.user || { id: userId, name: 'System' },
      source: order.source,
      customerName: customer.name,
      totalAmount: order.total_amount,
      itemCount: orderItems.length,
    });

    // Step 10: Trigger integrations
    await this._triggerOrderCreatedIntegrations(order, customer, orderItems);

    logger.info('Order created successfully', { 
      orderId: order.id, 
      orderNumber: order.order_number,
      total: order.total_amount,
      hasStockWarnings: stockValidation.warnings.length > 0
    });

    // Build response with stock warnings if any
    const response = { 
      ...order, 
      items: orderItems, 
      customer,
    };
    
    // Add stock warnings to response (Task 3: Response Message)
    if (stockValidation.warnings.length > 0) {
      response.stockWarnings = stockValidation.warnings;
      response.message = `Order created successfully (Stock Warning: ${stockValidation.warnings.map(w => w.message).join(', ')})`;
    }
    
    return response;
  }

  /**
   * Build order record with all snapshots
   */
  _buildOrderRecord(orderData, customerData, customer, totals, context) {
    const { userId, ipAddress, userAgent } = context;

    // =========================================================================
    // STORE POS ENFORCER - Override values for store/counter sales
    // P1 REFACTOR: Using constants for status and fulfillment type
    // =========================================================================
    const isStorePOS = orderData.fulfillment_type === FULFILLMENT_TYPE.STORE || orderData.status === ORDER_STATUS.STORE_SALE;
    
    if (isStorePOS) {
      logger.info('[OrderCore] STORE POS detected - enforcing defaults', {
        originalShipping: totals.shippingCharges,
        originalPaymentMethod: orderData.payment_method
      });
    }
    
    // =========================================================================
    // STORE POS ENFORCED DEFAULTS (Task 3: Backend Logic Enforcer)
    // =========================================================================
    // - shipping_fee = 0 (no delivery for walk-in customers)
    // - advance_payment = 0 (full payment at counter, no advance concept)
    // - delivery_metadata = null (no rider/courier needed)
    // - status = 'delivered' (instant completion - sale is done immediately)
    // - payment_status = 'paid' (cash at counter)
    // - payment_method = 'cash' (default for POS)
    const storePOSOverrides = isStorePOS ? {
      shipping_charges: 0,
      cod_charges: 0,
      status: ORDER_STATUS.DELIVERED,  // Instant completion - not 'store_sale' anymore
      fulfillment_type: FULFILLMENT_TYPE.STORE,
      payment_method: orderData.payment_method || PAYMENT_METHOD.CASH,
      payment_status: PAYMENT_STATUS.PAID,
      paid_amount: totals.totalAmount - (isStorePOS ? totals.shippingCharges : 0), // Full amount paid
      // Delivery-specific fields nullified for counter sales
      delivery_metadata: null,
      rider_id: null,
      courier_partner: null,
      awb_number: null,
      dispatched_at: new Date().toISOString(), // Mark as dispatched immediately
      delivered_at: new Date().toISOString(),  // Mark as delivered immediately
    } : {};

    // Recalculate total for store POS (no shipping)
    const finalTotal = isStorePOS 
      ? (totals.subtotal - totals.discountAmount) 
      : totals.totalAmount;

    const customerSnapshot = {
      name: customerData.name,
      phone: customerData.phone,
      alt_phone: customerData.alt_phone || null,
      email: customerData.email || null,
      address_line1: isStorePOS ? 'Store Pickup' : (customerData.address_line1 || customerData.address || ''),
      city: isStorePOS ? 'Store' : (customerData.city || ''),
      state: customerData.state || 'Bagmati',
      pincode: customerData.pincode || '',
      customer_tier: customer.tier || 'regular',
      total_orders: customer.total_orders || 0,
    };

    const financialSnapshot = {
      items_subtotal: totals.subtotal,
      shipping_applied: isStorePOS ? 0 : totals.shippingCharges,
      product_discount_amount: totals.discountAmount,
      prepaid_amount: isStorePOS ? finalTotal : (orderData.paid_amount || 0),
      cod_amount: isStorePOS ? 0 : (totals.totalAmount - (orderData.paid_amount || 0)),
      final_total: finalTotal,
    };

    const marketingMetadata = {
      ip_address: ipAddress || orderData.ip_address || null,
      user_agent: userAgent || orderData.user_agent || null,
      fbid: orderData.fbid || null,
      utm_source: orderData.utm_source || null,
      utm_medium: orderData.utm_medium || null,
      utm_campaign: orderData.utm_campaign || null,
    };

    // Generate order number if not provided (trigger will handle it, but set a default)
    const orderNumber = orderData.order_number || this._generateOrderNumber(orderData.source);

    // Build base record
    const baseRecord = {
      order_number: orderNumber,
      customer_id: customer.id,
      source: orderData.source || 'manual',
      source_id: orderData.source_id || null,
      source_order_id: orderData.source_order_id,
      status: orderData.status || 'intake',
      fulfillment_type: orderData.fulfillment_type || 'inside_valley',
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      discount_code: orderData.discount_code,
      shipping_charges: totals.shippingCharges,
      cod_charges: totals.codCharges,
      total_amount: totals.totalAmount,
      payment_method: orderData.payment_method || 'cod',
      payment_status: orderData.paid_amount >= totals.totalAmount ? 'paid' : 
                      orderData.paid_amount > 0 ? 'partial' : 'pending',
      paid_amount: orderData.paid_amount || 0,
      shipping_name: customerData.name,
      shipping_phone: customerData.phone,
      shipping_address: isStorePOS ? 'Store Pickup' : (customerData.address_line1 || customerData.address || ''),
      shipping_city: isStorePOS ? 'Store' : customerData.city,
      shipping_state: customerData.state || 'Bagmati',
      shipping_pincode: customerData.pincode || '',
      priority: orderData.priority || 0,
      internal_notes: isStorePOS 
        ? `[STORE POS] ${orderData.internal_notes || ''}`
        : orderData.internal_notes,
      customer_notes: orderData.customer_notes,
      // P0: Zone code for inside_valley orders
      zone_code: orderData.zone_code || null,
      // P0: Destination branch for outside_valley orders
      destination_branch: orderData.destination_branch || null,
      // P0 FIX: Courier partner for outside_valley orders
      courier_partner: orderData.courier_partner || null,
      // P0 FIX: NCM delivery type (D2D = Home Delivery, D2B = Branch Pickup)
      // This must be saved at order creation to persist across sessions
      delivery_type: orderData.delivery_type || null,
    };

    // P0 DEBUG: Log the final order record being inserted
    logger.info('[OrderCore] 📦 ORDER RECORD DEBUG - Final values to insert:', {
      zone_code: baseRecord.zone_code,
      discount_amount: baseRecord.discount_amount,
      shipping_charges: baseRecord.shipping_charges,
      total_amount: baseRecord.total_amount,
      fulfillment_type: baseRecord.fulfillment_type,
      courier_partner: baseRecord.courier_partner,
      delivery_type: baseRecord.delivery_type,
      destination_branch: baseRecord.destination_branch,
      isStorePOS,
    });

    // Apply Store POS overrides if applicable
    if (isStorePOS) {
      const finalRecord = {
        ...baseRecord,
        ...storePOSOverrides,
        total_amount: finalTotal,
      };
      logger.info('[OrderCore] 📦 STORE POS - Final record:', {
        shipping_charges: finalRecord.shipping_charges,
        discount_amount: finalRecord.discount_amount,
      });
      return finalRecord;
    }

    return baseRecord;
  }

  /**
   * Generate a unique order number
   */
  _generateOrderNumber(source = 'manual') {
    const prefix = 'ORD';
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${date}-${random}`;
  }

  // ===========================================================================
  // STOCK VALIDATION - STATUS-BASED LOGIC (P0 Fix)
  // ===========================================================================

  /**
   * Validate stock availability based on order status and fulfillment type
   * 
   * VALIDATION MODES:
   * - NONE: INTAKE, FOLLOW_UP - No validation, just warnings
   * - SOFT: CONVERTED, STORE POS - Check stock, allow with warnings (backorder)
   * - STRICT: PACKED, ASSIGNED, DISPATCHED, DELIVERED - Must have stock
   * 
   * @param {Array} items - Order items [{variant_id, quantity}]
   * @param {string} status - Order status
   * @param {Map} variantMap - Map of variant data
   * @param {string} fulfillmentType - Fulfillment type (inside_valley, outside_valley, store)
   * @returns {Object} Validation result
   */
  async _validateStockByStatus(items, status, variantMap, fulfillmentType = 'inside_valley') {
    // Define validation modes by status
    const VALIDATION_CONFIG = {
      // No validation - just log warnings (leads/inquiries)
      intake: { mode: 'NONE', shouldReserveStock: false, allowPartial: true },
      follow_up: { mode: 'NONE', shouldReserveStock: false, allowPartial: true },
      
      // Soft validation - allow but flag backorders
      converted: { mode: 'SOFT', shouldReserveStock: true, allowPartial: true },
      hold: { mode: 'SOFT', shouldReserveStock: false, allowPartial: true },
      
      // Strict validation - must have stock
      packed: { mode: 'STRICT', shouldReserveStock: true, allowPartial: false },
      assigned: { mode: 'STRICT', shouldReserveStock: true, allowPartial: false },
      out_for_delivery: { mode: 'STRICT', shouldReserveStock: true, allowPartial: false },
      handover_to_courier: { mode: 'STRICT', shouldReserveStock: true, allowPartial: false },
      in_transit: { mode: 'STRICT', shouldReserveStock: true, allowPartial: false },
      delivered: { mode: 'STRICT', shouldReserveStock: true, allowPartial: false },
      
      // Store POS: Immediate sale - validate stock but don't reserve (will deduct on finalize)
      // NOTE: Using SOFT mode to allow order creation. Stock deducted via separate trigger/flow.
      store_sale: { mode: 'SOFT', shouldReserveStock: false, allowPartial: false },
    };

    // =========================================================================
    // STORE POS OVERRIDE: For POS orders (fulfillment_type = 'store'), 
    // use SOFT validation regardless of status to allow immediate sales
    // P1 REFACTOR: Using FULFILLMENT_TYPE constant
    // =========================================================================
    const isStorePOS = fulfillmentType === FULFILLMENT_TYPE.STORE;
    
    let config;
    if (isStorePOS) {
      // Store POS: SOFT validation - allow order but warn if low stock
      // No stock reservation for counter sales (immediate deduction)
      config = { mode: 'SOFT', shouldReserveStock: false, allowPartial: false };
      logger.info('[StockValidation] STORE POS detected - using SOFT validation', {
        status,
        fulfillmentType
      });
    } else {
      config = VALIDATION_CONFIG[status] || VALIDATION_CONFIG[ORDER_STATUS.INTAKE];
    }
    const warnings = [];
    const unavailable = [];
    
    // Check each item's stock
    for (const item of items) {
      const variant = variantMap.get(item.variant_id);
      
      // P0 FIX: Safer stock logic - handle missing variants gracefully
      if (!variant) {
        logger.warn('[StockValidation] Variant not found, skipping stock check', {
          variant_id: item.variant_id,
          status
        });
        continue;
      }
      
      const currentStock = parseInt(variant.current_stock, 10) || 0;
      const reservedStock = parseInt(variant.reserved_stock, 10) || 0;
      const availableStock = currentStock - reservedStock;
      const requestedQty = parseInt(item.quantity, 10) || 0;
      
      logger.debug('[StockValidation] Item check', {
        status,
        mode: config.mode,
        variant_id: item.variant_id,
        sku: variant.sku,
        requested: requestedQty,
        current: currentStock,
        reserved: reservedStock,
        available: availableStock
      });
      
      if (availableStock < requestedQty) {
        const stockInfo = {
          variant_id: item.variant_id,
          sku: variant.sku,
          productName: variant.product?.name || 'Unknown',
          requested: requestedQty,
          available: availableStock,
          current_stock: currentStock,
          reserved_stock: reservedStock,
          shortage: requestedQty - availableStock,
          message: availableStock <= 0 
            ? `${variant.sku} is Out of Stock` 
            : `${variant.sku} has only ${availableStock} available (need ${requestedQty})`
        };
        
        if (config.mode === 'STRICT') {
          // Strict mode: Add to unavailable list (will block order)
          unavailable.push(stockInfo);
        } else {
          // None/Soft mode: Add to warnings (won't block order)
          warnings.push(stockInfo);
        }
      }
    }
    
    return {
      mode: config.mode,
      shouldReserveStock: config.shouldReserveStock,
      allowPartial: config.allowPartial,
      blocked: unavailable.length > 0,
      unavailable,
      warnings,
    };
  }

  // ===========================================================================
  // ORDER RETRIEVAL
  // ===========================================================================

  /**
   * Get order by ID with all related data
   */
  async getOrderById(id) {
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers(*),
        order_source:order_sources(id, name),
        items:order_items(*, variant:product_variants(id, sku, color, size, current_stock, product:products(id, name, image_url))),
        logs:order_logs(id, old_status, new_status, action, description, created_at)
      `)
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    if (order.logs) {
      order.logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return order;
  }

  /**
   * Get order by order number
   */
  async getOrderByNumber(orderNumber) {
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`*, customer:customers(*), items:order_items(*)`)
      .eq('order_number', orderNumber)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    return order;
  }

  /**
   * List orders with filtering and pagination
   * 
   * TRI-CORE ARCHITECTURE:
   * - Supports multiple statuses (comma-separated)
   * - Maps frontend fulfillmentType to database values
   * - Handles location column for new schema
   */
  async listOrders(options = {}) {
    const {
      page = 1,
      limit = 50, // P1 PERFORMANCE: Default 50 rows for optimal pagination
      sortBy = 'created_at',
      sortOrder = 'desc',
      status,
      statuses,  // P1: Support multiple statuses (comma-separated)
      source,
      customer_id,
      payment_status,
      assigned_to,
      start_date,
      end_date,
      startDate,  // Also accept camelCase
      endDate,    // Also accept camelCase
      search,
      fulfillmentType,
      fulfillment_type,
      location,
      useFastPath = true,  // Use materialized view for <250ms response
      // P1: Logistics filters for Courier Order Creation tab
      logistics_provider,     // Filter by NCM or GBL
      is_logistics_synced,    // Filter synced orders only
      has_courier,            // Filter orders with courier assigned
      logistics_synced_start_date,  // Filter by sync date (start)
      logistics_synced_end_date,    // Filter by sync date (end)
      logisticsSyncedStartDate,     // Also accept camelCase
      logisticsSyncedEndDate,       // Also accept camelCase
    } = options;

    // P1: Combine status and statuses into effectiveStatus
    // If 'statuses' is provided (comma-separated), use it; otherwise use 'status'
    const effectiveStatus = statuses || status || null;

    logger.info('[OrderCore] listOrders called with:', { 
      status, statuses, effectiveStatus, fulfillmentType, fulfillment_type, location, startDate, endDate,
      useFastPath, has_courier, is_logistics_synced, logistics_provider
    });

    // =========================================================================
    // ULTRA-FAST PATH: Use materialized view RPC (Target: <250ms)
    // Falls back to traditional query if RPC not available
    // =========================================================================
    const effectiveFulfillmentType = fulfillmentType || fulfillment_type || 
      (location ? this._mapLocationToFulfillment(location) : null);
    const effectiveStartDate = start_date || startDate;
    const effectiveEndDate = end_date || endDate;

    // P1: Skip fast path when multiple statuses are provided (RPC only supports single status)
    const hasMultipleStatuses = effectiveStatus && effectiveStatus.includes(',');
    
    // P0 FIX: Skip fast path when logistics filters are used OR outside_valley fulfillment
    // The get_orders_fast RPC doesn't return delivery_type, courier_partner, etc.
    // Outside valley orders NEED delivery_type for badge color (D2D vs D2B)
    const hasLogisticsFilters = has_courier || is_logistics_synced !== undefined || 
                                logistics_provider || logistics_synced_start_date || 
                                logistics_synced_end_date || logisticsSyncedStartDate || 
                                logisticsSyncedEndDate;
    
    // P0 FIX: Skip fast path for outside_valley OR when viewing "All Orders" (no filter)
    // When no fulfillment filter, outside_valley orders are mixed in and need live delivery_type
    // The materialized view is a snapshot and may have stale data
    const needsFullQuery = effectiveFulfillmentType === 'outside_valley' || 
                           effectiveFulfillmentType === null ||  // "All Orders" tab - may contain outside_valley
                           hasLogisticsFilters;
    
    // P0 DEBUG: Log query path decision
    if (needsFullQuery) {
      logger.info('[OrderCore] P0 DEBUG: USING FULL QUERY (fast path skipped)', {
        effectiveFulfillmentType,
        hasLogisticsFilters,
        has_courier,
        is_logistics_synced,
        reason: effectiveFulfillmentType === 'outside_valley' ? 'outside_valley orders' : 
                effectiveFulfillmentType === null ? 'All Orders tab (may contain outside_valley)' :
                'logistics filters present',
      });
    }
    
    if (useFastPath && !source && !customer_id && !hasMultipleStatuses && !needsFullQuery) {
      try {
        const { data, error } = await supabaseAdmin.rpc('get_orders_fast', {
          p_page: parseInt(page),
          p_limit: parseInt(limit),
          p_status: effectiveStatus ? this._normalizeStatus(effectiveStatus) : null,
          p_fulfillment_type: effectiveFulfillmentType,
          p_search: search || null,
          p_start_date: effectiveStartDate || null,
          p_end_date: effectiveEndDate || null,
          p_assigned_to: assigned_to || null,
        });

        if (!error && data) {
          logger.debug('[OrderCore] Fast path succeeded', { 
            total: data.pagination?.total,
            rows: data.data?.length 
          });
          
          // Transform to match expected format
          return {
            data: (data.data || []).map(order => ({
              ...order,
              customer_name: order.customer_name || order.customer?.name,
              customer_phone: order.customer_phone || order.customer?.phone,
              customer_address: order.customer_address,
              first_product_name: order.first_product_name,
              first_sku: order.first_sku,
              item_count: order.item_count,
              total_quantity: order.total_quantity,
            })),
            pagination: {
              page: data.pagination.page,
              limit: data.pagination.limit,
              total: data.pagination.total,
              totalPages: data.pagination.totalPages,
              hasNext: data.pagination.hasNext,
              hasPrev: data.pagination.hasPrev,
            },
          };
        }
        
        logger.warn('[OrderCore] Fast path RPC failed, falling back', { error: error?.message });
      } catch (err) {
        logger.warn('[OrderCore] Fast path exception, falling back', { error: err.message });
      }
    }

    // =========================================================================
    // STANDARD PATH: Traditional query with JOINs
    // =========================================================================
    const offset = (page - 1) * limit;

    // =========================================================================
    // P0 FIX: Include order_items with product/variant info for table display
    // The frontend needs: product_name, sku, quantity for display in the list
    // =========================================================================
    // =========================================================================
    // P0 FIX: Include parent_order_id for exchange/refund detection
    // The frontend needs this to show proper badges (Store Sale, Exchange, etc.)
    // =========================================================================
    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, readable_id, status, fulfillment_type, location, source, source_id,
        subtotal, discount_amount, shipping_charges, total_amount,
        payment_status, payment_method, paid_amount, advance_paid,
        shipping_name, shipping_phone,
        shipping_address, shipping_city, assigned_to, rider_id, courier_partner, awb_number,
        delivery_metadata, dispatched_at, delivered_at,
        remarks,
        parent_order_id,
        zone_code,
        destination_branch,
        delivery_type,
        is_logistics_synced,
        external_order_id,
        logistics_provider,
        logistics_synced_at,
        created_at, updated_at,
        customer:customers(id, name, phone, email, tier),
        order_source:order_sources(id, name),
        rider:riders(id, full_name, phone, rider_code),
        items:order_items(
          id,
          quantity,
          sku,
          product_name,
          variant_name,
          unit_price,
          variant:product_variants(
            id,
            sku,
            color,
            size,
            attributes,
            product:products(id, name, image_url)
          )
        )
      `, { count: 'exact' })
      .eq('is_deleted', false);

    // ==========================================================================
    // FILTER BY STATUS (supports comma-separated for multiple statuses)
    // FIX: Use normalization to handle frontend variations (SENT_FOR_DELIVERY → out_for_delivery)
    // P1: Uses effectiveStatus which combines 'status' and 'statuses' params
    // ==========================================================================
    if (effectiveStatus) {
      const normalizedStatuses = normalizeOrderStatuses(effectiveStatus);
      
      if (normalizedStatuses.length === 0) {
        logger.warn('[OrderCore] Invalid status values provided:', status);
        // Return empty result instead of 400 error
        return {
          data: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            totalPages: 0,
          },
        };
      }
      
      logger.debug('[OrderCore] Filtering by normalized statuses:', { 
        original: effectiveStatus, 
        normalized: normalizedStatuses 
      });
      query = query.in('status', normalizedStatuses);
    }
    
    // ==========================================================================
    // FILTER BY FULFILLMENT TYPE (map frontend values to database)
    // FIX: Use centralized normalization + clear error messages (P1)
    // Note: effectiveFulfillmentType already defined above at line 717
    // ==========================================================================
    if (effectiveFulfillmentType) {
      const dbFulfillmentType = normalizeFulfillmentType(effectiveFulfillmentType);
      
      if (!dbFulfillmentType) {
        // P1 FIX: Return clear error message instead of empty result
        const validTypes = VALID_FULFILLMENT_TYPES.join(', ');
        logger.warn('[OrderCore] Invalid fulfillment_type provided', { 
          provided: effectiveFulfillmentType,
          validTypes: VALID_FULFILLMENT_TYPES
        });
        throw new ValidationError(
          `Invalid fulfillment_type: '${effectiveFulfillmentType}'. Expected one of: ${validTypes}`,
          [{ field: 'fulfillment_type', message: `Must be one of: ${validTypes}` }]
        );
      }
      
      logger.debug('[OrderCore] Filtering by fulfillment_type:', {
        original: effectiveFulfillmentType,
        normalized: dbFulfillmentType
      });
      query = query.eq('fulfillment_type', dbFulfillmentType);
    }
    
    // ==========================================================================
    // FILTER BY LOCATION (maps to fulfillment_type - orders table has no location column)
    // FIX: Convert location to fulfillment_type since DB only has fulfillment_type column
    // ==========================================================================
    if (location && !effectiveFulfillmentType) {
      // Map location to fulfillment_type since the orders table doesn't have a location column
      const locationToFulfillmentMap = {
        'INSIDE_VALLEY': 'inside_valley',
        'OUTSIDE_VALLEY': 'outside_valley',
        'POS': 'store',
        'inside_valley': 'inside_valley',
        'outside_valley': 'outside_valley',
        'store': 'store',
      };
      
      const mappedFulfillmentType = locationToFulfillmentMap[location];
      
      if (mappedFulfillmentType) {
        logger.debug('[OrderCore] Mapping location to fulfillment_type:', {
          location: location,
          fulfillment_type: mappedFulfillmentType
        });
        query = query.eq('fulfillment_type', mappedFulfillmentType);
      } else {
        logger.warn('[OrderCore] Unknown location value, ignoring filter:', { location });
      }
    }

    // Apply other filters
    if (source) query = query.eq('source', source);
    if (customer_id) query = query.eq('customer_id', customer_id);
    if (payment_status) query = query.eq('payment_status', payment_status);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);
    
    // Date filters (accept both snake_case and camelCase)
    // Note: effectiveStartDate and effectiveEndDate already defined above at lines 719-720
    if (effectiveStartDate) query = query.gte('created_at', effectiveStartDate);
    if (effectiveEndDate) query = query.lte('created_at', effectiveEndDate);
    
    // =========================================================================
    // P1: LOGISTICS FILTERS for Courier Order Creation tab
    // Filter by logistics_provider, is_logistics_synced, and logistics_synced_at
    // =========================================================================
    
    // Filter by logistics provider (NCM, GBL)
    if (logistics_provider && logistics_provider.toLowerCase() !== 'all') {
      query = query.eq('logistics_provider', logistics_provider.toUpperCase());
      logger.debug('[OrderCore] Filtering by logistics_provider:', logistics_provider);
    }
    
    // Filter synced orders only
    if (is_logistics_synced !== undefined && is_logistics_synced !== null) {
      const syncedFilter = is_logistics_synced === 'true' || is_logistics_synced === true;
      query = query.eq('is_logistics_synced', syncedFilter);
      logger.debug('[OrderCore] Filtering by is_logistics_synced:', syncedFilter);
    }
    
    // Filter orders with courier assigned
    if (has_courier === 'true' || has_courier === true) {
      query = query.not('courier_partner', 'is', null);
      logger.debug('[OrderCore] Filtering orders with courier assigned');
    }
    
    // Logistics sync date filters (filter by when order was synced to courier, not created)
    const effectiveSyncStartDate = logistics_synced_start_date || logisticsSyncedStartDate;
    const effectiveSyncEndDate = logistics_synced_end_date || logisticsSyncedEndDate;
    
    if (effectiveSyncStartDate) {
      query = query.gte('logistics_synced_at', effectiveSyncStartDate);
      logger.debug('[OrderCore] Filtering by logistics_synced_at >=', effectiveSyncStartDate);
    }
    if (effectiveSyncEndDate) {
      query = query.lte('logistics_synced_at', effectiveSyncEndDate);
      logger.debug('[OrderCore] Filtering by logistics_synced_at <=', effectiveSyncEndDate);
    }
    
    // =========================================================================
    // P0 FIX: Use Full-Text Search for high-performance filtering (100+ concurrent users)
    // Falls back to traditional OR query if search_vector column doesn't exist
    // =========================================================================
    if (search) {
      const searchTerm = search.trim();
      if (searchTerm) {
        // Try full-text search first (much faster with GIN index)
        // Format search term for tsquery: "john doe" -> "john:* & doe:*"
        const tsQueryTerms = searchTerm
          .split(/\s+/)
          .filter(Boolean)
          .map(term => `${term}:*`)
          .join(' & ');
        
        logger.debug('[OrderCore] Using full-text search:', { searchTerm, tsQueryTerms });
        
        // Use textSearch for full-text search with partial matching
        query = query.textSearch('search_vector', tsQueryTerms, {
          type: 'plain',
          config: 'simple'
        });
      }
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('[OrderCore] Failed to list orders', { 
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
        errorCode: error.code,
        options
      });
      throw new DatabaseError('Failed to list orders: ' + error.message, error);
    }
    
    // P0 DEBUG: Log RAW data before transformation to verify delivery_type is returned
    const outsideValleyOrders = (data || []).filter(o => o.fulfillment_type === 'outside_valley');
    if (outsideValleyOrders.length > 0) {
      logger.info('[OrderCore] 🔥 RAW DATA BEFORE TRANSFORM - Outside Valley orders:', {
        count: outsideValleyOrders.length,
        samples: outsideValleyOrders.slice(0, 3).map(o => ({
          id: o.id,
          readable_id: o.readable_id,
          delivery_type: o.delivery_type,
          courier_partner: o.courier_partner,
          destination_branch: o.destination_branch,
        }))
      });
    }

    // =========================================================================
    // P0 FIX: Fetch child orders with items for proper exchange/refund analysis
    // This determines: full refund, partial refund, full exchange, partial exchange
    // =========================================================================
    const orderIds = (data || []).map(o => o.id);
    let exchangeAnalysis = {};  // Map of parentId -> analysis
    
    if (orderIds.length > 0) {
      // Get child orders with their items
      const { data: childOrders } = await supabaseAdmin
        .from('orders')
        .select(`
          id, parent_order_id, total_amount,
          items:order_items(quantity, unit_price)
        `)
        .in('parent_order_id', orderIds)
        .not('parent_order_id', 'is', null);
      
      if (childOrders) {
        // Analyze each child and aggregate by parent
        childOrders.forEach(child => {
          const parentId = child.parent_order_id;
          if (!exchangeAnalysis[parentId]) {
            exchangeAnalysis[parentId] = {
              has_children: true,
              total_returned_items: 0,
              total_new_items: 0,
              total_return_amount: 0,
              total_new_amount: 0,
            };
          }
          
          const items = child.items || [];
          items.forEach(item => {
            if (item.quantity < 0) {
              // Returned item
              exchangeAnalysis[parentId].total_returned_items += Math.abs(item.quantity);
              exchangeAnalysis[parentId].total_return_amount += Math.abs(item.quantity * (item.unit_price || 0));
            } else if (item.quantity > 0) {
              // New item
              exchangeAnalysis[parentId].total_new_items += item.quantity;
              exchangeAnalysis[parentId].total_new_amount += item.quantity * (item.unit_price || 0);
            }
          });
        });
      }
    }

    // Transform the data to flatten nested objects for frontend consumption
    const transformedData = (data || []).map(order => {
      // =========================================================================
      // P0 FIX: Extract item data for table display
      // The frontend table needs: product_name, sku, quantity from items
      // =========================================================================
      const items = order.items || [];
      const itemCount = items.length;
      const firstItem = items[0] || null;
      
      // Extract first item's product info for table display
      let firstProductName = null;
      let firstSku = null;
      let firstQuantity = null;
      let firstVariantName = null;
      
      if (firstItem) {
        // Try order_items snapshot first (product_name, sku stored at creation)
        firstProductName = firstItem.product_name || null;
        firstSku = firstItem.sku || null;
        firstQuantity = firstItem.quantity || 0;
        firstVariantName = firstItem.variant_name || null;
        
        // Fallback to joined variant/product data
        if (!firstProductName && firstItem.variant?.product?.name) {
          firstProductName = firstItem.variant.product.name;
        }
        if (!firstSku && firstItem.variant?.sku) {
          firstSku = firstItem.variant.sku;
        }
        if (!firstVariantName && firstItem.variant) {
          const v = firstItem.variant;
          if (v.attributes && Object.keys(v.attributes).length > 0) {
            firstVariantName = Object.values(v.attributes).join(' / ');
          } else if (v.color || v.size) {
            firstVariantName = [v.color, v.size].filter(Boolean).join(' / ');
          }
        }
      }

      // =========================================================================
      // Calculate total quantity from items (for partial exchange detection)
      // =========================================================================
      const totalQuantity = items.reduce((sum, item) => sum + Math.abs(item.quantity || 0), 0);
      const hasReturnItems = items.some(item => (item.quantity || 0) < 0);
      const hasNewItems = items.some(item => (item.quantity || 0) > 0);

      // =========================================================================
      // EXCHANGE/REFUND STATUS DETERMINATION
      // For Parent Orders (orders that have exchange/refund children):
      //   - Full Refund: All items returned, no new items
      //   - Partial Refund: Some items returned, no new items
      //   - Full Exchange: All items returned + new items added
      //   - Partial Exchange: Some items returned + new items added
      // =========================================================================
      const analysis = exchangeAnalysis[order.id];
      let exchangeStatus = null;
      
      if (analysis?.has_children) {
        const parentTotalItems = totalQuantity;
        const returnedItems = analysis.total_returned_items;
        const newItems = analysis.total_new_items;
        
        const isFullReturn = returnedItems >= parentTotalItems;
        const isPartialReturn = returnedItems > 0 && returnedItems < parentTotalItems;
        const hasNewExchangeItems = newItems > 0;
        
        if (isFullReturn && !hasNewExchangeItems) {
          exchangeStatus = 'full_refund';  // All items returned, nothing new
        } else if (isPartialReturn && !hasNewExchangeItems) {
          exchangeStatus = 'partial_refund';  // Some items returned, nothing new
        } else if (isFullReturn && hasNewExchangeItems) {
          exchangeStatus = 'full_exchange';  // All items returned + new items
        } else if ((isPartialReturn || returnedItems > 0) && hasNewExchangeItems) {
          exchangeStatus = 'partial_exchange';  // Some items returned + new items
        }
      }

      return {
        ...order,
        // Flatten customer data for frontend
        customer_name: order.customer?.name || order.shipping_name || 'Unknown',
        customer_phone: order.customer?.phone || order.shipping_phone || '',
        customer_city: order.shipping_city || '',
        // =========================================================================
        // P0 FIX: Include rider info for dispatch display
        // The frontend shows rider_name in the DELIVERY column
        // =========================================================================
        rider_name: order.rider?.full_name || null,
        rider_phone: order.rider?.phone || null,
        rider_code: order.rider?.rider_code || null,
        assigned_rider: order.rider ? {
          id: order.rider.id,
          name: order.rider.full_name,
          phone: order.rider.phone,
          code: order.rider.rider_code,
        } : null,
        // Item count from actual items array
        item_count: itemCount,
        // First item data for table display (Product, SKU, Qty columns)
        first_product_name: firstProductName,
        first_sku: firstSku,
        first_quantity: firstQuantity,
        first_variant_name: firstVariantName,
        // Keep full items array for detail views
        items: items,
        // Ensure vendor_name exists (may be null)
        vendor_name: order.vendor_name || null,
        // =========================================================================
        // Exchange/Refund detection flags (Enhanced)
        // =========================================================================
        parent_order_id: order.parent_order_id || null,
        has_exchange_children: !!analysis?.has_children,
        total_quantity: totalQuantity,
        has_return_items: hasReturnItems,
        has_new_items: hasNewItems,
        is_exchange_child: !!order.parent_order_id,
        is_refund_only: !!order.parent_order_id && (order.total_amount || 0) < 0 && !hasNewItems,
        // New: Detailed exchange status for parent orders
        exchange_status: exchangeStatus,
        exchange_analysis: analysis || null,
      };
    });

    // P0 DEBUG: Log delivery_type values for ALL orders (not just outside_valley)
    const deliveryTypes = transformedData.map(o => ({
      readable_id: o.readable_id,
      delivery_type: o.delivery_type,
      courier_partner: o.courier_partner,
      fulfillment_type: o.fulfillment_type,
    }));
    logger.info('[OrderCore] 🔴 P0 DEBUG: Orders delivery_type values:', { 
      totalCount: deliveryTypes.length,
      outsideValleyCount: deliveryTypes.filter(o => o.fulfillment_type === 'outside_valley').length,
      samples: deliveryTypes.filter(o => o.fulfillment_type === 'outside_valley').slice(0, 5), // First 5 outside_valley orders
    });
    
    if (effectiveFulfillmentType === 'outside_valley') {
      logger.info('[OrderCore] P0 DEBUG: Outside Valley ONLY filter active:', { 
        count: deliveryTypes.length,
        samples: deliveryTypes.slice(0, 5), // First 5 orders
      });
    }
    
    return {
      data: transformedData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNext: page < Math.ceil((count || 0) / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get order statistics
   * 
   * PERFORMANCE OPTIMIZED (Migration 109):
   * - Uses SQL RPC function instead of fetching all orders
   * - Single query with GROUP BY aggregation
   * - Handles 10,000+ orders in <100ms
   */
  async getOrderStats(options = {}) {
    const { start_date, end_date, assigned_to, fulfillment_type } = options;

    try {
      // Use optimized RPC function (migration 109)
      const { data, error } = await supabaseAdmin.rpc('get_order_stats_v2', {
        p_start_date: start_date || null,
        p_end_date: end_date || null,
        p_assigned_to: assigned_to || null,
        p_fulfillment_type: fulfillment_type || null,
      });

      if (error) {
        logger.warn('[OrderCore] RPC get_order_stats_v2 failed, falling back to JS aggregation', { 
          error: error.message 
        });
        // Fallback to legacy method if RPC not available
        return this._getOrderStatsLegacy(options);
      }

      logger.debug('[OrderCore] Order stats retrieved via RPC', { 
        total: data?.total,
        statuses: Object.keys(data?.byStatus || {}).length
      });

      return {
        total: data.total || 0,
        byStatus: data.byStatus || {},
        totalRevenue: data.totalRevenue || 0,
        pendingRevenue: data.pendingRevenue || 0,
        avgOrderValue: data.avgOrderValue || 0,
        byPaymentStatus: data.byPaymentStatus || {},
        byFulfillmentType: data.byFulfillmentType || {},
      };
    } catch (err) {
      logger.error('[OrderCore] Failed to get order stats', { error: err.message });
      // Fallback to legacy method
      return this._getOrderStatsLegacy(options);
    }
  }

  /**
   * Legacy order stats method (fallback if RPC not available)
   * @private
   */
  async _getOrderStatsLegacy(options = {}) {
    const { start_date, end_date, assigned_to } = options;

    let query = supabaseAdmin
      .from('orders')
      .select('status, total_amount, payment_status, fulfillment_type')
      .eq('is_deleted', false);

    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get order stats (legacy)', { error });
      throw new DatabaseError('Failed to get order stats', error);
    }

    const stats = {
      total: data.length,
      byStatus: {},
      totalRevenue: 0,
      pendingRevenue: 0,
      byPaymentStatus: {},
      byFulfillmentType: {},
    };

    for (const order of data) {
      // Status counts
      stats.byStatus[order.status] = (stats.byStatus[order.status] || 0) + 1;
      
      // Revenue calculations
      // P1 REFACTOR: Using ORDER_STATUS constants
      if (order.status === ORDER_STATUS.DELIVERED) {
        stats.totalRevenue += order.total_amount;
      } else if (![ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURNED].includes(order.status)) {
        stats.pendingRevenue += order.total_amount;
      }
      
      // Payment status counts
      if (order.payment_status) {
        stats.byPaymentStatus[order.payment_status] = (stats.byPaymentStatus[order.payment_status] || 0) + 1;
      }
      
      // Fulfillment type counts
      if (order.fulfillment_type) {
        stats.byFulfillmentType[order.fulfillment_type] = (stats.byFulfillmentType[order.fulfillment_type] || 0) + 1;
      }
    }

    return stats;
  }

  // ===========================================================================
  // ORDER UPDATES
  // ===========================================================================

  /**
   * Update order details (only allowed for certain statuses)
   */
  async updateOrder(id, data, context = {}) {
    const { userId } = context;

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    const statusConfig = STATUS_CONFIG[order.status];
    if (!statusConfig?.canEdit) {
      throw new ValidationError(`Cannot edit order in ${order.status} status`);
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      throw new DatabaseError('Failed to update order', updateError);
    }

    await this.createOrderLog({
      order_id: id,
      old_status: order.status,
      new_status: order.status,
      action: 'updated',
      description: 'Order details updated',
      created_by: userId,
    });

    return this.getOrderById(id);
  }

  /**
   * Update order remarks (allowed for any status - remarks are "sticky notes")
   * P1 FIX: Separate method for remarks to allow updates regardless of order status
   */
  async updateRemarks(id, remarks, context = {}) {
    const { userId, user } = context;

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, remarks, status')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    const oldRemarks = order.remarks;

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        remarks: remarks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      throw new DatabaseError('Failed to update remarks', updateError);
    }

    // Log to activity timeline with before/after values
    await logFieldChanges(supabaseAdmin, {
      orderId: id,
      user: user || { id: userId, name: 'System' },
      oldValues: { remarks: oldRemarks },
      newValues: { remarks: remarks },
      category: 'remarks',
    });

    // Also log to order_logs for backward compatibility
    await this.createOrderLog({
      order_id: id,
      old_status: order.status,
      new_status: order.status,
      action: 'remarks_updated',
      description: remarks ? `Remarks updated: "${remarks.substring(0, 50)}${remarks.length > 50 ? '...' : ''}"` : 'Remarks cleared',
      changed_by: userId,
    });

    logger.info('[OrderCore] Remarks updated', { orderId: id, remarksLength: remarks?.length || 0 });

    return this.getOrderById(id);
  }

  /**
   * Update customer info (name, phone, address) - allowed for ANY status
   * P0 FIX: Customer info corrections should always be allowed
   * These are "always editable" fields that operators need to fix typos, etc.
   */
  async updateCustomerInfo(id, data, context = {}) {
    const { userId, user } = context;

    // Filter to only allow customer-related fields and staff remarks
    const allowedFields = ['shipping_name', 'shipping_phone', 'alt_phone', 'shipping_address', 'shipping_city', 'shipping_state', 'shipping_pincode', 'staff_remarks'];
    const updateData = {};
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No valid customer fields to update');
    }

    // P0 FIX: Check order exists and get current values for change tracking
    const selectFields = ['id', 'order_number', 'is_deleted', 'status', ...allowedFields].join(', ');
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(selectFields)
      .eq('id', id)
      .single();

    if (error || !order) {
      logger.error('[OrderCore] updateCustomerInfo - Order not found', { id, error });
      throw new NotFoundError('Order');
    }

    // Check if soft-deleted
    if (order.is_deleted === true) {
      throw new NotFoundError('Order');
    }

    // Build old values object for activity logging
    const oldValues = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        oldValues[field] = order[field];
      }
    }

    // Add timestamp
    updateData.updated_at = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      logger.error('[OrderCore] Failed to update customer info', { orderId: id, error: updateError });
      throw new DatabaseError('Failed to update customer info', updateError);
    }

    // Log to activity timeline with detailed before/after values
    await logFieldChanges(supabaseAdmin, {
      orderId: id,
      user: user || { id: userId, name: 'System' },
      oldValues,
      newValues: updateData,
      category: 'customer_info',
    });

    // Also log to order_logs for backward compatibility
    const changedFields = Object.keys(updateData).filter(k => k !== 'updated_at').join(', ');
    await this.createOrderLog({
      order_id: id,
      old_status: order.status,
      new_status: order.status,
      action: 'customer_info_updated',
      description: `Customer info updated: ${changedFields}`,
      changed_by: userId,
    });

    logger.info('[OrderCore] Customer info updated', { orderId: id, fields: changedFields });

    return this.getOrderById(id);
  }

  /**
   * Update order zone/branch (allowed for any non-terminal status)
   * P0 FIX: Zone/branch are routing metadata and can be updated for active orders
   */
  async updateZoneBranch(id, data, context = {}) {
    // Delegate to updateRouting for backward compatibility
    return this.updateRouting(id, data, context);
  }

  /**
   * Update order routing (zone, branch, fulfillment_type)
   * P0 FIX: 
   * - fulfillment_type can only be changed before order is packed
   * - Zone/branch are routing metadata and can be updated for active orders
   * 
   * RULE: fulfillment_type is locked once order is packed (inventory is allocated)
   */
  async updateRouting(id, data, context = {}) {
    const { userId } = context;
    const { zone_code, destination_branch, fulfillment_type, courier_partner, delivery_type, shipping_charges } = data;

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, fulfillment_type, zone_code, destination_branch, courier_partner')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    const updateData = { updated_at: new Date().toISOString() };
    const logMessages = [];

    // P0: Handle fulfillment_type change
    // P1 REFACTOR: Using imported EDITABLE_STATUSES from constants
    if (fulfillment_type !== undefined && fulfillment_type !== order.fulfillment_type) {
      // Use imported EDITABLE_STATUSES from constants/index.js
      if (!EDITABLE_STATUSES.includes(order.status)) {
        throw new ValidationError(
          `Cannot change fulfillment type after order is ${order.status}. ` +
          `Fulfillment type can only be changed before packing.`
        );
      }
      
      // Validate fulfillment type using constants
      const validTypes = [FULFILLMENT_TYPE.INSIDE_VALLEY, FULFILLMENT_TYPE.OUTSIDE_VALLEY];
      if (!validTypes.includes(fulfillment_type)) {
        throw new ValidationError(`Invalid fulfillment type. Must be one of: ${validTypes.join(', ')}`);
      }
      
      updateData.fulfillment_type = fulfillment_type;
      
      // Clear zone/branch/courier when switching fulfillment type
      if (fulfillment_type === FULFILLMENT_TYPE.INSIDE_VALLEY) {
        updateData.destination_branch = null;  // Clear outside valley branch
        updateData.courier_partner = null;     // Clear courier partner
        updateData.delivery_type = null;       // Clear delivery type
      } else if (fulfillment_type === 'outside_valley') {
        updateData.zone_code = null;  // Clear inside valley zone
      }
      
      logMessages.push(`Fulfillment type changed to ${fulfillment_type}`);
    }

    // Get the effective fulfillment type (after potential update)
    const effectiveFulfillmentType = updateData.fulfillment_type || order.fulfillment_type;

    // P0: Handle zone_code change
    if (zone_code !== undefined) {
      if (effectiveFulfillmentType !== 'inside_valley') {
        throw new ValidationError('Zone code can only be set for inside_valley orders');
      }
      // Validate zone code
      const validZones = ['NORTH', 'WEST', 'CENTER', 'EAST', 'LALIT'];
      if (zone_code && !validZones.includes(zone_code)) {
        throw new ValidationError(`Invalid zone code. Must be one of: ${validZones.join(', ')}`);
      }
      updateData.zone_code = zone_code;
      if (zone_code) {
        logMessages.push(`Zone set to ${zone_code}`);
      }
    }

    // P0: Handle destination_branch change
    if (destination_branch !== undefined) {
      if (effectiveFulfillmentType !== 'outside_valley') {
        throw new ValidationError('Destination branch can only be set for outside_valley orders');
      }
      updateData.destination_branch = destination_branch || null;
      if (destination_branch) {
        logMessages.push(`Branch set to "${destination_branch}"`);
      }
    }

    // P0 FIX: Handle courier_partner change
    if (courier_partner !== undefined) {
      if (effectiveFulfillmentType !== 'outside_valley') {
        throw new ValidationError('Courier partner can only be set for outside_valley orders');
      }
      // Validate courier partner
      const validCouriers = ['Nepal Can Move', 'Gaau Besi'];
      if (courier_partner && !validCouriers.includes(courier_partner)) {
        throw new ValidationError(`Invalid courier partner. Must be one of: ${validCouriers.join(', ')}`);
      }
      updateData.courier_partner = courier_partner || null;
      if (courier_partner) {
        logMessages.push(`Courier set to "${courier_partner}"`);
      }
    }

    // P0 FIX: Handle delivery_type change (NCM specific: D2D vs D2B)
    if (delivery_type !== undefined) {
      // CRITICAL: Normalize delivery_type to ensure it's always D2D, D2B, or null
      // Don't use `delivery_type || null` as that would convert empty string to null
      let normalizedDeliveryType = null;
      if (delivery_type) {
        const upper = delivery_type.toString().toUpperCase().trim();
        if (upper === 'D2B' || upper.includes('PICKUP') || upper.includes('BRANCH')) {
          normalizedDeliveryType = 'D2B';
        } else if (upper === 'D2D' || upper.includes('HOME') || upper.includes('DOOR')) {
          normalizedDeliveryType = 'D2D';
        }
      }
      updateData.delivery_type = normalizedDeliveryType;
      logger.info('[OrderCore] P0 DEBUG: delivery_type SAVED to DB:', {
        orderId: id,
        delivery_type_received: delivery_type,
        delivery_type_normalized: normalizedDeliveryType,
      });
    }

    // P0 FIX: Handle shipping_charges change
    if (shipping_charges !== undefined) {
      updateData.shipping_charges = shipping_charges;
      if (shipping_charges) {
        logMessages.push(`Shipping charge set to Rs.${shipping_charges}`);
      }
    }

    // Perform the update
    console.log('\n🔥🔥🔥 [OrderCore.updateRouting] ABOUT TO UPDATE DB:');
    console.log('   Order ID:', id);
    console.log('   updateData:', JSON.stringify(updateData, null, 2));
    
    const { data: updateResult, error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select('id, delivery_type, courier_partner, destination_branch');

    console.log('🔥 [OrderCore.updateRouting] UPDATE RESULT:');
    console.log('   Error:', updateError?.message || 'none');
    console.log('   Returned delivery_type:', updateResult?.[0]?.delivery_type);

    if (updateError) {
      throw new DatabaseError('Failed to update routing info', updateError);
    }

    // Log to activity timeline with detailed before/after values
    const oldRoutingValues = {
      fulfillment_type: order.fulfillment_type,
      zone_code: order.zone_code,
      destination_branch: order.destination_branch,
      courier_partner: order.courier_partner,
    };
    const newRoutingValues = {};
    if (fulfillment_type !== undefined) newRoutingValues.fulfillment_type = updateData.fulfillment_type;
    if (zone_code !== undefined) newRoutingValues.zone_code = updateData.zone_code;
    if (destination_branch !== undefined) newRoutingValues.destination_branch = updateData.destination_branch;
    if (courier_partner !== undefined) newRoutingValues.courier_partner = updateData.courier_partner;

    if (Object.keys(newRoutingValues).length > 0) {
      await logRoutingChange(supabaseAdmin, {
        orderId: id,
        user: context.user || { id: userId, name: 'System' },
        oldValues: oldRoutingValues,
        newValues: newRoutingValues,
      });
    }

    // Log the change to order_logs for backward compatibility
    if (logMessages.length > 0) {
      await this.createOrderLog({
        order_id: id,
        old_status: order.status,
        new_status: order.status,
        action: 'routing_updated',
        description: logMessages.join(', '),
        changed_by: userId,
      });
    }

    logger.info('[OrderCore] Routing updated', { 
      orderId: id, 
      fulfillment_type, 
      zone_code, 
      destination_branch,
      courier_partner,
      delivery_type,
      shipping_charges,
      changes: logMessages
    });

    // P0 FIX: Trigger background refresh of materialized view
    // This ensures the orders list shows updated delivery_type immediately
    // Non-blocking - don't await, just fire and forget
    supabaseAdmin.rpc('refresh_mv_orders_list_safe').then(({ error }) => {
      if (error) {
        logger.warn('[OrderCore] Background MV refresh failed (non-critical):', error.message);
      } else {
        logger.debug('[OrderCore] Background MV refresh triggered after routing update');
      }
    }).catch(() => {
      // Ignore errors - this is just a performance optimization
    });

    return this.getOrderById(id);
  }

  /**
   * Soft delete order
   */
  async deleteOrder(id, context = {}) {
    const { userId } = context;

    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
      })
      .eq('id', id);

    if (error) {
      throw new DatabaseError('Failed to delete order', error);
    }

    return { success: true };
  }

  // ===========================================================================
  // ORDER LOGGING
  // ===========================================================================

  /**
   * Create order activity log
   */
  async createOrderLog(logData) {
    const { error } = await supabaseAdmin
      .from('order_logs')
      .insert(logData);

    if (error) {
      logger.warn('Failed to create order log', { error, logData });
    }
  }

  /**
   * Get order logs
   */
  async getOrderLogs(orderId, options = {}) {
    const { limit = 50 } = options;

    const { data, error } = await supabaseAdmin
      .from('order_logs')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError('Failed to get order logs', error);
    }

    return data || [];
  }

  // ===========================================================================
  // INTEGRATIONS
  // ===========================================================================

  async _triggerOrderCreatedIntegrations(order, customer, items) {
    try {
      if (config.sms.apiKey) {
        // SMS notification handled by SMS service
      }
      if (config.facebook.pixelId) {
        await integrationService.sendPurchaseEvent({
          orderId: order.id,
          orderNumber: order.order_number,
          totalAmount: order.total_amount,
          currency: 'NPR',
          items: items,
          customer: customer,
        });
      }
    } catch (error) {
      logger.warn('Integration trigger failed', { error: error.message });
    }
  }
}

export const orderCoreService = new OrderCoreService();
export default orderCoreService;
