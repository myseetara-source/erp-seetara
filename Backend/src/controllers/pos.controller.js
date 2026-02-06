/**
 * POS Controller
 * Handles Point-of-Sale specific operations:
 * - Exchange/Refund reconciliation
 * - Inventory adjustments for in-store returns
 * - Financial calculations for exchanges
 * 
 * P0 FIX: Complete rewrite with proper error handling and stock operations
 */

import { supabaseAdmin } from '../config/supabase.js';
import { extractContext } from '../middleware/auth.middleware.js';
import { createLogger } from '../utils/logger.js';
import {
  ValidationError,
  NotFoundError,
  InsufficientStockError,
} from '../utils/errors.js';
import { logExchangeLink, logActivity, ACTIVITY_TYPES } from '../services/ActivityLogger.service.js';

// =============================================================================
// P0 FIX: One-time migration flag to fix order ID trigger
// =============================================================================
let migrationApplied = false;

async function ensureOrderIdTriggerFixed() {
  if (migrationApplied) return;
  
  try {
    // Check if the safe function already exists
    const { data: funcCheck, error: funcError } = await supabaseAdmin.rpc('check_function_exists', {
      func_name: 'generate_order_readable_id_safe'
    }).single();
    
    // If error, the RPC doesn't exist - we'll try direct approach
    if (funcError || !funcCheck?.exists) {
      console.log('[POS] Order ID trigger fix not detected, applying fix...');
      
      // Apply the migration SQL using raw query via RPC
      const migrationSQL = `
        -- Drop all existing order ID triggers
        DROP TRIGGER IF EXISTS trg_generate_readable_id ON orders;
        DROP TRIGGER IF EXISTS trg_prevent_readable_id_change ON orders;
        DROP TRIGGER IF EXISTS trg_generate_smart_order_id ON orders;
        DROP TRIGGER IF EXISTS generate_smart_order_id_trigger ON orders;
        DROP FUNCTION IF EXISTS generate_smart_order_id() CASCADE;
        DROP FUNCTION IF EXISTS prevent_readable_id_change() CASCADE;
        
        -- Create safe function
        CREATE OR REPLACE FUNCTION generate_order_readable_id_safe()
        RETURNS TRIGGER AS $$
        DECLARE
            v_date_prefix TEXT;
            v_max_seq INT := 100;
            v_new_seq INT;
            v_candidate TEXT;
            v_extracted INT;
            rec RECORD;
        BEGIN
            IF NEW.readable_id IS NOT NULL AND LENGTH(TRIM(NEW.readable_id)) > 0 THEN
                RETURN NEW;
            END IF;
            v_date_prefix := TO_CHAR(CURRENT_DATE, 'YY-MM-DD');
            BEGIN
                FOR rec IN 
                    SELECT readable_id FROM orders 
                    WHERE readable_id IS NOT NULL
                      AND readable_id LIKE v_date_prefix || '-%'
                      AND array_length(string_to_array(readable_id, '-'), 1) = 4
                LOOP
                    BEGIN
                        v_candidate := SPLIT_PART(rec.readable_id, '-', 4);
                        v_candidate := REGEXP_REPLACE(v_candidate, '[^0-9]', '', 'g');
                        IF v_candidate ~ '^[0-9]+$' AND LENGTH(v_candidate) > 0 THEN
                            v_extracted := v_candidate::INT;
                            IF v_extracted > v_max_seq THEN v_max_seq := v_extracted; END IF;
                        END IF;
                    EXCEPTION WHEN OTHERS THEN NULL;
                    END;
                END LOOP;
            EXCEPTION WHEN OTHERS THEN
                v_max_seq := 100 + (EXTRACT(EPOCH FROM NOW())::INT % 800);
            END;
            v_new_seq := v_max_seq + 1;
            NEW.readable_id := v_date_prefix || '-' || v_new_seq::TEXT;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        -- Create trigger
        DROP TRIGGER IF EXISTS trg_generate_order_readable_id ON orders;
        CREATE TRIGGER trg_generate_order_readable_id
            BEFORE INSERT ON orders
            FOR EACH ROW EXECUTE FUNCTION generate_order_readable_id_safe();
      `;
      
      // Try to execute via RPC (if available)
      const { error: rpcError } = await supabaseAdmin.rpc('execute_migration', {
        migration_sql: migrationSQL
      });
      
      if (rpcError) {
        console.warn('[POS] Could not auto-apply migration via RPC:', rpcError.message);
        console.log('[POS] Please run migration 096 manually in Supabase SQL Editor');
      } else {
        console.log('[POS] ✅ Order ID trigger fix applied successfully');
      }
    } else {
      console.log('[POS] Order ID trigger already fixed');
    }
  } catch (err) {
    console.warn('[POS] Migration check failed:', err.message);
  }
  
  migrationApplied = true;
}

const logger = createLogger('POSController');

// =============================================================================
// HELPER: Data Sanitization for Type Safety
// =============================================================================

/**
 * Sanitize integer value - returns null if not a valid integer
 * Handles cases where string codes like "IV-001" might be passed
 */
const sanitizeInteger = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const parsed = parseInt(value, 10);
  // Only return if it's a pure number (no letters like "IV-001")
  if (!isNaN(parsed) && String(value).match(/^-?\d+$/)) {
    return parsed;
  }
  return null;
};

/**
 * Sanitize UUID value - returns null if not a valid UUID format
 */
const sanitizeUUID = (value) => {
  if (!value) return null;
  // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value) ? value : null;
};

/**
 * Sanitize decimal/numeric value - returns 0 if not valid
 */
const sanitizeDecimal = (value, defaultVal = 0) => {
  if (value === null || value === undefined) return defaultVal;
  const num = Number(value);
  return isNaN(num) ? defaultVal : num;
};

/**
 * Sanitize string value - ensures it's a string or returns default
 */
const sanitizeString = (value, defaultVal = '') => {
  if (value === null || value === undefined) return defaultVal;
  return String(value);
};

// =============================================================================
// HELPER: Safe Stock Update (Increment) - For Refunds/Returns
// P0 FIX: Use RPC function for atomic operation with proper logging
// =============================================================================
async function incrementStock(variantId, quantity, orderId = null, reason = 'Store Return') {
  // Use RPC function for atomic operation
  const { data: result, error: rpcError } = await supabaseAdmin.rpc('restore_stock_return_atomic', {
    p_variant_id: variantId,
    p_quantity: quantity,
    p_order_id: orderId,
    p_reason: reason
  });

  if (rpcError) {
    logger.error('[incrementStock] RPC failed', { variantId, error: rpcError });
    // Fallback to direct update
    return await incrementStockDirect(variantId, quantity);
  }

  if (!result?.success) {
    logger.error('[incrementStock] RPC returned failure', { variantId, result });
    // Fallback to direct update
    return await incrementStockDirect(variantId, quantity);
  }

  logger.info('[incrementStock] Stock restored via RPC', { 
    variantId, 
    quantity, 
    newStock: result.new_stock 
  });
  
  return result.new_stock;
}

// Fallback direct update (if RPC not available)
async function incrementStockDirect(variantId, quantity) {
  const { data: variant, error: fetchError } = await supabaseAdmin
    .from('product_variants')
    .select('current_stock')
    .eq('id', variantId)
    .single();

  if (fetchError) {
    logger.error('[incrementStockDirect] Failed to fetch variant', { variantId, error: fetchError });
    throw new Error(`Failed to fetch variant ${variantId}: ${fetchError.message}`);
  }

  const newStock = (variant?.current_stock || 0) + quantity;

  const { error: updateError } = await supabaseAdmin
    .from('product_variants')
    .update({ current_stock: newStock })
    .eq('id', variantId);

  if (updateError) {
    logger.error('[incrementStockDirect] Failed to update stock', { variantId, error: updateError });
    throw new Error(`Failed to increment stock for ${variantId}: ${updateError.message}`);
  }

  return newStock;
}

// =============================================================================
// HELPER: Safe Stock Update (Decrement) - For Exchange New Items
// P0 FIX: Use RPC function for atomic operation with proper logging
// =============================================================================
async function decrementStock(variantId, quantity, orderId = null) {
  // Use RPC function for atomic operation
  const { data: result, error: rpcError } = await supabaseAdmin.rpc('deduct_stock_sale_atomic', {
    p_variant_id: variantId,
    p_quantity: quantity,
    p_order_id: orderId
  });

  if (rpcError) {
    logger.error('[decrementStock] RPC failed', { variantId, error: rpcError });
    // Fallback to direct update
    return await decrementStockDirect(variantId, quantity);
  }

  if (!result?.success) {
    logger.error('[decrementStock] RPC returned failure', { variantId, result });
    // For insufficient stock, throw error
    if (result?.available !== undefined) {
      throw new InsufficientStockError(
        variantId,
        quantity,
        result.available
      );
    }
    // Fallback to direct update for other errors
    return await decrementStockDirect(variantId, quantity);
  }

  logger.info('[decrementStock] Stock deducted via RPC', { 
    variantId, 
    quantity, 
    newStock: result.new_stock 
  });
  
  return result.new_stock;
}

// Fallback direct update (if RPC not available)
async function decrementStockDirect(variantId, quantity) {
  const { data: variant, error: fetchError } = await supabaseAdmin
    .from('product_variants')
    .select('current_stock')
    .eq('id', variantId)
    .single();

  if (fetchError) {
    logger.error('[decrementStockDirect] Failed to fetch variant', { variantId, error: fetchError });
    throw new Error(`Failed to fetch variant ${variantId}: ${fetchError.message}`);
  }

  const newStock = Math.max(0, (variant?.current_stock || 0) - quantity);

  const { error: updateError } = await supabaseAdmin
    .from('product_variants')
    .update({ current_stock: newStock })
    .eq('id', variantId);

  if (updateError) {
    logger.error('[decrementStock] Failed to update stock', { variantId, error: updateError });
    throw new Error(`Failed to decrement stock for ${variantId}: ${updateError.message}`);
  }

  return newStock;
}

// =============================================================================
// RECONCILE (Exchange/Refund)
// P0 FIX: Complete rewrite with proper error handling
// =============================================================================

/**
 * Process POS Exchange or Refund
 * POST /api/v1/pos/reconcile
 */
export const reconcilePOS = async (req, res) => {
  // ============================================================================
  // P0 FIX: Wrap EVERYTHING in try-catch for visibility
  // ============================================================================
  try {
    const context = extractContext(req);
    const { original_order_id, reason = '', return_items = [], new_items = [] } = req.body;

    logger.info('[POS Reconcile] 🚀 Starting reconciliation', {
      original_order_id,
      reason,
      return_count: return_items.length,
      new_count: new_items.length,
      userId: context.userId,
    });

    // ========================================================================
    // STEP 1: VALIDATION
    // ========================================================================

    if (!original_order_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Original order ID is required' 
      });
    }

    // P0 FIX: Reason is now compulsory
    if (!reason || !reason.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reason for exchange/refund is required' 
      });
    }

    if (return_items.length === 0 && new_items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one return item or new item is required' 
      });
    }

    // ========================================================================
    // STEP 2: FETCH ORIGINAL ORDER (Critical: Get customer_id!)
    // ========================================================================

    logger.info('[POS Reconcile] Fetching original order...');

    const { data: originalOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        readable_id,
        status,
        fulfillment_type,
        customer_id,
        subtotal,
        total_amount,
        shipping_name,
        shipping_phone,
        shipping_address,
        internal_notes
      `)
      .eq('id', original_order_id)
      .single();

    if (orderError) {
      logger.error('[POS Reconcile] ❌ Database error fetching order', { error: orderError });
      return res.status(500).json({ 
        success: false, 
        message: `Database error: ${orderError.message}` 
      });
    }

    if (!originalOrder) {
      return res.status(404).json({ 
        success: false, 
        message: 'Original order not found' 
      });
    }

    logger.info('[POS Reconcile] ✅ Original order found', {
      order_number: originalOrder.order_number,
      customer_id: originalOrder.customer_id,
      status: originalOrder.status,
      fulfillment_type: originalOrder.fulfillment_type,
    });

    // Validate it's a store order
    const isStoreOrder = 
      originalOrder.status === 'store_sale' || 
      originalOrder.status === 'delivered' ||
      originalOrder.fulfillment_type === 'store';

    if (!isStoreOrder) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reconciliation is only available for Store POS orders' 
      });
    }

    // P0 FIX: Validate customer_id exists
    if (!originalOrder.customer_id) {
      logger.error('[POS Reconcile] ❌ Original order missing customer_id!');
      return res.status(400).json({ 
        success: false, 
        message: 'Original order is missing customer information' 
      });
    }

    // ========================================================================
    // STEP 3: FETCH & VALIDATE ORIGINAL ORDER ITEMS
    // ========================================================================

    const { data: originalItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('variant_id, quantity, unit_price, product_name, variant_name, sku')
      .eq('order_id', original_order_id);

    if (itemsError) {
      logger.error('[POS Reconcile] ❌ Failed to fetch original items', { error: itemsError });
      return res.status(500).json({ 
        success: false, 
        message: `Failed to fetch original order items: ${itemsError.message}` 
      });
    }

    const originalItemMap = new Map(
      originalItems.map(item => [item.variant_id, item])
    );

    // Validate return items
    for (const returnItem of return_items) {
      const original = originalItemMap.get(returnItem.variant_id);
      
      if (!original) {
        return res.status(400).json({ 
          success: false, 
          message: `Item ${returnItem.variant_id} was not in the original order` 
        });
      }

      if (returnItem.quantity > original.quantity) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot return more than originally ordered (${original.quantity}) for ${original.sku}` 
        });
      }
    }

    // ========================================================================
    // STEP 4: VALIDATE NEW ITEMS STOCK
    // ========================================================================

    if (new_items.length > 0) {
      const newVariantIds = new_items.map(item => item.variant_id);
      
      const { data: newVariants, error: variantsError } = await supabaseAdmin
        .from('product_variants')
        .select('id, sku, current_stock, reserved_stock, selling_price, product:products(name)')
        .in('id', newVariantIds);

      if (variantsError) {
        return res.status(500).json({ 
          success: false, 
          message: `Failed to validate new items: ${variantsError.message}` 
        });
      }

      const variantMap = new Map(newVariants.map(v => [v.id, v]));

      for (const newItem of new_items) {
        const variant = variantMap.get(newItem.variant_id);
        
        if (!variant) {
          return res.status(400).json({ 
            success: false, 
            message: `Product variant ${newItem.variant_id} not found` 
          });
        }

        const available = (variant.current_stock || 0) - (variant.reserved_stock || 0);
        
        if (available < newItem.quantity) {
          return res.status(400).json({ 
            success: false, 
            message: `Insufficient stock for ${variant.sku}: need ${newItem.quantity}, have ${available}` 
          });
        }
      }
    }

    // ========================================================================
    // STEP 5: CALCULATE FINANCIALS
    // ========================================================================

    const returnTotal = return_items.reduce(
      (sum, item) => sum + (item.quantity * item.unit_price),
      0
    );

    const newTotal = new_items.reduce(
      (sum, item) => sum + (item.quantity * item.unit_price),
      0
    );

    const netAmount = newTotal - returnTotal;
    const transactionType = return_items.length > 0 && new_items.length > 0 
      ? 'exchange' 
      : (return_items.length > 0 ? 'refund' : 'addon');

    logger.info('[POS Reconcile] 💰 Financial calculation', {
      returnTotal,
      newTotal,
      netAmount,
      transactionType,
    });

    // ========================================================================
    // STEP 6: INVENTORY TRANSACTIONS
    // ========================================================================

    // ========================================================================
    // P0 FIX: DO NOT auto-increment stock for returned items!
    // Stock ONLY increments when item physically arrives at Dispatch Hub.
    // Mark items as 'pending_pickup' for Dispatch to settle later.
    // ========================================================================
    // DISABLED: Auto-stock increment removed per Unified Return Logistics
    // for (const returnItem of return_items) {
    //   await incrementStock(returnItem.variant_id, returnItem.quantity, ...);
    // }
    logger.info('[POS Reconcile] 📦 Return items marked for pickup - NO auto-stock', { 
      return_count: return_items.length,
      message: 'Stock will increment when Dispatch settles the return'
    });

    // Decrement stock for new items (Exchange New Items)
    // P0 FIX: Use RPC function which handles stock movement logging automatically
    for (const newItem of new_items) {
      logger.info('[POS Reconcile] 📦 Decrementing stock for new item', { 
        variant_id: newItem.variant_id, 
        quantity: newItem.quantity 
      });

      await decrementStock(
        newItem.variant_id, 
        newItem.quantity,
        original_order_id
      );
      // Note: Stock movement is logged automatically by RPC function
    }

    // ========================================================================
    // STEP 7: CREATE RECONCILIATION ORDER
    // P0 FIX: Use correct status enum + customer_id from original order
    // ========================================================================

    // =========================================================================
    // Build order items with FULL SANITIZATION
    // P0 FIX: Ensure all fields have correct types to prevent "IV-001" errors
    // =========================================================================
    const reconcileItems = [
      ...return_items.map(item => {
        const original = originalItemMap.get(item.variant_id);
        const qty = sanitizeInteger(item.quantity) || 1;
        const price = sanitizeDecimal(item.unit_price, 0);
        return {
          variant_id: sanitizeUUID(item.variant_id),
          // DO NOT include vendor_id - it might contain "IV-001" string codes
          sku: sanitizeString(original?.sku || item.sku, 'RETURN'),
          product_name: sanitizeString(original?.product_name || item.product_name, 'Returned Item'),
          variant_name: sanitizeString(original?.variant_name || item.variant_name, ''),
          quantity: -Math.abs(qty), // Negative for returns
          unit_price: price,
          unit_cost: sanitizeDecimal(original?.unit_cost || item.unit_cost, 0),
          total_price: -(Math.abs(qty) * price),
          fulfilled_quantity: 0,
          // P0 FIX: Mark return items for Dispatch pickup - NO auto-stock
          return_status: 'pending_pickup',
        };
      }),
      ...new_items.map(item => {
        const qty = sanitizeInteger(item.quantity) || 1;
        const price = sanitizeDecimal(item.unit_price, 0);
        return {
          variant_id: sanitizeUUID(item.variant_id),
          // DO NOT include vendor_id - it might contain "IV-001" string codes
          sku: sanitizeString(item.sku, 'NEW'),
          product_name: sanitizeString(item.product_name, 'New Item'),
          variant_name: sanitizeString(item.variant_name, ''),
          quantity: Math.abs(qty), // Positive for new items
          unit_price: price,
          unit_cost: sanitizeDecimal(item.unit_cost, 0),
          total_price: Math.abs(qty) * price,
          fulfilled_quantity: 0,
        };
      }),
    ];

    // =========================================================================
    // P0 FIX: Build order payload with FULL DATA SANITIZATION
    // CRITICAL: This prevents "IV-001" errors by ensuring type safety
    // =========================================================================
    
    // Generate readable_id in the expected format: YY-MM-DD-SEQ
    const now = new Date();
    const datePrefix = `${String(now.getFullYear()).slice(-2)}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const randomSeq = Math.floor(Math.random() * 900) + 100; // 100-999
    const generatedReadableId = `${datePrefix}-${randomSeq}E`; // E suffix for Exchange
    
    // Log full payload for debugging
    logger.info('[POS Reconcile] 🔍 Building sanitized payload', {
      original_readable_id: originalOrder.readable_id,
      generated_readable_id: generatedReadableId,
      customer_id: originalOrder.customer_id,
      netAmount,
    });
    
    // =========================================================================
    // P0 FIX: Build order payload with EXPLICIT FIELD LIST ONLY
    // CRITICAL: Only include columns that EXIST in the orders table
    // =========================================================================
    
    const reconcileOrderData = {
      // =====================================================================
      // UUID Fields - Validate format (ONLY these UUIDs)
      // =====================================================================
      customer_id: sanitizeUUID(originalOrder.customer_id),
      parent_order_id: sanitizeUUID(original_order_id),
      
      // =====================================================================
      // CRITICAL: Set readable_id EXPLICITLY to bypass trigger parsing issues
      // =====================================================================
      readable_id: generatedReadableId,
      
      // =====================================================================
      // String Fields - ONLY columns that exist in orders table
      // =====================================================================
      source: 'store',
      status: 'delivered',
      fulfillment_type: 'store',
      payment_method: 'cash',
      payment_status: 'paid',
      
      // Shipping info (columns that exist in orders table)
      shipping_name: sanitizeString(originalOrder.shipping_name, 'POS Customer'),
      shipping_phone: sanitizeString(originalOrder.shipping_phone, ''),
      shipping_address: sanitizeString(originalOrder.shipping_address, 'Store Pickup'),
      shipping_city: sanitizeString(originalOrder.shipping_city, ''),
      shipping_state: sanitizeString(originalOrder.shipping_state, ''),
      shipping_pincode: sanitizeString(originalOrder.shipping_pincode, ''),
      
      // Notes (string) - Include reason
      internal_notes: `[POS ${transactionType.toUpperCase()}] From #${originalOrder.readable_id || originalOrder.order_number}. Return: रु.${returnTotal}, New: रु.${newTotal}, Net: रु.${netAmount}. Reason: ${reason.trim()}`,
      remarks: reason.trim(),  // Store reason in remarks for easy access
      
      // =====================================================================
      // Decimal/Money Fields - Force to number type
      // =====================================================================
      subtotal: Number(Math.abs(netAmount)) || 0,
      discount_amount: 0,
      shipping_charges: 0,
      cod_charges: 0,
      total_amount: Number(netAmount) || 0,
      paid_amount: Number(Math.max(0, netAmount)) || 0,
      
      // =====================================================================
      // Integer Fields - EXPLICIT INTEGER TYPE
      // =====================================================================
      priority: 0,
      followup_count: 0,
      
      // =====================================================================
      // P0 FIX: Flag for Dispatch UI - indicates pickup task exists
      // =====================================================================
      has_exchange_pickup: return_items.length > 0,
    };
    
    // =========================================================================
    // P0 SAFETY: REMOVED customer_name, customer_phone, customer_address, 
    // customer_city as they don't exist in the orders table schema
    // =========================================================================
    
    // Validate critical fields before insert
    if (!reconcileOrderData.customer_id) {
      logger.error('[POS Reconcile] ❌ Invalid customer_id after sanitization', {
        original: originalOrder.customer_id,
        sanitized: reconcileOrderData.customer_id,
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid customer ID. Cannot create reconciliation order.',
      });
    }

    // =========================================================================
    // P0 DEBUG: Log COMPLETE payload to catch "IV-001" source
    // =========================================================================
    console.log('\n========== POS RECONCILE DEBUG ==========');
    console.log('FULL PAYLOAD BEING SENT TO DATABASE:');
    console.log(JSON.stringify(reconcileOrderData, null, 2));
    console.log('FIELD TYPES:');
    Object.keys(reconcileOrderData).forEach(key => {
      console.log(`  ${key}: ${typeof reconcileOrderData[key]} = ${JSON.stringify(reconcileOrderData[key])}`);
    });
    console.log('==========================================\n');

    logger.info('[POS Reconcile] 📝 Creating reconciliation order with sanitized payload', {
      customer_id: reconcileOrderData.customer_id,
      parent_order_id: reconcileOrderData.parent_order_id,
      readable_id: reconcileOrderData.readable_id,
      status: reconcileOrderData.status,
      fulfillment_type: reconcileOrderData.fulfillment_type,
      total_amount: reconcileOrderData.total_amount,
      subtotal: reconcileOrderData.subtotal,
      priority: reconcileOrderData.priority,
      followup_count: reconcileOrderData.followup_count,
    });

    // P0 FIX: Double-check integer fields are actually integers
    const finalPayload = {
      ...reconcileOrderData,
      priority: Number.isInteger(reconcileOrderData.priority) ? reconcileOrderData.priority : 0,
      followup_count: Number.isInteger(reconcileOrderData.followup_count) ? reconcileOrderData.followup_count : 0,
    };

    const { data: reconcileOrder, error: createError } = await supabaseAdmin
      .from('orders')
      .insert(finalPayload)
      .select()
      .single();

    if (createError) {
      logger.error('[POS Reconcile] ❌ Failed to create reconciliation order', { 
        error: createError,
        code: createError.code,
        details: createError.details,
        hint: createError.hint,
      });
      
      // P0 FIX: Detect the IV-001 parsing error and provide helpful message
      if (createError.message?.includes('IV-001') || createError.message?.includes('invalid input syntax for type integer')) {
        logger.error('[POS Reconcile] 🔥 TRIGGER BUG DETECTED - Legacy order ID format causing issues');
        return res.status(500).json({ 
          success: false, 
          message: 'Database trigger error: Please run migration 096_bulletproof_order_id.sql in Supabase SQL Editor to fix this.',
          error_details: {
            code: createError.code,
            cause: 'Legacy order IDs (IV-001 format) are causing the order ID trigger to fail',
            fix: 'Run migration 096 in Supabase SQL Editor',
          }
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        message: `Failed to create reconciliation order: ${createError.message}`,
        error_details: {
          code: createError.code,
          hint: createError.hint,
        }
      });
    }

    logger.info('[POS Reconcile] ✅ Reconciliation order created', {
      id: reconcileOrder.id,
      order_number: reconcileOrder.order_number,
      readable_id: reconcileOrder.readable_id,
    });

    // =========================================================================
    // P0 FIX: Log Exchange/Refund relationship in Activity Timeline
    // Creates entries in both parent and child order activities
    // =========================================================================
    try {
      await logExchangeLink(supabaseAdmin, {
        parentOrderId: original_order_id,
        childOrderId: reconcileOrder.id,
        parentReadableId: originalOrder.readable_id || originalOrder.order_number,
        childReadableId: reconcileOrder.readable_id || reconcileOrder.order_number,
        transactionType: transactionType,
        user: context.user || null,  // Pass user for WHO tracking
      });
      logger.info('[POS Reconcile] ✅ Exchange link logged to activities');
    } catch (linkError) {
      // Non-critical - don't fail the reconciliation if logging fails
      logger.warn('[POS Reconcile] Failed to log exchange link', { error: linkError.message });
    }

    // Insert order items with explicit field mapping (no spread to avoid rogue fields)
    if (reconcileItems.length > 0) {
      const itemRecords = reconcileItems.map(item => ({
        order_id: reconcileOrder.id,
        variant_id: item.variant_id,
        // CRITICAL: DO NOT include vendor_id - it might be "IV-001" string
        sku: item.sku,
        product_name: item.product_name,
        variant_name: item.variant_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost,
        total_price: item.total_price,
        fulfilled_quantity: item.fulfilled_quantity || 0,
      }));

      logger.info('[POS Reconcile] 📦 Inserting order items', {
        count: itemRecords.length,
        sample: itemRecords[0] ? {
          variant_id: itemRecords[0].variant_id,
          sku: itemRecords[0].sku,
          quantity: itemRecords[0].quantity,
          quantity_type: typeof itemRecords[0].quantity,
        } : null,
      });

      const { error: itemsInsertError } = await supabaseAdmin
        .from('order_items')
        .insert(itemRecords);

      if (itemsInsertError) {
        logger.error('[POS Reconcile] ❌ Failed to insert order items', { 
          error: itemsInsertError,
          code: itemsInsertError.code,
          details: itemsInsertError.details,
          hint: itemsInsertError.hint,
        });
        // Note: Not returning error - order is created, items failed
      } else {
        logger.info('[POS Reconcile] ✅ Order items inserted successfully');
      }
    }

    // ========================================================================
    // STEP 8: UPDATE ORIGINAL ORDER
    // ========================================================================

    const updateNote = originalOrder.internal_notes 
      ? `${originalOrder.internal_notes}\n[${new Date().toISOString()}] ${transactionType.toUpperCase()}: See Order #${reconcileOrder.readable_id || reconcileOrder.order_number}`
      : `[${new Date().toISOString()}] ${transactionType.toUpperCase()}: See Order #${reconcileOrder.readable_id || reconcileOrder.order_number}`;

    await supabaseAdmin
      .from('orders')
      .update({ internal_notes: updateNote })
      .eq('id', original_order_id);

    // ========================================================================
    // STEP 9: SUCCESS RESPONSE
    // ========================================================================

    logger.info('[POS Reconcile] ✅ Reconciliation complete!', {
      original_order_id,
      reconcile_order_id: reconcileOrder.id,
      transaction_type: transactionType,
      net_amount: netAmount,
    });

    return res.status(201).json({
      success: true,
      message: `${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)} processed successfully`,
      data: {
        reconciliation_order: {
          id: reconcileOrder.id,
          order_number: reconcileOrder.order_number,
          readable_id: reconcileOrder.readable_id,
        },
        original_order_id,
        transaction_type: transactionType,
        financials: {
          return_total: returnTotal,
          new_total: newTotal,
          net_amount: netAmount,
          customer_owes: netAmount > 0 ? netAmount : 0,
          refund_due: netAmount < 0 ? Math.abs(netAmount) : 0,
        },
        items_returned: return_items.length,
        items_added: new_items.length,
      },
    });

  } catch (error) {
    // ========================================================================
    // P0 FIX: CRASH REPORTER - Log everything for debugging
    // ========================================================================
    console.error('🔥 POS RECONCILE CRASH:', error);
    logger.error('[POS Reconcile] 🔥 UNHANDLED EXCEPTION', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error during reconciliation',
      error_type: error.name,
    });
  }
};

// =============================================================================
// GET ORDER FOR RECONCILIATION
// =============================================================================

/**
 * Get order details for reconciliation modal
 * GET /api/v1/pos/order/:id
 */
export const getOrderForReconcile = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        readable_id,
        status,
        fulfillment_type,
        customer_id,
        subtotal,
        total_amount,
        discount_amount,
        shipping_name,
        shipping_phone,
        created_at,
        items:order_items(
          id,
          variant_id,
          quantity,
          unit_price,
          total_price,
          product_name,
          variant_name,
          sku
        )
      `)
      .eq('id', id)
      .single();

    if (orderError) {
      logger.error('[getOrderForReconcile] Database error', { error: orderError });
      return res.status(500).json({ 
        success: false, 
        message: orderError.message 
      });
    }

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Check if it's a store order (include 'delivered' for POS orders)
    const isStoreOrder = 
      order.status === 'store_sale' || 
      order.status === 'delivered' ||
      order.fulfillment_type === 'store';

    if (!isStoreOrder) {
      return res.status(400).json({ 
        success: false, 
        message: 'Only Store POS orders can be reconciled' 
      });
    }

    return res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('🔥 GET ORDER FOR RECONCILE CRASH:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

export default {
  reconcilePOS,
  getOrderForReconcile,
};
