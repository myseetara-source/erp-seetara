/**
 * Inventory Transaction Routes
 * 
 * Unified API endpoints for:
 * - PURCHASE: Stock In from vendors
 * - PURCHASE_RETURN: Return stock to vendors
 * - DAMAGE: Write-off damaged stock
 * - ADJUSTMENT: Manual stock corrections
 * 
 * RBAC:
 * - Admin: Full CRUD + void + view costs
 * - Staff: Create + List (no costs, no void)
 */

import { Router } from 'express';
import {
  listInventoryTransactions,
  getInventoryTransaction,
  createInventoryTransaction,
  getNextInvoiceNumber,
  getVariantStockMovements,
  voidInventoryTransaction,
} from '../controllers/inventory.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// =============================================================================
// PUBLIC ROUTES (None - all require authentication)
// =============================================================================

// =============================================================================
// AUTHENTICATED ROUTES
// =============================================================================

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/inventory/transactions
 * @desc    List all inventory transactions
 * @access  Staff+
 * @query   page, limit, type, vendor_id, from_date, to_date, search
 */
router.get('/transactions', listInventoryTransactions);

/**
 * @route   GET /api/v1/inventory/transactions/next-invoice
 * @desc    Get next available invoice number for a transaction type
 * @access  Staff+
 * @query   type (purchase|purchase_return|damage|adjustment)
 */
router.get('/transactions/next-invoice', getNextInvoiceNumber);

/**
 * @route   GET /api/v1/inventory/transactions/:id
 * @desc    Get single inventory transaction with items
 * @access  Staff+
 */
router.get('/transactions/:id', getInventoryTransaction);

/**
 * @route   POST /api/v1/inventory/transactions
 * @desc    Create a new inventory transaction
 * @access  Staff+
 * @body    transaction_type, invoice_no, vendor_id?, reason?, items[]
 */
router.post('/transactions', createInventoryTransaction);

/**
 * @route   GET /api/v1/inventory/variants/:variantId/movements
 * @desc    Get stock movements for a specific variant
 * @access  Staff+
 */
router.get('/variants/:variantId/movements', getVariantStockMovements);

// =============================================================================
// ADMIN ONLY ROUTES
// =============================================================================

/**
 * @route   POST /api/v1/inventory/transactions/:id/void
 * @desc    Void an inventory transaction
 * @access  Admin only
 * @body    reason
 */
router.post('/transactions/:id/void', authorize('admin'), voidInventoryTransaction);

// =============================================================================
// EXPORT
// =============================================================================

export default router;
