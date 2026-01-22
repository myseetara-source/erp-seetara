/**
 * Ticket Service - The Automation Engine
 * 
 * Handles all ticket operations including:
 * - Ticket CRUD operations
 * - Automatic ticket number generation
 * - Post-delivery feedback automation
 * - SLA monitoring
 * - Assignment and escalation logic
 * 
 * @module services/ticket.service
 */

import { supabase, supabaseAdmin } from '../config/supabase.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { SMSService } from './sms/SMSService.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TICKET_TYPES = {
  ISSUE: 'issue',
  TASK: 'task',
  FEEDBACK: 'feedback',
  VENDOR_DISPUTE: 'vendor_dispute',
  RETURN_REQUEST: 'return_request',
  INQUIRY: 'inquiry',
};

const TICKET_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

const TICKET_STATUSES = {
  OPEN: 'open',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  ESCALATED: 'escalated',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};

// SLA times in hours
const SLA_HOURS = {
  [TICKET_PRIORITIES.URGENT]: 2,
  [TICKET_PRIORITIES.HIGH]: 8,
  [TICKET_PRIORITIES.MEDIUM]: 24,
  [TICKET_PRIORITIES.LOW]: 72,
};

// =============================================================================
// TICKET CRUD
// =============================================================================

/**
 * Create a new ticket
 * 
 * @param {Object} data - Ticket data
 * @param {string} userId - Creating user ID
 * @returns {Object} Created ticket
 */
async function createTicket(data, userId) {
  const {
    type = TICKET_TYPES.ISSUE,
    priority = TICKET_PRIORITIES.MEDIUM,
    subject,
    description,
    related_order_id,
    customer_id,
    vendor_id,
    product_id,
    assigned_to,
    tags = [],
    channel = 'dashboard',
    metadata = {},
  } = data;

  // Calculate due date based on priority
  const dueDate = new Date();
  dueDate.setHours(dueDate.getHours() + SLA_HOURS[priority]);

  const ticketData = {
    type,
    priority,
    status: TICKET_STATUSES.OPEN,
    subject,
    description,
    related_order_id,
    customer_id,
    vendor_id,
    product_id,
    assigned_to,
    assigned_at: assigned_to ? new Date().toISOString() : null,
    assigned_by: assigned_to ? userId : null,
    tags,
    channel,
    metadata,
    due_date: dueDate.toISOString(),
    created_by: userId,
  };

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .insert(ticketData)
    .select(`
      *,
      customer:customers(id, name, phone),
      vendor:vendors(id, name, company_name),
      order:orders(id, order_number, status),
      assignee:users!tickets_assigned_to_fkey(id, name, email)
    `)
    .single();

  if (error) {
    logger.error('Failed to create ticket:', error);
    throw new BadRequestError('Failed to create ticket: ' + error.message);
  }

  // Log activity
  await logActivity(ticket.id, 'created', null, { status: ticket.status, priority: ticket.priority }, userId);

  // If assigned, log assignment
  if (assigned_to) {
    await logActivity(ticket.id, 'assigned', null, { assigned_to }, userId);
  }

  logger.info(`Ticket ${ticket.ticket_number} created`, { type, priority, customer_id });

  return ticket;
}

/**
 * Get ticket by ID with all relations
 * 
 * @param {string} ticketId - Ticket UUID
 * @returns {Object} Ticket with relations
 */
async function getTicketById(ticketId) {
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select(`
      *,
      customer:customers(id, name, phone, email, address),
      vendor:vendors(id, name, company_name, phone),
      order:orders(
        id, 
        order_number, 
        status, 
        fulfillment_type,
        total_amount,
        created_at,
        items:order_items(
          id,
          quantity,
          unit_price,
          variant:product_variants(
            id,
            sku,
            product:products(id, name)
          )
        )
      ),
      product:products(id, name, brand),
      assignee:users!tickets_assigned_to_fkey(id, name, email, role),
      escalated_user:users!tickets_escalated_to_fkey(id, name),
      resolved_user:users!tickets_resolved_by_fkey(id, name),
      created_user:users!tickets_created_by_fkey(id, name),
      messages:ticket_messages(
        id,
        message,
        source,
        sender_name,
        attachments,
        is_internal,
        created_at,
        sender:users!ticket_messages_sender_id_fkey(id, name, role)
      )
    `)
    .eq('id', ticketId)
    .order('created_at', { foreignTable: 'ticket_messages', ascending: true })
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('Ticket not found');
    }
    throw error;
  }

  return ticket;
}

/**
 * List tickets with filters
 * 
 * @param {Object} filters - Query filters
 * @param {Object} options - Pagination options
 * @returns {Object} { tickets, total, page, limit }
 */
async function listTickets(filters = {}, options = {}) {
  const {
    status,
    priority,
    type,
    assigned_to,
    unassigned,
    customer_id,
    vendor_id,
    order_id,
    search,
    tags,
    sla_breached,
    date_from,
    date_to,
  } = filters;

  const {
    page = 1,
    limit = 20,
    sort_by = 'created_at',
    sort_order = 'desc',
  } = options;

  let query = supabase
    .from('tickets')
    .select(`
      *,
      customer:customers(id, name, phone),
      vendor:vendors(id, name),
      order:orders(id, order_number),
      assignee:users!tickets_assigned_to_fkey(id, name, role)
    `, { count: 'exact' });

  // Apply filters
  if (status) {
    if (Array.isArray(status)) {
      query = query.in('status', status);
    } else {
      query = query.eq('status', status);
    }
  }

  if (priority) {
    query = query.eq('priority', priority);
  }

  if (type) {
    query = query.eq('type', type);
  }

  if (assigned_to) {
    query = query.eq('assigned_to', assigned_to);
  }

  if (unassigned === true) {
    query = query.is('assigned_to', null);
  }

  if (customer_id) {
    query = query.eq('customer_id', customer_id);
  }

  if (vendor_id) {
    query = query.eq('vendor_id', vendor_id);
  }

  if (order_id) {
    query = query.eq('related_order_id', order_id);
  }

  if (search) {
    query = query.or(`ticket_number.ilike.%${search}%,subject.ilike.%${search}%`);
  }

  if (tags && tags.length > 0) {
    query = query.overlaps('tags', tags);
  }

  if (sla_breached !== undefined) {
    query = query.eq('sla_breached', sla_breached);
  }

  if (date_from) {
    query = query.gte('created_at', date_from);
  }

  if (date_to) {
    query = query.lte('created_at', date_to);
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query
    .order(sort_by, { ascending: sort_order === 'asc' })
    .range(from, to);

  const { data: tickets, error, count } = await query;

  if (error) {
    logger.error('Failed to list tickets:', error);
    throw error;
  }

  return {
    tickets,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

/**
 * Update ticket
 * 
 * @param {string} ticketId - Ticket UUID
 * @param {Object} updates - Fields to update
 * @param {string} userId - User making the update
 * @returns {Object} Updated ticket
 */
async function updateTicket(ticketId, updates, userId) {
  // Get current ticket state
  const { data: currentTicket } = await supabase
    .from('tickets')
    .select('id, ticket_number, order_id, customer_id, type, priority, status, subject, description, assigned_to, resolved_at, created_at, updated_at')
    .eq('id', ticketId)
    .single();

  if (!currentTicket) {
    throw new NotFoundError('Ticket not found');
  }

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .update(updates)
    .eq('id', ticketId)
    .select()
    .single();

  if (error) {
    throw new BadRequestError('Failed to update ticket: ' + error.message);
  }

  // Log status change
  if (updates.status && updates.status !== currentTicket.status) {
    await logActivity(ticketId, 'status_changed', 
      { status: currentTicket.status }, 
      { status: updates.status }, 
      userId
    );
  }

  // Log priority change
  if (updates.priority && updates.priority !== currentTicket.priority) {
    await logActivity(ticketId, 'priority_changed',
      { priority: currentTicket.priority },
      { priority: updates.priority },
      userId
    );
  }

  // Log assignment change
  if (updates.assigned_to && updates.assigned_to !== currentTicket.assigned_to) {
    await logActivity(ticketId, 'assigned',
      { assigned_to: currentTicket.assigned_to },
      { assigned_to: updates.assigned_to },
      userId
    );
  }

  return ticket;
}

// =============================================================================
// TICKET ACTIONS
// =============================================================================

/**
 * Assign ticket to a user
 * 
 * @param {string} ticketId - Ticket UUID
 * @param {string} assigneeId - User to assign to
 * @param {string} userId - User making assignment
 */
async function assignTicket(ticketId, assigneeId, userId) {
  return updateTicket(ticketId, {
    assigned_to: assigneeId,
    assigned_at: new Date().toISOString(),
    assigned_by: userId,
    status: TICKET_STATUSES.IN_PROGRESS,
  }, userId);
}

/**
 * Escalate ticket
 * 
 * @param {string} ticketId - Ticket UUID
 * @param {string} escalateTo - User to escalate to
 * @param {string} reason - Escalation reason
 * @param {string} userId - User escalating
 */
async function escalateTicket(ticketId, escalateTo, reason, userId) {
  const ticket = await updateTicket(ticketId, {
    escalated_to: escalateTo,
    escalated_at: new Date().toISOString(),
    escalation_reason: reason,
    status: TICKET_STATUSES.ESCALATED,
    priority: TICKET_PRIORITIES.HIGH, // Auto-elevate priority
  }, userId);

  await logActivity(ticketId, 'escalated', null, { escalated_to: escalateTo, reason }, userId);

  // Add system message
  await addMessage(ticketId, {
    message: `Ticket escalated. Reason: ${reason}`,
    source: 'system',
    is_internal: true,
  }, userId);

  return ticket;
}

/**
 * Resolve ticket
 * 
 * @param {string} ticketId - Ticket UUID
 * @param {string} resolution - Resolution description
 * @param {string} userId - User resolving
 */
async function resolveTicket(ticketId, resolution, userId) {
  const ticket = await updateTicket(ticketId, {
    status: TICKET_STATUSES.RESOLVED,
    resolution,
    resolved_at: new Date().toISOString(),
    resolved_by: userId,
  }, userId);

  await addMessage(ticketId, {
    message: `Ticket resolved: ${resolution}`,
    source: 'system',
    is_internal: false,
  }, userId);

  return ticket;
}

/**
 * Close ticket
 * 
 * @param {string} ticketId - Ticket UUID
 * @param {string} userId - User closing
 */
async function closeTicket(ticketId, userId) {
  const ticket = await updateTicket(ticketId, {
    status: TICKET_STATUSES.CLOSED,
    closed_at: new Date().toISOString(),
  }, userId);

  await logActivity(ticketId, 'closed', null, null, userId);

  return ticket;
}

/**
 * Reopen a closed ticket
 * 
 * @param {string} ticketId - Ticket UUID
 * @param {string} reason - Reason for reopening
 * @param {string} userId - User reopening
 */
async function reopenTicket(ticketId, reason, userId) {
  const ticket = await updateTicket(ticketId, {
    status: TICKET_STATUSES.OPEN,
    resolved_at: null,
    closed_at: null,
  }, userId);

  await logActivity(ticketId, 'reopened', null, { reason }, userId);

  await addMessage(ticketId, {
    message: `Ticket reopened: ${reason}`,
    source: 'system',
    is_internal: true,
  }, userId);

  return ticket;
}

// =============================================================================
// MESSAGES
// =============================================================================

/**
 * Add message to ticket
 * 
 * @param {string} ticketId - Ticket UUID
 * @param {Object} messageData - Message content
 * @param {string} userId - Sender user ID (if staff)
 */
async function addMessage(ticketId, messageData, userId = null) {
  const { message, source = 'staff', sender_name, attachments = [], is_internal = false } = messageData;

  const { data: msg, error } = await supabaseAdmin
    .from('ticket_messages')
    .insert({
      ticket_id: ticketId,
      message,
      source,
      sender_id: userId,
      sender_name,
      attachments,
      is_internal,
    })
    .select(`
      *,
      sender:users!ticket_messages_sender_id_fkey(id, name, role)
    `)
    .single();

  if (error) {
    throw new BadRequestError('Failed to add message: ' + error.message);
  }

  // Update ticket status to pending if customer replied on a closed ticket
  if (source === 'customer') {
    const { data: ticket } = await supabase
      .from('tickets')
      .select('status')
      .eq('id', ticketId)
      .single();

    if (ticket && ticket.status === TICKET_STATUSES.RESOLVED) {
      await updateTicket(ticketId, { status: TICKET_STATUSES.PENDING }, null);
    }
  }

  return msg;
}

/**
 * Get messages for a ticket
 * 
 * @param {string} ticketId - Ticket UUID
 * @param {boolean} includeInternal - Include internal notes
 */
async function getMessages(ticketId, includeInternal = true) {
  let query = supabase
    .from('ticket_messages')
    .select(`
      *,
      sender:users!ticket_messages_sender_id_fkey(id, name, role)
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (!includeInternal) {
    query = query.eq('is_internal', false);
  }

  const { data: messages, error } = await query;

  if (error) {
    throw error;
  }

  return messages;
}

// =============================================================================
// AUTOMATION ENGINE
// =============================================================================

/**
 * Auto-create feedback ticket when order is delivered
 * 
 * Called by OrderStateMachine when status changes to DELIVERED
 * 
 * @param {string} orderId - Order UUID
 * @returns {Object} Created feedback ticket
 */
async function autoCreateFeedbackTicket(orderId) {
  // Get order details
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      customer_id,
      customer:customers(id, name, phone)
    `)
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    logger.error('Cannot create feedback ticket: Order not found', { orderId });
    return null;
  }

  // Check if feedback ticket already exists for this order
  const { data: existingTicket } = await supabase
    .from('tickets')
    .select('id')
    .eq('related_order_id', orderId)
    .eq('type', TICKET_TYPES.FEEDBACK)
    .maybeSingle();

  if (existingTicket) {
    logger.info('Feedback ticket already exists for order', { orderId });
    return existingTicket;
  }

  // Create feedback ticket
  const ticket = await createTicket({
    type: TICKET_TYPES.FEEDBACK,
    priority: TICKET_PRIORITIES.LOW,
    subject: `Feedback Request - Order ${order.order_number}`,
    description: `Automated feedback request for delivered order ${order.order_number}`,
    related_order_id: orderId,
    customer_id: order.customer_id,
    channel: 'system',
    metadata: {
      auto_created: true,
      trigger: 'order_delivered',
    },
  }, null);

  // Add system message
  await addMessage(ticket.id, {
    message: 'Thank you for your order! We would love to hear your feedback. Please rate your experience.',
    source: 'system',
    is_internal: false,
  }, null);

  // Send SMS to customer (if enabled)
  if (order.customer?.phone) {
    try {
      await SMSService.send(
        order.customer.phone,
        `Thank you for shopping with us! Order ${order.order_number} delivered. Rate your experience: [FEEDBACK_LINK]`,
        { context: 'feedback_request', order_id: orderId, ticket_id: ticket.id }
      );
    } catch (smsError) {
      logger.warn('Failed to send feedback SMS', { error: smsError.message });
    }
  }

  logger.info(`Auto-created feedback ticket ${ticket.ticket_number} for order ${order.order_number}`);

  return ticket;
}

/**
 * Submit feedback for a ticket
 * 
 * @param {string} ticketId - Feedback ticket UUID
 * @param {Object} feedbackData - Rating and comment
 * @param {string} userId - User ID if staff is submitting on behalf
 */
async function submitFeedback(ticketId, feedbackData, userId = null) {
  const { rating, comment, delivery_rating, product_rating, service_rating } = feedbackData;

  // Get ticket details
  const ticket = await getTicketById(ticketId);

  if (!ticket) {
    throw new NotFoundError('Ticket not found');
  }

  if (ticket.type !== TICKET_TYPES.FEEDBACK) {
    throw new BadRequestError('This ticket is not a feedback request');
  }

  if (ticket.status === TICKET_STATUSES.CLOSED) {
    throw new BadRequestError('Feedback already submitted');
  }

  // Update ticket with rating
  await updateTicket(ticketId, {
    feedback_rating: rating,
    feedback_collected_at: new Date().toISOString(),
  }, userId);

  // Create review record
  const { data: review, error: reviewError } = await supabaseAdmin
    .from('reviews')
    .insert({
      order_id: ticket.related_order_id,
      customer_id: ticket.customer_id,
      vendor_id: ticket.vendor_id,
      product_id: ticket.product_id,
      ticket_id: ticketId,
      rating,
      comment,
      delivery_rating,
      product_rating,
      service_rating,
      is_verified: true, // Linked to real order
    })
    .select()
    .single();

  if (reviewError) {
    logger.error('Failed to create review:', reviewError);
    throw new BadRequestError('Failed to save review');
  }

  // Handle based on rating
  if (rating >= 4) {
    // Good rating - auto-close ticket
    await closeTicket(ticketId, userId);
    
    await addMessage(ticketId, {
      message: `Thank you for your positive feedback! Rating: ${rating}/5`,
      source: 'system',
      is_internal: false,
    }, null);

    logger.info(`Positive feedback (${rating}) received, ticket auto-closed`, { ticketId });

  } else {
    // Low rating - keep open, escalate
    await updateTicket(ticketId, {
      priority: TICKET_PRIORITIES.HIGH,
      status: TICKET_STATUSES.OPEN,
      tags: [...(ticket.tags || []), 'negative_feedback', 'needs_attention'],
    }, userId);

    await addMessage(ticketId, {
      message: `Customer gave ${rating}/5 rating. Requires staff follow-up. Comment: ${comment || 'No comment provided'}`,
      source: 'system',
      is_internal: true,
    }, null);

    // TODO: Notify staff about negative feedback
    logger.warn(`Negative feedback (${rating}) received, ticket escalated`, { ticketId });
  }

  return { ticket, review };
}

/**
 * Create issue ticket from an order
 * 
 * @param {string} orderId - Order UUID
 * @param {Object} issueData - Issue details
 * @param {string} userId - Creating user ID
 */
async function createOrderIssue(orderId, issueData, userId) {
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, vendor_id')
    .eq('id', orderId)
    .single();

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  const ticket = await createTicket({
    type: issueData.type || TICKET_TYPES.ISSUE,
    priority: issueData.priority || TICKET_PRIORITIES.MEDIUM,
    subject: issueData.subject || `Issue with Order ${order.order_number}`,
    description: issueData.description,
    related_order_id: orderId,
    customer_id: order.customer_id,
    vendor_id: issueData.vendor_related ? order.vendor_id : null,
    tags: issueData.tags || ['order_issue'],
    channel: issueData.channel || 'dashboard',
  }, userId);

  if (issueData.initial_message) {
    await addMessage(ticket.id, {
      message: issueData.initial_message,
      source: 'customer',
      sender_name: issueData.customer_name,
    }, null);
  }

  return ticket;
}

// =============================================================================
// ACTIVITY LOGGING
// =============================================================================

/**
 * Log ticket activity
 */
async function logActivity(ticketId, action, oldValue, newValue, userId) {
  const { error } = await supabaseAdmin
    .from('ticket_activities')
    .insert({
      ticket_id: ticketId,
      action,
      old_value: oldValue,
      new_value: newValue,
      performed_by: userId,
    });

  if (error) {
    logger.warn('Failed to log ticket activity:', error);
  }
}

/**
 * Get activity log for a ticket
 */
async function getActivityLog(ticketId) {
  const { data: activities, error } = await supabase
    .from('ticket_activities')
    .select(`
      *,
      user:users!ticket_activities_performed_by_fkey(id, name)
    `)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return activities;
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get ticket statistics
 * 
 * @param {Object} filters - Optional filters (date range, assigned_to, etc.)
 */
async function getStatistics(filters = {}) {
  const { date_from, date_to, assigned_to } = filters;

  let query = supabase
    .from('tickets')
    .select('status, priority, type', { count: 'exact' });

  if (date_from) {
    query = query.gte('created_at', date_from);
  }
  if (date_to) {
    query = query.lte('created_at', date_to);
  }
  if (assigned_to) {
    query = query.eq('assigned_to', assigned_to);
  }

  const { data: tickets, count } = await query;

  // Calculate statistics
  const stats = {
    total: count || 0,
    by_status: {},
    by_priority: {},
    by_type: {},
    open_count: 0,
    sla_breached: 0,
  };

  for (const ticket of tickets || []) {
    // By status
    stats.by_status[ticket.status] = (stats.by_status[ticket.status] || 0) + 1;
    
    // By priority
    stats.by_priority[ticket.priority] = (stats.by_priority[ticket.priority] || 0) + 1;
    
    // By type
    stats.by_type[ticket.type] = (stats.by_type[ticket.type] || 0) + 1;
    
    // Open count
    if (['open', 'pending', 'in_progress', 'escalated'].includes(ticket.status)) {
      stats.open_count++;
    }
  }

  // Get SLA breached count
  const { count: breachedCount } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('sla_breached', true)
    .not('status', 'in', '("resolved","closed")');

  stats.sla_breached = breachedCount || 0;

  return stats;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const TicketService = {
  // CRUD
  createTicket,
  getTicketById,
  listTickets,
  updateTicket,
  
  // Actions
  assignTicket,
  escalateTicket,
  resolveTicket,
  closeTicket,
  reopenTicket,
  
  // Messages
  addMessage,
  getMessages,
  
  // Automation
  autoCreateFeedbackTicket,
  submitFeedback,
  createOrderIssue,
  
  // Activity
  logActivity,
  getActivityLog,
  
  // Stats
  getStatistics,
  
  // Constants
  TICKET_TYPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
};

export default TicketService;
