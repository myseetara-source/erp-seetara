/**
 * Follow-up Controller
 * 
 * Handles order follow-up scheduling and management
 * Used when customer needs to be contacted before confirmation
 */

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { OrderStateMachine, ORDER_STATUS } from '../services/orderStateMachine.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('FollowUpController');

// =============================================================================
// SCHEDULE FOLLOW-UP
// =============================================================================

/**
 * Schedule a follow-up for an order
 * POST /api/v1/orders/:id/follow-up
 * 
 * Body: { reason: string, next_date: ISO datetime }
 */
export const scheduleFollowUp = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;
  const { reason, next_date } = req.body;

  // Validate inputs
  if (!reason || !next_date) {
    throw new ValidationError('Follow-up reason and next date are required');
  }

  const nextDate = new Date(next_date);
  if (isNaN(nextDate.getTime())) {
    throw new ValidationError('Invalid date format for next_date');
  }

  if (nextDate < new Date()) {
    throw new ValidationError('Follow-up date must be in the future');
  }

  // Get current order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, status, fulfillment_type, followup_count, order_number')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new NotFoundError('Order');
  }

  // Validate state transition
  OrderStateMachine.validateTransition(
    order,
    ORDER_STATUS.FOLLOW_UP,
    { followup_reason: reason, followup_date: next_date }
  );

  // Update order
  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      status: ORDER_STATUS.FOLLOW_UP,
      followup_date: nextDate.toISOString(),
      followup_reason: reason,
      followup_count: (order.followup_count || 0) + 1,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (updateError) {
    throw new AppError('Failed to schedule follow-up', 500);
  }

  // Log the follow-up
  await supabaseAdmin.from('order_comments').insert({
    order_id: orderId,
    comment: `Follow-up scheduled: ${reason}. Next call: ${nextDate.toLocaleDateString()}`,
    source: 'operator',
    created_by: req.user.id,
  });

  logger.info('Follow-up scheduled', { orderId, nextDate, reason, userId: req.user.id });

  res.json({
    success: true,
    message: 'Follow-up scheduled successfully',
    data: {
      orderId,
      orderNumber: order.order_number,
      status: ORDER_STATUS.FOLLOW_UP,
      followupDate: nextDate.toISOString(),
      followupReason: reason,
      followupCount: (order.followup_count || 0) + 1,
    },
  });
});

// =============================================================================
// GET PENDING FOLLOW-UPS
// =============================================================================

/**
 * Get orders with pending follow-ups
 * GET /api/v1/orders/follow-ups
 * 
 * Query: { date?: ISO date, overdue?: boolean }
 */
export const getPendingFollowUps = asyncHandler(async (req, res) => {
  const { date, overdue, page = 1, limit = 20 } = req.query;
  const from = (page - 1) * limit;
  const to = from + parseInt(limit) - 1;

  let query = supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      followup_date,
      followup_reason,
      followup_count,
      total_amount,
      created_at,
      customer:customers(id, name, phone)
    `, { count: 'exact' })
    .eq('status', ORDER_STATUS.FOLLOW_UP)
    .order('followup_date', { ascending: true });

  // Filter by specific date
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    query = query
      .gte('followup_date', startOfDay.toISOString())
      .lte('followup_date', endOfDay.toISOString());
  }

  // Filter overdue follow-ups
  if (overdue === 'true') {
    query = query.lt('followup_date', new Date().toISOString());
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new AppError('Failed to fetch follow-ups', 500);
  }

  // Categorize results
  const now = new Date();
  const categorized = (data || []).map(order => ({
    ...order,
    isOverdue: new Date(order.followup_date) < now,
    isDueToday: new Date(order.followup_date).toDateString() === now.toDateString(),
  }));

  res.json({
    success: true,
    data: categorized,
    summary: {
      total: count,
      overdue: categorized.filter(o => o.isOverdue).length,
      dueToday: categorized.filter(o => o.isDueToday).length,
    },
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

// =============================================================================
// CONVERT FOLLOW-UP TO ORDER
// =============================================================================

/**
 * Convert a follow-up to confirmed order
 * POST /api/v1/orders/:id/convert
 * 
 * Body: { notes?: string }
 */
export const convertFollowUp = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;
  const { notes } = req.body;

  // Get current order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, status, fulfillment_type, order_number')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new NotFoundError('Order');
  }

  // Validate state transition
  OrderStateMachine.validateTransition(order, ORDER_STATUS.CONVERTED, {});

  // Update order
  const { data: updatedOrder, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      status: ORDER_STATUS.CONVERTED,
      followup_date: null, // Clear follow-up date
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (updateError) {
    throw new AppError('Failed to convert order', 500);
  }

  // Log conversion
  await supabaseAdmin.from('order_comments').insert({
    order_id: orderId,
    comment: `Order converted to confirmed.${notes ? ` Notes: ${notes}` : ''}`,
    source: 'operator',
    created_by: req.user.id,
  });

  logger.info('Order converted', { orderId, userId: req.user.id });

  res.json({
    success: true,
    message: 'Order converted successfully',
    data: {
      orderId,
      orderNumber: order.order_number,
      status: ORDER_STATUS.CONVERTED,
    },
  });
});

// =============================================================================
// BULK FOLLOW-UP ACTIONS
// =============================================================================

/**
 * Bulk update follow-up dates
 * POST /api/v1/orders/follow-ups/bulk
 * 
 * Body: { order_ids: string[], new_date: ISO datetime }
 */
export const bulkRescheduleFollowUps = asyncHandler(async (req, res) => {
  const { order_ids, new_date } = req.body;

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    throw new ValidationError('Order IDs array is required');
  }

  if (!new_date) {
    throw new ValidationError('New date is required');
  }

  const nextDate = new Date(new_date);
  if (isNaN(nextDate.getTime()) || nextDate < new Date()) {
    throw new ValidationError('Invalid or past date');
  }

  // Update all orders
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({
      followup_date: nextDate.toISOString(),
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .in('id', order_ids)
    .eq('status', ORDER_STATUS.FOLLOW_UP)
    .select('id');

  if (error) {
    throw new AppError('Failed to reschedule follow-ups', 500);
  }

  logger.info('Bulk follow-up reschedule', { 
    orderCount: data?.length || 0, 
    newDate: nextDate.toISOString(),
    userId: req.user.id,
  });

  res.json({
    success: true,
    message: `${data?.length || 0} follow-ups rescheduled`,
    data: {
      updatedCount: data?.length || 0,
      newDate: nextDate.toISOString(),
    },
  });
});

export default {
  scheduleFollowUp,
  getPendingFollowUps,
  convertFollowUp,
  bulkRescheduleFollowUps,
};
