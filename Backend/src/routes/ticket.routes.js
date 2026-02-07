/**
 * Ticket Routes
 * 
 * Public: POST /tickets/public/complaint (no auth, phone verification)
 * Protected: All other routes require authentication
 */

import { Router } from 'express';
import * as ticketController from '../controllers/ticket.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createTicketSchema,
  updateTicketSchema,
  addCommentSchema,
  publicComplaintSchema,
  ticketListQuerySchema,
  ticketIdSchema,
} from '../validations/ticket.validation.js';

const router = Router();

// =============================================================================
// PUBLIC ROUTES (No authentication)
// =============================================================================

// Public complaint form submission
router.post(
  '/public/complaint',
  validateBody(publicComplaintSchema),
  ticketController.submitPublicComplaint
);

// =============================================================================
// PROTECTED ROUTES (All require authentication)
// =============================================================================

router.use(authenticate);

// Lookup order for ticket creation form
router.get('/lookup-order/:orderId', ticketController.lookupOrder);

// List tickets (with filters)
router.get(
  '/',
  validateQuery(ticketListQuerySchema),
  ticketController.listTickets
);

// Ticket stats
router.get('/stats', ticketController.getTicketStats);

// Get single ticket
router.get(
  '/:id',
  validateParams(ticketIdSchema),
  ticketController.getTicket
);

// Create ticket
router.post(
  '/',
  validateBody(createTicketSchema),
  ticketController.createTicket
);

// Update ticket
router.patch(
  '/:id',
  validateParams(ticketIdSchema),
  validateBody(updateTicketSchema),
  ticketController.updateTicket
);

// Add comment to ticket
router.post(
  '/:id/comments',
  validateParams(ticketIdSchema),
  validateBody(addCommentSchema),
  ticketController.addComment
);

// Escalate ticket (Review -> Support)
router.post(
  '/:id/escalate',
  validateParams(ticketIdSchema),
  ticketController.escalateTicket
);

export default router;
