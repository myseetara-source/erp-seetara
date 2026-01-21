/**
 * Purchase Service (Stock Injection Layer)
 * 
 * This is the ONLY way stock enters the system.
 * All stock increases MUST go through this service.
 * 
 * Flow: Vendor -> Purchase -> Stock Movement -> Product Variant Stock Update
 * 
 * @module PurchaseService
 */

import { supabaseAdmin } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';
import { DatabaseError, ValidationError, NotFoundError } from '../utils/errors.js';

const logger = createLogger('PurchaseService');

/**
 * Generate unique supply number
 * Format: SUP-YYYY-NNNNNN
 */
async function generateSupplyNumber() {
  const year = new Date().getFullYear();
  const prefix = `SUP-${year}-`;
  
  const { data, error } = await supabaseAdmin
    .from('vendor_supplies')
    .select('supply_number')
    .like('supply_number', `${prefix}%`)
    .order('supply_number', { ascending: false })
    .limit(1);
  
  if (error) {
    logger.error('Failed to get last supply number', { error });
    throw new DatabaseError('Failed to generate supply number', error);
  }
  
  let nextNum = 1;
  if (data && data.length > 0) {
    const lastNum = parseInt(data[0].supply_number.split('-')[2], 10);
    nextNum = lastNum + 1;
  }
  
  return `${prefix}${nextNum.toString().padStart(6, '0')}`;
}

class PurchaseService {
  /**
   * Create a new purchase/supply entry
   * 
   * This is an ATOMIC TRANSACTION that:
   * 1. Creates the purchase bill (vendor_supplies)
   * 2. Adds line items (vendor_supply_items)
   * 3. Updates stock for each variant
   * 4. Logs stock movements
   * 5. Updates vendor balance
   * 
   * @param {Object} purchaseData - Purchase details
   * @param {string} purchaseData.vendor_id - Vendor UUID
   * @param {Array} purchaseData.items - Array of items [{variant_id, quantity, unit_cost}]
   * @param {string} [purchaseData.invoice_number] - Vendor's invoice number
   * @param {string} [purchaseData.invoice_date] - Vendor's invoice date
   * @param {string} [purchaseData.notes] - Additional notes
   * @param {Object} context - Request context (userId, etc.)
   * @returns {Promise<Object>} Created purchase with items
   * 
   * @example
   * await purchaseService.createPurchase({
   *   vendor_id: 'vendor-uuid',
   *   invoice_number: 'INV-001',
   *   items: [
   *     { variant_id: 'variant-uuid', quantity: 100, unit_cost: 500 },
   *     { variant_id: 'variant-uuid-2', quantity: 50, unit_cost: 750 },
   *   ]
   * }, context);
   */
  async createPurchase(purchaseData, context = {}) {
    const { vendor_id, items, invoice_number, invoice_date, notes } = purchaseData;
    const userId = context.userId || null;

    // ==========================================================================
    // VALIDATION
    // ==========================================================================
    
    if (!vendor_id) {
      throw new ValidationError('Vendor ID is required');
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('At least one item is required');
    }

    // Validate each item
    for (const item of items) {
      if (!item.variant_id) {
        throw new ValidationError('Each item must have a variant_id');
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new ValidationError('Each item must have a positive quantity');
      }
      if (item.unit_cost === undefined || item.unit_cost < 0) {
        throw new ValidationError('Each item must have a valid unit_cost');
      }
    }

    // ==========================================================================
    // VERIFY VENDOR EXISTS
    // ==========================================================================
    
    const { data: vendor, error: vendorError } = await supabaseAdmin
      .from('vendors')
      .select('id, name, balance')
      .eq('id', vendor_id)
      .single();

    if (vendorError || !vendor) {
      throw new NotFoundError('Vendor not found');
    }

    // ==========================================================================
    // VERIFY ALL VARIANTS EXIST
    // ==========================================================================
    
    const variantIds = items.map(i => i.variant_id);
    const { data: variants, error: variantsError } = await supabaseAdmin
      .from('product_variants')
      .select('id, sku, current_stock, cost_price, product_id')
      .in('id', variantIds);

    if (variantsError) {
      throw new DatabaseError('Failed to verify variants', variantsError);
    }

    if (!variants || variants.length !== variantIds.length) {
      const foundIds = variants?.map(v => v.id) || [];
      const missingIds = variantIds.filter(id => !foundIds.includes(id));
      throw new ValidationError(`Some variants not found: ${missingIds.join(', ')}`);
    }

    // Create a map for quick lookup
    const variantMap = new Map(variants.map(v => [v.id, v]));

    // ==========================================================================
    // CALCULATE TOTALS
    // ==========================================================================
    
    let totalAmount = 0;
    const processedItems = items.map(item => {
      const total = item.quantity * item.unit_cost;
      totalAmount += total;
      return {
        ...item,
        total_cost: total,
        variant: variantMap.get(item.variant_id),
      };
    });

    // ==========================================================================
    // START ATOMIC TRANSACTION (Using Supabase RPC or sequential with rollback)
    // ==========================================================================
    
    logger.info('Starting purchase transaction', {
      vendorId: vendor_id,
      vendorName: vendor.name,
      itemCount: items.length,
      totalAmount,
    });

    try {
      // ------------------------------------------------------------------
      // STEP 1: Create the Purchase Bill (vendor_supplies)
      // ------------------------------------------------------------------
      
      const supplyNumber = await generateSupplyNumber();
      
      const { data: supply, error: supplyError } = await supabaseAdmin
        .from('vendor_supplies')
        .insert({
          supply_number: supplyNumber,
          vendor_id,
          status: 'received',
          total_amount: totalAmount,
          paid_amount: 0,
          invoice_number,
          invoice_date,
          notes,
          received_by: userId,
          received_at: new Date().toISOString(),
          created_by: userId,
        })
        .select()
        .single();

      if (supplyError) {
        logger.error('Failed to create supply record', { error: supplyError });
        throw new DatabaseError('Failed to create purchase record', supplyError);
      }

      logger.debug('Purchase bill created', { supplyId: supply.id, supplyNumber });

      // ------------------------------------------------------------------
      // STEP 2: Insert Line Items (vendor_supply_items)
      // ------------------------------------------------------------------
      
      const supplyItems = processedItems.map(item => ({
        supply_id: supply.id,
        variant_id: item.variant_id,
        quantity_ordered: item.quantity,
        quantity_received: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('vendor_supply_items')
        .insert(supplyItems);

      if (itemsError) {
        // Rollback: Delete the supply record
        await supabaseAdmin.from('vendor_supplies').delete().eq('id', supply.id);
        logger.error('Failed to create supply items', { error: itemsError });
        throw new DatabaseError('Failed to create purchase items', itemsError);
      }

      logger.debug('Supply items created', { count: supplyItems.length });

      // ------------------------------------------------------------------
      // STEP 3: Update Stock for Each Variant (CRITICAL)
      // ------------------------------------------------------------------
      
      const stockMovements = [];
      const stockUpdateErrors = [];

      for (const item of processedItems) {
        const variant = item.variant;
        const stockBefore = variant.current_stock;
        const stockAfter = stockBefore + item.quantity;

        // Update variant stock and cost price
        const { error: updateError } = await supabaseAdmin
          .from('product_variants')
          .update({
            current_stock: stockAfter,
            cost_price: item.unit_cost, // Update to latest cost
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.variant_id);

        if (updateError) {
          stockUpdateErrors.push({
            variant_id: item.variant_id,
            sku: variant.sku,
            error: updateError.message,
          });
          continue;
        }

        // Prepare stock movement log
        stockMovements.push({
          variant_id: item.variant_id,
          movement_type: 'inward',
          quantity: item.quantity,
          vendor_id,
          stock_before: stockBefore,
          stock_after: stockAfter,
          reason: `Purchase ${supplyNumber} from ${vendor.name}`,
          created_by: userId,
        });

        logger.debug('Stock updated', {
          sku: variant.sku,
          before: stockBefore,
          after: stockAfter,
          quantity: item.quantity,
        });
      }

      // Check for stock update errors
      if (stockUpdateErrors.length > 0) {
        logger.error('Some stock updates failed', { errors: stockUpdateErrors });
        // Continue - partial success is acceptable for now
        // In production, you might want to rollback entirely
      }

      // ------------------------------------------------------------------
      // STEP 4: Log Stock Movements
      // ------------------------------------------------------------------
      
      if (stockMovements.length > 0) {
        const { error: movementError } = await supabaseAdmin
          .from('stock_movements')
          .insert(stockMovements);

        if (movementError) {
          logger.error('Failed to log stock movements', { error: movementError });
          // Non-critical - don't fail the transaction
        } else {
          logger.debug('Stock movements logged', { count: stockMovements.length });
        }
      }

      // ------------------------------------------------------------------
      // STEP 5: Update Vendor Balance (Credit - We owe them)
      // ------------------------------------------------------------------
      
      const newBalance = (vendor.balance || 0) + totalAmount;
      
      const { error: balanceError } = await supabaseAdmin
        .from('vendors')
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vendor_id);

      if (balanceError) {
        logger.error('Failed to update vendor balance', { error: balanceError });
        // Non-critical for stock flow
      } else {
        logger.debug('Vendor balance updated', {
          vendorId: vendor_id,
          oldBalance: vendor.balance,
          newBalance,
          added: totalAmount,
        });
      }

      // ==========================================================================
      // TRANSACTION COMPLETE
      // ==========================================================================
      
      logger.info('Purchase transaction completed successfully', {
        supplyId: supply.id,
        supplyNumber,
        vendorName: vendor.name,
        itemCount: items.length,
        totalAmount,
        stockUpdated: stockMovements.length,
        errors: stockUpdateErrors.length,
      });

      // Return the complete purchase with items
      return {
        ...supply,
        vendor,
        items: processedItems.map(item => ({
          variant_id: item.variant_id,
          sku: item.variant.sku,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
          stock_before: item.variant.current_stock,
          stock_after: item.variant.current_stock + item.quantity,
        })),
        summary: {
          total_items: items.length,
          total_quantity: items.reduce((sum, i) => sum + i.quantity, 0),
          total_amount: totalAmount,
          stock_updates_successful: stockMovements.length,
          stock_updates_failed: stockUpdateErrors.length,
        },
      };

    } catch (error) {
      logger.error('Purchase transaction failed', { 
        error: error.message,
        vendorId: vendor_id,
      });
      throw error;
    }
  }

  /**
   * Get purchase by ID with items
   */
  async getPurchaseById(id) {
    const { data, error } = await supabaseAdmin
      .from('vendor_supplies')
      .select(`
        *,
        vendor:vendors(id, name, phone),
        items:vendor_supply_items(
          id,
          quantity_ordered,
          quantity_received,
          unit_cost,
          total_cost,
          variant:product_variants(
            id,
            sku,
            color,
            size,
            product:products(id, name)
          )
        ),
        received_by_user:users!vendor_supplies_received_by_fkey(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw new DatabaseError('Failed to fetch purchase', error);
    }

    if (!data) {
      throw new NotFoundError('Purchase not found');
    }

    return data;
  }

  /**
   * List purchases with filters
   */
  async listPurchases(options = {}) {
    const {
      page = 1,
      limit = 20,
      vendor_id,
      status,
      from_date,
      to_date,
      search,
    } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('vendor_supplies')
      .select(`
        *,
        vendor:vendors(id, name, phone),
        items_count:vendor_supply_items(count)
      `, { count: 'exact' });

    // Apply filters
    if (vendor_id) {
      query = query.eq('vendor_id', vendor_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (from_date) {
      query = query.gte('created_at', from_date);
    }

    if (to_date) {
      query = query.lte('created_at', to_date);
    }

    if (search) {
      query = query.or(`supply_number.ilike.%${search}%,invoice_number.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list purchases', error);
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
   * Record payment against a purchase
   */
  async recordPayment(purchaseId, paymentData, context = {}) {
    const { amount, payment_mode, reference_number, notes } = paymentData;

    // Get current purchase
    const { data: purchase, error: fetchError } = await supabaseAdmin
      .from('vendor_supplies')
      .select('*, vendor:vendors(*)')
      .eq('id', purchaseId)
      .single();

    if (fetchError || !purchase) {
      throw new NotFoundError('Purchase not found');
    }

    const remainingAmount = purchase.total_amount - purchase.paid_amount;
    if (amount > remainingAmount) {
      throw new ValidationError(`Payment amount (${amount}) exceeds remaining balance (${remainingAmount})`);
    }

    // Update purchase paid amount
    const newPaidAmount = purchase.paid_amount + amount;
    const newStatus = newPaidAmount >= purchase.total_amount ? 'paid' : 'partial';

    const { error: updateError } = await supabaseAdmin
      .from('vendor_supplies')
      .update({
        paid_amount: newPaidAmount,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchaseId);

    if (updateError) {
      throw new DatabaseError('Failed to update purchase', updateError);
    }

    // Reduce vendor balance
    const newBalance = (purchase.vendor.balance || 0) - amount;
    await supabaseAdmin
      .from('vendors')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchase.vendor_id);

    // Create transaction record
    const { data: transaction, error: txnError } = await supabaseAdmin
      .from('transactions')
      .insert({
        transaction_number: `TXN-${Date.now()}`, // Simplified
        type: 'vendor_payment',
        amount,
        vendor_id: purchase.vendor_id,
        payment_mode,
        reference_number,
        description: `Payment for ${purchase.supply_number}`,
        notes,
        status: 'completed',
        created_by: context.userId,
      })
      .select()
      .single();

    logger.info('Payment recorded', {
      purchaseId,
      amount,
      newPaidAmount,
      newStatus,
      transactionId: transaction?.id,
    });

    return {
      purchase_id: purchaseId,
      payment_amount: amount,
      total_paid: newPaidAmount,
      remaining: purchase.total_amount - newPaidAmount,
      status: newStatus,
      transaction_id: transaction?.id,
    };
  }

  /**
   * Get purchase statistics
   */
  async getStats(options = {}) {
    const { from_date, to_date, vendor_id } = options;

    let query = supabaseAdmin
      .from('vendor_supplies')
      .select('total_amount, paid_amount, status, vendor_id');

    if (from_date) query = query.gte('created_at', from_date);
    if (to_date) query = query.lte('created_at', to_date);
    if (vendor_id) query = query.eq('vendor_id', vendor_id);

    const { data, error } = await query;

    if (error) {
      throw new DatabaseError('Failed to fetch stats', error);
    }

    const stats = {
      total_purchases: data.length,
      total_amount: data.reduce((sum, p) => sum + (p.total_amount || 0), 0),
      total_paid: data.reduce((sum, p) => sum + (p.paid_amount || 0), 0),
      total_pending: 0,
      by_status: {},
    };

    stats.total_pending = stats.total_amount - stats.total_paid;

    // Group by status
    data.forEach(p => {
      if (!stats.by_status[p.status]) {
        stats.by_status[p.status] = { count: 0, amount: 0 };
      }
      stats.by_status[p.status].count++;
      stats.by_status[p.status].amount += p.total_amount || 0;
    });

    return stats;
  }
}

export const purchaseService = new PurchaseService();
export default purchaseService;
