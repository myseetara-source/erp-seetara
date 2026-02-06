/**
 * Brand Validation Schemas
 * Zod schemas for all brand-related API endpoints
 */

import { z } from 'zod';

// =============================================================================
// SHARED
// =============================================================================

const uuidSchema = z.string().uuid('Invalid UUID format');

// =============================================================================
// PARAMS
// =============================================================================

export const brandIdSchema = z.object({
  id: uuidSchema,
});

// =============================================================================
// QUERY
// =============================================================================

export const brandListQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  is_active: z.enum(['true', 'false']).optional(),
}).passthrough();

// =============================================================================
// BODY
// =============================================================================

export const createBrandSchema = z.object({
  name: z.string()
    .min(2, 'Brand name must be at least 2 characters')
    .max(100, 'Brand name must be at most 100 characters')
    .trim(),
  logo_url: z.string().url().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const updateBrandSchema = z.object({
  name: z.string()
    .min(2, 'Brand name must be at least 2 characters')
    .max(100, 'Brand name must be at most 100 characters')
    .trim()
    .optional(),
  logo_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
});

export default {
  brandIdSchema,
  brandListQuerySchema,
  createBrandSchema,
  updateBrandSchema,
};
