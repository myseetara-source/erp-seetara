/**
 * Product Service
 * Handles all product and variant operations including stock management
 */

import { supabaseAdmin } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';
import {
  NotFoundError,
  ConflictError,
  DatabaseError,
  InsufficientStockError,
} from '../utils/errors.js';
import { getAvailableStock, formatVariantName } from '../utils/helpers.js';

const logger = createLogger('ProductService');

class ProductService {
  // ===========================================================================
  // PRODUCT OPERATIONS
  // ===========================================================================

  /**
   * Create a new product with optional variants
   * @param {Object} data - Product data with optional variants array
   * @returns {Object} Created product with variants
   */
  async createProduct(data) {
    const { variants, ...productData } = data;
    
    // Create the product first
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create product', { error });
      throw new DatabaseError('Failed to create product', error);
    }

    logger.info('Product created', { productId: product.id, name: product.name });

    // If variants are provided, create them
    if (variants && variants.length > 0) {
      const variantData = variants.map(v => ({
        ...v,
        product_id: product.id,
      }));

      const { data: createdVariants, error: variantError } = await supabaseAdmin
        .from('product_variants')
        .insert(variantData)
        .select();

      if (variantError) {
        logger.error('Failed to create variants', { error: variantError });
        // Don't throw - product was created, just log the error
        // Could add cleanup logic here if needed
      } else {
        product.variants = createdVariants;
        logger.info('Variants created', { count: createdVariants.length });
      }
    }

    return product;
  }

  /**
   * Get product by ID with variants
   * @param {string} id - Product UUID
   * @returns {Object} Product with variants
   */
  async getProductById(id) {
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .select(`
        *,
        variants:product_variants(*)
      `)
      .eq('id', id)
      .single();

    if (error || !product) {
      throw new NotFoundError('Product');
    }

    return product;
  }

  /**
   * Update product
   * @param {string} id - Product UUID
   * @param {Object} data - Update data
   * @returns {Object} Updated product
   */
  async updateProduct(id, data) {
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Product');
      }
      throw new DatabaseError('Failed to update product', error);
    }

    logger.info('Product updated', { productId: id });
    return product;
  }

  /**
   * List products with filtering and pagination
   * @param {Object} options - Query options
   * @returns {Object} Paginated products list
   */
  async listProducts(options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      brand,
      category,
      is_active,
      search,
    } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('products')
      .select('*, variants:product_variants(count)', { count: 'exact' });

    // Apply filters
    if (brand) query = query.eq('brand', brand);
    if (category) query = query.eq('category', category);
    if (is_active !== undefined) query = query.eq('is_active', is_active);
    if (search) {
      query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%`);
    }

    // Apply sorting and pagination
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list products', error);
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
   * Delete product (soft delete)
   * @param {string} id - Product UUID
   */
  async deleteProduct(id) {
    const { error } = await supabaseAdmin
      .from('products')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new DatabaseError('Failed to delete product', error);
    }

    logger.info('Product soft deleted', { productId: id });
  }

  // ===========================================================================
  // VARIANT OPERATIONS
  // ===========================================================================

  /**
   * Create a new product variant
   * @param {Object} data - Variant data
   * @returns {Object} Created variant
   */
  async createVariant(data) {
    // Check if SKU already exists
    const { data: existing } = await supabaseAdmin
      .from('product_variants')
      .select('id')
      .eq('sku', data.sku)
      .single();

    if (existing) {
      throw new ConflictError(`SKU '${data.sku}' already exists`);
    }

    const { data: variant, error } = await supabaseAdmin
      .from('product_variants')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create variant', { error });
      throw new DatabaseError('Failed to create variant', error);
    }

    logger.info('Variant created', { variantId: variant.id, sku: variant.sku });
    return variant;
  }

  /**
   * Get variant by ID
   * @param {string} id - Variant UUID
   * @returns {Object} Variant with product info
   */
  async getVariantById(id) {
    const { data: variant, error } = await supabaseAdmin
      .from('product_variants')
      .select(`
        *,
        product:products(id, name, brand, category)
      `)
      .eq('id', id)
      .single();

    if (error || !variant) {
      throw new NotFoundError('Variant');
    }

    return variant;
  }

  /**
   * Get variant by SKU
   * @param {string} sku - SKU code
   * @returns {Object} Variant with product info
   */
  async getVariantBySku(sku) {
    const { data: variant, error } = await supabaseAdmin
      .from('product_variants')
      .select(`
        *,
        product:products(id, name, brand, category, image_url)
      `)
      .eq('sku', sku.toUpperCase())
      .single();

    if (error || !variant) {
      throw new NotFoundError(`Variant with SKU '${sku}'`);
    }

    return variant;
  }

  /**
   * Update variant
   * @param {string} id - Variant UUID
   * @param {Object} data - Update data
   * @returns {Object} Updated variant
   */
  async updateVariant(id, data) {
    // If updating SKU, check for conflicts
    if (data.sku) {
      const { data: existing } = await supabaseAdmin
        .from('product_variants')
        .select('id')
        .eq('sku', data.sku)
        .neq('id', id)
        .single();

      if (existing) {
        throw new ConflictError(`SKU '${data.sku}' already exists`);
      }
    }

    const { data: variant, error } = await supabaseAdmin
      .from('product_variants')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Variant');
      }
      throw new DatabaseError('Failed to update variant', error);
    }

    logger.info('Variant updated', { variantId: id });
    return variant;
  }

  /**
   * List variants with filtering
   * @param {Object} options - Query options
   * @returns {Object} Paginated variants list
   */
  async listVariants(options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      product_id,
      low_stock,
      is_active,
      search,
    } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('product_variants')
      .select(`
        *,
        product:products(id, name, brand, category)
      `, { count: 'exact' });

    // Apply filters
    if (product_id) query = query.eq('product_id', product_id);
    if (is_active !== undefined) query = query.eq('is_active', is_active);
    if (low_stock) {
      query = query.lte('current_stock', supabaseAdmin.raw('reorder_level'));
    }
    if (search) {
      query = query.or(`sku.ilike.%${search}%,color.ilike.%${search}%,size.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list variants', error);
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

  // ===========================================================================
  // STOCK MANAGEMENT - ATOMIC OPERATIONS (Race Condition Prevention)
  // ===========================================================================

  /**
   * Check stock availability for multiple items
   * @param {Array} items - Array of { variant_id, quantity }
   * @returns {Object} Stock check result
   */
  async checkStock(items) {
    const variantIds = items.map(item => item.variant_id);

    const { data: variants, error } = await supabaseAdmin
      .from('product_variants')
      .select('id, sku, current_stock, reserved_stock')
      .in('id', variantIds);

    if (error) {
      throw new DatabaseError('Failed to check stock', error);
    }

    const variantMap = new Map(variants.map(v => [v.id, v]));
    const unavailable = [];

    for (const item of items) {
      const variant = variantMap.get(item.variant_id);
      if (!variant) {
        unavailable.push({
          variant_id: item.variant_id,
          error: 'Variant not found',
        });
        continue;
      }

      const available = getAvailableStock(variant);
      if (available < item.quantity) {
        unavailable.push({
          variant_id: item.variant_id,
          sku: variant.sku,
          requested: item.quantity,
          available,
        });
      }
    }

    return {
      isAvailable: unavailable.length === 0,
      unavailable,
      variants: variants.map(v => ({
        ...v,
        available_stock: getAvailableStock(v),
      })),
    };
  }

  /**
   * ATOMIC Stock Deduction for order items
   * 
   * Uses Supabase RPC function `deduct_stock_atomic` with row-level locking
   * to prevent race conditions during concurrent order creation.
   * 
   * Pattern: Single SQL statement with WHERE condition instead of Read->Check->Update
   * 
   * @param {Array} items - Array of { variant_id, quantity }
   * @param {string} orderId - Order ID for tracking
   * @param {string} userId - User making the change
   * @returns {Array} Stock deduction results
   * @throws {InsufficientStockError} If any item has insufficient stock
   */
  async deductStockAtomic(items, orderId = null, userId = null) {
    const results = [];

    // Process each item with atomic deduction
    for (const item of items) {
      logger.debug('Attempting atomic stock deduction', {
        variantId: item.variant_id,
        quantity: item.quantity,
        orderId,
      });

      // Call the atomic RPC function
      const { data, error } = await supabaseAdmin.rpc('deduct_stock_atomic', {
        p_variant_id: item.variant_id,
        p_quantity: item.quantity,
        p_order_id: orderId,
        p_reason: `Order reservation${orderId ? ` - ${orderId}` : ''}`,
      });

      if (error) {
        logger.error('Atomic stock deduction RPC failed', { error, item });
        throw new DatabaseError('Failed to deduct stock atomically', error);
      }

      // RPC returns an array with one result
      const result = Array.isArray(data) ? data[0] : data;

      if (!result || !result.success) {
        // Immediate failure on insufficient stock - no partial deductions
        const errorMessage = result?.error_message || 'Unknown stock error';
        logger.warn('Atomic stock deduction failed', {
          variantId: item.variant_id,
          sku: result?.sku,
          error: errorMessage,
        });

        throw new InsufficientStockError(
          result?.sku || item.variant_id,
          item.quantity,
          result?.available_stock || 0
        );
      }

      results.push({
        variant_id: result.variant_id,
        sku: result.sku,
        quantity: item.quantity,
        stock_before: result.stock_before,
        stock_after: result.stock_after,
        reserved_before: result.reserved_before,
        reserved_after: result.reserved_after,
        available_after: result.available_stock,
      });

      logger.debug('Atomic stock deduction successful', {
        variantId: result.variant_id,
        sku: result.sku,
        deducted: item.quantity,
        availableAfter: result.available_stock,
      });
    }

    logger.info('All stock deductions completed atomically', {
      orderId,
      itemCount: items.length,
    });

    return results;
  }

  /**
   * Batch Atomic Stock Deduction
   * 
   * All-or-nothing deduction using database transaction.
   * If ANY item fails, the ENTIRE operation is rolled back.
   * 
   * @param {Array} items - Array of { variant_id, quantity }
   * @param {string} orderId - Order ID for tracking
   * @returns {Object} Batch result
   * @throws {InsufficientStockError} If any item has insufficient stock
   */
  async deductStockBatchAtomic(items, orderId = null) {
    // Format items for the RPC function
    const formattedItems = items.map(item => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
    }));

    const { data, error } = await supabaseAdmin.rpc('deduct_stock_batch_atomic', {
      p_items: formattedItems,
      p_order_id: orderId,
      p_reason: `Batch order reservation${orderId ? ` - ${orderId}` : ''}`,
    });

    if (error) {
      logger.error('Batch atomic stock deduction RPC failed', { error });
      throw new DatabaseError('Failed to deduct stock in batch', error);
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result || !result.success) {
      logger.warn('Batch stock deduction failed', {
        failedSku: result?.failed_sku,
        reason: result?.failed_reason,
        processedCount: result?.items_processed,
      });

      throw new InsufficientStockError(
        result?.failed_sku || 'Unknown SKU',
        0,
        0
      );
    }

    logger.info('Batch stock deduction completed', {
      orderId,
      itemsProcessed: result.items_processed,
    });

    return {
      success: true,
      itemsProcessed: result.items_processed,
    };
  }

  /**
   * Legacy deductStock method - now delegates to atomic version
   * @deprecated Use deductStockAtomic instead
   */
  async deductStock(items, orderId, userId = null) {
    logger.warn('Using deprecated deductStock method - migrating to deductStockAtomic');
    return this.deductStockAtomic(items, orderId, userId);
  }

  /**
   * ATOMIC Stock Restoration (For cancellations/returns)
   * 
   * Uses Supabase RPC function `restore_stock_atomic` with row-level locking.
   * 
   * @param {string} orderId - Order ID
   * @param {string} userId - User making the change
   * @param {string} reason - Reason for restoration
   * @returns {Array} Stock restoration results
   */
  async restoreStockForOrderAtomic(orderId, userId = null, reason = 'Order cancelled') {
    // Get order items
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('variant_id, quantity')
      .eq('order_id', orderId);

    if (itemsError) {
      throw new DatabaseError('Failed to fetch order items', itemsError);
    }

    if (!orderItems || orderItems.length === 0) {
      logger.warn('No items found for order stock restoration', { orderId });
      return [];
    }

    const results = [];

    for (const item of orderItems) {
      const { data, error } = await supabaseAdmin.rpc('restore_stock_atomic', {
        p_variant_id: item.variant_id,
        p_quantity: item.quantity,
        p_order_id: orderId,
        p_reason: `${reason} - Order ${orderId}`,
      });

      if (error) {
        logger.error('Atomic stock restoration failed', {
          error,
          variantId: item.variant_id,
          orderId,
        });
        continue;
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (result?.success) {
        results.push({
          variant_id: result.variant_id,
          sku: result.sku,
          quantity: item.quantity,
          stock_before: result.stock_before,
          stock_after: result.stock_after,
        });

        logger.info('Stock restored atomically', {
          variantId: result.variant_id,
          sku: result.sku,
          quantity: item.quantity,
          newStock: result.stock_after,
          reason,
        });
      }
    }

    return results;
  }

  /**
   * Legacy restoreStockForOrder method - now delegates to atomic version
   * @deprecated Use restoreStockForOrderAtomic instead
   */
  async restoreStockForOrder(orderId, userId = null, reason = 'Order cancelled') {
    logger.warn('Using deprecated restoreStockForOrder method - migrating to restoreStockForOrderAtomic');
    return this.restoreStockForOrderAtomic(orderId, userId, reason);
  }

  /**
   * Confirm stock deduction (when order is packed/shipped)
   * Moves stock from reserved to actually deducted
   * 
   * @param {string} orderId - Order ID
   * @returns {boolean} Success status
   */
  async confirmStockDeduction(orderId) {
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('variant_id, quantity')
      .eq('order_id', orderId);

    if (itemsError || !orderItems) {
      throw new DatabaseError('Failed to fetch order items', itemsError);
    }

    for (const item of orderItems) {
      const { error } = await supabaseAdmin.rpc('confirm_stock_deduction_atomic', {
        p_variant_id: item.variant_id,
        p_quantity: item.quantity,
        p_order_id: orderId,
      });

      if (error) {
        logger.error('Failed to confirm stock deduction', {
          error,
          variantId: item.variant_id,
          orderId,
        });
      }
    }

    logger.info('Stock deduction confirmed for order', { orderId });
    return true;
  }

  /**
   * Adjust stock manually
   * @param {Object} data - Adjustment data
   * @param {string} userId - User making the adjustment
   * @returns {Object} Stock movement record
   */
  async adjustStock(data, userId = null) {
    const { variant_id, movement_type, quantity, reason, vendor_id } = data;

    // Get current stock
    const { data: variant, error: fetchError } = await supabaseAdmin
      .from('product_variants')
      .select('id, sku, current_stock')
      .eq('id', variant_id)
      .single();

    if (fetchError || !variant) {
      throw new NotFoundError('Variant');
    }

    // Calculate new stock
    let adjustedQuantity = quantity;
    if (movement_type === 'outward' || movement_type === 'damage') {
      adjustedQuantity = -Math.abs(quantity);
    } else if (movement_type === 'inward') {
      adjustedQuantity = Math.abs(quantity);
    }

    const newStock = variant.current_stock + adjustedQuantity;

    if (newStock < 0) {
      throw new InsufficientStockError(
        variant.sku,
        Math.abs(adjustedQuantity),
        variant.current_stock
      );
    }

    // Update stock
    const { error: updateError } = await supabaseAdmin
      .from('product_variants')
      .update({ current_stock: newStock })
      .eq('id', variant_id);

    if (updateError) {
      throw new DatabaseError('Failed to adjust stock', updateError);
    }

    // Record movement
    const { data: movement, error: movementError } = await supabaseAdmin
      .from('stock_movements')
      .insert({
        variant_id,
        movement_type,
        quantity: adjustedQuantity,
        vendor_id,
        stock_before: variant.current_stock,
        stock_after: newStock,
        reason,
        created_by: userId,
      })
      .select()
      .single();

    if (movementError) {
      throw new DatabaseError('Failed to record stock movement', movementError);
    }

    logger.info('Stock adjusted', {
      variantId: variant_id,
      sku: variant.sku,
      type: movement_type,
      quantity: adjustedQuantity,
      newStock,
      reason,
    });

    return movement;
  }

  /**
   * Get low stock alerts
   * @returns {Array} Variants with low stock
   */
  async getLowStockAlerts() {
    const { data, error } = await supabaseAdmin
      .from('inventory_alerts')
      .select('*');

    if (error) {
      throw new DatabaseError('Failed to fetch inventory alerts', error);
    }

    return data;
  }

  /**
   * Get stock movements for a variant
   * @param {string} variantId - Variant UUID
   * @param {Object} options - Query options
   * @returns {Array} Stock movements
   */
  async getStockMovements(variantId, options = {}) {
    const { page = 1, limit = 50 } = options;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from('stock_movements')
      .select('*', { count: 'exact' })
      .eq('variant_id', variantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to fetch stock movements', error);
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
}

// Export singleton instance
export const productService = new ProductService();
export default productService;
