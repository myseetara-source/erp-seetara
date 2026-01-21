/**
 * Purchase Routes
 * 
 * SECURITY: Implements strict "Operational vs. Financial" separation.
 * 
 * Access Rules:
 * - POST /purchases        : Staff can CREATE (operational work)
 * - GET  /purchases        : All authenticated (data masked for non-admins)
 * - GET  /purchases/:id    : All authenticated (data masked for non-admins)
 * - POST /purchases/:id/pay: Admin ONLY (financial action)
 * - POST /purchases/:id/return: Staff can process (financial impact hidden)
 * - GET  /purchases/stats  : Admin ONLY (financial data)
 * 
 * Data masking is handled in controller layer based on user role.
 */

import { Router } from 'express';
import {
  createPurchase,
  listPurchases,
  getPurchase,
  recordPayment,
  processReturn,
  getPurchaseStats,
  getMyRecentPurchases,
} from '../controllers/purchase.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { uuidSchema, priceSchema, paginationSchema } from '../validations/common.validation.js';

const router = Router();

// =============================================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =============================================================================
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createPurchaseSchema = z.object({
  vendor_id: uuidSchema,
  items: z.array(z.object({
    variant_id: uuidSchema,
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    unit_cost: priceSchema,
  })).min(1, 'At least one item is required'),
  invoice_number: z.string().max(100).optional(),
  invoice_date: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

const recordPaymentSchema = z.object({
  amount: z.number().positive('Payment amount must be positive'),
  payment_mode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque']),
  reference_number: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

const processReturnSchema = z.object({
  items: z.array(z.object({
    variant_id: uuidSchema,
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    reason: z.string().min(3, 'Reason is required').max(500),
  })).min(1, 'At least one item is required'),
  notes: z.string().max(1000).optional(),
});

const purchaseIdSchema = z.object({
  id: uuidSchema,
});

const purchaseListQuerySchema = paginationSchema.extend({
  vendor_id: uuidSchema.optional(),
  status: z.enum(['pending', 'partial', 'received', 'paid', 'cancelled']).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().optional(),
});

// =============================================================================
// ADMIN ONLY ROUTES - Financial Data
// =============================================================================

/**
 * Get purchase statistics
 * GET /purchases/stats
 * 
 * SECURITY: Admin ONLY - Pure financial data
 */
router.get(
  '/stats',
  authorize('admin'),
  getPurchaseStats
);

// =============================================================================
// OPERATIONAL ROUTES - Staff + Admin
// =============================================================================

/**
 * Get my recent purchases (current user)
 * GET /purchases/my-recent
 * 
 * SECURITY: All authenticated, data masked for non-admins
 */
router.get(
  '/my-recent',
  getMyRecentPurchases
);

/**
 * Create new purchase (stock injection)
 * POST /purchases
 * 
 * SECURITY: Staff CAN create purchases
 * - This is OPERATIONAL work (adding stock)
 * - Financial impact calculated in background
 * - Response is masked for non-admins (hides totals, vendor balance)
 */
router.post(
  '/',
  // No authorize() - all authenticated staff can create purchases
  validateBody(createPurchaseSchema),
  createPurchase
);

/**
 * List all purchases
 * GET /purchases
 * 
 * SECURITY: All authenticated, data masked for non-admins
 */
router.get(
  '/',
  validateQuery(purchaseListQuerySchema),
  listPurchases
);

/**
 * Get purchase details
 * GET /purchases/:id
 * 
 * SECURITY: All authenticated, data masked for non-admins
 */
router.get(
  '/:id',
  validateParams(purchaseIdSchema),
  getPurchase
);

/**
 * Process purchase return
 * POST /purchases/:id/return
 * 
 * SECURITY: Staff CAN process returns
 * - This is OPERATIONAL work
 * - Backend adjusts vendor ledger
 * - Response hides financial impact for non-admins
 */
router.post(
  '/:id/return',
  // No authorize() - all authenticated staff can process returns
  validateParams(purchaseIdSchema),
  validateBody(processReturnSchema),
  processReturn
);

// =============================================================================
// FINANCIAL ROUTES - Admin ONLY
// =============================================================================

/**
 * Record payment against purchase
 * POST /purchases/:id/pay
 * 
 * SECURITY: Admin ONLY - This is a FINANCIAL action
 * Staff cannot make payments to vendors
 */
router.post(
  '/:id/pay',
  authorize('admin'),
  validateParams(purchaseIdSchema),
  validateBody(recordPaymentSchema),
  recordPayment
);

export default router;
