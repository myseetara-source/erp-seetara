/**
 * Dispatch Controller (Outside Valley - Courier Management)
 * 
 * Handles courier handover, manifest generation, and tracking
 * Used for Outside Valley orders dispatched via 3rd party logistics
 */

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { OrderStateMachine, ORDER_STATUS, FULFILLMENT_TYPES } from '../services/orderStateMachine.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('DispatchController');

// =============================================================================
// GENERATE MANIFEST NUMBER
// =============================================================================

function generateManifestNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `MF-${dateStr}-${random}`;
}

// =============================================================================
// CREATE COURIER HANDOVER (Single Order)
// =============================================================================

/**
 * Handover single order to courier
 * POST /api/v1/courier/handover
 * 
 * Body: { 
 *   order_id: UUID,
 *   courier_partner: string,
 *   tracking_id: string,
 *   awb_number?: string,
 *   courier_charge?: number
 * }
 */
export const handoverToCourier = asyncHandler(async (req, res) => {
  const { 
    order_id, 
    courier_partner, 
    tracking_id,
    awb_number,
    courier_charge = 0,
  } = req.body;

  if (!order_id || !courier_partner || !tracking_id) {
    throw new ValidationError('Order ID, courier partner, and tracking ID are required');
  }

  // Get current order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, status, fulfillment_type, order_number, total_amount')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    throw new NotFoundError('Order');
  }

  // Validate fulfillment type
  if (order.fulfillment_type !== FULFILLMENT_TYPES.OUTSIDE_VALLEY) {
    throw new ValidationError('Only Outside Valley orders can be handed over to courier');
  }

  // Validate state transition
  OrderStateMachine.validateTransition(
    order,
    ORDER_STATUS.HANDOVER_TO_COURIER,
    { courier_partner, courier_tracking_id: tracking_id }
  );

  // Update order
  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      status: ORDER_STATUS.HANDOVER_TO_COURIER,
      courier_partner,
      courier_tracking_id: tracking_id,
      awb_number: awb_number || tracking_id,
      dispatched_at: new Date().toISOString(),
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order_id)
    .select()
    .single();

  if (updateError) {
    throw new AppError('Failed to handover order', 500);
  }

  // Add order comment
  await supabaseAdmin.from('order_comments').insert({
    order_id,
    comment: `Handed over to ${courier_partner}. Tracking: ${tracking_id}`,
    source: 'operator',
    created_by: req.user.id,
  });

  logger.info('Order handed over to courier', {
    orderId: order_id,
    courier: courier_partner,
    trackingId: tracking_id,
    userId: req.user.id,
  });

  // TODO: Push to logistics adapter
  // await LogisticsAdapter.pushOrder(updatedOrder);

  res.json({
    success: true,
    message: 'Order handed over to courier',
    data: {
      orderId: order_id,
      orderNumber: order.order_number,
      status: ORDER_STATUS.HANDOVER_TO_COURIER,
      courierPartner: courier_partner,
      trackingId: tracking_id,
    },
  });
});

// =============================================================================
// BULK HANDOVER (Create Manifest)
// =============================================================================

/**
 * Bulk handover orders to courier (creates manifest)
 * POST /api/v1/courier/bulk-handover
 * 
 * Body: { 
 *   order_ids: UUID[],
 *   courier_partner: string,
 *   tracking_codes?: string[] (optional, can be entered later),
 *   pickup_expected_at?: ISO datetime
 * }
 */
export const bulkHandoverToCourier = asyncHandler(async (req, res) => {
  const { 
    order_ids, 
    courier_partner,
    tracking_codes = [],
    pickup_expected_at,
  } = req.body;

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    throw new ValidationError('Order IDs array is required');
  }

  if (!courier_partner) {
    throw new ValidationError('Courier partner is required');
  }

  // Get orders
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, status, fulfillment_type, order_number, total_amount, payment_status')
    .in('id', order_ids);

  if (ordersError || !orders || orders.length === 0) {
    throw new NotFoundError('Orders');
  }

  // Validate orders
  const validOrders = [];
  const invalidOrders = [];

  for (const order of orders) {
    // Must be outside_valley
    if (order.fulfillment_type !== FULFILLMENT_TYPES.OUTSIDE_VALLEY) {
      invalidOrders.push({ 
        id: order.id, 
        orderNumber: order.order_number,
        reason: 'Not an Outside Valley order' 
      });
      continue;
    }

    // Must be in packed status
    if (order.status !== ORDER_STATUS.PACKED) {
      invalidOrders.push({ 
        id: order.id, 
        orderNumber: order.order_number,
        reason: `Invalid status: ${order.status}` 
      });
      continue;
    }

    validOrders.push(order);
  }

  if (validOrders.length === 0) {
    throw new ValidationError('No valid orders to handover');
  }

  const validOrderIds = validOrders.map(o => o.id);
  const manifestNumber = generateManifestNumber();

  // Calculate COD amount
  const codAmount = validOrders
    .filter(o => o.payment_status === 'pending' || o.payment_status === 'cod')
    .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

  // Create manifest
  const { data: manifest, error: manifestError } = await supabaseAdmin
    .from('courier_manifests')
    .insert({
      manifest_number: manifestNumber,
      courier_partner,
      order_ids: validOrderIds,
      order_count: validOrders.length,
      tracking_codes: tracking_codes.length > 0 ? tracking_codes : null,
      total_cod_amount: codAmount,
      status: 'draft',
      pickup_expected_at: pickup_expected_at || null,
      created_by: req.user.id,
    })
    .select()
    .single();

  if (manifestError) {
    throw new AppError('Failed to create manifest', 500);
  }

  // Update orders with manifest ID
  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      status: ORDER_STATUS.HANDOVER_TO_COURIER,
      courier_partner,
      courier_manifest_id: manifest.id,
      dispatched_at: new Date().toISOString(),
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .in('id', validOrderIds);

  if (updateError) {
    throw new AppError('Failed to update orders', 500);
  }

  // Add comments to all orders
  const comments = validOrderIds.map(orderId => ({
    order_id: orderId,
    comment: `Added to manifest ${manifestNumber} for ${courier_partner}`,
    source: 'operator',
    created_by: req.user.id,
  }));

  await supabaseAdmin.from('order_comments').insert(comments);

  logger.info('Bulk courier handover', {
    manifestNumber,
    courierPartner: courier_partner,
    orderCount: validOrders.length,
    codAmount,
    userId: req.user.id,
  });

  res.json({
    success: true,
    message: `Manifest ${manifestNumber} created with ${validOrders.length} orders`,
    data: {
      manifestId: manifest.id,
      manifestNumber,
      courierPartner: courier_partner,
      orderCount: validOrders.length,
      codAmount,
      status: 'draft',
      invalidOrders,
    },
  });
});

// =============================================================================
// DISPATCH MANIFEST (Mark as picked up)
// =============================================================================

/**
 * Mark manifest as dispatched (courier picked up)
 * POST /api/v1/courier/manifests/:id/dispatch
 * 
 * Body: { tracking_codes?: string[] }
 */
export const dispatchManifest = asyncHandler(async (req, res) => {
  const { id: manifestId } = req.params;
  const { tracking_codes = [] } = req.body;

  // Get manifest
  const { data: manifest, error: manifestError } = await supabaseAdmin
    .from('courier_manifests')
    .select('id, order_number, customer_id, status, fulfillment_type, rider_id, courier_partner, awb_number, created_at')
    .eq('id', manifestId)
    .single();

  if (manifestError || !manifest) {
    throw new NotFoundError('Manifest');
  }

  if (manifest.status !== 'draft') {
    throw new ValidationError('Manifest has already been dispatched');
  }

  // Update manifest
  const { error: updateManifestError } = await supabaseAdmin
    .from('courier_manifests')
    .update({
      status: 'dispatched',
      tracking_codes: tracking_codes.length > 0 ? tracking_codes : manifest.tracking_codes,
      dispatched_at: new Date().toISOString(),
      dispatched_by: req.user.id,
    })
    .eq('id', manifestId);

  if (updateManifestError) {
    throw new AppError('Failed to dispatch manifest', 500);
  }

  // Update all orders in manifest to in_transit if tracking codes provided
  if (tracking_codes.length === manifest.order_ids.length) {
    // Map tracking codes to orders
    for (let i = 0; i < manifest.order_ids.length; i++) {
      await supabaseAdmin
        .from('orders')
        .update({
          courier_tracking_id: tracking_codes[i],
          status: ORDER_STATUS.IN_TRANSIT,
          updated_by: req.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', manifest.order_ids[i]);
    }
  }

  logger.info('Manifest dispatched', {
    manifestId,
    manifestNumber: manifest.manifest_number,
    orderCount: manifest.order_count,
    userId: req.user.id,
  });

  res.json({
    success: true,
    message: 'Manifest dispatched successfully',
    data: {
      manifestId,
      manifestNumber: manifest.manifest_number,
      status: 'dispatched',
      orderCount: manifest.order_count,
      dispatchedAt: new Date().toISOString(),
    },
  });
});

// =============================================================================
// GET MANIFEST DETAILS
// =============================================================================

/**
 * Get manifest details with orders
 * GET /api/v1/courier/manifests/:id
 */
export const getManifest = asyncHandler(async (req, res) => {
  const { id: manifestId } = req.params;

  // Get manifest
  const { data: manifest, error: manifestError } = await supabaseAdmin
    .from('courier_manifests')
    .select(`
      *,
      creator:users!courier_manifests_created_by_fkey(name),
      dispatcher:users!courier_manifests_dispatched_by_fkey(name)
    `)
    .eq('id', manifestId)
    .single();

  if (manifestError || !manifest) {
    throw new NotFoundError('Manifest');
  }

  // Get orders in manifest
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      payment_status,
      courier_tracking_id,
      shipping_address,
      shipping_city,
      customer:customers(name, phone)
    `)
    .in('id', manifest.order_ids);

  res.json({
    success: true,
    data: {
      ...manifest,
      creatorName: manifest.creator?.name,
      dispatcherName: manifest.dispatcher?.name,
      orders: orders || [],
    },
  });
});

// =============================================================================
// LIST MANIFESTS
// =============================================================================

/**
 * List all manifests
 * GET /api/v1/courier/manifests
 */
export const listManifests = asyncHandler(async (req, res) => {
  const { status, courier, page = 1, limit = 20, date } = req.query;
  const from = (page - 1) * limit;
  const to = from + parseInt(limit) - 1;

  let query = supabaseAdmin
    .from('courier_manifests')
    .select(`
      *,
      creator:users!courier_manifests_created_by_fkey(name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (courier) {
    query = query.eq('courier_partner', courier);
  }

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    query = query
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new AppError('Failed to fetch manifests', 500);
  }

  res.json({
    success: true,
    data: data || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

// =============================================================================
// GET COURIER PARTNERS
// =============================================================================

/**
 * Get list of courier partners
 * GET /api/v1/courier/partners
 */
export const getCourierPartners = asyncHandler(async (req, res) => {
  // In a full implementation, this would come from a database table
  const partners = [
    { id: 'ncm', name: 'NCM Nepal', code: 'NCM', isActive: true },
    { id: 'sundar', name: 'Sundar Delivery', code: 'SND', isActive: true },
    { id: 'nepex', name: 'Nepex Courier', code: 'NPX', isActive: true },
    { id: 'fastex', name: 'Fast Express', code: 'FEX', isActive: true },
    { id: 'dash', name: 'Dash Logistics', code: 'DSH', isActive: true },
    { id: 'other', name: 'Other', code: 'OTH', isActive: true },
  ];

  res.json({
    success: true,
    data: partners,
  });
});

// =============================================================================
// GET TODAY'S DISPATCH SUMMARY
// =============================================================================

/**
 * Get today's dispatch summary for outside valley
 * GET /api/v1/courier/summary
 */
export const getTodaysSummary = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Get all outside valley orders dispatched today
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, status, courier_partner')
    .eq('fulfillment_type', FULFILLMENT_TYPES.OUTSIDE_VALLEY)
    .gte('dispatched_at', startOfDay.toISOString());

  // Get manifests created today
  const { data: manifests } = await supabaseAdmin
    .from('courier_manifests')
    .select('id, status, order_count, courier_partner')
    .gte('created_at', startOfDay.toISOString());

  // Group by courier
  const byCourier = (orders || []).reduce((acc, order) => {
    const courier = order.courier_partner || 'Unknown';
    if (!acc[courier]) {
      acc[courier] = { dispatched: 0, inTransit: 0, delivered: 0 };
    }
    if (order.status === ORDER_STATUS.HANDOVER_TO_COURIER) acc[courier].dispatched++;
    if (order.status === ORDER_STATUS.IN_TRANSIT) acc[courier].inTransit++;
    if (order.status === ORDER_STATUS.DELIVERED) acc[courier].delivered++;
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      totalDispatched: orders?.length || 0,
      handedOver: orders?.filter(o => o.status === ORDER_STATUS.HANDOVER_TO_COURIER).length || 0,
      inTransit: orders?.filter(o => o.status === ORDER_STATUS.IN_TRANSIT).length || 0,
      delivered: orders?.filter(o => o.status === ORDER_STATUS.DELIVERED).length || 0,
      manifestsCreated: manifests?.length || 0,
      byCourier,
    },
  });
});

export default {
  handoverToCourier,
  bulkHandoverToCourier,
  dispatchManifest,
  getManifest,
  listManifests,
  getCourierPartners,
  getTodaysSummary,
};
