/**
 * Dispatch Packing Controller
 * 
 * Handles: Dispatch Center Counts, Packing Operations, Rider Assignment
 * 
 * P1 REFACTOR: Split from monolithic dispatch.controller.js (4900+ lines)
 * 
 * @module DispatchPacking
 */

import ManifestService from '../../services/dispatch/ManifestService.js';
import { supabaseAdmin } from '../../config/supabase.js';
import logger from '../../utils/logger.js';

const LOG_PREFIX = '[DispatchPacking]';

// ============================================================================
// DISPATCH CENTER COUNTS
// ============================================================================

/**
 * GET /dispatch/counts
 * Get badge counts for dispatch center tabs (P0 OPTIMIZED)
 */
export async function getDispatchCounts(req, res, next) {
  try {
    // P0 PERFORMANCE FIX: Use database RPC for single-query aggregation
    const { data: rpcData, error: rpcError } = await supabaseAdmin
      .rpc('get_dispatch_counts_aggregated');

    if (!rpcError && rpcData) {
      return res.json({
        success: true,
        data: rpcData,
        _meta: { source: 'rpc', queries: 1 },
      });
    }

    // FALLBACK: Use Promise.all for parallel execution
    logger.warn(`${LOG_PREFIX} RPC fallback - using parallel queries`, { rpcError: rpcError?.message });

    const todayStart = new Date().toISOString().split('T')[0];

    const [
      insideToPackResult,
      insideToAssignResult,
      insideOutForDeliveryResult,
      outsideToPackResult,
      outsideToHandoverResult,
      outsideInTransitResult,
      returnsPendingResult,
      returnsProcessedResult,
    ] = await Promise.all([
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'converted').eq('fulfillment_type', 'inside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'packed').eq('fulfillment_type', 'inside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .in('status', ['out_for_delivery', 'assigned']).eq('fulfillment_type', 'inside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'converted').eq('fulfillment_type', 'outside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'packed').eq('fulfillment_type', 'outside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .in('status', ['in_transit', 'handover_to_courier']).eq('fulfillment_type', 'outside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .in('status', ['rejected', 'return_initiated']).eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'returned').eq('is_deleted', false).gte('updated_at', todayStart),
    ]);

    res.json({
      success: true,
      data: {
        insideValley: {
          toPack: insideToPackResult.count || 0,
          toAssign: insideToAssignResult.count || 0,
          outForDelivery: insideOutForDeliveryResult.count || 0,
        },
        outsideValley: {
          toPack: outsideToPackResult.count || 0,
          toHandover: outsideToHandoverResult.count || 0,
          inTransit: outsideInTransitResult.count || 0,
        },
        returns: {
          pending: returnsPendingResult.count || 0,
          processed: returnsProcessedResult.count || 0,
        },
      },
      _meta: { source: 'parallel', queries: 8 },
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getDispatchCounts error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/inside-counts
 * Get Inside Valley specific counts
 */
export async function getInsideValleyCounts(req, res, next) {
  try {
    const [toPack, toAssign, outForDelivery, delivered, rejected] = await Promise.all([
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'converted').eq('fulfillment_type', 'inside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'packed').eq('fulfillment_type', 'inside_valley').is('rider_id', null).eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .in('status', ['out_for_delivery', 'assigned']).eq('fulfillment_type', 'inside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'delivered').eq('fulfillment_type', 'inside_valley').eq('is_deleted', false)
        .gte('updated_at', new Date().toISOString().split('T')[0]),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .in('status', ['rejected', 'customer_refused']).eq('fulfillment_type', 'inside_valley').eq('is_deleted', false),
    ]);

    res.json({
      success: true,
      data: {
        toPack: toPack.count || 0,
        toAssign: toAssign.count || 0,
        outForDelivery: outForDelivery.count || 0,
        delivered: delivered.count || 0,
        rejected: rejected.count || 0,
      },
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getInsideValleyCounts error`, { error: error.message });
    res.json({ success: true, data: {} });
  }
}

/**
 * GET /dispatch/outside-counts
 * Get Outside Valley specific counts
 */
export async function getOutsideValleyCounts(req, res, next) {
  try {
    const [toPack, toHandover, inTransit, delivered, rto] = await Promise.all([
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'converted').eq('fulfillment_type', 'outside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'packed').eq('fulfillment_type', 'outside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .in('status', ['in_transit', 'handover_to_courier']).eq('fulfillment_type', 'outside_valley').eq('is_deleted', false),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'delivered').eq('fulfillment_type', 'outside_valley').eq('is_deleted', false)
        .gte('updated_at', new Date().toISOString().split('T')[0]),
      supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
        .in('status', ['rto_initiated', 'rto_in_transit', 'rto_verification_pending']).eq('fulfillment_type', 'outside_valley').eq('is_deleted', false),
    ]);

    res.json({
      success: true,
      data: {
        toPack: toPack.count || 0,
        toHandover: toHandover.count || 0,
        inTransit: inTransit.count || 0,
        delivered: delivered.count || 0,
        rto: rto.count || 0,
      },
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getOutsideValleyCounts error`, { error: error.message });
    res.json({ success: true, data: {} });
  }
}

/**
 * GET /dispatch/orders-in-transit
 * Get orders currently in transit
 */
export async function getOrdersInTransit(req, res, next) {
  try {
    const { fulfillment_type, limit = 100 } = req.query;

    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, readable_id, status,
        shipping_name, shipping_phone, shipping_address, shipping_city,
        total_amount, payment_method, courier_partner, external_order_id,
        logistics_status, courier_raw_status,
        created_at, updated_at
      `)
      .in('status', ['in_transit', 'out_for_delivery', 'handover_to_courier'])
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(parseInt(limit));

    if (fulfillment_type) {
      query = query.eq('fulfillment_type', fulfillment_type);
    }

    const { data: orders, error } = await query;

    if (error) {
      logger.error(`${LOG_PREFIX} getOrdersInTransit error`, { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      data: orders || [],
      count: (orders || []).length,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getOrdersInTransit error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

// ============================================================================
// PACKING OPERATIONS
// ============================================================================

/**
 * GET /dispatch/orders-to-pack
 * Get orders ready to pack (status: converted)
 */
export async function getOrdersToPack(req, res, next) {
  try {
    const { fulfillment_type = 'inside_valley' } = req.query;

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, readable_id,
        shipping_name, shipping_phone, shipping_address, shipping_city,
        zone_code, total_amount, payment_method, payment_status,
        created_at, priority,
        delivery_type, courier_partner, destination_branch,
        order_items:order_items(count)
      `)
      .eq('status', 'converted')
      .eq('fulfillment_type', fulfillment_type)
      .eq('is_deleted', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) throw error;

    const orders = (data || []).map(o => ({
      ...o,
      customer_name: o.shipping_name,
      customer_phone: o.shipping_phone,
      item_count: o.order_items?.[0]?.count || 0,
    }));

    res.json({ success: true, data: orders });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getOrdersToPack error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/orders-packed
 * Get packed orders ready for dispatch
 */
export async function getOrdersPacked(req, res, next) {
  try {
    const { fulfillment_type = 'inside_valley' } = req.query;

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, readable_id,
        shipping_name, shipping_phone, shipping_address, shipping_city,
        zone_code, destination_branch, total_amount, payment_method, payment_status,
        created_at, updated_at, priority,
        delivery_type, courier_partner,
        order_items:order_items(count)
      `)
      .eq('status', 'packed')
      .eq('fulfillment_type', fulfillment_type)
      .eq('is_deleted', false)
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(200);

    if (error) throw error;

    const orders = (data || []).map(o => ({
      ...o,
      customer_name: o.shipping_name,
      customer_phone: o.shipping_phone,
      item_count: o.order_items?.[0]?.count || 0,
    }));

    res.json({ success: true, data: orders });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getOrdersPacked error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/orders-to-assign
 * Get packed orders ready for rider assignment (Inside Valley)
 */
export async function getOrdersToAssign(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, readable_id,
        shipping_name, shipping_phone, shipping_address, shipping_city,
        zone_code, total_amount, payment_method, payment_status,
        created_at, updated_at, priority,
        order_items:order_items(count)
      `)
      .eq('status', 'packed')
      .eq('fulfillment_type', 'inside_valley')
      .is('rider_id', null)
      .eq('is_deleted', false)
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(200);

    if (error) throw error;

    const orders = (data || []).map(o => ({
      ...o,
      customer_name: o.shipping_name,
      customer_phone: o.shipping_phone,
      item_count: o.order_items?.[0]?.count || 0,
    }));

    logger.info(`${LOG_PREFIX} getOrdersToAssign`, { count: orders.length });
    res.json({ success: true, data: orders });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getOrdersToAssign error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/pack/:orderId
 * Mark order as packed and DEDUCT INVENTORY
 */
export async function packOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    
    logger.info(`${LOG_PREFIX} packOrder called`, {
      orderId,
      userId: req.user?.id,
      userRole: req.user?.role,
    });

    // Get order with items
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, status, fulfillment_type,
        order_items:order_items(id, variant_id, quantity)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      logger.error(`${LOG_PREFIX} Order not found`, { orderId, error: orderError?.message });
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'converted') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot pack order with status "${order.status}". Order must be "converted".` 
      });
    }

    // Deduct inventory
    const itemsToDeduct = order.order_items || [];
    const deductionErrors = [];
    const deductionSuccess = [];

    for (const item of itemsToDeduct) {
      if (!item.variant_id) {
        deductionErrors.push({ item_id: item.id, error: 'Missing variant_id' });
        continue;
      }

      // Get current stock
      const { data: variant, error: variantError } = await supabaseAdmin
        .from('product_variants')
        .select('id, current_stock, sku')
        .eq('id', item.variant_id)
        .single();

      if (variantError || !variant) {
        deductionErrors.push({ item_id: item.id, variant_id: item.variant_id, error: 'Variant not found' });
        continue;
      }

      const newStock = (variant.current_stock || 0) - item.quantity;

      // Update stock (allow negative for overselling scenarios)
      const { error: updateError } = await supabaseAdmin
        .from('product_variants')
        .update({ 
          current_stock: newStock,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.variant_id);

      if (updateError) {
        deductionErrors.push({ 
          item_id: item.id, 
          variant_id: item.variant_id, 
          error: updateError.message 
        });
      } else {
        deductionSuccess.push({
          variant_id: item.variant_id,
          sku: variant.sku,
          deducted: item.quantity,
          new_stock: newStock,
        });

        // Create stock movement record
        await supabaseAdmin.from('stock_movements').insert({
          variant_id: item.variant_id,
          movement_type: 'sale',
          quantity: -item.quantity,
          reference_type: 'order',
          reference_id: orderId,
          notes: `Order ${order.order_number} packed`,
          created_by: userId,
        });
      }
    }

    // Update order status to packed
    // P0 FIX: Removed packed_at AND packed_by (columns don't exist in DB)
    // Using updated_at to track when it was packed
    const { error: statusError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'packed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (statusError) {
      logger.error(`${LOG_PREFIX} Failed to update order status`, { error: statusError.message });
      return res.status(500).json({ success: false, message: 'Failed to update order status' });
    }

    logger.info(`${LOG_PREFIX} Order packed`, {
      orderId,
      deductions: deductionSuccess.length,
      errors: deductionErrors.length,
    });

    res.json({
      success: true,
      message: `Order packed. ${deductionSuccess.length} items deducted.`,
      data: {
        order_id: orderId,
        deductions: deductionSuccess,
        errors: deductionErrors.length > 0 ? deductionErrors : undefined,
      },
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} packOrder error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/pack-bulk
 * Bulk pack orders
 */
export async function packOrdersBulk(req, res, next) {
  try {
    const { order_ids } = req.body;
    const userId = req.user.id;

    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'order_ids array is required' });
    }

    logger.info(`${LOG_PREFIX} packOrdersBulk called`, { count: order_ids.length });

    const results = { success: [], failed: [] };

    for (const orderId of order_ids) {
      try {
        // Use packOrder logic inline
        const { data: order, error: orderError } = await supabaseAdmin
          .from('orders')
          .select(`
            id, order_number, status,
            order_items:order_items(id, variant_id, quantity)
          `)
          .eq('id', orderId)
          .single();

        if (orderError || !order || order.status !== 'converted') {
          results.failed.push({ order_id: orderId, error: 'Invalid order or status' });
          continue;
        }

        // Deduct inventory
        for (const item of order.order_items || []) {
          if (!item.variant_id) continue;

          const { data: variant } = await supabaseAdmin
            .from('product_variants')
            .select('current_stock')
            .eq('id', item.variant_id)
            .single();

          if (variant) {
            const newStock = (variant.current_stock || 0) - item.quantity;
            await supabaseAdmin
              .from('product_variants')
              .update({ current_stock: newStock, updated_at: new Date().toISOString() })
              .eq('id', item.variant_id);

            await supabaseAdmin.from('stock_movements').insert({
              variant_id: item.variant_id,
              movement_type: 'sale',
              quantity: -item.quantity,
              reference_type: 'order',
              reference_id: orderId,
              notes: `Bulk pack - Order ${order.order_number}`,
              created_by: userId,
            });
          }
        }

        // Update order status
        // P0 FIX: Removed packed_at AND packed_by (columns don't exist in DB)
        await supabaseAdmin
          .from('orders')
          .update({
            status: 'packed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        results.success.push({ order_id: orderId });
      } catch (err) {
        results.failed.push({ order_id: orderId, error: err.message });
      }
    }

    logger.info(`${LOG_PREFIX} packOrdersBulk completed`, {
      success: results.success.length,
      failed: results.failed.length,
    });

    res.json({
      success: true,
      message: `Packed ${results.success.length} orders, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} packOrdersBulk error`, { error: error.message });
    next(error);
  }
}

// ============================================================================
// RIDER OPERATIONS
// ============================================================================

/**
 * GET /dispatch/riders-with-stats
 * Get riders with detailed stats for assignment
 */
export async function getRidersWithStats(req, res, next) {
  try {
    const result = await ManifestService.getRidersWithStats();

    res.json({
      success: true,
      data: result.riders || [],
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRidersWithStats error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

/**
 * POST /dispatch/assign-rider
 * Assign orders to rider
 */
export async function assignOrdersToRider(req, res, next) {
  try {
    const { rider_id, order_ids } = req.body;
    const userId = req.user?.id;

    if (!rider_id) {
      return res.status(400).json({ success: false, message: 'rider_id is required' });
    }
    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'order_ids array is required' });
    }

    logger.info(`${LOG_PREFIX} assignOrdersToRider`, { rider_id, count: order_ids.length });

    const result = await ManifestService.assignOrdersToRider({
      riderId: rider_id,
      orderIds: order_ids,
      assignedBy: userId,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Assigned ${result.assigned_count} orders to rider`,
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} assignOrdersToRider error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/rider-dashboard
 * Get rider dashboard data
 */
export async function getRiderDashboard(req, res, next) {
  try {
    const { rider_id } = req.query;

    if (!rider_id) {
      return res.status(400).json({ success: false, message: 'rider_id is required' });
    }

    const result = await ManifestService.getRiderDashboard(rider_id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRiderDashboard error`, { error: error.message });
    res.json({ success: true, data: {} });
  }
}

/**
 * POST /dispatch/courier-handover
 * Courier handover V2 (Outside Valley)
 */
export async function courierHandoverV2(req, res, next) {
  try {
    const { order_ids, courier_partner, notes } = req.body;
    const userId = req.user?.id;

    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'order_ids array is required' });
    }

    logger.info(`${LOG_PREFIX} courierHandoverV2`, { count: order_ids.length, courier_partner });

    const result = await ManifestService.courierHandover({
      orderIds: order_ids,
      courierPartner: courier_partner,
      notes,
      handoverBy: userId,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Handed over ${result.handover_count} orders to courier`,
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} courierHandoverV2 error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/create-manifest
 * Create courier manifest V2
 */
export async function createCourierManifestV2(req, res, next) {
  try {
    const { order_ids, courier_partner, destination_branch, notes } = req.body;
    const userId = req.user?.id;

    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'order_ids array is required' });
    }

    logger.info(`${LOG_PREFIX} createCourierManifestV2`, { count: order_ids.length, courier_partner });

    const result = await ManifestService.createCourierManifestV2({
      orderIds: order_ids,
      courierPartner: courier_partner,
      destinationBranch: destination_branch,
      notes,
      createdBy: userId,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Courier manifest created with ${order_ids.length} orders`,
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createCourierManifestV2 error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/update-tracking
 * Update tracking numbers for orders
 */
export async function updateTrackingNumbers(req, res, next) {
  try {
    const { orders } = req.body;
    
    if (!orders?.length) {
      return res.status(400).json({ success: false, message: 'orders array is required' });
    }

    logger.info(`${LOG_PREFIX} updateTrackingNumbers`, { count: orders.length });

    const results = { success: [], failed: [] };

    for (const order of orders) {
      const { order_id, tracking_number, courier_partner } = order;
      
      if (!order_id || !tracking_number) {
        results.failed.push({ order_id, error: 'Missing order_id or tracking_number' });
        continue;
      }

      const { error } = await supabaseAdmin
        .from('orders')
        .update({
          external_order_id: tracking_number,
          courier_partner: courier_partner || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order_id);

      if (error) {
        results.failed.push({ order_id, error: error.message });
      } else {
        results.success.push({ order_id, tracking_number });
      }
    }

    res.json({
      success: true,
      message: `Updated ${results.success.length} orders, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} updateTrackingNumbers error`, { error: error.message });
    next(error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Counts
  getDispatchCounts,
  getInsideValleyCounts,
  getOutsideValleyCounts,
  getOrdersInTransit,
  // Packing
  getOrdersToPack,
  getOrdersPacked,
  getOrdersToAssign,
  packOrder,
  packOrdersBulk,
  // Rider Operations
  getRidersWithStats,
  assignOrdersToRider,
  getRiderDashboard,
  courierHandoverV2,
  createCourierManifestV2,
  updateTrackingNumbers,
};
