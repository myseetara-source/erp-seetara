/**
 * Ticket Controller
 * 
 * Handles HTTP endpoints for the ticket/support system.
 * Implements role-based access control.
 * 
 * @module controllers/ticket.controller
 */

import { TicketService } from '../services/ticket.service.js';
import { maskSensitiveData } from '../utils/dataMasking.js';
import asyncHandler from 'express-async-handler';

// =============================================================================
// TICKET CRUD
// =============================================================================

/**
 * Create a new ticket
 * POST /tickets
 */
export const createTicket = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const ticket = await TicketService.createTicket(req.body, userId);

  res.status(201).json({
    success: true,
    message: `Ticket ${ticket.ticket_number} created successfully`,
    data: ticket,
  });
});

/**
 * Get ticket by ID
 * GET /tickets/:id
 */
export const getTicketById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;
  const userVendorId = req.user.vendor_id;

  const ticket = await TicketService.getTicketById(id);

  // Vendor access check - can only see their own tickets
  if (userRole === 'vendor' && ticket.vendor_id !== userVendorId) {
    return res.status(403).json({
      success: false,
      message: 'Access denied to this ticket',
    });
  }

  // Filter internal messages for non-staff
  if (userRole === 'vendor') {
    ticket.messages = ticket.messages?.filter(m => !m.is_internal);
  }

  // Mask sensitive data for non-admin
  const maskedTicket = maskSensitiveData(ticket, userRole);

  res.json({
    success: true,
    data: maskedTicket,
  });
});

/**
 * List tickets with filters
 * GET /tickets
 */
export const listTickets = asyncHandler(async (req, res) => {
  const userRole = req.user.role;
  const userId = req.user.id;
  const userVendorId = req.user.vendor_id;

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
    page = 1,
    limit = 20,
    sort_by = 'created_at',
    sort_order = 'desc',
  } = req.query;

  // Build filters based on role
  const filters = {
    status: status ? (status.includes(',') ? status.split(',') : status) : undefined,
    priority,
    type,
    customer_id,
    order_id,
    search,
    tags: tags ? tags.split(',') : undefined,
    sla_breached: sla_breached === 'true' ? true : sla_breached === 'false' ? false : undefined,
    date_from,
    date_to,
  };

  // Role-based filtering
  if (userRole === 'vendor') {
    // Vendors can ONLY see their own tickets
    filters.vendor_id = userVendorId;
  } else if (userRole === 'staff' || userRole === 'operator') {
    // Staff can see assigned to them OR unassigned
    if (assigned_to === 'me') {
      filters.assigned_to = userId;
    } else if (unassigned === 'true') {
      filters.unassigned = true;
    } else if (assigned_to) {
      filters.assigned_to = assigned_to;
    }
    // Staff can also filter by vendor if specified
    if (vendor_id) {
      filters.vendor_id = vendor_id;
    }
  } else if (userRole === 'admin') {
    // Admin can see all, apply filters as provided
    if (assigned_to === 'me') {
      filters.assigned_to = userId;
    } else if (assigned_to) {
      filters.assigned_to = assigned_to;
    }
    if (unassigned === 'true') {
      filters.unassigned = true;
    }
    if (vendor_id) {
      filters.vendor_id = vendor_id;
    }
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort_by,
    sort_order,
  };

  const result = await TicketService.listTickets(filters, options);

  // Mask sensitive data
  result.tickets = result.tickets.map(t => maskSensitiveData(t, userRole));

  res.json({
    success: true,
    data: result.tickets,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

/**
 * Update ticket
 * PATCH /tickets/:id
 */
export const updateTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Vendors cannot update tickets
  if (userRole === 'vendor') {
    return res.status(403).json({
      success: false,
      message: 'Vendors cannot modify tickets',
    });
  }

  const ticket = await TicketService.updateTicket(id, req.body, userId);

  res.json({
    success: true,
    message: 'Ticket updated successfully',
    data: ticket,
  });
});

// =============================================================================
// TICKET ACTIONS
// =============================================================================

/**
 * Assign ticket to a user
 * POST /tickets/:id/assign
 */
export const assignTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assignee_id } = req.body;
  const userId = req.user.id;

  if (!assignee_id) {
    return res.status(400).json({
      success: false,
      message: 'Assignee ID is required',
    });
  }

  const ticket = await TicketService.assignTicket(id, assignee_id, userId);

  res.json({
    success: true,
    message: 'Ticket assigned successfully',
    data: ticket,
  });
});

/**
 * Escalate ticket
 * POST /tickets/:id/escalate
 */
export const escalateTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { escalate_to, reason } = req.body;
  const userId = req.user.id;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: 'Escalation reason is required',
    });
  }

  const ticket = await TicketService.escalateTicket(id, escalate_to, reason, userId);

  res.json({
    success: true,
    message: 'Ticket escalated successfully',
    data: ticket,
  });
});

/**
 * Resolve ticket
 * POST /tickets/:id/resolve
 */
export const resolveTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolution } = req.body;
  const userId = req.user.id;

  if (!resolution) {
    return res.status(400).json({
      success: false,
      message: 'Resolution description is required',
    });
  }

  const ticket = await TicketService.resolveTicket(id, resolution, userId);

  res.json({
    success: true,
    message: 'Ticket resolved successfully',
    data: ticket,
  });
});

/**
 * Close ticket
 * POST /tickets/:id/close
 */
export const closeTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const ticket = await TicketService.closeTicket(id, userId);

  res.json({
    success: true,
    message: 'Ticket closed successfully',
    data: ticket,
  });
});

/**
 * Reopen ticket
 * POST /tickets/:id/reopen
 */
export const reopenTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;

  const ticket = await TicketService.reopenTicket(id, reason, userId);

  res.json({
    success: true,
    message: 'Ticket reopened successfully',
    data: ticket,
  });
});

// =============================================================================
// MESSAGES
// =============================================================================

/**
 * Add message to ticket
 * POST /tickets/:id/messages
 */
export const addMessage = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const { message, source, attachments, is_internal } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      message: 'Message content is required',
    });
  }

  // Vendors cannot post internal notes
  const internal = userRole === 'vendor' ? false : is_internal;

  const msg = await TicketService.addMessage(id, {
    message,
    source: source || (userRole === 'vendor' ? 'vendor' : 'staff'),
    attachments,
    is_internal: internal,
  }, userId);

  res.status(201).json({
    success: true,
    message: 'Message added successfully',
    data: msg,
  });
});

/**
 * Get messages for a ticket
 * GET /tickets/:id/messages
 */
export const getMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  // Vendors should not see internal notes
  const includeInternal = userRole !== 'vendor';

  const messages = await TicketService.getMessages(id, includeInternal);

  res.json({
    success: true,
    data: messages,
  });
});

// =============================================================================
// FEEDBACK
// =============================================================================

/**
 * Submit feedback for a ticket
 * POST /tickets/:id/submit-feedback
 */
export const submitFeedback = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id; // May be null for public feedback

  const { rating, comment, delivery_rating, product_rating, service_rating } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: 'Rating must be between 1 and 5',
    });
  }

  const result = await TicketService.submitFeedback(id, {
    rating,
    comment,
    delivery_rating,
    product_rating,
    service_rating,
  }, userId);

  res.json({
    success: true,
    message: rating >= 4 ? 'Thank you for your positive feedback!' : 'Thank you for your feedback. Our team will follow up.',
    data: {
      ticket: result.ticket,
      review: result.review,
    },
  });
});

// =============================================================================
// ORDER ISSUES
// =============================================================================

/**
 * Create issue ticket from order
 * POST /orders/:orderId/issue
 */
export const createOrderIssue = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user.id;

  const ticket = await TicketService.createOrderIssue(orderId, req.body, userId);

  res.status(201).json({
    success: true,
    message: `Issue ticket ${ticket.ticket_number} created`,
    data: ticket,
  });
});

// =============================================================================
// ACTIVITY LOG
// =============================================================================

/**
 * Get activity log for a ticket
 * GET /tickets/:id/activity
 */
export const getActivityLog = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const activities = await TicketService.getActivityLog(id);

  res.json({
    success: true,
    data: activities,
  });
});

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get ticket statistics
 * GET /tickets/stats
 */
export const getStatistics = asyncHandler(async (req, res) => {
  const { date_from, date_to, assigned_to } = req.query;
  const userId = req.user.id;
  const userRole = req.user.role;

  const filters = {
    date_from,
    date_to,
  };

  // Staff sees their own stats by default
  if (userRole === 'staff' || userRole === 'operator') {
    filters.assigned_to = assigned_to === 'all' && userRole === 'admin' ? undefined : userId;
  } else if (assigned_to && assigned_to !== 'all') {
    filters.assigned_to = assigned_to;
  }

  const stats = await TicketService.getStatistics(filters);

  res.json({
    success: true,
    data: stats,
  });
});

// =============================================================================
// REVIEWS
// =============================================================================

/**
 * Get reviews for a product
 * GET /products/:productId/reviews
 */
export const getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { page = 1, limit = 10, rating } = req.query;

  // This would go to a review service, but for now inline query
  const { supabase } = await import('../config/supabase.js');

  let query = supabase
    .from('reviews')
    .select(`
      id,
      rating,
      title,
      comment,
      delivery_rating,
      product_rating,
      service_rating,
      images,
      is_verified,
      response,
      response_at,
      created_at,
      customer:customers(id, name)
    `, { count: 'exact' })
    .eq('product_id', productId)
    .eq('is_published', true);

  if (rating) {
    query = query.eq('rating', parseInt(rating));
  }

  const from = (parseInt(page) - 1) * parseInt(limit);
  const to = from + parseInt(limit) - 1;

  const { data: reviews, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  res.json({
    success: true,
    data: reviews,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count || 0,
    },
  });
});

/**
 * Get review summary for a product
 * GET /products/:productId/reviews/summary
 */
export const getReviewSummary = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const { supabase } = await import('../config/supabase.js');

  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating')
    .eq('product_id', productId)
    .eq('is_published', true);

  if (!reviews || reviews.length === 0) {
    return res.json({
      success: true,
      data: {
        average: 0,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
    });
  }

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;

  for (const review of reviews) {
    distribution[review.rating]++;
    total += review.rating;
  }

  res.json({
    success: true,
    data: {
      average: (total / reviews.length).toFixed(1),
      count: reviews.length,
      distribution,
    },
  });
});

export default {
  createTicket,
  getTicketById,
  listTickets,
  updateTicket,
  assignTicket,
  escalateTicket,
  resolveTicket,
  closeTicket,
  reopenTicket,
  addMessage,
  getMessages,
  submitFeedback,
  createOrderIssue,
  getActivityLog,
  getStatistics,
  getProductReviews,
  getReviewSummary,
};
