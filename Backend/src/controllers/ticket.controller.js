/**
 * Ticket Controller
 * Handles HTTP requests for the Ticket & Support System
 * 
 * 3 Workspaces:
 *   - Priority Desk (type: support) - Manual complaints
 *   - Experience Center (type: review) - Auto post-delivery
 *   - Return Lab (type: investigation) - Auto on cancel/reject/return
 */

import { asyncHandler } from '../middleware/error.middleware.js';
import { extractContext } from '../middleware/auth.middleware.js';
import { supabaseAdmin } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';
import { logActivity, ACTIVITY_TYPES } from '../services/ActivityLogger.service.js';

const logger = createLogger('Tickets');

// =============================================================================
// LIST TICKETS (with filters, search, pagination)
// GET /tickets
// =============================================================================

export const listTickets = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    type,
    status,
    priority,
    category,
    source,
    assigned_to,
    search,
    sortBy = 'created_at',
    sortOrder = 'desc',
  } = req.query;

  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('tickets')
    .select(`
      *,
      comments:ticket_comments(count)
    `, { count: 'exact' });

  // Filters
  if (type) query = query.eq('type', type);
  if (status) {
    const statuses = status.split(',').map(s => s.trim());
    query = query.in('status', statuses);
  }
  if (priority) query = query.eq('priority', priority);
  if (category) query = query.eq('category', category);
  if (source) query = query.eq('source', source);
  if (assigned_to === 'unassigned') {
    query = query.is('assigned_to', null);
  } else if (assigned_to) {
    query = query.eq('assigned_to', assigned_to);
  }
  if (search) {
    query = query.or(`subject.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,readable_id.eq.${parseInt(search) || 0}`);
  }

  // Sort & paginate
  query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  query = query.range(offset, offset + limit - 1);

  const { data: tickets, error, count } = await query;

  if (error) {
    logger.error('[Tickets] Failed to list tickets', { error });
    return res.status(500).json({ success: false, message: 'Failed to list tickets' });
  }

  res.json({
    success: true,
    data: tickets || [],
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
});

// =============================================================================
// GET TICKET STATS (counts per type/status)
// GET /tickets/stats
// =============================================================================

export const getTicketStats = asyncHandler(async (req, res) => {
  // Get counts by type
  const { data: typeStats } = await supabaseAdmin.rpc('get_ticket_stats_by_type').catch(() => ({ data: null }));

  // Fallback: manual queries
  const [supportQ, reviewQ, investigationQ, openQ, urgentQ] = await Promise.all([
    supabaseAdmin.from('tickets').select('id', { count: 'exact', head: true }).eq('type', 'support').in('status', ['open', 'processing']),
    supabaseAdmin.from('tickets').select('id', { count: 'exact', head: true }).eq('type', 'review').in('status', ['open', 'processing']),
    supabaseAdmin.from('tickets').select('id', { count: 'exact', head: true }).eq('type', 'investigation').in('status', ['open', 'processing']),
    supabaseAdmin.from('tickets').select('id', { count: 'exact', head: true }).in('status', ['open']),
    supabaseAdmin.from('tickets').select('id', { count: 'exact', head: true }).eq('priority', 'urgent').in('status', ['open', 'processing']),
  ]);

  res.json({
    success: true,
    data: {
      support: supportQ.count || 0,
      review: reviewQ.count || 0,
      investigation: investigationQ.count || 0,
      open: openQ.count || 0,
      urgent: urgentQ.count || 0,
    },
  });
});

// =============================================================================
// GET SINGLE TICKET
// GET /tickets/:id
// =============================================================================

export const getTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .select(`
      *,
      comments:ticket_comments(*, user:user_name)
    `)
    .eq('id', id)
    .order('created_at', { referencedTable: 'ticket_comments', ascending: true })
    .single();

  if (error || !ticket) {
    return res.status(404).json({ success: false, message: 'Ticket not found' });
  }

  // If ticket has an order, fetch order summary
  let orderSummary = null;
  if (ticket.order_id) {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, readable_id, order_number, status, total_amount, shipping_name, shipping_phone, shipping_address, created_at, items:order_items(product_name, quantity, unit_price)')
      .eq('id', ticket.order_id)
      .single();
    orderSummary = order;
  }

  res.json({
    success: true,
    data: { ...ticket, order: orderSummary },
  });
});

// =============================================================================
// LOOKUP ORDER (for ticket creation form)
// GET /tickets/lookup-order/:orderId
// Accepts readable_id (e.g. "25-01-15-001") or UUID
// =============================================================================

export const lookupOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  if (!orderId || !orderId.trim()) {
    return res.status(400).json({ success: false, message: 'Order ID is required' });
  }

  const trimmed = orderId.trim();

  // Build query - select full order details + items
  let query = supabaseAdmin
    .from('orders')
    .select(`
      id, readable_id, order_number, status, fulfillment_type,
      subtotal, total_amount, discount, shipping_cost,
      shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state,
      alt_phone, remarks, payment_method, payment_status, paid_amount,
      source, created_at,
      items:order_items(id, product_name, variant_name, sku, quantity, unit_price, total_price)
    `);

  // Detect if it's a UUID (contains hyphens and is 36 chars) or readable_id
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  if (isUUID) {
    query = query.eq('id', trimmed);
  } else {
    // Try readable_id first, then order_number
    query = query.eq('readable_id', trimmed);
  }

  const { data: order, error } = await query.single();

  // If not found by readable_id, try order_number
  if ((error || !order) && !isUUID) {
    const { data: orderByNum, error: numError } = await supabaseAdmin
      .from('orders')
      .select(`
        id, readable_id, order_number, status, fulfillment_type,
        subtotal, total_amount, discount, shipping_cost,
        shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state,
        alt_phone, remarks, payment_method, payment_status, paid_amount,
        source, created_at,
        items:order_items(id, product_name, variant_name, sku, quantity, unit_price, total_price)
      `)
      .eq('order_number', trimmed)
      .single();

    if (!numError && orderByNum) {
      return res.json({ success: true, data: orderByNum });
    }
  }

  if (error || !order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found. Please check the Order ID.',
    });
  }

  res.json({ success: true, data: order });
});

// =============================================================================
// CREATE TICKET (Internal - Staff)
// POST /tickets
// =============================================================================

export const createTicket = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const ticketData = { ...req.body };

  // If order_id provided, snapshot customer info from order
  if (ticketData.order_id) {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, shipping_name, shipping_phone, readable_id')
      .eq('id', ticketData.order_id)
      .single();

    if (order) {
      ticketData.customer_name = ticketData.customer_name || order.shipping_name;
      ticketData.customer_phone = ticketData.customer_phone || order.shipping_phone;
    }
  }

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .insert(ticketData)
    .select()
    .single();

  if (error) {
    logger.error('[Tickets] Failed to create ticket', { error });
    return res.status(500).json({ success: false, message: 'Failed to create ticket', error: error.message });
  }

  // Log activity on the linked order's timeline
  if (ticket.order_id) {
    try {
      await logActivity(supabaseAdmin, {
        orderId: ticket.order_id,
        user: req.user,
        message: `Support ticket #TK-${ticket.readable_id} created: "${ticket.subject}"`,
        type: ACTIVITY_TYPES.SYSTEM_LOG,
        metadata: {
          action: 'ticket_created',
          ticket_id: ticket.id,
          ticket_readable_id: ticket.readable_id,
          ticket_type: ticket.type,
          ticket_priority: ticket.priority,
          ticket_category: ticket.category,
        },
      });
    } catch (actErr) {
      logger.warn('[Tickets] Failed to log activity on order', { error: actErr.message });
    }
  }

  logger.info('[Tickets] Ticket created', {
    ticketId: ticket.id,
    readableId: ticket.readable_id,
    type: ticket.type,
    source: ticket.source,
    userId: context.userId,
  });

  res.status(201).json({ success: true, data: ticket });
});

// =============================================================================
// UPDATE TICKET
// PATCH /tickets/:id
// =============================================================================

export const updateTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };
  const context = extractContext(req);

  // Fetch current ticket for change comparison
  const { data: existingTicket } = await supabaseAdmin
    .from('tickets')
    .select('status, priority, type, order_id, readable_id')
    .eq('id', id)
    .single();

  // Auto-set resolved_at / closed_at timestamps
  if (updates.status === 'resolved' && !updates.resolved_at) {
    updates.resolved_at = new Date().toISOString();
  }
  if (updates.status === 'closed' && !updates.closed_at) {
    updates.closed_at = new Date().toISOString();
  }

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !ticket) {
    return res.status(error ? 500 : 404).json({
      success: false,
      message: error ? 'Failed to update ticket' : 'Ticket not found',
    });
  }

  // Log status change on linked order's timeline
  if (ticket.order_id && updates.status && existingTicket?.status !== updates.status) {
    try {
      const statusLabels = { open: 'Open', processing: 'In Progress', resolved: 'Resolved', closed: 'Closed' };
      await logActivity(supabaseAdmin, {
        orderId: ticket.order_id,
        user: req.user,
        message: `Ticket #TK-${ticket.readable_id} status changed: ${statusLabels[existingTicket?.status] || existingTicket?.status} → ${statusLabels[updates.status] || updates.status}`,
        type: ACTIVITY_TYPES.SYSTEM_LOG,
        metadata: {
          action: 'ticket_status_change',
          ticket_id: ticket.id,
          ticket_readable_id: ticket.readable_id,
          old_status: existingTicket?.status,
          new_status: updates.status,
        },
      });
    } catch (actErr) {
      logger.warn('[Tickets] Failed to log status change activity', { error: actErr.message });
    }
  }

  logger.info('[Tickets] Ticket updated', {
    ticketId: id,
    updates: Object.keys(updates),
    userId: context.userId,
  });

  res.json({ success: true, data: ticket });
});

// =============================================================================
// ADD COMMENT
// POST /tickets/:id/comments
// =============================================================================

export const addComment = asyncHandler(async (req, res) => {
  const { id: ticketId } = req.params;
  const { content, is_internal = true, attachments = [] } = req.body;
  const context = extractContext(req);

  // Get user name for snapshot
  const userName = req.user?.user_metadata?.name || req.user?.email || 'Staff';

  const { data: comment, error } = await supabaseAdmin
    .from('ticket_comments')
    .insert({
      ticket_id: ticketId,
      user_id: context.userId,
      user_name: userName,
      content,
      is_internal,
      attachments,
    })
    .select()
    .single();

  if (error) {
    logger.error('[Tickets] Failed to add comment', { error });
    return res.status(500).json({ success: false, message: 'Failed to add comment' });
  }

  // Auto-set ticket to "processing" if it was "open"
  await supabaseAdmin
    .from('tickets')
    .update({ status: 'processing' })
    .eq('id', ticketId)
    .eq('status', 'open');

  res.status(201).json({ success: true, data: comment });
});

// =============================================================================
// ESCALATE TICKET (Review -> Support)
// POST /tickets/:id/escalate
// =============================================================================

export const escalateTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const context = extractContext(req);

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .update({
      type: 'support',
      priority: 'high',
      status: 'open',
      metadata: supabaseAdmin.rpc ? undefined : undefined, // Keep existing metadata
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !ticket) {
    return res.status(404).json({ success: false, message: 'Ticket not found' });
  }

  // Add escalation comment
  await supabaseAdmin.from('ticket_comments').insert({
    ticket_id: id,
    user_id: context.userId,
    user_name: req.user?.user_metadata?.name || 'Staff',
    content: 'Ticket escalated from Review to Priority Desk',
    is_internal: true,
  });

  logger.info('[Tickets] Ticket escalated', { ticketId: id, userId: context.userId });

  res.json({ success: true, data: ticket });
});

// =============================================================================
// PUBLIC COMPLAINT (No auth - phone verification)
// POST /tickets/public/complaint
// =============================================================================

export const submitPublicComplaint = asyncHandler(async (req, res) => {
  const { order_id, phone, category, subject, description, photo_url } = req.body;

  // 1. Find order by readable_id or UUID
  let orderQuery = supabaseAdmin.from('orders').select('id, readable_id, shipping_name, shipping_phone, order_number');

  // Check if it looks like a UUID or a readable ID
  if (order_id.includes('-')) {
    orderQuery = orderQuery.eq('id', order_id);
  } else {
    orderQuery = orderQuery.eq('readable_id', order_id);
  }

  const { data: order, error: orderError } = await orderQuery.single();

  if (orderError || !order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found. Please check your Order ID.',
    });
  }

  // 2. Verify phone matches
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const orderPhone = (order.shipping_phone || '').replace(/\D/g, '').slice(-10);

  if (cleanPhone !== orderPhone) {
    return res.status(403).json({
      success: false,
      message: 'Phone number does not match our records for this order.',
    });
  }

  // 3. Create ticket
  const metadata = {};
  if (photo_url) metadata.photo_url = photo_url;

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .insert({
      type: 'support',
      category: category || 'complaint',
      priority: 'medium',
      status: 'open',
      source: 'public_form',
      subject,
      description,
      order_id: order.id,
      customer_name: order.shipping_name,
      customer_phone: order.shipping_phone,
      metadata,
    })
    .select('id, readable_id, subject, status, created_at')
    .single();

  if (error) {
    logger.error('[Tickets] Public complaint failed', { error });
    return res.status(500).json({ success: false, message: 'Failed to submit complaint' });
  }

  logger.info('[Tickets] Public complaint created', {
    ticketId: ticket.id,
    orderId: order.id,
  });

  res.status(201).json({
    success: true,
    message: 'Your complaint has been submitted successfully.',
    data: {
      ticket_id: ticket.readable_id,
      status: ticket.status,
    },
  });
});
