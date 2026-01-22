/**
 * Inventory Transaction Controller
 * 
 * Unified controller for handling:
 * - PURCHASE: Stock In from vendors (increases vendor payable balance)
 * - PURCHASE_RETURN: Return stock to vendors (decreases vendor payable balance)
 * - DAMAGE: Write-off damaged stock (no vendor balance change)
 * - ADJUSTMENT: Manual stock corrections (no vendor balance change)
 * 
 * ACCOUNTING LOGIC:
 * - Purchase: Vendor.balance += total_cost (We owe them more)
 * - Purchase Return: Vendor.balance -= total_cost (We owe them less)
 * - Damage/Adjustment: No vendor balance change
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
import { createLogger } from '../utils/logger.js';

// Logger instance for this controller
const logger = createLogger('InventoryController');

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
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  });
});

// =============================================================================
// GET SINGLE INVENTORY TRANSACTION
// =============================================================================

export const getInventoryTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user?.role === 'admin';

  const { data, error } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name, company_name, phone, email, balance),
      performer:users!inventory_transactions_performed_by_fkey(id, name, email),
      approver:users!inventory_transactions_approved_by_fkey(id, name, email),
      reference:inventory_transactions!reference_transaction_id(id, invoice_no, transaction_type, transaction_date),
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
          damaged_stock,
          product:products(id, name, image_url)
        )
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('[InventoryController] Get transaction error:', error);
    throw new AppError('Transaction not found', 404, 'NOT_FOUND');
  }

  // Calculate totals
  const totalQuantity = data.items?.reduce((sum, item) => sum + Math.abs(item.quantity || 0), 0) || 0;
  const totalCost = data.items?.reduce((sum, item) => sum + (Math.abs(item.quantity || 0) * (item.unit_cost || 0)), 0) || 0;

  // Mask sensitive data for non-admin
  const responseData = isAdmin
    ? { ...data, calculated_total_quantity: totalQuantity, calculated_total_cost: totalCost }
    : {
        ...data,
        total_cost: undefined,
        calculated_total_cost: undefined,
        vendor: data.vendor ? { id: data.vendor.id, name: data.vendor.name, company_name: data.vendor.company_name } : null,
        items: data.items?.map((item) => ({
          ...item,
          unit_cost: undefined,
        })),
        calculated_total_quantity: totalQuantity,
      };

  res.json({
    success: true,
    data: responseData,
  });
});

// =============================================================================
// CREATE INVENTORY TRANSACTION - CORE BUSINESS LOGIC
// =============================================================================

export const createInventoryTransaction = catchAsync(async (req, res) => {
  // Log incoming payload for debugging (only in development)
  logger.debug('Incoming payload', { body: req.body });

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

  // Parse and validate items - FIX FOR QUANTITY 0 BUG
  const parsedItems = data.items.map((item, index) => {
    const qty = parseInt(item.qty || item.quantity || 0, 10);
    const unitCost = parseFloat(item.unit_cost || item.unitCost || 0);
    
    logger.debug(`Parsed item ${index}`, {
      variant_id: item.variant_id,
      raw_qty: item.qty || item.quantity,
      parsed_qty: qty,
    });

    if (qty === 0) {
      logger.warn(`Item ${index} has quantity 0, skipping`);
    }

    return {
      variant_id: item.variant_id,
      quantity: qty,
      unit_cost: unitCost,
      notes: item.notes || null,
    };
  }).filter(item => item.quantity !== 0); // Filter out zero quantities

  if (parsedItems.length === 0) {
    throw new AppError('No valid items with non-zero quantity', 400, 'NO_VALID_ITEMS');
  }

  // ==========================================================================
  // MAKER-CHECKER LOGIC: Determine transaction status
  // ==========================================================================
  let transactionStatus = 'approved';
  
  if (data.transaction_type !== 'purchase' && !isAdmin) {
    transactionStatus = 'pending';
    logger.info(`Transaction set to PENDING`, { userRole });
  }

  // ==========================================================================
  // LOCKED DATE: Server timestamp only for Returns/Damages (audit security)
  // ==========================================================================
  const transactionDate = data.transaction_type === 'purchase' 
    ? (data.transaction_date || new Date().toISOString().split('T')[0])
    : new Date().toISOString().split('T')[0]; // LOCKED for returns/damages

  // ==========================================================================
  // PURCHASE RETURN: CRITICAL SECURITY - Validate quantities against original invoice
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

    // Build map of originally purchased quantities
    const originalQtyMap = new Map();
    for (const item of refTx.items || []) {
      originalQtyMap.set(item.variant_id, Math.abs(item.quantity));
    }

    // Get already returned quantities for this invoice
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

    // Validate each return item quantity
    const validationErrors = [];
    
    for (const returnItem of parsedItems) {
      const originalQty = originalQtyMap.get(returnItem.variant_id) || 0;
      const alreadyReturned = alreadyReturnedMap.get(returnItem.variant_id) || 0;
      const maxReturnable = originalQty - alreadyReturned;
      const requestedQty = Math.abs(returnItem.quantity);

      // SECURITY CHECK: Cannot return more than was purchased minus already returned
      if (requestedQty > maxReturnable) {
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

      // Cannot return an item that wasn't in the original invoice
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

    logger.debug('Return validation passed', {
      referenceId: data.reference_transaction_id,
      itemCount: parsedItems.length,
    });
  }

  // ==========================================================================
  // STEP 1: Create the transaction header
  // ==========================================================================
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

  logger.info('Created transaction', { transactionId: transaction.id });

  // ==========================================================================
  // STEP 2: Insert items (stock is updated by database trigger)
  // ==========================================================================
  const itemsToInsert = parsedItems.map((item) => ({
    transaction_id: transaction.id,
    variant_id: item.variant_id,
    // For outbound transactions (return, damage), store as negative
    quantity: config.quantityDirection === 'out' ? -Math.abs(item.quantity) : Math.abs(item.quantity),
    unit_cost: item.unit_cost,
    notes: item.notes,
  }));

  logger.debug('Inserting items', { count: itemsToInsert.length });

  const { error: itemsError } = await supabaseAdmin
    .from('inventory_transaction_items')
    .insert(itemsToInsert);

  if (itemsError) {
    console.error('[InventoryController] Transaction items error:', itemsError);

    // Rollback: Delete the transaction header
    await supabaseAdmin.from('inventory_transactions').delete().eq('id', transaction.id);

    throw new AppError('Failed to create transaction items', 500, 'DATABASE_ERROR');
  }

  // ==========================================================================
  // STEP 3: UPDATE VENDOR BALANCE (ACCOUNTING LOGIC)
  // Only for approved transactions with a vendor
  // ==========================================================================
  if (transactionStatus === 'approved' && data.vendor_id) {
    // Calculate total transaction value
    const totalAmount = parsedItems.reduce((sum, item) => {
      return sum + (Math.abs(item.quantity) * item.unit_cost);
    }, 0);

    logger.debug('Transaction total amount', { totalAmount });

    if (totalAmount > 0) {
      // Get current vendor balance
      const { data: vendor, error: vendorFetchError } = await supabaseAdmin
        .from('vendors')
        .select('id, name, balance')
        .eq('id', data.vendor_id)
        .single();

      if (vendorFetchError || !vendor) {
        console.error('[InventoryController] Failed to fetch vendor:', vendorFetchError);
      } else {
        const currentBalance = parseFloat(vendor.balance) || 0;
        let newBalance = currentBalance;

        // Apply accounting logic based on transaction type
        switch (data.transaction_type) {
          case 'purchase':
            // Purchase: We owe vendor MORE (balance increases)
            newBalance = currentBalance + totalAmount;
            logger.info('PURCHASE: Vendor balance updated', { vendor: vendor.name, from: currentBalance, add: totalAmount, to: newBalance });
            break;

          case 'purchase_return':
            // Return: We owe vendor LESS (balance decreases)
            newBalance = currentBalance - totalAmount;
            logger.info('PURCHASE_RETURN: Vendor balance updated', { vendor: vendor.name, from: currentBalance, subtract: totalAmount, to: newBalance });
            break;

          // Damage and Adjustment don't affect vendor balance
          case 'damage':
          case 'adjustment':
            logger.debug(`${data.transaction_type.toUpperCase()}: No vendor balance change`);
            break;
        }

        // Update vendor balance
        if (data.transaction_type === 'purchase' || data.transaction_type === 'purchase_return') {
          const { error: vendorUpdateError } = await supabaseAdmin
            .from('vendors')
            .update({ 
              balance: newBalance,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.vendor_id);

          if (vendorUpdateError) {
            console.error('[InventoryController] Failed to update vendor balance:', vendorUpdateError);
            // Note: We don't rollback the transaction here - it's a secondary operation
            // In production, you might want to use a proper transaction or queue
          } else {
            logger.info('Vendor balance updated', { vendor: vendor.name, newBalance });
          }
        }
      }
    }
  }

  // ==========================================================================
  // STEP 4: Update transaction totals
  // ==========================================================================
  const totalQuantity = parsedItems.reduce((sum, item) => sum + Math.abs(item.quantity), 0);
  const totalCost = parsedItems.reduce((sum, item) => sum + (Math.abs(item.quantity) * item.unit_cost), 0);

  await supabaseAdmin
    .from('inventory_transactions')
    .update({
      total_quantity: totalQuantity,
      total_cost: totalCost,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transaction.id);

  // ==========================================================================
  // STEP 5: Fetch the complete transaction with items
  // ==========================================================================
  const { data: completeTransaction } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      vendor:vendors(id, name, balance),
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
    : `${config.label} transaction created successfully. ${
        data.vendor_id && (data.transaction_type === 'purchase' || data.transaction_type === 'purchase_return')
          ? `Vendor balance updated.`
          : ''
      }`;

  logger.info('Transaction complete', {
    id: transaction.id,
    type: data.transaction_type,
    status: transactionStatus,
    items: parsedItems.length,
    totalQuantity,
  });

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
    console.error('[InventoryController] Get stock movements error:', error);
    throw new AppError('Failed to fetch stock movements', 500, 'DATABASE_ERROR');
  }

  // Mask cost for non-admins
  const maskedData = isAdmin
    ? data
    : data?.map((item) => ({ ...item, unit_cost: undefined }));

  res.json({
    success: true,
    data: maskedData,
  });
});

// =============================================================================
// VOID TRANSACTION (Soft delete - Admin only)
// =============================================================================

export const voidTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.length < 10) {
    throw new AppError('Void reason is required (min 10 characters)', 400, 'VALIDATION_ERROR');
  }

  // Fetch the transaction
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

  // Update status to voided
  const { error: updateError } = await supabaseAdmin
    .from('inventory_transactions')
    .update({
      status: 'voided',
      notes: `${transaction.notes || ''}\n\n[VOIDED: ${reason}]`.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    console.error('[InventoryController] Void transaction error:', updateError);
    throw new AppError('Failed to void transaction', 500, 'DATABASE_ERROR');
  }

  // TODO: Reverse the stock changes if needed (complex logic for another day)

  res.json({
    success: true,
    message: 'Transaction voided successfully',
  });
});

// =============================================================================
// LIST PENDING APPROVALS (Admin only)
// =============================================================================

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
      items:inventory_transaction_items(
        id,
        variant_id,
        quantity,
        unit_cost,
        variant:product_variants(id, sku, attributes, product:products(id, name))
      )
    `, { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[InventoryController] List pending approvals error:', error);
    throw new AppError('Failed to fetch pending approvals', 500, 'DATABASE_ERROR');
  }

  res.json({
    success: true,
    data: data || [],
    meta: { count: count || 0 },
  });
});

// =============================================================================
// APPROVE TRANSACTION (Admin only)
// =============================================================================

export const approveTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const approverId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Only admins can approve transactions', 403, 'FORBIDDEN');
  }

  // Use the database function to approve and update stock atomically
  const { data, error } = await supabaseAdmin.rpc('approve_inventory_transaction', {
    p_transaction_id: id,
    p_approved_by: approverId,
  });

  if (error) {
    console.error('[InventoryController] Approve transaction error:', error);
    throw new AppError(
      error.message || 'Failed to approve transaction',
      400,
      'APPROVAL_FAILED'
    );
  }

  // After approval, update vendor balance if applicable
  const { data: transaction } = await supabaseAdmin
    .from('inventory_transactions')
    .select(`
      *,
      items:inventory_transaction_items(variant_id, quantity, unit_cost)
    `)
    .eq('id', id)
    .single();

  if (transaction && transaction.vendor_id) {
    const totalAmount = transaction.items?.reduce((sum, item) => {
      return sum + (Math.abs(item.quantity) * (item.unit_cost || 0));
    }, 0) || 0;

    if (totalAmount > 0) {
      const { data: vendor } = await supabaseAdmin
        .from('vendors')
        .select('balance')
        .eq('id', transaction.vendor_id)
        .single();

      if (vendor) {
        const currentBalance = parseFloat(vendor.balance) || 0;
        let newBalance = currentBalance;

        if (transaction.transaction_type === 'purchase') {
          newBalance = currentBalance + totalAmount;
        } else if (transaction.transaction_type === 'purchase_return') {
          newBalance = currentBalance - totalAmount;
        }

        if (transaction.transaction_type === 'purchase' || transaction.transaction_type === 'purchase_return') {
          await supabaseAdmin
            .from('vendors')
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', transaction.vendor_id);

          logger.info('Vendor balance updated on approval', { newBalance });
        }
      }
    }
  }

  res.json({
    success: true,
    message: 'Transaction approved successfully. Stock and vendor balance updated.',
    data: data?.[0] || null,
  });
});

// =============================================================================
// REJECT TRANSACTION (Admin only)
// =============================================================================

export const rejectTransaction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const rejectorId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Only admins can reject transactions', 403, 'FORBIDDEN');
  }

  if (!reason || reason.length < 5) {
    throw new AppError('Rejection reason is required (min 5 characters)', 400, 'VALIDATION_ERROR');
  }

  // Use the database function to reject
  const { data, error } = await supabaseAdmin.rpc('reject_inventory_transaction', {
    p_transaction_id: id,
    p_rejected_by: rejectorId,
    p_rejection_reason: reason,
  });

  if (error) {
    console.error('[InventoryController] Reject transaction error:', error);
    throw new AppError(
      error.message || 'Failed to reject transaction',
      400,
      'REJECTION_FAILED'
    );
  }

  res.json({
    success: true,
    message: 'Transaction rejected',
    data: data?.[0] || null,
  });
});

// =============================================================================
// SEARCH PURCHASE INVOICES (For linking returns)
// =============================================================================

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
        variant_id,
        quantity,
        unit_cost,
        variant:product_variants(id, sku, attributes)
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

  // For each invoice, calculate how much has been returned
  const invoicesWithReturns = await Promise.all(
    (data || []).map(async (invoice) => {
      const { data: returns } = await supabaseAdmin
        .from('inventory_transactions')
        .select(`
          items:inventory_transaction_items(variant_id, quantity)
        `)
        .eq('reference_transaction_id', invoice.id)
        .eq('transaction_type', 'purchase_return')
        .eq('status', 'approved');

      const returnedMap = new Map();
      (returns || []).forEach((ret) => {
        (ret.items || []).forEach((item) => {
          const existing = returnedMap.get(item.variant_id) || 0;
          returnedMap.set(item.variant_id, existing + Math.abs(item.quantity));
        });
      });

      // Add remaining_qty to each item
      const itemsWithRemaining = (invoice.items || []).map((item) => ({
        ...item,
        original_qty: Math.abs(item.quantity),
        returned_qty: returnedMap.get(item.variant_id) || 0,
        remaining_qty: Math.abs(item.quantity) - (returnedMap.get(item.variant_id) || 0),
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
// GET INVENTORY VALUATION (Admin only)
// =============================================================================

export const getInventoryValuation = catchAsync(async (req, res) => {
  const isAdmin = req.user?.role === 'admin';

  if (!isAdmin) {
    throw new AppError('Access denied', 403, 'FORBIDDEN');
  }

  const { data, error } = await supabaseAdmin
    .from('product_variants')
    .select('current_stock, cost_price')
    .eq('is_active', true);

  if (error) {
    console.error('[InventoryController] Valuation error:', error);
    throw new AppError('Failed to calculate valuation', 500, 'DATABASE_ERROR');
  }

  let totalStock = 0;
  let totalValue = 0;

  (data || []).forEach((variant) => {
    const stock = variant.current_stock || 0;
    const cost = variant.cost_price || 0;
    totalStock += stock;
    totalValue += stock * cost;
  });

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

// =============================================================================
// GET LOW STOCK ALERTS
// =============================================================================

export const getLowStockAlerts = catchAsync(async (req, res) => {
  const { threshold = 10 } = req.query;

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
    console.error('[InventoryController] Low stock alerts error:', error);
    throw new AppError('Failed to fetch low stock alerts', 500, 'DATABASE_ERROR');
  }

  res.json({
    success: true,
    data: data || [],
    meta: { threshold: Number(threshold), count: data?.length || 0 },
  });
});

export default {
  listInventoryTransactions,
  getInventoryTransaction,
  createInventoryTransaction,
  getNextInvoiceNumber,
  getVariantStockMovements,
  voidTransaction,
  listPendingApprovals,
  approveTransaction,
  rejectTransaction,
  searchPurchaseInvoices,
  getInventoryValuation,
  getLowStockAlerts,
};
