/**
 * Returns Service
 * 
 * Handles rider returns management - receiving rejected items back from riders
 * 
 * @module services/dispatch/ReturnsService
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

// =============================================================================
// RETURNS MANAGEMENT
// =============================================================================

/**
 * Get pending returns for all riders (rejected items still with riders)
 */
async function getPendingReturns() {
  logger.info('[ReturnsService] getPendingReturns called');

  // Get all rejected orders grouped by rider
  // Note: orders table uses shipping_name not customer_name
  const { data: rejectedOrders, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      shipping_name,
      rejection_reason,
      updated_at,
      rider:riders(id, rider_code, full_name, phone)
    `)
    .eq('status', 'rejected')
    .not('rider_id', 'is', null)
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error('[ReturnsService] Error fetching pending returns:', error);
    throw error;
  }

  // Group by rider
  const riderMap = {};
  for (const order of (rejectedOrders || [])) {
    const riderId = order.rider?.id;
    if (!riderId) continue;

    if (!riderMap[riderId]) {
      riderMap[riderId] = {
        rider: order.rider,
        orders: [],
        total_items: 0,
        total_value: 0,
      };
    }

    riderMap[riderId].orders.push({
      id: order.id,
      order_number: order.order_number,
      customer_name: order.shipping_name, // Map to customer_name for frontend
      total_amount: order.total_amount,
      rejection_reason: order.rejection_reason,
      rejected_at: order.updated_at,
    });
    riderMap[riderId].total_items += 1;
    riderMap[riderId].total_value += order.total_amount || 0;
  }

  return Object.values(riderMap);
}

/**
 * Get pending returns for a specific rider
 */
async function getRiderPendingReturns(riderId) {
  logger.info('[ReturnsService] getRiderPendingReturns called', { riderId });

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      shipping_name,
      shipping_phone,
      shipping_address,
      shipping_city,
      rejection_reason,
      rescheduled_reason,
      updated_at
    `)
    .eq('rider_id', riderId)
    .eq('status', 'rejected')
    .order('updated_at', { ascending: false });

  if (error) {
    logger.error('[ReturnsService] Error fetching rider pending returns:', error);
    throw error;
  }

  // Map shipping_name to customer_name for frontend compatibility
  return (orders || []).map(o => ({
    ...o,
    customer_name: o.shipping_name,
    customer_phone: o.shipping_phone,
  }));
}

/**
 * Create a return handover (receive items from rider)
 */
async function createReturn(data) {
  const { rider_id, order_ids, notes, received_by } = data;

  logger.info('[ReturnsService] createReturn called', { rider_id, order_ids_count: order_ids?.length });

  if (!order_ids || order_ids.length === 0) {
    throw new BadRequestError('No orders provided for return');
  }

  // Try RPC function first, fall back to direct update
  try {
    const { data: result, error } = await supabaseAdmin.rpc('create_rider_return', {
      p_rider_id: rider_id,
      p_order_ids: order_ids,
      p_notes: notes || null,
      p_received_by: received_by || null,
    });

    if (error) {
      // If RPC doesn't exist, use fallback
      if (error.code === '42883' || error.message?.includes('does not exist')) {
        logger.warn('[ReturnsService] RPC not available, using fallback');
        return await createReturnFallback(rider_id, order_ids, notes);
      }
      throw error;
    }

    if (result && !result.success) {
      throw new BadRequestError(result.error || 'Failed to create return');
    }

    logger.info('[ReturnsService] Return created:', result);
    return result;
  } catch (err) {
    if (err.name === 'BadRequestError') throw err;
    logger.warn('[ReturnsService] RPC failed, using fallback:', err.message);
    return await createReturnFallback(rider_id, order_ids, notes);
  }
}

/**
 * Fallback: Create return by directly updating orders
 */
async function createReturnFallback(rider_id, order_ids, notes) {
  // Update orders status to 'returned'
  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({
      status: 'returned',
      updated_at: new Date().toISOString(),
    })
    .in('id', order_ids)
    .eq('rider_id', rider_id)
    .select('id, order_number');

  if (error) {
    logger.error('[ReturnsService] Fallback return creation failed:', error);
    throw new BadRequestError('Failed to create return');
  }

  const timestamp = Date.now().toString(36).toUpperCase();
  return {
    success: true,
    return_number: `RTN-${timestamp}`,
    items_count: updated?.length || order_ids.length,
  };
}

/**
 * Get all returns with filters
 * 
 * Falls back to querying returned orders if rider_returns table doesn't exist
 */
async function getAllReturns(options = {}) {
  const { limit = 50, offset = 0, days = 7, status, riderId } = options;

  logger.info('[ReturnsService] getAllReturns called', { options });

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // First, try to query rider_returns table
  try {
    let query = supabaseAdmin
      .from('rider_returns')
      .select(`
        id,
        return_number,
        total_items,
        total_orders,
        status,
        notes,
        received_at,
        processed_at,
        created_at,
        rider:riders(id, rider_code, full_name, phone)
      `, { count: 'exact' })
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (riderId) {
      query = query.eq('rider_id', riderId);
    }

    const { data: returns, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      // If table doesn't exist, fall back to orders-based query
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        logger.warn('[ReturnsService] rider_returns table not found, using fallback');
        return await getReturnsFromOrders(startDate, limit, riderId);
      }
      throw error;
    }

    return { returns: returns || [], total: count || 0 };
  } catch (err) {
    // Fallback: get returned orders directly
    logger.warn('[ReturnsService] Falling back to orders-based returns:', err.message);
    return await getReturnsFromOrders(startDate, limit, riderId);
  }
}

/**
 * Fallback: Get returned orders directly from orders table
 */
async function getReturnsFromOrders(startDate, limit, riderId) {
  let query = supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      shipping_name,
      updated_at,
      rider:riders(id, rider_code, full_name, phone)
    `, { count: 'exact' })
    .eq('status', 'returned')
    .gte('updated_at', startDate.toISOString())
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (riderId) {
    query = query.eq('rider_id', riderId);
  }

  const { data: orders, error, count } = await query;

  if (error) {
    logger.error('[ReturnsService] Error in fallback query:', error);
    return { returns: [], total: 0 };
  }

  // Transform orders to match expected return format
  const returns = (orders || []).map(o => ({
    id: o.id,
    return_number: `RTN-${o.order_number}`,
    total_items: 1,
    total_orders: 1,
    status: 'received',
    received_at: o.updated_at,
    created_at: o.updated_at,
    rider: o.rider,
  }));

  return { returns, total: count || 0 };
}

/**
 * Get return details with items
 */
async function getReturnDetails(returnId) {
  logger.info('[ReturnsService] getReturnDetails called', { returnId });

  try {
    const { data: returnData, error } = await supabaseAdmin
      .from('rider_returns')
      .select(`
        id,
        return_number,
        total_items,
        total_orders,
        status,
        notes,
        received_at,
        processed_at,
        created_at,
        rider:riders(id, rider_code, full_name, phone)
      `)
      .eq('id', returnId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Return not found');
      }
      // If table doesn't exist, try to get order details
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return await getReturnDetailsFromOrder(returnId);
      }
      throw error;
    }

    // Try to get return items separately (graceful)
    const { data: items } = await supabaseAdmin
      .from('return_items')
      .select(`
        id,
        condition,
        damage_notes,
        action_taken,
        action_notes,
        created_at,
        order_id
      `)
      .eq('return_id', returnId);

    return { ...returnData, items: items || [] };
  } catch (err) {
    if (err.name === 'NotFoundError') throw err;
    logger.error('[ReturnsService] Error fetching return details:', err);
    return await getReturnDetailsFromOrder(returnId);
  }
}

/**
 * Fallback: Get return details from order
 */
async function getReturnDetailsFromOrder(orderId) {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      total_amount,
      shipping_name,
      rejection_reason,
      updated_at,
      rider:riders(id, rider_code, full_name, phone)
    `)
    .eq('id', orderId)
    .single();

  if (error) {
    throw new NotFoundError('Return not found');
  }

  return {
    id: order.id,
    return_number: `RTN-${order.order_number}`,
    total_items: 1,
    total_orders: 1,
    status: order.status === 'returned' ? 'received' : 'pending',
    received_at: order.updated_at,
    created_at: order.updated_at,
    rider: order.rider,
    items: [{
      id: order.id,
      order_id: order.id,
      order: {
        id: order.id,
        order_number: order.order_number,
        shipping_name: order.shipping_name,
        total_amount: order.total_amount,
        rejection_reason: order.rejection_reason,
      }
    }],
  };
}

/**
 * Update return item condition/action
 */
async function updateReturnItem(itemId, data) {
  const { condition, damage_notes, action_taken, action_notes, action_by } = data;

  logger.info('[ReturnsService] updateReturnItem called', { itemId, data });

  try {
    const updateData = {
      updated_at: new Date().toISOString(),
    };

    if (condition) updateData.condition = condition;
    if (damage_notes !== undefined) updateData.damage_notes = damage_notes;
    if (action_taken) {
      updateData.action_taken = action_taken;
      updateData.action_at = new Date().toISOString();
      updateData.action_by = action_by;
    }
    if (action_notes !== undefined) updateData.action_notes = action_notes;

    const { data: updated, error } = await supabaseAdmin
      .from('return_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      // Table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        logger.warn('[ReturnsService] return_items table not found');
        return { id: itemId, ...updateData };
      }
      throw error;
    }

    return updated;
  } catch (err) {
    logger.error('[ReturnsService] Error updating return item:', err);
    throw err;
  }
}

/**
 * Process a return (mark as fully processed)
 */
async function processReturn(returnId, processedBy) {
  logger.info('[ReturnsService] processReturn called', { returnId });

  try {
    const { data: updated, error } = await supabaseAdmin
      .from('rider_returns')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', returnId)
      .select()
      .single();

    if (error) {
      // Table doesn't exist, try updating order directly
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return await processReturnFallback(returnId);
      }
      throw error;
    }

    return updated;
  } catch (err) {
    logger.error('[ReturnsService] Error processing return:', err);
    return await processReturnFallback(returnId);
  }
}

/**
 * Fallback: Mark order as processed/returned
 */
async function processReturnFallback(orderId) {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .update({
      status: 'returned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) {
    logger.error('[ReturnsService] Fallback process failed:', error);
  }

  return order || { id: orderId, status: 'processed' };
}

/**
 * Get returns statistics
 */
async function getReturnsStats() {
  // Pending returns (rejected items still with riders)
  const { count: pendingCount } = await supabaseAdmin
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'rejected')
    .not('rider_id', 'is', null);

  // Today's received/returned orders
  const today = new Date().toISOString().split('T')[0];
  const { count: todayReturnedCount } = await supabaseAdmin
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'returned')
    .gte('updated_at', `${today}T00:00:00`);

  // Try to get stats from rider_returns table if it exists
  let todayReceivedCount = 0;
  let unprocessedCount = 0;

  try {
    const { count: received } = await supabaseAdmin
      .from('rider_returns')
      .select('*', { count: 'exact', head: true })
      .gte('received_at', `${today}T00:00:00`);
    
    const { count: unprocessed } = await supabaseAdmin
      .from('rider_returns')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'received']);

    todayReceivedCount = received || 0;
    unprocessedCount = unprocessed || 0;
  } catch (err) {
    // Table doesn't exist, use order-based counts
    logger.debug('[ReturnsService] rider_returns table not available, using order-based stats');
    todayReceivedCount = todayReturnedCount || 0;
  }

  return {
    pending_with_riders: pendingCount || 0,
    today_received: todayReceivedCount || todayReturnedCount || 0,
    unprocessed: unprocessedCount || 0,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const ReturnsService = {
  getPendingReturns,
  getRiderPendingReturns,
  createReturn,
  getAllReturns,
  getReturnDetails,
  updateReturnItem,
  processReturn,
  getReturnsStats,
};

export default ReturnsService;
