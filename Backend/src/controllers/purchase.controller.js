/**
 * Purchase Controller
 * 
 * SECURITY: Implements strict "Operational vs. Financial" separation.
 * 
 * Access Rules:
 * - Staff: Can CREATE purchases (operational - stock in)
 *          Response hides: total_amount, vendor_balance, cost_price
 * - Admin: Full access including payments and financial data
 * 
 * The key insight: Staff needs to DO the work, but doesn't need to 
 * KNOW the financial impact of their work.
 * 
 * Endpoints:
 * - POST   /purchases          - Create new purchase (Staff + Admin)
 * - GET    /purchases          - List purchases (financial data masked for Staff)
 * - GET    /purchases/:id      - Get purchase details (masked for Staff)
 * - POST   /purchases/:id/pay  - Record payment (Admin ONLY)
 * - POST   /purchases/:id/return - Process return (Staff + Admin, financial hidden)
 * - GET    /purchases/stats    - Get statistics (Admin ONLY)
 */

import { purchaseService } from '../services/purchase.service.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { extractContext } from '../middleware/auth.middleware.js';
import { 
  maskSensitiveData, 
  maskPurchaseResponse,
  canSeeFinancials,
} from '../utils/dataMasking.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PurchaseController');

/**
 * Create a new purchase (Stock Injection)
 * POST /purchases
 * 
 * SECURITY:
 * - Staff CAN create purchases (this is operational work)
 * - Backend calculates financial impact in background
 * - Staff response hides: total_amount, vendor_balance changes, cost_price
 * - Admin sees everything
 * 
 * @body {string} vendor_id - Vendor UUID
 * @body {Array} items - [{variant_id, quantity, unit_cost}]
 * @body {string} [invoice_number] - Vendor's invoice number
 * @body {string} [invoice_date] - Vendor's invoice date
 * @body {string} [notes] - Additional notes
 */
export const createPurchase = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const userRole = req.user?.role;
  
  logger.info('Creating new purchase', {
    vendorId: req.body.vendor_id,
    itemCount: req.body.items?.length,
    userId: context.userId,
    userRole,
  });

  const purchase = await purchaseService.createPurchase(req.body, context);

  // Mask response based on role
  let responseData;
  let message;

  if (canSeeFinancials(userRole)) {
    // Admin sees everything
    responseData = purchase;
    message = `Purchase ${purchase.supply_number} created. Total: Rs. ${purchase.total_amount}. Vendor balance updated.`;
  } else {
    // Staff sees operational data only
    responseData = maskPurchaseResponse(purchase, userRole);
    message = `Purchase ${purchase.supply_number} created. Stock updated for ${purchase.summary?.stock_updates_successful || purchase.items?.length} items.`;
  }

  res.status(201).json({
    success: true,
    message,
    data: responseData,
  });
});

/**
 * List purchases with filters
 * GET /purchases
 * 
 * SECURITY: Financial data masked for non-admins
 * 
 * @query {number} [page=1] - Page number
 * @query {number} [limit=20] - Items per page
 * @query {string} [vendor_id] - Filter by vendor
 * @query {string} [status] - Filter by status
 * @query {string} [from_date] - Filter from date
 * @query {string} [to_date] - Filter to date
 * @query {string} [search] - Search by supply number or invoice number
 */
export const listPurchases = asyncHandler(async (req, res) => {
  const result = await purchaseService.listPurchases(req.query);
  const userRole = req.user?.role;

  // Mask data based on role
  const maskedData = canSeeFinancials(userRole) 
    ? result.data 
    : result.data.map(p => maskPurchaseResponse(p, userRole));

  res.json({
    success: true,
    data: maskedData,
    pagination: result.pagination,
    _meta: {
      dataLevel: canSeeFinancials(userRole) ? 'full' : 'operational',
    },
  });
});

/**
 * Get purchase by ID with full details
 * GET /purchases/:id
 * 
 * SECURITY: Financial data masked for non-admins
 */
export const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await purchaseService.getPurchaseById(req.params.id);
  const userRole = req.user?.role;

  const responseData = canSeeFinancials(userRole)
    ? purchase
    : maskPurchaseResponse(purchase, userRole);

  res.json({
    success: true,
    data: responseData,
  });
});

/**
 * Record payment against a purchase
 * POST /purchases/:id/pay
 * 
 * SECURITY: Admin ONLY - This is a FINANCIAL action
 * Staff cannot make payments
 * 
 * @body {number} amount - Payment amount
 * @body {string} payment_mode - cash, upi, bank_transfer, cheque
 * @body {string} [reference_number] - UPI ref, cheque number, etc.
 * @body {string} [notes] - Payment notes
 */
export const recordPayment = asyncHandler(async (req, res) => {
  // Authorization is done at route level: authorize('admin')
  const context = extractContext(req);
  
  logger.info('Recording payment', {
    purchaseId: req.params.id,
    amount: req.body.amount,
    userId: context.userId,
  });

  const result = await purchaseService.recordPayment(
    req.params.id,
    req.body,
    context
  );

  res.json({
    success: true,
    message: `Payment of Rs. ${result.payment_amount} recorded. Remaining balance: Rs. ${result.remaining}`,
    data: result,
  });
});

/**
 * Process purchase return
 * POST /purchases/:id/return
 * 
 * SECURITY:
 * - Staff CAN process returns (this is operational work)
 * - Backend updates ledger in background
 * - Staff response hides financial impact
 * - Admin sees full financial impact
 * 
 * @body {Array} items - [{variant_id, quantity, reason}]
 * @body {string} [notes] - Return notes
 */
export const processReturn = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const userRole = req.user?.role;

  logger.info('Processing purchase return', {
    purchaseId: req.params.id,
    itemCount: req.body.items?.length,
    userId: context.userId,
  });

  const result = await purchaseService.processReturn(
    req.params.id,
    req.body,
    context
  );

  // Mask response based on role
  if (canSeeFinancials(userRole)) {
    res.json({
      success: true,
      message: `Return processed. Credit of Rs. ${result.credit_amount} applied to vendor balance.`,
      data: result,
    });
  } else {
    // Staff sees operational message only
    res.json({
      success: true,
      message: 'Return processed successfully. Stock adjusted.',
      data: {
        id: result.id,
        return_number: result.return_number,
        status: result.status,
        items_returned: result.items?.length || req.body.items.length,
        created_at: result.created_at,
      },
    });
  }
});

/**
 * Get purchase statistics
 * GET /purchases/stats
 * 
 * SECURITY: Admin ONLY - This is pure financial data
 * 
 * @query {string} [from_date] - From date
 * @query {string} [to_date] - To date
 * @query {string} [vendor_id] - Filter by vendor
 */
export const getPurchaseStats = asyncHandler(async (req, res) => {
  // Authorization is done at route level: authorize('admin')
  const stats = await purchaseService.getStats(req.query);

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * Get my recent purchases (for current user)
 * GET /purchases/my-recent
 * 
 * Staff can see their own recent purchase entries (for reference)
 * Financial data is still masked
 */
export const getMyRecentPurchases = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const userRole = req.user?.role;

  const result = await purchaseService.listPurchases({
    created_by: userId,
    limit: 10,
  });

  const maskedData = canSeeFinancials(userRole)
    ? result.data
    : result.data.map(p => maskPurchaseResponse(p, userRole));

  res.json({
    success: true,
    data: maskedData,
  });
});

export default {
  createPurchase,
  listPurchases,
  getPurchase,
  recordPayment,
  processReturn,
  getPurchaseStats,
  getMyRecentPurchases,
};
