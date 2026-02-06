/**
 * Rider Controller
 * 
 * HTTP endpoints for rider management and delivery operations.
 * 
 * Endpoints are split into:
 * - Admin/Dispatch: Order assignment, rider management
 * - Rider App: Task management, status updates, route planning
 * 
 * @module controllers/rider.controller
 */

import { RiderService } from '../services/rider.service.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// =============================================================================
// HELPER: Get rider ID from request
// =============================================================================

/**
 * Get rider ID from authenticated user
 * For rider endpoints, the rider_id comes from the user's rider profile
 */
async function getRiderIdFromUser(req) {
  const userId = req.user.id;
  const rider = await RiderService.getRiderByUserId(userId);
  
  if (!rider) {
    throw new ForbiddenError('No rider profile found for this user');
  }
  
  return rider.id;
}

// =============================================================================
// ADMIN / DISPATCH ENDPOINTS
// =============================================================================

/**
 * List all riders
 * GET /dispatch/riders
 */
export const listRiders = asyncHandler(async (req, res) => {
  const { status, is_active } = req.query;
  
  const riders = await RiderService.listRiders({
    status,
    is_active: is_active === 'false' ? false : true,
  });

  res.json({
    success: true,
    data: riders,
    count: riders.length,
  });
});

/**
 * Get single rider details
 * GET /dispatch/riders/:id
 */
export const getRider = asyncHandler(async (req, res) => {
  const rider = await RiderService.getRiderById(req.params.id);

  res.json({
    success: true,
    data: rider,
  });
});

/**
 * Assign orders to a rider
 * POST /dispatch/assign
 * 
 * Request body:
 * {
 *   rider_id: UUID,
 *   order_ids: UUID[]
 * }
 */
export const assignOrdersToRider = asyncHandler(async (req, res) => {
  const { rider_id, order_ids } = req.body;
  const assignedBy = req.user.id;

  if (!rider_id) {
    throw new BadRequestError('rider_id is required');
  }
  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    throw new BadRequestError('order_ids array is required');
  }

  const result = await RiderService.assignOrdersToRider(rider_id, order_ids, assignedBy);

  res.json({
    success: true,
    message: `${result.assignedCount} orders assigned successfully`,
    data: result,
  });
});

/**
 * Update rider status (Admin)
 * PATCH /dispatch/riders/:id/status
 */
export const updateRiderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const riderId = req.params.id;

  if (!status) {
    throw new BadRequestError('status is required');
  }

  const rider = await RiderService.updateRiderStatus(riderId, status, req.user.id);

  res.json({
    success: true,
    message: `Rider status updated to ${status}`,
    data: rider,
  });
});

// =============================================================================
// RIDER APP ENDPOINTS
// =============================================================================

/**
 * Get current rider's profile
 * GET /rider/me
 */
export const getMyProfile = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  const rider = await RiderService.getRiderById(riderId);

  res.json({
    success: true,
    data: rider,
  });
});

/**
 * Get rider's assigned tasks
 * GET /rider/tasks
 * 
 * Query params:
 * - date: YYYY-MM-DD (default: today)
 * - include_completed: boolean
 */
export const getRiderTasks = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  const { date, include_completed } = req.query;

  const result = await RiderService.getRiderTasks(riderId, {
    date,
    include_completed: include_completed === 'true',
  });

  res.json({
    success: true,
    data: result.tasks,
    stats: result.stats,
  });
});

/**
 * Reorder delivery sequence (Route Planning)
 * PATCH /rider/tasks/reorder
 * 
 * Request body:
 * {
 *   orders: [
 *     { order_id: UUID, sequence: number },
 *     ...
 *   ]
 * }
 */
export const reorderTasks = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  const { orders } = req.body;

  if (!orders || !Array.isArray(orders)) {
    throw new BadRequestError('orders array is required');
  }

  // Validate structure
  for (const item of orders) {
    if (!item.order_id || typeof item.sequence !== 'number') {
      throw new BadRequestError('Each item must have order_id and sequence');
    }
  }

  const result = await RiderService.reorderDeliverySequence(riderId, orders);

  res.json({
    success: true,
    message: `Reordered ${result.updated} deliveries`,
    data: result,
  });
});

/**
 * Update delivery status
 * POST /rider/update-status
 * 
 * Request body:
 * {
 *   order_id: UUID,
 *   status: 'delivered' | 'rejected' | 'not_home' | 'wrong_address' | 'rescheduled',
 *   reason?: string (required if not delivered),
 *   collected_cash?: number (required if COD and delivered),
 *   proof_photo_url?: string,
 *   notes?: string,
 *   lat?: number,
 *   lng?: number
 * }
 */
export const updateDeliveryStatus = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  const { order_id, status, reason, collected_cash, proof_photo_url, notes, lat, lng } = req.body;

  if (!order_id) {
    throw new BadRequestError('order_id is required');
  }
  if (!status) {
    throw new BadRequestError('status is required');
  }

  const validStatuses = ['delivered', 'rejected', 'not_home', 'wrong_address', 'rescheduled', 'returned'];
  if (!validStatuses.includes(status)) {
    throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const result = await RiderService.updateDeliveryStatus(riderId, order_id, {
    result: status,
    reason,
    collected_cash,
    proof_photo_url,
    notes,
    lat,
    lng,
  });

  res.json({
    success: true,
    message: status === 'delivered' 
      ? `Order delivered successfully. Cash collected: रु. ${result.cashCollected || 0}`
      : `Order marked as ${status}`,
    data: result,
  });
});

/**
 * Update rider's current location
 * POST /rider/location
 */
export const updateLocation = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  const { lat, lng } = req.body;

  if (!lat || !lng) {
    throw new BadRequestError('lat and lng are required');
  }

  const rider = await RiderService.updateRiderLocation(riderId, lat, lng);

  res.json({
    success: true,
    message: 'Location updated',
    data: {
      lat: rider.last_known_lat,
      lng: rider.last_known_lng,
      updated_at: rider.last_location_update,
    },
  });
});

/**
 * Start delivery run
 * POST /rider/start-run
 */
export const startRun = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  
  await RiderService.updateRiderStatus(riderId, 'on_delivery', req.user.id);

  res.json({
    success: true,
    message: 'Delivery run started',
  });
});

/**
 * End delivery run
 * POST /rider/end-run
 */
export const endRun = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  
  await RiderService.updateRiderStatus(riderId, 'off_duty', req.user.id);

  res.json({
    success: true,
    message: 'Delivery run ended',
  });
});

// =============================================================================
// CASH & SETTLEMENT ENDPOINTS
// =============================================================================

/**
 * Get cash summary
 * GET /rider/cash
 */
export const getCashSummary = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  const summary = await RiderService.getRiderCashSummary(riderId);

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * Submit settlement request
 * POST /rider/settle
 */
export const submitSettlement = asyncHandler(async (req, res) => {
  const riderId = await getRiderIdFromUser(req);
  const { amount, method } = req.body;

  if (!amount || amount <= 0) {
    throw new BadRequestError('Valid amount is required');
  }

  const settlement = await RiderService.createSettlementRequest(riderId, amount, method);

  res.json({
    success: true,
    message: 'Settlement request submitted',
    data: settlement,
  });
});

/**
 * Verify and complete settlement (Admin)
 * POST /dispatch/settlements/:id/verify
 */
export const verifySettlement = asyncHandler(async (req, res) => {
  const { actual_amount, notes } = req.body;
  const settlementId = req.params.id;

  if (actual_amount === undefined) {
    throw new BadRequestError('actual_amount is required');
  }

  const settlement = await RiderService.verifySettlement(
    settlementId,
    actual_amount,
    req.user.id,
    notes
  );

  res.json({
    success: true,
    message: settlement.status === 'settled' 
      ? 'Settlement completed successfully'
      : 'Settlement has discrepancy, please review',
    data: settlement,
  });
});

// =============================================================================
// P0: RIDER MOBILE APP ENDPOINTS
// =============================================================================

/**
 * GET /rider/tasks
 * Get pending deliveries for the rider app
 */
export const getTasks = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Get rider ID from user
  let riderId;
  try {
    const rider = await RiderService.getRiderByUserId(userId);
    riderId = rider?.id;
  } catch (e) {
    // If no rider profile, return empty
    return res.json({
      success: true,
      data: [],
    });
  }

  if (!riderId) {
    return res.json({
      success: true,
      data: [],
    });
  }

  const result = await RiderService.getRiderTasks(riderId, {
    include_all: true,  // Include rejected orders for "Returned" tab
  });

  // Transform to match frontend interface
  // Enhanced: Include zone_code and alt_phone for Route Planning
  const tasks = (result.tasks || []).map(task => ({
    order_id: task.id,
    id: task.id,
    order_number: task.readable_id || task.order_number,
    readable_id: task.readable_id,
    customer_name: task.shipping_name,
    customer_phone: task.shipping_phone,
    alt_phone: task.alt_phone,  // Secondary phone number
    shipping_address: task.shipping_address,
    shipping_city: task.shipping_city,
    zone_code: task.zone_code,  // Zone for delivery planning
    total_amount: task.total_amount,
    payment_method: task.payment_method,
    payment_status: task.payment_status,
    status: task.status,
    priority: task.priority || 0,
    notes: task.internal_notes,
    remarks: task.remarks,  // Include remarks for "Next Attempt" detection
    rejection_reason: task.rejection_reason,
    created_at: task.created_at,
    delivered_at: task.delivered_at,
  }));

  res.json({
    success: true,
    data: tasks,
  });
});

/**
 * GET /rider/history
 * Get delivery history for last N days
 * Query params: days (default 14)
 */
export const getHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { days = 14 } = req.query;

  let riderId;
  try {
    const rider = await RiderService.getRiderByUserId(userId);
    riderId = rider?.id;
  } catch (e) {
    return res.json({ success: true, data: [] });
  }

  if (!riderId) {
    return res.json({ success: true, data: [] });
  }

  const history = await RiderService.getRiderHistoryDays(riderId, parseInt(days) || 14);

  res.json({
    success: true,
    data: history,
  });
});

/**
 * GET /rider/settlements
 * Get settlement history for last N days
 * Query params: days (default 14)
 */
export const getSettlements = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { days = 14 } = req.query;

  let riderId;
  try {
    const rider = await RiderService.getRiderByUserId(userId);
    riderId = rider?.id;
  } catch (e) {
    return res.json({ success: true, data: [] });
  }

  if (!riderId) {
    return res.json({ success: true, data: [] });
  }

  const settlements = await RiderService.getRiderSettlements(riderId, parseInt(days) || 14);

  res.json({
    success: true,
    data: settlements,
  });
});

/**
 * GET /rider/profile
 * Get rider profile with dashboard stats
 * P0 FIX: Removed invalid columns (email, is_on_duty)
 */
export const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  let rider;
  try {
    rider = await RiderService.getRiderByUserId(userId);
  } catch (e) {
    logger.error('[RiderController] getProfile error getting rider', { error: e.message, userId });
    throw new ForbiddenError('No rider profile found');
  }

  if (!rider) {
    throw new ForbiddenError('No rider profile found');
  }

  // Get stats
  const stats = await RiderService.getRiderDashboardStats(rider.id);

  // Determine if on duty based on status
  const isOnDuty = rider.status === 'available' || rider.status === 'on_delivery';

  res.json({
    success: true,
    data: {
      id: rider.id,
      rider_code: rider.rider_code,
      name: rider.full_name,
      phone: rider.phone,
      status: rider.status,
      is_on_duty: isOnDuty,
      vehicle_type: rider.vehicle_type,
      vehicle_number: rider.vehicle_number,
      stats: stats,
    },
  });
});

/**
 * POST /rider/toggle-duty
 * Toggle on/off duty status
 */
export const toggleDuty = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { on_duty } = req.body;

  let rider;
  try {
    rider = await RiderService.getRiderByUserId(userId);
  } catch (e) {
    throw new ForbiddenError('No rider profile found');
  }

  if (!rider) {
    throw new ForbiddenError('No rider profile found');
  }

  const newStatus = on_duty ? 'available' : 'off_duty';
  const updated = await RiderService.updateRiderStatus(rider.id, newStatus, userId);

  res.json({
    success: true,
    data: {
      is_on_duty: on_duty,
      status: newStatus,
    },
  });
});

/**
 * POST /rider/delivery-outcome
 * Submit delivery outcome (delivered, reschedule, reject)
 */
export const submitDeliveryOutcome = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    order_id, 
    status, 
    result: resultField, // Accept both 'result' and 'status' from frontend
    reason, 
    note, 
    notes,
    cod_collected, 
    collected_cash, // Accept both 'cod_collected' and 'collected_cash'
    photo_url, 
    receipt_url,
    payment_type,
    location 
  } = req.body;

  if (!order_id) {
    throw new BadRequestError('order_id is required');
  }

  // Accept either 'status' or 'result' from frontend
  const statusValue = resultField || status;
  if (!statusValue) {
    throw new BadRequestError('status/result is required');
  }

  let rider;
  try {
    rider = await RiderService.getRiderByUserId(userId);
  } catch (e) {
    throw new ForbiddenError('No rider profile found');
  }

  if (!rider) {
    throw new ForbiddenError('No rider profile found');
  }

  // Map status to internal format
  const statusMap = {
    'delivered': 'delivered',
    'reschedule': 'rescheduled',
    'rescheduled': 'rescheduled',
    'next_attempt': 'rescheduled',
    'reject': 'rejected',
    'rejected': 'rejected',
  };

  const mappedResult = statusMap[statusValue] || statusValue;
  const cashAmount = collected_cash || cod_collected;

  logger.info('[RiderController] submitDeliveryOutcome', {
    riderId: rider.id,
    orderId: order_id,
    result: mappedResult,
    reason,
    cashAmount,
    paymentType: payment_type,
  });

  const updateResult = await RiderService.updateDeliveryStatus(rider.id, order_id, {
    result: mappedResult,
    reason: reason,
    notes: notes || note,
    collected_cash: cashAmount,
    proof_photo_url: photo_url || receipt_url,
    payment_type: payment_type,
    lat: location?.lat,
    lng: location?.lng,
  });

  // Build success message
  let message;
  if (mappedResult === 'delivered') {
    message = cashAmount ? `Delivery completed! Collected रु. ${cashAmount}` : 'Delivery completed!';
  } else if (mappedResult === 'rejected') {
    message = 'Order marked as rejected. Please return to office.';
  } else if (mappedResult === 'rescheduled') {
    message = 'Order scheduled for next delivery attempt.';
  } else {
    message = `Order status updated to ${mappedResult}`;
  }

  res.json({
    success: true,
    message,
    data: updateResult,
  });
});

/**
 * POST /rider/send-sms
 * Send SMS to customer from rider app
 */
export const sendCustomerSMS = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { order_id, phone, template_id, message } = req.body;

  if (!phone || !message) {
    throw new BadRequestError('Phone and message are required');
  }

  // Get rider profile
  let rider;
  try {
    rider = await RiderService.getRiderByUserId(userId);
  } catch (e) {
    throw new ForbiddenError('No rider profile found');
  }

  if (!rider) {
    throw new ForbiddenError('No rider profile found');
  }

  // Send SMS via SMS service
  try {
    const { SMSService } = await import('../services/sms/SMSService.js');
    
    await SMSService.sendSMS({
      to: phone,
      message: message,
      metadata: {
        rider_id: rider.id,
        order_id: order_id,
        template_id: template_id,
        sent_by: 'rider_app',
      },
    });

    logger.info('[RiderController] SMS sent by rider', {
      riderId: rider.id,
      orderNumber: order_id,
      templateId: template_id,
    });

    res.json({
      success: true,
      message: 'SMS sent successfully',
    });
  } catch (smsError) {
    logger.error('[RiderController] Failed to send SMS:', smsError.message);
    throw new BadRequestError('Failed to send SMS. Please try again.');
  }
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Admin/Dispatch
  listRiders,
  getRider,
  assignOrdersToRider,
  updateRiderStatus,
  verifySettlement,
  
  // Rider App
  getMyProfile,
  getRiderTasks,
  reorderTasks,
  updateDeliveryStatus,
  updateLocation,
  startRun,
  endRun,
  getCashSummary,
  submitSettlement,
  
  // P0: Mobile App Endpoints
  getTasks,
  getHistory,
  getSettlements,
  getProfile,
  toggleDuty,
  submitDeliveryOutcome,
  sendCustomerSMS,
};
