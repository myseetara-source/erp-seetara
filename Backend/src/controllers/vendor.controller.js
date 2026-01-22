/**
 * Vendor Controller
 * 
 * SECURITY: Implements strict "Operational vs. Financial" separation.
 * 
 * Access Rules:
 * - Staff/Operators: Can only SELECT vendors (id, name, company_name) for purchases
 * - Admins: Full CRUD access + financial data (balance, ledger, payments)
 * 
 * Data Visibility:
 * - Staff: {id, name, company_name} ONLY
 * - Admin: Everything including balance, credit_limit, bank_details, ledger
 */

import { vendorService } from '../services/vendor.service.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { 
  maskSensitiveData, 
  maskVendorForNonAdmin,
  maskVendorLedger,
  canSeeFinancials,
} from '../utils/dataMasking.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('VendorController');

// =============================================================================
// VENDOR CRUD
// =============================================================================

/**
 * Create a new vendor
 * POST /vendors
 * 
 * SECURITY: Admin only - Staff cannot create vendors
 */
export const createVendor = asyncHandler(async (req, res) => {
  // Authorization check is done via route middleware authorize('admin')
  const vendor = await vendorService.createVendor(req.body);

  logger.info('Vendor created', { 
    vendorId: vendor.id, 
    name: vendor.name,
    createdBy: req.user?.id,
  });

  res.status(201).json({
    success: true,
    message: 'Vendor created successfully',
    data: vendor, // Admin sees everything
  });
});

/**
 * Get vendor by ID
 * GET /vendors/:id
 * 
 * SECURITY: 
 * - Admin: Full vendor data including financials
 * - Staff: Minimal data (id, name, company_name)
 */
export const getVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.getVendorById(req.params.id);
  const userRole = req.user?.role;

  // Mask data based on role
  const maskedVendor = maskVendorForNonAdmin(vendor, userRole);

  res.json({
    success: true,
    data: maskedVendor,
  });
});

/**
 * Update vendor
 * PATCH /vendors/:id
 * 
 * SECURITY: Admin only - Staff cannot modify vendor data
 */
export const updateVendor = asyncHandler(async (req, res) => {
  // Authorization check is done via route middleware authorize('admin')
  const vendor = await vendorService.updateVendor(req.params.id, req.body);

  logger.info('Vendor updated', { 
    vendorId: vendor.id, 
    updatedBy: req.user?.id,
  });

  res.json({
    success: true,
    message: 'Vendor updated successfully',
    data: vendor, // Admin sees everything
  });
});

/**
 * List vendors with filters
 * GET /vendors
 * 
 * SECURITY:
 * - Admin: Full vendor data including balance, credit_limit
 * - Staff: Minimal vendor list for dropdown selection
 */
export const listVendors = asyncHandler(async (req, res) => {
  const result = await vendorService.listVendors(req.query);
  const userRole = req.user?.role;

  // Mask vendor data based on role
  const maskedData = result.data.map(vendor => 
    maskVendorForNonAdmin(vendor, userRole)
  );

  res.json({
    success: true,
    data: maskedData,
    pagination: result.pagination,
    // Inform client about data visibility level
    _meta: {
      dataLevel: canSeeFinancials(userRole) ? 'full' : 'minimal',
    },
  });
});

/**
 * Deactivate vendor (soft delete)
 * DELETE /vendors/:id
 * 
 * SECURITY: Admin only - Staff cannot delete vendors
 */
export const deactivateVendor = asyncHandler(async (req, res) => {
  // Authorization check is done via route middleware authorize('admin')
  await vendorService.deactivateVendor(req.params.id);

  logger.info('Vendor deactivated', { 
    vendorId: req.params.id, 
    deactivatedBy: req.user?.id,
  });

  res.json({
    success: true,
    message: 'Vendor deactivated successfully',
  });
});

/**
 * Toggle vendor active status
 * PATCH /vendors/:id/toggle-status
 * 
 * SECURITY: Admin only
 */
export const toggleVendorStatus = asyncHandler(async (req, res) => {
  const vendor = await vendorService.toggleStatus(req.params.id);

  logger.info('Vendor status toggled', { 
    vendorId: vendor.id, 
    isActive: vendor.is_active,
    toggledBy: req.user?.id,
  });

  res.json({
    success: true,
    message: `Vendor ${vendor.is_active ? 'activated' : 'deactivated'} successfully`,
    data: vendor,
  });
});

// =============================================================================
// VENDOR SUPPLIES (Stock Purchases)
// =============================================================================

/**
 * Create vendor supply order
 * POST /vendors/supplies
 * 
 * SECURITY: Staff CAN create supplies (operational)
 * Response is masked to hide financial impact
 */
export const createSupply = asyncHandler(async (req, res) => {
  const supply = await vendorService.createSupply(req.body, req.user?.id);
  const userRole = req.user?.role;

  logger.info('Supply order created', { 
    supplyId: supply.id, 
    vendorId: supply.vendor_id,
    createdBy: req.user?.id,
  });

  // Mask financial data for non-admins
  const responseData = maskSensitiveData(supply, userRole);

  // Never show vendor balance changes to staff
  if (!canSeeFinancials(userRole)) {
    delete responseData.vendor_balance_before;
    delete responseData.vendor_balance_after;
    delete responseData.total_amount;
    delete responseData.amount_paid;
    delete responseData.amount_due;
  }

  res.status(201).json({
    success: true,
    message: 'Supply order created successfully. Stock updated.',
    data: responseData,
  });
});

/**
 * Get supply by ID
 * GET /vendors/supplies/:id
 * 
 * SECURITY: Mask financial data for non-admins
 */
export const getSupply = asyncHandler(async (req, res) => {
  const supply = await vendorService.getSupplyById(req.params.id);
  const userRole = req.user?.role;

  res.json({
    success: true,
    data: maskSensitiveData(supply, userRole),
  });
});

/**
 * List supplies
 * GET /vendors/supplies
 * 
 * SECURITY: Mask financial data for non-admins
 */
export const listSupplies = asyncHandler(async (req, res) => {
  const result = await vendorService.listSupplies(req.query);
  const userRole = req.user?.role;

  res.json({
    success: true,
    data: maskSensitiveData(result.data, userRole),
    pagination: result.pagination,
  });
});

/**
 * Receive supply items
 * POST /vendors/supplies/:id/receive
 * 
 * SECURITY: Staff CAN receive items (operational)
 * Response hides financial impact
 */
export const receiveSupply = asyncHandler(async (req, res) => {
  const supply = await vendorService.receiveSupply(
    req.params.id,
    req.body.items,
    req.user?.id
  );
  const userRole = req.user?.role;

  logger.info('Supply items received', { 
    supplyId: req.params.id, 
    receivedBy: req.user?.id,
  });

  res.json({
    success: true,
    message: 'Supply items received successfully. Stock updated.',
    data: maskSensitiveData(supply, userRole),
  });
});

// =============================================================================
// VENDOR PAYMENTS & LEDGER
// =============================================================================

/**
 * Record vendor payment
 * POST /vendors/payments
 * 
 * SECURITY: Admin only - Staff cannot make payments
 */
export const recordPayment = asyncHandler(async (req, res) => {
  // Authorization check is done via route middleware authorize('admin')
  const transaction = await vendorService.recordPayment(req.body, req.user?.id);

  logger.info('Vendor payment recorded', { 
    transactionId: transaction.id, 
    vendorId: req.body.vendor_id,
    amount: transaction.amount,
    recordedBy: req.user?.id,
  });

  res.status(201).json({
    success: true,
    message: 'Payment recorded successfully',
    data: transaction, // Admin sees everything
  });
});

/**
 * Get vendor ledger (hisab-kitab)
 * GET /vendors/:id/ledger
 * 
 * SECURITY: Admin only - Ledger is COMPLETELY hidden from staff
 */
export const getVendorLedger = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;

  // Ledger is admin-only
  if (!canSeeFinancials(userRole)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to view vendor ledger',
      },
    });
  }

  const ledger = await vendorService.getVendorLedger(req.params.id, req.query);

  res.json({
    success: true,
    data: ledger,
  });
});

/**
 * Get vendor summary/stats
 * GET /vendors/:id/summary
 * 
 * SECURITY: 
 * - Admin: Full financial summary
 * - Staff: Basic operational stats only
 */
export const getVendorSummary = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  const vendor = await vendorService.getVendorById(req.params.id);
  const stats = await vendorService.getVendorStats(req.params.id);

  if (canSeeFinancials(userRole)) {
    // Admin sees full financial summary
    res.json({
      success: true,
      data: {
        vendor,
        stats: {
          total_supplies: stats.total_supplies,
          total_purchase_value: stats.total_purchase_value,
          total_payments: stats.total_payments,
          total_returns: stats.total_returns || 0,
          outstanding_balance: stats.outstanding_balance,
          average_order_value: stats.average_order_value,
          last_supply_date: stats.last_supply_date,
          last_payment_date: stats.last_payment_date,
        },
      },
    });
  } else {
    // Staff sees minimal operational stats
    res.json({
      success: true,
      data: {
        vendor: maskVendorForNonAdmin(vendor, userRole),
        stats: {
          total_supplies: stats.total_supplies,
          last_supply_date: stats.last_supply_date,
        },
      },
    });
  }
});

/**
 * Get vendor stats (Fast endpoint for dashboard cards)
 * GET /vendors/:id/stats
 * 
 * SECURITY: Admin only (contains financial data)
 * 
 * Returns: { purchases, payments, returns, balance }
 */
export const getVendorStats = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  
  // Only admins can see financial stats
  if (!canSeeFinancials(userRole)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to view vendor stats',
      },
    });
  }

  const stats = await vendorService.getVendorStats(req.params.id);

  // Return fast, lightweight response for dashboard
  res.json({
    success: true,
    data: {
      purchases: stats.total_purchase_value || 0,
      payments: stats.total_payments || 0,
      returns: stats.total_returns || 0,
      balance: stats.outstanding_balance || 0,
      purchase_count: stats.total_supplies || 0,
      last_purchase_date: stats.last_supply_date,
      last_payment_date: stats.last_payment_date,
    },
  });
});

// =============================================================================
// VENDOR TRANSACTIONS (Combined Stats + Ledger) - O(1) Architecture
// =============================================================================

/**
 * Get vendor transactions with summary
 * GET /vendors/:id/transactions
 * 
 * ARCHITECTURE: O(1) Scalable
 * - Stats are read from denormalized columns in vendors table (instant)
 * - Transaction history is fetched from vendor_ledger (paginated)
 * 
 * SECURITY: Admin only - Financial data
 */
export const getVendorTransactions = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  const vendorId = req.params.id;

  // Only admins can see transactions
  if (!canSeeFinancials(userRole)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to view vendor transactions',
      },
    });
  }

  // Get vendor with denormalized stats (O(1) lookup)
  const vendor = await vendorService.getVendorById(vendorId);
  
  if (!vendor) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Vendor not found',
      },
    });
  }

  // Get paginated transactions from ledger (with fallback)
  const { limit = 50, offset = 0 } = req.query;
  let ledger = { data: [], pagination: { total: 0, limit: parseInt(limit), offset: parseInt(offset), hasMore: false } };
  
  try {
    ledger = await vendorService.getVendorLedger(vendorId, { 
      limit: parseInt(limit), 
      offset: parseInt(offset),
    });
    logger.info('Vendor ledger fetched', { 
      vendorId, 
      transactionCount: ledger.data?.length || 0,
      total: ledger.pagination?.total || 0,
    });
  } catch (ledgerError) {
    // Log error but continue - ledger table might not exist yet
    logger.warn('Failed to fetch vendor ledger, using empty fallback', { 
      vendorId, 
      error: ledgerError.message,
      stack: ledgerError.stack,
    });
  }

  // Build summary from denormalized columns (instant!) - fallback to 0 if columns don't exist
  const summary = {
    total_purchases: vendor.total_purchases || 0,
    total_payments: vendor.total_payments || 0,
    total_returns: vendor.total_returns || 0,
    current_balance: vendor.balance || 0,
    purchase_count: vendor.purchase_count || 0,
    payment_count: vendor.payment_count || 0,
    last_purchase_date: vendor.last_purchase_date || null,
    last_payment_date: vendor.last_payment_date || null,
  };

  res.json({
    success: true,
    data: {
      vendor: {
        id: vendor.id,
        name: vendor.name,
        company_name: vendor.company_name,
      },
      transactions: ledger.data || [],
      summary,
      pagination: ledger.pagination || {
        total: 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: false,
      },
    },
  });
});

// =============================================================================
// VENDOR PORTAL ENDPOINTS (Vendor's own data)
// =============================================================================

/**
 * Vendor portal: Get own profile
 * GET /vendor-portal/profile
 * 
 * SECURITY: Vendors see their own full profile
 */
export const getVendorProfile = asyncHandler(async (req, res) => {
  const vendor = await vendorService.getVendorById(req.user.vendorId);

  res.json({
    success: true,
    data: vendor,
  });
});

/**
 * Vendor portal: Get own ledger
 * GET /vendor-portal/ledger
 * 
 * SECURITY: Vendors can see their own ledger
 */
export const getOwnLedger = asyncHandler(async (req, res) => {
  const ledger = await vendorService.getVendorLedger(req.user.vendorId, req.query);

  res.json({
    success: true,
    data: ledger,
  });
});

/**
 * Vendor portal: Get own supplies
 * GET /vendor-portal/supplies
 */
export const getOwnSupplies = asyncHandler(async (req, res) => {
  const result = await vendorService.listSupplies({
    ...req.query,
    vendor_id: req.user.vendorId,
  });

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

export default {
  // CRUD
  createVendor,
  getVendor,
  updateVendor,
  listVendors,
  deactivateVendor,
  toggleVendorStatus,
  // Supplies
  createSupply,
  getSupply,
  listSupplies,
  receiveSupply,
  // Payments & Ledger
  recordPayment,
  getVendorLedger,
  getVendorSummary,
  getVendorStats,
  getVendorTransactions,
  // Portal
  getVendorProfile,
  getOwnLedger,
  getOwnSupplies,
};
