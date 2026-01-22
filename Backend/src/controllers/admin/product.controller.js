/**
 * Admin Product Controller
 * 
 * Handles product change request workflow (Maker-Checker pattern)
 * SECURITY: All routes require admin/manager authentication
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { AppError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AdminProductController');

// =============================================================================
// LIST CHANGE REQUESTS
// GET /api/v1/admin/products/change-requests
// =============================================================================

export const listChangeRequests = asyncHandler(async (req, res) => {
  const { status = 'pending', limit = 50, offset = 0 } = req.query;

  const { data, error, count } = await supabaseAdmin
    .from('product_change_requests')
    .select(`
      id, product_id, status, changes, original_values, 
      rejection_reason, created_at, reviewed_at,
      product:products(id, name, sku, images),
      requester:users!requested_by(id, name, email, role),
      reviewer:users!reviewed_by(id, name, email)
    `, { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (error) {
    logger.error('Failed to fetch change requests', { error });
    throw new AppError('Failed to fetch change requests', 500);
  }

  res.json({
    success: true,
    data,
    pagination: {
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + parseInt(limit)) < (count || 0),
    },
  });
});

// =============================================================================
// CREATE CHANGE REQUEST
// POST /api/v1/admin/products/change-requests
// =============================================================================

export const createChangeRequest = asyncHandler(async (req, res) => {
  const { product_id, changes } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Admins should use direct update API
  if (userRole === 'admin') {
    throw new AppError('Admins should use direct product update API', 400);
  }

  // Validation
  if (!product_id || !changes || Object.keys(changes).length === 0) {
    throw new AppError('Product ID and changes are required', 400);
  }

  // Get current product values for comparison
  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('id, name, sku, description, category, brand, price, cost_price, is_active')
    .eq('id', product_id)
    .single();

  if (productError || !product) {
    throw new AppError('Product not found', 404);
  }

  // Extract original values for changed fields
  const changedFields = Object.keys(changes);
  const originalValues = {};
  changedFields.forEach(field => {
    originalValues[field] = product[field];
  });

  // Check for existing pending request
  const { data: existingRequest } = await supabaseAdmin
    .from('product_change_requests')
    .select('id')
    .eq('product_id', product_id)
    .eq('requested_by', userId)
    .eq('status', 'pending')
    .single();

  if (existingRequest) {
    // Update existing request
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('product_change_requests')
      .update({
        changes,
        original_values: originalValues,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingRequest.id)
      .select()
      .single();

    if (updateError) {
      throw new AppError(updateError.message, 500);
    }

    logger.info('Change request updated', { requestId: existingRequest.id, userId });

    return res.json({
      success: true,
      data: updated,
      message: 'Existing change request updated',
    });
  }

  // Create new change request
  const { data: newRequest, error: insertError } = await supabaseAdmin
    .from('product_change_requests')
    .insert({
      product_id,
      requested_by: userId,
      changes,
      original_values: originalValues,
      status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    logger.error('Failed to create change request', { error: insertError });
    throw new AppError(insertError.message, 500);
  }

  logger.info('Change request created', { requestId: newRequest.id, userId, productId: product_id });

  res.status(201).json({
    success: true,
    data: newRequest,
    message: 'Change request submitted for approval',
  });
});

// =============================================================================
// GET CHANGE REQUEST DETAILS
// GET /api/v1/admin/products/change-requests/:id
// =============================================================================

export const getChangeRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const { data, error } = await supabaseAdmin
    .from('product_change_requests')
    .select(`
      id, product_id, requested_by, status, changes, original_values,
      rejection_reason, created_at, reviewed_at, updated_at,
      product:products(id, name, sku, images, price, cost_price, description, category),
      requester:users!requested_by(id, name, email, role),
      reviewer:users!reviewed_by(id, name, email)
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new AppError('Change request not found', 404);
  }

  // Non-admins can only see their own requests
  if (!['admin', 'manager'].includes(userRole) && data.requested_by !== userId) {
    throw new AppError('Forbidden', 403);
  }

  res.json({
    success: true,
    data,
  });
});

// =============================================================================
// APPROVE/REJECT CHANGE REQUEST
// PATCH /api/v1/admin/products/change-requests/:id
// =============================================================================

export const reviewChangeRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, rejection_reason } = req.body;
  const userId = req.user.id;

  // Validate action
  if (!action || !['approve', 'reject'].includes(action)) {
    throw new AppError('Action must be "approve" or "reject"', 400);
  }

  // Get the change request
  const { data: changeRequest, error: fetchError } = await supabaseAdmin
    .from('product_change_requests')
    .select('id, product_id, changes, status, requested_by')
    .eq('id', id)
    .single();

  if (fetchError || !changeRequest) {
    throw new AppError('Change request not found', 404);
  }

  if (changeRequest.status !== 'pending') {
    throw new AppError(`Request already ${changeRequest.status}`, 400);
  }

  if (action === 'approve') {
    // Apply changes to the product
    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update({
        ...changeRequest.changes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', changeRequest.product_id);

    if (updateError) {
      logger.error('Failed to apply product changes', { error: updateError });
      throw new AppError('Failed to apply changes to product', 500);
    }

    // Update change request status
    const { data: updated, error: statusError } = await supabaseAdmin
      .from('product_change_requests')
      .update({
        status: 'approved',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (statusError) {
      throw new AppError(statusError.message, 500);
    }

    logger.info('Change request approved', { 
      requestId: id, 
      productId: changeRequest.product_id, 
      reviewedBy: userId 
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Changes approved and applied to product',
    });
  } else {
    // Reject the request
    if (!rejection_reason) {
      throw new AppError('Rejection reason is required', 400);
    }

    const { data: updated, error: statusError } = await supabaseAdmin
      .from('product_change_requests')
      .update({
        status: 'rejected',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason,
      })
      .eq('id', id)
      .select()
      .single();

    if (statusError) {
      throw new AppError(statusError.message, 500);
    }

    logger.info('Change request rejected', { 
      requestId: id, 
      productId: changeRequest.product_id, 
      reviewedBy: userId,
      reason: rejection_reason 
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Change request rejected',
    });
  }
});

export default {
  listChangeRequests,
  createChangeRequest,
  getChangeRequest,
  reviewChangeRequest,
};
