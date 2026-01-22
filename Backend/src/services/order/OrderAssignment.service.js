/**
 * Order Assignment Service
 * 
 * Handles rider and courier assignment:
 * - Assign riders (inside valley)
 * - Handover to courier (outside valley)
 * - Delivery status updates
 * - Return processing
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { createLogger } from '../../utils/logger.js';
import {
  NotFoundError,
  ValidationError,
  DatabaseError,
} from '../../utils/errors.js';
import { orderCoreService } from './OrderCore.service.js';
import { orderStateService } from './OrderState.service.js';

const logger = createLogger('OrderAssignment');

class OrderAssignmentService {
  // ===========================================================================
  // RIDER ASSIGNMENT (Inside Valley)
  // ===========================================================================

  /**
   * Assign rider to order
   */
  async assignRider(orderId, riderId, context = {}) {
    const { userId } = context;

    // Get order
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, fulfillment_type, rider_id')
      .eq('id', orderId)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    if (order.fulfillment_type !== 'inside_valley') {
      throw new ValidationError('Can only assign riders to inside valley orders');
    }

    if (order.status !== 'packed') {
      throw new ValidationError(`Order must be in "packed" status to assign rider. Current: ${order.status}`);
    }

    // Verify rider exists and is available
    const { data: rider, error: riderError } = await supabaseAdmin
      .from('riders')
      .select('id, name, phone, is_available, status')
      .eq('id', riderId)
      .single();

    if (riderError || !rider) {
      throw new NotFoundError('Rider');
    }

    if (!rider.is_available || rider.status !== 'active') {
      throw new ValidationError('Rider is not available');
    }

    // Update order
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        rider_id: riderId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      throw new DatabaseError('Failed to assign rider', updateError);
    }

    // Log assignment
    await orderCoreService.createOrderLog({
      order_id: orderId,
      action: 'rider_assigned',
      description: `Rider ${rider.name} (${rider.phone}) assigned`,
      created_by: userId,
    });

    logger.info('Rider assigned to order', {
      orderId,
      riderId,
      riderName: rider.name,
    });

    return orderCoreService.getOrderById(orderId);
  }

  /**
   * Mark order as out for delivery
   */
  async markOutForDelivery(orderId, context = {}) {
    const { userId } = context;

    // Get order
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, fulfillment_type, rider_id')
      .eq('id', orderId)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    if (order.fulfillment_type !== 'inside_valley') {
      throw new ValidationError('Only inside valley orders can be marked out for delivery');
    }

    if (!order.rider_id) {
      throw new ValidationError('No rider assigned to this order');
    }

    if (order.status !== 'packed') {
      throw new ValidationError(`Order must be in "packed" status. Current: ${order.status}`);
    }

    // Update status
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'out_for_delivery',
        dispatched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      throw new DatabaseError('Failed to update order', updateError);
    }

    await orderCoreService.createOrderLog({
      order_id: orderId,
      action: 'status_changed',
      old_status: 'packed',
      new_status: 'out_for_delivery',
      description: 'Order dispatched for delivery',
      created_by: userId,
    });

    logger.info('Order marked out for delivery', { orderId });

    return orderCoreService.getOrderById(orderId);
  }

  /**
   * Get available riders
   */
  async getAvailableRiders() {
    const { data, error } = await supabaseAdmin
      .from('riders')
      .select(`
        id, name, phone, vehicle_type, vehicle_number,
        is_available, status, total_deliveries, average_rating
      `)
      .eq('is_available', true)
      .eq('status', 'active')
      .order('name');

    if (error) {
      logger.error('Failed to get available riders', { error });
      throw new DatabaseError('Failed to get available riders', error);
    }

    return data || [];
  }

  // ===========================================================================
  // COURIER HANDOVER (Outside Valley)
  // ===========================================================================

  /**
   * Handover order to courier partner
   */
  async handoverToCourier(orderId, courierData, context = {}) {
    const { courier_partner, awb_number, tracking_url } = courierData;
    const { userId } = context;

    // Get order
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, fulfillment_type')
      .eq('id', orderId)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    if (order.fulfillment_type !== 'outside_valley') {
      throw new ValidationError('Can only handover outside valley orders to courier');
    }

    if (order.status !== 'packed') {
      throw new ValidationError(`Order must be in "packed" status. Current: ${order.status}`);
    }

    if (!courier_partner) {
      throw new ValidationError('Courier partner is required');
    }

    if (!awb_number) {
      throw new ValidationError('AWB/Tracking number is required');
    }

    // Update order
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'shipped',
        courier_partner,
        awb_number,
        tracking_url: tracking_url || null,
        shipped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      throw new DatabaseError('Failed to handover to courier', updateError);
    }

    await orderCoreService.createOrderLog({
      order_id: orderId,
      action: 'status_changed',
      old_status: 'packed',
      new_status: 'shipped',
      description: `Handed over to ${courier_partner} (AWB: ${awb_number})`,
      created_by: userId,
    });

    logger.info('Order handed to courier', {
      orderId,
      courier: courier_partner,
      awb: awb_number,
    });

    return orderCoreService.getOrderById(orderId);
  }

  /**
   * Get available courier partners
   */
  async getCourierPartners() {
    // This could come from a database table in the future
    return [
      { id: 'ncm', name: 'NCM Logistics', is_active: true },
      { id: 'janaki', name: 'Janaki Express', is_active: true },
      { id: 'fasttrack', name: 'Fast Track', is_active: true },
      { id: 'other', name: 'Other', is_active: true },
    ];
  }

  // ===========================================================================
  // DELIVERY COMPLETION
  // ===========================================================================

  /**
   * Mark order as delivered
   */
  async markDelivered(orderId, deliveryData = {}, context = {}) {
    const { collected_amount, notes, proof_url } = deliveryData;
    const { userId } = context;

    // Get order
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, total_amount, payment_method')
      .eq('id', orderId)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    const validStatuses = ['out_for_delivery', 'shipped', 'in_transit'];
    if (!validStatuses.includes(order.status)) {
      throw new ValidationError(`Cannot mark as delivered from ${order.status} status`);
    }

    // Update order
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'delivered',
        payment_status: 'paid',
        delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      throw new DatabaseError('Failed to mark as delivered', updateError);
    }

    await orderCoreService.createOrderLog({
      order_id: orderId,
      action: 'status_changed',
      old_status: order.status,
      new_status: 'delivered',
      description: notes || 'Order delivered successfully',
      created_by: userId,
    });

    logger.info('Order marked as delivered', { orderId });

    return orderCoreService.getOrderById(orderId);
  }

  /**
   * Mark order as returned
   */
  async markReturned(orderId, returnData = {}, context = {}) {
    const { reason, notes, return_type = 'full' } = returnData;
    const { userId } = context;

    // Get order
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status')
      .eq('id', orderId)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    const validStatuses = ['out_for_delivery', 'shipped', 'in_transit', 'delivered'];
    if (!validStatuses.includes(order.status)) {
      throw new ValidationError(`Cannot mark as returned from ${order.status} status`);
    }

    // Update order
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'returned',
        return_reason: reason,
        returned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      throw new DatabaseError('Failed to mark as returned', updateError);
    }

    await orderCoreService.createOrderLog({
      order_id: orderId,
      action: 'status_changed',
      old_status: order.status,
      new_status: 'returned',
      description: reason || 'Order returned',
      created_by: userId,
    });

    logger.info('Order marked as returned', { orderId, reason });

    return orderCoreService.getOrderById(orderId);
  }
}

export const orderAssignmentService = new OrderAssignmentService();
export default orderAssignmentService;
