/**
 * Inventory Service (QUAL-004 - Service Layer Pattern)
 * 
 * Contains all business logic for inventory transactions.
 * Controller handles HTTP request/response; this service handles logic.
 * 
 * RESPONSIBILITIES:
 * - Database operations
 * - Business rule validation
 * - Stock calculations
 * - Data transformation
 * 
 * SECURITY:
 * - All methods return raw data; masking is done in Controller
 * - Transaction validation handled here (return qty checks, etc.)
 */

import { supabaseAdmin } from '../config/supabase.js';
import { transactionTypeConfig } from '../validations/inventory.validation.js';
import { AppError } from '../utils/errors.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TRANSACTION_TYPES = {
  PURCHASE: 'purchase',
  PURCHASE_RETURN: 'purchase_return',
  DAMAGE: 'damage',
  ADJUSTMENT: 'adjustment',
};

const TRANSACTION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  VOIDED: 'voided',
};

// =============================================================================
// LIST TRANSACTIONS
// =============================================================================

/**
 * List inventory transactions with filters
 * 
 * @param {Object} filters - Query filters
 * @param {number} filters.page - Page number
 * @param {number} filters.limit - Items per page
 * @param {string} [filters.type] - Transaction type filter
 * @param {string} [filters.vendor_id] - Vendor filter
 * @param {string} [filters.from_date] - Start date
 * @param {string} [filters.to_date] - End date
 * @param {string} [filters.search] - Search term
 * @returns {Promise<{data: Array, count: number}>}
 */
export async function listTransactions(filters) {
  const { page, limit, type, vendor_id, from_date, to_date, search } = filters;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name, company_name),
      performer:users!inventory_transactions_performed_by_fkey(id, name, email),
      items:inventory_transaction_items(
        id, variant_id, quantity, unit_cost, stock_before, stock_after,
        variant:product_variants(id, sku, attributes, product:products(id, name))
      )
    `, { count: 'exact' });

  // Apply filters
  if (type) query = query.eq('transaction_type', type);
  if (vendor_id) query = query.eq('vendor_id', vendor_id);
  if (from_date) query = query.gte('transaction_date', from_date);
  if (to_date) query = query.lte('transaction_date', to_date);
  if (search) query = query.or(`invoice_no.ilike.%${search}%,reason.ilike.%${search}%`);

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[InventoryService] List error:', error);
    throw new AppError('Failed to fetch transactions', 500, 'DATABASE_ERROR');
  }

  return { data: data || [], count: count || 0 };
}

// =============================================================================
// GET SINGLE TRANSACTION
// =============================================================================

/**
 * Get transaction by ID with all related data
 * 
 * @param {string} id - Transaction ID
 * @returns {Promise<Object>} Transaction with items and relations
 */
export async function getTransactionById(id) {
  const { data, error } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name, company_name, phone),
      performer:users!inventory_transactions_performed_by_fkey(id, name, email),
      approver:users!inventory_transactions_approved_by_fkey(id, name),
      reference:inventory_transactions!inventory_transactions_reference_transaction_id_fkey(
        id, invoice_no, transaction_type
      ),
      items:inventory_transaction_items(
        id, variant_id, quantity, unit_cost, stock_before, stock_after, source_type, notes,
        variant:product_variants(id, sku, attributes, current_stock, damaged_stock,
          product:products(id, name, image_url)
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Transaction not found', 404, 'NOT_FOUND');
    }
    throw new AppError('Failed to fetch transaction', 500, 'DATABASE_ERROR');
  }

  return data;
}

// =============================================================================
// CREATE TRANSACTION
// =============================================================================

/**
 * Create a new inventory transaction
 * 
 * @param {Object} data - Transaction data
 * @param {string} userId - User creating the transaction
 * @param {string} userRole - User's role (admin/staff)
 * @returns {Promise<Object>} Created transaction
 */
export async function createTransaction(data, userId, userRole) {
  const isAdmin = userRole === 'admin';
  const config = transactionTypeConfig[data.transaction_type];

  // Determine status based on role and type
  let status = TRANSACTION_STATUSES.APPROVED;
  if (data.transaction_type !== TRANSACTION_TYPES.PURCHASE && !isAdmin) {
    status = TRANSACTION_STATUSES.PENDING;
  }

  // Lock date for non-purchase transactions
  const transactionDate = data.transaction_type === TRANSACTION_TYPES.PURCHASE
    ? (data.transaction_date || new Date().toISOString().split('T')[0])
    : new Date().toISOString().split('T')[0];

  // Validate reference for purchase returns
  if (data.transaction_type === TRANSACTION_TYPES.PURCHASE_RETURN) {
    await validatePurchaseReturn(data);
  }

  // Create transaction header
  const { data: transaction, error: txError } = await supabaseAdmin
    .from('inventory_transactions')
    .insert({
      transaction_type: data.transaction_type,
      invoice_no: data.invoice_no,
      vendor_id: data.vendor_id || null,
      performed_by: userId,
      transaction_date: transactionDate,
      reason: data.reason || null,
      notes: data.notes || null,
      status: status,
      reference_transaction_id: data.reference_transaction_id || null,
      server_timestamp: new Date().toISOString(),
      approved_by: status === TRANSACTION_STATUSES.APPROVED ? userId : null,
      approval_date: status === TRANSACTION_STATUSES.APPROVED ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (txError) {
    if (txError.code === '23505') {
      throw new AppError('Invoice number already exists', 400, 'DUPLICATE_INVOICE');
    }
    throw new AppError('Failed to create transaction', 500, 'DATABASE_ERROR');
  }

  // Insert items
  const itemsToInsert = data.items.map((item) => ({
    transaction_id: transaction.id,
    variant_id: item.variant_id,
    quantity: config.quantityDirection === 'out' ? -Math.abs(item.quantity) : item.quantity,
    unit_cost: item.unit_cost || 0,
    source_type: item.source_type || 'fresh',
    notes: item.notes || null,
  }));

  const { error: itemsError } = await supabaseAdmin
    .from('inventory_transaction_items')
    .insert(itemsToInsert);

  if (itemsError) {
    // Rollback
    await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);
    throw new AppError('Failed to create transaction items', 500, 'DATABASE_ERROR');
  }

  // Return complete transaction
  return getTransactionById(transaction.id);
}

// =============================================================================
// VALIDATE PURCHASE RETURN
// =============================================================================

/**
 * Validate purchase return against original invoice
 * Implements CRIT-002 security fix
 * 
 * @param {Object} data - Return transaction data
 * @throws {AppError} If validation fails
 */
async function validatePurchaseReturn(data) {
  if (!data.reference_transaction_id) {
    throw new AppError(
      'Purchase Return requires a reference to original purchase invoice',
      400,
      'MISSING_REFERENCE'
    );
  }

  // Get original purchase
  const { data: refTx, error: refError } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      id, transaction_type, status,
      items:inventory_transaction_items(variant_id, quantity)
    `)
    .eq('id', data.reference_transaction_id)
    .single();

  if (refError || !refTx) {
    throw new AppError('Reference purchase transaction not found', 400, 'INVALID_REFERENCE');
  }

  if (refTx.transaction_type !== TRANSACTION_TYPES.PURCHASE) {
    throw new AppError('Reference must be a Purchase transaction', 400, 'INVALID_REFERENCE_TYPE');
  }

  // Build original quantity map
  const originalQtyMap = new Map();
  for (const item of refTx.items || []) {
    originalQtyMap.set(item.variant_id, Math.abs(item.quantity));
  }

  // Get already returned quantities
  const { data: previousReturns } = await supabaseAdmin
    .from('inventory_transactions')
    .select('items:inventory_transaction_items(variant_id, quantity)')
    .eq('reference_transaction_id', data.reference_transaction_id)
    .eq('transaction_type', TRANSACTION_TYPES.PURCHASE_RETURN)
    .eq('status', TRANSACTION_STATUSES.APPROVED);

  const alreadyReturnedMap = new Map();
  if (previousReturns) {
    for (const returnTx of previousReturns) {
      for (const item of returnTx.items || []) {
        const existing = alreadyReturnedMap.get(item.variant_id) || 0;
        alreadyReturnedMap.set(item.variant_id, existing + Math.abs(item.quantity));
      }
    }
  }

  // Validate each return item
  const errors = [];
  for (const returnItem of data.items) {
    const originalQty = originalQtyMap.get(returnItem.variant_id) || 0;
    const alreadyReturned = alreadyReturnedMap.get(returnItem.variant_id) || 0;
    const maxReturnable = originalQty - alreadyReturned;
    const requestedQty = Math.abs(returnItem.quantity);

    if (requestedQty > maxReturnable) {
      const { data: variant } = await supabaseAdmin
        .from('product_variants')
        .select('sku')
        .eq('id', returnItem.variant_id)
        .single();

      errors.push({
        variant_id: returnItem.variant_id,
        sku: variant?.sku || returnItem.variant_id,
        requested: requestedQty,
        max_returnable: maxReturnable,
        message: `Cannot return ${requestedQty}. Max: ${maxReturnable}`,
      });
    }

    if (originalQty === 0) {
      errors.push({
        variant_id: returnItem.variant_id,
        message: 'Item was not in the original purchase invoice',
      });
    }
  }

  if (errors.length > 0) {
    throw new AppError(
      'Cannot return more than originally purchased',
      400,
      'RETURN_QUANTITY_EXCEEDED',
      { details: errors }
    );
  }
}

// =============================================================================
// APPROVE TRANSACTION
// =============================================================================

/**
 * Approve a pending transaction
 * 
 * @param {string} id - Transaction ID
 * @param {string} approverId - User ID of approver
 * @returns {Promise<Object>} Approved transaction
 */
export async function approveTransaction(id, approverId) {
  // Call database function
  const { data, error } = await supabaseAdmin.rpc('approve_inventory_transaction', {
    p_transaction_id: id,
    p_approved_by: approverId,
  });

  if (error) {
    console.error('[InventoryService] Approve error:', error);
    throw new AppError('Failed to approve transaction', 500, 'DATABASE_ERROR');
  }

  if (!data?.[0]?.success) {
    throw new AppError(data?.[0]?.message || 'Failed to approve', 400, 'APPROVAL_FAILED');
  }

  return getTransactionById(id);
}

// =============================================================================
// REJECT TRANSACTION
// =============================================================================

/**
 * Reject a pending transaction
 * 
 * @param {string} id - Transaction ID
 * @param {string} reason - Rejection reason
 * @param {string} rejectorId - User ID of rejector
 * @returns {Promise<Object>} Rejected transaction
 */
export async function rejectTransaction(id, reason, rejectorId) {
  const { data, error } = await supabaseAdmin
    .from('inventory_transactions')
    .update({
      status: TRANSACTION_STATUSES.REJECTED,
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', TRANSACTION_STATUSES.PENDING)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Transaction not found or not pending', 404, 'NOT_FOUND');
    }
    throw new AppError('Failed to reject transaction', 500, 'DATABASE_ERROR');
  }

  return data;
}

// =============================================================================
// GET NEXT INVOICE NUMBER
// =============================================================================

/**
 * Get next invoice number for a transaction type
 * 
 * @param {string} type - Transaction type
 * @returns {Promise<string>} Next invoice number
 */
export async function getNextInvoiceNumber(type) {
  const { data, error } = await supabaseAdmin.rpc('get_next_invoice_number', {
    p_type: type,
  });

  if (error) {
    // Fallback
    const prefix = transactionTypeConfig[type]?.prefix || 'TXN';
    return `${prefix}-${Date.now().toString().slice(-6)}`;
  }

  return data;
}

// =============================================================================
// LIST PENDING APPROVALS
// =============================================================================

/**
 * Get all pending transactions for approval
 * 
 * @returns {Promise<Array>} Pending transactions
 */
export async function listPendingApprovals() {
  const { data, error } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name),
      performer:users!inventory_transactions_performed_by_fkey(id, name),
      items:inventory_transaction_items(
        id, variant_id, quantity,
        variant:product_variants(id, sku, attributes, product:products(id, name))
      )
    `)
    .eq('status', TRANSACTION_STATUSES.PENDING)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError('Failed to fetch pending approvals', 500, 'DATABASE_ERROR');
  }

  return data || [];
}

// =============================================================================
// SEARCH PURCHASE INVOICES
// =============================================================================

/**
 * Search purchase invoices for return linking
 * 
 * @param {Object} filters - Search filters
 * @param {string} [filters.vendor_id] - Vendor ID
 * @param {string} [filters.invoice_no] - Invoice number search
 * @param {number} [filters.limit] - Max results
 * @returns {Promise<Array>} Matching invoices with items
 */
export async function searchPurchaseInvoices(filters) {
  const { vendor_id, invoice_no, limit = 20 } = filters;

  let query = supabaseAdmin
    .from('inventory_transactions')
    .select(`
      id, invoice_no, transaction_date, vendor_id, total_quantity,
      vendor:vendors(id, name),
      items:inventory_transaction_items(
        variant_id, quantity,
        variant:product_variants(id, sku, attributes)
      )
    `)
    .eq('transaction_type', TRANSACTION_TYPES.PURCHASE)
    .eq('status', TRANSACTION_STATUSES.APPROVED)
    .order('transaction_date', { ascending: false })
    .limit(limit);

  if (vendor_id) {
    query = query.eq('vendor_id', vendor_id);
  }

  if (invoice_no) {
    query = query.ilike('invoice_no', `%${invoice_no}%`);
  }

  const { data: invoices, error } = await query;

  if (error) {
    throw new AppError('Failed to search invoices', 500, 'DATABASE_ERROR');
  }

  // Calculate returnable quantities for each invoice
  const result = await Promise.all(
    (invoices || []).map(async (invoice) => {
      // Get already returned quantities
      const { data: returns } = await supabaseAdmin
        .from('inventory_transactions')
        .select('items:inventory_transaction_items(variant_id, quantity)')
        .eq('reference_transaction_id', invoice.id)
        .eq('transaction_type', TRANSACTION_TYPES.PURCHASE_RETURN)
        .eq('status', TRANSACTION_STATUSES.APPROVED);

      const returnedQty = new Map();
      if (returns) {
        for (const ret of returns) {
          for (const item of ret.items || []) {
            const existing = returnedQty.get(item.variant_id) || 0;
            returnedQty.set(item.variant_id, existing + Math.abs(item.quantity));
          }
        }
      }

      const itemsWithRemaining = invoice.items?.map((item) => ({
        ...item,
        returned_qty: returnedQty.get(item.variant_id) || 0,
        remaining_qty: item.quantity - (returnedQty.get(item.variant_id) || 0),
      }));

      return { ...invoice, items: itemsWithRemaining };
    })
  );

  return result;
}

// =============================================================================
// GET VARIANT STOCK MOVEMENTS
// =============================================================================

/**
 * Get stock movement history for a variant
 * 
 * @param {string} variantId - Variant ID
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Stock movements
 */
export async function getVariantStockMovements(variantId, limit = 50) {
  const { data, error } = await supabaseAdmin
    .from('stock_movements')
    .select('*')
    .eq('variant_id', variantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError('Failed to fetch stock movements', 500, 'DATABASE_ERROR');
  }

  return data || [];
}

// =============================================================================
// VOID TRANSACTION
// =============================================================================

/**
 * Void an existing transaction
 * 
 * @param {string} id - Transaction ID
 * @param {string} reason - Void reason
 * @param {string} userId - User voiding the transaction
 * @returns {Promise<Object>} Voided transaction
 */
export async function voidTransaction(id, reason, userId) {
  // Get transaction
  const transaction = await getTransactionById(id);

  if (transaction.status === TRANSACTION_STATUSES.VOIDED) {
    throw new AppError('Transaction already voided', 400, 'ALREADY_VOIDED');
  }

  // Void the transaction
  const { data, error } = await supabaseAdmin
    .from('inventory_transactions')
    .update({
      status: TRANSACTION_STATUSES.VOIDED,
      rejection_reason: `Voided: ${reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new AppError('Failed to void transaction', 500, 'DATABASE_ERROR');
  }

  // TODO: Reverse stock movements if transaction was approved

  return data;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  listTransactions,
  getTransactionById,
  createTransaction,
  approveTransaction,
  rejectTransaction,
  getNextInvoiceNumber,
  listPendingApprovals,
  searchPurchaseInvoices,
  getVariantStockMovements,
  voidTransaction,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
};
