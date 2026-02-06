/**
 * Dispatch Logistics Controller
 * 
 * Handles: NCM Integration, Gaau Besi Integration, Unified Logistics Sync
 * 
 * P1 REFACTOR: Split from monolithic dispatch.controller.js (4900+ lines)
 * 
 * @module DispatchLogistics
 */

import { supabaseAdmin } from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import logisticsOrderService from '../../services/logistics/LogisticsOrderService.js';

const LOG_PREFIX = '[DispatchLogistics]';

// ============================================================================
// GAAU BESI INTEGRATION
// ============================================================================

/**
 * GET /dispatch/gaaubesi/master-data
 * Get cached Gaau Besi master data (branches with pricing)
 */
export async function getGaauBesiMasterData(req, res, next) {
  try {
    const { getCachedGaauBesiData, syncGaauBesiData } = await import('../../jobs/gaauBesiSync.job.js');
    
    try {
      const data = await getCachedGaauBesiData();
      res.json({
        success: true,
        ...data,
      });
    } catch (cacheError) {
      logger.info(`${LOG_PREFIX} Gaau Besi cache miss, triggering sync...`);
      await syncGaauBesiData();
      
      const data = await getCachedGaauBesiData();
      res.json({
        success: true,
        ...data,
      });
    }
  } catch (error) {
    logger.error(`${LOG_PREFIX} getGaauBesiMasterData error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/gaaubesi/sync
 * Manually trigger Gaau Besi data sync (admin only)
 */
export async function triggerGaauBesiSync(req, res, next) {
  try {
    const { syncGaauBesiData } = await import('../../jobs/gaauBesiSync.job.js');
    
    logger.info(`${LOG_PREFIX} Manual Gaau Besi sync triggered by ${req.user?.email}`);
    
    const result = await syncGaauBesiData();
    
    res.json({
      success: result.success,
      message: result.success ? 'Gaau Besi sync completed successfully' : 'Sync failed',
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} triggerGaauBesiSync error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/gaaubesi/branches
 * Get available Gaau Besi destination branches with delivery rates
 */
export async function getGaauBesiBranches(req, res, next) {
  try {
    const { GaauBesiProvider } = await import('../../services/logistics/GaauBesiProvider.js');
    const provider = new GaauBesiProvider();
    
    const branches = await provider.getBranchesWithRates();
    
    res.json({
      success: true,
      data: branches,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getGaauBesiBranches error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/gaaubesi/create-order
 * Create order in Gaau Besi system and get tracking ID
 */
export async function createGaauBesiOrder(req, res, next) {
  try {
    const { order_id, destination_branch } = req.body;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'order_id is required' });
    }
    if (!destination_branch) {
      return res.status(400).json({ success: false, message: 'destination_branch is required' });
    }

    logger.info(`${LOG_PREFIX} createGaauBesiOrder`, { order_id, destination_branch });

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers(name, phone, email, address_line1, city),
        items:order_items(product_name, variant_name, quantity, unit_price)
      `)
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const { GaauBesiProvider } = await import('../../services/logistics/GaauBesiProvider.js');
    const gaauBesi = new GaauBesiProvider();

    const result = await gaauBesi.pushOrder(order, { destinationBranch: destination_branch });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message || 'Failed to create order in Gaau Besi' });
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        courier_partner: 'Gaau Besi',
        courier_tracking_id: result.trackingId,
        awb_number: result.trackingId,
        destination_branch: destination_branch,
        status: 'handover_to_courier',
        handover_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id);

    if (updateError) {
      logger.error(`${LOG_PREFIX} Failed to update order after Gaau Besi creation`, { error: updateError.message });
    }

    logger.info(`${LOG_PREFIX} Gaau Besi order created`, { order_id, tracking_id: result.trackingId });

    res.json({
      success: true,
      message: 'Order created in Gaau Besi successfully',
      data: {
        tracking_id: result.trackingId,
        awb_number: result.trackingId,
        destination_branch,
      },
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createGaauBesiOrder error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/gaaubesi/create-orders-bulk
 * Create multiple orders in Gaau Besi system
 */
export async function createGaauBesiOrdersBulk(req, res, next) {
  try {
    const { order_ids, destination_branch } = req.body;

    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'order_ids array is required' });
    }
    if (!destination_branch) {
      return res.status(400).json({ success: false, message: 'destination_branch is required' });
    }

    logger.info(`${LOG_PREFIX} createGaauBesiOrdersBulk`, { count: order_ids.length, destination_branch });

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers(name, phone, email, address_line1, city),
        items:order_items(product_name, variant_name, quantity, unit_price)
      `)
      .in('id', order_ids);

    if (ordersError || !orders?.length) {
      return res.status(404).json({ success: false, message: 'No orders found' });
    }

    const { GaauBesiProvider } = await import('../../services/logistics/GaauBesiProvider.js');
    const gaauBesi = new GaauBesiProvider();

    const results = { success: [], failed: [] };

    for (const order of orders) {
      try {
        const result = await gaauBesi.pushOrder(order, { destinationBranch: destination_branch });
        
        if (result.success) {
          await supabaseAdmin
            .from('orders')
            .update({
              courier_partner: 'Gaau Besi',
              courier_tracking_id: result.trackingId,
              awb_number: result.trackingId,
              destination_branch: destination_branch,
              status: 'handover_to_courier',
              handover_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);

          results.success.push({
            order_id: order.id,
            readable_id: order.readable_id,
            tracking_id: result.trackingId,
          });
        } else {
          results.failed.push({
            order_id: order.id,
            readable_id: order.readable_id,
            error: result.message,
          });
        }
      } catch (err) {
        results.failed.push({
          order_id: order.id,
          readable_id: order.readable_id,
          error: err.message,
        });
      }
    }

    logger.info(`${LOG_PREFIX} Gaau Besi bulk order creation completed`, { 
      success: results.success.length, 
      failed: results.failed.length 
    });

    res.json({
      success: true,
      message: `Created ${results.success.length} orders, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createGaauBesiOrdersBulk error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/gaaubesi/track/:trackingId
 * Get tracking status from Gaau Besi
 */
export async function getGaauBesiTracking(req, res, next) {
  try {
    const { trackingId } = req.params;

    if (!trackingId) {
      return res.status(400).json({ success: false, message: 'trackingId is required' });
    }

    const { GaauBesiProvider } = await import('../../services/logistics/GaauBesiProvider.js');
    const gaauBesi = new GaauBesiProvider();

    const status = await gaauBesi.pullStatus(trackingId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getGaauBesiTracking error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================================================
// NCM (NEPAL CAN MOVE) INTEGRATION
// ============================================================================

/**
 * GET /dispatch/ncm/branches
 * Get available NCM destination branches
 */
export async function getNCMBranches(req, res, next) {
  try {
    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    const branches = await ncmService.getBranches();
    
    res.json({
      success: true,
      data: branches,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getNCMBranches error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/ncm/create-order
 * Create order in NCM system
 */
export async function createNCMOrder(req, res, next) {
  try {
    const { order_id, delivery_type = 'D2D', destination_branch } = req.body;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'order_id is required' });
    }

    logger.info(`${LOG_PREFIX} createNCMOrder`, { order_id, delivery_type, destination_branch });

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers(name, phone, email, address_line1, city),
        items:order_items(product_name, variant_name, quantity, unit_price),
        order_source:order_sources(id, name)
      `)
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    const result = await ncmService.createOrder(order, {
      deliveryType: delivery_type,
      destinationBranch: destination_branch,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message || 'Failed to create NCM order' });
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        logistics_provider: 'ncm',
        external_order_id: result.trackingId,
        destination_branch: destination_branch,
        is_logistics_synced: true,
        logistics_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id);

    if (updateError) {
      logger.error(`${LOG_PREFIX} Failed to update order after NCM creation`, { error: updateError.message });
    }

    logger.info(`${LOG_PREFIX} NCM order created`, { order_id, tracking_id: result.trackingId });

    res.json({
      success: true,
      message: 'Order created in NCM successfully',
      data: {
        tracking_id: result.trackingId,
        destination_branch,
      },
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createNCMOrder error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/ncm/create-orders-bulk
 * Create multiple orders in NCM system
 */
export async function createNCMOrdersBulk(req, res, next) {
  try {
    const { order_ids, delivery_type = 'D2D', destination_branch } = req.body;

    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'order_ids array is required' });
    }

    logger.info(`${LOG_PREFIX} createNCMOrdersBulk`, { count: order_ids.length, delivery_type });

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers(name, phone, email, address_line1, city),
        items:order_items(product_name, variant_name, quantity, unit_price),
        order_source:order_sources(id, name)
      `)
      .in('id', order_ids);

    if (ordersError || !orders?.length) {
      return res.status(404).json({ success: false, message: 'No orders found' });
    }

    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    const results = { success: [], failed: [] };

    for (const order of orders) {
      try {
        const result = await ncmService.createOrder(order, {
          deliveryType: delivery_type,
          destinationBranch: destination_branch || order.destination_branch,
        });

        if (result.success) {
          await supabaseAdmin
            .from('orders')
            .update({
              logistics_provider: 'ncm',
              external_order_id: result.trackingId,
              is_logistics_synced: true,
              logistics_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);

          results.success.push({
            order_id: order.id,
            readable_id: order.readable_id,
            tracking_id: result.trackingId,
          });
        } else {
          results.failed.push({
            order_id: order.id,
            readable_id: order.readable_id,
            error: result.message,
          });
        }
      } catch (err) {
        results.failed.push({
          order_id: order.id,
          readable_id: order.readable_id,
          error: err.message,
        });
      }
    }

    logger.info(`${LOG_PREFIX} NCM bulk order creation completed`, {
      success: results.success.length,
      failed: results.failed.length,
    });

    res.json({
      success: true,
      message: `Created ${results.success.length} orders, ${results.failed.length} failed`,
      data: results,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createNCMOrdersBulk error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/ncm/track/:trackingId
 * Get tracking status from NCM
 */
export async function getNCMTracking(req, res, next) {
  try {
    const { trackingId } = req.params;

    if (!trackingId) {
      return res.status(400).json({ success: false, message: 'trackingId is required' });
    }

    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    const status = await ncmService.checkStatus(trackingId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getNCMTracking error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/ncm/details/:trackingId
 * Get full order details from NCM
 */
export async function getNCMOrderDetails(req, res, next) {
  try {
    const { trackingId } = req.params;

    if (!trackingId) {
      return res.status(400).json({ success: false, message: 'trackingId is required' });
    }

    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    const details = await ncmService.getOrderDetails(trackingId);

    res.json({
      success: true,
      data: details,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getNCMOrderDetails error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/ncm/master-data
 * Get NCM master data (branches with pricing from cache)
 */
export async function getNCMMasterData(req, res, next) {
  try {
    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    const data = await ncmService.getMasterData();

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getNCMMasterData error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/ncm/sync
 * Trigger NCM data sync (admin only)
 */
export async function triggerNCMSync(req, res, next) {
  try {
    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    
    logger.info(`${LOG_PREFIX} Manual NCM sync triggered by ${req.user?.email}`);
    
    const result = await ncmService.syncMasterData();

    res.json({
      success: true,
      message: 'NCM sync completed',
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} triggerNCMSync error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/ncm/sync-status
 * Get NCM sync job status
 */
export async function getNCMSyncStatus(req, res, next) {
  try {
    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    const status = await ncmService.getSyncStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getNCMSyncStatus error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/ncm/redirect-order
 * Redirect NCM order to a new customer/order
 */
export async function redirectNCMOrder(req, res, next) {
  try {
    const { tracking_id, new_order_id, reason } = req.body;

    if (!tracking_id || !new_order_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'tracking_id and new_order_id are required' 
      });
    }

    logger.info(`${LOG_PREFIX} redirectNCMOrder`, { tracking_id, new_order_id, reason });

    const ncmService = (await import('../../services/logistics/NCMService.js')).default;
    const result = await ncmService.redirectOrder(tracking_id, new_order_id, reason);

    res.json({
      success: true,
      message: 'Order redirect initiated',
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} redirectNCMOrder error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================================================
// UNIFIED LOGISTICS SYNC
// ============================================================================

/**
 * POST /dispatch/logistics/sync
 * Sync a single order to its assigned logistics provider
 */
export async function syncOrderToLogistics(req, res, next) {
  try {
    const { order_id, delivery_type = 'D2D' } = req.body;

    if (!order_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'order_id is required' 
      });
    }

    logger.info(`${LOG_PREFIX} syncOrderToLogistics`, { order_id, delivery_type });

    const result = await logisticsOrderService.syncOrderToLogistics(order_id, {
      deliveryType: delivery_type,
    });

    res.json({
      success: true,
      message: 'Order synced to logistics provider',
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} syncOrderToLogistics error`, { 
      error: error.message,
      code: error.code,
    });
    
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
      code: error.code,
    });
  }
}

/**
 * POST /dispatch/logistics/sync-bulk
 * Sync multiple orders to their logistics providers
 */
export async function syncOrdersToLogisticsBulk(req, res, next) {
  try {
    const { order_ids, delivery_type = 'D2D' } = req.body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'order_ids array is required' 
      });
    }

    const cleanedOrderIds = order_ids.map(id => String(id).trim());

    logger.info(`${LOG_PREFIX} syncOrdersToLogisticsBulk`, { 
      count: cleanedOrderIds.length, 
      delivery_type,
    });

    const result = await logisticsOrderService.syncOrdersBulk(cleanedOrderIds, {
      deliveryType: delivery_type,
    });

    res.json({
      success: true,
      message: `Synced ${result.success?.length || 0} orders, ${result.failed?.length || 0} failed`,
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} syncOrdersToLogisticsBulk error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/logistics/sync-status/:orderId
 * Get sync status for an order
 */
export async function getLogisticsSyncStatus(req, res, next) {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const status = await logisticsOrderService.getSyncStatus(orderId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getLogisticsSyncStatus error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/logistics/tracking/:orderId
 * Get live tracking from logistics provider
 */
export async function getLogisticsTracking(req, res, next) {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const tracking = await logisticsOrderService.getTracking(orderId);

    res.json({
      success: true,
      data: tracking,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getLogisticsTracking error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Gaau Besi
  getGaauBesiMasterData,
  triggerGaauBesiSync,
  getGaauBesiBranches,
  createGaauBesiOrder,
  createGaauBesiOrdersBulk,
  getGaauBesiTracking,
  // NCM
  getNCMBranches,
  createNCMOrder,
  createNCMOrdersBulk,
  getNCMTracking,
  getNCMOrderDetails,
  getNCMMasterData,
  triggerNCMSync,
  getNCMSyncStatus,
  redirectNCMOrder,
  // Unified Sync
  syncOrderToLogistics,
  syncOrdersToLogisticsBulk,
  getLogisticsSyncStatus,
  getLogisticsTracking,
};
