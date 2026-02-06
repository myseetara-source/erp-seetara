/**
 * Rider Service
 * 
 * Handles all rider-related business logic:
 * - Order assignment and route planning
 * - Delivery status updates
 * - Cash-on-Delivery tracking
 * - Settlements
 * 
 * @module services/rider.service
 */

import { supabase, supabaseAdmin } from '../config/supabase.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { OrderStateMachine, ORDER_STATUS, FULFILLMENT_TYPES } from './orderStateMachine.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const RIDER_STATUS = {
  AVAILABLE: 'available',
  ON_DELIVERY: 'on_delivery',
  ON_BREAK: 'on_break',
  OFF_DUTY: 'off_duty',
  SUSPENDED: 'suspended',
};

const DELIVERY_RESULT = {
  DELIVERED: 'delivered',
  REJECTED: 'rejected',
  NOT_HOME: 'not_home',
  WRONG_ADDRESS: 'wrong_address',
  RESCHEDULED: 'rescheduled',
  RETURNED: 'returned',
};

// =============================================================================
// RIDER MANAGEMENT
// =============================================================================

/**
 * Get rider by user ID
 * P0 FIX: Use supabaseAdmin to bypass RLS
 * P0 FIX: Remove 'email' column - doesn't exist in riders table
 */
async function getRiderByUserId(userId) {
  logger.info('[RiderService] getRiderByUserId called', { userId });
  
  const { data: rider, error } = await supabaseAdmin
    .from('riders')
    .select(`
      id, user_id, full_name, phone, rider_code,
      vehicle_type, vehicle_number, 
      is_available, is_active, status,
      total_deliveries, successful_deliveries, failed_deliveries,
      average_rating, current_cash_balance,
      created_at
    `)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('[RiderService] getRiderByUserId error', { error: error.message });
    throw error;
  }

  logger.info('[RiderService] getRiderByUserId result', { 
    found: !!rider, 
    riderId: rider?.id 
  });

  return rider;
}

/**
 * Get rider by ID
 * P0 FIX: Use supabaseAdmin to bypass RLS
 * P0 FIX: Select only valid columns from riders table
 */
async function getRiderById(riderId) {
  const { data: rider, error } = await supabaseAdmin
    .from('riders')
    .select(`
      id, user_id, rider_code, full_name, phone,
      emergency_contact, status, vehicle_type, vehicle_number,
      license_number, max_orders_per_run,
      total_deliveries, successful_deliveries, failed_deliveries,
      average_rating, current_cash_balance,
      is_available, is_active,
      joined_at, notes, created_at, updated_at,
      user:users(id, name, email, phone)
    `)
    .eq('id', riderId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('Rider not found');
    }
    throw error;
  }

  return rider;
}

/**
 * List all active riders
 * P0 FIX: Use supabaseAdmin to bypass RLS
 */
async function listRiders(filters = {}) {
  const { status, is_active = true } = filters;

  let query = supabaseAdmin
    .from('riders')
    .select(`
      *,
      user:users(id, name, email, phone)
    `)
    .eq('is_active', is_active)
    .order('rider_code', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: riders, error } = await query;

  if (error) throw error;

  return riders;
}

/**
 * Update rider status
 */
async function updateRiderStatus(riderId, status, userId) {
  const validStatuses = Object.values(RIDER_STATUS);
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const { data: rider, error } = await supabaseAdmin
    .from('riders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', riderId)
    .select()
    .single();

  if (error) throw error;

  logger.info(`Rider ${rider.rider_code} status updated to ${status}`);

  return rider;
}

/**
 * Update rider location
 */
async function updateRiderLocation(riderId, lat, lng) {
  const { data: rider, error } = await supabaseAdmin
    .from('riders')
    .update({
      last_known_lat: lat,
      last_known_lng: lng,
      last_location_update: new Date().toISOString(),
    })
    .eq('id', riderId)
    .select()
    .single();

  if (error) throw error;

  return rider;
}

// =============================================================================
// ORDER ASSIGNMENT (Admin)
// =============================================================================

/**
 * Assign orders to a rider
 * Creates or updates delivery run for today
 * 
 * @param {string} riderId - Rider UUID
 * @param {string[]} orderIds - Array of order UUIDs
 * @param {string} assignedBy - User ID of admin/staff
 */
async function assignOrdersToRider(riderId, orderIds, assignedBy) {
  if (!orderIds || orderIds.length === 0) {
    throw new BadRequestError('No orders provided for assignment');
  }

  // Get rider info
  const rider = await getRiderById(riderId);
  if (!rider) {
    throw new NotFoundError('Rider not found');
  }

  if (rider.status === RIDER_STATUS.SUSPENDED) {
    throw new BadRequestError('Cannot assign orders to a suspended rider');
  }

  // Check order count against max capacity
  if (orderIds.length > rider.max_orders_per_run) {
    throw new BadRequestError(`Rider can only handle ${rider.max_orders_per_run} orders per run`);
  }

  // P0 FIX: Use 'rider_id' column (not 'assigned_rider_id')
  // Validate orders: must be inside_valley, status=packed, not already assigned
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status, fulfillment_type, rider_id, total_amount, payment_method')
    .in('id', orderIds);

  if (ordersError) throw ordersError;

  if (orders.length !== orderIds.length) {
    throw new BadRequestError('Some orders were not found');
  }

  // Validate each order
  const errors = [];
  let expectedCOD = 0;

  for (const order of orders) {
    if (order.fulfillment_type !== FULFILLMENT_TYPES.INSIDE_VALLEY) {
      errors.push(`Order ${order.order_number}: Not an Inside Valley order`);
    }
    if (order.status !== 'packed') {
      errors.push(`Order ${order.order_number}: Must be 'packed' status (current: ${order.status})`);
    }
    if (order.rider_id && order.rider_id !== riderId) {
      errors.push(`Order ${order.order_number}: Already assigned to another rider`);
    }
    
    // Calculate expected COD
    if (order.payment_method === 'cod') {
      expectedCOD += parseFloat(order.total_amount) || 0;
    }
  }

  if (errors.length > 0) {
    throw new BadRequestError(`Assignment failed:\n${errors.join('\n')}`);
  }

  // Get or create delivery run for today
  const today = new Date().toISOString().split('T')[0];
  
  let { data: run } = await supabase
    .from('delivery_runs')
    .select('id, user_id, name, phone, vehicle_type, vehicle_number, is_available, status, total_deliveries, successful_deliveries, average_rating, created_at')
    .eq('rider_id', riderId)
    .eq('run_date', today)
    .eq('status', 'pending')
    .maybeSingle();

  if (!run) {
    // Create new run
    const runNumber = `RUN-${today.replace(/-/g, '')}-${rider.rider_code}-1`;
    
    const { data: newRun, error: runError } = await supabaseAdmin
      .from('delivery_runs')
      .insert({
        run_number: runNumber,
        rider_id: riderId,
        run_date: today,
        status: 'pending',
        assigned_by: assignedBy,
        total_orders: orderIds.length,
        pending_count: orderIds.length,
        expected_cod: expectedCOD,
      })
      .select()
      .single();

    if (runError) throw runError;
    run = newRun;
  } else {
    // Update existing run
    const { error: updateError } = await supabaseAdmin
      .from('delivery_runs')
      .update({
        total_orders: run.total_orders + orderIds.length,
        pending_count: run.pending_count + orderIds.length,
        expected_cod: parseFloat(run.expected_cod) + expectedCOD,
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    if (updateError) throw updateError;
  }

  // Assign orders to rider
  // P0 FIX: Use 'rider_id' column (not 'assigned_rider_id')
  // P0 FIX: Removed delivery_sequence and delivery_run_id (columns don't exist in orders table)
  
  const updates = orderIds.map((orderId) => ({
    id: orderId,
    rider_id: riderId,
    status: ORDER_STATUS.ASSIGNED,
    updated_at: new Date().toISOString(),
  }));

  // Batch update orders - OPTIMIZED: Run all updates concurrently
  const updatePromises = updates.map(update => 
    supabaseAdmin
      .from('orders')
      .update({
        rider_id: update.rider_id,
        status: update.status,
        rider_assigned_at: new Date().toISOString(),
        updated_at: update.updated_at,
      })
      .eq('id', update.id)
      .then(({ error }) => {
        if (error) {
          logger.error(`Failed to assign order ${update.id}:`, error);
          throw error;
        }
        return { id: update.id, success: true };
      })
  );

  await Promise.all(updatePromises);

  // Update rider status
  await updateRiderStatus(riderId, RIDER_STATUS.ON_DELIVERY, assignedBy);

  logger.info(`Assigned ${orderIds.length} orders to rider ${rider.rider_code}`, {
    riderId,
    runId: run.id,
    orderCount: orderIds.length,
    expectedCOD,
  });

  return {
    run,
    assignedCount: orderIds.length,
    expectedCOD,
  };
}

/**
 * Get count of assigned orders for a rider (for sequence calculation)
 * P0 FIX: Removed delivery_sequence column reference (doesn't exist)
 */
async function getAssignedOrderCount(riderId) {
  const { count, error } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', riderId)
    .in('status', ['assigned', 'out_for_delivery', 'in_transit']);

  if (error) {
    logger.warn('[RiderService] getAssignedOrderCount error:', error.message);
    return 0;
  }

  return count || 0;
}

// =============================================================================
// RIDER TASKS (Rider App)
// =============================================================================

/**
 * Get assigned tasks for a rider
 * 
 * @param {string} riderId - Rider UUID
 * @param {Object} options - Filter options
 * P0 FIX: Removed delivery_sequence (column doesn't exist in orders table)
 */
async function getRiderTasks(riderId, options = {}) {
  const { date, include_all = true } = options;

  logger.info('[RiderService] getRiderTasks called', { riderId, options });

  // P0 FIX: Use 'rider_id' column (not 'assigned_rider_id' - that doesn't exist)
  // P0 FIX: Only select columns that exist in the orders table
  // Return all orders assigned to this rider for today (including rejected/returned)
  let query = supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      readable_id,
      status,
      total_amount,
      payment_method,
      payment_status,
      shipping_name,
      shipping_phone,
      alt_phone,
      shipping_address,
      shipping_city,
      zone_code,
      internal_notes,
      remarks,
      priority,
      created_at,
      delivered_at,
      rejection_reason
    `)
    .eq('rider_id', riderId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (!include_all) {
    // Only show active orders (excluding delivered)
    query = query.in('status', ['assigned', 'out_for_delivery', 'in_transit', 'rejected']);
  } else {
    // Show all orders except delivered (delivered orders go to history)
    query = query.neq('status', 'delivered');
  }

  const { data: tasks, error } = await query;

  if (error) {
    logger.error('[RiderService] getRiderTasks error:', { error: error.message });
    throw error;
  }

  logger.info('[RiderService] Found tasks:', { count: tasks?.length || 0 });

  // Calculate stats
  const taskList = tasks || [];
  const stats = {
    total: taskList.length,
    pending: taskList.filter(t => ['assigned', 'out_for_delivery', 'in_transit', 'rescheduled'].includes(t.status)).length,
    in_progress: taskList.filter(t => t.status === 'out_for_delivery').length,
    rescheduled: taskList.filter(t => t.status === 'rescheduled').length,
    rejected: taskList.filter(t => t.status === 'rejected').length,
    delivered: taskList.filter(t => t.status === 'delivered').length,
    expected_cod: taskList
      .filter(t => t.payment_method === 'cod' && t.payment_status !== 'paid' && !['delivered', 'cancelled'].includes(t.status))
      .reduce((sum, t) => sum + parseFloat(t.total_amount || 0), 0),
  };

  return { tasks: taskList, stats };
}

/**
 * Reorder delivery sequence
 * 
 * @param {string} riderId - Rider UUID
 * @param {Array} orderSequences - Array of { order_id, sequence }
 * 
 * NOTE: delivery_sequence column doesn't exist yet - this is a placeholder
 * TODO: Add migration to add delivery_sequence column to orders table
 */
async function reorderDeliverySequence(riderId, orderSequences) {
  if (!Array.isArray(orderSequences) || orderSequences.length === 0) {
    throw new BadRequestError('Order sequences array is required');
  }

  // Verify all orders belong to this rider
  // P0 FIX: Use 'rider_id' column (not 'assigned_rider_id')
  const orderIds = orderSequences.map(os => os.order_id);
  
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, rider_id')
    .in('id', orderIds);

  for (const order of orders || []) {
    if (order.rider_id !== riderId) {
      throw new ForbiddenError('Cannot reorder orders not assigned to you');
    }
  }

  // NOTE: delivery_sequence column doesn't exist in orders table yet
  // Just acknowledge the reorder request for now
  logger.info(`Rider ${riderId} requested reorder of ${orderSequences.length} deliveries (delivery_sequence not implemented)`);

  return { success: true, updated: orderSequences.length };
}

// =============================================================================
// DELIVERY STATUS UPDATE (Rider App)
// =============================================================================

/**
 * Update delivery status
 * 
 * CRITICAL: Handles cash collection and rider balance updates
 * 
 * @param {string} riderId - Rider UUID
 * @param {string} orderId - Order UUID
 * @param {Object} updateData - Status update data
 */
async function updateDeliveryStatus(riderId, orderId, updateData) {
  const { status, result, reason, collected_cash, proof_photo_url, notes, lat, lng, payment_type } = updateData;

  logger.info('[RiderService] updateDeliveryStatus called', { riderId, orderId, result, reason });

  // Get order - P0 FIX: Only select columns that exist in orders table
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      rider_id,
      total_amount,
      payment_method,
      payment_status,
      remarks
    `)
    .eq('id', orderId)
    .single();

  if (orderError) {
    if (orderError.code === 'PGRST116') {
      throw new NotFoundError('Order not found');
    }
    logger.error('[RiderService] Order fetch error:', orderError);
    throw orderError;
  }

  // Verify order is assigned to this rider
  if (order.rider_id !== riderId) {
    throw new ForbiddenError('This order is not assigned to you');
  }

  // Get rider
  const rider = await getRiderById(riderId);

  // =========================================================================
  // DETERMINE NEW ORDER STATUS BASED ON RESULT
  // - delivered: status = 'delivered', add COD to rider balance
  // - rejected: status = 'rejected', rider keeps until returns to office
  // - rescheduled/next_attempt: status = 'rescheduled' (will retry tomorrow)
  // =========================================================================
  let newOrderStatus;
  let isRescheduled = false;
  
  if (result === DELIVERY_RESULT.DELIVERED || result === 'delivered') {
    newOrderStatus = ORDER_STATUS.DELIVERED;
  } else if (result === DELIVERY_RESULT.REJECTED || result === 'rejected') {
    // Rejected - rider must return item to office
    newOrderStatus = ORDER_STATUS.REJECTED;
  } else if (result === DELIVERY_RESULT.RESCHEDULED || result === 'rescheduled' || result === 'next_attempt') {
    // Next attempt - order marked as rescheduled, stays with rider
    // Will be retried on next delivery day
    // Note: 'rescheduled' is added in migration 118
    newOrderStatus = 'rescheduled';
    isRescheduled = true;
  } else {
    // Default fallback for other cases
    newOrderStatus = ORDER_STATUS.OUT_FOR_DELIVERY;
  }

  // Validate: non-delivered requires reason (except for rescheduled)
  if (result !== DELIVERY_RESULT.DELIVERED && result !== 'delivered' && 
      result !== DELIVERY_RESULT.RESCHEDULED && result !== 'rescheduled' && 
      result !== 'next_attempt' && !reason) {
    throw new BadRequestError('Reason is required for rejected orders');
  }

  // =========================================================================
  // CASH COLLECTION LOGIC
  // =========================================================================
  let cashCollected = 0;
  
  if (result === DELIVERY_RESULT.DELIVERED && order.payment_method === 'cod') {
    // Validate collected cash
    cashCollected = parseFloat(collected_cash) || 0;
    const expectedCash = parseFloat(order.total_amount) || 0;
    
    if (cashCollected < expectedCash * 0.9) {
      // Allow up to 10% tolerance for rounding/change issues
      throw new BadRequestError(
        `Collected cash (रु. ${cashCollected}) is less than expected (रु. ${expectedCash})`
      );
    }

    // Update rider's cash balance
    // P0 FIX: Only use columns that exist in riders table (removed total_cash_collected)
    const balanceBefore = parseFloat(rider.current_cash_balance || 0);
    const balanceAfter = balanceBefore + cashCollected;

    const { error: cashError } = await supabaseAdmin
      .from('riders')
      .update({
        current_cash_balance: balanceAfter,
        updated_at: new Date().toISOString(),
      })
      .eq('id', riderId);

    if (cashError) {
      logger.error('Failed to update rider cash balance:', cashError);
      throw new BadRequestError('Failed to record cash collection');
    }

    // Create balance log entry for audit trail
    try {
      await supabaseAdmin
        .from('rider_balance_log')
        .insert({
          rider_id: riderId,
          change_type: 'cod_collection',
          amount: cashCollected,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reference_type: 'order',
          reference_id: orderId,
          reference_number: order.order_number,
          performed_by: riderId,
          notes: `COD collected for order ${order.order_number}`,
        });
    } catch (logError) {
      // Non-critical - log but don't fail
      logger.warn('Failed to create balance log entry:', logError.message);
    }

    logger.info(`Rider ${rider.rider_code} collected रु. ${cashCollected} for order ${order.order_number}`);
  }

  // =========================================================================
  // CREATE DELIVERY ATTEMPT RECORD (NON-CRITICAL)
  // P0 FIX: Only use columns that exist in delivery_attempts table
  // =========================================================================
  let attempt = null;
  try {
    // First get the current attempt count for this order
    const { count } = await supabaseAdmin
      .from('delivery_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('order_id', orderId);

    const attemptData = {
      order_id: orderId,
      attempt_number: (count || 0) + 1,
      result: result || newOrderStatus,
      reason: reason || null,
      notes: notes || null,
      performed_by: riderId,
    };

    const { data, error: attemptError } = await supabaseAdmin
      .from('delivery_attempts')
      .insert(attemptData)
      .select()
      .single();

    if (attemptError) {
      // Log but don't fail - the order update is more important
      logger.warn('Failed to create delivery attempt (non-critical):', attemptError.message);
    } else {
      attempt = data;
    }
  } catch (attemptErr) {
    logger.warn('Delivery attempt insert failed (non-critical):', attemptErr.message);
  }

  // =========================================================================
  // UPDATE ORDER
  // P0 FIX: Only use columns that exist in orders table
  // =========================================================================
  const orderUpdate = {
    status: newOrderStatus,
    updated_at: new Date().toISOString(),
  };

  // Handle DELIVERED status
  if (result === DELIVERY_RESULT.DELIVERED || result === 'delivered') {
    orderUpdate.delivered_at = new Date().toISOString();
    
    // Update payment status for COD orders
    if (order.payment_method === 'cod') {
      orderUpdate.payment_status = 'paid';
      orderUpdate.paid_amount = parseFloat(order.total_amount) || 0;
    }
  }

  // Handle REJECTED status - rider keeps item until returned to office
  if (result === DELIVERY_RESULT.REJECTED || result === 'rejected') {
    orderUpdate.rejection_reason = reason;
    // Rider still keeps the order - they must physically return to office
  }

  // Handle RESCHEDULED/NEXT ATTEMPT - order stays with same rider
  if (isRescheduled) {
    // Order remains assigned to the same rider
    // At midnight, system should auto-reassign these for next day delivery
    // Note: Appending to remarks field since rescheduled_reason column doesn't exist
    const rescheduleNote = `[${new Date().toLocaleDateString()}] Next Attempt: ${reason || 'Rescheduled for tomorrow'}`;
    if (order.remarks) {
      orderUpdate.remarks = `${order.remarks}\n${rescheduleNote}`;
    } else {
      orderUpdate.remarks = rescheduleNote;
    }
  }

  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update(orderUpdate)
    .eq('id', orderId)
    .select()
    .single();

  if (updateError) {
    logger.error('Failed to update order:', updateError);
    throw updateError;
  }

  // Trigger post-transition hooks (feedback ticket, SMS, etc.)
  if (newOrderStatus === ORDER_STATUS.DELIVERED) {
    try {
      const { executePostTransitionHooks } = await import('./orderStateMachine.js');
      await executePostTransitionHooks(updatedOrder, order.status, newOrderStatus);
    } catch (hookError) {
      logger.warn('Post-transition hook failed:', hookError.message);
    }
  }

  logger.info(`Delivery status updated for order ${order.order_number}`, {
    orderId,
    result,
    cashCollected,
    newStatus: newOrderStatus,
    paymentType: payment_type,
  });

  return {
    order: updatedOrder,
    attempt,
    cashCollected,
  };
}

// =============================================================================
// CASH SETTLEMENTS
// =============================================================================

/**
 * Get rider's current cash balance and pending settlement
 * P0 FIX: Use supabaseAdmin to bypass RLS
 */
async function getRiderCashSummary(riderId) {
  logger.info('[RiderService] getRiderCashSummary called', { riderId });
  
  const rider = await getRiderById(riderId);
  
  // Get today's collections
  const today = new Date().toISOString().split('T')[0];
  
  // Try getting from delivery_attempts (may not exist)
  let todayTotal = 0;
  try {
    const { data: todayCollections } = await supabaseAdmin
      .from('delivery_attempts')
      .select('cash_collected')
      .eq('rider_id', riderId)
      .gte('created_at', `${today}T00:00:00`)
      .not('cash_collected', 'is', null);

    todayTotal = (todayCollections || [])
      .reduce((sum, a) => sum + parseFloat(a.cash_collected || 0), 0);
  } catch (e) {
    // Table may not exist
    logger.warn('[RiderService] delivery_attempts table may not exist');
  }

  // Alternative: Get from delivered COD orders today
  const { data: todayCodOrders } = await supabaseAdmin
    .from('orders')
    .select('total_amount, paid_amount')
    .eq('rider_id', riderId)
    .eq('status', 'delivered')
    .eq('payment_method', 'cod')
    .gte('delivered_at', `${today}T00:00:00`);

  const todayCodCollected = (todayCodOrders || [])
    .reduce((sum, o) => sum + parseFloat(o.paid_amount || o.total_amount || 0), 0);

  // Get pending COD (not yet delivered)
  const { data: pendingCodOrders } = await supabaseAdmin
    .from('orders')
    .select('total_amount')
    .eq('rider_id', riderId)
    .in('status', ['assigned', 'out_for_delivery', 'in_transit'])
    .eq('payment_method', 'cod')
    .neq('payment_status', 'paid');

  const pendingCod = (pendingCodOrders || [])
    .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

  // Get pending settlements
  let pendingSettlements = [];
  try {
    const { data } = await supabaseAdmin
      .from('rider_settlements')
      .select('id, status, total_cod_collected, created_at')
      .eq('rider_id', riderId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    pendingSettlements = data || [];
  } catch (e) {
    // Table may not exist
  }

  return {
    current_balance: parseFloat(rider?.current_cash_balance) || 0,
    today_collected: todayCodCollected || todayTotal,
    pending_cod: pendingCod,
    lifetime_collected: parseFloat(rider?.total_cash_collected) || 0,
    pending_settlements: pendingSettlements,
  };
}

/**
 * Create settlement request (Rider submits cash)
 */
async function createSettlementRequest(riderId, amount, method = 'cash') {
  const rider = await getRiderById(riderId);
  const currentBalance = parseFloat(rider.current_cash_balance) || 0;

  if (amount > currentBalance) {
    throw new BadRequestError(
      `Settlement amount (रु. ${amount}) exceeds current balance (रु. ${currentBalance})`
    );
  }

  // Generate settlement number
  const settlementNumber = `SET-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${rider.rider_code}`;

  const { data: settlement, error } = await supabaseAdmin
    .from('rider_settlements')
    .insert({
      settlement_number: settlementNumber,
      rider_id: riderId,
      expected_amount: amount,
      status: 'pending',
      settlement_method: method,
    })
    .select()
    .single();

  if (error) throw error;

  logger.info(`Settlement request ${settlementNumber} created for rider ${rider.rider_code}`, {
    amount,
    riderId,
  });

  return settlement;
}

/**
 * Verify and complete settlement (Admin)
 */
async function verifySettlement(settlementId, actualAmount, verifiedBy, notes) {
  const { data: settlement, error: fetchError } = await supabase
    .from('rider_settlements')
    .select(`
      *,
      rider:riders(id, rider_code, current_cash_balance)
    `)
    .eq('id', settlementId)
    .single();

  if (fetchError) throw fetchError;

  if (settlement.status !== 'pending') {
    throw new BadRequestError('Settlement is not pending');
  }

  const discrepancy = parseFloat(settlement.expected_amount) - parseFloat(actualAmount);

  // Determine status
  let newStatus = 'settled';
  if (Math.abs(discrepancy) > 1) {
    // More than रु. 1 difference
    newStatus = 'discrepancy';
  }

  // Update settlement
  const { data: updatedSettlement, error: updateError } = await supabaseAdmin
    .from('rider_settlements')
    .update({
      actual_amount: actualAmount,
      discrepancy,
      status: newStatus,
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      verification_notes: notes,
      settled_at: newStatus === 'settled' ? new Date().toISOString() : null,
    })
    .eq('id', settlementId)
    .select()
    .single();

  if (updateError) throw updateError;

  // Deduct from rider's balance
  const newBalance = parseFloat(settlement.rider.current_cash_balance) - parseFloat(actualAmount);

  const { error: balanceError } = await supabaseAdmin
    .from('riders')
    .update({
      current_cash_balance: Math.max(0, newBalance),
      updated_at: new Date().toISOString(),
    })
    .eq('id', settlement.rider_id);

  if (balanceError) {
    logger.error('Failed to update rider balance:', balanceError);
    throw balanceError;
  }

  logger.info(`Settlement ${settlement.settlement_number} verified`, {
    settlementId,
    expectedAmount: settlement.expected_amount,
    actualAmount,
    discrepancy,
    newStatus,
  });

  return updatedSettlement;
}

// =============================================================================
// P0: RIDER MOBILE APP FUNCTIONS
// =============================================================================

/**
 * Get rider delivery history for a specific date
 */
async function getRiderHistory(riderId, date) {
  const startDate = `${date}T00:00:00`;
  const endDate = `${date}T23:59:59`;

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      readable_id,
      shipping_name,
      total_amount,
      status,
      payment_status,
      paid_amount,
      delivered_at,
      updated_at
    `)
    .eq('rider_id', riderId)
    .in('status', ['delivered', 'rejected', 'returned'])
    .gte('updated_at', startDate)
    .lte('updated_at', endDate)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error('[RiderService] getRiderHistory error:', error);
    return [];
  }

  // Also try to get delivery logs for more detailed info
  let deliveryLogs = [];
  try {
    const { data: logs } = await supabase
      .from('delivery_logs')
      .select('order_id, status, cod_collected, attempted_at')
      .eq('rider_id', riderId)
      .gte('attempted_at', startDate)
      .lte('attempted_at', endDate);
    
    deliveryLogs = logs || [];
  } catch (e) {
    // delivery_logs table might not exist yet
  }

  // Merge data
  return (data || []).map(order => {
    const log = deliveryLogs.find(l => l.order_id === order.id);
    return {
      order_id: order.id,
      order_number: order.order_number,
      readable_id: order.readable_id,
      customer_name: order.shipping_name,
      total_amount: order.total_amount,
      status: order.status,
      outcome: log?.status || order.status,
      cod_collected: log?.cod_collected || (order.status === 'delivered' ? order.paid_amount : 0),
      completed_at: order.delivered_at || order.updated_at,
    };
  });
}

/**
 * Get rider dashboard stats
 * P0 FIX: Use supabaseAdmin to bypass RLS
 * 
 * Returns:
 * - today_assigned: Orders assigned to rider today
 * - today_pending: Orders still pending (out_for_delivery, in_transit)
 * - today_delivered: Orders delivered today
 * - today_returned: Orders rejected/returned today
 * - lifetime_delivered: Total lifetime deliveries (from riders table)
 * - lifetime_returned: Total lifetime returns (from riders table)
 * - success_rate: Calculated from lifetime stats
 * - return_rate: Calculated from lifetime stats
 */
async function getRiderDashboardStats(riderId) {
  logger.info('[RiderService] getRiderDashboardStats called', { riderId });
  
  const today = new Date().toISOString().split('T')[0];
  const todayStart = `${today}T00:00:00`;
  
  // Get rider info
  const { data: rider } = await supabaseAdmin
    .from('riders')
    .select('current_cash_balance, average_rating')
    .eq('id', riderId)
    .single();

  // Run all counts in parallel for efficiency
  const [
    todayAssignedResult,
    todayPendingResult,
    todayDeliveredResult,
    todayReturnedResult,
    lifetimeDeliveredResult,
    lifetimeReturnedResult,
    codOrdersResult
  ] = await Promise.all([
    // Today's assigned orders
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', riderId)
      .gte('updated_at', todayStart)
      .eq('is_deleted', false),
    
    // Today's pending orders (still in progress)
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', riderId)
      .in('status', ['assigned', 'out_for_delivery', 'in_transit'])
      .eq('is_deleted', false),
    
    // Today's delivered orders
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', riderId)
      .eq('status', 'delivered')
      .gte('delivered_at', todayStart)
      .eq('is_deleted', false),
    
    // Today's returned/rejected orders
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', riderId)
      .in('status', ['rejected', 'returned', 'cancelled'])
      .gte('updated_at', todayStart)
      .eq('is_deleted', false),
    
    // LIFETIME delivered count (from orders table - actual data)
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', riderId)
      .eq('status', 'delivered')
      .eq('is_deleted', false),
    
    // LIFETIME returned/rejected count (from orders table - actual data)
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('rider_id', riderId)
      .in('status', ['rejected', 'returned', 'cancelled'])
      .eq('is_deleted', false),
    
    // COD to collect (pending orders)
    supabaseAdmin
      .from('orders')
      .select('total_amount')
      .eq('rider_id', riderId)
      .in('status', ['assigned', 'out_for_delivery', 'in_transit'])
      .eq('payment_method', 'cod')
      .neq('payment_status', 'paid')
      .eq('is_deleted', false),
  ]);

  const todayAssigned = todayAssignedResult.count || 0;
  const todayPending = todayPendingResult.count || 0;
  const todayDelivered = todayDeliveredResult.count || 0;
  const todayReturned = todayReturnedResult.count || 0;
  
  // Lifetime stats calculated from ACTUAL orders data
  const lifetimeDelivered = lifetimeDeliveredResult.count || 0;
  const lifetimeReturned = lifetimeReturnedResult.count || 0;
  const totalLifetimeCompleted = lifetimeDelivered + lifetimeReturned;
  
  const codToCollect = (codOrdersResult.data || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);

  // Calculate rates from actual completed orders
  const successRate = totalLifetimeCompleted > 0 
    ? ((lifetimeDelivered / totalLifetimeCompleted) * 100)
    : 100;  // 100% if no completed orders yet
  const returnRate = totalLifetimeCompleted > 0 
    ? ((lifetimeReturned / totalLifetimeCompleted) * 100)
    : 0;

  logger.info('[RiderService] getRiderDashboardStats result', { 
    todayAssigned, todayPending, todayDelivered, todayReturned, 
    lifetimeDelivered, lifetimeReturned, successRate, returnRate
  });

  return {
    // Today's stats
    today_assigned: todayAssigned,
    today_pending: todayPending,
    today_delivered: todayDelivered,
    today_returned: todayReturned,
    
    // Lifetime stats (from actual orders - functional)
    lifetime_delivered: lifetimeDelivered,
    lifetime_returned: lifetimeReturned,
    lifetime_total: totalLifetimeCompleted,
    
    // Calculated rates (functional)
    success_rate: parseFloat(successRate.toFixed(1)),
    return_rate: parseFloat(returnRate.toFixed(1)),
    
    // Financial
    cod_to_collect: codToCollect,
    cod_to_settle: parseFloat(rider?.current_cash_balance) || 0,
    average_rating: rider?.average_rating || 5.0,
  };
}

/**
 * Get rider history for last N days
 * P0 FIX: Returns delivered and returned orders for history tab
 */
async function getRiderHistoryDays(riderId, days = 14) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      shipping_name,
      total_amount,
      status,
      payment_method,
      payment_status,
      delivered_at,
      updated_at
    `)
    .eq('rider_id', riderId)
    .in('status', ['delivered', 'rejected', 'returned', 'cancelled'])
    .gte('updated_at', startDate.toISOString())
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    logger.error('[RiderService] getRiderHistoryDays error:', error.message);
    return [];
  }

  return (data || []).map(order => ({
    id: order.id,
    order_number: order.order_number,
    customer_name: order.shipping_name,
    amount: order.total_amount || 0,
    status: order.status,
    payment_method: order.payment_method,
    date: order.delivered_at || order.updated_at,
  }));
}

/**
 * Get rider settlements for last N days
 * P0 FIX: Returns settlement history for history tab
 */
async function getRiderSettlements(riderId, days = 14) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    const { data, error } = await supabaseAdmin
      .from('rider_settlements')
      .select(`
        id,
        settlement_date,
        status,
        total_cod_collected,
        amount_deposited,
        deposit_reference,
        verified_by,
        verified_at,
        created_at
      `)
      .eq('rider_id', riderId)
      .gte('settlement_date', startDate.toISOString().split('T')[0])
      .order('settlement_date', { ascending: false })
      .limit(50);

    if (error) {
      logger.warn('[RiderService] getRiderSettlements error:', error.message);
      return [];
    }

    return (data || []).map(settlement => ({
      id: settlement.id,
      date: settlement.settlement_date,
      amount: settlement.amount_deposited || settlement.total_cod_collected || 0,
      status: settlement.status || 'pending',
      reference: settlement.deposit_reference,
      verified_by: settlement.verified_by,
    }));
  } catch (err) {
    // Table might not exist
    logger.warn('[RiderService] getRiderSettlements - table may not exist:', err.message);
    return [];
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const RiderService = {
  // Rider Management
  getRiderByUserId,
  getRiderById,
  listRiders,
  updateRiderStatus,
  updateRiderLocation,
  
  // Order Assignment (Admin)
  assignOrdersToRider,
  
  // Rider Tasks
  getRiderTasks,
  reorderDeliverySequence,
  updateDeliveryStatus,
  
  // Cash & Settlements
  getRiderCashSummary,
  createSettlementRequest,
  verifySettlement,
  getRiderSettlements,
  
  // P0: Mobile App
  getRiderHistory,
  getRiderHistoryDays,
  getRiderDashboardStats,
  
  // Constants
  RIDER_STATUS,
  DELIVERY_RESULT,
};

export default RiderService;
