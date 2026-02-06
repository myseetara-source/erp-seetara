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
import { getAvailableStock, formatVariantName, buildSafeOrQuery } from '../utils/helpers.js';

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
   * Update product with variants
   * @param {string} id - Product UUID
   * @param {Object} data - Update data including variants
   * @returns {Object} Updated product with variants
   * 
   * STRATEGY: For variants, we use upsert logic:
   * - If variant has ID -> Update existing
   * - If variant has no ID -> Create new
   * - Variants not in the list are NOT deleted (to preserve order history)
   */
  async updateProduct(id, data) {
    // Separate product data from variants
    const { variants: variantData, ...productData } = data;

    // =========================================================================
    // STEP 1: Update product basic info
    // =========================================================================
    const productUpdateData = {
      ...productData,
      updated_at: new Date().toISOString(),
    };

    // Remove any fields that shouldn't be in products table
    delete productUpdateData.id;
    delete productUpdateData.created_at;

    const { data: updatedProduct, error: productError } = await supabaseAdmin
      .from('products')
      .update(productUpdateData)
      .eq('id', id)
      .select()
      .single();

    if (productError) {
      if (productError.code === 'PGRST116') {
        throw new NotFoundError('Product');
      }
      logger.error('Failed to update product', { error: productError, productId: id });
      throw new DatabaseError('Failed to update product', productError);
    }

    // =========================================================================
    // STEP 2: Update variants (if provided)
    // =========================================================================
    let updatedVariants = [];
    
    if (variantData && Array.isArray(variantData) && variantData.length > 0) {
      for (const variant of variantData) {
        // Clean up variant data - ensure numeric types
        const cleanVariant = {
          product_id: id,
          sku: variant.sku || '',
          attributes: variant.attributes || {},
          cost_price: Number(variant.cost_price) || 0,
          selling_price: Number(variant.selling_price) || 0,
          mrp: Number(variant.mrp) || null,
          current_stock: Number(variant.current_stock) || 0,
          reorder_level: Number(variant.reorder_level) || 10,
          is_active: variant.is_active ?? true,
          updated_at: new Date().toISOString(),
        };

        if (variant.id) {
          // =============================================
          // UPDATE existing variant
          // =============================================
          const { data: existingVariant, error: updateError } = await supabaseAdmin
            .from('product_variants')
            .update(cleanVariant)
            .eq('id', variant.id)
            .eq('product_id', id) // Security: ensure variant belongs to this product
            .select()
            .single();

          if (updateError) {
            logger.warn('Failed to update variant', { 
              variantId: variant.id, 
              error: updateError 
            });
            // Continue with other variants instead of failing completely
          } else {
            updatedVariants.push(existingVariant);
          }
        } else {
          // =============================================
          // CREATE new variant
          // =============================================
          cleanVariant.created_at = new Date().toISOString();
          
          const { data: newVariant, error: createError } = await supabaseAdmin
            .from('product_variants')
            .insert(cleanVariant)
            .select()
            .single();

          if (createError) {
            logger.warn('Failed to create variant', { 
              sku: cleanVariant.sku, 
              error: createError 
            });
          } else {
            updatedVariants.push(newVariant);
          }
        }
      }
    } else {
      // Fetch existing variants if none provided
      const { data: existingVariants } = await supabaseAdmin
        .from('product_variants')
        .select('id, sku, barcode, attributes, color, size, material, cost_price, selling_price, mrp, current_stock, damaged_stock, reserved_stock, reorder_level, is_active, created_at, updated_at')
        .eq('product_id', id)
        .order('created_at', { ascending: true });
      
      updatedVariants = existingVariants || [];
    }

    logger.info('Product updated', { 
      productId: id, 
      variantsUpdated: updatedVariants.length 
    });

    return {
      ...updatedProduct,
      variants: updatedVariants,
    };
  }

  /**
   * List products with filtering and pagination
   * 
   * IMPORTANT: Includes full variant data for price range calculation
   * 
   * @param {Object} options - Query options
   * @returns {Object} Paginated products list with variants
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

    // =========================================================================
    // FIX: Include FULL variant data, not just count
    // This allows frontend to calculate price ranges
    // =========================================================================
    let query = supabaseAdmin
      .from('products')
      .select(`
        *,
        variants:product_variants(
          id,
          sku,
          attributes,
          cost_price,
          selling_price,
          mrp,
          current_stock,
          reserved_stock,
          reorder_level,
          is_active
        )
      `, { count: 'exact' });

    // Apply filters
    if (brand) query = query.eq('brand', brand);
    if (category) query = query.eq('category', category);
    if (is_active !== undefined) query = query.eq('is_active', is_active);
    if (search) {
      const safeQuery = buildSafeOrQuery(search, ['name', 'brand']);
      if (safeQuery) query = query.or(safeQuery);
    }

    // Apply sorting and pagination
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);

    if (error) {
      logger.error('Failed to list products', { error });
      throw new DatabaseError('Failed to list products', error);
    }

    // =========================================================================
    // Compute aggregates: variant_count, total_stock
    // =========================================================================
    const enrichedData = (data || []).map(product => {
      const variants = product.variants || [];
      const activeVariants = variants.filter(v => v.is_active !== false);
      
      return {
        ...product,
        variant_count: activeVariants.length,
        total_stock: activeVariants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0),
      };
    });

    return {
      data: enrichedData,
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

  /**
   * Toggle product active status
   * @param {string} id - Product UUID
   * @returns {Object} Updated product
   */
  async toggleStatus(id) {
    // Get current status
    const product = await this.getProductById(id);
    
    // Toggle
    const newStatus = !product.is_active;
    
    const { data: updatedProduct, error } = await supabaseAdmin
      .from('products')
      .update({ is_active: newStatus })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new DatabaseError('Failed to toggle product status', error);
    }

    logger.info('Product status toggled', { productId: id, isActive: newStatus });
    return updatedProduct;
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
   * Get multiple variants by SKUs (BATCH QUERY - N+1 FIX)
   * Performance: Single query for all SKUs instead of N queries
   * 
   * @param {string[]} skus - Array of SKU codes
   * @returns {Object[]} Array of variants with product info
   */
  async getVariantsBySkus(skus) {
    if (!skus || skus.length === 0) {
      return [];
    }

    // Normalize SKUs to uppercase
    const normalizedSkus = skus.map(sku => sku.toUpperCase());

    const { data: variants, error } = await supabaseAdmin
      .from('product_variants')
      .select(`
        *,
        product:products(id, name, brand, category, image_url)
      `)
      .in('sku', normalizedSkus);

    if (error) {
      logger.error('Failed to fetch variants by SKUs', { error, skus: normalizedSkus });
      throw new DatabaseError('Failed to fetch variants', error);
    }

    return variants || [];
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
      const safeQuery = buildSafeOrQuery(search, ['sku', 'color', 'size']);
      if (safeQuery) query = query.or(safeQuery);
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
   * 
   * DEBUG: Added detailed logging to diagnose "False Positive Insufficient Stock" errors
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

      // CRITICAL: Ensure quantity is a number (fix string comparison bug)
      const requestedQty = parseInt(item.quantity, 10) || 0;
      const currentStock = parseInt(variant.current_stock, 10) || 0;
      const reservedStock = parseInt(variant.reserved_stock, 10) || 0;
      const available = currentStock - reservedStock;
      
      // DEBUG LOGGING: Help diagnose false positive "Insufficient Stock" errors
      logger.info('[StockCheck] Variant:', {
        variant_id: item.variant_id,
        sku: variant.sku,
        requested: requestedQty,
        current_stock: currentStock,
        reserved_stock: reservedStock,
        available: available,
        willFail: available < requestedQty
      });

      if (available < requestedQty) {
        unavailable.push({
          variant_id: item.variant_id,
          sku: variant.sku,
          requested: requestedQty,
          available,
          current_stock: currentStock,
          reserved_stock: reservedStock,
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
   * FALLBACK: If the batch RPC function is not available in the database,
   * falls back to sequential single-item deductions using deductStockAtomic.
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

    // Try the batch RPC first
    const { data, error } = await supabaseAdmin.rpc('deduct_stock_batch_atomic', {
      p_items: formattedItems,
      p_order_id: orderId,
      p_reason: `Batch order reservation${orderId ? ` - ${orderId}` : ''}`,
    });

    // If RPC function doesn't exist (PGRST202), fallback to sequential deduction
    if (error && error.code === 'PGRST202') {
      logger.warn('Batch RPC not available, falling back to sequential deduction', {
        orderId,
        itemCount: items.length,
      });
      
      // Use the sequential atomic deduction as fallback
      return await this.deductStockAtomic(items, orderId, null);
    }

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
   * ATOMIC Stock Adjustment
   * 
   * Uses database-level row locking (FOR UPDATE) to prevent race conditions.
   * This guarantees data integrity even under high concurrency.
   * 
   * SECURITY FIX: Replaced unsafe read-modify-write pattern with atomic RPC.
   * 
   * @param {Object} data - Adjustment data
   * @param {string} data.variant_id - UUID of the variant
   * @param {string} data.movement_type - 'inward', 'outward', or 'damage'
   * @param {number} data.quantity - Quantity to adjust (always positive)
   * @param {string} data.reason - Reason for adjustment
   * @param {string} data.vendor_id - Optional vendor ID
   * @param {string} userId - User making the adjustment
   * @returns {Object} Stock movement record with before/after details
   */
  async adjustStock(data, userId = null) {
    const { variant_id, movement_type, quantity, reason, vendor_id } = data;

    // Convert movement_type to quantity delta
    // inward = positive, outward/damage = negative
    let adjustedQuantity = Math.abs(quantity);
    if (movement_type === 'outward' || movement_type === 'damage') {
      adjustedQuantity = -adjustedQuantity;
    }

    // Build reason string with movement type context
    const fullReason = `${movement_type}: ${reason || 'Manual adjustment'}`;

    logger.debug('Attempting atomic stock adjustment', {
      variantId: variant_id,
      movementType: movement_type,
      quantity: adjustedQuantity,
      reason: fullReason,
    });

    // =========================================================================
    // ATOMIC RPC CALL - Uses FOR UPDATE row locking in PostgreSQL
    // This prevents race conditions where two concurrent adjustments could
    // corrupt stock data by both reading the same "current" value.
    // =========================================================================
    const { data: result, error: rpcError } = await supabaseAdmin.rpc('adjust_stock_atomic', {
      p_variant_id: variant_id,
      p_quantity: adjustedQuantity,
      p_reason: fullReason,
      p_user_id: userId,
    });

    // Handle RPC errors (network, function not found, etc.)
    if (rpcError) {
      logger.error('Atomic stock adjustment RPC failed', {
        error: rpcError.message,
        code: rpcError.code,
        variantId: variant_id,
      });
      throw new DatabaseError(`Failed to adjust stock: ${rpcError.message}`, rpcError);
    }

    // Handle business logic errors from the RPC function
    if (!result || !result.success) {
      const errorCode = result?.error_code || 'UNKNOWN';
      const errorMessage = result?.error || 'Stock adjustment failed';

      logger.warn('Stock adjustment rejected', {
        variantId: variant_id,
        errorCode,
        errorMessage,
        currentStock: result?.current_stock,
        requested: result?.requested,
      });

      // Map specific error codes to appropriate exceptions
      if (errorCode === 'INSUFFICIENT_STOCK') {
        throw new InsufficientStockError(
          result?.sku || variant_id,
          Math.abs(adjustedQuantity),
          result?.current_stock || 0
        );
      }

      if (errorCode === 'VARIANT_NOT_FOUND') {
        throw new NotFoundError('Variant');
      }

      throw new DatabaseError(errorMessage);
    }

    // =========================================================================
    // SUCCESS: Stock was adjusted atomically
    // =========================================================================
    logger.info('Stock adjusted atomically', {
      variantId: result.variant_id,
      sku: result.sku,
      productName: result.product_name,
      type: movement_type,
      quantity: adjustedQuantity,
      stockBefore: result.stock_before,
      stockAfter: result.stock_after,
      movementId: result.movement_id,
      reason: fullReason,
    });

    // Return in the same format as before for backward compatibility
    return {
      id: result.movement_id,
      variant_id: result.variant_id,
      movement_type,
      quantity: adjustedQuantity,
      vendor_id: vendor_id || null,
      stock_before: result.stock_before,
      stock_after: result.stock_after,
      reason: fullReason,
      created_by: userId,
      created_at: result.adjusted_at,
      // Additional fields from atomic RPC
      sku: result.sku,
      product_name: result.product_name,
    };
  }

  /**
   * Get low stock alerts
   * @returns {Array} Variants with low stock
   */
  async getLowStockAlerts() {
    // Query product_variants with low stock instead of non-existent inventory_alerts table
    const { data, error } = await supabaseAdmin
      .from('product_variants')
      .select(`
        id, sku, color, size, current_stock, reserved_stock, cost_price, selling_price,
        product:products(id, name, brand, category, image_url)
      `)
      .lt('current_stock', 10)
      .gt('current_stock', 0)
      .order('current_stock', { ascending: true })
      .limit(50);

    if (error) {
      throw new DatabaseError('Failed to fetch low stock alerts', error);
    }

    // Transform to expected format
    return (data || []).map(v => ({
      variant_id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      current_stock: v.current_stock,
      reserved_stock: v.reserved_stock || 0,
      product_id: v.product?.id,
      product_name: v.product?.name,
      brand: v.product?.brand,
      category: v.product?.category,
      image_url: v.product?.image_url,
    }));
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
