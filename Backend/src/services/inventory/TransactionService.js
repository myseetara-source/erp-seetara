/**
 * Transaction Service
 * 
 * Handles CRUD for inventory transactions:
 * - List transactions
 * - Get transaction by ID
 * - Create transactions (purchase, return, damage, adjustment)
 * - Void transactions
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { transactionTypeConfig } from '../../validations/inventory.validation.js';
import { AppError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from './constants.js';
import { stockCoreService } from './StockCore.service.js';
import { buildSafeOrQuery } from '../../utils/helpers.js';

const logger = createLogger('TransactionService');

class TransactionService {
  /**
   * List inventory transactions with filters and pagination
   */
  async listTransactions(filters) {
    const { 
      page = 1, 
      limit = 20, 
      type, 
      vendor_id, 
      from_date, 
      to_date, 
      search, 
      status 
    } = filters;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, invoice_no, transaction_type, transaction_date, total_cost, status, notes, created_at, performed_by, approved_by,
        vendor:vendors(id, name, company_name),
        items:inventory_transaction_items(
          id, variant_id, quantity, unit_cost, notes,
          variant:product_variants(id, sku, product:products(id, name))
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) query = query.eq('transaction_type', type);
    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (status) query = query.eq('status', status);
    if (from_date) query = query.gte('transaction_date', from_date);
    if (to_date) query = query.lte('transaction_date', to_date);
    if (search) {
      const safeQuery = buildSafeOrQuery(search, ['invoice_no', 'notes']);
      if (safeQuery) query = query.or(safeQuery);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to list transactions', { error });
      throw new AppError('Failed to list transactions', 500);
    }

    return { data: data || [], count };
  }

  /**
   * Get transaction by ID with full details
   */
  async getTransactionById(id) {
    // First get the transaction without user joins (foreign key hints can fail)
    const { data, error } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        *,
        vendor:vendors(id, name, company_name, phone),
        items:inventory_transaction_items(
          id, variant_id, quantity, unit_cost, source_type, stock_before, stock_after, notes,
          variant:product_variants(id, sku, current_stock, product:products(id, name, image_url))
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new AppError('Transaction not found', 404);
      }
      logger.error('Failed to get transaction', { id, error });
      throw new AppError('Failed to get transaction', 500);
    }

    // Fetch user info separately if performed_by or approved_by exist
    if (data) {
      if (data.performed_by) {
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, name, email')
          .eq('id', data.performed_by)
          .single();
        data.performed_by_user = user || null;
      }
      if (data.approved_by) {
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, name, email')
          .eq('id', data.approved_by)
          .single();
        data.approved_by_user = user || null;
      }
    }

    // If this is a return, get the reference transaction
    if (data?.reference_transaction_id) {
      const { data: refTx } = await supabaseAdmin
        .from('inventory_transactions')
        .select('id, invoice_no, transaction_date')
        .eq('id', data.reference_transaction_id)
        .single();
      data.reference_transaction = refTx;
    }

    return data;
  }

  /**
   * Create inventory transaction
   */
  async createTransaction(data, userId, userRole) {
    const isAdmin = ['admin', 'manager'].includes(userRole);
    const transactionStatus = isAdmin 
      ? TRANSACTION_STATUSES.APPROVED 
      : TRANSACTION_STATUSES.PENDING;

    // Parse and validate items
    const parsedItems = this._parseItems(data.items, transactionTypeConfig[data.transaction_type]);
    if (parsedItems.length === 0) {
      throw new AppError('At least one valid item is required', 400);
    }

    // Non-admin can only create purchases (pending approval)
    if (data.transaction_type !== TRANSACTION_TYPES.PURCHASE && !isAdmin) {
      throw new AppError('Only admin/manager can create non-purchase transactions', 403);
    }

    // Additional validation for returns
    if (data.transaction_type === TRANSACTION_TYPES.PURCHASE_RETURN) {
      await this._validatePurchaseReturn(data, parsedItems);
    }

    // Get next invoice number
    const invoiceNo = await stockCoreService.getNextInvoiceNumber(data.transaction_type);

    // Calculate total cost - using 'quantity' field (schema uses quantity + source_type)
    const totalCost = parsedItems.reduce(
      (sum, item) => sum + (Math.abs(item.quantity || item.quantity_fresh || 0) * (item.unit_cost || 0)),
      0
    );

    // Calculate total quantity
    const totalQuantity = parsedItems.reduce(
      (sum, item) => sum + Math.abs(item.quantity || item.quantity_fresh || 0),
      0
    );

    // Create transaction record
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        invoice_no: invoiceNo,
        transaction_type: data.transaction_type,
        vendor_id: data.vendor_id || null,
        transaction_date: data.transaction_date || new Date().toISOString().split('T')[0],
        reference_transaction_id: data.reference_transaction_id || null,
        total_cost: totalCost,
        total_quantity: totalQuantity,
        status: transactionStatus,
        notes: data.notes || null,
        reason: data.reason || null,
        performed_by: userId,
        approved_by: isAdmin ? userId : null,
        approval_date: isAdmin ? new Date().toISOString() : null,
        approved_at: isAdmin ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (txError) {
      if (txError.code === '23505') {
        throw new AppError('Duplicate invoice number', 409);
      }
      logger.error('Failed to create transaction', { error: txError });
      throw new AppError('Failed to create transaction', 500);
    }

    // Insert items
    // quantity is positive for stock in (purchase), negative for stock out (damage, return)
    const itemRecords = parsedItems.map(item => {
      // Use 'quantity' field, fallback to quantity_fresh for backward compatibility
      let qty = item.quantity || item.quantity_fresh || 0;
      // For damage and returns, quantity should be negative
      if (['damage', 'purchase_return', 'adjustment'].includes(data.transaction_type)) {
        qty = -Math.abs(qty);
      }
      return {
        transaction_id: transaction.id,
        variant_id: item.variant_id,
        quantity: qty,
        unit_cost: item.unit_cost || 0,
        source_type: item.source_type || 'fresh',
        notes: item.reason || null,
      };
    });

    const { error: itemsError } = await supabaseAdmin
      .from('inventory_transaction_items')
      .insert(itemRecords);

    if (itemsError) {
      await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);
      logger.error('Failed to create transaction items', { error: itemsError });
      throw new AppError('Failed to create transaction items', 500);
    }

    // If auto-approved, update stock and vendor balance
    if (transactionStatus === TRANSACTION_STATUSES.APPROVED) {
      // Stock is updated via database trigger
      // Update vendor balance for purchases/returns
      if (data.vendor_id) {
        await this._updateVendorBalance(data.vendor_id, data.transaction_type, parsedItems);
      }
    }

    logger.info('Transaction created', {
      id: transaction.id,
      type: data.transaction_type,
      status: transactionStatus,
      itemCount: parsedItems.length,
    });

    return this.getTransactionById(transaction.id);
  }

  /**
   * Void a transaction
   */
  async voidTransaction(id, reason, userId) {
    const transaction = await this.getTransactionById(id);

    if (transaction.status === TRANSACTION_STATUSES.VOIDED) {
      throw new AppError('Transaction is already voided', 400);
    }

    if (transaction.status === TRANSACTION_STATUSES.PENDING) {
      // Just mark as voided, no stock reversal needed
      const { error } = await supabaseAdmin
        .from('inventory_transactions')
        .update({
          status: TRANSACTION_STATUSES.VOIDED,
          void_reason: reason,
          voided_by: userId,
          voided_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        throw new AppError('Failed to void transaction', 500);
      }

      return this.getTransactionById(id);
    }

    // For approved transactions, need to reverse stock
    // This should be handled by database triggers

    const { error } = await supabaseAdmin
      .from('inventory_transactions')
      .update({
        status: TRANSACTION_STATUSES.VOIDED,
        void_reason: reason,
        voided_by: userId,
        voided_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new AppError('Failed to void transaction', 500);
    }

    logger.info('Transaction voided', { id, reason });

    return this.getTransactionById(id);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Parse and validate items array
   * FIXED: Use 'quantity' field (not quantity_fresh/damaged which don't exist in schema)
   */
  _parseItems(items, config) {
    if (!Array.isArray(items)) return [];

    return items
      .map(item => {
        const qty = parseInt(item.quantity || item.quantity_fresh || 0, 10);
        if (qty === 0) return null;

        return {
          variant_id: item.variant_id,
          quantity: qty,
          // Keep quantity_fresh for backward compat with other code
          quantity_fresh: qty,
          quantity_damaged: 0,
          unit_cost: parseFloat(item.unit_cost || item.cost_price || 0),
          source_type: item.source_type || 'fresh',
          reason: item.reason || null,
        };
      })
      .filter(Boolean);
  }

  /**
   * Validate purchase return data
   * Supports two modes:
   * 1. Referenced Return: Links to original purchase invoice, validates quantities
   * 2. Direct Vendor Return (Debit Note): No invoice linking, allows any quantity
   */
  async _validatePurchaseReturn(data, parsedItems) {
    if (!data.vendor_id) {
      throw new AppError('Vendor is required for purchase returns', 400);
    }

    // DIRECT VENDOR RETURN: If no reference provided, skip quantity validation
    // This allows creating debit notes without linking to specific purchases
    if (!data.reference_transaction_id) {
      logger.info('Creating direct vendor return (debit note) without reference invoice');
      return; // No further validation needed for direct returns
    }

    // REFERENCED RETURN: Validate quantities don't exceed original purchase
    const { data: originalPurchase } = await supabaseAdmin
      .from('inventory_transactions')
      .select('items:inventory_transaction_items(variant_id, quantity)')
      .eq('id', data.reference_transaction_id)
      .single();

    if (!originalPurchase) {
      throw new AppError('Reference purchase not found', 404);
    }

    const purchaseMap = new Map();
    for (const item of originalPurchase.items || []) {
      purchaseMap.set(item.variant_id, Math.abs(item.quantity || 0));
    }

    for (const returnItem of parsedItems) {
      const purchasedQty = purchaseMap.get(returnItem.variant_id);
      if (!purchasedQty) {
        throw new AppError(`Variant ${returnItem.variant_id} was not in the original purchase`, 400);
      }

      // Use quantity field (schema uses quantity, not quantity_fresh/damaged)
      const returnQty = returnItem.quantity || returnItem.quantity_fresh || 0;
      if (returnQty > purchasedQty) {
        throw new AppError(`Cannot return more units than purchased`, 400);
      }
    }
  }

  /**
   * Update vendor balance for transactions using atomic RPC
   * 
   * SECURITY: Uses database-level row locking (FOR UPDATE) to prevent race conditions.
   * This guarantees 100% accurate financial records even under high concurrency.
   * 
   * @param {string} vendorId - UUID of the vendor
   * @param {string} transactionType - PURCHASE or PURCHASE_RETURN
   * @param {Array} items - Transaction items with quantity and unit_cost
   */
  async _updateVendorBalance(vendorId, transactionType, items) {
    // Calculate total amount from items
    // FIXED: Use quantity field (not quantity_fresh/damaged)
    const totalAmount = items.reduce(
      (sum, item) => sum + (Math.abs(item.quantity || item.quantity_fresh || 0) * (item.unit_cost || 0)),
      0
    );

    if (totalAmount <= 0) {
      logger.debug('Skipping vendor balance update - zero amount', { vendorId, transactionType });
      return;
    }

    // Map internal transaction type to RPC type
    let rpcType;
    switch (transactionType) {
      case TRANSACTION_TYPES.PURCHASE:
        rpcType = 'PURCHASE';
        break;
      case TRANSACTION_TYPES.PURCHASE_RETURN:
        rpcType = 'PURCHASE_RETURN';
        break;
      default:
        logger.debug('Skipping vendor balance update - unsupported type', { vendorId, transactionType });
        return;
    }

    // Call atomic RPC function with row-level locking
    // This prevents race conditions where two concurrent transactions could corrupt the balance
    const { data, error } = await supabaseAdmin.rpc('update_vendor_balance_atomic', {
      p_vendor_id: vendorId,
      p_amount: totalAmount,
      p_type: rpcType,
    });

    if (error) {
      logger.error('Failed to update vendor balance (RPC error)', { 
        vendorId, 
        transactionType: rpcType,
        amount: totalAmount,
        error: error.message,
      });
      throw new AppError(`Failed to update vendor balance: ${error.message}`, 500);
    }

    // Check RPC response for business logic errors
    if (data && !data.success) {
      logger.error('Vendor balance update failed', { 
        vendorId, 
        transactionType: rpcType,
        amount: totalAmount,
        rpcError: data.error,
      });
      throw new AppError(`Vendor balance update failed: ${data.error}`, 400);
    }

    logger.info('Vendor balance updated atomically', {
      vendorId,
      transactionType: rpcType,
      amount: totalAmount,
      previousBalance: data?.previous_balance,
      newBalance: data?.new_balance,
    });
  }
}

export const transactionService = new TransactionService();
export default transactionService;
