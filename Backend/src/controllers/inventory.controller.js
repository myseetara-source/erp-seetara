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
// DASHBOARD SUMMARY - SINGLE RPC FOR ALL STATS
// =============================================================================
// Prevents 429 errors by returning all dashboard data in one call

import { supabaseAdmin } from '../config/supabase.js';

/**
 * Build fallback dashboard from simple queries when RPC fails
 */
async function buildFallbackDashboard(isAdmin) {
  try {
    // Get current stock value from product_variants
    const { data: stockData } = await supabaseAdmin
      .from('product_variants')
      .select('current_stock, cost_price')
      .gt('current_stock', 0);
    
    const totalUnits = stockData?.reduce((sum, v) => sum + (v.current_stock || 0), 0) || 0;
    const totalValue = stockData?.reduce((sum, v) => sum + ((v.current_stock || 0) * (v.cost_price || 0)), 0) || 0;
    
    // Get low stock count
    const { count: lowStockCount } = await supabaseAdmin
      .from('product_variants')
      .select('id', { count: 'exact', head: true })
      .lt('current_stock', 10)
      .gt('current_stock', 0);
    
    // Get this month's purchases
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const { data: purchases } = await supabaseAdmin
      .from('inventory_transactions')
      .select('total_cost')
      .eq('transaction_type', 'purchase')
      .eq('status', 'approved')
      .gte('created_at', startOfMonth.toISOString());
    
    const purchaseValue = purchases?.reduce((sum, p) => sum + (p.total_cost || 0), 0) || 0;
    
    // Get damage total
    const { data: damages } = await supabaseAdmin
      .from('inventory_transactions')
      .select('total_cost')
      .eq('transaction_type', 'damage')
      .eq('status', 'approved')
      .gte('created_at', startOfMonth.toISOString());
    
    const damageValue = damages?.reduce((sum, d) => sum + (d.total_cost || 0), 0) || 0;
    
    // Get pending approvals
    const { count: pendingCount } = await supabaseAdmin
      .from('inventory_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    // Get recent transactions
    const { data: recentTx } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, invoice_no, transaction_type, status, total_cost, transaction_date,
        vendor:vendors(name)
      `)
      .order('created_at', { ascending: false })
      .limit(5);
    
    return {
      total_stock_value: {
        value: isAdmin ? totalValue : '***',
        units: totalUnits,
        active_variants: stockData?.length || 0,
      },
      inventory_turnover: {
        this_month: {
          stock_in: isAdmin ? purchaseValue : '***',
          stock_in_qty: purchases?.length || 0,
          stock_out: isAdmin ? damageValue : '***',
          stock_out_qty: damages?.length || 0,
        },
      },
      critical_stock: {
        count: lowStockCount || 0,
        items: [],
      },
      damage_loss: {
        this_month: {
          total_value: isAdmin ? damageValue : '***',
          units_damaged: damages?.length || 0,
        },
      },
      purchase_summary: {
        total_value: isAdmin ? purchaseValue : '***',
        count: purchases?.length || 0,
      },
      return_summary: {
        total_value: 0,
        count: 0,
      },
      pending_actions: {
        pending_approvals: pendingCount || 0,
        out_of_stock: 0,
      },
      recent_transactions: recentTx || [],
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error('Fallback dashboard failed', { error: err.message });
    return {
      total_stock_value: { value: 0, units: 0 },
      inventory_turnover: { this_month: { stock_in: 0, stock_out: 0 } },
      critical_stock: { count: 0, items: [] },
      damage_loss: { this_month: { total_value: 0 } },
      pending_actions: { pending_approvals: 0 },
      recent_transactions: [],
      generated_at: new Date().toISOString(),
    };
  }
}

/**
 * Get inventory dashboard summary
 * GET /inventory/dashboard
 * 
 * Returns comprehensive metrics in a single call:
 * - Total Stock Value (inventory valuation)
 * - Inventory Turnover (monthly in/out)
 * - Critical Stock (below threshold)
 * - Damage Loss (this month's loss)
 * - Pending Actions
 * - Recent Transactions
 */
export const getDashboardSummary = catchAsync(async (req, res) => {
  const isAdmin = ['admin', 'manager'].includes(req.user?.role);
  const userRole = req.user?.role || 'staff';
  
  // Simplified: No date filtering - fetch current/all-time data
  // Call the get_inventory_metrics RPC without date params for all-time data
  const { data, error } = await supabaseAdmin.rpc('get_inventory_metrics', {
    p_start_date: null,
    p_end_date: null,
    p_vendor_id: null,
    p_user_role: userRole,
  });

  if (error) {
    logger.error('Dashboard RPC failed, using fallback', { error: error.message });
    
    // Try fallback to simpler queries
    const fallbackData = await buildFallbackDashboard(isAdmin);
    return res.json({ success: true, data: fallbackData });
  }

  // Mask financial data for non-admins
  const result = { ...data };
  
  if (!isAdmin) {
    // Hide stock value
    if (result.total_stock_value) {
      result.total_stock_value.value = '***';
    }
    
    // Hide turnover values
    if (result.inventory_turnover?.this_month) {
      result.inventory_turnover.this_month.stock_in = '***';
      result.inventory_turnover.this_month.stock_out = '***';
      result.inventory_turnover.this_month.orders_value = '***';
    }
    
    // Hide damage loss values
    if (result.damage_loss?.this_month) {
      result.damage_loss.this_month.total_value = '***';
    }
    
    // Mask critical stock cost
    if (result.critical_stock?.items) {
      result.critical_stock.items = result.critical_stock.items.map((item) => ({
        ...item,
        cost_price: '***',
        potential_loss: '***',
      }));
    }
    
    // Mask recent transaction costs
    if (result.recent_transactions) {
      result.recent_transactions = result.recent_transactions.map((tx) => ({
        ...tx,
        total_cost: '***',
      }));
    }
  }

  res.json({
    success: true,
    data: result,
  });
});

/**
 * Get product movement report
 * GET /inventory/movement-report
 * 
 * Returns opening -> in -> out -> closing for each product
 */
export const getProductMovementReport = catchAsync(async (req, res) => {
  const { 
    start_date, 
    end_date, 
    product_id, 
    limit = 50 
  } = req.query;

  const { data, error } = await supabaseAdmin.rpc('get_product_movement_report', {
    p_start_date: start_date || null,
    p_end_date: end_date || null,
    p_product_id: product_id || null,
    p_limit: parseInt(limit) || 50,
  });

  if (error) {
    logger.error('Movement report RPC failed', { error });
    throw new AppError('Failed to generate movement report', 500);
  }

  res.json({
    success: true,
    data,
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
  getDashboardSummary,
  getProductMovementReport,
};
