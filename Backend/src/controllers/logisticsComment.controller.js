/**
 * Logistics Comment Controller
 * 
 * Handles 2-way communication with NCM/Gaau Besi logistics providers.
 * 
 * Features:
 * - Create comment (send to logistics provider API)
 * - List comments (fetch from DB + sync from API)
 * - Auto-sync incoming comments from logistics providers
 * 
 * @priority P0 - Logistics Comment Sync
 * @author Senior Backend Developer
 */

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import ncmService from '../services/logistics/NCMService.js';
import { GaauBesiProvider } from '../services/logistics/GaauBesiProvider.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('LogisticsCommentController');

// Initialize GBL provider for comment operations
const gblProvider = new GaauBesiProvider();

// =============================================================================
// CREATE COMMENT (Send to Logistics Provider)
// =============================================================================

/**
 * Create a new comment for an order and sync to logistics provider
 * 
 * POST /api/v1/logistics/comments
 * 
 * Body: {
 *   order_id: UUID,
 *   comment: string
 * }
 * 
 * Flow:
 * 1. Validate order exists and has external_order_id
 * 2. Save comment to DB (is_synced: false)
 * 3. Call NCMService.postComment()
 * 4. If success, update is_synced: true
 * 5. Return the comment
 */
export const createComment = asyncHandler(async (req, res) => {
  const { order_id, comment } = req.body;
  const userId = req.user?.id;

  // =========================================================================
  // Validation
  // =========================================================================
  if (!order_id) {
    throw new ValidationError('Order ID is required');
  }

  if (!comment || !comment.trim()) {
    throw new ValidationError('Comment text is required');
  }

  // =========================================================================
  // Get order details
  // =========================================================================
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, readable_id, external_order_id, is_logistics_synced, courier_partner')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    throw new NotFoundError('Order');
  }

  // Check if order is synced to logistics
  if (!order.is_logistics_synced || !order.external_order_id) {
    throw new ValidationError(
      'Order has not been synced to logistics provider. Please sync the order first.'
    );
  }

  // Determine provider
  const provider = _determineProvider(order.courier_partner);

  // =========================================================================
  // Save comment to DB (is_synced: false initially)
  // =========================================================================
  const { data: newComment, error: insertError } = await supabaseAdmin
    .from('logistics_comments')
    .insert({
      order_id,
      comment: comment.trim(),
      sender: 'ERP_USER',
      sender_name: req.user?.name || req.user?.email || 'Staff',
      provider,
      is_synced: false,
    })
    .select()
    .single();

  if (insertError) {
    logger.error('Failed to save comment to DB', { insertError, order_id });
    throw new AppError('Failed to save comment', 500);
  }

  console.log(`💬 [LogisticsComment] Comment saved to DB: ID ${newComment.id}`);

  // =========================================================================
  // Sync to logistics provider API
  // =========================================================================
  let syncResult = { success: false, error: null };

  try {
    if (provider === 'NCM') {
      const result = await ncmService.postComment(order.external_order_id, comment.trim());
      syncResult = {
        success: result.success,
        externalId: result.commentId,
      };
    } else if (provider === 'GBL') {
      // P0 FIX: Use GaauBesiProvider to post comment
      const result = await gblProvider.postOrderComment(order.external_order_id, comment.trim());
      syncResult = {
        success: result.success,
        message: result.message,
      };
      logger.info('GBL comment posted', { 
        orderId: order_id, 
        externalId: order.external_order_id,
        success: result.success 
      });
    }
  } catch (apiError) {
    logger.error('Failed to sync comment to provider', {
      error: apiError.message,
      order_id,
      provider,
    });
    syncResult = {
      success: false,
      error: apiError.message,
    };
  }

  // =========================================================================
  // Update comment sync status in DB
  // =========================================================================
  const updateData = {
    is_synced: syncResult.success,
    synced_at: syncResult.success ? new Date().toISOString() : null,
    external_id: syncResult.externalId || null,
    sync_error: syncResult.error || null,
  };

  const { error: updateError } = await supabaseAdmin
    .from('logistics_comments')
    .update(updateData)
    .eq('id', newComment.id);

  if (updateError) {
    logger.warn('Failed to update comment sync status', { updateError });
  }

  // =========================================================================
  // Return response
  // =========================================================================
  const responseComment = {
    ...newComment,
    ...updateData,
  };

  logger.info('Comment created', {
    commentId: newComment.id,
    orderId: order_id,
    synced: syncResult.success,
    provider,
  });

  res.status(201).json({
    success: true,
    message: syncResult.success 
      ? 'Comment sent to courier successfully' 
      : 'Comment saved but failed to sync to courier',
    data: responseComment,
    sync: {
      success: syncResult.success,
      error: syncResult.error,
    },
  });
});

// =============================================================================
// LIST COMMENTS (Fetch & Sync from Provider)
// =============================================================================

/**
 * List all comments for an order (with auto-sync from provider)
 * 
 * GET /api/v1/logistics/comments/:orderId
 * 
 * Flow:
 * 1. Get order external_order_id
 * 2. Fetch comments from NCM API
 * 3. Sync new comments from API to DB (sender: LOGISTICS_PROVIDER)
 * 4. Return all comments sorted by date
 */
export const listComments = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { refresh = 'true' } = req.query; // Default: sync from API

  if (!orderId) {
    throw new ValidationError('Order ID is required');
  }

  // =========================================================================
  // Get order details
  // =========================================================================
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, readable_id, external_order_id, is_logistics_synced, courier_partner')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new NotFoundError('Order');
  }

  const provider = _determineProvider(order.courier_partner);

  // =========================================================================
  // Optionally fetch & sync from provider API
  // =========================================================================
  let apiComments = [];
  let apiError = null;

  if (refresh === 'true' && order.is_logistics_synced && order.external_order_id) {
    try {
      if (provider === 'NCM') {
        const result = await ncmService.getComments(order.external_order_id);
        apiComments = result.comments || [];
      } else if (provider === 'GBL') {
        // P0 FIX: Fetch comments from GBL API
        // API Response: { success, comments: [{ created_by, created_on, comments, status }] }
        const result = await gblProvider.getOrderComments(order.external_order_id);
        if (result.success && result.comments) {
          // Transform GBL comments to our format using correct field names
          apiComments = result.comments.map(c => ({
            id: c.id?.toString(),
            text: c.comments || c.comment || c.message,  // GBL uses 'comments' field
            sender: _determineGBLCommentSender(c.created_by),  // GBL uses 'created_by' field
            sender_name: c.created_by || 'GBL Staff',
            created_at: c.created_on || c.created_at || c.date,  // GBL uses 'created_on' field
            raw: c,
          }));
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch comments from provider', {
        error: err.message,
        orderId,
        provider,
      });
      apiError = err.message;
    }
  }

  // =========================================================================
  // Sync new comments from API to DB
  // =========================================================================
  if (apiComments.length > 0) {
    await _syncApiCommentsToDb(orderId, apiComments, provider);
  }

  // =========================================================================
  // Fetch all comments from DB
  // =========================================================================
  const { data: dbComments, error: dbError } = await supabaseAdmin
    .from('logistics_comments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (dbError) {
    logger.error('Failed to fetch comments from DB', { dbError, orderId });
    throw new AppError('Failed to fetch comments', 500);
  }

  // =========================================================================
  // Return response
  // =========================================================================
  res.json({
    success: true,
    data: {
      comments: dbComments || [],
      order: {
        id: order.id,
        readable_id: order.readable_id,
        external_order_id: order.external_order_id,
        is_synced: order.is_logistics_synced,
        provider,
      },
    },
    sync: {
      refreshed: refresh === 'true',
      newCommentsFromApi: apiComments.length,
      error: apiError,
    },
  });
});

// =============================================================================
// RETRY SYNC (Retry failed comment sync)
// =============================================================================

/**
 * Retry syncing a failed comment to logistics provider
 * 
 * POST /api/v1/logistics/comments/:commentId/retry
 */
export const retrySync = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!commentId) {
    throw new ValidationError('Comment ID is required');
  }

  // Get comment with order details
  const { data: comment, error: commentError } = await supabaseAdmin
    .from('logistics_comments')
    .select(`
      *,
      order:orders(id, external_order_id, courier_partner)
    `)
    .eq('id', commentId)
    .single();

  if (commentError || !comment) {
    throw new NotFoundError('Comment');
  }

  // Only retry ERP_USER comments that failed sync
  if (comment.sender !== 'ERP_USER') {
    throw new ValidationError('Can only retry ERP-originated comments');
  }

  if (comment.is_synced) {
    return res.json({
      success: true,
      message: 'Comment is already synced',
      data: comment,
    });
  }

  const order = comment.order;
  if (!order?.external_order_id) {
    throw new ValidationError('Order not synced to logistics provider');
  }

  const provider = _determineProvider(order.courier_partner);

  // Attempt sync
  let syncResult = { success: false, error: null };

  try {
    if (provider === 'NCM') {
      const result = await ncmService.postComment(order.external_order_id, comment.comment);
      syncResult = {
        success: result.success,
        externalId: result.commentId,
      };
    } else if (provider === 'GBL') {
      // P0 FIX: Retry GBL comment sync
      const result = await gblProvider.postOrderComment(order.external_order_id, comment.comment);
      syncResult = {
        success: result.success,
        message: result.message,
      };
    }
  } catch (apiError) {
    syncResult = {
      success: false,
      error: apiError.message,
    };
  }

  // Update DB
  const { error: updateError } = await supabaseAdmin
    .from('logistics_comments')
    .update({
      is_synced: syncResult.success,
      synced_at: syncResult.success ? new Date().toISOString() : null,
      external_id: syncResult.externalId || null,
      sync_error: syncResult.error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', commentId);

  if (updateError) {
    logger.warn('Failed to update comment after retry', { updateError });
  }

  res.json({
    success: syncResult.success,
    message: syncResult.success ? 'Comment synced successfully' : 'Sync failed again',
    data: {
      ...comment,
      is_synced: syncResult.success,
      sync_error: syncResult.error,
    },
  });
});

// =============================================================================
// HELPER: Determine Provider from courier_partner
// =============================================================================

function _determineProvider(courierPartner) {
  if (!courierPartner) return 'UNKNOWN';
  
  const cp = courierPartner.toLowerCase();
  
  if (cp.includes('ncm') || cp.includes('nepal can move')) {
    return 'NCM';
  }
  
  if (cp.includes('gaau') || cp.includes('gbl') || cp.includes('besi')) {
    return 'GBL';
  }
  
  return 'UNKNOWN';
}

// =============================================================================
// HELPER: Determine GBL Comment Sender Type (Based on `created_by` field)
// =============================================================================

/**
 * Determine if a GBL comment is from logistics provider or our ERP user
 * 
 * GBL API Response Example:
 * {
 *   "created_by": "Gaaubesi Staff",  // → LOGISTICS_PROVIDER (gray bubble)
 *   "created_by": "Seetara",         // → ERP_USER (blue bubble - our vendor account)
 * }
 * 
 * @param {string} createdBy - The `created_by` field from GBL API
 * @returns {'ERP_USER' | 'LOGISTICS_PROVIDER'}
 */
function _determineGBLCommentSender(createdBy) {
  if (!createdBy) return 'LOGISTICS_PROVIDER';
  
  const author = createdBy.toLowerCase().trim();
  
  // =========================================================================
  // LOGISTICS_PROVIDER: Gaau Besi staff / system / admin comments (Gray bubble)
  // =========================================================================
  if (
    author.includes('gaaubesi') ||
    author.includes('gaau besi') ||
    author.includes('staff') ||
    author.includes('admin') ||
    author.includes('system') ||
    author.includes('courier') ||
    author.includes('rider') ||
    author.includes('delivery')
  ) {
    return 'LOGISTICS_PROVIDER';
  }
  
  // =========================================================================
  // ERP_USER: Our company / vendor account comments (Blue bubble)
  // =========================================================================
  if (
    author.includes('seetara') ||
    author.includes('today') ||
    author.includes('todaytrend') ||
    author.includes('vendor')
  ) {
    return 'ERP_USER';
  }
  
  // Default: Unknown author → assume logistics provider (safer for display)
  return 'LOGISTICS_PROVIDER';
}

// =============================================================================
// HELPER: Sync API Comments to DB
// =============================================================================

/**
 * Sync comments from logistics provider API to local DB
 * 
 * IMPORTANT: This function correctly identifies comment senders:
 * - NCM API returns addedBy field: "NCM Staff" (courier) or "Vendor" (our user)
 * - We use _determineCommentSender in NCMService to map this
 * - ERP_USER = Blue bubble (our comment)
 * - LOGISTICS_PROVIDER = Gray bubble (NCM/courier comment)
 * 
 * Only inserts new comments (checks by external_id or content hash)
 */
async function _syncApiCommentsToDb(orderId, apiComments, provider) {
  if (!apiComments || apiComments.length === 0) return;

  // Get existing comments to avoid duplicates
  const { data: existingComments } = await supabaseAdmin
    .from('logistics_comments')
    .select('id, external_id, comment, created_at')
    .eq('order_id', orderId);

  const existingIds = new Set((existingComments || []).map(c => c.external_id).filter(Boolean));
  const existingTexts = new Set((existingComments || []).map(c => c.comment));

  // Filter new comments (avoid duplicates)
  const newComments = apiComments.filter(c => {
    // Skip if we already have this external_id
    if (c.id && existingIds.has(String(c.id))) {
      console.log(`💬 [LogisticsComment] Skipping duplicate (external_id: ${c.id})`);
      return false;
    }
    // Skip if exact same text already exists (fallback dedup)
    if (existingTexts.has(c.text)) {
      console.log(`💬 [LogisticsComment] Skipping duplicate (same text: "${c.text?.substring(0, 30)}...")`);
      return false;
    }
    return true;
  });

  if (newComments.length === 0) {
    console.log(`💬 [LogisticsComment] No new comments from API to sync`);
    return;
  }

  console.log(`💬 [LogisticsComment] Syncing ${newComments.length} new comments from ${provider}`);

  // Insert new comments with correct sender identification
  const inserts = newComments.map(c => {
    // c.sender is already determined by NCMService._determineCommentSender()
    // It checks the addedBy field: "NCM Staff" -> LOGISTICS_PROVIDER, "Vendor"/company -> ERP_USER
    const senderType = c.sender || 'LOGISTICS_PROVIDER'; // Default to logistics if not determined
    const senderName = c.sender_name || c.raw?.addedBy || c.raw?.user || c.raw?.created_by || null;
    
    console.log(`💬 [LogisticsComment] Comment "${c.text?.substring(0, 30)}..." from: ${senderType} (${senderName})`);
    
    return {
      order_id: orderId,
      comment: c.text,
      sender: senderType, // 'ERP_USER' (blue bubble) or 'LOGISTICS_PROVIDER' (gray bubble)
      sender_name: senderName,
      external_id: c.id ? String(c.id) : null,
      provider,
      is_synced: true, // Already from API, so "synced"
      synced_at: new Date().toISOString(),
      created_at: c.created_at || new Date().toISOString(),
    };
  });

  const { error: insertError } = await supabaseAdmin
    .from('logistics_comments')
    .insert(inserts);

  if (insertError) {
    logger.error('Failed to insert API comments to DB', { insertError, orderId });
  } else {
    logger.info(`Synced ${inserts.length} comments from ${provider} API`, { 
      orderId,
      comments: inserts.map(c => ({ sender: c.sender, text: c.comment?.substring(0, 30) })),
    });
  }
}

// =============================================================================
// EXPORT
// =============================================================================

export default {
  createComment,
  listComments,
  retrySync,
};
