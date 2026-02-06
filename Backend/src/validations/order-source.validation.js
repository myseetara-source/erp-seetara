/**
 * Order Source Validation Schemas
 * 
 * Zod schemas for validating order source CRUD requests.
 */

import { z } from 'zod';
import { uuidSchema, paginationSchema } from './common.validation.js';

// =============================================================================
// PARAM SCHEMAS
// =============================================================================

export const orderSourceIdSchema = z.object({
  id: uuidSchema,
});

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

export const orderSourceListQuerySchema = paginationSchema.extend({
  search: z.string().max(100).optional(),
  is_active: z.enum(['true', 'false']).optional(),
}).passthrough();

// =============================================================================
// BODY SCHEMAS
// =============================================================================

export const createOrderSourceSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim(),
  pixel_id: z.string()
    .max(255, 'Pixel ID cannot exceed 255 characters')
    .nullable()
    .optional(),
  is_active: z.boolean().default(true),
});

export const updateOrderSourceSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim()
    .optional(),
  pixel_id: z.string()
    .max(255)
    .nullable()
    .optional(),
  is_active: z.boolean().optional(),
});
