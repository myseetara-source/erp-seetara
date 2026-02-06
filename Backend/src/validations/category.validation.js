/**
 * Category Validation Schemas
 * Zod schemas for all category-related API endpoints
 */

import { z } from 'zod';

// =============================================================================
// SHARED
// =============================================================================

const uuidSchema = z.string().uuid('Invalid UUID format');

// =============================================================================
// PARAMS
// =============================================================================

export const categoryIdSchema = z.object({
  id: uuidSchema,
});

// =============================================================================
// QUERY
// =============================================================================

export const categoryListQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  is_active: z.enum(['true', 'false']).optional(),
}).passthrough();

// =============================================================================
// BODY
// =============================================================================

export const createCategorySchema = z.object({
  name: z.string()
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name must be at most 100 characters')
    .trim(),
  parent_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const updateCategorySchema = z.object({
  name: z.string()
    .min(2, 'Category name must be at least 2 characters')
    .max(100, 'Category name must be at most 100 characters')
    .trim()
    .optional(),
  parent_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).optional(),
});

export default {
  categoryIdSchema,
  categoryListQuerySchema,
  createCategorySchema,
  updateCategorySchema,
};
