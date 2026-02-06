/**
 * Vendor Portal Routes
 * 
 * HIGH SECURITY - VIEW ONLY ENDPOINTS
 * 
 * All routes require:
 * 1. Authentication (JWT token)
 * 2. Vendor role verification
 * 3. vendor_id extraction from JWT (never from request)
 * 
 * No POST/PUT/DELETE endpoints for portal users
 */

import { Router } from 'express';
import * as portalController from '../controllers/portal.controller.js';
import { authenticate, authorizeVendor } from '../middleware/auth.middleware.js';
import { validateQuery, validateParams } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { uuidSchema, paginationSchema } from '../validations/common.validation.js';

const router = Router();

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * All portal routes require:
 * 1. Authentication
 * 2. Vendor role
 */
router.use(authenticate);

// Custom middleware to verify vendor role
const requireVendor = (req, res, next) => {
  if (req.user.role !== 'vendor') {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Vendor portal access only',
        code: 'VENDOR_ONLY',
      },
    });
  }
  
  // Note: auth middleware uses camelCase (vendorId), not snake_case (vendor_id)
  if (!req.user.vendorId) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Vendor account not properly configured',
        code: 'VENDOR_NOT_CONFIGURED',
      },
    });
  }
  
  next();
};

router.use(requireVendor);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// =============================================================================
// DASHBOARD
// =============================================================================

/**
 * Get vendor dashboard
 * GET /portal/dashboard
 * 
 * Returns: Balance, recent transactions, recent supplies, stats
 */
router.get('/dashboard', portalController.getDashboard);

// =============================================================================
// PROFILE
// =============================================================================

/**
 * Get vendor profile
 * GET /portal/profile
 * 
 * Returns: Vendor info (excluding sensitive fields)
 */
router.get('/profile', portalController.getProfile);

// =============================================================================
// TRANSACTIONS
// =============================================================================

/**
 * Get vendor transactions
 * GET /portal/transactions
 * 
 * Query params: page, limit, type
 */
router.get(
  '/transactions',
  validateQuery(paginationSchema.extend({
    type: z.enum(['income', 'expense', 'vendor_payment', 'refund', 'adjustment']).optional(),
  })),
  portalController.getTransactions
);

// =============================================================================
// SUPPLIES
// =============================================================================

/**
 * Get vendor supplies list
 * GET /portal/supplies
 */
router.get(
  '/supplies',
  validateQuery(paginationSchema.extend({
    status: z.enum(['pending', 'delivered', 'cancelled']).optional(),
  })),
  portalController.getSupplies
);

/**
 * Get single supply detail
 * GET /portal/supplies/:id
 */
router.get(
  '/supplies/:id',
  validateParams(z.object({ id: uuidSchema })),
  portalController.getSupplyDetail
);

// =============================================================================
// PAYMENTS
// =============================================================================

/**
 * Get vendor payments
 * GET /portal/payments
 */
router.get(
  '/payments',
  validateQuery(paginationSchema),
  portalController.getPayments
);

// =============================================================================
// LEDGER
// =============================================================================

/**
 * Get vendor ledger statement
 * GET /portal/ledger
 * 
 * Query params: startDate, endDate
 */
router.get(
  '/ledger',
  validateQuery(dateRangeSchema),
  portalController.getLedger
);

export default router;
