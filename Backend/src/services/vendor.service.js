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

const logger = createLogger('VendorService');

class VendorService {
  // ===========================================================================
  // VENDOR CRUD
  // ===========================================================================

  /**
   * Create a new vendor
   * @param {Object} data - Vendor data
   * @returns {Object} Created vendor
   */
  async createVendor(data) {
    // Check for duplicate phone
    const { data: existing } = await supabaseAdmin
      .from('vendors')
      .select('id')
      .eq('phone', data.phone)
      .single();

    if (existing) {
      throw new ConflictError('Vendor with this phone number already exists');
    }

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create vendor', { error });
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
      .select('*')
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
   * @param {Object} data - Update data
   * @returns {Object} Updated vendor
   */
  async updateVendor(id, data) {
    // Check phone conflict if updating
    if (data.phone) {
      const { data: existing } = await supabaseAdmin
        .from('vendors')
        .select('id')
        .eq('phone', data.phone)
        .neq('id', id)
        .single();

      if (existing) {
        throw new ConflictError('Phone number already in use');
      }
    }

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .update(data)
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
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%`);
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

    // Create supply record
    const { data: supply, error: supplyError } = await supabaseAdmin
      .from('vendor_supplies')
      .insert({
        supply_number: supplyNumber,
        vendor_id,
        total_amount: totalAmount,
        invoice_number,
        invoice_date,
        notes,
        created_by: userId,
      })
      .select()
      .single();

    if (supplyError) {
      throw new DatabaseError('Failed to create supply', supplyError);
    }

    // Create supply items
    const supplyItems = items.map(item => ({
      supply_id: supply.id,
      variant_id: item.variant_id,
      quantity_ordered: item.quantity_ordered,
      unit_cost: item.unit_cost,
      total_cost: item.quantity_ordered * item.unit_cost,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('vendor_supply_items')
      .insert(supplyItems);

    if (itemsError) {
      // Rollback supply
      await supabaseAdmin.from('vendor_supplies').delete().eq('id', supply.id);
      throw new DatabaseError('Failed to create supply items', itemsError);
    }

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
    // Get supply details
    const { data: supply, error: supplyError } = await supabaseAdmin
      .from('vendor_supplies')
      .select(`
        *,
        items:vendor_supply_items(*)
      `)
      .eq('id', supplyId)
      .single();

    if (supplyError || !supply) {
      throw new NotFoundError('Supply');
    }

    if (supply.status === 'received' || supply.status === 'cancelled') {
      throw new ValidationError(`Cannot receive supply in '${supply.status}' status`);
    }

    // Process each item
    for (const receivedItem of items) {
      const supplyItem = supply.items.find(i => i.id === receivedItem.supply_item_id);
      if (!supplyItem) continue;

      const newReceived = supplyItem.quantity_received + receivedItem.quantity_received;
      
      // Validate quantity
      if (newReceived > supplyItem.quantity_ordered) {
        throw new ValidationError(
          `Cannot receive more than ordered for item ${supplyItem.id}`
        );
      }

      // Update supply item
      await supabaseAdmin
        .from('vendor_supply_items')
        .update({ quantity_received: newReceived })
        .eq('id', supplyItem.id);

      // Add to inventory
      await productService.adjustStock({
        variant_id: supplyItem.variant_id,
        movement_type: 'inward',
        quantity: receivedItem.quantity_received,
        reason: `Vendor supply ${supply.supply_number}`,
        vendor_id: supply.vendor_id,
      }, userId);
    }

    // Determine new status
    const { data: updatedItems } = await supabaseAdmin
      .from('vendor_supply_items')
      .select('quantity_ordered, quantity_received')
      .eq('supply_id', supplyId);

    let newStatus = 'partial';
    const allReceived = updatedItems.every(i => i.quantity_received >= i.quantity_ordered);
    const anyReceived = updatedItems.some(i => i.quantity_received > 0);
    
    if (allReceived) {
      newStatus = 'received';
    } else if (!anyReceived) {
      newStatus = 'pending';
    }

    // Update supply
    const { data: updatedSupply, error: updateError } = await supabaseAdmin
      .from('vendor_supplies')
      .update({
        status: newStatus,
        received_by: userId,
        received_at: newStatus === 'received' ? new Date().toISOString() : null,
      })
      .eq('id', supplyId)
      .select()
      .single();

    if (updateError) {
      throw new DatabaseError('Failed to update supply', updateError);
    }

    logger.info('Supply received', { supplyId, status: newStatus });
    return updatedSupply;
  }

  /**
   * Get supply by ID with items
   * @param {string} id - Supply UUID
   * @returns {Object} Supply with items and vendor
   */
  async getSupplyById(id) {
    const { data: supply, error } = await supabaseAdmin
      .from('vendor_supplies')
      .select(`
        *,
        vendor:vendors(id, name, phone),
        items:vendor_supply_items(
          *,
          variant:product_variants(id, sku, product:products(name))
        )
      `)
      .eq('id', id)
      .single();

    if (error || !supply) {
      throw new NotFoundError('Supply');
    }

    return supply;
  }

  /**
   * List supplies
   * @param {Object} options - Query options
   * @returns {Object} Paginated supplies
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
      .from('vendor_supplies')
      .select(`
        *,
        vendor:vendors(id, name)
      `, { count: 'exact' });

    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list supplies', error);
    }

    return {
      data,
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
   * Record vendor payment
   * @param {Object} data - Payment data
   * @param {string} userId - User making the payment
   * @returns {Object} Transaction record
   */
  async recordPayment(data, userId = null) {
    const { vendor_id, amount, payment_mode, reference_number, description, notes } = data;

    // Verify vendor
    const vendor = await this.getVendorById(vendor_id);

    // Generate transaction number
    const { data: txnNumberResult } = await supabaseAdmin
      .rpc('generate_transaction_number');
    const transactionNumber = txnNumberResult || `TXN-${Date.now()}`;

    // Create transaction
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        transaction_number: transactionNumber,
        type: 'vendor_payment',
        amount,
        vendor_id,
        payment_mode,
        reference_number,
        description: description || `Payment to ${vendor.name}`,
        notes,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw new DatabaseError('Failed to create transaction', error);
    }

    // Update vendor balance (decrease - we paid them)
    await this.updateVendorBalance(vendor_id, -amount);

    logger.info('Vendor payment recorded', { 
      transactionId: transaction.id,
      vendorId: vendor_id,
      amount 
    });

    return transaction;
  }

  /**
   * Update vendor balance
   * @param {string} vendorId - Vendor UUID
   * @param {number} amount - Amount to add (positive) or subtract (negative)
   */
  async updateVendorBalance(vendorId, amount) {
    const { data: vendor, error: fetchError } = await supabaseAdmin
      .from('vendors')
      .select('balance')
      .eq('id', vendorId)
      .single();

    if (fetchError) {
      throw new DatabaseError('Failed to fetch vendor balance', fetchError);
    }

    const newBalance = (vendor.balance || 0) + amount;

    const { error: updateError } = await supabaseAdmin
      .from('vendors')
      .update({ balance: newBalance })
      .eq('id', vendorId);

    if (updateError) {
      throw new DatabaseError('Failed to update vendor balance', updateError);
    }

    logger.debug('Vendor balance updated', { vendorId, change: amount, newBalance });
  }

  /**
   * Get vendor ledger (hisab-kitab)
   * @param {string} vendorId - Vendor UUID
   * @param {Object} options - Query options
   * @returns {Object} Ledger with supplies and payments
   */
  async getVendorLedger(vendorId, options = {}) {
    const {
      page = 1,
      limit = 50,
      start_date,
      end_date,
      type = 'all',
    } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get vendor
    const vendor = await this.getVendorById(vendorId);

    // Build ledger entries from supplies and payments
    let entries = [];

    if (type === 'all' || type === 'supplies') {
      let supplyQuery = supabaseAdmin
        .from('vendor_supplies')
        .select('id, supply_number, total_amount, status, created_at')
        .eq('vendor_id', vendorId);

      if (start_date) supplyQuery = supplyQuery.gte('created_at', start_date);
      if (end_date) supplyQuery = supplyQuery.lte('created_at', end_date);

      const { data: supplies } = await supplyQuery;

      entries = entries.concat((supplies || []).map(s => ({
        id: s.id,
        type: 'supply',
        reference: s.supply_number,
        debit: s.total_amount,
        credit: 0,
        status: s.status,
        date: s.created_at,
      })));
    }

    if (type === 'all' || type === 'payments') {
      let paymentQuery = supabaseAdmin
        .from('transactions')
        .select('id, transaction_number, amount, payment_mode, reference_number, created_at')
        .eq('vendor_id', vendorId)
        .eq('type', 'vendor_payment');

      if (start_date) paymentQuery = paymentQuery.gte('created_at', start_date);
      if (end_date) paymentQuery = paymentQuery.lte('created_at', end_date);

      const { data: payments } = await paymentQuery;

      entries = entries.concat((payments || []).map(p => ({
        id: p.id,
        type: 'payment',
        reference: p.transaction_number,
        debit: 0,
        credit: p.amount,
        payment_mode: p.payment_mode,
        payment_reference: p.reference_number,
        date: p.created_at,
      })));
    }

    // Sort by date
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Paginate
    const total = entries.length;
    const paginatedEntries = entries.slice(from, to + 1);

    return {
      vendor: {
        id: vendor.id,
        name: vendor.name,
        phone: vendor.phone,
        balance: vendor.balance,
      },
      entries: paginatedEntries,
      summary: {
        total_supplies: entries.filter(e => e.type === 'supply').reduce((sum, e) => sum + e.debit, 0),
        total_payments: entries.filter(e => e.type === 'payment').reduce((sum, e) => sum + e.credit, 0),
        current_balance: vendor.balance,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const vendorService = new VendorService();
export default vendorService;
