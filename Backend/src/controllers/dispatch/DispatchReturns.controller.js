/**
 * Dispatch Returns Controller
 * 
 * Handles: RTO Logic, Return Verification, QC Processing, Inventory Restoration
 * 
 * P1 REFACTOR: Split from monolithic dispatch.controller.js (4900+ lines)
 * 
 * @module DispatchReturns
 */

import ManifestService from '../../services/dispatch/ManifestService.js';
import { ReturnsService } from '../../services/dispatch/ReturnsService.js';
import { supabaseAdmin } from '../../config/supabase.js';
import logger from '../../utils/logger.js';

const LOG_PREFIX = '[DispatchReturns]';

// ============================================================================
// LEGACY RETURN ENDPOINTS
// ============================================================================

/**
 * POST /dispatch/manifests/:id/return
 * Process returned item (restore inventory)
 */
export async function processReturn(req, res, next) {
  try {
    const { id } = req.params;
    const { order_id, return_type = 'good', damage_notes } = req.body;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    if (!['good', 'damaged'].includes(return_type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Return type must be "good" or "damaged"' 
      });
    }

    const result = await ManifestService.processReturn({
      manifestId: id,
      orderId: order_id,
      returnType: return_type,
      damageNotes: damage_notes
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const msg = return_type === 'good' 
      ? 'Return processed - inventory restored'
      : 'Return processed - marked as damaged';

    res.json({
      success: true,
      message: msg
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} processReturn error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/manifests/:id/reschedule
 * Reschedule order (remove from manifest, back to sorting floor)
 */
export async function rescheduleOrder(req, res, next) {
  try {
    const { id } = req.params;
    const { order_id, reschedule_date, notes } = req.body;

    if (!order_id || !reschedule_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID and reschedule date are required' 
      });
    }

    const result = await ManifestService.rescheduleOrder({
      manifestId: id,
      orderId: order_id,
      rescheduleDate: reschedule_date,
      notes
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Order rescheduled for ${reschedule_date}`
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} rescheduleOrder error`, { error: error.message });
    next(error);
  }
}

// ============================================================================
// RETURN SETTLEMENT (P0: Unified Return Logistics)
// ============================================================================

/**
 * GET /dispatch/pending-returns
 * Get pending returns for a rider (for Settlement UI)
 */
export async function getPendingReturns(req, res, next) {
  try {
    const { rider_id, date } = req.query;

    if (!rider_id) {
      return res.status(400).json({ success: false, message: 'Rider ID is required' });
    }

    const { data, error } = await supabaseAdmin.rpc('get_pending_returns_for_rider', {
      p_rider_id: rider_id,
      p_date: date || new Date().toISOString().split('T')[0]
    });

    if (error) {
      logger.error(`${LOG_PREFIX} getPendingReturns error`, { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      data: data || [],
      count: (data || []).length
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getPendingReturns error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/courier-returns
 * Get courier returns for Outside Valley (bulk returns via logistics)
 */
export async function getCourierReturns(req, res, next) {
  try {
    const { courier_partner, date_from, date_to } = req.query;

    const { data, error } = await supabaseAdmin.rpc('get_courier_returns', {
      p_courier_partner: courier_partner || null,
      p_date_from: date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      p_date_to: date_to || new Date().toISOString().split('T')[0]
    });

    if (error) {
      logger.error(`${LOG_PREFIX} getCourierReturns error`, { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      data: data || [],
      count: (data || []).length
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getCourierReturns error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/settle-return
 * Settle a return at the Hub (P0: The critical endpoint)
 * Stock is ONLY added when physically verified at Hub via this endpoint.
 */
export async function settleReturn(req, res, next) {
  try {
    const { order_item_id, condition, notes } = req.body;

    if (!order_item_id) {
      return res.status(400).json({ success: false, message: 'Order item ID is required' });
    }

    if (!condition || !['good', 'damaged', 'missing'].includes(condition)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Condition is required and must be: good, damaged, or missing' 
      });
    }

    logger.info(`${LOG_PREFIX} settleReturn called`, { order_item_id, condition, notes });

    const { data, error } = await supabaseAdmin.rpc('settle_return_at_hub', {
      p_order_item_id: order_item_id,
      p_condition: condition,
      p_settled_by: req.user?.id || null,
      p_notes: notes || null
    });

    if (error) {
      logger.error(`${LOG_PREFIX} settleReturn RPC error`, { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }

    if (!data?.success) {
      return res.status(400).json({ success: false, message: data?.error || 'Settlement failed' });
    }

    const activityMsg = condition === 'good'
      ? `Return physically received at Hub. Stock +${data.quantity} added.`
      : condition === 'damaged'
      ? `Return received DAMAGED. Not added to sellable stock.`
      : `Return marked as MISSING. No stock added.`;

    logger.info(`${LOG_PREFIX} Return settled successfully`, {
      settlement_id: data.settlement_id,
      condition,
      stock_added: data.stock_added,
      new_stock: data.new_stock
    });

    res.json({
      success: true,
      message: activityMsg,
      data: {
        settlement_id: data.settlement_id,
        condition: data.condition,
        stock_added: data.stock_added,
        quantity: data.quantity,
        new_stock: data.new_stock
      }
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} settleReturn error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/settle-returns-bulk
 * Settle multiple returns at once (batch processing)
 */
export async function settleReturnsBulk(req, res, next) {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'items array is required with at least one item' 
      });
    }

    logger.info(`${LOG_PREFIX} settleReturnsBulk called`, { itemCount: items.length });

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const item of items) {
      const { order_item_id, condition, notes } = item;
      
      if (!order_item_id || !condition) {
        results.push({ order_item_id, success: false, error: 'Missing required fields' });
        failCount++;
        continue;
      }

      const { data, error } = await supabaseAdmin.rpc('settle_return_at_hub', {
        p_order_item_id: order_item_id,
        p_condition: condition,
        p_settled_by: req.user?.id || null,
        p_notes: notes || null
      });

      if (error || !data?.success) {
        results.push({ 
          order_item_id, 
          success: false, 
          error: error?.message || data?.error || 'Settlement failed' 
        });
        failCount++;
      } else {
        results.push({ 
          order_item_id, 
          success: true, 
          stock_added: data.stock_added 
        });
        successCount++;
      }
    }

    res.json({
      success: true,
      message: `Bulk settlement complete: ${successCount} succeeded, ${failCount} failed`,
      summary: { successCount, failCount },
      results
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} settleReturnsBulk error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/mark-picked-up
 * Mark return item as picked up by rider
 */
export async function markPickedUp(req, res, next) {
  try {
    const { order_item_id, rider_id } = req.body;

    if (!order_item_id) {
      return res.status(400).json({ success: false, message: 'Order item ID is required' });
    }

    logger.info(`${LOG_PREFIX} markPickedUp called`, { order_item_id, rider_id });

    const { data, error } = await supabaseAdmin
      .from('order_items')
      .update({
        return_status: 'picked_up',
        picked_up_at: new Date().toISOString(),
        picked_up_by: rider_id || req.user?.id
      })
      .eq('id', order_item_id)
      .select('id, return_status')
      .single();

    if (error) {
      logger.error(`${LOG_PREFIX} markPickedUp error`, { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      message: 'Item marked as picked up by rider',
      data
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} markPickedUp error`, { error: error.message });
    next(error);
  }
}

// ============================================================================
// COURIER OPERATIONS
// ============================================================================

/**
 * POST /dispatch/courier-order-status
 * Update courier order status
 */
export async function updateCourierOrderStatus(req, res, next) {
  try {
    const { order_id, status, notes, tracking_updates } = req.body;

    if (!order_id || !status) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID and status are required' 
      });
    }

    const result = await ManifestService.updateCourierOrderStatus({
      orderId: order_id,
      status,
      notes,
      trackingUpdates: tracking_updates,
      updatedBy: req.user?.id
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} updateCourierOrderStatus error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/courier-rto
 * Get RTO (Return to Origin) orders
 */
export async function getCourierRTOOrders(req, res, next) {
  try {
    const { courier_partner, limit = 50 } = req.query;

    const result = await ManifestService.getCourierRTOOrders({
      courierPartner: courier_partner || undefined,
      limit: parseInt(limit) || 50
    });

    res.json({
      success: true,
      data: result.orders || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getCourierRTOOrders error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

// ============================================================================
// DISPATCH CENTER V2 RETURNS
// ============================================================================

/**
 * POST /dispatch/process-return/:orderId
 * Process return (add inventory back) - V2
 */
export async function processReturnV2(req, res, next) {
  try {
    const { orderId } = req.params;
    const { condition = 'good', notes } = req.body;

    logger.info(`${LOG_PREFIX} processReturnV2 called`, { orderId, condition });

    const result = await ManifestService.processReturnV2({
      orderId,
      condition,
      notes,
      processedBy: req.user?.id
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: condition === 'good' 
        ? 'Return processed - inventory restored'
        : 'Return processed - marked as damaged',
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} processReturnV2 error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/qc-return/:orderId
 * Process return with QC
 */
export async function processReturnWithQC(req, res, next) {
  try {
    const { orderId } = req.params;
    const { condition, damage_notes, items } = req.body;

    logger.info(`${LOG_PREFIX} processReturnWithQC called`, { orderId, condition });

    const result = await ManifestService.processReturnWithQC({
      orderId,
      condition,
      damageNotes: damage_notes,
      items,
      processedBy: req.user?.id
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: 'Return processed with QC verification',
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} processReturnWithQC error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/rto-orders
 * Get RTO orders (return to origin)
 */
export async function getRTOOrders(req, res, next) {
  try {
    const { fulfillment_type, limit = 100 } = req.query;

    logger.info(`${LOG_PREFIX} getRTOOrders called`, { fulfillment_type });

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, readable_id, status,
        shipping_name, shipping_phone, shipping_address, shipping_city,
        total_amount, payable_amount, payment_method,
        courier_partner, external_order_id,
        logistics_status, courier_raw_status,
        created_at, updated_at
      `)
      .in('status', ['rto_initiated', 'rto_in_transit', 'rto_verification_pending', 'returned'])
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      logger.error(`${LOG_PREFIX} getRTOOrders error`, { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }

    res.json({
      success: true,
      data: orders || [],
      count: (orders || []).length
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRTOOrders error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

// ============================================================================
// RETURNS MANAGEMENT V4 (Full System)
// ============================================================================

/**
 * GET /dispatch/returns/pending
 * Get all pending returns (rejected items still with riders)
 */
export async function getPendingReturnsV4(req, res) {
  try {
    logger.info(`${LOG_PREFIX} getPendingReturnsV4 called`);
    
    const pendingReturns = await ReturnsService.getPendingReturns();
    
    res.json({
      success: true,
      data: pendingReturns,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getPendingReturnsV4 error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/returns/stats
 * Get returns statistics
 */
export async function getReturnsStats(req, res) {
  try {
    logger.info(`${LOG_PREFIX} getReturnsStats called`);
    
    const stats = await ReturnsService.getReturnsStats();
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getReturnsStats error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/returns
 * Get all returns with filters
 */
export async function getAllReturns(req, res) {
  try {
    const { limit = 50, offset = 0, days = 7, status, rider_id } = req.query;
    
    logger.info(`${LOG_PREFIX} getAllReturns called`, { limit, days, status });
    
    const result = await ReturnsService.getAllReturns({
      limit: parseInt(limit),
      offset: parseInt(offset),
      days: parseInt(days),
      status,
      riderId: rider_id,
    });
    
    res.json({
      success: true,
      data: result.returns,
      total: result.total,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getAllReturns error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/returns/:id
 * Get return details with items
 */
export async function getReturnDetails(req, res) {
  try {
    const { id } = req.params;
    
    logger.info(`${LOG_PREFIX} getReturnDetails called`, { id });
    
    const returnData = await ReturnsService.getReturnDetails(id);
    
    res.json({
      success: true,
      data: returnData,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getReturnDetails error`, { error: error.message });
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/riders/:riderId/pending-returns
 * Get pending returns for a specific rider
 */
export async function getRiderPendingReturns(req, res) {
  try {
    const { riderId } = req.params;
    
    logger.info(`${LOG_PREFIX} getRiderPendingReturns called`, { riderId });
    
    const orders = await ReturnsService.getRiderPendingReturns(riderId);
    
    res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRiderPendingReturns error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/returns
 * Create a return handover (receive items from rider)
 */
export async function createReturnHandover(req, res) {
  try {
    const { rider_id, order_ids, notes } = req.body;
    const received_by = req.user?.id;
    
    logger.info(`${LOG_PREFIX} createReturnHandover called`, { rider_id, order_ids_count: order_ids?.length });
    
    if (!rider_id || !order_ids || order_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'rider_id and order_ids are required' });
    }
    
    const result = await ReturnsService.createReturn({
      rider_id,
      order_ids,
      notes,
      received_by,
    });
    
    res.json({
      success: true,
      message: `Return ${result.return_number} created with ${result.items_count} items`,
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createReturnHandover error`, { error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/returns/:id/process
 * Mark return as processed
 */
export async function processReturnHandover(req, res) {
  try {
    const { id } = req.params;
    const processed_by = req.user?.id;
    
    logger.info(`${LOG_PREFIX} processReturnHandover called`, { id });
    
    const result = await ReturnsService.processReturn(id, processed_by);
    
    res.json({
      success: true,
      message: 'Return processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} processReturnHandover error`, { error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * PATCH /dispatch/returns/items/:itemId
 * Update return item condition/action
 */
export async function updateReturnItem(req, res) {
  try {
    const { itemId } = req.params;
    const { condition, damage_notes, action_taken, action_notes } = req.body;
    const action_by = req.user?.id;
    
    logger.info(`${LOG_PREFIX} updateReturnItem called`, { itemId, condition, action_taken });
    
    const result = await ReturnsService.updateReturnItem(itemId, {
      condition,
      damage_notes,
      action_taken,
      action_notes,
      action_by,
    });
    
    res.json({
      success: true,
      message: 'Return item updated',
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} updateReturnItem error`, { error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
}

// ============================================================================
// RTO SCANNER ENDPOINTS (Return Verification)
// ============================================================================

/**
 * GET /dispatch/rto/pending
 * Get orders pending RTO verification
 */
export async function getRTOPendingOrders(req, res, next) {
  try {
    logger.info(`${LOG_PREFIX} getRTOPendingOrders`);

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, readable_id, order_number,
        shipping_name, customer_name, shipping_phone,
        destination_branch, external_order_id,
        logistics_provider, courier_partner,
        logistics_status, courier_raw_status,
        rto_initiated_at, rto_reason,
        payable_amount, total_amount, status,
        created_at, updated_at
      `)
      .in('status', ['rto_initiated', 'rto_verification_pending'])
      .order('rto_initiated_at', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: true });

    if (error) {
      logger.error(`${LOG_PREFIX} getRTOPendingOrders error`, { error });
      return res.status(500).json({ success: false, message: error.message });
    }

    const ordersWithDays = (orders || []).map(order => {
      const initiatedAt = order.rto_initiated_at || order.updated_at;
      const daysPending = initiatedAt 
        ? Math.floor((Date.now() - new Date(initiatedAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      return {
        ...order,
        days_pending_verification: daysPending,
        courier_tracking: order.external_order_id,
      };
    });

    res.json({
      success: true,
      data: ordersWithDays,
      count: ordersWithDays.length,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRTOPendingOrders error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/rto/verify
 * Verify RTO return at warehouse - marks order as RETURNED
 * 
 * P0 FIX: Auto-restore stock for GOOD condition returns (Audit Finding 4.4)
 */
export async function verifyRTOReturn(req, res, next) {
  try {
    const { scan_value, condition = 'GOOD', notes } = req.body;
    const userId = req.user?.id;

    logger.info(`${LOG_PREFIX} verifyRTOReturn`, { scan_value, condition, userId });

    if (!scan_value) {
      return res.status(400).json({
        success: false,
        message: 'scan_value is required (Order ID or Tracking ID)',
      });
    }

    const validConditions = ['GOOD', 'DAMAGED', 'MISSING_ITEMS', 'TAMPERED', 'UNKNOWN'];
    if (!validConditions.includes(condition)) {
      return res.status(400).json({
        success: false,
        message: `Invalid condition. Use: ${validConditions.join(', ')}`,
      });
    }

    const { data: orders, error: findError } = await supabaseAdmin
      .from('orders')
      .select('id, readable_id, order_number, status, external_order_id, fulfillment_type')
      .or(`readable_id.ilike.%${scan_value}%,order_number.ilike.%${scan_value}%,external_order_id.eq.${scan_value}`)
      .in('status', ['rto_initiated', 'rto_verification_pending'])
      .limit(1);

    if (findError) {
      logger.error(`${LOG_PREFIX} verifyRTOReturn find error`, { error: findError });
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not pending verification',
      });
    }

    const order = orders[0];

    if (!['rto_initiated', 'rto_verification_pending'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be verified from status: ${order.status}`,
      });
    }

    // =========================================================================
    // P0 FIX: Auto-restore stock for GOOD condition returns (Audit Finding 4.4)
    // =========================================================================
    let stockRestoreResult = null;
    if (condition === 'GOOD') {
      try {
        // Try using the atomic RPC first
        const { data: rpcResult, error: rpcError } = await supabaseAdmin
          .rpc('restore_stock_return_atomic', {
            p_order_id: order.id,
            p_restored_by: userId,
            p_notes: `RTO verified - GOOD condition${notes ? `: ${notes}` : ''}`,
          });

        if (rpcError) {
          logger.warn(`${LOG_PREFIX} RPC restore_stock_return_atomic failed, using fallback`, { 
            error: rpcError.message 
          });
          
          // Fallback: Manual stock restoration
          const { data: orderItems } = await supabaseAdmin
            .from('order_items')
            .select('variant_id, quantity, sku, product_name')
            .eq('order_id', order.id);

          if (orderItems && orderItems.length > 0) {
            const restoredItems = [];
            for (const item of orderItems) {
              if (!item.variant_id) continue;

              const { data: variant } = await supabaseAdmin
                .from('product_variants')
                .select('current_stock')
                .eq('id', item.variant_id)
                .single();

              if (variant) {
                const newStock = (variant.current_stock || 0) + item.quantity;
                
                await supabaseAdmin
                  .from('product_variants')
                  .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                  .eq('id', item.variant_id);

                // Log stock movement
                await supabaseAdmin.from('stock_movements').insert({
                  variant_id: item.variant_id,
                  movement_type: 'RETURN',
                  quantity: item.quantity,
                  balance_before: variant.current_stock,
                  balance_after: newStock,
                  order_id: order.id,
                  source: 'rto_verification',
                  reason: `RTO verified GOOD - Order ${order.readable_id}`,
                  created_by: userId,
                });

                restoredItems.push({ sku: item.sku, quantity: item.quantity });
              }
            }
            stockRestoreResult = { success: true, items: restoredItems };
            logger.info(`${LOG_PREFIX} Stock restored manually`, { 
              orderId: order.id, 
              itemsRestored: restoredItems.length 
            });
          }
        } else {
          stockRestoreResult = rpcResult;
          logger.info(`${LOG_PREFIX} Stock restored via RPC`, { orderId: order.id, result: rpcResult });
        }
      } catch (stockError) {
        logger.error(`${LOG_PREFIX} Stock restoration failed`, { 
          orderId: order.id, 
          error: stockError.message 
        });
        // Don't fail the verification, just log the error
        stockRestoreResult = { success: false, error: stockError.message };
      }
    } else {
      logger.info(`${LOG_PREFIX} Stock NOT restored - condition: ${condition}`, { orderId: order.id });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'returned',
        return_received_at: now,
        return_condition: condition,
        return_verified_by: userId,
        return_notes: notes,
        stock_restored: condition === 'GOOD',
        updated_at: now,
      })
      .eq('id', order.id);

    if (updateError) {
      logger.error(`${LOG_PREFIX} verifyRTOReturn update error`, { error: updateError });
      return res.status(500).json({ success: false, message: 'Failed to update order' });
    }

    // Log activity
    try {
      const stockMsg = condition === 'GOOD' 
        ? ` Stock ${stockRestoreResult?.success ? 'restored successfully' : 'restoration attempted'}.`
        : ' Stock NOT restored (non-GOOD condition).';
      
      await supabaseAdmin.from('order_activities').insert({
        order_id: order.id,
        type: 'status_change',
        message: `Return verified at warehouse. Condition: ${condition}${notes ? ` - ${notes}` : ''}${stockMsg}`,
        metadata: {
          from_status: order.status,
          to_status: 'returned',
          condition,
          notes,
          verified_by: userId,
          stock_restored: condition === 'GOOD',
          stock_restore_result: stockRestoreResult,
        },
        created_by: userId || 'system',
      });
    } catch (activityError) {
      logger.warn(`${LOG_PREFIX} Failed to log activity`, { error: activityError.message });
    }

    logger.info(`${LOG_PREFIX} RTO verified successfully`, {
      orderId: order.id,
      readableId: order.readable_id,
      condition,
      stockRestored: condition === 'GOOD',
    });

    res.json({
      success: true,
      message: condition === 'GOOD' 
        ? 'RTO verified successfully. Order marked as RETURNED. Stock restored.'
        : 'RTO verified successfully. Order marked as RETURNED. Stock NOT restored due to condition.',
      order_id: order.id,
      readable_id: order.readable_id,
      order_number: order.order_number,
      condition,
      stock_restored: condition === 'GOOD',
      stock_restore_result: stockRestoreResult,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} verifyRTOReturn error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/rto/mark-lost
 * Mark order as LOST_IN_TRANSIT for courier disputes
 */
export async function markRTOLost(req, res, next) {
  try {
    const { order_id, notes } = req.body;
    const userId = req.user?.id;

    logger.info(`${LOG_PREFIX} markRTOLost`, { order_id, userId });

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'order_id is required',
      });
    }

    const { data: order, error: findError } = await supabaseAdmin
      .from('orders')
      .select('id, readable_id, status, external_order_id, logistics_provider')
      .eq('id', order_id)
      .single();

    if (findError || !order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    const validStatuses = ['rto_initiated', 'rto_verification_pending', 'in_transit', 'handover_to_courier'];
    if (!validStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be marked as lost from status: ${order.status}`,
      });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'lost_in_transit',
        return_notes: notes ? `MARKED LOST: ${notes}` : 'MARKED LOST: No reason provided',
        updated_at: now,
      })
      .eq('id', order_id);

    if (updateError) {
      logger.error(`${LOG_PREFIX} markRTOLost update error`, { error: updateError });
      return res.status(500).json({ success: false, message: 'Failed to update order' });
    }

    // Log activity
    try {
      await supabaseAdmin.from('order_activities').insert({
        order_id: order_id,
        type: 'status_change',
        message: `Order marked as LOST IN TRANSIT for courier dispute${notes ? `: ${notes}` : ''}`,
        metadata: {
          from_status: order.status,
          to_status: 'lost_in_transit',
          notes,
          courier_tracking: order.external_order_id,
          logistics_provider: order.logistics_provider,
        },
        created_by: userId || 'system',
      });
    } catch (activityError) {
      logger.warn(`${LOG_PREFIX} Failed to log activity`, { error: activityError.message });
    }

    logger.warn(`${LOG_PREFIX} Order marked as LOST`, {
      orderId: order_id,
      readableId: order.readable_id,
      courierTracking: order.external_order_id,
    });

    res.json({
      success: true,
      message: 'Order marked as LOST IN TRANSIT. Open dispute with courier.',
      order_id: order_id,
      readable_id: order.readable_id,
      courier_tracking: order.external_order_id,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} markRTOLost error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Legacy Returns
  processReturn,
  rescheduleOrder,
  // Return Settlement
  getPendingReturns,
  getCourierReturns,
  settleReturn,
  settleReturnsBulk,
  markPickedUp,
  // Courier Operations
  updateCourierOrderStatus,
  getCourierRTOOrders,
  // Dispatch V2 Returns
  processReturnV2,
  processReturnWithQC,
  getRTOOrders,
  // Returns Management V4
  getPendingReturnsV4,
  getReturnsStats,
  getAllReturns,
  getReturnDetails,
  getRiderPendingReturns,
  createReturnHandover,
  processReturnHandover,
  updateReturnItem,
  // RTO Scanner
  getRTOPendingOrders,
  verifyRTOReturn,
  markRTOLost,
};
