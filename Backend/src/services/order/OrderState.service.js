/**
 * Order State Service
 * 
 * Handles order status transitions and state machine logic:
 * - Status updates (single and bulk)
 * - State validation
 * - Status change integrations
 * 
 * P0 FIX: Now uses centralized WorkflowRules.validateTransition() (Audit Finding 4.5)
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
import { logStatusChange, logActivity, ACTIVITY_TYPES } from '../ActivityLogger.service.js';
import { 
  validateTransition as validateWorkflowTransition,
  executeInventoryTrigger,
  getAllowedTransitions as getWorkflowAllowedTransitions,
} from './WorkflowRules.service.js';

const logger = createLogger('OrderState');

// Valid status transitions - Aligned with WorkflowRules.service.js
// =========================================================================
// STATUS FLOW:
// intake → follow_up → converted → packed → assigned → out_for_delivery → delivered
//                                         → handover_to_courier → in_transit → delivered
// =========================================================================
const VALID_TRANSITIONS = {
  // Intake Phase
  intake: ['follow_up', 'converted', 'cancelled', 'store_sale'],
  follow_up: ['follow_up', 'converted', 'hold', 'cancelled'],
  
  // Processing Phase
  converted: ['packed', 'hold', 'cancelled', 'store_sale'],
  hold: ['converted', 'packed', 'cancelled'],
  packed: ['assigned', 'handover_to_courier', 'shipped', 'out_for_delivery', 'store_sale', 'cancelled'],
  
  // Delivery Phase - Inside Valley (Rider)
  assigned: ['out_for_delivery', 'packed', 'cancelled'],
  out_for_delivery: ['delivered', 'rejected', 'return_initiated', 'assigned', 'cancelled'],
  
  // Delivery Phase - Outside Valley (Courier)
  handover_to_courier: ['in_transit', 'delivered', 'return_initiated'],
  shipped: ['delivered', 'returned', 'in_transit'],
  in_transit: ['delivered', 'returned', 'return_initiated'],
  
  // Terminal States
  delivered: ['return_initiated'],
  store_sale: ['delivered', 'return_initiated'],
  
  // Return Flow
  return_initiated: ['returned'],
  rejected: ['return_initiated', 'returned'],
  returned: [],
  
  // Cancelled (terminal)
  cancelled: [],
};

// Status metadata - Complete status configuration
const STATUS_CONFIG = {
  // Intake Phase
  intake: { label: 'New', color: 'gray', canEdit: true, canCancel: true },
  follow_up: { label: 'Follow Up', color: 'yellow', canEdit: true, canCancel: true },
  
  // Processing Phase
  converted: { label: 'Converted', color: 'blue', canEdit: true, canCancel: true },
  hold: { label: 'On Hold', color: 'orange', canEdit: true, canCancel: true },
  packed: { label: 'Packed', color: 'purple', canEdit: false, canCancel: true },
  
  // Delivery Phase - Inside Valley
  assigned: { label: 'Assigned', color: 'indigo', canEdit: false, canCancel: true },
  out_for_delivery: { label: 'Out for Delivery', color: 'cyan', canEdit: false, canCancel: false },
  
  // Delivery Phase - Outside Valley
  handover_to_courier: { label: 'Handover to Courier', color: 'blue', canEdit: false, canCancel: false },
  shipped: { label: 'Shipped', color: 'orange', canEdit: false, canCancel: false },
  in_transit: { label: 'In Transit', color: 'orange', canEdit: false, canCancel: false },
  
  // Terminal States
  delivered: { label: 'Delivered', color: 'green', canEdit: false, canCancel: false },
  store_sale: { label: 'Store Sale', color: 'green', canEdit: false, canCancel: false },
  
  // Return Flow
  return_initiated: { label: 'Return Initiated', color: 'amber', canEdit: false, canCancel: false },
  rejected: { label: 'Rejected', color: 'red', canEdit: false, canCancel: false },
  returned: { label: 'Returned', color: 'red', canEdit: false, canCancel: false },
  
  // Cancelled
  cancelled: { label: 'Cancelled', color: 'red', canEdit: false, canCancel: false },
  
  // Legacy (for backward compatibility)
  confirmed: { label: 'Confirmed', color: 'blue', canEdit: true, canCancel: true },
};

class OrderStateService {
  /**
   * Update order status with validation
   * 
   * P0 FIX: Now uses centralized WorkflowRules.validateTransition() (Audit Finding 4.5)
   */
  async updateStatus(orderId, statusData, context = {}) {
    const { status: newStatus, reason, awb_number, courier_partner, tracking_url, ...additionalData } = statusData;
    const { userId, user, userRole } = context;

    // Get current order with all fields needed for validation
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

    // =========================================================================
    // P0 FIX: Use centralized WorkflowRules.validateTransition() (Audit Finding 4.5)
    // This enforces:
    // 1. Proper state machine transitions
    // 2. Role-based locks (e.g., rider lock)
    // 3. Dispatch requirements
    // 4. Inventory checks for 'packed'
    // =========================================================================
    const validationResult = await validateWorkflowTransition(order, newStatus, {
      userId,
      userRole: userRole || user?.role || 'operator',
      additionalData: { ...additionalData, reason },
    });

    if (!validationResult.valid) {
      logger.warn('Status transition rejected by WorkflowRules', {
        orderId,
        from: currentStatus,
        to: newStatus,
        error: validationResult.error,
        code: validationResult.code,
      });

      // Throw appropriate error based on code
      if (validationResult.code === 'INVALID_TRANSITION') {
        throw new InvalidStateTransitionError(currentStatus, newStatus);
      }
      if (validationResult.code === 'ACCESS_DENIED') {
        throw new ValidationError(validationResult.error);
      }
      if (validationResult.code === 'MISSING_REQUIRED_FIELDS') {
        throw new ValidationError(validationResult.error);
      }
      if (validationResult.code === 'INSUFFICIENT_STOCK') {
        throw new ValidationError(validationResult.error);
      }
      throw new ValidationError(validationResult.error || 'Invalid status transition');
    }

    // Log any warnings from validation
    if (validationResult.warnings?.length > 0) {
      logger.warn('Status transition warnings', {
        orderId,
        warnings: validationResult.warnings,
      });
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

    if (newStatus === 'return_initiated') {
      updateData.return_initiated_at = new Date().toISOString();
      updateData.return_reason = additionalData.return_reason || reason;
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

    // =========================================================================
    // P0 FIX: Execute inventory trigger via WorkflowRules (Audit Finding 4.5)
    // This handles stock deduction/restoration based on the transition
    // =========================================================================
    const inventoryResult = await executeInventoryTrigger(order, currentStatus, newStatus, { userId });
    if (!inventoryResult.success && inventoryResult.error) {
      logger.warn('Inventory trigger warning', {
        orderId,
        action: inventoryResult.action,
        error: inventoryResult.error,
      });
    }

    // =========================================================================
    // P1: Auto-create Ticket on key status transitions
    // - DELIVERED -> Review ticket (experience feedback)
    // - CANCELLED/REJECTED/RETURNED -> Investigation ticket
    // =========================================================================
    await this.autoCreateTicket(order, newStatus).catch(err => {
      logger.warn('[Tickets] Auto-ticket creation failed (non-blocking)', { orderId, newStatus, error: err.message });
    });

    // Create status change log (legacy order_logs table)
    await orderCoreService.createOrderLog({
      order_id: orderId,
      action: 'status_changed',
      old_status: currentStatus,
      new_status: newStatus,
      description: reason || `Status changed from ${currentStatus} to ${newStatus}`,
      created_by: userId,
    });

    // =========================================================================
    // P0: Log to order_activities for Timeline feature
    // Note: The database trigger also logs this, but we log with user info here
    // =========================================================================
    await logStatusChange(supabaseAdmin, {
      orderId,
      user: context.user || null,  // Pass full user object for name/role extraction
      oldStatus: currentStatus,
      newStatus: newStatus,
      reason: reason,
    });

    // Trigger integrations
    await this.triggerStatusChangeIntegrations(order, currentStatus, newStatus);

    logger.info('Order status updated', {
      orderId,
      orderNumber: order.order_number,
      from: currentStatus,
      to: newStatus,
      inventoryAction: inventoryResult.action,
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
   * P0 FIX: Now delegates to WorkflowRules for consistency (Audit Finding 4.5)
   */
  isValidTransition(fromStatus, toStatus, fulfillmentType = 'inside_valley') {
    // Use WorkflowRules as primary validation
    const allowedTransitions = getWorkflowAllowedTransitions(fromStatus, fulfillmentType);
    return allowedTransitions.includes(toStatus);
  }

  /**
   * Get valid next statuses for an order
   * P0 FIX: Now delegates to WorkflowRules for consistency (Audit Finding 4.5)
   */
  getValidNextStatuses(currentStatus, fulfillmentType = 'inside_valley') {
    return getWorkflowAllowedTransitions(currentStatus, fulfillmentType);
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

  // ===========================================================================
  // AUTO-CREATE TICKET ON STATUS TRANSITIONS
  // ===========================================================================

  async autoCreateTicket(order, newStatus) {
    const REVIEW_STATUSES = ['delivered'];
    const INVESTIGATION_STATUSES = ['cancelled', 'rejected', 'returned', 'return_initiated'];

    let ticketData = null;

    if (REVIEW_STATUSES.includes(newStatus)) {
      ticketData = {
        type: 'review',
        category: 'feedback',
        priority: 'low',
        status: 'open',
        source: 'auto_delivered',
        subject: `Delivery review - ${order.readable_id || order.order_number}`,
        description: `Automated review request for delivered order ${order.readable_id || order.order_number}`,
        order_id: order.id,
        customer_name: order.shipping_name || order.customer?.name,
        customer_phone: order.shipping_phone || order.customer?.phone,
        metadata: { auto_trigger: 'delivered', order_number: order.order_number },
      };
    } else if (INVESTIGATION_STATUSES.includes(newStatus)) {
      ticketData = {
        type: 'investigation',
        category: newStatus === 'rejected' ? 'wrong_item' : 'other',
        priority: 'high',
        status: 'open',
        source: 'auto_rejected',
        subject: `Investigation: ${newStatus.replace('_', ' ')} - ${order.readable_id || order.order_number}`,
        description: `Auto-created investigation for order ${order.readable_id || order.order_number} (status: ${newStatus})`,
        order_id: order.id,
        customer_name: order.shipping_name || order.customer?.name,
        customer_phone: order.shipping_phone || order.customer?.phone,
        metadata: { auto_trigger: newStatus, order_number: order.order_number },
      };
    }

    if (!ticketData) return;

    // Check for duplicate (don't create if same type+order already exists & is open)
    const { data: existing } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('order_id', order.id)
      .eq('type', ticketData.type)
      .in('status', ['open', 'processing'])
      .maybeSingle();

    if (existing) {
      logger.debug('[Tickets] Skipping auto-ticket (duplicate exists)', { orderId: order.id, type: ticketData.type });
      return;
    }

    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .insert(ticketData)
      .select('id, readable_id, type')
      .single();

    if (error) {
      logger.error('[Tickets] Auto-ticket creation failed', { error, orderId: order.id });
      return;
    }

    logger.info('[Tickets] Auto-ticket created', {
      ticketId: ticket.id,
      readableId: ticket.readable_id,
      type: ticket.type,
      orderId: order.id,
    });
  }
}

export const orderStateService = new OrderStateService();
export default orderStateService;
