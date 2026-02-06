/**
 * Activity Logger Service
 * 
 * Handles order activity logging for audit trail:
 * - System logs (auto-generated: status changes, inventory updates)
 * - User comments (manual: staff notes, internal remarks)
 * - Exchange links (parent-child relationship logs)
 * 
 * Every order action is recorded with WHO made it (user tracking)
 */

import { supabaseAdmin } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ActivityLogger');

/**
 * Activity Types
 */
export const ACTIVITY_TYPES = {
  SYSTEM_LOG: 'system_log',      // Auto-generated system events
  STATUS_CHANGE: 'status_change', // Order status transitions
  COMMENT: 'comment',             // User-added comments/notes
  EXCHANGE_LINK: 'exchange_link', // Parent-child order linking
  INVENTORY: 'inventory',         // Stock movements
  FIELD_CHANGE: 'field_change',   // Field value changes (name, phone, address, etc.)
  ITEM_CHANGE: 'item_change',     // Order item changes (add, remove, quantity)
  ROUTING_CHANGE: 'routing_change', // Zone, branch, fulfillment type changes
  ASSIGNMENT: 'assignment',       // Rider assignment changes
};

/**
 * Field display names for user-friendly messages
 */
const FIELD_LABELS = {
  shipping_name: 'Customer Name',
  shipping_phone: 'Phone',
  alt_phone: 'Alt Phone',
  shipping_address: 'Address',
  shipping_city: 'City',
  shipping_state: 'State',
  shipping_pincode: 'PIN Code',
  remarks: 'Remarks',
  staff_remarks: 'Staff Remarks',
  zone_code: 'Zone',
  destination_branch: 'Branch',
  fulfillment_type: 'Fulfillment Type',
  discount: 'Discount',
  shipping_cost: 'Shipping',
  paid_amount: 'Advance Payment',
  total_amount: 'Total Amount',
  status: 'Status',
  rider_id: 'Rider',
};

/**
 * Extract user info from request user object
 * Returns standardized user data for logging
 * 
 * User display logic:
 * - System: Shows "System"
 * - Riders: Shows "Name - Rider"
 * - Others (admin, operator): Shows just "Name"
 */
const extractUserInfo = (user) => {
  if (!user) {
    return {
      userId: null,
      userName: 'System',
      userRole: 'system',
    };
  }

  // Get role from various possible locations
  const role = user.role || user.app_metadata?.role || 'operator';
  
  // Get name from various possible locations (priority order)
  let name = user.name                          // From public.users table (most common)
           || user.user_metadata?.full_name     // From Supabase auth metadata
           || user.user_metadata?.name          // Alternative metadata field
           || user.email?.split('@')[0]         // Fallback to email prefix
           || 'Unknown';

  // For riders, append "- Rider" suffix
  // For others, show just the name (no role suffix)
  const displayName = role === 'rider' ? `${name} - Rider` : name;

  return {
    userId: user.id || null,
    userName: displayName,
    userRole: role,
  };
};

/**
 * Log an activity for an order
 * 
 * @param {object} supabase - Supabase client (or use admin)
 * @param {object} params - Activity parameters
 * @param {string} params.orderId - Order UUID (required)
 * @param {object} params.user - User object from req.user (optional, null = System)
 * @param {string} params.message - Activity message (required)
 * @param {string} params.type - Activity type (default: 'system_log')
 * @param {object} params.metadata - Extra data (optional)
 * @returns {Promise<{success: boolean, activityId?: string, error?: string}>}
 */
export const logActivity = async (supabase, { orderId, user, message, type = ACTIVITY_TYPES.SYSTEM_LOG, metadata = {} }) => {
  try {
    // Validate required fields
    if (!orderId) {
      logger.warn('[logActivity] Missing orderId');
      return { success: false, error: 'orderId is required' };
    }
    if (!message) {
      logger.warn('[logActivity] Missing message');
      return { success: false, error: 'message is required' };
    }

    // Extract user info
    const { userId, userName, userRole } = extractUserInfo(user);

    // Use provided supabase client or fallback to admin
    const client = supabase || supabaseAdmin;

    const { data, error } = await client
      .from('order_activities')
      .insert({
        order_id: orderId,
        user_id: userId,
        user_name: userName,
        user_role: userRole,
        activity_type: type,
        message: message,
        metadata: metadata,
      })
      .select('id')
      .single();

    if (error) {
      logger.error('[logActivity] Failed to log activity', { 
        error: error.message,
        orderId,
        type,
      });
      return { success: false, error: error.message };
    }

    logger.debug('[logActivity] Activity logged', { 
      activityId: data?.id,
      orderId,
      type,
      userName,
    });

    return { success: true, activityId: data?.id };
  } catch (err) {
    logger.error('[logActivity] Exception', { error: err.message });
    return { success: false, error: err.message };
  }
};

/**
 * Log a status change activity
 * Convenience wrapper for status transitions
 * Message format: "UserName updated status from X to Y"
 */
export const logStatusChange = async (supabase, { orderId, user, oldStatus, newStatus, reason }) => {
  // Get user name for display
  const userName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Unknown';
  
  const message = reason 
    ? `${userName} updated status from ${oldStatus} to ${newStatus}: ${reason}`
    : `${userName} updated status from ${oldStatus} to ${newStatus}`;

  return logActivity(supabase, {
    orderId,
    user,
    message,
    type: ACTIVITY_TYPES.STATUS_CHANGE,
    metadata: { old_status: oldStatus, new_status: newStatus, reason },
  });
};

/**
 * Log a user comment
 * For manual notes added by staff
 */
export const logComment = async (supabase, { orderId, user, comment }) => {
  if (!user) {
    logger.warn('[logComment] User required for comments');
    return { success: false, error: 'User is required for comments' };
  }

  return logActivity(supabase, {
    orderId,
    user,
    message: comment,
    type: ACTIVITY_TYPES.COMMENT,
    metadata: {},
  });
};

/**
 * Log field changes with before/after values
 * Creates detailed activity log for each changed field
 * 
 * @param {object} supabase - Supabase client
 * @param {object} params - Parameters
 * @param {string} params.orderId - Order UUID
 * @param {object} params.user - User object from req.user
 * @param {object} params.oldValues - Object with old field values
 * @param {object} params.newValues - Object with new field values
 * @param {string} params.category - Category of change (customer_info, routing, financial, etc.)
 */
export const logFieldChanges = async (supabase, { orderId, user, oldValues, newValues, category = 'general' }) => {
  if (!orderId || !oldValues || !newValues) {
    logger.warn('[logFieldChanges] Missing required params');
    return { success: false, error: 'Missing required parameters' };
  }

  const changes = [];
  const changedFields = [];

  // Compare old and new values
  for (const [field, newValue] of Object.entries(newValues)) {
    if (field === 'updated_at') continue; // Skip timestamp

    const oldValue = oldValues[field];
    
    // Check if value actually changed
    if (oldValue !== newValue) {
      const label = FIELD_LABELS[field] || field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      
      changes.push({
        field,
        label,
        old_value: oldValue ?? null,
        new_value: newValue ?? null,
      });
      
      // Build human-readable change description
      const oldDisplay = oldValue || '(empty)';
      const newDisplay = newValue || '(empty)';
      changedFields.push(`${label}: "${oldDisplay}" → "${newDisplay}"`);
    }
  }

  if (changes.length === 0) {
    return { success: true, message: 'No changes detected' };
  }

  // Get user name for display
  const userName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'System';

  // Create activity log message
  const message = `${userName} updated ${changedFields.join(', ')}`;

  return logActivity(supabase, {
    orderId,
    user,
    message,
    type: ACTIVITY_TYPES.FIELD_CHANGE,
    metadata: {
      category,
      changes,
      changed_fields: Object.keys(newValues).filter(k => k !== 'updated_at' && oldValues[k] !== newValues[k]),
    },
  });
};

/**
 * Log item changes (add, remove, quantity update)
 */
export const logItemChange = async (supabase, { orderId, user, action, items, details = {} }) => {
  const userName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'System';
  
  let message = '';
  switch (action) {
    case 'add':
      message = `${userName} added ${items.length} item(s) to order`;
      break;
    case 'remove':
      message = `${userName} removed ${items.length} item(s) from order`;
      break;
    case 'update_quantity':
      message = `${userName} updated item quantities`;
      break;
    default:
      message = `${userName} modified order items`;
  }

  return logActivity(supabase, {
    orderId,
    user,
    message,
    type: ACTIVITY_TYPES.ITEM_CHANGE,
    metadata: {
      action,
      items: items.map(item => ({
        product_name: item.product_name,
        variant_name: item.variant_name,
        sku: item.sku,
        old_quantity: item.old_quantity,
        new_quantity: item.new_quantity,
      })),
      ...details,
    },
  });
};

/**
 * Log routing changes (zone, branch, fulfillment type)
 */
export const logRoutingChange = async (supabase, { orderId, user, oldValues, newValues }) => {
  return logFieldChanges(supabase, {
    orderId,
    user,
    oldValues,
    newValues,
    category: 'routing',
  });
};

/**
 * Log assignment changes (rider assignment)
 */
export const logAssignment = async (supabase, { orderId, user, riderName, riderPhone, action = 'assigned' }) => {
  const userName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'System';
  
  const message = action === 'unassigned'
    ? `${userName} unassigned rider from order`
    : `${userName} assigned order to ${riderName}`;

  return logActivity(supabase, {
    orderId,
    user,
    message,
    type: ACTIVITY_TYPES.ASSIGNMENT,
    metadata: {
      action,
      rider_name: riderName,
      rider_phone: riderPhone,
    },
  });
};

/**
 * Log order creation
 */
export const logOrderCreated = async (supabase, { orderId, user, source, customerName, totalAmount, itemCount }) => {
  const userName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'System';
  
  const message = `${userName} created the order`;

  return logActivity(supabase, {
    orderId,
    user,
    message,
    type: ACTIVITY_TYPES.SYSTEM_LOG,
    metadata: {
      action: 'created',
      source,
      customer_name: customerName,
      total_amount: totalAmount,
      item_count: itemCount,
    },
  });
};

/**
 * Log pack/unpack action
 */
export const logPackAction = async (supabase, { orderId, user, action = 'packed' }) => {
  const userName = user?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'System';
  
  const message = action === 'unpacked'
    ? `${userName} unpacked the order`
    : `${userName} packed the order`;

  return logActivity(supabase, {
    orderId,
    user,
    message,
    type: ACTIVITY_TYPES.STATUS_CHANGE,
    metadata: { action },
  });
};

/**
 * Log exchange/refund relationship
 * Links parent and child orders in activity log
 */
export const logExchangeLink = async (supabase, { parentOrderId, childOrderId, parentReadableId, childReadableId, transactionType, user }) => {
  const results = [];

  // Log in child order
  const childLog = await logActivity(supabase, {
    orderId: childOrderId,
    user,
    message: `${transactionType === 'refund' ? 'Refund' : 'Exchange'} order created from Parent #${parentReadableId}`,
    type: ACTIVITY_TYPES.EXCHANGE_LINK,
    metadata: { parent_order_id: parentOrderId, parent_readable_id: parentReadableId, link_type: 'child' },
  });
  results.push({ target: 'child', ...childLog });

  // Log in parent order
  const parentLog = await logActivity(supabase, {
    orderId: parentOrderId,
    user,
    message: `Items ${transactionType === 'refund' ? 'refunded' : 'exchanged'}. Created ${transactionType === 'refund' ? 'Refund' : 'Exchange'} Order #${childReadableId}`,
    type: ACTIVITY_TYPES.EXCHANGE_LINK,
    metadata: { child_order_id: childOrderId, child_readable_id: childReadableId, link_type: 'parent' },
  });
  results.push({ target: 'parent', ...parentLog });

  return results;
};

/**
 * Get activities for an order
 * Returns timeline of all activities
 */
export const getOrderActivities = async (supabase, orderId, options = {}) => {
  const { limit = 50, offset = 0, types = null } = options;

  try {
    const client = supabase || supabaseAdmin;
    
    let query = client
      .from('order_activities')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by activity types if provided
    if (types && Array.isArray(types) && types.length > 0) {
      query = query.in('activity_type', types);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('[getOrderActivities] Failed to fetch', { error: error.message, orderId });
      throw new Error(error.message);
    }

    return {
      activities: data || [],
      total: count || data?.length || 0,
    };
  } catch (err) {
    logger.error('[getOrderActivities] Exception', { error: err.message });
    throw err;
  }
};

/**
 * Get related orders (parent and children)
 * For exchange/refund order linking display
 * 
 * Enhanced Logic:
 * - Calculates returned items vs new items from child orders
 * - Determines proper exchange_type based on item analysis
 * - Returns return_items array for display
 */
export const getRelatedOrders = async (supabase, orderId) => {
  try {
    const client = supabase || supabaseAdmin;

    // Get the current order with its items
    const { data: currentOrder, error: currentError } = await client
      .from('orders')
      .select(`
        id, readable_id, parent_order_id, total_amount, status,
        items:order_items(id, quantity, product_name, variant_name, sku, unit_price)
      `)
      .eq('id', orderId)
      .single();

    if (currentError) {
      throw new Error(currentError.message);
    }

    let parentOrder = null;
    let childOrders = [];
    let returnedItems = [];  // Items that were returned (for parent orders)
    let exchangeSummary = null;

    // If this order has a parent, fetch it with items
    if (currentOrder.parent_order_id) {
      const { data: parent, error: parentError } = await client
        .from('orders')
        .select(`
          id, readable_id, total_amount, status, created_at,
          items:order_items(id, quantity, product_name, variant_name, sku, unit_price)
        `)
        .eq('id', currentOrder.parent_order_id)
        .single();

      if (!parentError && parent) {
        parentOrder = {
          ...parent,
          item_count: parent.items?.length || 0,
        };
      }
    }

    // Find any child orders (orders where parent_order_id = this order)
    const { data: children, error: childError } = await client
      .from('orders')
      .select(`
        id, readable_id, total_amount, status, created_at,
        items:order_items(id, quantity, product_name, variant_name, sku, unit_price)
      `)
      .eq('parent_order_id', orderId)
      .order('created_at', { ascending: false });

    if (!childError && children && children.length > 0) {
      // Analyze child orders to determine exchange type
      let totalReturnedItems = 0;
      let totalNewItems = 0;
      let totalReturnAmount = 0;
      let totalNewAmount = 0;

      children.forEach(child => {
        const items = child.items || [];
        items.forEach(item => {
          if (item.quantity < 0) {
            // Returned item
            totalReturnedItems += Math.abs(item.quantity);
            totalReturnAmount += Math.abs(item.quantity * item.unit_price);
            returnedItems.push({
              ...item,
              child_order_id: child.id,
              child_readable_id: child.readable_id,
            });
          } else if (item.quantity > 0) {
            // New item in exchange
            totalNewItems += item.quantity;
            totalNewAmount += item.quantity * item.unit_price;
          }
        });
      });

      // Parent order item count
      const parentItemCount = currentOrder.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

      // Calculate exchange summary
      exchangeSummary = {
        parent_total_items: parentItemCount,
        returned_items_count: totalReturnedItems,
        new_items_count: totalNewItems,
        return_amount: totalReturnAmount,
        new_amount: totalNewAmount,
        net_amount: totalNewAmount - totalReturnAmount,
        // Determine exchange type
        is_full_return: totalReturnedItems >= parentItemCount,
        is_partial_return: totalReturnedItems > 0 && totalReturnedItems < parentItemCount,
        has_new_items: totalNewItems > 0,
      };

      // Determine exchange_type for each child
      childOrders = children.map(child => {
        const items = child.items || [];
        const childReturnItems = items.filter(i => i.quantity < 0).length;
        const childNewItems = items.filter(i => i.quantity > 0).length;
        
        let exchange_type = 'exchange';
        if (childReturnItems > 0 && childNewItems === 0) {
          exchange_type = 'refund';
        } else if (childReturnItems > 0 && childNewItems > 0) {
          exchange_type = 'exchange';
        }

        return {
          id: child.id,
          readable_id: child.readable_id,
          total_amount: child.total_amount,
          status: child.status,
          created_at: child.created_at,
          exchange_type,
          return_items_count: childReturnItems,
          new_items_count: childNewItems,
        };
      });
    }

    return {
      parent: parentOrder,
      children: childOrders,
      hasRelated: !!(parentOrder || childOrders.length > 0),
      returnedItems: returnedItems,  // Items returned from parent
      exchangeSummary: exchangeSummary,  // Summary for UI display
    };
  } catch (err) {
    logger.error('[getRelatedOrders] Exception', { error: err.message });
    throw err;
  }
};

export default {
  ACTIVITY_TYPES,
  logActivity,
  logStatusChange,
  logComment,
  logExchangeLink,
  logFieldChanges,
  logItemChange,
  logRoutingChange,
  logAssignment,
  logOrderCreated,
  logPackAction,
  getOrderActivities,
  getRelatedOrders,
};
