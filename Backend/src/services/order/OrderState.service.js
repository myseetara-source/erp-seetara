/**
 * Order State Service
 * 
 * Handles order status transitions and state machine logic:
 * - Status updates (single and bulk)
 * - State validation
 * - Status change integrations
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { createLogger } from '../../utils/logger.js';
import {
  NotFoundError,
  ValidationError,
  InvalidStateTransitionError,
  DatabaseError,
} from '../../utils/errors.js';
import { orderCoreService } from './OrderCore.service.js';

const logger = createLogger('OrderState');

// Valid status transitions
const VALID_TRANSITIONS = {
  intake: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'out_for_delivery', 'cancelled'],
  shipped: ['delivered', 'returned', 'in_transit'],
  in_transit: ['delivered', 'returned'],
  out_for_delivery: ['delivered', 'returned', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

// Status metadata
const STATUS_CONFIG = {
  intake: { label: 'Intake', color: 'gray', canEdit: true, canCancel: true },
  confirmed: { label: 'Confirmed', color: 'blue', canEdit: true, canCancel: true },
  packed: { label: 'Packed', color: 'purple', canEdit: false, canCancel: true },
  shipped: { label: 'Shipped', color: 'orange', canEdit: false, canCancel: false },
  in_transit: { label: 'In Transit', color: 'orange', canEdit: false, canCancel: false },
  out_for_delivery: { label: 'Out for Delivery', color: 'yellow', canEdit: false, canCancel: false },
  delivered: { label: 'Delivered', color: 'green', canEdit: false, canCancel: false },
  cancelled: { label: 'Cancelled', color: 'red', canEdit: false, canCancel: false },
  returned: { label: 'Returned', color: 'red', canEdit: false, canCancel: false },
};

class OrderStateService {
  /**
   * Update order status with validation
   */
  async updateStatus(orderId, statusData, context = {}) {
    const { status: newStatus, reason, awb_number, courier_partner, tracking_url } = statusData;
    const { userId } = context;

    // Get current order
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, status, fulfillment_type, rider_id, customer_id')
      .eq('id', orderId)
      .eq('is_deleted', false)
      .single();

    if (error || !order) {
      throw new NotFoundError('Order');
    }

    const currentStatus = order.status;

    // Validate state transition
    if (!this.isValidTransition(currentStatus, newStatus)) {
      throw new InvalidStateTransitionError(currentStatus, newStatus);
    }

    // Build update data
    const updateData = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Status-specific updates
    if (newStatus === 'shipped' && awb_number) {
      updateData.awb_number = awb_number;
      updateData.courier_partner = courier_partner;
      updateData.tracking_url = tracking_url;
      updateData.shipped_at = new Date().toISOString();
    }

    if (newStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
      updateData.payment_status = 'paid';
    }

    if (newStatus === 'cancelled') {
      updateData.cancelled_at = new Date().toISOString();
      updateData.cancellation_reason = reason;
    }

    // Perform update
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateError) {
      logger.error('Failed to update order status', { error: updateError });
      throw new DatabaseError('Failed to update order status', updateError);
    }

    // Create status change log
    await orderCoreService.createOrderLog({
      order_id: orderId,
      action: 'status_changed',
      old_status: currentStatus,
      new_status: newStatus,
      description: reason || `Status changed from ${currentStatus} to ${newStatus}`,
      created_by: userId,
    });

    // Trigger integrations
    await this.triggerStatusChangeIntegrations(order, currentStatus, newStatus);

    logger.info('Order status updated', {
      orderId,
      orderNumber: order.order_number,
      from: currentStatus,
      to: newStatus,
    });

    return orderCoreService.getOrderById(orderId);
  }

  /**
   * Bulk update order statuses
   */
  async bulkUpdateStatus(orderIds, status, reason, context = {}) {
    const results = {
      success: [],
      failed: [],
    };

    for (const orderId of orderIds) {
      try {
        await this.updateStatus(orderId, { status, reason }, context);
        results.success.push(orderId);
      } catch (error) {
        results.failed.push({
          orderId,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Check if status transition is valid
   */
  isValidTransition(fromStatus, toStatus) {
    const validNextStatuses = VALID_TRANSITIONS[fromStatus] || [];
    return validNextStatuses.includes(toStatus);
  }

  /**
   * Get valid next statuses for an order
   */
  getValidNextStatuses(currentStatus) {
    return VALID_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Get status configuration
   */
  getStatusConfig(status) {
    return STATUS_CONFIG[status] || null;
  }

  /**
   * Get all status configurations
   */
  getAllStatusConfigs() {
    return STATUS_CONFIG;
  }

  /**
   * Trigger integrations on status change
   */
  async triggerStatusChangeIntegrations(order, oldStatus, newStatus) {
    try {
      // SMS notifications for key status changes
      const notifyStatuses = ['confirmed', 'shipped', 'out_for_delivery', 'delivered'];
      
      if (notifyStatuses.includes(newStatus)) {
        logger.debug('Status change notification triggered', {
          orderId: order.id,
          status: newStatus,
        });
        // SMS service will handle this via triggers or scheduled jobs
      }

      // Analytics/tracking events
      if (newStatus === 'delivered') {
        logger.info('Order delivered', {
          orderId: order.id,
          orderNumber: order.order_number,
        });
      }

      if (newStatus === 'cancelled') {
        logger.info('Order cancelled', {
          orderId: order.id,
          orderNumber: order.order_number,
        });
      }
    } catch (error) {
      logger.warn('Status change integration failed', { error: error.message });
    }
  }

  /**
   * Cancel order with stock restoration
   */
  async cancelOrder(orderId, reason, context = {}) {
    const { userId } = context;

    // Get order with items
    const order = await orderCoreService.getOrderById(orderId);

    if (!STATUS_CONFIG[order.status]?.canCancel) {
      throw new ValidationError(`Cannot cancel order in ${order.status} status`);
    }

    // Update status
    await this.updateStatus(orderId, {
      status: 'cancelled',
      reason,
    }, context);

    // Restore stock for each item
    // Note: Stock restoration is handled by triggers or should be done here
    logger.info('Order cancelled, stock should be restored', {
      orderId,
      itemCount: order.items?.length || 0,
    });

    return orderCoreService.getOrderById(orderId);
  }
}

export const orderStateService = new OrderStateService();
export default orderStateService;
