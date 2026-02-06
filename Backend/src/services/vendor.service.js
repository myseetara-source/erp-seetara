/**
 * Vendor Service
 * Handles vendor management, supplies, and ledger operations
 */

import { supabaseAdmin } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';
import {
  NotFoundError,
  ConflictError,
  DatabaseError,
  ValidationError,
} from '../utils/errors.js';
import { productService } from './product.service.js';
import { buildSafeOrQuery } from '../utils/helpers.js';

const logger = createLogger('VendorService');

class VendorService {
  // ===========================================================================
  // VENDOR CRUD
  // ===========================================================================

  /**
   * Create a new vendor
   * @param {Object} data - Vendor data (may be camelCase or snake_case)
   * @returns {Object} Created vendor
   */
  async createVendor(data) {
    // Map frontend camelCase to database snake_case
    // Support both naming conventions for backward compatibility
    const vendorData = {
      name: data.name || data.contactName,
      company_name: data.company_name || data.companyName,
      phone: data.phone,
      alt_phone: data.alt_phone || data.altPhone,
      email: data.email,
      address: data.address,
      gst_number: data.gst_number || data.gstNumber,
      pan_number: data.pan_number || data.panNumber,
      bank_details: data.bank_details || data.bankDetails || {},
      balance: data.balance || 0,
      credit_limit: data.credit_limit || data.creditLimit || 0,
      payment_terms: data.payment_terms || data.paymentTerms || 30,
      is_active: data.is_active !== undefined ? data.is_active : true,
      notes: data.notes,
    };

    // Remove undefined fields
    Object.keys(vendorData).forEach(key => {
      if (vendorData[key] === undefined) {
        delete vendorData[key];
      }
    });

    // Validate required fields
    if (!vendorData.name) {
      throw new ValidationError('Vendor name is required');
    }
    if (!vendorData.phone) {
      throw new ValidationError('Vendor phone is required');
    }

    // Check for duplicate phone
    const { data: existing } = await supabaseAdmin
      .from('vendors')
      .select('id')
      .eq('phone', vendorData.phone)
      .single();

    if (existing) {
      throw new ConflictError('Vendor with this phone number already exists');
    }

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .insert(vendorData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create vendor', { error, vendorData });
      throw new DatabaseError('Failed to create vendor', error);
    }

    logger.info('Vendor created', { vendorId: vendor.id, name: vendor.name });
    return vendor;
  }

  /**
   * Get vendor by ID
   * @param {string} id - Vendor UUID
   * @returns {Object} Vendor
   */
  async getVendorById(id) {
    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .select('id, name, company_name, phone, email, address, pan_number, balance, total_purchases, total_payments, is_active, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !vendor) {
      throw new NotFoundError('Vendor');
    }

    return vendor;
  }

  /**
   * Update vendor
   * @param {string} id - Vendor UUID
   * @param {Object} data - Update data (may be camelCase or snake_case)
   * @returns {Object} Updated vendor
   */
  async updateVendor(id, data) {
    // Map frontend camelCase to database snake_case
    const updateData = {};
    
    // Map all possible fields
    if (data.name !== undefined || data.contactName !== undefined) {
      updateData.name = data.name || data.contactName;
    }
    if (data.company_name !== undefined || data.companyName !== undefined) {
      updateData.company_name = data.company_name || data.companyName;
    }
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.alt_phone !== undefined || data.altPhone !== undefined) {
      updateData.alt_phone = data.alt_phone || data.altPhone;
    }
    if (data.email !== undefined) updateData.email = data.email;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.gst_number !== undefined || data.gstNumber !== undefined) {
      updateData.gst_number = data.gst_number || data.gstNumber;
    }
    if (data.pan_number !== undefined || data.panNumber !== undefined) {
      updateData.pan_number = data.pan_number || data.panNumber;
    }
    if (data.bank_details !== undefined || data.bankDetails !== undefined) {
      updateData.bank_details = data.bank_details || data.bankDetails;
    }
    if (data.balance !== undefined) updateData.balance = data.balance;
    if (data.credit_limit !== undefined || data.creditLimit !== undefined) {
      updateData.credit_limit = data.credit_limit || data.creditLimit;
    }
    if (data.payment_terms !== undefined || data.paymentTerms !== undefined) {
      updateData.payment_terms = data.payment_terms || data.paymentTerms;
    }
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.notes !== undefined) updateData.notes = data.notes;

    // Check phone conflict if updating phone
    if (updateData.phone) {
      const { data: existing } = await supabaseAdmin
        .from('vendors')
        .select('id')
        .eq('phone', updateData.phone)
        .neq('id', id)
        .single();

      if (existing) {
        throw new ConflictError('Phone number already in use');
      }
    }

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Vendor');
      }
      throw new DatabaseError('Failed to update vendor', error);
    }

    logger.info('Vendor updated', { vendorId: id });
    return vendor;
  }

  /**
   * List vendors with filtering
   * @param {Object} options - Query options
   * @returns {Object} Paginated vendors list
   */
  async listVendors(options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'name',
      sortOrder = 'asc',
      is_active,
      search,
      has_balance,
    } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('vendors')
      .select('*', { count: 'exact' });

    // Apply filters
    if (is_active !== undefined) query = query.eq('is_active', is_active);
    if (has_balance) query = query.neq('balance', 0);
    if (search) {
      const safeQuery = buildSafeOrQuery(search, ['name', 'phone', 'company_name']);
      if (safeQuery) query = query.or(safeQuery);
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list vendors', error);
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasNext: page < Math.ceil(count / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Deactivate vendor
   * @param {string} id - Vendor UUID
   */
  async deactivateVendor(id) {
    await this.updateVendor(id, { is_active: false });
    logger.info('Vendor deactivated', { vendorId: id });
  }

  /**
   * Toggle vendor active status
   * @param {string} id - Vendor UUID
   * @returns {Object} Updated vendor
   */
  async toggleStatus(id) {
    // Get current status
    const vendor = await this.getVendorById(id);
    
    // Toggle
    const newStatus = !vendor.is_active;
    
    const { data: updatedVendor, error } = await supabaseAdmin
      .from('vendors')
      .update({ is_active: newStatus })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new DatabaseError('Failed to toggle vendor status', error);
    }

    logger.info('Vendor status toggled', { vendorId: id, isActive: newStatus });
    return updatedVendor;
  }

  /**
   * Get vendor stats (Uses optimized database function)
   * @param {string} id - Vendor UUID
   * @returns {Object} Vendor statistics
   */
  async getVendorStats(id) {
    // Try using the optimized database function first
    const { data: statsResult, error: rpcError } = await supabaseAdmin
      .rpc('get_vendor_stats', { p_vendor_id: id });

    if (!rpcError && statsResult) {
      return {
        total_supplies: statsResult.purchase_count || 0,
        total_purchase_value: parseFloat(statsResult.purchases) || 0,
        total_payments: parseFloat(statsResult.payments) || 0,
        total_returns: parseFloat(statsResult.returns) || 0,
        outstanding_balance: parseFloat(statsResult.balance) || 0,
        last_supply_date: statsResult.last_purchase_date,
        last_payment_date: statsResult.last_payment_date,
        last_activity_date: statsResult.last_activity_date,
      };
    }

    // Fallback: Manual aggregation from inventory_transactions
    logger.debug('Using fallback stats aggregation', { vendorId: id, rpcError });
    
    // Get purchase stats
    const { data: purchases } = await supabaseAdmin
      .from('inventory_transactions')
      .select('total_cost, transaction_date')
      .eq('vendor_id', id)
      .eq('transaction_type', 'purchase')
      .eq('status', 'approved');

    // Get return stats
    const { data: returns } = await supabaseAdmin
      .from('inventory_transactions')
      .select('total_cost')
      .eq('vendor_id', id)
      .eq('transaction_type', 'purchase_return')
      .eq('status', 'approved');

    // Get payment stats from vendor_ledger (not vendor_payments which doesn't exist)
    const { data: payments } = await supabaseAdmin
      .from('vendor_ledger')
      .select('credit, transaction_date')
      .eq('vendor_id', id)
      .eq('entry_type', 'payment');

    const totalPurchases = (purchases || []).reduce((sum, p) => sum + Math.abs(p.total_cost || 0), 0);
    const totalReturns = (returns || []).reduce((sum, r) => sum + Math.abs(r.total_cost || 0), 0);
    const totalPayments = (payments || []).reduce((sum, p) => sum + (p.credit || 0), 0);

    // Get latest dates
    const lastPurchase = purchases?.sort((a, b) => 
      new Date(b.transaction_date) - new Date(a.transaction_date))[0];
    const lastPayment = payments?.sort((a, b) => 
      new Date(b.transaction_date) - new Date(a.transaction_date))[0];

    return {
      total_supplies: purchases?.length || 0,
      total_purchase_value: totalPurchases,
      total_payments: totalPayments,
      total_returns: totalReturns,
      outstanding_balance: totalPurchases - totalReturns - totalPayments,
      last_supply_date: lastPurchase?.transaction_date || null,
      last_payment_date: lastPayment?.payment_date || null,
    };
  }

  // ===========================================================================
  // VENDOR SUPPLIES (Purchase Orders)
  // ===========================================================================

  /**
   * Create vendor supply order
   * @param {Object} data - Supply data
   * @param {string} userId - User creating the supply
   * @returns {Object} Created supply
   */
  async createSupply(data, userId = null) {
    const { vendor_id, items, invoice_number, invoice_date, notes } = data;

    // Verify vendor exists
    await this.getVendorById(vendor_id);

    // Generate supply number
    const { data: supplyNumberResult } = await supabaseAdmin
      .rpc('generate_supply_number');
    const supplyNumber = supplyNumberResult || `SUP-${Date.now()}`;

    // Calculate total
    const totalAmount = items.reduce((sum, item) => {
      return sum + (item.quantity_ordered * item.unit_cost);
    }, 0);

    // Create inventory transaction record (replaces vendor_supplies)
    const { data: transaction, error: txnError } = await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        invoice_no: supplyNumber,
        vendor_id,
        transaction_type: 'purchase',
        status: 'pending',
        total_cost: totalAmount,
        transaction_date: invoice_date || new Date().toISOString().split('T')[0],
        notes,
        performed_by: userId,
      })
      .select()
      .single();

    if (txnError) {
      throw new DatabaseError('Failed to create purchase transaction', txnError);
    }

    // Create transaction items (replaces vendor_supply_items)
    const txnItems = items.map(item => ({
      transaction_id: transaction.id,
      variant_id: item.variant_id,
      quantity: item.quantity_ordered,
      unit_cost: item.unit_cost,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('inventory_transaction_items')
      .insert(txnItems);

    if (itemsError) {
      // Rollback transaction
      await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);
      throw new DatabaseError('Failed to create transaction items', itemsError);
    }

    // Alias for backward compatibility
    const supply = transaction;

    // Update vendor balance (increase - we owe them more)
    await this.updateVendorBalance(vendor_id, totalAmount);

    logger.info('Vendor supply created', { 
      supplyId: supply.id, 
      vendorId: vendor_id,
      total: totalAmount 
    });

    return supply;
  }

  /**
   * Receive supply items (add to inventory)
   * @param {string} supplyId - Supply UUID
   * @param {Array} items - Items received { supply_item_id, quantity_received }
   * @param {string} userId - User receiving the supply
   * @returns {Object} Updated supply
   */
  async receiveSupply(supplyId, items, userId = null) {
    // Get transaction details (replaces vendor_supplies)
    const { data: transaction, error: txnError } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        *,
        items:inventory_transaction_items(*)
      `)
      .eq('id', supplyId)
      .single();

    if (txnError || !transaction) {
      throw new NotFoundError('Purchase transaction');
    }

    if (transaction.status === 'approved' || transaction.status === 'voided') {
      throw new ValidationError(`Cannot receive in '${transaction.status}' status`);
    }

    // For inventory transactions, approval triggers stock update via database trigger
    // Just update the status to approved
    const { data: updatedTxn, error: updateError } = await supabaseAdmin
      .from('inventory_transactions')
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', supplyId)
      .select()
      .single();

    if (updateError) {
      throw new DatabaseError('Failed to update transaction', updateError);
    }

    logger.info('Purchase transaction approved', { transactionId: supplyId, status: 'approved' });
    return updatedTxn;
  }

  /**
   * Get supply/purchase by ID with items
   * Uses inventory_transactions table (replaces vendor_supplies)
   * @param {string} id - Transaction UUID
   * @returns {Object} Transaction with items and vendor
   */
  async getSupplyById(id) {
    const { data: transaction, error } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        *,
        vendor:vendors(id, name, phone),
        items:inventory_transaction_items(
          *,
          variant:product_variants(id, sku, product:products(name))
        )
      `)
      .eq('id', id)
      .single();

    if (error || !transaction) {
      throw new NotFoundError('Purchase transaction');
    }

    // Map to backward-compatible format
    return {
      ...transaction,
      supply_number: transaction.invoice_no,
      total_amount: transaction.total_cost,
    };
  }

  /**
   * List supplies/purchases
   * Uses inventory_transactions table (replaces vendor_supplies)
   * @param {Object} options - Query options
   * @returns {Object} Paginated transactions
   */
  async listSupplies(options = {}) {
    const {
      page = 1,
      limit = 20,
      vendor_id,
      status,
      start_date,
      end_date,
    } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('inventory_transactions')
      .select(`
        *,
        vendor:vendors(id, name)
      `, { count: 'exact' })
      .eq('transaction_type', 'purchase'); // Only purchases

    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list purchase transactions', error);
    }

    // Map to backward-compatible format
    const mappedData = (data || []).map(txn => ({
      ...txn,
      supply_number: txn.invoice_no,
      total_amount: txn.total_cost,
    }));

    return {
      data: mappedData,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  // ===========================================================================
  // VENDOR PAYMENTS & LEDGER
  // ===========================================================================

  /**
   * Record vendor payment (Uses atomic database function)
   * @param {Object} data - Payment data
   * @param {string} userId - User making the payment
   * @returns {Object} Payment record with ledger entry
   */
  async recordPayment(data, userId = null) {
    const { 
      vendor_id, 
      amount, 
      payment_method, 
      payment_mode,  // Alias for payment_method
      reference_number, 
      notes 
    } = data;

    const paymentMethod = payment_method || payment_mode || 'cash';

    // Verify vendor exists
    const vendor = await this.getVendorById(vendor_id);

    // Use atomic database function for payment + ledger + balance update
    const { data: result, error } = await supabaseAdmin.rpc('record_vendor_payment', {
      p_vendor_id: vendor_id,
      p_amount: parseFloat(amount),
      p_payment_method: paymentMethod,
      p_reference_number: reference_number || null,
      p_notes: notes || null,
      p_performed_by: userId,
    });

    if (error) {
      logger.error('RPC payment failed, using fallback', { error });
      // Fallback: Manual payment creation
      return this._recordPaymentManual(data, userId, vendor);
    }

    if (!result.success) {
      throw new ValidationError(result.error || 'Failed to record payment');
    }

    logger.info('Vendor payment recorded (atomic)', { 
      paymentId: result.payment_id,
      paymentNo: result.payment_no,
      vendorId: vendor_id,
      amount,
      balanceBefore: result.balance_before,
      balanceAfter: result.balance_after,
    });

    // Return payment record from vendor_ledger (not vendor_payments which doesn't exist)
    const { data: ledgerEntry } = await supabaseAdmin
      .from('vendor_ledger')
      .select('id, vendor_id, entry_type, reference_no, credit, running_balance, description, transaction_date, created_at')
      .eq('id', result.payment_id)
      .single();

    return {
      id: ledgerEntry?.id || result.payment_id,
      payment_no: result.payment_no,
      amount: parseFloat(amount),
      vendor_id: vendor_id,
      vendor_name: vendor.name,
      balance_before: result.balance_before,
      balance_after: result.balance_after,
      created_at: ledgerEntry?.created_at || new Date().toISOString(),
    };
  }

  /**
   * Fallback manual payment recording
   * Records payment directly to vendor_ledger (vendor_payments table doesn't exist)
   * 
   * SECURITY: Uses atomic RPC with row-level locking to prevent race conditions.
   * @private
   */
  async _recordPaymentManual(data, userId, vendor) {
    const { vendor_id, amount, payment_method, payment_mode, reference_number, notes } = data;
    const paymentMethod = payment_method || payment_mode || 'cash';

    // Generate payment number
    const paymentNo = `PAY-${Date.now()}`;
    const balanceBefore = parseFloat(vendor.balance) || 0;

    // ATOMIC: Update vendor balance using RPC with row-level locking
    // This prevents race conditions where concurrent payments corrupt the balance
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('update_vendor_balance_atomic', {
      p_vendor_id: vendor_id,
      p_amount: parseFloat(amount),
      p_type: 'PAYMENT',
    });

    if (rpcError) {
      throw new DatabaseError('Failed to update vendor balance for payment (RPC error)', rpcError);
    }

    if (rpcResult && !rpcResult.success) {
      throw new DatabaseError(`Vendor balance update failed: ${rpcResult.error}`);
    }

    const balanceAfter = rpcResult?.new_balance || (balanceBefore - parseFloat(amount));

    // Create ledger entry with the accurate balance from atomic RPC
    const { data: ledgerEntry, error } = await supabaseAdmin
      .from('vendor_ledger')
      .insert({
        vendor_id,
        entry_type: 'payment',
        reference_no: paymentNo,
        debit: 0,
        credit: parseFloat(amount),
        running_balance: balanceAfter,
        description: notes || `Payment via ${paymentMethod}${reference_number ? ` - Ref: ${reference_number}` : ''}`,
        performed_by: userId,
        transaction_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) {
      // P0 FIX: Ledger entry is CRITICAL for financial audit trail
      // Balance was updated but ledger entry failed - this is a data consistency issue
      // Throw error to alert the user and allow manual reconciliation
      logger.error('Failed to create payment ledger entry after balance update', { 
        vendor_id, 
        error,
        amount: parseFloat(amount),
        balanceAfter,
        paymentNo,
      });
      throw new DatabaseError(
        `Payment recorded but ledger entry failed. Balance updated to ${balanceAfter}. Please contact support for manual reconciliation. Error: ${error.message}`,
        error
      );
    }

    logger.info('Vendor payment recorded atomically', { 
      ledgerId: ledgerEntry.id, 
      previousBalance: rpcResult?.previous_balance,
      newBalance: balanceAfter,
    });

    // Return in payment-like format for compatibility
    return {
      id: ledgerEntry.id,
      payment_no: paymentNo,
      vendor_id: vendor_id,
      amount: parseFloat(amount),
      payment_method: paymentMethod,
      reference_number: reference_number,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      notes: notes,
      created_at: ledgerEntry.created_at,
    };
  }

  /**
   * Update vendor balance using atomic RPC
   * 
   * SECURITY: Uses database-level row locking (FOR UPDATE) to prevent race conditions.
   * This guarantees 100% accurate financial records even under high concurrency.
   * 
   * @param {string} vendorId - Vendor UUID
   * @param {number} amount - Amount to add (always positive for purchases)
   */
  async updateVendorBalance(vendorId, amount) {
    // For purchases, amount is positive (we owe vendor more)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('update_vendor_balance_atomic', {
      p_vendor_id: vendorId,
      p_amount: Math.abs(amount),
      p_type: 'PURCHASE',
    });

    if (rpcError) {
      throw new DatabaseError('Failed to update vendor balance (RPC error)', rpcError);
    }

    if (rpcResult && !rpcResult.success) {
      throw new DatabaseError(`Vendor balance update failed: ${rpcResult.error}`);
    }

    logger.debug('Vendor balance updated atomically', { 
      vendorId, 
      change: amount, 
      previousBalance: rpcResult?.previous_balance,
      newBalance: rpcResult?.new_balance,
    });

    return rpcResult?.new_balance;
  }

  /**
   * Get vendor ledger (hisab-kitab) from vendor_ledger table
   * @param {string} vendorId - Vendor UUID
   * @param {Object} options - Query options
   * @returns {Object} Ledger with transactions
   */
  async getVendorLedger(vendorId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      start_date,
      end_date,
      type = 'all',
    } = options;

    // Build query on vendor_ledger table
    let query = supabaseAdmin
      .from('vendor_ledger')
      .select('*', { count: 'exact' })
      .eq('vendor_id', vendorId)
      .order('transaction_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    // Filter by type if specified
    if (type !== 'all') {
      query = query.eq('entry_type', type);
    }

    // Date filters
    if (start_date) {
      query = query.gte('transaction_date', start_date);
    }
    if (end_date) {
      query = query.lte('transaction_date', end_date);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: ledgerEntries, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch vendor ledger: ${error.message}`);
    }

    return {
      data: (ledgerEntries || []).map(entry => ({
        id: entry.id,
        entry_type: entry.entry_type,
        reference_no: entry.reference_no,
        description: entry.description,
        debit: parseFloat(entry.debit) || 0,
        credit: parseFloat(entry.credit) || 0,
        running_balance: parseFloat(entry.running_balance) || 0,
        transaction_date: entry.transaction_date,
        created_at: entry.created_at,
      })),
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (count || 0),
      },
    };
  }

  /**
   * Get a single ledger entry by ID
   * Used for transaction detail panel
   * @param {string} entryId - Ledger entry ID
   * @returns {Object} Ledger entry
   */
  async getLedgerEntryById(entryId) {
    // First get the ledger entry
    const { data: ledgerData, error: ledgerError } = await supabaseAdmin
      .from('vendor_ledger')
      .select(`
        id,
        vendor_id,
        entry_type,
        reference_id,
        reference_no,
        debit,
        credit,
        running_balance,
        description,
        transaction_date,
        performed_by,
        notes,
        created_at,
        vendor:vendors(id, name, company_name)
      `)
      .eq('id', entryId)
      .single();

    if (ledgerError) {
      if (ledgerError.code === 'PGRST116') {
        throw new NotFoundError('Ledger entry not found');
      }
      throw new DatabaseError(`Failed to fetch ledger entry: ${ledgerError.message}`);
    }

    // Extract payment details from description or notes
    // (vendor_payments table doesn't exist - payment details stored in ledger entry)
    let paymentMethod = 'cash';
    let receiptUrl = null;
    let paymentNotes = ledgerData.notes || ledgerData.description;

    // Try to extract payment method from description
    if (ledgerData.description) {
      const methodMatch = ledgerData.description.match(/Payment via (\w+)/i);
      if (methodMatch) {
        paymentMethod = methodMatch[1].toLowerCase();
      }
    }

    return {
      id: ledgerData.id,
      vendor_id: ledgerData.vendor_id,
      entry_type: ledgerData.entry_type,
      reference_id: ledgerData.reference_id,
      reference_no: ledgerData.reference_no,
      debit: parseFloat(ledgerData.debit) || 0,
      credit: parseFloat(ledgerData.credit) || 0,
      running_balance: parseFloat(ledgerData.running_balance) || 0,
      description: ledgerData.description,
      transaction_date: ledgerData.transaction_date,
      performed_by: ledgerData.performed_by,
      payment_method: paymentMethod,
      receipt_url: receiptUrl,
      notes: paymentNotes,
      created_at: ledgerData.created_at,
      vendor: ledgerData.vendor,
    };
  }
}

export const vendorService = new VendorService();
export default vendorService;
