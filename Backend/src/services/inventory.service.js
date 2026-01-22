/**
 * Inventory Service (Enterprise Grade - Service Layer Pattern)
 * 
 * ============================================================================
 * ARCHITECTURE: Clean Service Layer (QUAL-004)
 * ============================================================================
 * 
 * This service handles ALL business logic for inventory transactions.
 * The Controller ONLY handles HTTP request/response.
 * 
 * RESPONSIBILITIES:
 * ├── Database Operations (CRUD)
 * ├── Business Rule Validation
 * ├── ACID Transaction Management
 * ├── Accounting Logic (Vendor Balance)
 * ├── Stock Calculations
 * └── Data Transformation
 * 
 * SECURITY:
 * - All methods return raw data; masking is done in Controller
 * - Transaction validation handled here (return qty checks, etc.)
 * - No HTTP concepts (req, res) - pure business logic
 * 
 * @module services/inventory.service
 */

import { supabaseAdmin } from '../config/supabase.js';
import { transactionTypeConfig } from '../validations/inventory.validation.js';
import { AppError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('InventoryService');

// =============================================================================
// CONSTANTS
// =============================================================================

export const TRANSACTION_TYPES = Object.freeze({
  PURCHASE: 'purchase',
  PURCHASE_RETURN: 'purchase_return',
  DAMAGE: 'damage',
  ADJUSTMENT: 'adjustment',
});

export const TRANSACTION_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  VOIDED: 'voided',
});

// =============================================================================
// INVENTORY SERVICE CLASS
// =============================================================================

class InventoryService {
  // ===========================================================================
  // LIST TRANSACTIONS
  // ===========================================================================

  /**
   * List inventory transactions with filters and pagination
   * 
   * @param {Object} filters - Query filters
   * @param {number} filters.page - Page number (1-indexed)
   * @param {number} filters.limit - Items per page
   * @param {string} [filters.type] - Transaction type filter
   * @param {string} [filters.vendor_id] - Vendor filter
   * @param {string} [filters.from_date] - Start date (YYYY-MM-DD)
   * @param {string} [filters.to_date] - End date (YYYY-MM-DD)
   * @param {string} [filters.search] - Search term for invoice_no or reason
   * @param {string} [filters.status] - Status filter
   * @returns {Promise<{data: Array, count: number}>}
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
        *,
        vendor:vendors(id, name, company_name),
        performer:users!performed_by(id, name, email),
        items:inventory_transaction_items(
          id, variant_id, quantity, unit_cost, stock_before, stock_after,
          variant:product_variants(id, sku, attributes, product:products(id, name))
        )
      `, { count: 'exact' });

    // Apply filters
    if (type) query = query.eq('transaction_type', type);
    if (status) query = query.eq('status', status);
    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (from_date) query = query.gte('transaction_date', from_date);
    if (to_date) query = query.lte('transaction_date', to_date);
    if (search) {
      query = query.or(`invoice_no.ilike.%${search}%,reason.ilike.%${search}%`);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to list transactions', { error });
      throw new AppError('Failed to fetch transactions', 500, 'DATABASE_ERROR');
    }

    return { data: data || [], count: count || 0 };
  }

  // ===========================================================================
  // GET SINGLE TRANSACTION
  // ===========================================================================

  /**
   * Get transaction by ID with all related data
   * 
   * @param {string} id - Transaction UUID
   * @returns {Promise<Object>} Transaction with items and relations
   */
  async getTransactionById(id) {
    const { data, error } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        *,
        vendor:vendors(id, name, company_name, phone, email, balance),
        performer:users!performed_by(id, name, email),
        approver:users!approved_by(id, name, email),
        items:inventory_transaction_items(
          id, variant_id, quantity, unit_cost, stock_before, stock_after, source_type, notes,
          variant:product_variants(
            id, sku, attributes, current_stock, damaged_stock,
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
      logger.error('Failed to get transaction', { id, error });
      throw new AppError('Failed to fetch transaction', 500, 'DATABASE_ERROR');
    }

    // Fetch reference transaction separately if exists (self-referencing FK)
    let reference = null;
    if (data?.reference_transaction_id) {
      const { data: refData } = await supabaseAdmin
        .from('inventory_transactions')
        .select('id, invoice_no, transaction_type, transaction_date')
        .eq('id', data.reference_transaction_id)
        .single();
      reference = refData;
    }

    // Add calculated totals
    const totalQuantity = data.items?.reduce((sum, item) => sum + Math.abs(item.quantity || 0), 0) || 0;
    const totalCost = data.items?.reduce((sum, item) => 
      sum + (Math.abs(item.quantity || 0) * (item.unit_cost || 0)), 0) || 0;

    return {
      ...data,
      reference,
      calculated_total_quantity: totalQuantity,
      calculated_total_cost: totalCost,
    };
  }

  // ===========================================================================
  // CREATE TRANSACTION (CORE BUSINESS LOGIC)
  // ===========================================================================

  /**
   * Create a new inventory transaction with full accounting logic
   * 
   * Implements ACID transaction management:
   * 1. Create transaction header
   * 2. Create transaction items (triggers stock update)
   * 3. Update vendor balance (for purchase/return)
   * 4. Update transaction totals
   * 
   * @param {Object} data - Validated transaction data
   * @param {string} data.transaction_type - Type of transaction
   * @param {string} data.invoice_no - Unique invoice number
   * @param {string} [data.vendor_id] - Vendor UUID (required for purchase/return)
   * @param {string} [data.reference_transaction_id] - Original purchase (for returns)
   * @param {string} [data.reason] - Reason (required for damage/adjustment)
   * @param {string} [data.notes] - Additional notes
   * @param {Array} data.items - Transaction items with variant_id, quantity, unit_cost
   * @param {string} userId - User creating the transaction
   * @param {string} userRole - User's role (admin/staff/operator)
   * @returns {Promise<Object>} Created transaction with items
   */
  async createTransaction(data, userId, userRole) {
    const isAdmin = userRole === 'admin';
    const config = transactionTypeConfig[data.transaction_type];

    logger.info('Creating transaction', { 
      type: data.transaction_type, 
      userId, 
      itemCount: data.items?.length 
    });

    // =========================================================================
    // STEP 1: Parse and validate items
    // =========================================================================
    const parsedItems = this._parseItems(data.items, config);

    if (parsedItems.length === 0) {
      throw new AppError('No valid items with non-zero quantity', 400, 'NO_VALID_ITEMS');
    }

    // =========================================================================
    // STEP 2: Determine transaction status (Maker-Checker)
    // =========================================================================
    let transactionStatus = TRANSACTION_STATUSES.APPROVED;
    
    if (data.transaction_type !== TRANSACTION_TYPES.PURCHASE && !isAdmin) {
      transactionStatus = TRANSACTION_STATUSES.PENDING;
      logger.info('Transaction set to PENDING (staff created non-purchase)', { userRole });
    }

    // =========================================================================
    // STEP 3: Lock date for non-purchase transactions (audit security)
    // =========================================================================
    const transactionDate = data.transaction_type === TRANSACTION_TYPES.PURCHASE
      ? (data.transaction_date || new Date().toISOString().split('T')[0])
      : new Date().toISOString().split('T')[0];

    // =========================================================================
    // STEP 4: Validate purchase return (CRIT-002)
    // =========================================================================
    if (data.transaction_type === TRANSACTION_TYPES.PURCHASE_RETURN) {
      await this._validatePurchaseReturn(data, parsedItems);
    }

    // =========================================================================
    // STEP 5: Create transaction header
    // =========================================================================
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
        status: transactionStatus,
        reference_transaction_id: data.reference_transaction_id || null,
        server_timestamp: new Date().toISOString(),
        approved_by: transactionStatus === TRANSACTION_STATUSES.APPROVED ? userId : null,
        approval_date: transactionStatus === TRANSACTION_STATUSES.APPROVED ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (txError) {
      if (txError.code === '23505') {
        throw new AppError('Invoice number already exists', 400, 'DUPLICATE_INVOICE');
      }
      logger.error('Failed to create transaction header', { error: txError });
      throw new AppError('Failed to create transaction', 500, 'DATABASE_ERROR');
    }

    logger.debug('Transaction header created', { transactionId: transaction.id });

    // =========================================================================
    // STEP 6: Insert transaction items (stock updated by DB trigger)
    // =========================================================================
    const itemsToInsert = parsedItems.map((item) => ({
      transaction_id: transaction.id,
      variant_id: item.variant_id,
      quantity: config.quantityDirection === 'out' ? -Math.abs(item.quantity) : Math.abs(item.quantity),
      unit_cost: item.unit_cost,
      source_type: item.source_type || 'fresh',
      notes: item.notes || null,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('inventory_transaction_items')
      .insert(itemsToInsert);

    if (itemsError) {
      // Rollback: Delete transaction header
      await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);
      logger.error('Failed to create transaction items, rolling back', { error: itemsError });
      throw new AppError('Failed to create transaction items', 500, 'DATABASE_ERROR');
    }

    // =========================================================================
    // STEP 7: Update vendor balance (ACCOUNTING LOGIC)
    // =========================================================================
    if (transactionStatus === TRANSACTION_STATUSES.APPROVED && data.vendor_id) {
      await this._updateVendorBalance(
        data.vendor_id,
        data.transaction_type,
        parsedItems
      );
    }

    // =========================================================================
    // STEP 8: Update transaction totals
    // =========================================================================
    const totalQuantity = parsedItems.reduce((sum, item) => sum + Math.abs(item.quantity), 0);
    const totalCost = parsedItems.reduce((sum, item) => 
      sum + (Math.abs(item.quantity) * item.unit_cost), 0);

    await supabaseAdmin
      .from('inventory_transactions')
      .update({
        total_quantity: totalQuantity,
        total_cost: totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id);

    // =========================================================================
    // STEP 9: Return complete transaction
    // =========================================================================
    logger.info('Transaction created successfully', {
      id: transaction.id,
      type: data.transaction_type,
      status: transactionStatus,
      itemCount: parsedItems.length,
      totalQuantity,
    });

    const completeTransaction = await this.getTransactionById(transaction.id);
    
    return {
      ...completeTransaction,
      requires_approval: transactionStatus === TRANSACTION_STATUSES.PENDING,
    };
  }

  // ===========================================================================
  // APPROVE TRANSACTION
  // ===========================================================================

  /**
   * Approve a pending transaction (Admin only)
   * Updates stock via database function and vendor balance
   * 
   * @param {string} id - Transaction UUID
   * @param {string} approverId - Admin user UUID
   * @returns {Promise<Object>} Approved transaction
   */
  async approveTransaction(id, approverId) {
    // Call database function for atomic stock update
    const { data, error } = await supabaseAdmin.rpc('approve_inventory_transaction', {
      p_transaction_id: id,
      p_approved_by: approverId,
    });

    if (error) {
      logger.error('Failed to approve transaction', { id, error });
      throw new AppError(error.message || 'Failed to approve transaction', 400, 'APPROVAL_FAILED');
    }

    // Update vendor balance for approved transaction
    const transaction = await this.getTransactionById(id);
    
    if (transaction.vendor_id && transaction.items?.length > 0) {
      await this._updateVendorBalance(
        transaction.vendor_id,
        transaction.transaction_type,
        transaction.items
      );
    }

    logger.info('Transaction approved', { id, approvedBy: approverId });

    return transaction;
  }

  // ===========================================================================
  // REJECT TRANSACTION
  // ===========================================================================

  /**
   * Reject a pending transaction (Admin only)
   * 
   * @param {string} id - Transaction UUID
   * @param {string} reason - Rejection reason (min 5 chars)
   * @param {string} rejectorId - Admin user UUID
   * @returns {Promise<Object>} Rejected transaction
   */
  async rejectTransaction(id, reason, rejectorId) {
    const { data, error } = await supabaseAdmin.rpc('reject_inventory_transaction', {
      p_transaction_id: id,
      p_rejected_by: rejectorId,
      p_rejection_reason: reason,
    });

    if (error) {
      logger.error('Failed to reject transaction', { id, error });
      throw new AppError(error.message || 'Failed to reject transaction', 400, 'REJECTION_FAILED');
    }

    logger.info('Transaction rejected', { id, rejectedBy: rejectorId, reason });

    return data?.[0] || null;
  }

  // ===========================================================================
  // VOID TRANSACTION
  // ===========================================================================

  /**
   * Void an existing transaction (Admin only)
   * 
   * @param {string} id - Transaction UUID
   * @param {string} reason - Void reason (min 10 chars)
   * @param {string} userId - Admin user UUID
   * @returns {Promise<Object>} Voided transaction
   */
  async voidTransaction(id, reason, userId) {
    const transaction = await this.getTransactionById(id);

    if (transaction.status === TRANSACTION_STATUSES.VOIDED) {
      throw new AppError('Transaction is already voided', 400, 'ALREADY_VOIDED');
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_transactions')
      .update({
        status: TRANSACTION_STATUSES.VOIDED,
        notes: `${transaction.notes || ''}\n\n[VOIDED: ${reason}]`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to void transaction', { id, error });
      throw new AppError('Failed to void transaction', 500, 'DATABASE_ERROR');
    }

    logger.info('Transaction voided', { id, voidedBy: userId, reason });

    // TODO: Reverse stock movements if transaction was approved
    return data;
  }

  // ===========================================================================
  // LIST PENDING APPROVALS
  // ===========================================================================

  /**
   * Get all pending transactions for approval dashboard
   * 
   * @returns {Promise<{data: Array, count: number}>}
   */
  async listPendingApprovals() {
    const { data, error, count } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        *,
        vendor:vendors(id, name, company_name),
        performer:users!performed_by(id, name, email),
        items:inventory_transaction_items(
          id, variant_id, quantity, unit_cost,
          variant:product_variants(id, sku, attributes, product:products(id, name))
        )
      `, { count: 'exact' })
      .eq('status', TRANSACTION_STATUSES.PENDING)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to list pending approvals', { error });
      throw new AppError('Failed to fetch pending approvals', 500, 'DATABASE_ERROR');
    }

    return { data: data || [], count: count || 0 };
  }

  // ===========================================================================
  // GET NEXT INVOICE NUMBER
  // ===========================================================================

  /**
   * Get next invoice number for a transaction type
   * 
   * @param {string} type - Transaction type (purchase, purchase_return, damage, adjustment)
   * @returns {Promise<string>} Next invoice number
   */
  async getNextInvoiceNumber(type) {
    const { data, error } = await supabaseAdmin.rpc('get_next_invoice_number', {
      p_type: type,
    });

    if (error) {
      // Fallback to timestamp-based
      const prefix = transactionTypeConfig[type]?.prefix || 'TXN';
      return `${prefix}-${Date.now().toString().slice(-6)}`;
    }

    return data;
  }

  // ===========================================================================
  // SEARCH PURCHASE INVOICES (For linking returns)
  // ===========================================================================

  /**
   * Search purchase invoices for return linking
   * Returns invoices with remaining returnable quantities
   * 
   * @param {Object} filters - Search filters
   * @param {string} [filters.vendor_id] - Filter by vendor
   * @param {string} [filters.invoice_no] - Search by invoice number
   * @param {number} [filters.limit=20] - Max results
   * @returns {Promise<Array>} Invoices with items and remaining quantities
   */
  async searchPurchaseInvoices(filters) {
    const { vendor_id, invoice_no, limit = 20 } = filters;

    let query = supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, invoice_no, transaction_date, total_quantity, total_cost,
        vendor:vendors(id, name),
        items:inventory_transaction_items(
          variant_id, quantity, unit_cost,
          variant:product_variants(id, sku, attributes, current_stock)
        )
      `)
      .eq('transaction_type', TRANSACTION_TYPES.PURCHASE)
      .eq('status', TRANSACTION_STATUSES.APPROVED)
      .order('transaction_date', { ascending: false })
      .limit(Number(limit));

    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (invoice_no) query = query.ilike('invoice_no', `%${invoice_no}%`);

    const { data: invoices, error } = await query;

    if (error) {
      logger.error('Failed to search purchase invoices', { error });
      throw new AppError('Failed to search invoices', 500, 'DATABASE_ERROR');
    }

    // Calculate remaining quantities for each invoice
    return this._addRemainingQuantities(invoices || []);
  }

  // ===========================================================================
  // GET VARIANT STOCK MOVEMENTS
  // ===========================================================================

  /**
   * Get stock movement history for a product variant
   * 
   * @param {string} variantId - Product variant UUID
   * @param {number} [limit=50] - Max results
   * @returns {Promise<Array>} Stock movements
   */
  async getVariantStockMovements(variantId, limit = 50) {
    const { data, error } = await supabaseAdmin
      .from('inventory_transaction_items')
      .select(`
        id, quantity, unit_cost, stock_before, stock_after, created_at,
        transaction:inventory_transactions(
          id, transaction_type, invoice_no, transaction_date,
          vendor:vendors(id, name)
        )
      `)
      .eq('variant_id', variantId)
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (error) {
      logger.error('Failed to get variant stock movements', { variantId, error });
      throw new AppError('Failed to fetch stock movements', 500, 'DATABASE_ERROR');
    }

    return data || [];
  }

  // ===========================================================================
  // GET INVENTORY VALUATION
  // ===========================================================================

  /**
   * Calculate total inventory valuation at cost
   * 
   * @returns {Promise<Object>} Valuation summary
   */
  async getInventoryValuation() {
    const { data, error } = await supabaseAdmin
      .from('product_variants')
      .select('current_stock, cost_price')
      .eq('is_active', true);

    if (error) {
      logger.error('Failed to calculate inventory valuation', { error });
      throw new AppError('Failed to calculate valuation', 500, 'DATABASE_ERROR');
    }

    let totalStock = 0;
    let totalValue = 0;

    (data || []).forEach((variant) => {
      const stock = variant.current_stock || 0;
      const cost = variant.cost_price || 0;
      totalStock += stock;
      totalValue += stock * cost;
    });

    return {
      total_stock: totalStock,
      total_value: totalValue,
      variant_count: data?.length || 0,
      calculated_at: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // GET LOW STOCK ALERTS
  // ===========================================================================

  /**
   * Get variants with stock below threshold
   * 
   * @param {number} [threshold=10] - Stock threshold
   * @returns {Promise<Array>} Low stock variants
   */
  async getLowStockAlerts(threshold = 10) {
    const { data, error } = await supabaseAdmin
      .from('product_variants')
      .select(`
        id, sku, attributes, current_stock, reorder_level,
        product:products(id, name, image_url)
      `)
      .eq('is_active', true)
      .lte('current_stock', threshold)
      .order('current_stock', { ascending: true })
      .limit(50);

    if (error) {
      logger.error('Failed to get low stock alerts', { error });
      throw new AppError('Failed to fetch low stock alerts', 500, 'DATABASE_ERROR');
    }

    return data || [];
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  /**
   * Parse and validate transaction items
   * 
   * @private
   * @param {Array} items - Raw items from request
   * @param {Object} config - Transaction type config
   * @returns {Array} Parsed items
   */
  _parseItems(items, config) {
    return items
      .map((item, index) => {
        const qty = parseInt(item.qty || item.quantity || 0, 10);
        const unitCost = parseFloat(item.unit_cost || item.unitCost || 0);

        if (qty === 0) {
          logger.debug(`Item ${index} has quantity 0, skipping`);
        }

        return {
          variant_id: item.variant_id,
          quantity: qty,
          unit_cost: unitCost,
          source_type: item.source_type || 'fresh',
          notes: item.notes || null,
        };
      })
      .filter(item => item.quantity !== 0);
  }

  /**
   * Validate purchase return quantities against original invoice
   * Implements CRIT-002 security fix
   * 
   * @private
   * @param {Object} data - Return transaction data
   * @param {Array} parsedItems - Parsed items to return
   * @throws {AppError} If validation fails
   */
  async _validatePurchaseReturn(data, parsedItems) {
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
    const validationErrors = [];

    for (const returnItem of parsedItems) {
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

        validationErrors.push({
          variant_id: returnItem.variant_id,
          sku: variant?.sku || returnItem.variant_id,
          requested: requestedQty,
          original: originalQty,
          already_returned: alreadyReturned,
          max_returnable: maxReturnable,
          message: `Cannot return ${requestedQty}. Max returnable: ${maxReturnable}`,
        });
      }

      if (originalQty === 0) {
        validationErrors.push({
          variant_id: returnItem.variant_id,
          message: 'Item was not in the original purchase invoice',
        });
      }
    }

    if (validationErrors.length > 0) {
      logger.warn('SECURITY: Return quantity validation failed', { 
        referenceId: data.reference_transaction_id, 
        errors: validationErrors 
      });
      
      throw new AppError(
        'Cannot return more than originally purchased',
        400,
        'RETURN_QUANTITY_EXCEEDED',
        { details: validationErrors }
      );
    }

    logger.debug('Return validation passed', {
      referenceId: data.reference_transaction_id,
      itemCount: parsedItems.length,
    });
  }

  /**
   * Update vendor balance based on transaction type
   * 
   * ACCOUNTING LOGIC:
   * - Purchase: balance += total (we owe them more)
   * - Purchase Return: balance -= total (we owe them less)
   * - Damage/Adjustment: No change
   * 
   * @private
   * @param {string} vendorId - Vendor UUID
   * @param {string} transactionType - Type of transaction
   * @param {Array} items - Transaction items
   */
  async _updateVendorBalance(vendorId, transactionType, items) {
    // Only purchase and return affect vendor balance
    if (transactionType !== TRANSACTION_TYPES.PURCHASE && 
        transactionType !== TRANSACTION_TYPES.PURCHASE_RETURN) {
      logger.debug('Transaction type does not affect vendor balance', { transactionType });
      return;
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => {
      return sum + (Math.abs(item.quantity) * (item.unit_cost || 0));
    }, 0);

    if (totalAmount <= 0) {
      logger.debug('Total amount is zero, skipping vendor balance update');
      return;
    }

    // Get current vendor balance
    const { data: vendor, error: fetchError } = await supabaseAdmin
      .from('vendors')
      .select('id, name, balance')
      .eq('id', vendorId)
      .single();

    if (fetchError || !vendor) {
      logger.error('Failed to fetch vendor for balance update', { vendorId, error: fetchError });
      return;
    }

    const currentBalance = parseFloat(vendor.balance) || 0;
    let newBalance = currentBalance;

    // Apply accounting logic
    switch (transactionType) {
      case TRANSACTION_TYPES.PURCHASE:
        newBalance = currentBalance + totalAmount;
        logger.info('PURCHASE: Vendor balance increased', {
          vendor: vendor.name,
          from: currentBalance,
          add: totalAmount,
          to: newBalance,
        });
        break;

      case TRANSACTION_TYPES.PURCHASE_RETURN:
        newBalance = currentBalance - totalAmount;
        logger.info('PURCHASE_RETURN: Vendor balance decreased', {
          vendor: vendor.name,
          from: currentBalance,
          subtract: totalAmount,
          to: newBalance,
        });
        break;
    }

    // Update vendor balance
    const { error: updateError } = await supabaseAdmin
      .from('vendors')
      .update({ 
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId);

    if (updateError) {
      logger.error('Failed to update vendor balance', { vendorId, error: updateError });
      // Note: We don't throw here to avoid rolling back the entire transaction
      // In production, consider using a proper database transaction or event queue
    }
  }

  /**
   * Add remaining quantities to invoice items for return linking
   * 
   * @private
   * @param {Array} invoices - Purchase invoices
   * @returns {Promise<Array>} Invoices with remaining quantities
   */
  async _addRemainingQuantities(invoices) {
    return Promise.all(
      invoices.map(async (invoice) => {
        // Get already returned quantities for this invoice
        const { data: returns } = await supabaseAdmin
          .from('inventory_transactions')
          .select('items:inventory_transaction_items(variant_id, quantity)')
          .eq('reference_transaction_id', invoice.id)
          .eq('transaction_type', TRANSACTION_TYPES.PURCHASE_RETURN)
          .eq('status', TRANSACTION_STATUSES.APPROVED);

        const returnedQtyMap = new Map();
        if (returns) {
          for (const ret of returns) {
            for (const item of ret.items || []) {
              const existing = returnedQtyMap.get(item.variant_id) || 0;
              returnedQtyMap.set(item.variant_id, existing + Math.abs(item.quantity));
            }
          }
        }

        // Add remaining qty to each item
        const itemsWithRemaining = (invoice.items || []).map((item) => ({
          ...item,
          original_qty: Math.abs(item.quantity),
          returned_qty: returnedQtyMap.get(item.variant_id) || 0,
          remaining_qty: Math.abs(item.quantity) - (returnedQtyMap.get(item.variant_id) || 0),
        }));

        return {
          ...invoice,
          items: itemsWithRemaining,
        };
      })
    );
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const inventoryService = new InventoryService();
export default inventoryService;
