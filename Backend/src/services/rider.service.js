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
 */
async function getRiderByUserId(userId) {
  const { data: rider, error } = await supabase
    .from('riders')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return rider;
}

/**
 * Get rider by ID
 */
async function getRiderById(riderId) {
  const { data: rider, error } = await supabase
    .from('riders')
    .select(`
      *,
      user:users(id, name, email)
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
 */
async function listRiders(filters = {}) {
  const { status, is_active = true } = filters;

  let query = supabase
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

  // Validate orders: must be inside_valley, status=packed, not already assigned
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_number, status, fulfillment_type, assigned_rider_id, total_amount, payment_method')
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
    if (order.assigned_rider_id && order.assigned_rider_id !== riderId) {
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
    .select('*')
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

  // Assign orders with sequence numbers
  const currentMaxSequence = await getMaxDeliverySequence(riderId);
  
  const updates = orderIds.map((orderId, index) => ({
    id: orderId,
    assigned_rider_id: riderId,
    delivery_run_id: run.id,
    delivery_sequence: currentMaxSequence + index + 1,
    status: ORDER_STATUS.ASSIGNED,
    updated_at: new Date().toISOString(),
  }));

  // Batch update orders
  for (const update of updates) {
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        assigned_rider_id: update.assigned_rider_id,
        delivery_run_id: update.delivery_run_id,
        delivery_sequence: update.delivery_sequence,
        status: update.status,
        updated_at: update.updated_at,
      })
      .eq('id', update.id);

    if (updateError) {
      logger.error(`Failed to assign order ${update.id}:`, updateError);
      throw updateError;
    }
  }

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
 * Get max delivery sequence for a rider
 */
async function getMaxDeliverySequence(riderId) {
  const { data } = await supabase
    .from('orders')
    .select('delivery_sequence')
    .eq('assigned_rider_id', riderId)
    .not('delivery_sequence', 'is', null)
    .order('delivery_sequence', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.delivery_sequence || 0;
}

// =============================================================================
// RIDER TASKS (Rider App)
// =============================================================================

/**
 * Get assigned tasks for a rider
 * 
 * @param {string} riderId - Rider UUID
 * @param {Object} options - Filter options
 */
async function getRiderTasks(riderId, options = {}) {
  const { date = new Date().toISOString().split('T')[0], include_completed = false } = options;

  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      delivery_sequence,
      delivery_attempt_count,
      total_amount,
      payment_method,
      payment_status,
      customer:customers(id, name, phone, address),
      shipping_address,
      shipping_city,
      shipping_landmark,
      internal_notes,
      created_at
    `)
    .eq('assigned_rider_id', riderId)
    .gte('created_at', `${date}T00:00:00`)
    .order('delivery_sequence', { ascending: true });

  if (!include_completed) {
    query = query.in('status', [
      ORDER_STATUS.ASSIGNED,
      ORDER_STATUS.OUT_FOR_DELIVERY,
    ]);
  }

  const { data: tasks, error } = await query;

  if (error) throw error;

  // Calculate stats
  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === ORDER_STATUS.ASSIGNED).length,
    in_progress: tasks.filter(t => t.status === ORDER_STATUS.OUT_FOR_DELIVERY).length,
    expected_cod: tasks
      .filter(t => t.payment_method === 'cod' && t.payment_status !== 'paid')
      .reduce((sum, t) => sum + parseFloat(t.total_amount || 0), 0),
  };

  return { tasks, stats };
}

/**
 * Reorder delivery sequence
 * 
 * @param {string} riderId - Rider UUID
 * @param {Array} orderSequences - Array of { order_id, sequence }
 */
async function reorderDeliverySequence(riderId, orderSequences) {
  if (!Array.isArray(orderSequences) || orderSequences.length === 0) {
    throw new BadRequestError('Order sequences array is required');
  }

  // Verify all orders belong to this rider
  const orderIds = orderSequences.map(os => os.order_id);
  
  const { data: orders } = await supabase
    .from('orders')
    .select('id, assigned_rider_id')
    .in('id', orderIds);

  for (const order of orders || []) {
    if (order.assigned_rider_id !== riderId) {
      throw new ForbiddenError('Cannot reorder orders not assigned to you');
    }
  }

  // Batch update sequences
  for (const { order_id, sequence } of orderSequences) {
    const { error } = await supabaseAdmin
      .from('orders')
      .update({ delivery_sequence: sequence })
      .eq('id', order_id)
      .eq('assigned_rider_id', riderId);

    if (error) {
      logger.error(`Failed to update sequence for order ${order_id}:`, error);
      throw error;
    }
  }

  logger.info(`Rider ${riderId} reordered ${orderSequences.length} deliveries`);

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
  const { status, result, reason, collected_cash, proof_photo_url, notes, lat, lng } = updateData;

  // Get order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      assigned_rider_id,
      delivery_run_id,
      total_amount,
      payment_method,
      payment_status,
      delivery_attempt_count
    `)
    .eq('id', orderId)
    .single();

  if (orderError) {
    if (orderError.code === 'PGRST116') {
      throw new NotFoundError('Order not found');
    }
    throw orderError;
  }

  // Verify order is assigned to this rider
  if (order.assigned_rider_id !== riderId) {
    throw new ForbiddenError('This order is not assigned to you');
  }

  // Get rider
  const rider = await getRiderById(riderId);

  // Determine new order status based on result
  let newOrderStatus;
  if (result === DELIVERY_RESULT.DELIVERED) {
    newOrderStatus = ORDER_STATUS.DELIVERED;
  } else if ([DELIVERY_RESULT.REJECTED, DELIVERY_RESULT.RETURNED].includes(result)) {
    newOrderStatus = ORDER_STATUS.REJECTED;
  } else {
    // not_home, wrong_address, rescheduled - keep as OUT_FOR_DELIVERY for retry
    newOrderStatus = ORDER_STATUS.OUT_FOR_DELIVERY;
  }

  // Validate: non-delivered requires reason
  if (result !== DELIVERY_RESULT.DELIVERED && !reason) {
    throw new BadRequestError('Reason is required for non-delivered orders');
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
        `Collected cash (Rs. ${cashCollected}) is less than expected (Rs. ${expectedCash})`
      );
    }

    // Update rider's cash balance
    const { error: cashError } = await supabaseAdmin
      .from('riders')
      .update({
        current_cash_balance: parseFloat(rider.current_cash_balance) + cashCollected,
        total_cash_collected: parseFloat(rider.total_cash_collected) + cashCollected,
        updated_at: new Date().toISOString(),
      })
      .eq('id', riderId);

    if (cashError) {
      logger.error('Failed to update rider cash balance:', cashError);
      throw new BadRequestError('Failed to record cash collection');
    }

    logger.info(`Rider ${rider.rider_code} collected Rs. ${cashCollected} for order ${order.order_number}`);
  }

  // =========================================================================
  // CREATE DELIVERY ATTEMPT RECORD
  // =========================================================================
  const attemptData = {
    order_id: orderId,
    rider_id: riderId,
    run_id: order.delivery_run_id,
    attempt_number: (order.delivery_attempt_count || 0) + 1,
    result,
    reason: reason || null,
    cash_collected: cashCollected,
    payment_confirmed: result === DELIVERY_RESULT.DELIVERED && order.payment_method === 'cod',
    proof_photo_url,
    delivery_lat: lat,
    delivery_lng: lng,
    rider_notes: notes,
    customer_present: result === DELIVERY_RESULT.DELIVERED || result === DELIVERY_RESULT.REJECTED,
  };

  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('delivery_attempts')
    .insert(attemptData)
    .select()
    .single();

  if (attemptError) {
    logger.error('Failed to create delivery attempt:', attemptError);
    throw attemptError;
  }

  // =========================================================================
  // UPDATE ORDER
  // =========================================================================
  const orderUpdate = {
    status: newOrderStatus,
    updated_at: new Date().toISOString(),
  };

  if (result === DELIVERY_RESULT.DELIVERED) {
    orderUpdate.delivered_at = new Date().toISOString();
    orderUpdate.cash_collected = cashCollected;
    orderUpdate.cash_collected_at = new Date().toISOString();
    orderUpdate.delivery_proof_url = proof_photo_url;
    
    if (order.payment_method === 'cod') {
      orderUpdate.payment_status = 'paid';
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
 */
async function getRiderCashSummary(riderId) {
  const rider = await getRiderById(riderId);
  
  // Get today's collections
  const today = new Date().toISOString().split('T')[0];
  
  const { data: todayCollections } = await supabase
    .from('delivery_attempts')
    .select('cash_collected')
    .eq('rider_id', riderId)
    .gte('created_at', `${today}T00:00:00`)
    .not('cash_collected', 'is', null);

  const todayTotal = (todayCollections || [])
    .reduce((sum, a) => sum + parseFloat(a.cash_collected || 0), 0);

  // Get pending settlements
  const { data: pendingSettlements } = await supabase
    .from('rider_settlements')
    .select('*')
    .eq('rider_id', riderId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return {
    current_balance: parseFloat(rider.current_cash_balance) || 0,
    today_collected: todayTotal,
    lifetime_collected: parseFloat(rider.total_cash_collected) || 0,
    pending_settlements: pendingSettlements || [],
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
      `Settlement amount (Rs. ${amount}) exceeds current balance (Rs. ${currentBalance})`
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
    // More than Rs. 1 difference
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
  
  // Constants
  RIDER_STATUS,
  DELIVERY_RESULT,
};

export default RiderService;
