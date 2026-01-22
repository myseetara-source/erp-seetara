/**
 * Vendor Routes
 * 
 * SECURITY: Implements strict "Operational vs. Financial" separation.
 * 
 * Access Levels:
 * - /vendors (GET):     ALL authenticated users (for dropdown selection)
 * - /vendors (POST):    Admin only
 * - /vendors/:id (PATCH/DELETE): Admin only
 * - /vendors/:id/ledger: Admin only (financial data)
 * - /vendors/payments:  Admin only (financial transactions)
 * 
 * Data Visibility:
 * - Staff sees: {id, name, company_name} only
 * - Admin sees: Everything including balance, bank_details, ledger
 */

import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller.js';
import * as portalController from '../controllers/portal.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createVendorSchema,
  updateVendorSchema,
  vendorIdSchema,
  createVendorSupplySchema,
  receiveSupplySchema,
  createVendorPaymentSchema,
  vendorListQuerySchema,
  vendorLedgerQuerySchema,
  vendorSupplyListQuerySchema,
} from '../validations/vendor.validation.js';
import { uuidSchema } from '../validations/common.validation.js';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// VENDOR LIST - All Authenticated Users (for dropdown selection)
// =============================================================================

/**
 * List vendors
 * GET /vendors
 * 
 * SECURITY: All authenticated users can access for dropdown selection
 * Data masking is done in controller based on role:
 * - Staff: {id, name, company_name} only
 * - Admin: Full data including balance
 */
router.get(
  '/',
  // Allow all authenticated users (staff need this for purchase forms)
  validateQuery(vendorListQuerySchema),
  vendorController.listVendors
);

// =============================================================================
// VENDOR CRUD - Admin Only
// =============================================================================

/**
 * Create vendor
 * POST /vendors
 * 
 * SECURITY: Admin only - Staff cannot create vendors
 */
router.post(
  '/',
  authorize('admin'),
  validateBody(createVendorSchema),
  vendorController.createVendor
);

/**
 * Get vendor by ID
 * GET /vendors/:id
 * 
 * SECURITY: All authenticated, but data is masked in controller
 */
router.get(
  '/:id',
  validateParams(vendorIdSchema),
  vendorController.getVendor
);

/**
 * Update vendor
 * PATCH /vendors/:id
 * 
 * SECURITY: Admin only - Staff cannot modify vendor data
 */
router.patch(
  '/:id',
  authorize('admin'),
  validateParams(vendorIdSchema),
  validateBody(updateVendorSchema),
  vendorController.updateVendor
);

/**
 * Deactivate vendor (soft delete)
 * DELETE /vendors/:id
 * 
 * SECURITY: Admin only
 */
router.delete(
  '/:id',
  authorize('admin'),
  validateParams(vendorIdSchema),
  vendorController.deactivateVendor
);

/**
 * Toggle vendor active status
 * PATCH /vendors/:id/toggle-status
 * 
 * SECURITY: Admin only
 */
router.patch(
  '/:id/toggle-status',
  authorize('admin'),
  validateParams(vendorIdSchema),
  vendorController.toggleVendorStatus
);

/**
 * Get vendor summary/stats
 * GET /vendors/:id/summary
 * 
 * SECURITY: All authenticated, but financial stats masked for non-admins
 */
router.get(
  '/:id/summary',
  validateParams(vendorIdSchema),
  vendorController.getVendorSummary
);

/**
 * Get vendor stats (Fast endpoint for dashboard)
 * GET /vendors/:id/stats
 * 
 * SECURITY: Admin only - Returns financial aggregations
 * Response: { purchases, payments, returns, balance }
 */
router.get(
  '/:id/stats',
  authorize('admin'),
  validateParams(vendorIdSchema),
  vendorController.getVendorStats
);

/**
 * Get vendor ledger (hisab-kitab)
 * GET /vendors/:id/ledger
 * 
 * SECURITY: Admin only - This is PURE financial data
 */
router.get(
  '/:id/ledger',
  authorize('admin'),
  validateParams(vendorIdSchema),
  validateQuery(vendorLedgerQuerySchema),
  vendorController.getVendorLedger
);

/**
 * Get vendor transactions (combined stats + ledger)
 * GET /vendors/:id/transactions
 * 
 * ARCHITECTURE: O(1) Scalable
 * - Stats from denormalized columns (instant)
 * - Transaction history from vendor_ledger (paginated)
 * 
 * SECURITY: Admin only - Financial data
 */
router.get(
  '/:id/transactions',
  authorize('admin'),
  validateParams(vendorIdSchema),
  vendorController.getVendorTransactions
);

// =============================================================================
// SUPPLIES (Stock Purchases) - Staff can create, Admin can manage
// =============================================================================

/**
 * List supplies
 * GET /vendors/supplies
 * 
 * SECURITY: All authenticated (operational data)
 * Financial data is masked for non-admins in controller
 */
router.get(
  '/supplies',
  validateQuery(vendorSupplyListQuerySchema),
  vendorController.listSupplies
);

/**
 * Create supply (Stock In)
 * POST /vendors/supplies
 * 
 * SECURITY: All authenticated staff can create supplies
 * This is an OPERATIONAL action, not financial management
 * Financial impact is calculated in background, hidden from staff
 */
router.post(
  '/supplies',
  // Staff can create supplies (this is operational)
  validateBody(createVendorSupplySchema),
  vendorController.createSupply
);

/**
 * Get supply by ID
 * GET /vendors/supplies/:id
 * 
 * SECURITY: All authenticated, financial data masked for non-admins
 */
router.get(
  '/supplies/:id',
  validateParams(z.object({ id: uuidSchema })),
  vendorController.getSupply
);

/**
 * Receive supply items (Stock Receive)
 * POST /vendors/supplies/:id/receive
 * 
 * SECURITY: All authenticated staff can receive supplies
 * This is an OPERATIONAL action
 */
router.post(
  '/supplies/:id/receive',
  validateParams(z.object({ id: uuidSchema })),
  validateBody(receiveSupplySchema),
  vendorController.receiveSupply
);

// =============================================================================
// PAYMENTS - Admin Only (Financial Transactions)
// =============================================================================

/**
 * Record vendor payment (General endpoint)
 * POST /vendors/payments
 * 
 * SECURITY: Admin only - This is a FINANCIAL action
 * Staff cannot make payments to vendors
 */
router.post(
  '/payments',
  authorize('admin'),
  validateBody(createVendorPaymentSchema),
  vendorController.recordPayment
);

/**
 * Record payment for specific vendor
 * POST /vendors/:id/payment
 * 
 * SECURITY: Admin only - Financial action
 * Creates ledger entry automatically
 */
router.post(
  '/:id/payment',
  authorize('admin'),
  validateParams(vendorIdSchema),
  validateBody(z.object({
    amount: z.number().positive('Amount must be positive'),
    payment_method: z.enum(['cash', 'bank_transfer', 'cheque', 'esewa', 'khalti', 'connectips', 'other']).default('cash'),
    reference_number: z.string().optional(),
    notes: z.string().optional(),
  })),
  async (req, res, next) => {
    // Inject vendor_id from params into body for service
    req.body.vendor_id = req.params.id;
    vendorController.recordPayment(req, res, next);
  }
);

// =============================================================================
// VENDOR PORTAL ACCESS MANAGEMENT - Admin Only
// =============================================================================

/**
 * Create vendor portal access
 * POST /vendors/:id/access
 * 
 * SECURITY: Admin only - Creates portal login for vendor
 */
router.post(
  '/:id/access',
  authorize('admin'),
  validateParams(vendorIdSchema),
  validateBody(z.object({
    email: z.string().email('Valid email required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  })),
  portalController.createVendorAccess
);

/**
 * Revoke vendor portal access
 * DELETE /vendors/:id/access
 * 
 * SECURITY: Admin only - Deactivates vendor's portal login
 */
router.delete(
  '/:id/access',
  authorize('admin'),
  validateParams(vendorIdSchema),
  portalController.revokeVendorAccess
);

export default router;
