/**
 * External API Controller
 * 
 * Handles orders from external websites (Shopify, WordPress, Custom)
 * Implements Product-Led Pixel Routing for Meta CAPI
 * 
 * Security:
 * - API Key authentication (x-api-key header)
 * - Rate limiting per channel
 * - IP whitelisting (optional)
 */

import { z } from 'zod';
import bcrypt from 'bcrypt';
import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { createLogger } from '../utils/logger.js';
import { ValidationError, AuthenticationError, NotFoundError } from '../utils/errors.js';
import { metaCAPIService, generateEventId } from '../services/meta/MetaCAPIService.js';
import { customerService } from '../services/customer.service.js';
import { cleanPhone } from '../utils/phone.js';

const logger = createLogger('ExternalController');

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const externalOrderSchema = z.object({
  // Customer Info
  customer: z.object({
    name: z.string().min(2).max(255),
    phone: z.string().min(10).max(15),
    email: z.string().email().optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    district: z.string().max(100).optional(),
    landmark: z.string().max(255).optional(),
  }),

  // Order Items
  items: z.array(z.object({
    sku: z.string().min(1),
    product_name: z.string().optional(),
    variant_name: z.string().optional(),
    quantity: z.number().int().min(1),
    unit_price: z.number().positive(),
  })).min(1, 'At least one item required'),

  // Order Details
  subtotal: z.number().optional(),
  discount: z.number().default(0),
  delivery_charge: z.number().default(0),
  total_amount: z.number().positive(),
  payment_method: z.enum(['cod', 'prepaid', 'partial']).default('cod'),
  notes: z.string().max(1000).optional(),

  // Marketing Meta (Critical for CAPI Deduplication)
  marketing_meta: z.object({
    event_id: z.string().min(1),     // MUST match browser pixel event_id
    fbp: z.string().optional(),       // _fbp cookie
    fbc: z.string().optional(),       // _fbc cookie  
    user_agent: z.string().optional(),
    landing_page: z.string().url().optional(),
    referrer: z.string().optional(),
  }).optional(),

  // Source Info
  source_url: z.string().url().optional(),
  source_order_id: z.string().optional(),  // External order ID from website
});

// =============================================================================
// MIDDLEWARE: API KEY AUTHENTICATION
// =============================================================================

/**
 * Authenticate external API requests
 * Validates x-api-key header against external_api_keys table
 */
export const authenticateExternalApi = asyncHandler(async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    throw new AuthenticationError('API key required in x-api-key header');
  }

  // Lookup API key
  const { data: keyRecord, error } = await supabaseAdmin
    .from('external_api_keys')
    .select(`
      id,
      channel_id,
      key_name,
      permissions,
      rate_limit_per_minute,
      is_active,
      channel:sales_channels (
        id,
        name,
        slug,
        pixel_id,
        capi_token,
        test_event_code,
        currency,
        is_capi_enabled
      )
    `)
    .eq('api_key', apiKey)
    .single();

  if (error || !keyRecord) {
    logger.warn('Invalid API key attempt', { apiKey: apiKey.substring(0, 8) + '...' });
    throw new AuthenticationError('Invalid API key');
  }

  if (!keyRecord.is_active) {
    throw new AuthenticationError('API key is inactive');
  }

  // Update last used
  await supabaseAdmin
    .from('external_api_keys')
    .update({
      last_used_at: new Date().toISOString(),
      request_count: keyRecord.request_count + 1,
    })
    .eq('id', keyRecord.id);

  // Attach to request
  req.externalChannel = keyRecord.channel;
  req.externalApiKey = keyRecord;

  next();
});

// =============================================================================
// CONTROLLERS
// =============================================================================

/**
 * Create Order from External Website
 * POST /api/v1/external/orders
 * 
 * This is the main endpoint for external websites to submit orders.
 * Handles:
 * - Order creation
 * - Customer upsert
 * - Stock deduction
 * - Meta CAPI event with deduplication
 */
export const createExternalOrder = asyncHandler(async (req, res) => {
  const channel = req.externalChannel;
  const validatedData = externalOrderSchema.parse(req.body);

  logger.info('External order received', {
    channel: channel.name,
    customer: validatedData.customer.phone,
    items: validatedData.items.length,
    total: validatedData.total_amount,
    hasMarketingMeta: !!validatedData.marketing_meta,
  });

  // ===========================================================================
  // STEP 1: Find or Create Customer
  // ===========================================================================
  const customerData = {
    phone: cleanPhone(validatedData.customer.phone),
    name: validatedData.customer.name,
    email: validatedData.customer.email,
    address: validatedData.customer.address,
    city: validatedData.customer.city,
    district: validatedData.customer.district,
  };

  const customer = await customerService.findOrCreateByPhone(customerData);

  // ===========================================================================
  // STEP 2: Resolve SKUs to Product Variants (BATCH QUERY - N+1 FIX)
  // ===========================================================================
  // Performance: Single query for all SKUs instead of N queries
  const skus = validatedData.items.map(item => item.sku);
  
  const { data: variants, error: variantsError } = await supabaseAdmin
    .from('product_variants')
    .select(`
      id,
      sku,
      selling_price,
      current_stock,
      product:products (
        id,
        name,
        channel_id
      )
    `)
    .in('sku', skus);

  if (variantsError) {
    logger.error('Failed to fetch variants', { error: variantsError });
    throw new ValidationError('Failed to resolve product variants');
  }

  // Create a map for O(1) lookup
  const variantMap = new Map(variants.map(v => [v.sku, v]));

  const orderItems = [];
  let calculatedSubtotal = 0;

  // Validate all items and build order items
  for (const item of validatedData.items) {
    const variant = variantMap.get(item.sku);

    if (!variant) {
      throw new ValidationError(`Product with SKU "${item.sku}" not found`);
    }

    // Check stock
    if (variant.current_stock < item.quantity) {
      throw new ValidationError(
        `Insufficient stock for "${item.sku}". Available: ${variant.current_stock}, Requested: ${item.quantity}`
      );
    }

    const unitPrice = item.unit_price || variant.selling_price;
    const totalPrice = item.quantity * unitPrice;

    orderItems.push({
      variant_id: variant.id,
      product_id: variant.product?.id,
      sku: variant.sku,
      product_name: item.product_name || variant.product?.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    });

    calculatedSubtotal += totalPrice;
  }

  // ===========================================================================
  // STEP 3: Create Order
  // ===========================================================================
  
  // Generate order number
  const orderNumber = `${channel.slug.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  
  // Prepare technical meta
  const technicalMeta = {
    event_id: validatedData.marketing_meta?.event_id || generateEventId('WEB'),
    fbp: validatedData.marketing_meta?.fbp || null,
    fbc: validatedData.marketing_meta?.fbc || null,
    user_agent: validatedData.marketing_meta?.user_agent || req.headers['user-agent'],
    ip_address: req.ip || req.connection?.remoteAddress,
    source_channel_id: channel.id,
    source_url: validatedData.source_url,
    source_order_id: validatedData.source_order_id,
    landing_page: validatedData.marketing_meta?.landing_page,
    referrer: validatedData.marketing_meta?.referrer,
  };

  // Insert order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      order_number: orderNumber,
      customer_id: customer.id,
      status: 'intake',
      source: 'website',
      fulfillment_type: customer.city?.toLowerCase().includes('kathmandu') ? 'inside_valley' : 'outside_valley',
      
      // Amounts
      subtotal: calculatedSubtotal,
      discount_amount: validatedData.discount,
      delivery_charge: validatedData.delivery_charge,
      total_amount: validatedData.total_amount,
      
      // Shipping
      shipping_address: validatedData.customer.address,
      shipping_city: validatedData.customer.city,
      shipping_district: validatedData.customer.district,
      shipping_landmark: validatedData.customer.landmark,
      
      // Payment
      payment_method: validatedData.payment_method,
      payment_status: validatedData.payment_method === 'prepaid' ? 'paid' : 'pending',
      
      // Notes
      customer_notes: validatedData.notes,
      
      // Technical Meta (for CAPI deduplication)
      technical_meta: technicalMeta,
    })
    .select()
    .single();

  if (orderError) {
    logger.error('Failed to create external order', { error: orderError });
    throw new ValidationError('Failed to create order');
  }

  // ===========================================================================
  // STEP 4: Create Order Items & Deduct Stock
  // ===========================================================================
  
  for (const item of orderItems) {
    // Insert order item
    await supabaseAdmin
      .from('order_items')
      .insert({
        order_id: order.id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
      });

    // Deduct stock (atomic)
    const { error: stockError } = await supabaseAdmin.rpc('deduct_stock_atomic', {
      p_variant_id: item.variant_id,
      p_quantity: item.quantity,
    });

    if (stockError) {
      logger.error('Stock deduction failed', { sku: item.sku, error: stockError });
      // Continue anyway - stock can be adjusted later
    }
  }

  // ===========================================================================
  // STEP 5: Send Meta CAPI Event (Deduplication)
  // ===========================================================================
  
  // This is the SERVER-SIDE event that pairs with the BROWSER event
  // Both use the SAME event_id for deduplication
  
  if (channel.is_capi_enabled) {
    // Fire CAPI in background (don't block response)
    metaCAPIService.sendPurchaseEvent({
      order: {
        id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        currency: channel.currency,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        city: customer.city,
        district: customer.district,
      },
      items: orderItems,
      meta: {
        event_id: technicalMeta.event_id, // SAME as browser event_id
        fbp: technicalMeta.fbp,
        fbc: technicalMeta.fbc,
        ip_address: technicalMeta.ip_address,
        user_agent: technicalMeta.user_agent,
        action_source: 'website',
      },
      channel,
    }).then(result => {
      logger.info('CAPI event sent for external order', {
        orderId: order.id,
        success: result.success,
      });
    }).catch(err => {
      logger.error('CAPI event failed for external order', {
        orderId: order.id,
        error: err.message,
      });
    });
  }

  // ===========================================================================
  // STEP 6: Return Response
  // ===========================================================================
  
  logger.info('External order created successfully', {
    orderId: order.id,
    orderNumber: order.order_number,
    channel: channel.name,
  });

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    data: {
      order_id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_amount: order.total_amount,
      payment_method: order.payment_method,
      customer_id: customer.id,
      event_id: technicalMeta.event_id, // Return for verification
    },
  });
});

/**
 * Get Order Status (for external websites)
 * GET /api/v1/external/orders/:orderNumber
 */
export const getExternalOrderStatus = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const channel = req.externalChannel;

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      fulfillment_type,
      payment_status,
      courier_partner,
      courier_tracking_id,
      delivered_at,
      created_at
    `)
    .eq('order_number', orderNumber)
    .single();

  if (error || !order) {
    throw new NotFoundError('Order');
  }

  // Verify order belongs to this channel
  const orderMeta = order.technical_meta || {};
  if (orderMeta.source_channel_id !== channel.id) {
    throw new NotFoundError('Order');
  }

  res.json({
    success: true,
    data: {
      order_number: order.order_number,
      status: order.status,
      fulfillment_type: order.fulfillment_type,
      payment_status: order.payment_status,
      tracking: order.courier_tracking_id ? {
        courier: order.courier_partner,
        tracking_id: order.courier_tracking_id,
      } : null,
      delivered_at: order.delivered_at,
      created_at: order.created_at,
    },
  });
});

/**
 * Cancel External Order
 * POST /api/v1/external/orders/:orderNumber/cancel
 */
export const cancelExternalOrder = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const { reason } = req.body;
  const channel = req.externalChannel;

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, customer_id, status, total_amount, payment_status, fulfillment_type, created_at')
    .eq('order_number', orderNumber)
    .single();

  if (error || !order) {
    throw new NotFoundError('Order');
  }

  // Only allow cancellation for certain statuses
  const cancellableStatuses = ['intake', 'follow_up', 'converted'];
  if (!cancellableStatuses.includes(order.status)) {
    throw new ValidationError(`Cannot cancel order in "${order.status}" status`);
  }

  // Update order
  await supabaseAdmin
    .from('orders')
    .update({
      status: 'cancelled',
      cancellation_reason: reason || 'Cancelled by website',
    })
    .eq('id', order.id);

  logger.info('External order cancelled', {
    orderId: order.id,
    orderNumber: order.order_number,
    reason,
  });

  res.json({
    success: true,
    message: 'Order cancelled successfully',
    data: {
      order_number: order.order_number,
      status: 'cancelled',
    },
  });
});

export default {
  authenticateExternalApi,
  createExternalOrder,
  getExternalOrderStatus,
  cancelExternalOrder,
};
