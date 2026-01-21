/**
 * Ticket Routes
 * 
 * API endpoints for the ticket/support system.
 * 
 * Access Control:
 * - Admin: Full access to all tickets
 * - Staff: View assigned + unassigned, full actions
 * - Vendor: View own vendor tickets only (read-only messages)
 * 
 * @module routes/ticket.routes
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import {
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
} from '../controllers/ticket.controller.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createTicketSchema = z.object({
  type: z.enum(['issue', 'task', 'feedback', 'vendor_dispute', 'return_request', 'inquiry']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  subject: z.string().min(3).max(255),
  description: z.string().optional(),
  related_order_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  vendor_id: z.string().uuid().optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  channel: z.string().optional(),
});

const updateTicketSchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  subject: z.string().min(3).max(255).optional(),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  due_date: z.string().datetime().optional(),
});

const assignTicketSchema = z.object({
  assignee_id: z.string().uuid(),
});

const escalateTicketSchema = z.object({
  escalate_to: z.string().uuid().optional(),
  reason: z.string().min(5),
});

const resolveTicketSchema = z.object({
  resolution: z.string().min(5),
});

const reopenTicketSchema = z.object({
  reason: z.string().min(5),
});

const addMessageSchema = z.object({
  message: z.string().min(1),
  source: z.enum(['customer', 'staff', 'vendor', 'system']).optional(),
  attachments: z.array(z.object({
    url: z.string().url(),
    filename: z.string(),
    type: z.string().optional(),
    size: z.number().optional(),
  })).optional(),
  is_internal: z.boolean().optional(),
});

const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  delivery_rating: z.number().int().min(1).max(5).optional(),
  product_rating: z.number().int().min(1).max(5).optional(),
  service_rating: z.number().int().min(1).max(5).optional(),
});

const createOrderIssueSchema = z.object({
  type: z.enum(['issue', 'return_request', 'inquiry']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  subject: z.string().min(3).optional(),
  description: z.string().min(10),
  vendor_related: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  channel: z.string().optional(),
  initial_message: z.string().optional(),
  customer_name: z.string().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Statistics (must be before :id routes)
// ---------------------------------------------------------------------------
router.get('/stats', getStatistics);

// ---------------------------------------------------------------------------
// Ticket CRUD
// ---------------------------------------------------------------------------

// List tickets (filtered by role)
router.get('/', listTickets);

// Create ticket (staff/admin only)
router.post('/', 
  authorize('admin', 'staff', 'operator'),
  validate(createTicketSchema),
  createTicket
);

// Get single ticket
router.get('/:id', getTicketById);

// Update ticket (staff/admin only)
router.patch('/:id',
  authorize('admin', 'staff', 'operator'),
  validate(updateTicketSchema),
  updateTicket
);

// ---------------------------------------------------------------------------
// Ticket Actions (staff/admin only)
// ---------------------------------------------------------------------------

// Assign ticket
router.post('/:id/assign',
  authorize('admin', 'staff'),
  validate(assignTicketSchema),
  assignTicket
);

// Escalate ticket
router.post('/:id/escalate',
  authorize('admin', 'staff', 'operator'),
  validate(escalateTicketSchema),
  escalateTicket
);

// Resolve ticket
router.post('/:id/resolve',
  authorize('admin', 'staff', 'operator'),
  validate(resolveTicketSchema),
  resolveTicket
);

// Close ticket
router.post('/:id/close',
  authorize('admin', 'staff'),
  closeTicket
);

// Reopen ticket
router.post('/:id/reopen',
  authorize('admin', 'staff'),
  validate(reopenTicketSchema),
  reopenTicket
);

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// Get messages
router.get('/:id/messages', getMessages);

// Add message (staff/admin/vendor can reply)
router.post('/:id/messages',
  validate(addMessageSchema),
  addMessage
);

// ---------------------------------------------------------------------------
// Feedback (can be public for customers)
// ---------------------------------------------------------------------------

// Submit feedback
router.post('/:id/submit-feedback',
  validate(submitFeedbackSchema),
  submitFeedback
);

// ---------------------------------------------------------------------------
// Activity Log (staff/admin only)
// ---------------------------------------------------------------------------

router.get('/:id/activity',
  authorize('admin', 'staff'),
  getActivityLog
);

// ---------------------------------------------------------------------------
// Order Issue Creation (from order context)
// ---------------------------------------------------------------------------

router.post('/from-order/:orderId',
  authorize('admin', 'staff', 'operator'),
  validate(createOrderIssueSchema),
  createOrderIssue
);

export default router;
