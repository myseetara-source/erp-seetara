/**
 * Inventory Controller (Enterprise Grade - Skinny Controller Pattern)
 * 
 * ============================================================================
 * ARCHITECTURE: Clean Controller (Traffic Police)
 * ============================================================================
 * 
 * This controller handles ONLY:
 * ├── Request Validation (Zod)
 * ├── Authorization Checks
 * ├── Call Service Layer
 * ├── Response Formatting
 * └── Data Masking (RBAC)
 * 
 * NO DIRECT DATABASE CALLS ALLOWED IN THIS FILE
 * All business logic is in: services/inventory.service.js
 * 
 * SECURITY:
 * - Admin: Full access including cost/financial data
 * - Staff: Quantity-only access (cost fields masked)
 * 
 * @module controllers/inventory.controller
 */

import { inventoryService } from '../services/inventory.service.js';
import {
  createInventoryTransactionSchema,
  listTransactionsQuerySchema,
  transactionTypeConfig,
} from '../validations/inventory.validation.js';
import { AppError, catchAsync } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('InventoryController');

// =============================================================================
// HELPER: Mask sensitive data for non-admin users
// =============================================================================

/**
 * Mask financial data (cost_price, unit_cost, etc.) for non-admin users
 * 
 * @param {Object|Array} data - Data to mask
 * @param {boolean} isAdmin - Whether user is admin
 * @returns {Object|Array} Masked data
 */
function maskFinancials(data, isAdmin) {
  if (isAdmin) return data;

  if (Array.isArray(data)) {
    return data.map(item => maskFinancials(item, isAdmin));
  }

  if (!data || typeof data !== 'object') return data;

  const masked = { ...data };
  
  // Remove financial fields
  delete masked.total_cost;
  delete masked.calculated_total_cost;
  delete masked.unit_cost;

  // Mask vendor balance
  if (masked.vendor) {
    masked.vendor = {
      id: masked.vendor.id,
      name: masked.vendor.name,
      company_name: masked.vendor.company_name,
    };
  }

  // Mask items
  if (masked.items && Array.isArray(masked.items)) {
    masked.items = masked.items.map(item => {
      const maskedItem = { ...item };
      delete maskedItem.unit_cost;
      return maskedItem;
    });
  }

  return masked;
}

// =============================================================================
// LIST INVENTORY TRANSACTIONS
// =============================================================================

/**
 * List inventory transactions with filters and pagination
 * GET /inventory/transactions
 */
export const listInventoryTransactions = catchAsync(async (req, res) => {
  // Validate query params
  const queryResult = listTransactionsQuerySchema.safeParse(req.query);
  
  if (!queryResult.success) {
    throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR', {
      details: queryResult.error.flatten().fieldErrors,
    });
  }

  const isAdmin = req.user?.role === 'admin';

  // Call service
  const { data, count } = await inventoryService.listTransactions(queryResult.data);

  // Mask financials for non-admin
  const maskedData = maskFinancials(data, isAdmin);

  res.json({
    success: true,
    data: maskedData,
    pagination: {
      page: queryResult.data.page,
      limit: queryResult.data.limit,
      total: count,
      totalPages: Math.ceil(count / queryResult.data.limit),
    },
  });
});

// =============================================================================
// GET SINGLE INVENTORY TRANSACTION
// =============================================================================

/**
 * Get transaction by ID with all related data
 * GET /inventory/transactions/:id
 */
export const getInventoryTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user?.role === 'admin';

  // Call service
  const transaction = await inventoryService.getTransactionById(id);

  // Mask financials for non-admin
  const responseData = maskFinancials(transaction, isAdmin);

  res.json({
    success: true,
    data: responseData,
  });
});

// =============================================================================
// CREATE INVENTORY TRANSACTION
// =============================================================================

/**
 * Create a new inventory transaction
 * POST /inventory/transactions
 * 
 * Supports: purchase, purchase_return, damage, adjustment
 */
export const createInventoryTransaction = catchAsync(async (req, res) => {
  // Validate request body
  const result = createInventoryTransactionSchema.safeParse(req.body);

  if (!result.success) {
    logger.debug('Validation failed', { errors: result.error.flatten() });
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
      details: result.error.flatten().fieldErrors,
    });
  }

  const userId = req.user?.id;
  const userRole = req.user?.role || 'staff';

  if (!userId) {
    throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
  }

  // Additional type-specific validation
  const config = transactionTypeConfig[result.data.transaction_type];
  
  if (config.vendorRequired && !result.data.vendor_id) {
    throw new AppError('Vendor is required for this transaction type', 400, 'VENDOR_REQUIRED');
  }

  if (config.reasonRequired && (!result.data.reason || result.data.reason.length < 5)) {
    throw new AppError('Reason is required (min 5 characters)', 400, 'REASON_REQUIRED');
  }

  // Call service
  const transaction = await inventoryService.createTransaction(result.data, userId, userRole);

  // Build response message
  const statusMessage = transaction.requires_approval
    ? `${config.label} submitted for approval. Stock will be updated after admin approval.`
    : `${config.label} created successfully.`;

  logger.info('Transaction created via controller', {
    id: transaction.id,
    type: result.data.transaction_type,
    userId,
  });

  res.status(201).json({
    success: true,
    message: statusMessage,
    data: transaction,
  });
});

// =============================================================================
// GET NEXT INVOICE NUMBER
// =============================================================================

/**
 * Get next invoice number for a transaction type
 * GET /inventory/transactions/next-invoice?type=purchase
 */
export const getNextInvoiceNumber = catchAsync(async (req, res) => {
  const { type } = req.query;

  if (!type || !['purchase', 'purchase_return', 'damage', 'adjustment'].includes(type)) {
    throw new AppError('Invalid transaction type', 400, 'VALIDATION_ERROR');
  }

  // Call service
  const invoiceNo = await inventoryService.getNextInvoiceNumber(type);

  res.json({
    success: true,
    data: { invoice_no: invoiceNo },
  });
});

// =============================================================================
// GET VARIANT STOCK MOVEMENTS
// =============================================================================

/**
 * Get stock movement history for a product variant
 * GET /inventory/variants/:variantId/movements
 */
export const getVariantStockMovements = catchAsync(async (req, res) => {
  const { variantId } = req.params;
  const { limit = 50 } = req.query;
  const isAdmin = req.user?.role === 'admin';

  // Call service
  const movements = await inventoryService.getVariantStockMovements(variantId, Number(limit));

  // Mask cost for non-admins
  const maskedData = maskFinancials(movements, isAdmin);

  res.json({
    success: true,
    data: maskedData,
  });
});

// =============================================================================
// VOID TRANSACTION (Admin only)
// =============================================================================

/**
 * Void an existing transaction
 * POST /inventory/transactions/:id/void
 */
export const voidTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.length < 10) {
    throw new AppError('Void reason is required (min 10 characters)', 400, 'VALIDATION_ERROR');
  }

  // Call service
  await inventoryService.voidTransaction(id, reason, req.user?.id);

  res.json({
    success: true,
    message: 'Transaction voided successfully',
  });
});

// =============================================================================
// LIST PENDING APPROVALS (Admin only)
// =============================================================================

/**
 * Get all pending transactions for approval
 * GET /inventory/transactions/pending
 */
export const listPendingApprovals = catchAsync(async (req, res) => {
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Only admins can view pending approvals', 403, 'FORBIDDEN');
  }

  // Call service
  const { data, count } = await inventoryService.listPendingApprovals();

  res.json({
    success: true,
    data,
    meta: { count },
  });
});

// =============================================================================
// APPROVE TRANSACTION (Admin only)
// =============================================================================

/**
 * Approve a pending transaction
 * POST /inventory/transactions/:id/approve
 */
export const approveTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const approverId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Only admins can approve transactions', 403, 'FORBIDDEN');
  }

  // Call service
  const transaction = await inventoryService.approveTransaction(id, approverId);

  res.json({
    success: true,
    message: 'Transaction approved successfully. Stock and vendor balance updated.',
    data: transaction,
  });
});

// =============================================================================
// REJECT TRANSACTION (Admin only)
// =============================================================================

/**
 * Reject a pending transaction
 * POST /inventory/transactions/:id/reject
 */
export const rejectTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const rejectorId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Only admins can reject transactions', 403, 'FORBIDDEN');
  }

  if (!reason || reason.length < 5) {
    throw new AppError('Rejection reason is required (min 5 characters)', 400, 'VALIDATION_ERROR');
  }

  // Call service
  const transaction = await inventoryService.rejectTransaction(id, reason, rejectorId);

  res.json({
    success: true,
    message: 'Transaction rejected',
    data: transaction,
  });
});

// =============================================================================
// SEARCH PURCHASE INVOICES (For linking returns)
// =============================================================================

/**
 * Search purchase invoices for return linking
 * GET /inventory/purchases/search
 */
export const searchPurchaseInvoices = catchAsync(async (req, res) => {
  const { vendor_id, invoice_no, limit = 20 } = req.query;

  // Call service
  const invoices = await inventoryService.searchPurchaseInvoices({
    vendor_id,
    invoice_no,
    limit: Number(limit),
  });

  res.json({
    success: true,
    data: invoices,
  });
});

// =============================================================================
// GET INVENTORY VALUATION (Admin only)
// =============================================================================

/**
 * Calculate total inventory valuation at cost
 * GET /inventory/valuation
 */
export const getInventoryValuation = catchAsync(async (req, res) => {
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  // Call service
  const valuation = await inventoryService.getInventoryValuation();

  res.json({
    success: true,
    data: valuation,
  });
});

// =============================================================================
// GET LOW STOCK ALERTS
// =============================================================================

/**
 * Get variants with stock below threshold
 * GET /inventory/alerts/low-stock
 */
export const getLowStockAlerts = catchAsync(async (req, res) => {
  const { threshold = 10 } = req.query;

  // Call service
  const alerts = await inventoryService.getLowStockAlerts(Number(threshold));

  res.json({
    success: true,
    data: alerts,
    meta: { threshold: Number(threshold), count: alerts.length },
  });
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  listInventoryTransactions,
  getInventoryTransaction,
  createInventoryTransaction,
  getNextInvoiceNumber,
  getVariantStockMovements,
  voidTransaction,
  listPendingApprovals,
  approveTransaction,
  rejectTransaction,
  searchPurchaseInvoices,
  getInventoryValuation,
  getLowStockAlerts,
};
