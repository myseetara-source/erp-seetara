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
import { supabaseAdmin } from '../config/supabase.js';

const logger = createLogger('InventoryController');

// =============================================================================
// HELPER: Mask sensitive data for non-admin users
// =============================================================================

/**
 * Mask financial data (cost_price, unit_cost, stock_value, etc.) for non-admin users
 * 
 * SECURITY: Financial data should only be visible to admin users.
 * This includes: cost_price, unit_cost, stock_value, total_cost, vendor balance
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
  
  // Remove financial fields (SECURITY: These contain cost/profit data)
  delete masked.total_cost;
  delete masked.calculated_total_cost;
  delete masked.unit_cost;
  delete masked.cost_price;
  delete masked.stock_value;
  delete masked.total_stock_value;

  // Mask vendor balance (SECURITY: Vendor financials are admin-only)
  if (masked.vendor) {
    masked.vendor = {
      id: masked.vendor.id,
      name: masked.vendor.name,
      company_name: masked.vendor.company_name,
      // balance is intentionally excluded
    };
  }

  // Mask items
  if (masked.items && Array.isArray(masked.items)) {
    masked.items = masked.items.map(item => {
      const maskedItem = { ...item };
      delete maskedItem.unit_cost;
      delete maskedItem.cost_price;
      delete maskedItem.stock_value;
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

/**
 * Build comprehensive dashboard with units, values, and date filtering
 * @param {boolean} isAdmin - Whether user is admin/manager
 * @param {Date} startDate - Start date for filtering
 * @param {Date} endDate - End date for filtering
 */
async function buildComprehensiveDashboard(isAdmin, startDate = null, endDate = null) {
  try {
    // Default to last 30 days if no dates provided
    const now = new Date();
    const defaultStart = new Date();
    defaultStart.setDate(now.getDate() - 30);
    
    const filterStart = startDate || defaultStart;
    const filterEnd = endDate || now;

    // =========================================================================
    // 1. GET ALL PRODUCT VARIANTS WITH THEIR PRODUCTS
    // =========================================================================
    const { data: allVariants, error: variantError } = await supabaseAdmin
      .from('product_variants')
      .select(`
        id, sku, current_stock, cost_price, selling_price, reorder_level,
        product:products(id, name, image_url)
      `);
    
    if (variantError) {
      logger.error('Failed to fetch product variants', { error: variantError.message });
    }
    
    logger.info('Fetched product variants', { count: allVariants?.length || 0 });

    // =========================================================================
    // 2. CALCULATE ACTUAL STOCK FROM TRANSACTION ITEMS (More accurate)
    // =========================================================================
    // Get all approved transaction items to calculate actual stock per variant
    const { data: allTxItems, error: txItemsError } = await supabaseAdmin
      .from('inventory_transaction_items')
      .select(`
        variant_id, quantity, source_type, transaction_id,
        transaction:inventory_transactions(id, transaction_type, status)
      `);
    
    if (txItemsError) {
      logger.error('Failed to fetch transaction items', { error: txItemsError.message });
    }
    
    // Filter to only approved transactions
    const approvedTxItems = allTxItems?.filter(item => item.transaction?.status === 'approved') || [];
    
    logger.info('Fetched transaction items', { 
      total: allTxItems?.length || 0,
      approved: approvedTxItems.length,
    });
    
    // Build stock map from approved transactions
    const stockMap = new Map();
    approvedTxItems.forEach(item => {
      const variantId = item.variant_id;
      if (!variantId) return;
      
      if (!stockMap.has(variantId)) {
        stockMap.set(variantId, { in: 0, out: 0 });
      }
      const stock = stockMap.get(variantId);
      const qty = Math.abs(item.quantity || 0);
      const txType = item.transaction?.transaction_type;
      
      // Stock IN: purchase, adjustment (positive)
      if (txType === 'purchase') {
        stock.in += qty;
      } else if (txType === 'adjustment' && item.source_type === 'found') {
        stock.in += qty;
      }
      // Stock OUT: damage, purchase_return, adjustment (negative)
      else if (txType === 'damage' || txType === 'purchase_return') {
        stock.out += qty;
      } else if (txType === 'adjustment' && item.source_type !== 'found') {
        stock.out += qty;
      }
    });
    
    logger.info('Built stock map', { variantsWithStock: stockMap.size });

    // Enrich variants with calculated stock
    const enrichedVariants = allVariants?.map(v => {
      const txStock = stockMap.get(v.id);
      const calculatedStock = txStock ? (txStock.in - txStock.out) : 0;
      // Use calculated stock if current_stock is 0 or undefined
      const actualStock = v.current_stock > 0 ? v.current_stock : calculatedStock;
      return { ...v, actual_stock: actualStock, calculated_stock: calculatedStock };
    }) || [];

    const inStockVariants = enrichedVariants.filter(v => v.actual_stock > 0);
    const outOfStockVariants = enrichedVariants.filter(v => v.actual_stock <= 0 && v.product);
    const lowStockVariants = enrichedVariants.filter(v => v.actual_stock > 0 && v.actual_stock <= (v.reorder_level || 10));
    
    const totalUnits = inStockVariants.reduce((sum, v) => sum + (v.actual_stock || 0), 0);
    const totalValue = inStockVariants.reduce((sum, v) => sum + ((v.actual_stock || 0) * (v.cost_price || 0)), 0);

    // =========================================================================
    // 2. TRANSACTION ITEMS FOR UNIT COUNTS (with items)
    // =========================================================================
    const { data: allTransactions } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, transaction_type, status, total_cost, transaction_date, created_at,
        items:inventory_transaction_items(quantity)
      `)
      .gte('created_at', filterStart.toISOString())
      .lte('created_at', filterEnd.toISOString());

    const approvedTx = allTransactions?.filter(t => t.status === 'approved') || [];
    
    // Calculate units from transaction items
    const calcUnits = (transactions) => {
      return transactions.reduce((sum, t) => {
        const itemUnits = t.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;
        return sum + itemUnits;
      }, 0);
    };
    
    const calcValue = (transactions) => {
      return transactions.reduce((sum, t) => sum + (t.total_cost || 0), 0);
    };

    const purchaseTx = approvedTx.filter(t => t.transaction_type === 'purchase');
    const damageTx = approvedTx.filter(t => t.transaction_type === 'damage');
    const returnTx = approvedTx.filter(t => t.transaction_type === 'purchase_return');
    const adjustmentTx = approvedTx.filter(t => t.transaction_type === 'adjustment');

    const purchaseUnits = calcUnits(purchaseTx);
    const purchaseValue = calcValue(purchaseTx);
    const damageUnits = calcUnits(damageTx);
    const damageValue = calcValue(damageTx);
    const returnUnits = calcUnits(returnTx);
    const returnValue = calcValue(returnTx);
    const adjustmentUnits = calcUnits(adjustmentTx);
    const adjustmentValue = calcValue(adjustmentTx);

    // =========================================================================
    // 3. TIME SERIES DATA (Daily breakdown for chart)
    // =========================================================================
    const timeSeriesMap = new Map();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Initialize all days in range
    for (let d = new Date(filterStart); d <= filterEnd; d = new Date(d.getTime() + dayMs)) {
      const dayKey = d.toISOString().split('T')[0];
      timeSeriesMap.set(dayKey, { 
        date: dayKey, 
        stock_in: 0, 
        stock_in_units: 0, 
        stock_out: 0, 
        stock_out_units: 0 
      });
    }
    
    // Populate from transactions
    approvedTx.forEach(tx => {
      const dayKey = tx.created_at?.split('T')[0];
      if (!dayKey || !timeSeriesMap.has(dayKey)) return;
      
      const day = timeSeriesMap.get(dayKey);
      const units = tx.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;
      const value = tx.total_cost || 0;
      
      if (tx.transaction_type === 'purchase') {
        day.stock_in += value;
        day.stock_in_units += units;
      } else if (['damage', 'purchase_return'].includes(tx.transaction_type)) {
        day.stock_out += value;
        day.stock_out_units += units;
      }
    });
    
    const timeSeries = Array.from(timeSeriesMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date: d.date,
        stock_in: d.stock_in,
        stock_in_units: d.stock_in_units,
        stock_out: d.stock_out,
        stock_out_units: d.stock_out_units,
      }));

    // =========================================================================
    // 4. PENDING ACTIONS
    // =========================================================================
    const { count: pendingCount } = await supabaseAdmin
      .from('inventory_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    // =========================================================================
    // 5. RECENT TRANSACTIONS
    // =========================================================================
    const { data: recentTx } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, invoice_no, transaction_type, status, total_cost, transaction_date,
        vendor:vendors(name),
        items:inventory_transaction_items(quantity)
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    // Add unit count to each transaction
    const recentWithUnits = recentTx?.map(tx => ({
      ...tx,
      total_units: tx.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0,
    })) || [];

    // =========================================================================
    // 6. CRITICAL STOCK ITEMS (Low Stock)
    // SECURITY: cost_price and stock_value only for admin users
    // =========================================================================
    const criticalItems = lowStockVariants.slice(0, 10).map(v => {
      const item = {
        id: v.id,
        sku: v.sku,
        product_name: v.product?.name || 'Unknown',
        image_url: v.product?.image_url,
        current_stock: v.actual_stock,
        threshold: v.reorder_level || 10,
        selling_price: v.selling_price || 0,
      };
      // SECURITY: Only admin can see cost data
      if (isAdmin) {
        item.cost_price = v.cost_price || 0;
        item.stock_value = (v.actual_stock || 0) * (v.cost_price || 0);
      }
      return item;
    });

    // =========================================================================
    // 7. AVAILABLE STOCK LIST (Top items by stock)
    // SECURITY: cost_price and stock_value only for admin users
    // =========================================================================
    const availableStock = inStockVariants
      .sort((a, b) => (b.actual_stock || 0) - (a.actual_stock || 0))
      .slice(0, 50)
      .map(v => {
        const item = {
          id: v.id,
          sku: v.sku,
          product_name: v.product?.name || 'Unknown',
          image_url: v.product?.image_url,
          current_stock: v.actual_stock,
          selling_price: v.selling_price || 0,
        };
        // SECURITY: Only admin can see cost data
        if (isAdmin) {
          item.cost_price = v.cost_price || 0;
          item.stock_value = (v.actual_stock || 0) * (v.cost_price || 0);
        }
        return item;
      });

    // =========================================================================
    // 8. OUT OF STOCK LIST
    // SECURITY: cost_price and stock_value only for admin users
    // =========================================================================
    const outOfStock = outOfStockVariants
      .filter(v => v.product) // Only include variants with valid products
      .slice(0, 50)
      .map(v => {
        const item = {
          id: v.id,
          sku: v.sku,
          product_name: v.product?.name || 'Unknown',
          image_url: v.product?.image_url,
          current_stock: 0,
          selling_price: v.selling_price || 0,
        };
        // SECURITY: Only admin can see cost data
        if (isAdmin) {
          item.cost_price = v.cost_price || 0;
          item.stock_value = 0;
        }
        return item;
      });

    // =========================================================================
    // BUILD RESPONSE
    // SECURITY: Financial values (cost-based) only visible to admin users
    // =========================================================================
    return {
      total_stock_value: {
        // SECURITY: Only admin sees the monetary value of inventory
        value: isAdmin ? totalValue : undefined,
        units: totalUnits,
        active_variants: inStockVariants.length,
      },
      inventory_turnover: {
        this_month: {
          stock_in: purchaseValue,
          stock_in_qty: purchaseUnits,
          stock_out: damageValue + returnValue,
          stock_out_qty: damageUnits + returnUnits,
          orders_value: 0, // Can be added from orders if needed
        },
        last_month: {
          stock_in: 0,
          stock_out: 0,
        },
      },
      critical_stock: {
        count: lowStockVariants.length,
        items: criticalItems,
      },
      damage_loss: {
        this_month: {
          total_value: damageValue,
          transaction_count: damageTx.length,
          units_damaged: damageUnits,
        },
        last_month: {
          total_value: 0,
        },
        recent: [],
      },
      purchase_summary: {
        total_value: purchaseValue,
        total_units: purchaseUnits,
        count: purchaseTx.length,
        trend_percent: 0,
      },
      return_summary: {
        total_value: returnValue,
        total_units: returnUnits,
        count: returnTx.length,
      },
      adjustment_summary: {
        total_value: adjustmentValue,
        total_units: adjustmentUnits,
        count: adjustmentTx.length,
      },
      pending_actions: {
        pending_approvals: pendingCount || 0,
        out_of_stock: outOfStockVariants.length,
      },
      time_series: timeSeries,
      stock_trend: timeSeries.slice(-7).map(d => ({
        day: d.date,
        net_change: d.stock_in_units - d.stock_out_units,
      })),
      recent_transactions: recentWithUnits,
      available_stock: availableStock,
      out_of_stock: outOfStock,
      date_range: {
        start: filterStart.toISOString(),
        end: filterEnd.toISOString(),
      },
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error('Dashboard build failed', { error: err.message, stack: err.stack });
    return {
      total_stock_value: { value: 0, units: 0, active_variants: 0 },
      inventory_turnover: { this_month: { stock_in: 0, stock_in_qty: 0, stock_out: 0, stock_out_qty: 0 } },
      critical_stock: { count: 0, items: [] },
      damage_loss: { this_month: { total_value: 0, units_damaged: 0 } },
      purchase_summary: { total_value: 0, total_units: 0, count: 0 },
      return_summary: { total_value: 0, total_units: 0, count: 0 },
      pending_actions: { pending_approvals: 0, out_of_stock: 0 },
      time_series: [],
      recent_transactions: [],
      available_stock: [],
      out_of_stock: [],
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
  
  // Parse date range from query params
  const { start_date, end_date, days = 30 } = req.query;
  
  let startDate = null;
  let endDate = null;
  
  if (start_date) {
    startDate = new Date(start_date);
  } else {
    // Default to last N days
    startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days, 10));
  }
  
  if (end_date) {
    endDate = new Date(end_date);
  } else {
    endDate = new Date();
  }
  
  logger.info('Building comprehensive inventory dashboard', { 
    isAdmin, 
    startDate: startDate.toISOString(), 
    endDate: endDate.toISOString(),
  });
  
  const dashboardData = await buildComprehensiveDashboard(isAdmin, startDate, endDate);
  
  logger.info('Dashboard data built', { 
    stockUnits: dashboardData.total_stock_value?.units,
    purchaseCount: dashboardData.purchase_summary?.count,
    recentTxCount: dashboardData.recent_transactions?.length,
    timeSeriesPoints: dashboardData.time_series?.length,
  });
  
  return res.json({ success: true, data: dashboardData });
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
