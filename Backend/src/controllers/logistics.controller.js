/**
 * Logistics Controller (Inside Valley - Rider Management)
 * 
 * Handles rider assignments, delivery tracking, and status updates
 * Used for Inside Valley orders delivered by our own fleet
 */

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { OrderStateMachine, ORDER_STATUS, FULFILLMENT_TYPES } from '../services/orderStateMachine.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('LogisticsController');

// =============================================================================
// RIDER MANAGEMENT
// =============================================================================

/**
 * Get all available riders
 * GET /api/v1/riders
 */
export const getAvailableRiders = asyncHandler(async (req, res) => {
  const { zone, available_only = 'true' } = req.query;

  let query = supabaseAdmin
    .from('riders')
    .select(`
      id,
      user_id,
      vehicle_type,
      vehicle_number,
      is_available,
      current_zone,
      max_daily_orders,
      current_order_count,
      total_deliveries,
      successful_deliveries,
      average_rating,
      user:users(id, name, phone)
    `);

  if (available_only === 'true') {
    query = query.eq('is_available', true);
  }

  if (zone) {
    query = query.eq('current_zone', zone);
  }

  const { data, error } = await query.order('average_rating', { ascending: false });

  if (error) {
    throw new AppError('Failed to fetch riders', 500);
  }

  res.json({
    success: true,
    data: (data || []).map(rider => ({
      ...rider,
      name: rider.user?.name,
      phone: rider.user?.phone,
      capacityRemaining: rider.max_daily_orders - rider.current_order_count,
      successRate: rider.total_deliveries > 0 
        ? ((rider.successful_deliveries / rider.total_deliveries) * 100).toFixed(1)
        : 100,
    })),
  });
});

// =============================================================================
// BULK ASSIGN ORDERS TO RIDER
// =============================================================================

/**
 * Bulk assign orders to a rider
 * POST /api/v1/riders/assign
 * 
 * Body: { rider_id: UUID, order_ids: UUID[] }
 */
export const bulkAssignToRider = asyncHandler(async (req, res) => {
  const { rider_id, order_ids } = req.body;

  if (!rider_id) {
    throw new ValidationError('Rider ID is required');
  }

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    throw new ValidationError('Order IDs array is required');
  }

  // Verify rider exists and is available
  const { data: rider, error: riderError } = await supabaseAdmin
    .from('riders')
    .select('id, user_id, is_available, current_order_count, max_daily_orders')
    .eq('user_id', rider_id)
    .single();

  if (riderError || !rider) {
    throw new NotFoundError('Rider');
  }

  if (!rider.is_available) {
    throw new ValidationError('Rider is not available');
  }

  // Check capacity
  if (rider.current_order_count + order_ids.length > rider.max_daily_orders) {
    throw new ValidationError(
      `Rider capacity exceeded. Can only accept ${rider.max_daily_orders - rider.current_order_count} more orders`
    );
  }

  // Get orders and validate they can be assigned
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, status, fulfillment_type, order_number')
    .in('id', order_ids);

  if (ordersError || !orders || orders.length === 0) {
    throw new NotFoundError('Orders');
  }

  // Validate each order
  const validOrders = [];
  const invalidOrders = [];

  for (const order of orders) {
    try {
      // Must be inside_valley
      if (order.fulfillment_type !== FULFILLMENT_TYPES.INSIDE_VALLEY) {
        invalidOrders.push({ id: order.id, reason: 'Not an Inside Valley order' });
        continue;
      }

      // Must be in packed status
      if (order.status !== ORDER_STATUS.PACKED) {
        invalidOrders.push({ id: order.id, reason: `Invalid status: ${order.status}` });
        continue;
      }

      validOrders.push(order);
    } catch (err) {
      invalidOrders.push({ id: order.id, reason: err.message });
    }
  }

  if (validOrders.length === 0) {
    throw new ValidationError('No valid orders to assign');
  }

  const validOrderIds = validOrders.map(o => o.id);

  // Start transaction
  // 1. Create delivery assignments
  const assignments = validOrderIds.map(orderId => ({
    order_id: orderId,
    rider_id: rider_id,
    status: 'assigned',
    assigned_at: new Date().toISOString(),
  }));

  const { error: assignError } = await supabaseAdmin
    .from('delivery_assignments')
    .insert(assignments);

  if (assignError) {
    throw new AppError('Failed to create assignments', 500);
  }

  // 2. Update orders
  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      status: ORDER_STATUS.ASSIGNED,
      assigned_rider_id: rider_id,
      assigned_at: new Date().toISOString(),
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .in('id', validOrderIds);

  if (updateError) {
    throw new AppError('Failed to update orders', 500);
  }

  // 3. Update rider order count
  const { error: riderUpdateError } = await supabaseAdmin
    .from('riders')
    .update({
      current_order_count: rider.current_order_count + validOrders.length,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', rider_id);

  if (riderUpdateError) {
    logger.warn('Failed to update rider order count', { riderId: rider_id });
  }

  logger.info('Bulk rider assignment', {
    riderId: rider_id,
    assignedCount: validOrders.length,
    invalidCount: invalidOrders.length,
    userId: req.user.id,
  });

  res.json({
    success: true,
    message: `${validOrders.length} orders assigned to rider`,
    data: {
      assignedCount: validOrders.length,
      assignedOrders: validOrders.map(o => o.order_number),
      invalidOrders,
      riderId: rider_id,
    },
  });
});

// =============================================================================
// UPDATE DELIVERY STATUS (For Rider App)
// =============================================================================

/**
 * Update delivery status
 * POST /api/v1/riders/update-status
 * 
 * Body: { 
 *   order_id: UUID, 
 *   status: 'picked' | 'delivered' | 'failed',
 *   notes?: string,
 *   failure_reason?: string,
 *   proof_image_url?: string,
 *   recipient_name?: string,
 *   location?: { lat: number, lng: number }
 * }
 */
export const updateDeliveryStatus = asyncHandler(async (req, res) => {
  const { 
    order_id, 
    status, 
    notes, 
    failure_reason, 
    proof_image_url,
    recipient_name,
    location,
  } = req.body;

  if (!order_id || !status) {
    throw new ValidationError('Order ID and status are required');
  }

  const validStatuses = ['picked', 'in_transit', 'delivered', 'failed'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Get the delivery assignment
  const { data: assignment, error: assignError } = await supabaseAdmin
    .from('delivery_assignments')
    .select(`
      id,
      order_id,
      rider_id,
      status,
      attempt_number,
      order:orders(id, status, fulfillment_type, order_number)
    `)
    .eq('order_id', order_id)
    .in('status', ['assigned', 'picked', 'in_transit'])
    .single();

  if (assignError || !assignment) {
    throw new NotFoundError('Active delivery assignment');
  }

  // Validate rider is updating their own assignment
  if (assignment.rider_id !== req.user.id && req.user.role !== 'admin') {
    throw new AppError('You can only update your own deliveries', 403);
  }

  const now = new Date().toISOString();
  const order = assignment.order;

  // Build assignment update
  const assignmentUpdate = {
    status,
    notes,
    updated_at: now,
  };

  // Build order update
  let orderUpdate = {
    updated_by: req.user.id,
    updated_at: now,
  };

  // Handle different statuses
  switch (status) {
    case 'picked':
      assignmentUpdate.picked_at = now;
      orderUpdate.status = ORDER_STATUS.OUT_FOR_DELIVERY;
      orderUpdate.dispatched_at = now;
      if (location) {
        assignmentUpdate.pickup_lat = location.lat;
        assignmentUpdate.pickup_lng = location.lng;
      }
      break;

    case 'in_transit':
      // Just update assignment status
      break;

    case 'delivered':
      assignmentUpdate.delivered_at = now;
      assignmentUpdate.proof_image_url = proof_image_url;
      assignmentUpdate.recipient_name = recipient_name;
      orderUpdate.status = ORDER_STATUS.DELIVERED;
      orderUpdate.delivered_at = now;
      orderUpdate.delivery_proof_url = proof_image_url;
      if (location) {
        assignmentUpdate.delivery_lat = location.lat;
        assignmentUpdate.delivery_lng = location.lng;
      }
      break;

    case 'failed':
      if (!failure_reason) {
        throw new ValidationError('Failure reason is required');
      }
      assignmentUpdate.failed_at = now;
      assignmentUpdate.failure_reason = failure_reason;
      // Order goes back to assigned status
      orderUpdate.status = ORDER_STATUS.ASSIGNED;
      // Increment attempt count for next assignment
      break;
  }

  // Update assignment
  const { error: updateAssignError } = await supabaseAdmin
    .from('delivery_assignments')
    .update(assignmentUpdate)
    .eq('id', assignment.id);

  if (updateAssignError) {
    throw new AppError('Failed to update assignment', 500);
  }

  // Update order
  const { error: updateOrderError } = await supabaseAdmin
    .from('orders')
    .update(orderUpdate)
    .eq('id', order_id);

  if (updateOrderError) {
    throw new AppError('Failed to update order', 500);
  }

  // Update rider stats if delivered
  if (status === 'delivered') {
    await supabaseAdmin.rpc('increment_rider_stats', {
      p_rider_id: assignment.rider_id,
      p_successful: true,
    }).catch(err => logger.warn('Failed to update rider stats', { err }));
  } else if (status === 'failed') {
    await supabaseAdmin.rpc('increment_rider_stats', {
      p_rider_id: assignment.rider_id,
      p_successful: false,
    }).catch(err => logger.warn('Failed to update rider stats', { err }));
  }

  // Add order comment
  await supabaseAdmin.from('order_comments').insert({
    order_id,
    comment: `Delivery ${status}${notes ? `: ${notes}` : ''}${failure_reason ? `. Reason: ${failure_reason}` : ''}`,
    source: 'rider',
    created_by: req.user.id,
  });

  logger.info('Delivery status updated', {
    orderId: order_id,
    status,
    riderId: assignment.rider_id,
    userId: req.user.id,
  });

  res.json({
    success: true,
    message: `Delivery marked as ${status}`,
    data: {
      orderId: order_id,
      orderNumber: order.order_number,
      assignmentStatus: status,
      orderStatus: orderUpdate.status || order.status,
    },
  });
});

// =============================================================================
// GET RIDER ASSIGNMENTS
// =============================================================================

/**
 * Get assignments for a rider
 * GET /api/v1/riders/:id/assignments
 */
export const getRiderAssignments = asyncHandler(async (req, res) => {
  const { id: riderId } = req.params;
  const { status, date } = req.query;

  let query = supabaseAdmin
    .from('delivery_assignments')
    .select(`
      id,
      status,
      attempt_number,
      assigned_at,
      picked_at,
      delivered_at,
      failed_at,
      notes,
      failure_reason,
      order:orders(
        id,
        order_number,
        total_amount,
        payment_status,
        shipping_address,
        customer:customers(name, phone)
      )
    `)
    .eq('rider_id', riderId)
    .order('assigned_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    query = query
      .gte('assigned_at', startOfDay.toISOString())
      .lte('assigned_at', endOfDay.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError('Failed to fetch assignments', 500);
  }

  res.json({
    success: true,
    data: data || [],
    summary: {
      total: data?.length || 0,
      assigned: data?.filter(a => a.status === 'assigned').length || 0,
      picked: data?.filter(a => a.status === 'picked').length || 0,
      delivered: data?.filter(a => a.status === 'delivered').length || 0,
      failed: data?.filter(a => a.status === 'failed').length || 0,
    },
  });
});

// =============================================================================
// GET TODAY'S DISPATCH SUMMARY
// =============================================================================

/**
 * Get today's dispatch summary for inside valley
 * GET /api/v1/logistics/summary
 */
export const getTodaysSummary = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Get all inside valley orders assigned today
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, status, assigned_rider_id')
    .eq('fulfillment_type', FULFILLMENT_TYPES.INSIDE_VALLEY)
    .gte('assigned_at', startOfDay.toISOString());

  // Get rider stats
  const { data: riders } = await supabaseAdmin
    .from('riders')
    .select(`
      id,
      user_id,
      current_order_count,
      is_available,
      user:users(name)
    `)
    .gt('current_order_count', 0);

  res.json({
    success: true,
    data: {
      totalAssigned: orders?.filter(o => o.status === ORDER_STATUS.ASSIGNED).length || 0,
      outForDelivery: orders?.filter(o => o.status === ORDER_STATUS.OUT_FOR_DELIVERY).length || 0,
      delivered: orders?.filter(o => o.status === ORDER_STATUS.DELIVERED).length || 0,
      failed: orders?.filter(o => o.status === ORDER_STATUS.RETURN_INITIATED).length || 0,
      riderStats: (riders || []).map(r => ({
        riderId: r.user_id,
        name: r.user?.name,
        activeOrders: r.current_order_count,
        isAvailable: r.is_available,
      })),
    },
  });
});

export default {
  getAvailableRiders,
  bulkAssignToRider,
  updateDeliveryStatus,
  getRiderAssignments,
  getTodaysSummary,
};
