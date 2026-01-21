/**
 * Customer Controller
 * 
 * Customer 360 - Intelligent Customer Module
 * 
 * Endpoints:
 * - GET    /customers           - List with ranking
 * - GET    /customers/:id       - Get customer details
 * - GET    /customers/:id/360   - Full 360 profile
 * - GET    /customers/:id/orders - Order history
 * - POST   /customers           - Create customer
 * - PATCH  /customers/:id       - Update customer
 * - POST   /customers/:id/block - Block customer
 * - POST   /customers/:id/tags  - Manage tags
 * - GET    /customers/stats     - Analytics
 * - GET    /customers/top       - Top customers
 */

import { customerService, CUSTOMER_TIERS } from '../services/customer.service.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { maskSensitiveData, canSeeFinancials } from '../utils/dataMasking.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CustomerController');

// =============================================================================
// LIST & SEARCH
// =============================================================================

/**
 * List customers with ranking and filters
 * GET /customers
 * 
 * Query params:
 * - page, limit: Pagination
 * - sortBy: customer_score, total_spent, total_orders, created_at
 * - sortOrder: asc, desc
 * - search: Search name/phone
 * - tier: Filter by tier (vip, gold, warning, etc.)
 * - segment: vip, warning, blacklisted, new, dormant, high_returns
 */
export const listCustomers = asyncHandler(async (req, res) => {
  const result = await customerService.listCustomers(req.query);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
    tiers: CUSTOMER_TIERS,
  });
});

/**
 * Get customer by ID
 * GET /customers/:id
 */
export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id);

  res.json({
    success: true,
    data: customer,
  });
});

/**
 * Get Customer 360 Profile
 * GET /customers/:id/360
 * 
 * Returns complete customer profile with:
 * - Profile info
 * - Tier & score
 * - Metrics (LTV, AOV, return rate)
 * - Order history
 * - Tracking data (for fraud detection)
 */
export const getCustomer360 = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  const profile = await customerService.getCustomer360(req.params.id);

  // Mask tracking data for non-admins
  if (!canSeeFinancials(userRole)) {
    profile.tracking = undefined;
  }

  res.json({
    success: true,
    data: profile,
  });
});

/**
 * Get customer order history
 * GET /customers/:id/orders
 */
export const getOrderHistory = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await customerService.getOrderHistory(req.params.id, { page, limit, status });

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

/**
 * Create customer
 * POST /customers
 */
export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.body);

  logger.info('Customer created via API', { customerId: customer.id });

  res.status(201).json({
    success: true,
    message: 'Customer created successfully',
    data: customer,
  });
});

/**
 * Update customer
 * PATCH /customers/:id
 */
export const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.params.id, req.body);

  logger.info('Customer updated', { customerId: req.params.id });

  res.json({
    success: true,
    message: 'Customer updated successfully',
    data: customer,
  });
});

/**
 * Block/Unblock customer
 * POST /customers/:id/block
 * 
 * @body {boolean} blocked - Block status
 * @body {string} reason - Reason for blocking
 */
export const setBlockStatus = asyncHandler(async (req, res) => {
  const { blocked, reason } = req.body;
  const customer = await customerService.setBlockStatus(req.params.id, blocked, reason);

  logger.info('Customer block status changed', { 
    customerId: req.params.id, 
    blocked,
    by: req.user?.id,
  });

  res.json({
    success: true,
    message: blocked ? 'Customer blocked' : 'Customer unblocked',
    data: customer,
  });
});

/**
 * Add tags to customer
 * POST /customers/:id/tags
 * 
 * @body {string[]} tags - Tags to add
 */
export const addTags = asyncHandler(async (req, res) => {
  const customer = await customerService.addTags(req.params.id, req.body.tags);

  res.json({
    success: true,
    message: 'Tags added successfully',
    data: customer,
  });
});

/**
 * Remove tag from customer
 * DELETE /customers/:id/tags/:tag
 */
export const removeTag = asyncHandler(async (req, res) => {
  const customer = await customerService.removeTag(req.params.id, req.params.tag);

  res.json({
    success: true,
    message: 'Tag removed successfully',
    data: customer,
  });
});

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * Get customer statistics
 * GET /customers/stats
 */
export const getStats = asyncHandler(async (req, res) => {
  const stats = await customerService.getCustomerStats();

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * Get top customers
 * GET /customers/top
 * 
 * @query {number} limit - Number of customers (default 10)
 * @query {string} by - Sort by: total_spent, total_orders, customer_score
 */
export const getTopCustomers = asyncHandler(async (req, res) => {
  const { limit = 10, by = 'total_spent' } = req.query;
  const customers = await customerService.getTopCustomers(parseInt(limit), by);

  res.json({
    success: true,
    data: customers,
  });
});

// =============================================================================
// INTERNAL USE (Called by Order Service)
// =============================================================================

/**
 * Find or create customer (internal use)
 * Used during order creation
 */
export const findOrCreate = asyncHandler(async (req, res) => {
  const result = await customerService.findOrCreateCustomer(req.body);

  res.json({
    success: true,
    data: result.customer,
    isNew: result.isNew,
  });
});

export default {
  listCustomers,
  getCustomer,
  getCustomer360,
  getOrderHistory,
  createCustomer,
  updateCustomer,
  setBlockStatus,
  addTags,
  removeTag,
  getStats,
  getTopCustomers,
  findOrCreate,
};
