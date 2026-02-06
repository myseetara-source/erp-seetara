/**
 * Purchase Service (Stock Injection Layer)
 * 
 * This is the ONLY way stock enters the system.
 * All stock increases MUST go through this service.
 * 
 * Flow: Vendor -> Purchase -> Stock Movement -> Product Variant Stock Update
 * 
 * PERFORMANCE OPTIMIZED (v2.0):
 * - Uses atomic RPC function for single-roundtrip purchases
 * - Expected: 2200ms -> <300ms (~7x faster)
 * 
 * @module PurchaseService
 */

import { supabaseAdmin } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';
import { DatabaseError, ValidationError, NotFoundError } from '../utils/errors.js';
import { buildSafeOrQuery } from '../utils/helpers.js';

const logger = createLogger('PurchaseService');

// Feature flag for using high-performance RPC (enable after migration 045)
const USE_RPC_OPTIMIZATION = true;

/**
 * Generate unique supply number via RPC (atomic, no race conditions)
 * Falls back to manual generation if RPC not available
 */
async function generateSupplyNumber() {
  // Try RPC first (faster and atomic)
  try {
    const { data, error } = await supabaseAdmin.rpc('generate_purchase_invoice_no');
    if (!error && data) {
      return data;
    }
  } catch (rpcError) {
    logger.debug('RPC generate_purchase_invoice_no not available, using fallback');
  }

  // Fallback: Manual generation
  const year = new Date().getFullYear();
  const prefix = `PUR-${year}-`;
  
  const { data, error } = await supabaseAdmin
    .from('inventory_transactions')
    .select('invoice_no')
    .eq('transaction_type', 'purchase')
    .like('invoice_no', `${prefix}%`)
    .order('invoice_no', { ascending: false })
    .limit(1);
  
  if (error) {
    logger.warn('Failed to get last supply number, using fallback', { error });
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}${timestamp}`;
  }
  
  let nextNum = 1;
  if (data && data.length > 0 && data[0].invoice_no) {
    const parts = data[0].invoice_no.split('-');
    if (parts.length >= 3) {
      const lastNum = parseInt(parts[2], 10);
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1;
      }
    }
  }
  
  return `${prefix}${nextNum.toString().padStart(6, '0')}`;
}

class PurchaseService {
  /**
   * Create a new purchase/supply entry
   * 
   * This is an ATOMIC TRANSACTION that:
   * 1. Creates the purchase transaction (inventory_transactions)
   * 2. Adds line items (inventory_transaction_items)
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
  /**
   * Create a new purchase using HIGH-PERFORMANCE RPC
   * 
   * This method uses an atomic PostgreSQL function that performs all operations
   * in a single database round-trip, reducing latency from ~2200ms to <300ms.
   * 
   * Falls back to sequential method if RPC is not available.
   */
  async createPurchase(purchaseData, context = {}) {
    const { vendor_id, items, invoice_number, invoice_date, notes } = purchaseData;
    const userId = context.userId || null;

    // ==========================================================================
    // VALIDATION (Fast, in-memory)
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
    // HIGH-PERFORMANCE PATH: Use RPC for atomic transaction
    // ==========================================================================
    
    if (USE_RPC_OPTIMIZATION) {
      try {
        const startTime = Date.now();
        
        // Generate invoice number first (or use provided one)
        const invoiceNo = invoice_number || await generateSupplyNumber();
        
        // Prepare RPC payload
        const rpcPayload = {
          vendor_id,
          invoice_no: invoiceNo,
          invoice_date: invoice_date || new Date().toISOString().split('T')[0],
          notes: notes || null,
          performed_by: userId,
          items: items.map(item => ({
            variant_id: item.variant_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
          })),
        };

        logger.info('Creating purchase via RPC', {
          vendorId: vendor_id,
          itemCount: items.length,
          invoiceNo,
        });

        // Single RPC call - replaces 4 sequential database operations
        const { data: rpcResult, error: rpcError } = await supabaseAdmin
          .rpc('process_purchase_transaction', { p_payload: rpcPayload });

        const duration = Date.now() - startTime;

        if (rpcError) {
          logger.error('RPC purchase failed', { error: rpcError, duration });
          throw new DatabaseError('Failed to process purchase', rpcError);
        }

        if (!rpcResult.success) {
          logger.error('RPC purchase returned error', { error: rpcResult.error, duration });
          throw new ValidationError(rpcResult.error || 'Purchase processing failed');
        }

        logger.info('Purchase completed via RPC', {
          transactionId: rpcResult.transaction_id,
          invoiceNo: rpcResult.invoice_no,
          totalCost: rpcResult.summary.total_cost,
          itemCount: rpcResult.summary.total_items,
          duration: `${duration}ms`,
        });

        // Return formatted response (backward compatible)
        return {
          id: rpcResult.transaction_id,
          invoice_no: rpcResult.invoice_no,
          transaction_type: 'purchase',
          status: 'approved',
          vendor: rpcResult.vendor,
          items: rpcResult.stock_updates,
          summary: rpcResult.summary,
          processed_at: rpcResult.processed_at,
        };

      } catch (rpcError) {
        // If RPC not found, fall back to sequential method
        if (rpcError.code === 'PGRST202' || rpcError.message?.includes('not find')) {
          logger.warn('RPC not available, falling back to sequential method');
        } else {
          throw rpcError;
        }
      }
    }

    // ==========================================================================
    // FALLBACK PATH: Sequential operations (slower, ~2200ms)
    // ==========================================================================

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
      // STEP 1: Create the Purchase Transaction (inventory_transactions)
      // ------------------------------------------------------------------
      
      const invoiceNo = await generateSupplyNumber();
      
      const { data: transaction, error: transactionError } = await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          invoice_no: invoiceNo,
          transaction_type: 'purchase',
          vendor_id,
          status: 'approved', // Auto-approve purchases
          total_cost: totalAmount,
          total_quantity: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
          transaction_date: invoice_date || new Date().toISOString().split('T')[0],
          notes: notes || `Purchase from vendor - Invoice: ${invoice_number || 'N/A'}`,
          performed_by: userId,
          approved_by: userId,
          approval_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (transactionError) {
        logger.error('Failed to create transaction record', { error: transactionError });
        throw new DatabaseError('Failed to create purchase record', transactionError);
      }

      // For backward compatibility, alias as 'supply'
      const supply = { id: transaction.id, ...transaction };
      const supplyNumber = invoiceNo;

      logger.debug('Purchase transaction created', { transactionId: transaction.id, invoiceNo });

      // ------------------------------------------------------------------
      // STEP 2: Insert Line Items (inventory_transaction_items)
      // ------------------------------------------------------------------
      
      const transactionItems = processedItems.map(item => ({
        transaction_id: transaction.id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        stock_before: item.variant.current_stock,
        stock_after: item.variant.current_stock + item.quantity,
        source_type: 'fresh',
        notes: `Purchase - ${invoice_number || invoiceNo}`,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('inventory_transaction_items')
        .insert(transactionItems);

      if (itemsError) {
        // Rollback: Delete the transaction record
        await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);
        logger.error('Failed to create transaction items', { error: itemsError });
        throw new DatabaseError('Failed to create purchase items', itemsError);
      }

      logger.debug('Transaction items created', { count: transactionItems.length });

      // ------------------------------------------------------------------
      // STEP 3: Update Cost Price for Each Variant
      // ------------------------------------------------------------------
      // P0 FIX: Stock update (current_stock) and stock_movements are handled
      // AUTOMATICALLY by the DB trigger `update_stock_on_transaction_item()`
      // which fires on the inventory_transaction_items INSERT above.
      // We MUST NOT update current_stock manually or it causes DOUBLE COUNTING.
      // We only update cost_price here (trigger does not handle this).
      
      for (const item of processedItems) {
        const { error: updateError } = await supabaseAdmin
          .from('product_variants')
          .update({
            cost_price: item.unit_cost,
          })
          .eq('id', item.variant_id);

        if (updateError) {
          logger.warn('Failed to update cost_price for variant', {
            variant_id: item.variant_id,
            error: updateError.message,
          });
        }
      }

      // ------------------------------------------------------------------
      // STEP 4: Update Vendor Balance (Credit - We owe them)
      // SECURITY: Uses atomic RPC with row-level locking to prevent race conditions
      // ------------------------------------------------------------------
      
      const { data: balanceResult, error: balanceError } = await supabaseAdmin.rpc('update_vendor_balance_atomic', {
        p_vendor_id: vendor_id,
        p_amount: totalAmount,
        p_type: 'PURCHASE',
      });

      // P0 FIX: Vendor balance updates are CRITICAL for financial integrity
      // THROW errors instead of swallowing them
      if (balanceError) {
        logger.error('Failed to update vendor balance (RPC error)', { error: balanceError.message });
        // Rollback: Delete transaction items (trigger will reverse stock) and transaction record
        await supabaseAdmin.from('inventory_transaction_items').delete().eq('transaction_id', transaction.id);
        await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);
        throw new DatabaseError(`Failed to update vendor balance: ${balanceError.message}`, balanceError);
      }
      
      if (balanceResult && !balanceResult.success) {
        logger.error('Vendor balance update failed', { error: balanceResult.error });
        // Rollback: Delete transaction items (trigger will reverse stock) and transaction record
        await supabaseAdmin.from('inventory_transaction_items').delete().eq('transaction_id', transaction.id);
        await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);
        throw new DatabaseError(`Vendor balance update failed: ${balanceResult.error}`);
      }
      
      logger.debug('Vendor balance updated atomically', {
        vendorId: vendor_id,
        previousBalance: balanceResult?.previous_balance,
        newBalance: balanceResult?.new_balance,
        added: totalAmount,
      });

      // ==========================================================================
      // TRANSACTION COMPLETE
      // ==========================================================================
      
      logger.info('Purchase transaction completed successfully', {
        supplyId: supply.id,
        supplyNumber,
        vendorName: vendor.name,
        itemCount: items.length,
        totalAmount,
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
   * Uses inventory_transactions table
   */
  async getPurchaseById(id) {
    const { data, error } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        *,
        vendor:vendors(id, name, phone),
        items:inventory_transaction_items(
          id,
          quantity,
          unit_cost,
          stock_before,
          stock_after,
          variant:product_variants(
            id,
            sku,
            color,
            size,
            product:products(id, name)
          )
        ),
        performed_by_user:users!performed_by(id, name)
      `)
      .eq('id', id)
      .eq('transaction_type', 'purchase')
      .single();

    if (error) {
      throw new DatabaseError('Failed to fetch purchase', error);
    }

    if (!data) {
      throw new NotFoundError('Purchase not found');
    }

    // Map to expected format for backward compatibility
    return {
      ...data,
      supply_number: data.invoice_no,
      total_amount: data.total_cost,
      received_by_user: data.performed_by_user,
    };
  }

  /**
   * List purchases with filters
   * Uses inventory_transactions table
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
      .from('inventory_transactions')
      .select(`
        *,
        vendor:vendors(id, name, phone),
        items_count:inventory_transaction_items(count)
      `, { count: 'exact' })
      .eq('transaction_type', 'purchase');

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
      const safeQuery = buildSafeOrQuery(search, ['invoice_no', 'notes']);
      if (safeQuery) query = query.or(safeQuery);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list purchases', error);
    }

    // Map to expected format for backward compatibility
    const mappedData = (data || []).map(item => ({
      ...item,
      supply_number: item.invoice_no,
      total_amount: item.total_cost,
    }));

    return {
      data: mappedData,
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
   * Note: This functionality is handled by vendor ledger system
   * Keeping for backward compatibility
   */
  async recordPayment(purchaseId, paymentData, context = {}) {
    const { amount, payment_mode, reference_number, notes } = paymentData;

    // Get current purchase from inventory_transactions
    const { data: purchase, error: fetchError } = await supabaseAdmin
      .from('inventory_transactions')
      .select('*, vendor:vendors(*)')
      .eq('id', purchaseId)
      .eq('transaction_type', 'purchase')
      .single();

    if (fetchError || !purchase) {
      throw new NotFoundError('Purchase not found');
    }

    const totalAmount = purchase.total_cost || 0;
    const paidAmount = 0; // inventory_transactions doesn't track payments

    // Note: Payment tracking is handled by vendor ledger entries
    // This is a simplified version for backward compatibility
    logger.info('Payment recorded via purchase service', {
      purchaseId,
      amount,
      vendorId: purchase.vendor_id,
    });

    // ATOMIC: Update vendor balance using RPC with row-level locking
    // This prevents race conditions where concurrent payments corrupt the balance
    const { data: balanceResult, error: balanceError } = await supabaseAdmin.rpc('update_vendor_balance_atomic', {
      p_vendor_id: purchase.vendor_id,
      p_amount: amount,
      p_type: 'PAYMENT',
    });

    if (balanceError) {
      logger.error('Failed to update vendor balance for payment (RPC error)', { error: balanceError.message });
      throw new DatabaseError('Failed to update vendor balance', balanceError);
    }

    if (balanceResult && !balanceResult.success) {
      logger.error('Vendor balance update failed', { error: balanceResult.error });
      throw new DatabaseError(`Vendor balance update failed: ${balanceResult.error}`);
    }

    logger.debug('Vendor balance updated atomically for payment', {
      vendorId: purchase.vendor_id,
      previousBalance: balanceResult?.previous_balance,
      newBalance: balanceResult?.new_balance,
    });

    return {
      purchase_id: purchaseId,
      payment_amount: amount,
      total_paid: amount,
      remaining: totalAmount - amount,
      status: amount >= totalAmount ? 'paid' : 'partial',
    };
  }

  /**
   * Get purchase statistics
   * Uses inventory_transactions table
   */
  async getStats(options = {}) {
    const { from_date, to_date, vendor_id } = options;

    let query = supabaseAdmin
      .from('inventory_transactions')
      .select('total_cost, status, vendor_id')
      .eq('transaction_type', 'purchase');

    if (from_date) query = query.gte('created_at', from_date);
    if (to_date) query = query.lte('created_at', to_date);
    if (vendor_id) query = query.eq('vendor_id', vendor_id);

    const { data, error } = await query;

    if (error) {
      throw new DatabaseError('Failed to fetch stats', error);
    }

    const stats = {
      total_purchases: data.length,
      total_amount: data.reduce((sum, p) => sum + (p.total_cost || 0), 0),
      total_paid: 0, // Payment tracking is in vendor ledger, not here
      total_pending: 0,
      by_status: {},
    };

    stats.total_pending = stats.total_amount;

    // Group by status
    data.forEach(p => {
      if (!stats.by_status[p.status]) {
        stats.by_status[p.status] = { count: 0, amount: 0 };
      }
      stats.by_status[p.status].count++;
      stats.by_status[p.status].amount += p.total_cost || 0;
    });

    return stats;
  }
}

export const purchaseService = new PurchaseService();
export default purchaseService;
