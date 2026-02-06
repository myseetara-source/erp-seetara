/**
 * Order Workflow Rules Service
 * 
 * THE "TRAFFIC POLICE" - Enforces strict status transitions, role-based locking,
 * and inventory triggers for the order lifecycle.
 * 
 * ARCHITECTURE:
 * - WORKFLOW_RULES: Master transition map per fulfillment type
 * - ROLE_LOCKS: Which roles can update orders in specific states
 * - INVENTORY_TRIGGERS: When to deduct/restore stock
 * - DISPATCH_REQUIREMENTS: Required data for dispatch operations
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { createLogger } from '../../utils/logger.js';
import {
  ValidationError,
  ForbiddenError,
  InsufficientStockError,
} from '../../utils/errors.js';

const logger = createLogger('WorkflowRules');

// =============================================================================
// SECTION 1: MASTER WORKFLOW RULES (The State Machine)
// =============================================================================

/**
 * Master transition rules per fulfillment type
 * Format: { [currentStatus]: [allowedNextStatuses] }
 */
export const WORKFLOW_RULES = {
  // =========================================================================
  // INSIDE VALLEY FLOW (Own Riders)
  // =========================================================================
  inside_valley: {
    // Intake Phase
    'intake': ['follow_up', 'converted', 'cancelled'],
    'follow_up': ['follow_up', 'converted', 'hold', 'cancelled'],
    
    // Processing Phase - POINT OF NO RETURN for edits after 'packed'
    'converted': ['packed', 'hold', 'cancelled'],
    'hold': ['converted', 'packed', 'cancelled'],
    'packed': ['assigned', 'cancelled'],  // Must assign rider
    
    // Delivery Phase - RIDER LOCKED
    'assigned': ['out_for_delivery', 'packed', 'cancelled'],  // Rider can send out
    'out_for_delivery': ['delivered', 'rejected', 'return_initiated', 'assigned'],  // Field outcomes
    
    // Terminal & Return States
    'delivered': ['return_initiated'],  // Only returns allowed post-delivery
    'rejected': ['return_initiated', 'returned'],
    'return_initiated': ['returned'],
    'returned': [],  // End state
    'cancelled': [],  // End state
  },

  // =========================================================================
  // OUTSIDE VALLEY FLOW (3rd Party Couriers)
  // =========================================================================
  outside_valley: {
    // Intake Phase
    'intake': ['follow_up', 'converted', 'cancelled'],
    'follow_up': ['follow_up', 'converted', 'hold', 'cancelled'],
    
    // Processing Phase
    'converted': ['packed', 'hold', 'cancelled'],
    'hold': ['converted', 'packed', 'cancelled'],
    'packed': ['handover_to_courier', 'cancelled'],  // Must handover to courier
    
    // Courier Delivery Phase
    'handover_to_courier': ['in_transit', 'delivered', 'return_initiated'],
    'in_transit': ['delivered', 'return_initiated'],
    
    // Terminal & Return States
    'delivered': ['return_initiated'],
    'return_initiated': ['returned'],
    'returned': [],
    'cancelled': [],
  },

  // =========================================================================
  // STORE/POS FLOW (Walk-in Sales)
  // =========================================================================
  store: {
    'intake': ['converted', 'store_sale', 'cancelled'],
    'converted': ['packed', 'store_sale', 'cancelled'],
    'packed': ['store_sale', 'cancelled'],
    'store_sale': ['delivered'],  // Complete the sale
    'delivered': ['return_initiated'],
    'return_initiated': ['returned'],
    'returned': [],
    'cancelled': [],
  },
};

// =============================================================================
// SECTION 2: ROLE-BASED LOCKING RULES
// =============================================================================

/**
 * Role permissions for status updates
 * 
 * CRITICAL: The "Rider Lock Rule"
 * When order is 'assigned' or 'out_for_delivery', ONLY the assigned rider
 * (or admin) can update the status.
 */
export const ROLE_PERMISSIONS = {
  // Admin can do everything
  admin: {
    canUpdateAnyOrder: true,
    canBypassLocks: true,
    canCancelAnyOrder: true,
    canEditPackedOrders: true,
  },

  // Manager has most permissions
  manager: {
    canUpdateAnyOrder: true,
    canBypassLocks: false,  // Cannot bypass rider lock
    canCancelAnyOrder: true,
    canEditPackedOrders: false,
  },

  // Operator (Staff) - Standard permissions
  operator: {
    canUpdateAnyOrder: false,
    canBypassLocks: false,
    canCancelAnyOrder: false,
    canEditPackedOrders: false,
    // Specific allowed operations
    allowedTransitions: {
      'intake': ['follow_up', 'converted', 'cancelled'],
      'follow_up': ['follow_up', 'converted', 'hold', 'cancelled'],
      'converted': ['packed', 'hold', 'cancelled'],
      'hold': ['converted', 'packed', 'cancelled'],
      'packed': ['assigned', 'handover_to_courier', 'cancelled'],
    },
  },

  // Rider - Can only update their own assigned orders
  rider: {
    canUpdateAnyOrder: false,
    canBypassLocks: false,
    canCancelAnyOrder: false,
    canEditPackedOrders: false,
    // Riders can only update orders assigned to them
    mustBeAssignedRider: true,
    allowedTransitions: {
      'assigned': ['out_for_delivery'],
      'out_for_delivery': ['delivered', 'rejected', 'return_initiated'],
    },
  },

  // Viewer - Read only
  viewer: {
    canUpdateAnyOrder: false,
    canBypassLocks: false,
    canCancelAnyOrder: false,
    canEditPackedOrders: false,
    allowedTransitions: {},  // No transitions allowed
  },
};

/**
 * Status states that are "locked" to specific roles
 */
export const STATUS_LOCKS = {
  // Rider Lock: When order is with rider, only rider (or admin) can update
  'assigned': {
    lockedTo: 'rider',
    allowedRoles: ['rider', 'admin'],
    lockMessage: 'Order is assigned to rider. Only the assigned rider or admin can update status.',
    requiresAssignedUser: true,  // Must be the specific assigned rider
  },
  'out_for_delivery': {
    lockedTo: 'rider',
    allowedRoles: ['rider', 'admin'],
    lockMessage: 'Order is out for delivery. Only the assigned rider or admin can update status.',
    requiresAssignedUser: true,
  },

  // Courier Lock: When with courier, limited updates
  'handover_to_courier': {
    lockedTo: 'courier_system',
    allowedRoles: ['admin', 'manager'],
    lockMessage: 'Order is with courier. Updates require admin/manager approval.',
    requiresAssignedUser: false,
  },
  'in_transit': {
    lockedTo: 'courier_system',
    allowedRoles: ['admin', 'manager'],
    lockMessage: 'Order is in transit with courier. Updates require admin/manager approval.',
    requiresAssignedUser: false,
  },
};

// =============================================================================
// SECTION 3: INVENTORY TRIGGER POINTS
// =============================================================================

/**
 * Defines when stock operations should occur during status transitions
 */
export const INVENTORY_TRIGGERS = {
  // RESERVE stock when order is confirmed/converted
  'converted': {
    action: 'RESERVE',
    description: 'Reserve stock for confirmed order',
    mode: 'SOFT',  // Warn if insufficient, don't block
  },

  // DEDUCT stock when order is packed (point of no return)
  'packed': {
    action: 'DEDUCT',
    description: 'Deduct stock - order is being packed',
    mode: 'STRICT',  // Block if insufficient stock
    preCheck: true,  // Check stock BEFORE allowing transition
  },

  // RESTORE stock on cancellation
  'cancelled': {
    action: 'RESTORE',
    description: 'Restore stock for cancelled order',
    onlyFrom: ['converted', 'packed', 'hold'],  // Only restore if stock was reserved/deducted
  },

  // RESTORE stock on rejection
  'rejected': {
    action: 'RESTORE',
    description: 'Restore stock for rejected order',
    onlyFrom: ['out_for_delivery', 'assigned', 'in_transit'],
  },

  // RESTORE stock on return completion
  'returned': {
    action: 'RESTORE',
    description: 'Restore stock for returned order',
  },
};

// =============================================================================
// SECTION 4: DISPATCH REQUIREMENTS
// =============================================================================

/**
 * Required data for dispatch-related status transitions
 */
export const DISPATCH_REQUIREMENTS = {
  // Assigning to rider requires rider_id
  'assigned': {
    requiredFields: ['rider_id'],
    fulfillmentTypes: ['inside_valley'],
    errorMessage: 'Please select a rider to assign this order.',
    modalType: 'SELECT_RIDER',
  },

  // Handover to courier requires courier info
  'handover_to_courier': {
    requiredFields: ['courier_partner'],
    optionalFields: ['awb_number', 'tracking_url'],
    fulfillmentTypes: ['outside_valley'],
    errorMessage: 'Please select a courier partner and enter tracking details.',
    modalType: 'SELECT_COURIER',
  },

  // Follow-up - no required fields (reason and date are optional)
  'follow_up': {
    requiredFields: [],
    optionalFields: ['followup_reason', 'followup_date'],
    errorMessage: '',
    modalType: 'SCHEDULE_FOLLOWUP',
  },

  // Cancellation requires reason
  'cancelled': {
    requiredFields: ['cancellation_reason'],
    errorMessage: 'Please provide a cancellation reason.',
    modalType: 'CANCEL_ORDER',
  },

  // Rejection requires reason
  'rejected': {
    requiredFields: ['rejection_reason'],
    errorMessage: 'Please provide a rejection reason.',
    modalType: 'REJECT_ORDER',
  },

  // Return initiation requires reason
  'return_initiated': {
    requiredFields: ['return_reason'],
    errorMessage: 'Please provide a return reason.',
    modalType: 'INITIATE_RETURN',
  },
};

// =============================================================================
// SECTION 5: CORE VALIDATION FUNCTIONS
// =============================================================================

/**
 * The "Traffic Police" - Main validation function
 * 
 * Validates a status transition considering:
 * 1. Workflow rules (allowed transitions)
 * 2. Role-based locks
 * 3. Dispatch requirements
 * 4. Inventory availability (for 'packed')
 * 
 * @param {Object} order - Current order data
 * @param {string} newStatus - Desired new status
 * @param {Object} context - { userId, userRole, additionalData }
 * @returns {Object} { valid: boolean, error?: string, warnings?: string[], requires?: object }
 */
export async function validateTransition(order, newStatus, context = {}) {
  const { userId, userRole = 'operator', additionalData = {} } = context;
  const { status: currentStatus, fulfillment_type: fulfillmentType, rider_id: assignedRiderId } = order;

  logger.info('[WorkflowRules] Validating transition', {
    orderId: order.id,
    from: currentStatus,
    to: newStatus,
    fulfillmentType,
    userRole,
    userId,
  });

  const result = {
    valid: true,
    warnings: [],
    requires: null,
  };

  // =========================================================================
  // STEP 1: Check if transition is allowed by workflow rules
  // =========================================================================
  const allowedTransitions = getAllowedTransitions(currentStatus, fulfillmentType);
  
  if (!allowedTransitions.includes(newStatus)) {
    return {
      valid: false,
      error: `Invalid transition: Cannot move from '${currentStatus}' to '${newStatus}'. Allowed: [${allowedTransitions.join(', ')}]`,
      code: 'INVALID_TRANSITION',
    };
  }

  // =========================================================================
  // STEP 2: Check role-based locks (THE RIDER LOCK RULE)
  // =========================================================================
  const lockCheck = checkRoleLock(order, newStatus, context);
  if (!lockCheck.allowed) {
    return {
      valid: false,
      error: lockCheck.message,
      code: 'ACCESS_DENIED',
      isLocked: true,
      lockedBy: lockCheck.lockedTo,
    };
  }

  // =========================================================================
  // STEP 3: Check dispatch requirements
  // =========================================================================
  const dispatchReq = DISPATCH_REQUIREMENTS[newStatus];
  if (dispatchReq) {
    // Check fulfillment type restriction
    if (dispatchReq.fulfillmentTypes && !dispatchReq.fulfillmentTypes.includes(fulfillmentType)) {
      return {
        valid: false,
        error: `Status '${newStatus}' is not valid for ${fulfillmentType} orders.`,
        code: 'INVALID_STATUS_FOR_FULFILLMENT',
      };
    }

    // Check required fields
    const missingFields = [];
    for (const field of dispatchReq.requiredFields || []) {
      const value = additionalData[field] || order[field];
      if (!value) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return {
        valid: false,
        error: dispatchReq.errorMessage || `Missing required fields: ${missingFields.join(', ')}`,
        code: 'MISSING_REQUIRED_FIELDS',
        requires: {
          fields: missingFields,
          modalType: dispatchReq.modalType,
        },
      };
    }
  }

  // =========================================================================
  // STEP 4: Check inventory for 'packed' transition (STOCK DEDUCTION)
  // =========================================================================
  if (newStatus === 'packed') {
    const stockCheck = await checkStockForPacking(order);
    if (!stockCheck.sufficient) {
      return {
        valid: false,
        error: stockCheck.message,
        code: 'INSUFFICIENT_STOCK',
        insufficientItems: stockCheck.items,
      };
    }
    if (stockCheck.warnings.length > 0) {
      result.warnings.push(...stockCheck.warnings);
    }
  }

  // =========================================================================
  // STEP 5: All checks passed
  // =========================================================================
  logger.info('[WorkflowRules] ✅ Transition validated', {
    orderId: order.id,
    from: currentStatus,
    to: newStatus,
    warnings: result.warnings,
  });

  return result;
}

/**
 * Get allowed transitions for a status and fulfillment type
 */
export function getAllowedTransitions(currentStatus, fulfillmentType = 'inside_valley') {
  const rules = WORKFLOW_RULES[fulfillmentType] || WORKFLOW_RULES.inside_valley;
  return rules[currentStatus] || [];
}

/**
 * Check role-based locks
 */
export function checkRoleLock(order, newStatus, context) {
  const { userId, userRole = 'operator' } = context;
  const { status: currentStatus, rider_id: assignedRiderId } = order;
  
  // Admin can bypass all locks
  const rolePerms = ROLE_PERMISSIONS[userRole];
  if (rolePerms?.canBypassLocks) {
    return { allowed: true };
  }

  // Check if current status is locked
  const statusLock = STATUS_LOCKS[currentStatus];
  if (statusLock) {
    // Check if user's role is in allowed roles
    if (!statusLock.allowedRoles.includes(userRole)) {
      return {
        allowed: false,
        message: statusLock.lockMessage,
        lockedTo: statusLock.lockedTo,
      };
    }

    // For rider lock, check if user is the assigned rider
    if (statusLock.requiresAssignedUser && userRole === 'rider') {
      if (assignedRiderId && userId !== assignedRiderId) {
        return {
          allowed: false,
          message: 'Access Denied: This order is assigned to a different rider.',
          lockedTo: 'specific_rider',
        };
      }
    }
  }

  // Check role-specific allowed transitions
  if (rolePerms?.allowedTransitions) {
    const allowed = rolePerms.allowedTransitions[currentStatus] || [];
    if (allowed.length > 0 && !allowed.includes(newStatus)) {
      return {
        allowed: false,
        message: `Your role (${userRole}) cannot transition orders from '${currentStatus}' to '${newStatus}'.`,
        lockedTo: 'role_restriction',
      };
    }
  }

  return { allowed: true };
}

/**
 * Check stock availability before packing
 */
async function checkStockForPacking(order) {
  const result = {
    sufficient: true,
    items: [],
    warnings: [],
    message: '',
  };

  try {
    // Get order items with variant stock info
    const { data: items, error } = await supabaseAdmin
      .from('order_items')
      .select(`
        id, variant_id, quantity, sku, product_name,
        variant:product_variants(
          id, sku, current_stock, reserved_stock
        )
      `)
      .eq('order_id', order.id);

    if (error) {
      logger.error('[WorkflowRules] Failed to fetch order items for stock check', { error });
      // Don't block on DB error, just warn
      result.warnings.push('Could not verify stock levels. Proceeding anyway.');
      return result;
    }

    // Check each item
    for (const item of items || []) {
      const variant = item.variant;
      if (!variant) continue;

      const available = (variant.current_stock || 0) - (variant.reserved_stock || 0);
      const needed = item.quantity;

      if (available < needed) {
        result.sufficient = false;
        result.items.push({
          sku: item.sku || variant.sku,
          product_name: item.product_name,
          needed,
          available,
          shortage: needed - available,
        });
      }
    }

    if (!result.sufficient) {
      const itemList = result.items.map(i => `${i.sku} (need ${i.needed}, have ${i.available})`).join(', ');
      result.message = `Cannot Pack: Insufficient stock for: ${itemList}`;
    }

  } catch (err) {
    logger.error('[WorkflowRules] Stock check error', { error: err });
    result.warnings.push('Stock check encountered an error. Proceeding with caution.');
  }

  return result;
}

// =============================================================================
// SECTION 6: INVENTORY OPERATIONS
// =============================================================================

/**
 * Execute inventory trigger for a status transition
 * Called AFTER the status is updated successfully
 */
export async function executeInventoryTrigger(order, oldStatus, newStatus, context = {}) {
  const trigger = INVENTORY_TRIGGERS[newStatus];
  
  if (!trigger) {
    logger.debug('[WorkflowRules] No inventory trigger for status', { newStatus });
    return { success: true, action: 'NONE' };
  }

  // Check if trigger only applies from certain statuses
  if (trigger.onlyFrom && !trigger.onlyFrom.includes(oldStatus)) {
    logger.debug('[WorkflowRules] Inventory trigger skipped - not applicable from this status', {
      newStatus,
      oldStatus,
      onlyFrom: trigger.onlyFrom,
    });
    return { success: true, action: 'SKIPPED', reason: 'Not applicable from previous status' };
  }

  logger.info('[WorkflowRules] Executing inventory trigger', {
    orderId: order.id,
    action: trigger.action,
    from: oldStatus,
    to: newStatus,
  });

  try {
    switch (trigger.action) {
      case 'DEDUCT':
        return await deductStockForOrder(order, context);
      case 'RESTORE':
        return await restoreStockForOrder(order, context);
      case 'RESERVE':
        return await reserveStockForOrder(order, context);
      default:
        return { success: true, action: 'UNKNOWN' };
    }
  } catch (error) {
    logger.error('[WorkflowRules] Inventory trigger failed', {
      orderId: order.id,
      action: trigger.action,
      error: error.message,
    });
    // Don't fail the transition, just log the error
    return { success: false, action: trigger.action, error: error.message };
  }
}

/**
 * Deduct stock for order items (on 'packed')
 */
async function deductStockForOrder(order, context = {}) {
  const { userId } = context;

  // Get order items
  const { data: items, error: itemsError } = await supabaseAdmin
    .from('order_items')
    .select('variant_id, quantity, sku, product_name')
    .eq('order_id', order.id);

  if (itemsError || !items || items.length === 0) {
    return { success: false, error: 'No items found for order' };
  }

  // Deduct stock for each item
  const results = [];
  for (const item of items) {
    // Get current stock
    const { data: variant, error: varError } = await supabaseAdmin
      .from('product_variants')
      .select('current_stock, reserved_stock')
      .eq('id', item.variant_id)
      .single();

    if (varError || !variant) continue;

    const newStock = Math.max(0, (variant.current_stock || 0) - item.quantity);

    // Update stock
    const { error: updateError } = await supabaseAdmin
      .from('product_variants')
      .update({ 
        current_stock: newStock,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.variant_id);

    if (updateError) {
      logger.error('[WorkflowRules] Failed to deduct stock', { 
        variant_id: item.variant_id, 
        error: updateError 
      });
    } else {
      // Log stock movement
      await supabaseAdmin.from('stock_movements').insert({
        variant_id: item.variant_id,
        movement_type: 'SALE',
        quantity: -item.quantity,
        balance_before: variant.current_stock,
        balance_after: newStock,
        order_id: order.id,
        source: 'order_packed',
        reason: `Order ${order.order_number || order.readable_id} packed`,
        created_by: userId,
      });

      results.push({ variant_id: item.variant_id, deducted: item.quantity });
    }
  }

  logger.info('[WorkflowRules] ✅ Stock deducted for order', {
    orderId: order.id,
    itemsDeducted: results.length,
  });

  return { success: true, action: 'DEDUCT', results };
}

/**
 * Restore stock for order items (on 'cancelled', 'returned', etc.)
 */
async function restoreStockForOrder(order, context = {}) {
  const { userId } = context;

  // Get order items
  const { data: items, error: itemsError } = await supabaseAdmin
    .from('order_items')
    .select('variant_id, quantity, sku, product_name')
    .eq('order_id', order.id);

  if (itemsError || !items || items.length === 0) {
    return { success: false, error: 'No items found for order' };
  }

  // Restore stock for each item
  const results = [];
  for (const item of items) {
    // Get current stock
    const { data: variant, error: varError } = await supabaseAdmin
      .from('product_variants')
      .select('current_stock')
      .eq('id', item.variant_id)
      .single();

    if (varError || !variant) continue;

    const newStock = (variant.current_stock || 0) + item.quantity;

    // Update stock
    const { error: updateError } = await supabaseAdmin
      .from('product_variants')
      .update({ 
        current_stock: newStock,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.variant_id);

    if (updateError) {
      logger.error('[WorkflowRules] Failed to restore stock', { 
        variant_id: item.variant_id, 
        error: updateError 
      });
    } else {
      // Log stock movement
      await supabaseAdmin.from('stock_movements').insert({
        variant_id: item.variant_id,
        movement_type: 'RETURN',
        quantity: item.quantity,
        balance_before: variant.current_stock,
        balance_after: newStock,
        order_id: order.id,
        source: 'order_cancelled_or_returned',
        reason: `Order ${order.order_number || order.readable_id} cancelled/returned`,
        created_by: userId,
      });

      results.push({ variant_id: item.variant_id, restored: item.quantity });
    }
  }

  logger.info('[WorkflowRules] ✅ Stock restored for order', {
    orderId: order.id,
    itemsRestored: results.length,
  });

  return { success: true, action: 'RESTORE', results };
}

/**
 * Reserve stock for order items (on 'converted')
 * This is a soft reservation - just tracks it, doesn't block other orders
 */
async function reserveStockForOrder(order, context = {}) {
  // For now, just log the reservation
  // Actual reservation logic can be implemented with reserved_stock column
  logger.info('[WorkflowRules] Stock reservation noted', {
    orderId: order.id,
    action: 'RESERVE',
  });
  return { success: true, action: 'RESERVE' };
}

// =============================================================================
// SECTION 7: FRONTEND HELPER EXPORTS
// =============================================================================

/**
 * Get UI-friendly workflow info for frontend
 * This is used to render the StatusPopover correctly
 */
export function getWorkflowInfoForUI(currentStatus, fulfillmentType, userRole, assignedRiderId, currentUserId) {
  const allowed = getAllowedTransitions(currentStatus, fulfillmentType);
  
  // Check if current status is locked
  const statusLock = STATUS_LOCKS[currentStatus];
  let isLocked = false;
  let lockMessage = null;
  let canUpdate = true;

  if (statusLock) {
    // Check if user can update
    if (!statusLock.allowedRoles.includes(userRole)) {
      isLocked = true;
      lockMessage = statusLock.lockMessage;
      canUpdate = false;
    } else if (statusLock.requiresAssignedUser && userRole === 'rider') {
      if (assignedRiderId && currentUserId !== assignedRiderId) {
        isLocked = true;
        lockMessage = 'This order is assigned to a different rider.';
        canUpdate = false;
      }
    }
  }

  // Admin bypass
  if (ROLE_PERMISSIONS[userRole]?.canBypassLocks) {
    isLocked = false;
    canUpdate = true;
    lockMessage = null;
  }

  // Get modal requirements for transitions
  const transitionRequirements = {};
  for (const status of allowed) {
    if (DISPATCH_REQUIREMENTS[status]) {
      transitionRequirements[status] = DISPATCH_REQUIREMENTS[status];
    }
  }

  return {
    currentStatus,
    fulfillmentType,
    allowedTransitions: allowed,
    isLocked,
    lockMessage,
    canUpdate,
    transitionRequirements,
  };
}

// =============================================================================
// EXPORT DEFAULT
// =============================================================================

export default {
  WORKFLOW_RULES,
  ROLE_PERMISSIONS,
  STATUS_LOCKS,
  INVENTORY_TRIGGERS,
  DISPATCH_REQUIREMENTS,
  validateTransition,
  getAllowedTransitions,
  checkRoleLock,
  executeInventoryTrigger,
  getWorkflowInfoForUI,
};
