/**
 * Inventory Transaction Controller
 * 
 * Unified controller for handling:
 * - PURCHASE: Stock In from vendors
 * - PURCHASE_RETURN: Return stock to vendors
 * - DAMAGE: Write-off damaged stock
 * - ADJUSTMENT: Manual stock corrections
 * 
 * SECURITY:
 * - Admin: Full access including cost/financial data
 * - Staff: Quantity-only access (cost fields masked)
 */

import { supabaseAdmin } from '../config/supabase.js';
import {
  createInventoryTransactionSchema,
  listTransactionsQuerySchema,
  transactionTypeConfig,
} from '../validations/inventory.validation.js';
import { AppError, catchAsync } from '../utils/errors.js';
import { maskSensitiveData } from '../utils/dataMasking.js';

// =============================================================================
// LIST INVENTORY TRANSACTIONS
// =============================================================================

export const listInventoryTransactions = catchAsync(async (req, res) => {
  // Validate query params
  const queryResult = listTransactionsQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    throw new AppError('Invalid query parameters', 400, 'VALIDATION_ERROR');
  }

  const { page, limit, type, vendor_id, from_date, to_date, search } = queryResult.data;
  const offset = (page - 1) * limit;
  const isAdmin = req.user?.role === 'admin';

  // Build query
  let query = supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name, company_name),
      performer:users!inventory_transactions_performed_by_fkey(id, name, email),
      items:inventory_transaction_items(
        id,
        variant_id,
        quantity,
        unit_cost,
        stock_before,
        stock_after,
        variant:product_variants(
          id,
          sku,
          attributes,
          product:products(id, name)
        )
      )
    `, { count: 'exact' });

  // Apply filters
  if (type) {
    query = query.eq('transaction_type', type);
  }

  if (vendor_id) {
    query = query.eq('vendor_id', vendor_id);
  }

  if (from_date) {
    query = query.gte('transaction_date', from_date);
  }

  if (to_date) {
    query = query.lte('transaction_date', to_date);
  }

  if (search) {
    query = query.or(`invoice_no.ilike.%${search}%,reason.ilike.%${search}%`);
  }

  // Order and paginate
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[InventoryController] List error:', error);
    throw new AppError('Failed to fetch transactions', 500, 'DATABASE_ERROR');
  }

  // Mask sensitive data for non-admin users
  const maskedData = isAdmin
    ? data
    : data?.map((tx) => ({
        ...tx,
        total_cost: undefined,
        items: tx.items?.map((item) => ({
          ...item,
          unit_cost: undefined,
        })),
      }));

  res.json({
    success: true,
    data: maskedData,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  });
});

// =============================================================================
// GET SINGLE TRANSACTION
// =============================================================================

export const getInventoryTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user?.role === 'admin';

  const { data, error } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name, company_name, phone),
      performer:users!inventory_transactions_performed_by_fkey(id, name, email),
      items:inventory_transaction_items(
        id,
        variant_id,
        quantity,
        unit_cost,
        stock_before,
        stock_after,
        notes,
        variant:product_variants(
          id,
          sku,
          attributes,
          current_stock,
          product:products(id, name, image_url)
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new AppError('Transaction not found', 404, 'NOT_FOUND');
  }

  // Mask sensitive data for non-admin users
  const result = isAdmin
    ? data
    : {
        ...data,
        total_cost: undefined,
        items: data.items?.map((item) => ({
          ...item,
          unit_cost: undefined,
        })),
      };

  res.json({
    success: true,
    data: result,
  });
});

// =============================================================================
// CREATE INVENTORY TRANSACTION
// =============================================================================

export const createInventoryTransaction = catchAsync(async (req, res) => {
  // Validate request body using discriminated union
  const result = createInventoryTransactionSchema.safeParse(req.body);

  if (!result.success) {
    console.error('[InventoryController] Validation error:', result.error.flatten());
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', {
      details: result.error.flatten().fieldErrors,
    });
  }

  const data = result.data;
  const userId = req.user?.id;
  const userRole = req.user?.role || 'staff';
  const isAdmin = userRole === 'admin';
  const config = transactionTypeConfig[data.transaction_type];

  if (!userId) {
    throw new AppError('User not authenticated', 401, 'UNAUTHORIZED');
  }

  // ==========================================================================
  // MAKER-CHECKER LOGIC: Determine transaction status
  // ==========================================================================
  // - Purchase: Always APPROVED immediately (stock in is safe)
  // - Purchase Return / Damage / Adjustment:
  //   - Admin creates: APPROVED immediately
  //   - Staff creates: PENDING (requires admin approval)
  // ==========================================================================
  let transactionStatus = 'approved';
  
  if (data.transaction_type !== 'purchase' && !isAdmin) {
    transactionStatus = 'pending';
    console.log(`[InventoryController] Transaction set to PENDING (created by ${userRole})`);
  }

  // ==========================================================================
  // LOCKED DATE: Server timestamp only for Returns/Damages (audit security)
  // ==========================================================================
  const transactionDate = data.transaction_type === 'purchase' 
    ? (data.transaction_date || new Date().toISOString().split('T')[0])
    : new Date().toISOString().split('T')[0]; // LOCKED for returns/damages

  // ==========================================================================
  // PURCHASE RETURN: CRITICAL SECURITY - Validate quantities against original invoice
  // Audit Fix CRIT-002: Prevent inventory fraud
  // ==========================================================================
  if (data.transaction_type === 'purchase_return') {
    if (!data.reference_transaction_id) {
      throw new AppError(
        'Purchase Return requires a reference to original purchase invoice',
        400,
        'MISSING_REFERENCE'
      );
    }
    
    // Verify reference transaction exists and is a purchase
    const { data: refTx, error: refError } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, 
        transaction_type, 
        status,
        items:inventory_transaction_items(
          variant_id,
          quantity
        )
      `)
      .eq('id', data.reference_transaction_id)
      .single();
    
    if (refError || !refTx) {
      throw new AppError('Reference purchase transaction not found', 400, 'INVALID_REFERENCE');
    }
    
    if (refTx.transaction_type !== 'purchase') {
      throw new AppError('Reference must be a Purchase transaction', 400, 'INVALID_REFERENCE_TYPE');
    }

    // =========================================================================
    // CRIT-002 FIX: Build map of originally purchased quantities
    // =========================================================================
    const originalQtyMap = new Map();
    for (const item of refTx.items || []) {
      originalQtyMap.set(item.variant_id, Math.abs(item.quantity));
    }

    // =========================================================================
    // CRIT-002 FIX: Get already returned quantities for this invoice
    // =========================================================================
    const { data: previousReturns } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        items:inventory_transaction_items(
          variant_id,
          quantity
        )
      `)
      .eq('reference_transaction_id', data.reference_transaction_id)
      .eq('transaction_type', 'purchase_return')
      .eq('status', 'approved');

    const alreadyReturnedMap = new Map();
    if (previousReturns) {
      for (const returnTx of previousReturns) {
        for (const item of returnTx.items || []) {
          const existing = alreadyReturnedMap.get(item.variant_id) || 0;
          alreadyReturnedMap.set(item.variant_id, existing + Math.abs(item.quantity));
        }
      }
    }

    // =========================================================================
    // CRIT-002 FIX: Validate each return item quantity
    // Rule: requested_return_qty <= original_qty - already_returned_qty
    // =========================================================================
    const validationErrors = [];
    
    for (const returnItem of data.items) {
      const originalQty = originalQtyMap.get(returnItem.variant_id) || 0;
      const alreadyReturned = alreadyReturnedMap.get(returnItem.variant_id) || 0;
      const maxReturnable = originalQty - alreadyReturned;
      const requestedQty = Math.abs(returnItem.quantity);

      // SECURITY CHECK: Cannot return more than was purchased minus already returned
      if (requestedQty > maxReturnable) {
        // Get variant SKU for better error message
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
          message: `Cannot return ${requestedQty} of ${variant?.sku || 'item'}. Original: ${originalQty}, Already Returned: ${alreadyReturned}, Max Returnable: ${maxReturnable}`
        });
      }

      // SECURITY CHECK: Cannot return an item that wasn't in the original invoice
      if (originalQty === 0) {
        validationErrors.push({
          variant_id: returnItem.variant_id,
          message: `Item was not in the original purchase invoice`
        });
      }
    }

    if (validationErrors.length > 0) {
      console.error('[InventoryController] SECURITY: Return quantity exceeded', {
        userId,
        referenceId: data.reference_transaction_id,
        errors: validationErrors,
      });
      
      throw new AppError(
        'Cannot return more than originally purchased',
        400,
        'RETURN_QUANTITY_EXCEEDED',
        { details: validationErrors }
      );
    }

    console.log('[InventoryController] Return validation passed', {
      referenceId: data.reference_transaction_id,
      itemCount: data.items.length,
    });
  }

  // 1. Create the header
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
      // If admin creates, auto-approve
      approved_by: transactionStatus === 'approved' ? userId : null,
      approval_date: transactionStatus === 'approved' ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (txError) {
    console.error('[InventoryController] Transaction header error:', txError);

    // Check for unique constraint violation
    if (txError.code === '23505') {
      throw new AppError('Invoice number already exists', 400, 'DUPLICATE_INVOICE');
    }

    throw new AppError('Failed to create transaction', 500, 'DATABASE_ERROR');
  }

  // 2. Insert items (triggers will update stock automatically)
  const itemsToInsert = data.items.map((item) => ({
    transaction_id: transaction.id,
    variant_id: item.variant_id,
    quantity: config.quantityDirection === 'out' ? -Math.abs(item.quantity) : item.quantity,
    unit_cost: item.unit_cost || 0,
    notes: item.notes || null,
  }));

  const { error: itemsError } = await supabaseAdmin
    .from('inventory_transaction_items')
    .insert(itemsToInsert);

  if (itemsError) {
    console.error('[InventoryController] Transaction items error:', itemsError);

    // Rollback: Delete the transaction header
    await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);

    throw new AppError('Failed to create transaction items', 500, 'DATABASE_ERROR');
  }

  // 3. Fetch the complete transaction with items
  const { data: completeTransaction } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name),
      performer:users!inventory_transactions_performed_by_fkey(id, name),
      items:inventory_transaction_items(
        id,
        variant_id,
        quantity,
        unit_cost,
        stock_before,
        stock_after,
        variant:product_variants(id, sku, attributes)
      )
    `)
    .eq('id', transaction.id)
    .single();

  // Build response message based on status
  const statusMessage = transactionStatus === 'pending'
    ? `${config.label} submitted for approval. Stock will be updated after admin approval.`
    : `${config.label} transaction created successfully`;

  res.status(201).json({
    success: true,
    message: statusMessage,
    data: {
      ...completeTransaction,
      requires_approval: transactionStatus === 'pending',
    },
  });
});

// =============================================================================
// GET NEXT INVOICE NUMBER
// =============================================================================

export const getNextInvoiceNumber = catchAsync(async (req, res) => {
  const { type } = req.query;

  if (!type || !['purchase', 'purchase_return', 'damage', 'adjustment'].includes(type)) {
    throw new AppError('Invalid transaction type', 400, 'VALIDATION_ERROR');
  }

  const config = transactionTypeConfig[type];
  const prefix = config.prefix;

  // Get max invoice number for this type
  const { data, error } = await supabaseAdmin.rpc('get_next_invoice_number', {
    p_type: type,
  });

  if (error) {
    console.error('[InventoryController] Get next invoice error:', error);

    // Fallback: Generate based on timestamp
    const fallback = `${prefix}-${Date.now().toString().slice(-6)}`;
    return res.json({ success: true, data: { invoice_no: fallback } });
  }

  res.json({
    success: true,
    data: { invoice_no: data },
  });
});

// =============================================================================
// GET STOCK MOVEMENTS FOR A VARIANT
// =============================================================================

export const getVariantStockMovements = catchAsync(async (req, res) => {
  const { variantId } = req.params;
  const { limit = 50 } = req.query;
  const isAdmin = req.user?.role === 'admin';

  const { data, error } = await supabaseAdmin
    .from('inventory_transaction_items')
    .select(`
      id,
      quantity,
      unit_cost,
      stock_before,
      stock_after,
      created_at,
      transaction:inventory_transactions(
        id,
        transaction_type,
        invoice_no,
        transaction_date,
        vendor:vendors(id, name)
      )
    `)
    .eq('variant_id', variantId)
    .order('created_at', { ascending: false })
    .limit(Number(limit));

  if (error) {
    console.error('[InventoryController] Stock movements error:', error);
    throw new AppError('Failed to fetch stock movements', 500, 'DATABASE_ERROR');
  }

  // Mask cost for non-admin
  const result = isAdmin
    ? data
    : data?.map((item) => ({
        ...item,
        unit_cost: undefined,
      }));

  res.json({
    success: true,
    data: result,
  });
});

// =============================================================================
// DELETE/VOID TRANSACTION (Admin only)
// =============================================================================

export const voidInventoryTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.length < 5) {
    throw new AppError('Void reason is required (min 5 characters)', 400, 'VALIDATION_ERROR');
  }

  // Check if transaction exists
  const { data: transaction, error: fetchError } = await supabaseAdmin
    .from('inventory_transactions')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !transaction) {
    throw new AppError('Transaction not found', 404, 'NOT_FOUND');
  }

  if (transaction.status === 'voided') {
    throw new AppError('Transaction is already voided', 400, 'ALREADY_VOIDED');
  }

  // Note: In a real system, you'd need to reverse the stock changes
  // For now, just mark as voided
  const { error: updateError } = await supabaseAdmin
    .from('inventory_transactions')
    .update({
      status: 'voided',
      notes: `${transaction.notes || ''}\n\n[VOIDED: ${reason}]`.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    console.error('[InventoryController] Void error:', updateError);
    throw new AppError('Failed to void transaction', 500, 'DATABASE_ERROR');
  }

  res.json({
    success: true,
    message: 'Transaction voided successfully',
  });
});

// =============================================================================
// LEGACY FUNCTIONS (v1 - for backwards compatibility)
// =============================================================================

/**
 * Create stock adjustment (Legacy v1)
 * Use createInventoryTransaction with type='adjustment' for v2
 */
export const createAdjustment = catchAsync(async (req, res) => {
  // Redirect to unified transaction system
  req.body.transaction_type = 'adjustment';
  req.body.invoice_no = `ADJ-${Date.now()}`;
  req.body.items = [{
    variant_id: req.body.variant_id,
    quantity: req.body.quantity,
    unit_cost: 0,
  }];
  return createInventoryTransaction(req, res);
});

/**
 * Report damage (Legacy v1)
 * Use createInventoryTransaction with type='damage' for v2
 */
export const reportDamage = catchAsync(async (req, res) => {
  // Redirect to unified transaction system
  req.body.transaction_type = 'damage';
  req.body.invoice_no = `DMG-${Date.now()}`;
  req.body.items = [{
    variant_id: req.body.variant_id,
    quantity: req.body.quantity,
    unit_cost: 0,
  }];
  return createInventoryTransaction(req, res);
});

/**
 * List adjustments (Legacy v1)
 */
export const listAdjustments = catchAsync(async (req, res) => {
  req.query.type = 'adjustment';
  return listInventoryTransactions(req, res);
});

/**
 * List damages (Legacy v1)
 */
export const listDamages = catchAsync(async (req, res) => {
  req.query.type = 'damage';
  return listInventoryTransactions(req, res);
});

/**
 * Get movement history (Legacy v1)
 */
export const getMovementHistory = catchAsync(async (req, res) => {
  const { variant_id } = req.query;
  if (!variant_id) {
    throw new AppError('variant_id is required', 400, 'VALIDATION_ERROR');
  }
  req.params.variantId = variant_id;
  return getVariantStockMovements(req, res);
});

/**
 * Get inventory valuation (Admin only)
 */
export const getInventoryValuation = catchAsync(async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  
  if (!isAdmin) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  // Get total inventory value
  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .select('current_stock, cost_price')
    .eq('is_active', true);

  if (error) {
    throw new AppError('Failed to calculate valuation', 500, 'DATABASE_ERROR');
  }

  const totalValue = data?.reduce((sum, v) => 
    sum + ((v.current_stock || 0) * (v.cost_price || 0)), 0
  ) || 0;

  const totalStock = data?.reduce((sum, v) => sum + (v.current_stock || 0), 0) || 0;

  res.json({
    success: true,
    data: {
      total_stock: totalStock,
      total_value: totalValue,
      variant_count: data?.length || 0,
      calculated_at: new Date().toISOString(),
    },
  });
});

/**
 * Get low stock alerts
 */
export const getLowStockAlerts = catchAsync(async (req, res) => {
  const threshold = Number(req.query.threshold) || 10;

  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .select(`
      id,
      sku,
      attributes,
      current_stock,
      reorder_level,
      product:products(id, name, image_url)
    `)
    .eq('is_active', true)
    .lte('current_stock', threshold)
    .order('current_stock', { ascending: true })
    .limit(50);

  if (error) {
    throw new AppError('Failed to fetch low stock alerts', 500, 'DATABASE_ERROR');
  }

  res.json({
    success: true,
    data: data || [],
    count: data?.length || 0,
  });
});

// =============================================================================
// APPROVAL WORKFLOW (Maker-Checker)
// =============================================================================

/**
 * List pending approvals (Admin only)
 * GET /inventory/transactions/pending
 */
export const listPendingApprovals = catchAsync(async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  
  if (!isAdmin) {
    throw new AppError('Only admins can view pending approvals', 403, 'FORBIDDEN');
  }

  const { data, error, count } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name, company_name),
      performer:users!inventory_transactions_performed_by_fkey(id, name, email),
      reference:inventory_transactions!inventory_transactions_reference_transaction_id_fkey(
        id, invoice_no, transaction_date
      ),
      items:inventory_transaction_items(
        id,
        variant_id,
        quantity,
        unit_cost,
        variant:product_variants(id, sku, attributes, current_stock, product:products(id, name))
      )
    `, { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[InventoryController] Pending approvals error:', error);
    throw new AppError('Failed to fetch pending approvals', 500, 'DATABASE_ERROR');
  }

  res.json({
    success: true,
    data: data || [],
    count: count || 0,
  });
});

/**
 * Approve a pending transaction (Admin only)
 * POST /inventory/transactions/:id/approve
 */
export const approveTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Only admins can approve transactions', 403, 'FORBIDDEN');
  }

  // Call the database function to approve and update stock
  const { data, error } = await supabaseAdmin.rpc('approve_inventory_transaction', {
    p_transaction_id: id,
    p_approved_by: userId,
  });

  if (error) {
    console.error('[InventoryController] Approval error:', error);
    throw new AppError('Failed to approve transaction', 500, 'DATABASE_ERROR');
  }

  const result = data?.[0];
  
  if (!result?.success) {
    throw new AppError(result?.message || 'Approval failed', 400, 'APPROVAL_FAILED');
  }

  res.json({
    success: true,
    message: 'Transaction approved. Stock has been updated.',
    transaction_id: id,
  });
});

/**
 * Reject a pending transaction (Admin only)
 * POST /inventory/transactions/:id/reject
 */
export const rejectTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Only admins can reject transactions', 403, 'FORBIDDEN');
  }

  if (!reason || reason.length < 5) {
    throw new AppError('Rejection reason is required (min 5 characters)', 400, 'VALIDATION_ERROR');
  }

  // Call the database function to reject
  const { data, error } = await supabaseAdmin.rpc('reject_inventory_transaction', {
    p_transaction_id: id,
    p_rejected_by: userId,
    p_rejection_reason: reason,
  });

  if (error) {
    console.error('[InventoryController] Rejection error:', error);
    throw new AppError('Failed to reject transaction', 500, 'DATABASE_ERROR');
  }

  const result = data?.[0];
  
  if (!result?.success) {
    throw new AppError(result?.message || 'Rejection failed', 400, 'REJECTION_FAILED');
  }

  res.json({
    success: true,
    message: 'Transaction rejected. No stock changes made.',
    transaction_id: id,
  });
});

/**
 * Search purchase invoices (for Purchase Return linking)
 * GET /inventory/purchases/search?vendor_id=xxx&invoice_no=xxx
 */
export const searchPurchaseInvoices = catchAsync(async (req, res) => {
  const { vendor_id, invoice_no, limit = 20 } = req.query;

  let query = supabaseAdmin
    .from('inventory_transactions')
    .select(`
      id,
      invoice_no,
      transaction_date,
      total_quantity,
      total_cost,
      vendor:vendors(id, name),
      items:inventory_transaction_items(
        id,
        variant_id,
        quantity,
        unit_cost,
        variant:product_variants(id, sku, attributes, current_stock, product:products(id, name))
      )
    `)
    .eq('transaction_type', 'purchase')
    .eq('status', 'approved')
    .order('transaction_date', { ascending: false })
    .limit(Number(limit));

  if (vendor_id) {
    query = query.eq('vendor_id', vendor_id);
  }

  if (invoice_no) {
    query = query.ilike('invoice_no', `%${invoice_no}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[InventoryController] Search invoices error:', error);
    throw new AppError('Failed to search invoices', 500, 'DATABASE_ERROR');
  }

  // Calculate already returned quantities for each invoice
  const invoicesWithReturns = await Promise.all(
    (data || []).map(async (invoice) => {
      // Find returns linked to this purchase
      const { data: returns } = await supabaseAdmin
        .from('inventory_transactions')
        .select(`
          items:inventory_transaction_items(variant_id, quantity)
        `)
        .eq('reference_transaction_id', invoice.id)
        .in('status', ['approved', 'pending']);

      // Calculate returned quantity per variant
      const returnedQty = new Map();
      returns?.forEach((ret) => {
        ret.items?.forEach((item) => {
          const existing = returnedQty.get(item.variant_id) || 0;
          returnedQty.set(item.variant_id, existing + Math.abs(item.quantity));
        });
      });

      // Add remaining returnable quantity to each item
      const itemsWithRemaining = invoice.items?.map((item) => ({
        ...item,
        returned_qty: returnedQty.get(item.variant_id) || 0,
        remaining_qty: item.quantity - (returnedQty.get(item.variant_id) || 0),
      }));

      return {
        ...invoice,
        items: itemsWithRemaining,
      };
    })
  );

  res.json({
    success: true,
    data: invoicesWithReturns,
  });
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // New unified transaction system (v2)
  listInventoryTransactions,
  getInventoryTransaction,
  createInventoryTransaction,
  getNextInvoiceNumber,
  getVariantStockMovements,
  voidInventoryTransaction,
  // Approval workflow
  listPendingApprovals,
  approveTransaction,
  rejectTransaction,
  searchPurchaseInvoices,
  // Legacy functions (v1)
  createAdjustment,
  reportDamage,
  listAdjustments,
  listDamages,
  getMovementHistory,
  getInventoryValuation,
  getLowStockAlerts,
};
