/**
 * Inventory Controller
 * 
 * SECURITY: Implements strict "Operational vs. Financial" separation.
 * 
 * Handles stock adjustments, damages, and inventory operations.
 * 
 * Access Rules:
 * - Staff: CAN report damages and adjustments (operational work)
 *          Response: "Stock Adjusted" (NEVER shows "Loss of Rs. X recorded")
 * - Admin: Full access including financial loss reports
 * 
 * Endpoints:
 * - POST   /inventory/adjustments      - Create stock adjustment (Staff + Admin)
 * - GET    /inventory/adjustments      - List adjustments (financial masked)
 * - POST   /inventory/damages          - Report damage (Staff + Admin)
 * - GET    /inventory/damages          - List damages (financial masked)
 * - GET    /inventory/movements        - Stock movement history
 * - GET    /inventory/valuation        - Inventory valuation (Admin ONLY)
 * - GET    /inventory/low-stock        - Low stock alerts
 */

import { supabase } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { extractContext } from '../middleware/auth.middleware.js';
import { 
  maskSensitiveData, 
  maskStockAdjustmentResponse,
  canSeeFinancials,
} from '../utils/dataMasking.js';
import { createLogger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

const logger = createLogger('InventoryController');

// =============================================================================
// STOCK ADJUSTMENTS
// =============================================================================

/**
 * Create stock adjustment
 * POST /inventory/adjustments
 * 
 * SECURITY:
 * - Staff CAN create adjustments (operational work)
 * - Backend calculates financial loss in background
 * - Staff response: "Stock Adjusted" (no financial data)
 * - Admin response: Full details including loss amount
 * 
 * @body {string} variant_id - Product variant UUID
 * @body {string} movement_type - 'adjustment', 'damage', 'return', 'inward', 'outward'
 * @body {number} quantity - Quantity to adjust (negative for reduction)
 * @body {string} reason - Reason for adjustment
 */
export const createAdjustment = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const userRole = req.user?.role;
  const { variant_id, movement_type, quantity, reason } = req.body;

  logger.info('Creating stock adjustment', {
    variantId: variant_id,
    type: movement_type,
    quantity,
    userId: context.userId,
  });

  // Get current variant with cost price
  const { data: variant, error: variantError } = await supabase
    .from('product_variants')
    .select(`
      id, 
      sku, 
      current_stock, 
      cost_price,
      product:products(id, name)
    `)
    .eq('id', variant_id)
    .single();

  if (variantError || !variant) {
    throw new NotFoundError('Product variant not found');
  }

  // Calculate new stock
  const newStock = variant.current_stock + quantity;
  if (newStock < 0) {
    throw new BadRequestError(`Insufficient stock. Current: ${variant.current_stock}, Requested: ${Math.abs(quantity)}`);
  }

  // Calculate financial loss (for damages/adjustments that reduce stock)
  const isReduction = quantity < 0;
  const lossAmount = isReduction ? Math.abs(quantity) * (variant.cost_price || 0) : 0;

  // Start transaction
  const { data: movement, error: movementError } = await supabase
    .from('stock_movements')
    .insert({
      variant_id,
      movement_type,
      quantity,
      reference_type: 'adjustment',
      reason,
      cost_at_movement: variant.cost_price,
      created_by: context.userId,
    })
    .select()
    .single();

  if (movementError) {
    logger.error('Failed to create stock movement', { error: movementError });
    throw new Error('Failed to record stock movement');
  }

  // Update variant stock
  const { error: updateError } = await supabase
    .from('product_variants')
    .update({ 
      current_stock: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq('id', variant_id);

  if (updateError) {
    logger.error('Failed to update stock', { error: updateError });
    throw new Error('Failed to update stock');
  }

  logger.info('Stock adjustment completed', {
    movementId: movement.id,
    variantId: variant_id,
    oldStock: variant.current_stock,
    newStock,
    lossAmount: isReduction ? lossAmount : 0,
  });

  // Build response based on role
  const adjustmentData = {
    id: movement.id,
    variant_id,
    sku: variant.sku,
    product_name: variant.product?.name,
    movement_type,
    quantity,
    previous_stock: variant.current_stock,
    new_stock: newStock,
    reason,
    created_at: movement.created_at,
    created_by: context.userId,
    // Financial data (admin only)
    cost_per_unit: variant.cost_price,
    loss_amount: lossAmount,
  };

  if (canSeeFinancials(userRole)) {
    // Admin sees everything including financial impact
    res.status(201).json({
      success: true,
      message: isReduction 
        ? `Stock adjusted. Loss of Rs. ${lossAmount.toLocaleString()} recorded.`
        : 'Stock adjusted successfully.',
      data: adjustmentData,
    });
  } else {
    // Staff sees operational message only - NO financial data
    res.status(201).json({
      success: true,
      message: 'Stock Adjusted', // Generic message
      data: maskStockAdjustmentResponse(adjustmentData, userRole),
    });
  }
});

/**
 * Report damage
 * POST /inventory/damages
 * 
 * SECURITY:
 * - Staff CAN report damages (operational work)
 * - Response NEVER shows "Loss of Rs. X"
 * 
 * @body {string} variant_id - Product variant UUID
 * @body {number} quantity - Damaged quantity (positive number)
 * @body {string} reason - Damage description
 * @body {string} [damage_type] - 'in_transit', 'warehouse', 'customer_return', 'expired'
 */
export const reportDamage = asyncHandler(async (req, res) => {
  const context = extractContext(req);
  const userRole = req.user?.role;
  const { variant_id, quantity, reason, damage_type = 'warehouse' } = req.body;

  if (quantity <= 0) {
    throw new BadRequestError('Damage quantity must be a positive number');
  }

  logger.info('Reporting damage', {
    variantId: variant_id,
    quantity,
    damageType: damage_type,
    userId: context.userId,
  });

  // Get current variant
  const { data: variant, error: variantError } = await supabase
    .from('product_variants')
    .select(`
      id, 
      sku, 
      current_stock, 
      cost_price,
      product:products(id, name)
    `)
    .eq('id', variant_id)
    .single();

  if (variantError || !variant) {
    throw new NotFoundError('Product variant not found');
  }

  if (variant.current_stock < quantity) {
    throw new BadRequestError(`Cannot report damage of ${quantity}. Current stock: ${variant.current_stock}`);
  }

  // Calculate financial loss
  const lossAmount = quantity * (variant.cost_price || 0);
  const newStock = variant.current_stock - quantity;

  // Record damage movement
  const { data: movement, error: movementError } = await supabase
    .from('stock_movements')
    .insert({
      variant_id,
      movement_type: 'damage',
      quantity: -quantity, // Negative for outward
      reference_type: 'damage',
      reason: `[${damage_type.toUpperCase()}] ${reason}`,
      cost_at_movement: variant.cost_price,
      created_by: context.userId,
    })
    .select()
    .single();

  if (movementError) {
    throw new Error('Failed to record damage');
  }

  // Update variant stock
  await supabase
    .from('product_variants')
    .update({ 
      current_stock: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq('id', variant_id);

  logger.info('Damage reported', {
    movementId: movement.id,
    variantId: variant_id,
    quantity,
    lossAmount,
  });

  // Build response based on role
  if (canSeeFinancials(userRole)) {
    res.status(201).json({
      success: true,
      message: `Damage recorded. Loss: Rs. ${lossAmount.toLocaleString()}`,
      data: {
        id: movement.id,
        variant_id,
        sku: variant.sku,
        product_name: variant.product?.name,
        quantity_damaged: quantity,
        previous_stock: variant.current_stock,
        new_stock: newStock,
        damage_type,
        reason,
        financial_impact: {
          cost_per_unit: variant.cost_price,
          total_loss: lossAmount,
        },
        created_at: movement.created_at,
      },
    });
  } else {
    // Staff: Generic success message, NO financial data
    res.status(201).json({
      success: true,
      message: 'Stock Adjusted', // Generic message - doesn't reveal loss
      data: {
        id: movement.id,
        sku: variant.sku,
        product_name: variant.product?.name,
        quantity_adjusted: quantity,
        new_stock: newStock,
        reason,
        created_at: movement.created_at,
      },
    });
  }
});

/**
 * List stock adjustments
 * GET /inventory/adjustments
 * 
 * SECURITY: Financial data masked for non-admins
 */
export const listAdjustments = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  const { page = 1, limit = 20, variant_id, movement_type, from_date, to_date } = req.query;

  let query = supabase
    .from('stock_movements')
    .select(`
      *,
      variant:product_variants(
        id, sku, cost_price,
        product:products(id, name)
      ),
      created_by_user:users!stock_movements_created_by_fkey(id, name)
    `, { count: 'exact' })
    .in('movement_type', ['adjustment', 'damage', 'return'])
    .order('created_at', { ascending: false });

  if (variant_id) query = query.eq('variant_id', variant_id);
  if (movement_type) query = query.eq('movement_type', movement_type);
  if (from_date) query = query.gte('created_at', from_date);
  if (to_date) query = query.lte('created_at', to_date);

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Failed to fetch adjustments');
  }

  // Mask financial data for non-admins
  const maskedData = data.map(item => 
    maskStockAdjustmentResponse(item, userRole)
  );

  res.json({
    success: true,
    data: canSeeFinancials(userRole) ? data : maskedData,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

/**
 * List damages
 * GET /inventory/damages
 * 
 * SECURITY: Financial data masked for non-admins
 */
export const listDamages = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  const { page = 1, limit = 20, from_date, to_date } = req.query;

  let query = supabase
    .from('stock_movements')
    .select(`
      *,
      variant:product_variants(
        id, sku, cost_price,
        product:products(id, name)
      )
    `, { count: 'exact' })
    .eq('movement_type', 'damage')
    .order('created_at', { ascending: false });

  if (from_date) query = query.gte('created_at', from_date);
  if (to_date) query = query.lte('created_at', to_date);

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Failed to fetch damages');
  }

  // Mask financial data for non-admins
  const responseData = canSeeFinancials(userRole) 
    ? data 
    : data.map(item => ({
        id: item.id,
        variant_id: item.variant_id,
        sku: item.variant?.sku,
        product_name: item.variant?.product?.name,
        quantity: Math.abs(item.quantity),
        reason: item.reason,
        created_at: item.created_at,
      }));

  res.json({
    success: true,
    data: responseData,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
    // Admin gets summary stats
    ...(canSeeFinancials(userRole) && {
      summary: {
        total_damages: count,
        total_loss: data.reduce((sum, d) => sum + (Math.abs(d.quantity) * (d.cost_at_movement || 0)), 0),
      },
    }),
  });
});

/**
 * Get stock movements history
 * GET /inventory/movements
 * 
 * SECURITY: All authenticated, cost data masked for non-admins
 */
export const getMovementHistory = asyncHandler(async (req, res) => {
  const userRole = req.user?.role;
  const { variant_id, page = 1, limit = 50 } = req.query;

  if (!variant_id) {
    throw new BadRequestError('variant_id is required');
  }

  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('stock_movements')
    .select(`
      *,
      variant:product_variants(id, sku, product:products(name))
    `, { count: 'exact' })
    .eq('variant_id', variant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error('Failed to fetch movement history');
  }

  // Mask cost data for non-admins
  const responseData = canSeeFinancials(userRole)
    ? data
    : data.map(m => {
        const { cost_at_movement, ...rest } = m;
        return rest;
      });

  res.json({
    success: true,
    data: responseData,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

/**
 * Get inventory valuation
 * GET /inventory/valuation
 * 
 * SECURITY: Admin ONLY - Pure financial data
 */
export const getInventoryValuation = asyncHandler(async (req, res) => {
  // Authorization done at route level: authorize('admin')
  
  const { data: variants, error } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      current_stock,
      cost_price,
      selling_price,
      product:products(id, name, brand, category)
    `)
    .eq('is_active', true)
    .gt('current_stock', 0);

  if (error) {
    throw new Error('Failed to fetch inventory');
  }

  // Calculate valuations
  const valuation = variants.map(v => ({
    ...v,
    stock_value_at_cost: v.current_stock * (v.cost_price || 0),
    stock_value_at_selling: v.current_stock * (v.selling_price || 0),
    potential_profit: v.current_stock * ((v.selling_price || 0) - (v.cost_price || 0)),
  }));

  const totals = {
    total_units: variants.reduce((sum, v) => sum + v.current_stock, 0),
    total_cost_value: valuation.reduce((sum, v) => sum + v.stock_value_at_cost, 0),
    total_selling_value: valuation.reduce((sum, v) => sum + v.stock_value_at_selling, 0),
    total_potential_profit: valuation.reduce((sum, v) => sum + v.potential_profit, 0),
  };

  res.json({
    success: true,
    data: {
      items: valuation,
      totals,
    },
  });
});

/**
 * Get low stock alerts
 * GET /inventory/low-stock
 * 
 * SECURITY: All authenticated (operational alert)
 */
export const getLowStockAlerts = asyncHandler(async (req, res) => {
  const { threshold = 10 } = req.query;

  const { data, error } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      current_stock,
      reorder_level,
      product:products(id, name, brand)
    `)
    .eq('is_active', true)
    .or(`current_stock.lte.${threshold},current_stock.lte.reorder_level`)
    .order('current_stock', { ascending: true });

  if (error) {
    throw new Error('Failed to fetch low stock items');
  }

  res.json({
    success: true,
    data,
    summary: {
      total_low_stock_items: data.length,
      critical_items: data.filter(d => d.current_stock === 0).length,
      warning_items: data.filter(d => d.current_stock > 0 && d.current_stock <= (d.reorder_level || threshold)).length,
    },
  });
});

export default {
  createAdjustment,
  reportDamage,
  listAdjustments,
  listDamages,
  getMovementHistory,
  getInventoryValuation,
  getLowStockAlerts,
};
