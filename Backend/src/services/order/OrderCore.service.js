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
import { calculateOrderTotals, formatVariantName } from '../../utils/helpers.js';
import { productService } from '../product.service.js';
import { customerService } from '../customer.service.js';
import { integrationService } from '../integration.service.js';

const logger = createLogger('OrderCore');

// Status configuration for edit permissions
const STATUS_CONFIG = {
  intake: { canEdit: true, canCancel: true },
  confirmed: { canEdit: true, canCancel: true },
  packed: { canEdit: false, canCancel: true },
  shipped: { canEdit: false, canCancel: false },
  delivered: { canEdit: false, canCancel: false },
  cancelled: { canEdit: false, canCancel: false },
  returned: { canEdit: false, canCancel: false },
};

class OrderCoreService {
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

    // Step 2: Check stock availability
    const stockCheck = await productService.checkStock(items);
    if (!stockCheck.isAvailable) {
      throw new InsufficientStockError(
        stockCheck.unavailable[0].sku,
        stockCheck.unavailable[0].requested,
        stockCheck.unavailable[0].available
      );
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
    const totals = calculateOrderTotals(orderItems, {
      discountAmount: orderData.discount_amount || 0,
      shippingCharges: orderData.shipping_charges || 0,
      codCharges: orderData.cod_charges || 0,
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

    // Step 8: Deduct stock
    for (const item of items) {
      await productService.updateStock(item.variant_id, -item.quantity, {
        reason: 'sale',
        reference_id: order.id,
        reference_type: 'order',
      });
    }

    // Step 9: Create initial log
    await this.createOrderLog({
      order_id: order.id,
      action: 'created',
      new_status: order.status,
      description: `Order created via ${order.source}`,
      created_by: userId,
    });

    // Step 10: Trigger integrations
    await this._triggerOrderCreatedIntegrations(order, customer, orderItems);

    logger.info('Order created successfully', { 
      orderId: order.id, 
      orderNumber: order.order_number,
      total: order.total_amount 
    });

    return { ...order, items: orderItems, customer };
  }

  /**
   * Build order record with all snapshots
   */
  _buildOrderRecord(orderData, customerData, customer, totals, context) {
    const { userId, ipAddress, userAgent } = context;

    const customerSnapshot = {
      name: customerData.name,
      phone: customerData.phone,
      alt_phone: customerData.alt_phone || null,
      email: customerData.email || null,
      address_line1: customerData.address_line1 || customerData.address || '',
      city: customerData.city || '',
      state: customerData.state || 'Bagmati',
      pincode: customerData.pincode || '',
      customer_tier: customer.tier || 'regular',
      total_orders: customer.total_orders || 0,
    };

    const financialSnapshot = {
      items_subtotal: totals.subtotal,
      shipping_applied: totals.shippingCharges,
      product_discount_amount: totals.discountAmount,
      prepaid_amount: orderData.paid_amount || 0,
      cod_amount: totals.totalAmount - (orderData.paid_amount || 0),
      final_total: totals.totalAmount,
    };

    const marketingMetadata = {
      ip_address: ipAddress || orderData.ip_address || null,
      user_agent: userAgent || orderData.user_agent || null,
      fbid: orderData.fbid || null,
      utm_source: orderData.utm_source || null,
      utm_medium: orderData.utm_medium || null,
      utm_campaign: orderData.utm_campaign || null,
    };

    return {
      customer_id: customer.id,
      source: orderData.source || 'manual',
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
      shipping_address: customerData.address_line1 || customerData.address || '',
      shipping_city: customerData.city,
      priority: orderData.priority || 0,
      internal_notes: orderData.internal_notes,
      customer_notes: orderData.customer_notes,
      customer_snapshot: customerSnapshot,
      financial_snapshot: financialSnapshot,
      marketing_metadata: marketingMetadata,
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
   */
  async listOrders(options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      status,
      source,
      customer_id,
      payment_status,
      assigned_to,
      start_date,
      end_date,
      search,
    } = options;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, status, fulfillment_type, source,
        subtotal, discount_amount, shipping_charges, total_amount,
        payment_status, payment_method, shipping_name, shipping_phone,
        shipping_city, assigned_to, rider_id, courier_partner, awb_number,
        created_at, updated_at,
        customer:customers(id, name, phone, email, tier),
        item_count:order_items(count)
      `, { count: 'exact' })
      .eq('is_deleted', false);

    // Apply filters
    if (status) query = query.eq('status', status);
    if (source) query = query.eq('source', source);
    if (customer_id) query = query.eq('customer_id', customer_id);
    if (payment_status) query = query.eq('payment_status', payment_status);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);
    if (search) {
      query = query.or(`order_number.ilike.%${search}%,shipping_phone.ilike.%${search}%,shipping_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Failed to list orders', { error });
      throw new DatabaseError('Failed to list orders', error);
    }

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  /**
   * Get order statistics
   */
  async getOrderStats(options = {}) {
    const { start_date, end_date, assigned_to } = options;

    let query = supabaseAdmin
      .from('orders')
      .select('status, total_amount')
      .eq('is_deleted', false);

    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get order stats', { error });
      throw new DatabaseError('Failed to get order stats', error);
    }

    const stats = {
      total: data.length,
      byStatus: {},
      totalRevenue: 0,
    };

    for (const order of data) {
      stats.byStatus[order.status] = (stats.byStatus[order.status] || 0) + 1;
      if (order.status === 'delivered') {
        stats.totalRevenue += order.total_amount;
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
      action: 'updated',
      description: 'Order details updated',
      created_by: userId,
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
