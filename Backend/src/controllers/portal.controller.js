/**
 * Vendor Portal Controller
 * 
 * HIGH SECURITY - VENDOR PORTAL ENDPOINTS
 * 
 * SECURITY RULES:
 * 1. NEVER accept vendor_id from req.body or req.params
 * 2. ALWAYS extract vendor_id from req.user.vendorId (JWT)
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
 * │  ✅ ALWAYS: req.user.vendorId (from verified JWT)                     │
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
  if (!req.user.vendorId) {
    logger.error('Vendor user without vendor_id', { userId: req.user.id });
    throw new ForbiddenError('Vendor account not properly configured');
  }

  return req.user.vendorId;
}

/**
 * Log vendor portal access
 */
async function logAccess(req, action) {
  try {
    await supabaseAdmin.from('vendor_access_logs').insert({
      vendor_id: req.user.vendorId,
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

  // ===========================================================================
  // PARALLEL QUERY EXECUTION (PERFORMANCE FIX)
  // Reduced from 6 sequential queries to 1 initial + 5 parallel queries
  // Expected improvement: ~1000ms -> ~300ms
  // ===========================================================================

  // First, verify vendor exists (required for security)
  const { data: vendor, error: vendorError } = await supabaseAdmin
    .from('vendors')
    .select('id, name, company_name, balance, payment_terms')
    .eq('id', vendorId)
    .single();

  if (vendorError || !vendor) {
    throw new NotFoundError('Vendor account');
  }

  // Execute remaining 5 queries in parallel using Promise.all()
  const [
    transactionsResult,
    suppliesResult,
    paymentsResult,
    statsResult,
    paymentStatsResult,
  ] = await Promise.all([
    // 1. Recent transactions from vendor_ledger
    supabaseAdmin
      .from('vendor_ledger')
      .select('id, entry_type, debit, credit, description, transaction_date, created_at')
      .eq('vendor_id', vendorId)
      .order('transaction_date', { ascending: false })
      .limit(5),
    
    // 2. Recent supplies (purchases from inventory_transactions)
    supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id,
        invoice_no,
        total_cost,
        status,
        created_at,
        items:inventory_transaction_items(count)
      `)
      .eq('vendor_id', vendorId)
      .eq('transaction_type', 'purchase')
      .order('created_at', { ascending: false })
      .limit(5),
    
    // 3. Recent payments from vendor_ledger
    supabaseAdmin
      .from('vendor_ledger')
      .select('id, credit, transaction_date, reference_no, payment_method, description')
      .eq('vendor_id', vendorId)
      .eq('entry_type', 'payment')
      .order('transaction_date', { ascending: false })
      .limit(5),
    
    // 4. Stats from inventory_transactions
    supabaseAdmin
      .from('inventory_transactions')
      .select('total_cost, status')
      .eq('vendor_id', vendorId)
      .eq('transaction_type', 'purchase'),
    
    // 5. Payment stats from vendor_ledger
    supabaseAdmin
      .from('vendor_ledger')
      .select('credit')
      .eq('vendor_id', vendorId)
      .eq('entry_type', 'payment'),
  ]);

  const rawTransactions = transactionsResult.data;
  const supplies = suppliesResult.data;
  const payments = paymentsResult.data;
  const stats = statsResult.data;
  const paymentStats = paymentStatsResult.data;

  // Transform transactions for portal compatibility
  const transactions = (rawTransactions || []).map(t => ({
    id: t.id,
    type: t.entry_type,
    amount: parseFloat(t.debit || 0) > 0 ? parseFloat(t.debit || 0) : parseFloat(t.credit || 0),
    description: t.description,
    created_at: t.transaction_date,
  }));

  const totalSupplied = stats?.reduce((sum, s) => sum + parseFloat(s.total_cost || 0), 0) || 0;
  const pendingSupplies = stats?.filter(s => s.status === 'pending').length || 0;
  const totalPaid = paymentStats?.reduce((sum, p) => sum + parseFloat(p.credit || 0), 0) || 0;

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
        id: s.id,
        invoice_number: s.invoice_no,
        total_amount: parseFloat(s.total_cost || 0),
        status: s.status,
        created_at: s.created_at,
        itemCount: s.items?.[0]?.count || 0,
      })),
      recentPayments: (payments || []).map(p => ({
        id: p.id,
        amount: parseFloat(p.credit || 0),
        payment_method: p.payment_method || 'bank_transfer',
        payment_date: p.transaction_date,
        reference_number: p.reference_no,
      })),
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
    .from('vendor_ledger')
    .select('id, entry_type, reference_id, reference_no, debit, credit, running_balance, description, transaction_date, created_at', { count: 'exact' })
    .eq('vendor_id', vendorId);

  if (type) {
    query = query.eq('entry_type', type);
  }

  const { data, error, count } = await query
    .order('transaction_date', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  // Transform for portal compatibility
  const transformedData = (data || []).map(entry => ({
    id: entry.id,
    type: entry.entry_type,
    amount: parseFloat(entry.debit || 0) > 0 ? parseFloat(entry.debit || 0) : parseFloat(entry.credit || 0),
    description: entry.description,
    reference_no: entry.reference_no,
    created_at: entry.transaction_date,
  }));

  res.json({
    success: true,
    data: transformedData,
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
    .from('inventory_transactions')
    .select(`
      id,
      invoice_no,
      total_cost,
      status,
      transaction_date,
      created_at,
      notes,
      items:inventory_transaction_items(
        id,
        quantity,
        unit_cost,
        variant:product_variants(
          sku,
          product:products(name)
        )
      )
    `, { count: 'exact' })
    .eq('vendor_id', vendorId)
    .eq('transaction_type', 'purchase');

  // Map status for portal
  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  // Transform data for portal compatibility
  const transformedData = (data || []).map(tx => ({
    id: tx.id,
    invoice_number: tx.invoice_no,
    total_amount: parseFloat(tx.total_cost || 0),
    status: tx.status,
    created_at: tx.created_at,
    transaction_date: tx.transaction_date,
    notes: tx.notes,
    items: (tx.items || []).map(item => ({
      id: item.id,
      quantity: item.quantity,
      unit_price: parseFloat(item.unit_cost || 0),
      total_price: item.quantity * parseFloat(item.unit_cost || 0),
      variant: item.variant,
    })),
  }));

  res.json({
    success: true,
    data: transformedData,
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
    .from('inventory_transactions')
    .select(`
      id,
      invoice_no,
      total_cost,
      status,
      transaction_date,
      created_at,
      notes,
      items:inventory_transaction_items(
        id,
        quantity,
        unit_cost,
        variant:product_variants(
          sku,
          product:products(name, image_url)
        )
      )
    `)
    .eq('id', id)
    .eq('vendor_id', vendorId) // SECURITY: Only own supplies
    .eq('transaction_type', 'purchase')
    .single();

  if (error || !supply) {
    throw new NotFoundError('Supply');
  }

  // Transform for portal compatibility
  const transformedSupply = {
    id: supply.id,
    invoice_number: supply.invoice_no,
    total_amount: parseFloat(supply.total_cost || 0),
    status: supply.status,
    created_at: supply.created_at,
    transaction_date: supply.transaction_date,
    notes: supply.notes,
    items: (supply.items || []).map(item => ({
      id: item.id,
      quantity: item.quantity,
      unit_price: parseFloat(item.unit_cost || 0),
      total_price: item.quantity * parseFloat(item.unit_cost || 0),
      variant: item.variant,
    })),
  };

  res.json({
    success: true,
    data: transformedSupply,
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
    .from('vendor_ledger')
    .select('id, credit, transaction_date, reference_no, payment_method, description, created_at', { count: 'exact' })
    .eq('vendor_id', vendorId)
    .eq('entry_type', 'payment')
    .order('transaction_date', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  // Transform for portal compatibility
  const transformedData = (data || []).map(p => ({
    id: p.id,
    amount: parseFloat(p.credit || 0),
    payment_method: p.payment_method || 'bank_transfer',
    payment_date: p.transaction_date,
    reference_number: p.reference_no,
    description: p.description,
    created_at: p.created_at,
  }));

  res.json({
    success: true,
    data: transformedData,
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
    .from('vendor_ledger')
    .select('id, entry_type, reference_id, reference_no, debit, credit, running_balance, description, transaction_date, created_at')
    .eq('vendor_id', vendorId)
    .order('transaction_date', { ascending: true });

  if (startDate) {
    query = query.gte('transaction_date', startDate);
  }
  if (endDate) {
    query = query.lte('transaction_date', endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  // Transform ledger entries
  const ledger = (data || []).map(entry => ({
    id: entry.id,
    type: entry.entry_type,
    reference_id: entry.reference_id,
    reference_no: entry.reference_no,
    debit: parseFloat(entry.debit || 0),
    credit: parseFloat(entry.credit || 0),
    running_balance: parseFloat(entry.running_balance || 0),
    description: entry.description,
    transaction_date: entry.transaction_date,
    created_at: entry.created_at,
  }));

  // Get closing balance
  const closingBalance = ledger.length > 0 ? ledger[ledger.length - 1].running_balance : 0;

  res.json({
    success: true,
    data: {
      ledger,
      summary: {
        openingBalance: 0,
        closingBalance,
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
