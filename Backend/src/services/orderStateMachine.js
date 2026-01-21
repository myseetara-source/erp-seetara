/**
 * Order State Machine
 * 
 * COMPREHENSIVE STATE MACHINE FOR ORDER FULFILLMENT
 * 
 * Three distinct flows:
 * - Inside Valley: Our own riders deliver within Kathmandu Valley
 * - Outside Valley: 3rd party couriers (NCM, Sundar, etc.)
 * - Store: Walk-in customers with immediate handover
 * 
 * FLOW DIAGRAMS:
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                     INSIDE VALLEY FLOW                                  │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  INTAKE → FOLLOW_UP → CONVERTED → PACKED → ASSIGNED → OUT_FOR_DELIVERY │
 * │                                                            ↓            │
 * │                                                       DELIVERED         │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                     OUTSIDE VALLEY FLOW                                 │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  INTAKE → FOLLOW_UP → CONVERTED → PACKED → HANDOVER_TO_COURIER         │
 * │                                                   ↓                     │
 * │                                              IN_TRANSIT → DELIVERED     │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                     STORE FLOW                                          │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  INTAKE → CONVERTED → PACKED → STORE_SALE → DELIVERED                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// =============================================================================
// FULFILLMENT TYPES
// =============================================================================

export const FULFILLMENT_TYPES = {
  INSIDE_VALLEY: 'inside_valley',
  OUTSIDE_VALLEY: 'outside_valley',
  STORE: 'store',
};

// =============================================================================
// ORDER STATUSES (Aligned with Database Enum)
// =============================================================================

export const ORDER_STATUS = {
  // Intake Stage
  INTAKE: 'intake',
  FOLLOW_UP: 'follow_up',
  CONVERTED: 'converted',
  
  // Processing Stage
  PACKED: 'packed',
  
  // Inside Valley Delivery
  ASSIGNED: 'assigned',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  
  // Outside Valley Delivery
  HANDOVER_TO_COURIER: 'handover_to_courier',
  IN_TRANSIT: 'in_transit',
  
  // Store Sale
  STORE_SALE: 'store_sale',
  
  // Terminal Statuses
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  
  // Return Flow
  RETURN_INITIATED: 'return_initiated',
  RETURNED: 'returned',
};

// =============================================================================
// STATUS CATEGORIES (For Kanban/Funnel Views)
// =============================================================================

export const STATUS_CATEGORIES = {
  INTAKE: ['intake', 'follow_up'],
  PROCESSING: ['converted', 'packed'],
  DISPATCH: ['assigned', 'out_for_delivery', 'handover_to_courier', 'in_transit', 'store_sale'],
  COMPLETED: ['delivered'],
  CANCELLED: ['cancelled', 'rejected'],
  RETURNS: ['return_initiated', 'returned'],
};

// =============================================================================
// STATE MACHINE DEFINITIONS
// =============================================================================

/**
 * Valid status transitions for Inside Valley orders
 */
const INSIDE_VALLEY_TRANSITIONS = {
  [ORDER_STATUS.INTAKE]: [
    ORDER_STATUS.FOLLOW_UP,
    ORDER_STATUS.CONVERTED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.REJECTED,
  ],
  [ORDER_STATUS.FOLLOW_UP]: [
    ORDER_STATUS.FOLLOW_UP, // Can schedule another follow-up
    ORDER_STATUS.CONVERTED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.REJECTED,
  ],
  [ORDER_STATUS.CONVERTED]: [
    ORDER_STATUS.PACKED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PACKED]: [
    ORDER_STATUS.ASSIGNED, // Requires rider_id
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.ASSIGNED]: [
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.PACKED, // Unassign rider
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.RETURN_INITIATED,
    ORDER_STATUS.ASSIGNED, // Failed delivery, reassign
  ],
  [ORDER_STATUS.DELIVERED]: [
    ORDER_STATUS.RETURN_INITIATED,
  ],
  [ORDER_STATUS.RETURN_INITIATED]: [
    ORDER_STATUS.RETURNED,
  ],
  [ORDER_STATUS.RETURNED]: [],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.REJECTED]: [],
};

/**
 * Valid status transitions for Outside Valley orders
 */
const OUTSIDE_VALLEY_TRANSITIONS = {
  [ORDER_STATUS.INTAKE]: [
    ORDER_STATUS.FOLLOW_UP,
    ORDER_STATUS.CONVERTED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.REJECTED,
  ],
  [ORDER_STATUS.FOLLOW_UP]: [
    ORDER_STATUS.FOLLOW_UP,
    ORDER_STATUS.CONVERTED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.REJECTED,
  ],
  [ORDER_STATUS.CONVERTED]: [
    ORDER_STATUS.PACKED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PACKED]: [
    ORDER_STATUS.HANDOVER_TO_COURIER, // Requires courier info
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.HANDOVER_TO_COURIER]: [
    ORDER_STATUS.IN_TRANSIT,
    ORDER_STATUS.DELIVERED, // Some couriers skip in_transit
    ORDER_STATUS.RETURN_INITIATED,
  ],
  [ORDER_STATUS.IN_TRANSIT]: [
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.RETURN_INITIATED,
  ],
  [ORDER_STATUS.DELIVERED]: [
    ORDER_STATUS.RETURN_INITIATED,
  ],
  [ORDER_STATUS.RETURN_INITIATED]: [
    ORDER_STATUS.RETURNED,
  ],
  [ORDER_STATUS.RETURNED]: [],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.REJECTED]: [],
};

/**
 * Valid status transitions for Store orders
 */
const STORE_TRANSITIONS = {
  [ORDER_STATUS.INTAKE]: [
    ORDER_STATUS.CONVERTED,
    ORDER_STATUS.STORE_SALE, // Can go directly to store sale
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.REJECTED,
  ],
  [ORDER_STATUS.CONVERTED]: [
    ORDER_STATUS.PACKED,
    ORDER_STATUS.STORE_SALE,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PACKED]: [
    ORDER_STATUS.STORE_SALE,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.STORE_SALE]: [
    ORDER_STATUS.DELIVERED, // Complete the sale
  ],
  [ORDER_STATUS.DELIVERED]: [
    ORDER_STATUS.RETURN_INITIATED,
  ],
  [ORDER_STATUS.RETURN_INITIATED]: [
    ORDER_STATUS.RETURNED,
  ],
  [ORDER_STATUS.RETURNED]: [],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.REJECTED]: [],
};

// =============================================================================
// STATUS REQUIREMENTS
// =============================================================================

/**
 * Fields required for specific status transitions
 */
const STATUS_REQUIREMENTS = {
  [ORDER_STATUS.FOLLOW_UP]: {
    requiredFields: ['followup_date', 'followup_reason'],
    errorMessage: 'Follow-up requires a date and reason',
  },
  [ORDER_STATUS.ASSIGNED]: {
    fulfillmentTypes: [FULFILLMENT_TYPES.INSIDE_VALLEY],
    requiredFields: ['assigned_rider_id'],
    errorMessage: 'Assignment requires a rider to be selected',
  },
  [ORDER_STATUS.OUT_FOR_DELIVERY]: {
    fulfillmentTypes: [FULFILLMENT_TYPES.INSIDE_VALLEY],
    requiredFields: [],
    mustHave: { assigned_rider_id: true },
    errorMessage: 'Order must be assigned to a rider first',
  },
  [ORDER_STATUS.HANDOVER_TO_COURIER]: {
    fulfillmentTypes: [FULFILLMENT_TYPES.OUTSIDE_VALLEY],
    requiredFields: ['courier_partner', 'courier_tracking_id'],
    errorMessage: 'Handover requires courier partner and tracking ID',
  },
  [ORDER_STATUS.CANCELLED]: {
    requiredFields: ['cancellation_reason'],
    errorMessage: 'Cancellation requires a reason',
  },
  [ORDER_STATUS.REJECTED]: {
    requiredFields: ['rejection_reason'],
    errorMessage: 'Rejection requires a reason',
  },
  [ORDER_STATUS.RETURN_INITIATED]: {
    requiredFields: ['return_reason'],
    errorMessage: 'Return initiation requires a reason',
  },
};

// =============================================================================
// STATE MACHINE CLASS
// =============================================================================

export class OrderStateMachine {
  /**
   * Get valid transitions based on fulfillment type
   */
  static getTransitions(fulfillmentType) {
    switch (fulfillmentType) {
      case FULFILLMENT_TYPES.INSIDE_VALLEY:
        return INSIDE_VALLEY_TRANSITIONS;
      case FULFILLMENT_TYPES.OUTSIDE_VALLEY:
        return OUTSIDE_VALLEY_TRANSITIONS;
      case FULFILLMENT_TYPES.STORE:
        return STORE_TRANSITIONS;
      default:
        return INSIDE_VALLEY_TRANSITIONS;
    }
  }

  /**
   * Check if a status transition is valid
   */
  static isValidTransition(currentStatus, newStatus, fulfillmentType) {
    const transitions = this.getTransitions(fulfillmentType);
    const allowedStatuses = transitions[currentStatus] || [];
    return allowedStatuses.includes(newStatus);
  }

  /**
   * Get allowed next statuses for an order
   */
  static getAllowedNextStatuses(currentStatus, fulfillmentType) {
    const transitions = this.getTransitions(fulfillmentType);
    return transitions[currentStatus] || [];
  }

  /**
   * Validate a status transition with all requirements
   * @throws {AppError} if transition is invalid
   */
  static validateTransition(order, newStatus, updateData = {}) {
    const { status: currentStatus, fulfillment_type: fulfillmentType } = order;

    // Check if transition is allowed
    if (!this.isValidTransition(currentStatus, newStatus, fulfillmentType)) {
      const allowed = this.getAllowedNextStatuses(currentStatus, fulfillmentType);
      throw new AppError(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'. ` +
        `Allowed transitions: [${allowed.join(', ')}]`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Validate fulfillment-specific restrictions
    this.validateFulfillmentRestrictions(fulfillmentType, newStatus);

    // Validate required fields
    this.validateStatusRequirements(order, newStatus, updateData);

    return true;
  }

  /**
   * Validate that status is valid for fulfillment type
   */
  static validateFulfillmentRestrictions(fulfillmentType, newStatus) {
    // Inside Valley cannot use courier statuses
    if (fulfillmentType === FULFILLMENT_TYPES.INSIDE_VALLEY) {
      if ([ORDER_STATUS.HANDOVER_TO_COURIER, ORDER_STATUS.IN_TRANSIT].includes(newStatus)) {
        throw new AppError(
          `Status '${newStatus}' is not valid for Inside Valley orders. ` +
          `Use 'assigned' → 'out_for_delivery' → 'delivered' flow instead.`,
          400,
          'INVALID_STATUS_FOR_FULFILLMENT'
        );
      }
    }

    // Outside Valley cannot use rider statuses
    if (fulfillmentType === FULFILLMENT_TYPES.OUTSIDE_VALLEY) {
      if ([ORDER_STATUS.ASSIGNED, ORDER_STATUS.OUT_FOR_DELIVERY].includes(newStatus)) {
        throw new AppError(
          `Status '${newStatus}' is not valid for Outside Valley orders. ` +
          `Use 'handover_to_courier' → 'in_transit' → 'delivered' flow instead.`,
          400,
          'INVALID_STATUS_FOR_FULFILLMENT'
        );
      }
    }

    // Store cannot use delivery statuses
    if (fulfillmentType === FULFILLMENT_TYPES.STORE) {
      const deliveryStatuses = [
        ORDER_STATUS.ASSIGNED,
        ORDER_STATUS.OUT_FOR_DELIVERY,
        ORDER_STATUS.HANDOVER_TO_COURIER,
        ORDER_STATUS.IN_TRANSIT,
      ];
      if (deliveryStatuses.includes(newStatus)) {
        throw new AppError(
          `Status '${newStatus}' is not valid for Store orders. ` +
          `Use 'store_sale' → 'delivered' flow instead.`,
          400,
          'INVALID_STATUS_FOR_FULFILLMENT'
        );
      }
    }
  }

  /**
   * Validate required fields for specific status transitions
   */
  static validateStatusRequirements(order, newStatus, updateData) {
    const requirements = STATUS_REQUIREMENTS[newStatus];
    if (!requirements) return;

    const combinedData = { ...order, ...updateData };

    // Check fulfillment type restriction
    if (requirements.fulfillmentTypes) {
      if (!requirements.fulfillmentTypes.includes(order.fulfillment_type)) {
        throw new AppError(
          `Status '${newStatus}' is only valid for ${requirements.fulfillmentTypes.join(' or ')} orders`,
          400,
          'INVALID_STATUS_FOR_FULFILLMENT'
        );
      }
    }

    // Check required fields
    if (requirements.requiredFields) {
      for (const field of requirements.requiredFields) {
        const value = combinedData[field];
        if (value === undefined || value === null || value === '') {
          throw new AppError(
            requirements.errorMessage || `Missing required field: ${field}`,
            400,
            'MISSING_REQUIRED_FIELD'
          );
        }
      }
    }

    // Check mustHave conditions (existing data on order)
    if (requirements.mustHave) {
      for (const [field, required] of Object.entries(requirements.mustHave)) {
        if (required && !order[field]) {
          throw new AppError(
            requirements.errorMessage || `Order must have ${field} set`,
            400,
            'PREREQUISITE_NOT_MET'
          );
        }
      }
    }
  }

  /**
   * Get action buttons config for a status
   */
  static getActionButtons(status, fulfillmentType) {
    const buttons = [];
    const allowed = this.getAllowedNextStatuses(status, fulfillmentType);

    // Map statuses to button configs
    const buttonConfigs = {
      [ORDER_STATUS.FOLLOW_UP]: { label: 'Schedule Follow-up', icon: 'phone', color: 'yellow' },
      [ORDER_STATUS.CONVERTED]: { label: 'Mark Converted', icon: 'check-circle', color: 'green' },
      [ORDER_STATUS.PACKED]: { label: 'Mark Packed', icon: 'package', color: 'indigo' },
      [ORDER_STATUS.ASSIGNED]: { label: 'Assign Rider', icon: 'user', color: 'blue', requiresModal: true },
      [ORDER_STATUS.OUT_FOR_DELIVERY]: { label: 'Out for Delivery', icon: 'truck', color: 'orange' },
      [ORDER_STATUS.HANDOVER_TO_COURIER]: { label: 'Handover to Courier', icon: 'external-link', color: 'purple', requiresModal: true },
      [ORDER_STATUS.IN_TRANSIT]: { label: 'Mark In Transit', icon: 'navigation', color: 'cyan' },
      [ORDER_STATUS.STORE_SALE]: { label: 'Complete Store Sale', icon: 'store', color: 'teal' },
      [ORDER_STATUS.DELIVERED]: { label: 'Mark Delivered', icon: 'check', color: 'emerald' },
      [ORDER_STATUS.CANCELLED]: { label: 'Cancel Order', icon: 'x-circle', color: 'red', requiresModal: true },
      [ORDER_STATUS.REJECTED]: { label: 'Reject Order', icon: 'x', color: 'red', requiresModal: true },
      [ORDER_STATUS.RETURN_INITIATED]: { label: 'Initiate Return', icon: 'rotate-ccw', color: 'pink', requiresModal: true },
      [ORDER_STATUS.RETURNED]: { label: 'Mark Returned', icon: 'undo', color: 'gray' },
    };

    for (const nextStatus of allowed) {
      if (buttonConfigs[nextStatus]) {
        buttons.push({
          status: nextStatus,
          ...buttonConfigs[nextStatus],
        });
      }
    }

    return buttons;
  }

  /**
   * Get initial status based on source and fulfillment type
   */
  static getInitialStatus(source, fulfillmentType) {
    if (source === 'store' || fulfillmentType === FULFILLMENT_TYPES.STORE) {
      return ORDER_STATUS.STORE_SALE;
    }
    return ORDER_STATUS.INTAKE;
  }

  /**
   * Check if status is terminal (no further transitions)
   */
  static isTerminalStatus(status) {
    return [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED, ORDER_STATUS.RETURNED].includes(status);
  }

  /**
   * Get status display info for UI
   */
  static getStatusInfo(status) {
    const statusInfo = {
      [ORDER_STATUS.INTAKE]: { label: 'Intake', color: 'blue', icon: 'inbox' },
      [ORDER_STATUS.FOLLOW_UP]: { label: 'Follow Up', color: 'yellow', icon: 'phone' },
      [ORDER_STATUS.CONVERTED]: { label: 'Converted', color: 'green', icon: 'check-circle' },
      [ORDER_STATUS.PACKED]: { label: 'Packed', color: 'indigo', icon: 'package' },
      [ORDER_STATUS.ASSIGNED]: { label: 'Assigned', color: 'blue', icon: 'user' },
      [ORDER_STATUS.OUT_FOR_DELIVERY]: { label: 'Out for Delivery', color: 'orange', icon: 'truck' },
      [ORDER_STATUS.HANDOVER_TO_COURIER]: { label: 'Handover to Courier', color: 'purple', icon: 'external-link' },
      [ORDER_STATUS.IN_TRANSIT]: { label: 'In Transit', color: 'cyan', icon: 'navigation' },
      [ORDER_STATUS.STORE_SALE]: { label: 'Store Sale', color: 'teal', icon: 'store' },
      [ORDER_STATUS.DELIVERED]: { label: 'Delivered', color: 'emerald', icon: 'check' },
      [ORDER_STATUS.CANCELLED]: { label: 'Cancelled', color: 'red', icon: 'x-circle' },
      [ORDER_STATUS.REJECTED]: { label: 'Rejected', color: 'red', icon: 'x' },
      [ORDER_STATUS.RETURN_INITIATED]: { label: 'Return Initiated', color: 'pink', icon: 'rotate-ccw' },
      [ORDER_STATUS.RETURNED]: { label: 'Returned', color: 'gray', icon: 'undo' },
    };

    return statusInfo[status] || { label: status, color: 'gray', icon: 'help-circle' };
  }

  /**
   * Get Kanban funnel category for a status
   */
  static getFunnelCategory(status) {
    for (const [category, statuses] of Object.entries(STATUS_CATEGORIES)) {
      if (statuses.includes(status)) {
        return category.toLowerCase();
      }
    }
    return 'other';
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine fulfillment type based on customer city/district
 */
export function determineFulfillmentType(city) {
  const VALLEY_DISTRICTS = [
    'kathmandu', 'lalitpur', 'bhaktapur', 'patan', 'kirtipur',
    'madhyapur thimi', 'budhanilkantha', 'tokha', 'chandragiri',
    'tarakeshwar', 'godawari', 'lubhu', 'sankhu',
  ];

  if (!city) {
    return FULFILLMENT_TYPES.INSIDE_VALLEY;
  }

  const normalizedCity = city.toLowerCase().trim();
  
  if (VALLEY_DISTRICTS.some(district => normalizedCity.includes(district))) {
    return FULFILLMENT_TYPES.INSIDE_VALLEY;
  }

  return FULFILLMENT_TYPES.OUTSIDE_VALLEY;
}

/**
 * Determine fulfillment type from database delivery_zones table
 */
export async function determineFulfillmentTypeFromDB(city, supabaseClient) {
  if (!city || !supabaseClient) {
    return {
      fulfillment_type: FULFILLMENT_TYPES.INSIDE_VALLEY,
      zone_info: null,
      source: 'default',
    };
  }

  try {
    const { data, error } = await supabaseClient.rpc('get_delivery_zone', {
      p_city_name: city.trim(),
      p_district: null,
    });

    if (error) {
      console.warn('Failed to lookup delivery zone from DB, using fallback', { error });
      return {
        fulfillment_type: determineFulfillmentType(city),
        zone_info: null,
        source: 'fallback',
      };
    }

    const zone = Array.isArray(data) ? data[0] : data;

    if (!zone || !zone.zone_type) {
      return {
        fulfillment_type: determineFulfillmentType(city),
        zone_info: null,
        source: 'fallback',
      };
    }

    const fulfillmentType = zone.zone_type === 'inside_valley' 
      ? FULFILLMENT_TYPES.INSIDE_VALLEY 
      : FULFILLMENT_TYPES.OUTSIDE_VALLEY;

    return {
      fulfillment_type: fulfillmentType,
      zone_info: zone,
      source: 'database',
    };
  } catch (err) {
    console.error('Error in determineFulfillmentTypeFromDB', { error: err });
    return {
      fulfillment_type: determineFulfillmentType(city),
      zone_info: null,
      source: 'error_fallback',
    };
  }
}

// =============================================================================
// NOTIFICATION TRIGGERS
// =============================================================================

/**
 * Get SMS template slug for a status transition
 * Used to trigger appropriate SMS notifications
 * 
 * @param {string} newStatus - The new order status
 * @returns {string|null} SMS template slug or null if no SMS needed
 */
export function getNotificationTrigger(newStatus) {
  const notificationMap = {
    [ORDER_STATUS.CONVERTED]: 'ORDER_CONFIRMED',
    [ORDER_STATUS.PACKED]: 'ORDER_PACKED',
    [ORDER_STATUS.ASSIGNED]: 'RIDER_ASSIGNED',
    [ORDER_STATUS.OUT_FOR_DELIVERY]: 'OUT_FOR_DELIVERY',
    [ORDER_STATUS.HANDOVER_TO_COURIER]: 'HANDOVER_TO_COURIER',
    [ORDER_STATUS.IN_TRANSIT]: 'IN_TRANSIT',
    [ORDER_STATUS.DELIVERED]: 'ORDER_DELIVERED',
    [ORDER_STATUS.CANCELLED]: 'ORDER_CANCELLED',
    [ORDER_STATUS.RETURN_INITIATED]: 'RETURN_INITIATED',
    [ORDER_STATUS.RETURNED]: 'ORDER_RETURNED',
  };

  return notificationMap[newStatus] || null;
}

// =============================================================================
// POST-TRANSITION HOOKS
// =============================================================================

/**
 * Execute post-transition hooks after a status change
 * 
 * This is called AFTER a status transition is complete to trigger
 * side effects like:
 * - Sending SMS notifications
 * - Creating feedback tickets
 * - Updating customer metrics
 * - Triggering webhooks
 * 
 * @param {Object} order - The order object after update
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 */
export async function executePostTransitionHooks(order, oldStatus, newStatus) {
  // Log the transition
  logger.info('Order status transition', {
    orderId: order.id,
    orderNumber: order.order_number,
    from: oldStatus,
    to: newStatus,
    fulfillmentType: order.fulfillment_type,
  });

  // =========================================================================
  // DELIVERED HOOKS
  // =========================================================================
  if (newStatus === ORDER_STATUS.DELIVERED) {
    // 1. Auto-create feedback ticket
    try {
      const { TicketService } = await import('./ticket.service.js');
      const feedbackTicket = await TicketService.autoCreateFeedbackTicket(order.id);
      if (feedbackTicket) {
        logger.info(`Feedback ticket ${feedbackTicket.ticket_number} created for order ${order.order_number}`);
      }
    } catch (error) {
      // Don't fail the delivery update if feedback creation fails
      logger.error('Failed to create feedback ticket', { 
        orderId: order.id, 
        error: error.message 
      });
    }

    // 2. Send delivery SMS (if enabled)
    try {
      const { SMSService } = await import('./sms/SMSService.js');
      if (order.customer?.phone) {
        await SMSService.send(
          order.customer.phone,
          `Your order ${order.order_number} has been delivered! Thank you for shopping with us.`,
          { context: 'order_delivered', order_id: order.id }
        );
      }
    } catch (error) {
      logger.warn('Failed to send delivery SMS', { error: error.message });
    }

    // 3. Update customer metrics (handled by DB trigger)
    // The update_customer_metrics trigger runs automatically
  }

  // =========================================================================
  // CANCELLED HOOKS
  // =========================================================================
  if (newStatus === ORDER_STATUS.CANCELLED) {
    // Send cancellation SMS
    try {
      const { SMSService } = await import('./sms/SMSService.js');
      if (order.customer?.phone) {
        await SMSService.send(
          order.customer.phone,
          `Order ${order.order_number} has been cancelled. Contact us for any queries.`,
          { context: 'order_cancelled', order_id: order.id }
        );
      }
    } catch (error) {
      logger.warn('Failed to send cancellation SMS', { error: error.message });
    }
  }

  // =========================================================================
  // RETURN INITIATED HOOKS
  // =========================================================================
  if (newStatus === ORDER_STATUS.RETURN_INITIATED) {
    // Auto-create return ticket
    try {
      const { TicketService } = await import('./ticket.service.js');
      await TicketService.createTicket({
        type: 'return_request',
        priority: 'medium',
        subject: `Return Request - Order ${order.order_number}`,
        description: order.return_reason || 'Customer requested return',
        related_order_id: order.id,
        customer_id: order.customer_id,
        tags: ['return', 'auto_created'],
        channel: 'system',
      }, null);
      logger.info(`Return ticket created for order ${order.order_number}`);
    } catch (error) {
      logger.error('Failed to create return ticket', { error: error.message });
    }
  }

  // =========================================================================
  // OUT FOR DELIVERY HOOKS
  // =========================================================================
  if (newStatus === ORDER_STATUS.OUT_FOR_DELIVERY) {
    // Send "out for delivery" SMS
    try {
      const { SMSService } = await import('./sms/SMSService.js');
      if (order.customer?.phone) {
        await SMSService.send(
          order.customer.phone,
          `Good news! Your order ${order.order_number} is out for delivery and will reach you soon.`,
          { context: 'out_for_delivery', order_id: order.id }
        );
      }
    } catch (error) {
      logger.warn('Failed to send out-for-delivery SMS', { error: error.message });
    }
  }

  // =========================================================================
  // HANDOVER TO COURIER HOOKS
  // =========================================================================
  if (newStatus === ORDER_STATUS.HANDOVER_TO_COURIER) {
    // Send courier handover SMS with tracking info
    try {
      const { SMSService } = await import('./sms/SMSService.js');
      if (order.customer?.phone) {
        const trackingInfo = order.courier_tracking_id 
          ? ` Track: ${order.courier_tracking_id}` 
          : '';
        await SMSService.send(
          order.customer.phone,
          `Order ${order.order_number} has been handed to courier.${trackingInfo}`,
          { context: 'handover_courier', order_id: order.id }
        );
      }
    } catch (error) {
      logger.warn('Failed to send handover SMS', { error: error.message });
    }
  }
}

export default OrderStateMachine;
