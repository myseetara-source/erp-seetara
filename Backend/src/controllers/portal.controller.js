/**
 * Vendor Portal Controller
 * 
 * HIGH SECURITY - VENDOR PORTAL ENDPOINTS
 * 
 * SECURITY RULES:
 * 1. NEVER accept vendor_id from req.body or req.params
 * 2. ALWAYS extract vendor_id from req.user.vendor_id (JWT)
 * 3. All endpoints are VIEW ONLY (no mutations)
 * 4. Every access is logged
 * 
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │                     VENDOR PORTAL SECURITY MODEL                       │
 * ├────────────────────────────────────────────────────────────────────────┤
 * │                                                                        │
 * │  ❌ NEVER: req.body.vendor_id                                          │
 * │  ❌ NEVER: req.params.vendor_id                                        │
 * │  ❌ NEVER: req.query.vendor_id                                         │
 * │                                                                        │
 * │  ✅ ALWAYS: req.user.vendor_id (from verified JWT)                     │
 * │                                                                        │
 * └────────────────────────────────────────────────────────────────────────┘
 */

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { ForbiddenError, UnauthorizedError, NotFoundError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PortalController');

// =============================================================================
// SECURITY HELPER - EXTRACT VENDOR ID
// =============================================================================

/**
 * Extract vendor_id from JWT - THE ONLY SOURCE OF TRUTH
 * 
 * @param {Object} req - Express request
 * @returns {string} vendor_id from JWT
 * @throws {ForbiddenError} if not a vendor or vendor_id missing
 */
function getVendorIdFromJWT(req) {
  // Verify user exists
  if (!req.user) {
    logger.error('Portal access attempt without authentication');
    throw new UnauthorizedError('Authentication required');
  }

  // Verify role is vendor
  if (req.user.role !== 'vendor') {
    logger.error('Non-vendor attempted portal access', { 
      userId: req.user.id, 
      role: req.user.role 
    });
    throw new ForbiddenError('Vendor portal access denied');
  }

  // Verify vendor_id exists
  if (!req.user.vendor_id) {
    logger.error('Vendor user without vendor_id', { userId: req.user.id });
    throw new ForbiddenError('Vendor account not properly configured');
  }

  return req.user.vendor_id;
}

/**
 * Log vendor portal access
 */
async function logAccess(req, action) {
  try {
    await supabaseAdmin.from('vendor_access_logs').insert({
      vendor_id: req.user.vendor_id,
      user_id: req.user.id,
      action,
      ip_address: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
      user_agent: req.headers['user-agent'],
    });
  } catch (error) {
    // Don't fail the request if logging fails
    logger.error('Failed to log vendor access', { error: error.message });
  }
}

// =============================================================================
// PORTAL DASHBOARD
// =============================================================================

/**
 * Get Vendor Dashboard Stats
 * GET /api/v1/portal/dashboard
 * 
 * Returns:
 * - Balance
 * - Total Supplied
 * - Pending Payments
 * - Last 5 Transactions
 * - Last 5 Supplies
 */
export const getDashboard = asyncHandler(async (req, res) => {
  // SECURITY: Get vendor_id from JWT only
  const vendorId = getVendorIdFromJWT(req);
  
  // Log access
  await logAccess(req, 'view_dashboard');

  // Fetch vendor info
  const { data: vendor, error: vendorError } = await supabaseAdmin
    .from('vendors')
    .select('id, name, company_name, balance, payment_terms')
    .eq('id', vendorId)
    .single();

  if (vendorError || !vendor) {
    throw new NotFoundError('Vendor account');
  }

  // Fetch recent transactions
  const { data: transactions } = await supabaseAdmin
    .from('transactions')
    .select('id, type, amount, description, created_at')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Fetch recent supplies
  const { data: supplies } = await supabaseAdmin
    .from('vendor_supplies')
    .select(`
      id,
      invoice_number,
      total_amount,
      status,
      created_at,
      items:vendor_supply_items(count)
    `)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .limit(5);

  // Fetch recent payments
  const { data: payments } = await supabaseAdmin
    .from('vendor_payments')
    .select('id, amount, payment_method, payment_date, reference_number')
    .eq('vendor_id', vendorId)
    .order('payment_date', { ascending: false })
    .limit(5);

  // Calculate stats
  const { data: stats } = await supabaseAdmin
    .from('vendor_supplies')
    .select('total_amount, status')
    .eq('vendor_id', vendorId);

  const totalSupplied = stats?.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0) || 0;
  const pendingSupplies = stats?.filter(s => s.status === 'pending').length || 0;

  const { data: paymentStats } = await supabaseAdmin
    .from('vendor_payments')
    .select('amount')
    .eq('vendor_id', vendorId);

  const totalPaid = paymentStats?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;

  res.json({
    success: true,
    data: {
      vendor: {
        name: vendor.name,
        company: vendor.company_name,
        paymentTerms: vendor.payment_terms,
      },
      balance: {
        current: parseFloat(vendor.balance),
        totalSupplied,
        totalPaid,
        pending: parseFloat(vendor.balance), // Balance = pending amount
      },
      recentTransactions: transactions || [],
      recentSupplies: (supplies || []).map(s => ({
        ...s,
        itemCount: s.items?.[0]?.count || 0,
      })),
      recentPayments: payments || [],
      stats: {
        totalSupplyCount: stats?.length || 0,
        pendingSupplyCount: pendingSupplies,
      },
    },
  });
});

// =============================================================================
// TRANSACTIONS LIST
// =============================================================================

/**
 * Get Vendor Transactions
 * GET /api/v1/portal/transactions
 * 
 * VIEW ONLY - No mutations allowed
 */
export const getTransactions = asyncHandler(async (req, res) => {
  const vendorId = getVendorIdFromJWT(req);
  const { page = 1, limit = 20, type } = req.query;
  
  await logAccess(req, 'view_transactions');

  const from = (page - 1) * limit;
  const to = from + parseInt(limit) - 1;

  let query = supabaseAdmin
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('vendor_id', vendorId);

  if (type) {
    query = query.eq('type', type);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  res.json({
    success: true,
    data: data || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

// =============================================================================
// SUPPLIES LIST
// =============================================================================

/**
 * Get Vendor Supplies
 * GET /api/v1/portal/supplies
 * 
 * VIEW ONLY - No mutations allowed
 */
export const getSupplies = asyncHandler(async (req, res) => {
  const vendorId = getVendorIdFromJWT(req);
  const { page = 1, limit = 20, status } = req.query;
  
  await logAccess(req, 'view_supplies');

  const from = (page - 1) * limit;
  const to = from + parseInt(limit) - 1;

  let query = supabaseAdmin
    .from('vendor_supplies')
    .select(`
      *,
      items:vendor_supply_items(
        id,
        quantity,
        unit_price,
        total_price,
        variant:product_variants(
          sku,
          product:products(name)
        )
      )
    `, { count: 'exact' })
    .eq('vendor_id', vendorId);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  res.json({
    success: true,
    data: data || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

// =============================================================================
// SINGLE SUPPLY DETAIL
// =============================================================================

/**
 * Get Supply Detail
 * GET /api/v1/portal/supplies/:id
 * 
 * VIEW ONLY - Verifies supply belongs to vendor
 */
export const getSupplyDetail = asyncHandler(async (req, res) => {
  const vendorId = getVendorIdFromJWT(req);
  const { id } = req.params;
  
  await logAccess(req, 'view_supply_detail');

  const { data: supply, error } = await supabaseAdmin
    .from('vendor_supplies')
    .select(`
      *,
      items:vendor_supply_items(
        id,
        quantity,
        unit_price,
        total_price,
        variant:product_variants(
          sku,
          product:products(name, image_url)
        )
      )
    `)
    .eq('id', id)
    .eq('vendor_id', vendorId) // SECURITY: Only own supplies
    .single();

  if (error || !supply) {
    throw new NotFoundError('Supply');
  }

  res.json({
    success: true,
    data: supply,
  });
});

// =============================================================================
// PAYMENTS LIST
// =============================================================================

/**
 * Get Vendor Payments
 * GET /api/v1/portal/payments
 * 
 * VIEW ONLY - No mutations allowed
 */
export const getPayments = asyncHandler(async (req, res) => {
  const vendorId = getVendorIdFromJWT(req);
  const { page = 1, limit = 20 } = req.query;
  
  await logAccess(req, 'view_payments');

  const from = (page - 1) * limit;
  const to = from + parseInt(limit) - 1;

  const { data, error, count } = await supabaseAdmin
    .from('vendor_payments')
    .select('*', { count: 'exact' })
    .eq('vendor_id', vendorId)
    .order('payment_date', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  res.json({
    success: true,
    data: data || [],
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

// =============================================================================
// VENDOR PROFILE
// =============================================================================

/**
 * Get Vendor Profile
 * GET /api/v1/portal/profile
 * 
 * VIEW ONLY - No mutations allowed
 */
export const getProfile = asyncHandler(async (req, res) => {
  const vendorId = getVendorIdFromJWT(req);
  
  await logAccess(req, 'view_profile');

  const { data: vendor, error } = await supabaseAdmin
    .from('vendors')
    .select(`
      id,
      name,
      company_name,
      phone,
      email,
      address,
      payment_terms,
      balance,
      created_at
    `)
    .eq('id', vendorId)
    .single();

  if (error || !vendor) {
    throw new NotFoundError('Vendor profile');
  }

  // Note: Sensitive fields like bank_details, pan_number are NOT returned
  res.json({
    success: true,
    data: vendor,
  });
});

// =============================================================================
// LEDGER STATEMENT
// =============================================================================

/**
 * Get Vendor Ledger Statement
 * GET /api/v1/portal/ledger
 * 
 * Returns chronological list of all financial activity
 */
export const getLedger = asyncHandler(async (req, res) => {
  const vendorId = getVendorIdFromJWT(req);
  const { startDate, endDate } = req.query;
  
  await logAccess(req, 'view_ledger');

  let query = supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: true });

  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  // Calculate running balance
  let runningBalance = 0;
  const ledger = (data || []).map(txn => {
    if (txn.type === 'vendor_payment') {
      runningBalance -= parseFloat(txn.amount);
    } else if (txn.type === 'income') {
      runningBalance += parseFloat(txn.amount);
    }
    return {
      ...txn,
      running_balance: runningBalance,
    };
  });

  res.json({
    success: true,
    data: {
      ledger,
      summary: {
        openingBalance: 0,
        closingBalance: runningBalance,
        totalTransactions: ledger.length,
      },
    },
  });
});

// =============================================================================
// ADMIN FUNCTIONS (Create Vendor Access)
// =============================================================================

/**
 * Create Vendor Portal Access
 * POST /api/v1/vendors/:id/access
 * 
 * ADMIN ONLY - Creates a user account for vendor portal access
 */
export const createVendorAccess = asyncHandler(async (req, res) => {
  // Verify caller is admin
  if (req.user.role !== 'admin') {
    throw new ForbiddenError('Only admins can create vendor access');
  }

  const { id: vendorId } = req.params;
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ForbiddenError('Email and password are required');
  }

  // Verify vendor exists
  const { data: vendor, error: vendorError } = await supabaseAdmin
    .from('vendors')
    .select('id, name')
    .eq('id', vendorId)
    .single();

  if (vendorError || !vendor) {
    throw new NotFoundError('Vendor');
  }

  // Check if vendor already has access
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('role', 'vendor')
    .single();

  if (existingUser) {
    throw new ForbiddenError('Vendor already has portal access');
  }

  // Check if email is taken
  const { data: emailUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (emailUser) {
    throw new ForbiddenError('Email already in use');
  }

  // Hash password
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 12);

  // Create user account
  const { data: newUser, error: userError } = await supabaseAdmin
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      name: `${vendor.name} (Portal)`,
      role: 'vendor',
      vendor_id: vendorId,
      is_active: true,
    })
    .select('id, email, name, role')
    .single();

  if (userError) {
    throw userError;
  }

  logger.info('Vendor portal access created', { 
    vendorId, 
    userId: newUser.id,
    createdBy: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: 'Vendor portal access created successfully',
    data: {
      userId: newUser.id,
      email: newUser.email,
      vendorId,
      portalUrl: `https://portal.todaytrend.com.np`,
    },
  });
});

/**
 * Revoke Vendor Portal Access
 * DELETE /api/v1/vendors/:id/access
 * 
 * ADMIN ONLY - Deactivates vendor user account
 */
export const revokeVendorAccess = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new ForbiddenError('Only admins can revoke vendor access');
  }

  const { id: vendorId } = req.params;

  // Find and deactivate vendor user
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .update({ is_active: false })
    .eq('vendor_id', vendorId)
    .eq('role', 'vendor')
    .select('id')
    .single();

  if (error || !user) {
    throw new NotFoundError('Vendor access');
  }

  logger.info('Vendor portal access revoked', { 
    vendorId, 
    userId: user.id,
    revokedBy: req.user.id,
  });

  res.json({
    success: true,
    message: 'Vendor portal access revoked',
  });
});

export default {
  getDashboard,
  getTransactions,
  getSupplies,
  getSupplyDetail,
  getPayments,
  getProfile,
  getLedger,
  createVendorAccess,
  revokeVendorAccess,
};
