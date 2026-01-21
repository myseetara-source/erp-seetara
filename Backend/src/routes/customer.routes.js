/**
 * Customer Routes
 * 
 * Customer 360 API Endpoints
 * 
 * Public routes (all authenticated):
 * - GET /customers - List customers with ranking
 * - GET /customers/:id - Get customer
 * - GET /customers/:id/360 - Full 360 profile
 * 
 * Admin routes:
 * - POST /customers/:id/block - Block/unblock
 * - DELETE /customers/:id - Delete customer
 */

import { Router } from 'express';
import * as customerController from '../controllers/customer.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { uuidSchema, paginationSchema } from '../validations/common.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const customerIdSchema = z.object({
  id: uuidSchema,
});

const createCustomerSchema = z.object({
  name: z.string().min(2).max(255),
  phone: z.string().min(10).max(20),
  alt_phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  address_line1: z.string().max(500).optional(),
  address_line2: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

const blockCustomerSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().max(500).optional(),
});

const addTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(50)).min(1),
});

const listCustomersQuerySchema = paginationSchema.extend({
  sortBy: z.enum(['customer_score', 'total_spent', 'total_orders', 'created_at', 'last_order_at', 'name']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
  tier: z.enum(['new', 'regular', 'vip', 'gold', 'platinum', 'warning', 'blacklisted']).optional(),
  segment: z.enum(['vip', 'warning', 'blacklisted', 'new', 'dormant', 'high_returns']).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  isBlocked: z.coerce.boolean().optional(),
});

// =============================================================================
// ANALYTICS ROUTES (Must be before /:id routes)
// =============================================================================

/**
 * Get customer statistics
 * GET /customers/stats
 */
router.get(
  '/stats',
  customerController.getStats
);

/**
 * Get top customers
 * GET /customers/top
 */
router.get(
  '/top',
  validateQuery(z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    by: z.enum(['total_spent', 'total_orders', 'customer_score']).optional(),
  })),
  customerController.getTopCustomers
);

// =============================================================================
// LIST & SEARCH
// =============================================================================

/**
 * List customers with ranking
 * GET /customers
 */
router.get(
  '/',
  validateQuery(listCustomersQuerySchema),
  customerController.listCustomers
);

// =============================================================================
// SINGLE CUSTOMER ROUTES
// =============================================================================

/**
 * Get customer by ID
 * GET /customers/:id
 */
router.get(
  '/:id',
  validateParams(customerIdSchema),
  customerController.getCustomer
);

/**
 * Get Customer 360 Profile
 * GET /customers/:id/360
 */
router.get(
  '/:id/360',
  validateParams(customerIdSchema),
  customerController.getCustomer360
);

/**
 * Get customer order history
 * GET /customers/:id/orders
 */
router.get(
  '/:id/orders',
  validateParams(customerIdSchema),
  validateQuery(paginationSchema.extend({
    status: z.string().optional(),
  })),
  customerController.getOrderHistory
);

/**
 * Create customer
 * POST /customers
 */
router.post(
  '/',
  validateBody(createCustomerSchema),
  customerController.createCustomer
);

/**
 * Update customer
 * PATCH /customers/:id
 */
router.patch(
  '/:id',
  validateParams(customerIdSchema),
  validateBody(updateCustomerSchema),
  customerController.updateCustomer
);

/**
 * Block/Unblock customer
 * POST /customers/:id/block
 * 
 * Admin only
 */
router.post(
  '/:id/block',
  authorize('admin'),
  validateParams(customerIdSchema),
  validateBody(blockCustomerSchema),
  customerController.setBlockStatus
);

/**
 * Add tags to customer
 * POST /customers/:id/tags
 */
router.post(
  '/:id/tags',
  validateParams(customerIdSchema),
  validateBody(addTagsSchema),
  customerController.addTags
);

/**
 * Remove tag from customer
 * DELETE /customers/:id/tags/:tag
 */
router.delete(
  '/:id/tags/:tag',
  validateParams(z.object({
    id: uuidSchema,
    tag: z.string().min(1),
  })),
  customerController.removeTag
);

// =============================================================================
// INTERNAL ROUTE (Used by Order Service)
// =============================================================================

/**
 * Find or create customer
 * POST /customers/find-or-create
 */
router.post(
  '/find-or-create',
  validateBody(z.object({
    name: z.string().optional(),
    phone: z.string().min(10),
    email: z.string().email().optional(),
    address_line1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    ip_address: z.string().optional(),
    fbid: z.string().optional(),
    fbclid: z.string().optional(),
    gclid: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
  })),
  customerController.findOrCreate
);

export default router;
