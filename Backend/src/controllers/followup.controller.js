/**
 * Order Follow-up Controller
 * 
 * Handles CRM call tracking and follow-up management.
 * 
 * Features:
 * - Record call attempts with status
 * - Schedule next follow-up
 * - Get call history for an order
 * - Dashboard widgets (pending follow-ups, performance metrics)
 */

import { supabaseAdmin } from '../config/supabase.js';
import { AppError, catchAsync } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('FollowupController');

// Valid response statuses
const VALID_STATUSES = [
  'answered',
  'no_answer',
  'switched_off',
  'busy',
  'wrong_number',
  'callback_requested',
  'number_not_reachable',
  'confirmed',
  'cancelled',
];

// =============================================================================
// CREATE FOLLOW-UP (Log a call)
// =============================================================================

export const createFollowup = catchAsync(async (req, res) => {
  const { order_id, response_status, remarks, outcome, next_followup_date, phone_called, call_duration_seconds, call_method } = req.body;
  const staffId = req.user?.id;

  if (!order_id) {
    throw new AppError('Order ID is required', 400, 'VALIDATION_ERROR');
  }

  if (!response_status || !VALID_STATUSES.includes(response_status)) {
    throw new AppError(`Invalid response status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  // Verify order exists
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND');
  }

  // Get next attempt number
  const { data: nextAttempt } = await supabaseAdmin.rpc('get_next_followup_attempt', {
    p_order_id: order_id,
  });

  const attemptNumber = nextAttempt || 1;

  // Create follow-up record
  const { data: followup, error: followupError } = await supabaseAdmin
    .from('order_followups')
    .insert({
      order_id,
      staff_id: staffId,
      attempt_number: attemptNumber,
      response_status,
      call_duration_seconds: call_duration_seconds || 0,
      remarks,
      outcome,
      next_followup_date: next_followup_date || null,
      next_followup_assigned_to: staffId, // Default to self
      phone_called,
      call_method: call_method || 'manual',
    })
    .select(`
      *,
      staff:users!order_followups_staff_id_fkey(id, name, email)
    `)
    .single();

  if (followupError) {
    logger.error('[FollowupController] Create error:', followupError);
    throw new AppError('Failed to create follow-up record', 500, 'DATABASE_ERROR');
  }

  // Update order's followup_date and status based on response
  const orderUpdates = {
    updated_at: new Date().toISOString(),
  };

  if (next_followup_date) {
    orderUpdates.followup_date = next_followup_date;
  }

  // Auto-update order status based on response
  if (response_status === 'confirmed' && order.status === 'intake') {
    orderUpdates.status = 'converted';
  } else if (response_status === 'cancelled') {
    orderUpdates.status = 'cancelled';
    orderUpdates.cancellation_reason = remarks || 'Cancelled via follow-up call';
    orderUpdates.cancelled_by = staffId;
    orderUpdates.cancelled_at = new Date().toISOString();
  } else if (response_status === 'callback_requested' && order.status === 'intake') {
    orderUpdates.status = 'follow_up';
    orderUpdates.followup_reason = remarks || 'Callback requested';
  }

  if (Object.keys(orderUpdates).length > 1) {
    await supabaseAdmin
      .from('orders')
      .update(orderUpdates)
      .eq('id', order_id);
  }

  // Create timeline entry
  await supabaseAdmin
    .from('order_timeline')
    .insert({
      order_id,
      event_type: 'call',
      title: `Call Attempt #${attemptNumber}: ${response_status}`,
      description: remarks || null,
      performed_by: staffId,
      related_entity_type: 'followup',
      related_entity_id: followup.id,
      metadata: {
        attempt_number: attemptNumber,
        response_status,
        outcome,
        duration_seconds: call_duration_seconds,
      },
    });

  res.status(201).json({
    success: true,
    message: `Follow-up #${attemptNumber} recorded successfully`,
    data: followup,
  });
});

// =============================================================================
// GET FOLLOW-UPS FOR AN ORDER
// =============================================================================

export const getOrderFollowups = catchAsync(async (req, res) => {
  const { orderId } = req.params;

  const { data, error } = await supabaseAdmin
    .from('order_followups')
    .select(`
      *,
      staff:users!order_followups_staff_id_fkey(id, name, email),
      next_assigned:users!order_followups_next_followup_assigned_to_fkey(id, name)
    `)
    .eq('order_id', orderId)
    .order('attempt_number', { ascending: true });

  if (error) {
    logger.error('[FollowupController] Get order followups error:', error);
    throw new AppError('Failed to fetch follow-ups', 500, 'DATABASE_ERROR');
  }

  res.json({
    success: true,
    data: data || [],
    meta: {
      total_attempts: data?.length || 0,
      last_attempt: data?.length > 0 ? data[data.length - 1] : null,
    },
  });
});

// =============================================================================
// GET PENDING FOLLOW-UPS (Dashboard Widget)
// =============================================================================

export const getPendingFollowups = catchAsync(async (req, res) => {
  const { staff_id, limit = 50 } = req.query;
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  // Get orders that need follow-up
  let query = supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_number,
      status,
      followup_date,
      followup_reason,
      followup_count,
      shipping_name,
      shipping_phone,
      total_amount,
      created_at,
      assigned_to,
      assignee:users!orders_assigned_to_fkey(id, name)
    `)
    .in('status', ['intake', 'follow_up'])
    .order('followup_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(Number(limit));

  // Filter by staff if not admin or if specific staff requested
  if (!isAdmin && userId) {
    query = query.or(`assigned_to.eq.${userId},assigned_to.is.null`);
  } else if (staff_id) {
    query = query.eq('assigned_to', staff_id);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('[FollowupController] Get pending followups error:', error);
    throw new AppError('Failed to fetch pending follow-ups', 500, 'DATABASE_ERROR');
  }

  // Categorize by urgency
  const now = new Date();
  const categorized = {
    overdue: [],
    today: [],
    upcoming: [],
    no_date: [],
  };

  (data || []).forEach(order => {
    if (!order.followup_date) {
      categorized.no_date.push(order);
    } else {
      const followupDate = new Date(order.followup_date);
      const isToday = followupDate.toDateString() === now.toDateString();
      const isOverdue = followupDate < now && !isToday;

      if (isOverdue) {
        categorized.overdue.push(order);
      } else if (isToday) {
        categorized.today.push(order);
      } else {
        categorized.upcoming.push(order);
      }
    }
  });

  res.json({
    success: true,
    data: {
      all: data || [],
      categorized,
    },
    meta: {
      total: data?.length || 0,
      overdue: categorized.overdue.length,
      today: categorized.today.length,
      upcoming: categorized.upcoming.length,
      no_date: categorized.no_date.length,
    },
  });
});

// =============================================================================
// GET STAFF PERFORMANCE (Admin only)
// =============================================================================

export const getStaffPerformance = catchAsync(async (req, res) => {
  const { from_date, to_date } = req.query;
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Admin access required', 403, 'FORBIDDEN');
  }

  // Default to last 7 days
  const startDate = from_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = to_date || new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('order_followups')
    .select(`
      staff_id,
      response_status,
      created_at,
      staff:users!order_followups_staff_id_fkey(id, name, email)
    `)
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  if (error) {
    logger.error('[FollowupController] Get performance error:', error);
    throw new AppError('Failed to fetch performance data', 500, 'DATABASE_ERROR');
  }

  // Aggregate by staff
  const staffStats = {};
  (data || []).forEach(followup => {
    const staffId = followup.staff_id;
    if (!staffStats[staffId]) {
      staffStats[staffId] = {
        staff_id: staffId,
        staff_name: followup.staff?.name || 'Unknown',
        staff_email: followup.staff?.email || '',
        total_calls: 0,
        answered: 0,
        no_answer: 0,
        confirmed: 0,
        cancelled: 0,
        other: 0,
        conversion_rate: 0,
      };
    }

    staffStats[staffId].total_calls++;

    switch (followup.response_status) {
      case 'answered':
        staffStats[staffId].answered++;
        break;
      case 'confirmed':
        staffStats[staffId].confirmed++;
        break;
      case 'cancelled':
        staffStats[staffId].cancelled++;
        break;
      case 'no_answer':
      case 'switched_off':
      case 'busy':
        staffStats[staffId].no_answer++;
        break;
      default:
        staffStats[staffId].other++;
    }
  });

  // Calculate conversion rate
  Object.values(staffStats).forEach(stat => {
    if (stat.total_calls > 0) {
      stat.conversion_rate = ((stat.confirmed / stat.total_calls) * 100).toFixed(1);
    }
  });

  res.json({
    success: true,
    data: Object.values(staffStats).sort((a, b) => b.total_calls - a.total_calls),
    meta: {
      period: { from: startDate, to: endDate },
      total_calls: data?.length || 0,
    },
  });
});

// =============================================================================
// UPDATE FOLLOW-UP
// =============================================================================

export const updateFollowup = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { remarks, outcome, next_followup_date } = req.body;

  const { data, error } = await supabaseAdmin
    .from('order_followups')
    .update({
      remarks,
      outcome,
      next_followup_date,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error('[FollowupController] Update error:', error);
    throw new AppError('Failed to update follow-up', 500, 'DATABASE_ERROR');
  }

  res.json({
    success: true,
    message: 'Follow-up updated',
    data,
  });
});

export default {
  createFollowup,
  getOrderFollowups,
  getPendingFollowups,
  getStaffPerformance,
  updateFollowup,
};
