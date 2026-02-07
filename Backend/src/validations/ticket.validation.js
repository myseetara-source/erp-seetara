/**
 * Ticket Validation Schemas
 * Zod schemas for ticket CRUD, filtering, and public complaint form
 */

import { z } from 'zod';
import { uuidSchema, phoneSchema, paginationSchema } from './common.validation.js';

// =============================================================================
// ENUM SCHEMAS
// =============================================================================

export const ticketTypeSchema = z.enum(['support', 'review', 'investigation']);
export const ticketCategorySchema = z.enum([
  'complaint', 'tech_issue', 'rider_issue', 'feedback',
  'wrong_item', 'damaged_item', 'missing_item', 'late_delivery', 'other',
]);
export const ticketPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const ticketStatusSchema = z.enum(['open', 'processing', 'resolved', 'closed']);
export const ticketSourceSchema = z.enum([
  'manual_internal', 'public_form', 'auto_delivered', 'auto_rejected',
]);

// =============================================================================
// CREATE TICKET (Internal - Staff)
// =============================================================================

export const createTicketSchema = z.object({
  type: ticketTypeSchema.optional().default('support'),
  category: ticketCategorySchema.optional().default('other'),
  priority: ticketPrioritySchema.optional().default('medium'),
  source: ticketSourceSchema.optional().default('manual_internal'),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(255),
  description: z.string().max(5000).optional().nullable(),
  order_id: uuidSchema.optional().nullable(),
  assigned_to: uuidSchema.optional().nullable(),
  customer_name: z.string().max(255).optional().nullable(),
  customer_phone: z.string().max(20).optional().nullable(),
  metadata: z.record(z.any()).optional().default({}),
});

// =============================================================================
// UPDATE TICKET
// =============================================================================

export const updateTicketSchema = z.object({
  type: ticketTypeSchema.optional(),
  category: ticketCategorySchema.optional(),
  priority: ticketPrioritySchema.optional(),
  status: ticketStatusSchema.optional(),
  subject: z.string().min(3).max(255).optional(),
  description: z.string().max(5000).optional().nullable(),
  assigned_to: uuidSchema.optional().nullable(),
  metadata: z.record(z.any()).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

// =============================================================================
// ADD COMMENT
// =============================================================================

export const addCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(5000),
  is_internal: z.boolean().optional().default(true),
  attachments: z.array(z.object({
    url: z.string().url(),
    name: z.string(),
    type: z.string().optional(),
  })).optional().default([]),
});

// =============================================================================
// PUBLIC COMPLAINT FORM (No auth)
// =============================================================================

export const publicComplaintSchema = z.object({
  order_id: z.string().min(1, 'Order ID is required'),
  phone: z.string().min(10, 'Phone number is required').max(20),
  category: ticketCategorySchema.optional().default('complaint'),
  subject: z.string().min(3, 'Subject is required').max(255),
  description: z.string().max(5000).optional().nullable(),
  photo_url: z.string().url().optional().nullable(),
});

// =============================================================================
// LIST / FILTER TICKETS
// =============================================================================

export const ticketListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  type: ticketTypeSchema.optional(),
  status: z.string().optional(), // Comma-separated statuses
  priority: ticketPrioritySchema.optional(),
  category: ticketCategorySchema.optional(),
  source: ticketSourceSchema.optional(),
  assigned_to: z.string().optional(), // UUID or 'unassigned'
  search: z.string().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'priority', 'readable_id']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// =============================================================================
// PARAM SCHEMAS
// =============================================================================

export const ticketIdSchema = z.object({
  id: uuidSchema,
});
