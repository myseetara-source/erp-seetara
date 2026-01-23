/**
 * Inventory Routes
 * 
 * UNIFIED STOCK TRANSACTION SYSTEM
 * 
 * New Architecture (v2):
 * - POST /inventory/transactions       : Create unified transaction (Purchase/Return/Damage/Adjustment)
 * - GET  /inventory/transactions       : List all transactions with filtering
 * - GET  /inventory/transactions/:id   : Get single transaction with items
 * - POST /inventory/transactions/:id/void : Void a transaction (Admin only)
 * 
 * Legacy Routes (v1 - still functional):
 * - POST /inventory/adjustments  : Staff + Admin (operational)
 * - POST /inventory/damages      : Staff + Admin (operational)
 * - GET  /inventory/movements    : All authenticated (masked)
 * - GET  /inventory/valuation    : Admin ONLY (financial)
 * - GET  /inventory/low-stock    : All authenticated (operational)
 * 
 * RBAC Security:
 * - Admin: Full access including cost/financial data
 * - Staff: Quantity-only access (cost fields masked at API level)
 */

import { Router } from 'express';
// Unified controllers - all inventory operations use the transaction system
import inventoryController, {
  getInventoryValuation,
  getLowStockAlerts,
  getDashboardSummary,
  getProductMovementReport,
} from '../controllers/inventory.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { uuidSchema, paginationSchema } from '../validations/common.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// DASHBOARD SUMMARY - SINGLE CALL FOR ALL STATS
// =============================================================================
// This endpoint returns ALL dashboard data in ONE call to prevent 429 errors

/**
 * Get inventory dashboard summary (ADVANCED)
 * GET /inventory/dashboard
 * 
 * Returns comprehensive metrics:
 * - Total Stock Value (inventory valuation)
 * - Inventory Turnover (monthly in/out)
 * - Critical Stock (below threshold)
 * - Damage Loss (this month's loss)
 * - Stock Trend (7-day sparkline data)
 * - Pending Actions
 * - Recent Transactions
 * 
 * PERFORMANCE: Single RPC call instead of 5-6 separate API calls
 * SECURITY: All authenticated, financial data masked for non-admins
 */
router.get('/dashboard', getDashboardSummary);

/**
 * Get product movement report
 * GET /inventory/movement-report
 * 
 * Returns opening -> in -> out -> closing for each product
 * 
 * @query start_date - Period start (default: month start)
 * @query end_date - Period end (default: today)
 * @query product_id - Filter by product (optional)
 * @query limit - Max results (default: 50)
 */
router.get('/movement-report', getProductMovementReport);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createAdjustmentSchema = z.object({
  variant_id: uuidSchema,
  movement_type: z.enum(['adjustment', 'inward', 'outward', 'return', 'correction']),
  quantity: z.number().int().refine(val => val !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(3, 'Reason is required').max(500),
});

const reportDamageSchema = z.object({
  variant_id: uuidSchema,
  quantity: z.number().int().positive('Quantity must be positive'),
  reason: z.string().min(3, 'Damage description is required').max(500),
  damage_type: z.enum(['in_transit', 'warehouse', 'customer_return', 'expired', 'manufacturing']).optional(),
});

const movementQuerySchema = paginationSchema.extend({
  variant_id: uuidSchema.optional(),
  movement_type: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

// =============================================================================
// OPERATIONAL ROUTES - Staff + Admin
// =============================================================================

/**
 * Create stock adjustment (LEGACY - redirects to unified transaction)
 * POST /inventory/adjustments
 * 
 * SECURITY: Staff CAN create adjustments
 * Response hides financial impact for non-admins
 */
router.post(
  '/adjustments',
  validateBody(createAdjustmentSchema),
  inventoryController.createInventoryTransaction
);

/**
 * List stock adjustments (LEGACY - uses unified transaction list)
 * GET /inventory/adjustments
 * 
 * SECURITY: All authenticated, financial data masked
 */
router.get(
  '/adjustments',
  validateQuery(movementQuerySchema),
  inventoryController.listInventoryTransactions
);

/**
 * Report damage (LEGACY - redirects to unified transaction)
 * POST /inventory/damages
 * 
 * SECURITY: Staff CAN report damages
 * Response: "Stock Adjusted" (NO financial loss shown)
 */
router.post(
  '/damages',
  validateBody(reportDamageSchema),
  inventoryController.createInventoryTransaction
);

/**
 * List damages (LEGACY - uses unified transaction list)
 * GET /inventory/damages
 * 
 * SECURITY: All authenticated, loss amounts masked for non-admins
 */
router.get(
  '/damages',
  validateQuery(paginationSchema.extend({
    from_date: z.string().optional(),
    to_date: z.string().optional(),
  })),
  inventoryController.listInventoryTransactions
);

/**
 * Get stock movement history
 * GET /inventory/movements
 * 
 * SECURITY: All authenticated, cost data masked for non-admins
 */
router.get(
  '/movements',
  validateQuery(paginationSchema.extend({
    variant_id: uuidSchema,
  })),
  inventoryController.getVariantStockMovements
);

/**
 * Get low stock alerts
 * GET /inventory/low-stock
 * 
 * SECURITY: All authenticated (this is operational data)
 */
router.get(
  '/low-stock',
  validateQuery(z.object({
    threshold: z.coerce.number().int().positive().optional(),
  })),
  getLowStockAlerts
);

// =============================================================================
// ADMIN ONLY ROUTES - Financial Data
// =============================================================================

/**
 * Get inventory valuation
 * GET /inventory/valuation
 * 
 * SECURITY: Admin ONLY - This is pure financial data
 * Shows cost values, profit margins, etc.
 */
router.get(
  '/valuation',
  authorize('admin'),
  getInventoryValuation
);

// =============================================================================
// NEW UNIFIED TRANSACTION SYSTEM (v2)
// =============================================================================
//
// CRITICAL: Route order matters! Specific routes MUST come before parameterized routes.
// - /transactions/next-invoice BEFORE /transactions/:id
// - /transactions/pending BEFORE /transactions/:id
//

/**
 * List all inventory transactions
 * GET /inventory/transactions
 * 
 * @query page, limit, type, vendor_id, from_date, to_date, search
 * SECURITY: All authenticated, cost data masked for non-admins
 */
router.get('/transactions', inventoryController.listInventoryTransactions);

/**
 * Get next invoice number
 * GET /inventory/transactions/next-invoice
 * 
 * @query type (purchase|purchase_return|damage|adjustment)
 */
router.get('/transactions/next-invoice', inventoryController.getNextInvoiceNumber);

/**
 * List pending approvals
 * GET /inventory/transactions/pending
 * 
 * SECURITY: Admin ONLY
 * NOTE: Must be defined BEFORE /transactions/:id to prevent 'pending' being captured as an ID
 */
router.get(
  '/transactions/pending',
  authorize('admin'),
  inventoryController.listPendingApprovals
);

/**
 * Get single transaction with items
 * GET /inventory/transactions/:id
 * 
 * SECURITY: All authenticated, cost data masked for non-admins
 */
router.get('/transactions/:id', inventoryController.getInventoryTransaction);

/**
 * Create new inventory transaction
 * POST /inventory/transactions
 * 
 * Handles: PURCHASE, PURCHASE_RETURN, DAMAGE, ADJUSTMENT
 * SECURITY: Staff can create, cost data hidden from staff responses
 */
router.post('/transactions', inventoryController.createInventoryTransaction);

/**
 * Void an inventory transaction
 * POST /inventory/transactions/:id/void
 * 
 * SECURITY: Admin ONLY
 * @body reason (min 5 chars)
 */
router.post(
  '/transactions/:id/void',
  authorize('admin'),
  inventoryController.voidTransaction
);

/**
 * Approve a pending transaction
 * POST /inventory/transactions/:id/approve
 * 
 * SECURITY: Admin ONLY
 * Executes stock movement upon approval
 */
router.post(
  '/transactions/:id/approve',
  authorize('admin'),
  inventoryController.approveTransaction
);

/**
 * Reject a pending transaction
 * POST /inventory/transactions/:id/reject
 * 
 * SECURITY: Admin ONLY
 * @body reason (min 5 chars)
 */
router.post(
  '/transactions/:id/reject',
  authorize('admin'),
  inventoryController.rejectTransaction
);

/**
 * Get stock movements for a specific variant
 * GET /inventory/variants/:variantId/movements
 * 
 * SECURITY: All authenticated, cost data masked for non-admins
 */
router.get('/variants/:variantId/movements', inventoryController.getVariantStockMovements);

/**
 * Search purchase invoices (for Purchase Return linking)
 * GET /inventory/purchases/search
 * 
 * @query vendor_id, invoice_no, limit
 */
router.get('/purchases/search', inventoryController.searchPurchaseInvoices);

export default router;
