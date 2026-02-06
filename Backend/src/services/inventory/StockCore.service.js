/**
 * Stock Core Service
 * 
 * Handles stock-related queries:
 * - Stock movements
 * - Inventory valuation
 * - Low stock alerts
 * - Invoice number generation
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { AppError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from './constants.js';
import { sanitizeSearchInput } from '../../utils/helpers.js';

const logger = createLogger('StockCore');

class StockCoreService {
  /**
   * Get variant stock movements
   */
  async getVariantStockMovements(variantId, limit = 50) {
    // FIXED: Use quantity (not quantity_fresh/damaged which don't exist in schema)
    const { data, error } = await supabaseAdmin
      .from('inventory_transaction_items')
      .select(`
        id, quantity, unit_cost, source_type, created_at,
        transaction:inventory_transactions(
          id, transaction_type, invoice_no, transaction_date, status,
          vendor:vendors(id, name)
        )
      `)
      .eq('variant_id', variantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Failed to get stock movements', { variantId, error });
      throw new AppError('Failed to get stock movements', 500);
    }

    return data || [];
  }

  /**
   * Get inventory valuation (total value of current stock)
   */
  async getInventoryValuation() {
    const { data, error } = await supabaseAdmin
      .from('product_variants')
      .select('id, sku, cost_price, current_stock, product:products(name)');

    if (error) {
      logger.error('Failed to get inventory valuation', { error });
      throw new AppError('Failed to calculate inventory valuation', 500);
    }

    let totalValue = 0;
    let totalUnits = 0;
    const items = [];

    for (const variant of data || []) {
      const value = (variant.cost_price || 0) * (variant.current_stock || 0);
      totalValue += value;
      totalUnits += variant.current_stock || 0;
      items.push({
        variant_id: variant.id,
        sku: variant.sku,
        product_name: variant.product?.name,
        quantity: variant.current_stock || 0,
        unit_cost: variant.cost_price || 0,
        total_value: value,
      });
    }

    return {
      total_value: totalValue,
      total_units: totalUnits,
      item_count: items.length,
      items: items.sort((a, b) => b.total_value - a.total_value).slice(0, 100),
    };
  }

  /**
   * Get low stock alerts
   */
  async getLowStockAlerts(threshold = 10) {
    const { data, error } = await supabaseAdmin
      .from('product_variants')
      .select('id, sku, current_stock, product:products(id, name, image_url)')
      .lt('current_stock', threshold)
      .eq('is_active', true)
      .order('current_stock', { ascending: true });

    if (error) {
      logger.error('Failed to get low stock alerts', { error });
      throw new AppError('Failed to get low stock alerts', 500);
    }

    return data || [];
  }

  /**
   * Get next invoice number for transaction type
   */
  async getNextInvoiceNumber(type) {
    const { data, error } = await supabaseAdmin
      .rpc('get_next_invoice_number', { p_type: type });

    if (error) {
      logger.error('Failed to get next invoice number', { type, error });
      throw new AppError('Failed to generate invoice number', 500);
    }

    return data;
  }

  /**
   * Search purchase invoices (for returns reference)
   */
  async searchPurchaseInvoices(filters) {
    const { vendor_id, search, limit = 20 } = filters;

    // FIXED: Use quantity (not quantity_fresh/damaged which don't exist in schema)
    let query = supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, invoice_no, transaction_date, total_cost, status, notes,
        vendor:vendors(id, name),
        items:inventory_transaction_items(
          id, variant_id, quantity, unit_cost, source_type,
          variant:product_variants(id, sku, product:products(id, name))
        )
      `)
      .eq('transaction_type', TRANSACTION_TYPES.PURCHASE)
      .eq('status', TRANSACTION_STATUSES.APPROVED)
      .order('transaction_date', { ascending: false })
      .limit(limit);

    if (vendor_id) {
      query = query.eq('vendor_id', vendor_id);
    }

    if (search) {
      // SECURITY: Sanitize search to prevent SQL injection
      const sanitizedSearch = sanitizeSearchInput(search);
      if (sanitizedSearch) {
        query = query.ilike('invoice_no', `%${sanitizedSearch}%`);
      }
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to search purchase invoices', { error });
      throw new AppError('Failed to search invoices', 500);
    }

    return await this._addRemainingQuantities(data || []);
  }

  /**
   * Add remaining returnable quantities to invoices
   * FIXED: Use quantity field (not quantity_fresh/damaged)
   */
  async _addRemainingQuantities(invoices) {
    const invoiceIds = invoices.map(inv => inv.id);
    if (invoiceIds.length === 0) return invoices;

    // Get all returns for these invoices - using quantity field
    const { data: returns } = await supabaseAdmin
      .from('inventory_transactions')
      .select('reference_transaction_id, items:inventory_transaction_items(variant_id, quantity)')
      .eq('transaction_type', TRANSACTION_TYPES.PURCHASE_RETURN)
      .in('reference_transaction_id', invoiceIds);

    // Calculate returned quantities per invoice per variant
    const returnedMap = new Map();
    if (returns) {
      for (const ret of returns) {
        for (const item of ret.items || []) {
          const key = `${ret.reference_transaction_id}-${item.variant_id}`;
          const current = returnedMap.get(key) || 0;
          // Returns have negative quantity, so use absolute value
          returnedMap.set(key, current + Math.abs(item.quantity || 0));
        }
      }
    }

    // Enrich invoices with remaining quantities
    return invoices.map(inv => ({
      ...inv,
      items: (inv.items || []).map(item => {
        const key = `${inv.id}-${item.variant_id}`;
        const returned = returnedMap.get(key) || 0;
        const originalQty = item.quantity || 0;
        return {
          ...item,
          // For backward compatibility, also provide these fields
          quantity_fresh: originalQty,
          quantity_damaged: 0,
          remaining_fresh: originalQty - returned,
          remaining_damaged: 0,
          remaining: originalQty - returned,
        };
      }),
    }));
  }
}

export const stockCoreService = new StockCoreService();
export default stockCoreService;
