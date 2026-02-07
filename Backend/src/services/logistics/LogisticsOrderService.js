/**
 * Logistics Order Service
 * 
 * Unified service for syncing orders to external logistics providers (NCM, Gaau Besi).
 * Handles the full lifecycle:
 * 1. Fetch order details
 * 2. Map fields to provider format
 * 3. Push to provider API
 * 4. Store response and update order status
 * 
 * @author Senior Backend Architect
 * @priority P0 - Outside Valley Order Sync
 */

import supabase from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import ncmService from './NCMService.js';
import { GaauBesiProvider } from './GaauBesiProvider.js';
import {
  ORDER_STATUS,
  FULFILLMENT_TYPE,
  LOGISTICS_PROVIDER,
} from '../../constants/index.js';

// =============================================================================
// CONSTANTS (P1 REFACTOR: Using centralized constants where applicable)
// =============================================================================

const LOGISTICS_PROVIDERS_DISPLAY = {
  [LOGISTICS_PROVIDER.NCM]: 'Nepal Can Move',
  [LOGISTICS_PROVIDER.GAAUBESI]: 'Gaau Besi',
};

// Status to set after successful sync (P1 REFACTOR: Using ORDER_STATUS constant)
const POST_SYNC_STATUS = ORDER_STATUS.HANDOVER_TO_COURIER;

// =============================================================================
// LOGISTICS ORDER SERVICE CLASS
// =============================================================================

class LogisticsOrderService {
  constructor() {
    this.gaauBesiProvider = new GaauBesiProvider('gaaubesi');
    logger.info('[LogisticsOrderService] Initialized');
  }

  // ===========================================================================
  // MAIN SYNC FUNCTION
  // ===========================================================================

  /**
   * Sync an order to its assigned logistics provider
   * 
   * @param {string} orderId - UUID of the order
   * @param {Object} options - Additional options
   * @param {string} options.deliveryType - For NCM: 'D2D' (Home) or 'D2B' (Branch Pickup)
   * @returns {Promise<Object>} Sync result with tracking info
   */
  async syncOrderToLogistics(orderId, options = {}) {
    const startTime = Date.now();
    
    console.log('\n========================================');
    console.log('🚀 [LogisticsOrderService] SYNC ORDER TO LOGISTICS');
    console.log('========================================');
    console.log(`   Order ID: "${orderId}"`);
    console.log(`   Options:`, JSON.stringify(options));
    console.log('');
    
    try {
      logger.info(`[LogisticsOrderService] Starting sync for order ${orderId}`);

      // Step 1: Fetch full order details
      const order = await this._fetchOrderDetails(orderId);
      
      // Validate order can be synced
      this._validateOrderForSync(order);

      // Step 2: Determine provider and sync
      const courierPartner = order.courier_partner?.toLowerCase() || '';
      let syncResult;

      if (courierPartner.includes('nepal can move') || courierPartner.includes('ncm')) {
        syncResult = await this._syncToNCM(order, options);
      } else if (courierPartner.includes('gaau besi') || courierPartner.includes('gaaubesi') || courierPartner.includes('gbl')) {
        syncResult = await this._syncToGaauBesi(order, options);
      } else {
        throw new AppError(
          `Unknown logistics provider: ${order.courier_partner}`,
          400,
          'UNKNOWN_PROVIDER'
        );
      }

      // Step 3: Update order with sync result
      await this._updateOrderAfterSync(order.id, syncResult);

      const duration = Date.now() - startTime;
      logger.info(`[LogisticsOrderService] Sync completed in ${duration}ms`, {
        orderId,
        provider: syncResult.provider,
        trackingId: syncResult.trackingId,
      });

      return {
        success: true,
        orderId: order.id,
        orderNumber: order.readable_id || order.order_number,
        provider: syncResult.provider,
        externalOrderId: syncResult.trackingId,
        trackingId: syncResult.trackingId,
        waybill: syncResult.waybill,
        message: syncResult.message,
        duration,
      };
    } catch (error) {
      // P0 FIX: Log detailed error for debugging and re-throw with user-friendly message
      console.error('\n❌ ========================================');
      console.error('❌ [LogisticsOrderService] SYNC FAILED');
      console.error('❌ ========================================');
      console.error('❌ Order ID:', orderId);
      console.error('❌ Error Message:', error.message);
      console.error('❌ Error Code:', error.code);
      if (error.response) {
        console.error('❌ HTTP Status:', error.response.status);
        console.error('❌ Response Data:', JSON.stringify(error.response.data, null, 2));
      }
      console.error('');

      logger.error(`[LogisticsOrderService] Sync failed for order ${orderId}`, {
        error: error.message,
        code: error.code,
        httpStatus: error.response?.status,
        responseData: error.response?.data,
        stack: error.stack?.substring(0, 500),
      });

      // Store failure in logistics_response for debugging
      await this._recordSyncFailure(orderId, error);

      // P0 FIX: Re-throw with user-friendly error message (not generic "Internal Server Error")
      // This ensures frontend receives the exact failure reason from the logistics provider
      if (error instanceof AppError) {
        throw error;
      }

      // Wrap non-AppError in a descriptive error
      throw new AppError(
        `Logistics sync failed: ${error.message}`,
        error.response?.status || 500,
        error.code || 'LOGISTICS_SYNC_FAILED'
      );
    }
  }

  // ===========================================================================
  // BULK SYNC
  // ===========================================================================

  /**
   * Sync multiple orders to their logistics providers
   * 
   * @param {string[]} orderIds - Array of order UUIDs
   * @param {Object} options - Sync options
   * @returns {Promise<{success: Array, failed: Array}>}
   */
  async syncOrdersBulk(orderIds, options = {}) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║           BULK LOGISTICS SYNC                                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`📋 Order IDs received (${orderIds.length}):`);
    orderIds.forEach((id, idx) => {
      console.log(`   ${idx + 1}. "${id}" (length: ${id?.length || 0})`);
    });
    console.log(`📦 Options:`, JSON.stringify(options));
    console.log('');

    const results = {
      success: [],
      failed: [],
    };

    for (let i = 0; i < orderIds.length; i++) {
      const orderId = orderIds[i];
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 Processing order ${i + 1}/${orderIds.length}: "${orderId}"`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      try {
        const result = await this.syncOrderToLogistics(orderId, options);
        results.success.push(result);
        console.log(`✅ Order ${orderId} synced successfully!`);
      } catch (error) {
        console.error(`❌ Order ${orderId} FAILED: ${error.message}`);
        results.failed.push({
          orderId,
          error: error.message,
          code: error.code,
        });
      }
    }

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log(`║ BULK SYNC COMPLETE: ${results.success.length} success, ${results.failed.length} failed`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    logger.info(`[LogisticsOrderService] Bulk sync completed`, {
      total: orderIds.length,
      success: results.success.length,
      failed: results.failed.length,
    });

    return results;
  }

  // ===========================================================================
  // PROVIDER-SPECIFIC SYNC METHODS
  // ===========================================================================

  /**
   * Sync order to Nepal Can Move (NCM)
   * 
   * NCM API requires:
   * - Order must have destination_branch set
   * - delivery_type: 'D2D' (Door2Door) or 'D2B' (Door2Branch)
   */
  async _syncToNCM(order, options = {}) {
    // P0 FIX: ALWAYS prioritize order.delivery_type from DB over frontend-provided value
    // The DB is the source of truth - frontend may not have correct value due to caching
    // Priority: order.delivery_type (DB) > options.deliveryType (frontend) > default 'D2D'
    
    console.log(`\n🎯 [_syncToNCM] P0 DEBUG - Delivery Type Resolution:`);
    console.log(`   order.delivery_type (DB): "${order.delivery_type}"`);
    console.log(`   options.deliveryType (Frontend): "${options.deliveryType}"`);
    
    let deliveryType = null;
    
    // STEP 1: Check DB value FIRST (this is the source of truth)
    if (order.delivery_type) {
      const rawType = (order.delivery_type || '').toLowerCase().trim();
      if (
        rawType === 'd2b' ||
        rawType.includes('pickup') ||
        rawType.includes('branch')
      ) {
        deliveryType = 'D2B';
      } else if (rawType === 'd2d' || rawType.includes('home') || rawType.includes('door')) {
        deliveryType = 'D2D';
      }
      console.log(`   ✓ Using DB value: "${order.delivery_type}" → "${deliveryType}"`);
      logger.info(`[LogisticsOrderService] Using DB delivery_type: "${order.delivery_type}" → "${deliveryType}"`);
    }
    
    // STEP 2: Fallback to frontend-provided value only if DB is null/empty
    if (!deliveryType && options.deliveryType) {
      deliveryType = options.deliveryType.toUpperCase() === 'D2B' ? 'D2B' : 'D2D';
      console.log(`   ⚠️ DB was empty, using frontend value: "${options.deliveryType}" → "${deliveryType}"`);
      logger.info(`[LogisticsOrderService] DB delivery_type empty, using frontend: "${options.deliveryType}" → "${deliveryType}"`);
    }
    
    // STEP 3: Final default
    deliveryType = deliveryType || 'D2D';
    console.log(`   📦 Final deliveryType: "${deliveryType}"`);
    
    const destinationBranch = order.destination_branch || order.courier_branch_name;

    if (!destinationBranch) {
      throw new AppError(
        'Destination branch is required for NCM orders',
        400,
        'MISSING_BRANCH'
      );
    }

    logger.info(`[LogisticsOrderService] Syncing to NCM`, {
      orderNumber: order.readable_id,
      destinationBranch,
      deliveryType,
      orderDeliveryType: order.delivery_type,
    });

    // Call NCM service with deliveryType
    // NCMService.createOrder reads destination_branch from order object
    const result = await ncmService.createOrder(order, deliveryType);

    return {
      provider: 'ncm',
      providerName: LOGISTICS_PROVIDERS_DISPLAY[LOGISTICS_PROVIDER.NCM],
      trackingId: result.trackingId,
      waybill: result.waybill || result.trackingId,
      message: result.message,
      deliveryType,
      rawResponse: result.rawResponse,
    };
  }

  /**
   * Sync order to Gaau Besi
   * 
   * GBL supports both:
   * - D2D (Drop Off / Home Delivery)
   * - D2B (Pickup / Branch Pickup)
   */
  async _syncToGaauBesi(order, options = {}) {
    const destinationBranch = order.destination_branch || order.courier_branch_name || 'HEAD OFFICE';
    
    // P0 FIX: ALWAYS prioritize order.delivery_type from DB over frontend-provided value
    // The DB is the source of truth - frontend may not have correct value due to caching
    // Priority: order.delivery_type (DB) > options.deliveryType (frontend) > default 'D2D'
    
    console.log(`\n🎯 [_syncToGaauBesi] P0 DEBUG - Delivery Type Resolution:`);
    console.log(`   order.delivery_type (DB): "${order.delivery_type}"`);
    console.log(`   options.deliveryType (Frontend): "${options.deliveryType}"`);
    
    let deliveryType = null;
    
    // STEP 1: Check DB value FIRST (this is the source of truth)
    if (order.delivery_type) {
      const rawType = (order.delivery_type || '').toLowerCase().trim();
      if (
        rawType === 'd2b' ||
        rawType.includes('pickup') ||
        rawType.includes('branch')
      ) {
        deliveryType = 'D2B';
      } else if (rawType === 'd2d' || rawType.includes('home') || rawType.includes('door')) {
        deliveryType = 'D2D';
      }
      console.log(`   ✓ Using DB value: "${order.delivery_type}" → "${deliveryType}"`);
      logger.info(`[LogisticsOrderService] Using DB delivery_type: "${order.delivery_type}" → "${deliveryType}"`);
    }
    
    // STEP 2: Fallback to frontend-provided value only if DB is null/empty
    if (!deliveryType && options.deliveryType) {
      deliveryType = options.deliveryType.toUpperCase() === 'D2B' ? 'D2B' : 'D2D';
      console.log(`   ⚠️ DB was empty, using frontend value: "${options.deliveryType}" → "${deliveryType}"`);
      logger.info(`[LogisticsOrderService] DB delivery_type empty, using frontend: "${options.deliveryType}" → "${deliveryType}"`);
    }
    
    // STEP 3: Final default
    deliveryType = deliveryType || 'D2D';
    console.log(`   📦 Final deliveryType: "${deliveryType}"`);

    logger.info(`[LogisticsOrderService] Syncing to Gaau Besi`, {
      orderNumber: order.readable_id,
      destinationBranch,
      deliveryType,
      orderDeliveryType: order.delivery_type,
    });

    // Call Gaau Besi provider with delivery type
    const result = await this.gaauBesiProvider.pushOrder(order, { 
      destinationBranch,
      deliveryType,
    });

    return {
      provider: 'gaaubesi',
      providerName: LOGISTICS_PROVIDERS_DISPLAY[LOGISTICS_PROVIDER.GAAUBESI],
      trackingId: result.trackingId,
      waybill: result.awbNumber || result.trackingId,
      message: result.message,
      deliveryType,
      rawResponse: result.rawResponse || result,
    };
  }

  // ===========================================================================
  // DATABASE OPERATIONS
  // ===========================================================================

  /**
   * Fetch full order details including items
   * 
   * NOTE: Uses service role to bypass RLS for backend operations
   * 
   * IMPORTANT: Orders table has these columns for customer info:
   * - shipping_name (NOT customer_name)
   * - shipping_phone (NOT customer_phone)
   * - shipping_address
   * - alt_phone
   */
  async _fetchOrderDetails(orderId) {
    // Clean the order ID (remove any whitespace)
    const cleanOrderId = String(orderId).trim();
    
    console.log('\n🔍 [LogisticsOrderService] Fetching order details...');
    console.log(`   Order ID: "${cleanOrderId}"`);
    console.log(`   ID Length: ${cleanOrderId.length}`);
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanOrderId)) {
      console.error(`❌ [LogisticsOrderService] Invalid UUID format: "${cleanOrderId}"`);
      throw new AppError(
        `Invalid order ID format: ${cleanOrderId}`,
        400,
        'INVALID_ORDER_ID'
      );
    }

    // STEP 1: Fetch order with source relation (for vendor reference on courier label)
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_source:order_sources(id, name)
      `)
      .eq('id', cleanOrderId)
      .single();

    // Debug: Log query result
    if (error) {
      console.error('❌ [LogisticsOrderService] Supabase query error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      
      logger.error(`[LogisticsOrderService] Failed to fetch order ${cleanOrderId}`, { error });
      throw new AppError(
        `Order not found: ${cleanOrderId}`,
        404,
        'ORDER_NOT_FOUND'
      );
    }

    if (!order) {
      console.error(`❌ [LogisticsOrderService] Order NOT FOUND in database`);
      console.error(`   Searched for ID: "${cleanOrderId}"`);
      
      logger.error(`[LogisticsOrderService] Order not found ${cleanOrderId}`);
      throw new AppError(
        `Order not found: ${cleanOrderId}`,
        404,
        'ORDER_NOT_FOUND'
      );
    }

    console.log('✅ [LogisticsOrderService] Order found:', {
      id: order.id,
      readable_id: order.readable_id,
      shipping_name: order.shipping_name,
      shipping_phone: order.shipping_phone,
      destination_branch: order.destination_branch,
      courier_partner: order.courier_partner,
      delivery_type: order.delivery_type,
      total_amount: order.total_amount,
    });

    // STEP 2: Fetch order items separately
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('id, product_id, variant_id, product_name, variant_name, quantity, unit_price, total_price')
      .eq('order_id', cleanOrderId);

    if (itemsError) {
      console.warn('⚠️ [LogisticsOrderService] Failed to fetch order items:', itemsError.message);
    }

    // Attach items to order
    order.items = items || [];
    console.log(`   Items fetched: ${order.items.length}`);

    // STEP 3: Map shipping_* columns to customer_* for backward compatibility
    // This ensures NCMService can use order.customer_name, order.customer_phone, etc.
    order.customer_name = order.shipping_name;
    order.customer_phone = order.shipping_phone;
    order.customer_address = order.shipping_address;
    order.customer_phone_secondary = order.alt_phone;

    return order;
  }

  /**
   * Validate order is ready for sync
   */
  _validateOrderForSync(order) {
    // Check if already synced
    if (order.is_logistics_synced && order.external_order_id) {
      throw new AppError(
        `Order already synced. External ID: ${order.external_order_id}`,
        400,
        'ALREADY_SYNCED'
      );
    }

    // Check fulfillment type (P1 REFACTOR: Using FULFILLMENT_TYPE constant)
    if (order.fulfillment_type !== FULFILLMENT_TYPE.OUTSIDE_VALLEY) {
      throw new AppError(
        `Only ${FULFILLMENT_TYPE.OUTSIDE_VALLEY} orders can be synced to logistics providers`,
        400,
        'INVALID_FULFILLMENT_TYPE'
      );
    }

    // Check courier partner
    if (!order.courier_partner) {
      throw new AppError(
        'Courier partner not assigned to order',
        400,
        'MISSING_COURIER_PARTNER'
      );
    }

    // Check required shipping info
    if (!order.shipping_name && !order.customer?.name) {
      throw new AppError('Customer name is required', 400, 'MISSING_CUSTOMER_NAME');
    }
    if (!order.shipping_phone && !order.customer?.phone) {
      throw new AppError('Customer phone is required', 400, 'MISSING_CUSTOMER_PHONE');
    }
    if (!order.shipping_address && !order.customer?.address_line1) {
      throw new AppError('Customer address is required', 400, 'MISSING_CUSTOMER_ADDRESS');
    }

    return true;
  }

  /**
   * Update order after successful sync
   * 
   * P0 FIX: Robust DB update with verification
   */
  async _updateOrderAfterSync(orderId, syncResult) {
    console.log('\n' + '='.repeat(60));
    console.log('📝 [LogisticsOrderService] SAVING TO DATABASE');
    console.log('='.repeat(60));
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Tracking ID: ${syncResult.trackingId}`);
    console.log(`   Provider: ${syncResult.provider}`);
    
    // Extract tracking ID with fallbacks (handle various response structures)
    const externalId = syncResult.trackingId || syncResult.order_id || syncResult.orderid || syncResult.id;
    
    if (!externalId) {
      console.error('❌ [LogisticsOrderService] CRITICAL: No tracking ID found in sync result!');
      console.error('   Sync Result:', JSON.stringify(syncResult, null, 2));
      throw new AppError('Logistics provider returned no tracking ID', 500, 'NO_TRACKING_ID');
    }
    
    console.log(`✅ [LogisticsOrderService] External ID to save: "${externalId}"`);
    
    // Determine initial logistics status text based on provider
    const providerName = syncResult.provider?.toUpperCase() || 'UNKNOWN';
    const initialStatusText = providerName === 'NCM' ? 'Order Created' : 'Pickup Order Created';
    
    // P0 DEBUG: Log what delivery_type we're about to save
    console.log('\n🎯 [LogisticsOrderService] P0 DEBUG - delivery_type BEFORE save:');
    console.log(`   syncResult.deliveryType: "${syncResult.deliveryType}"`);
    console.log(`   Will save: "${syncResult.deliveryType || 'D2D'}"`);
    
    const updateData = {
      // PRIMARY: Sync tracking fields (column names from migration 047 + 121)
      external_order_id: String(externalId),
      is_logistics_synced: true,
      logistics_response: syncResult.rawResponse || syncResult,
      logistics_synced_at: new Date().toISOString(),
      logistics_provider: providerName,
      logistics_status: initialStatusText, // P0 FIX: Dynamic courier status for display
      courier_raw_status: initialStatusText, // Backup field
      delivery_type: syncResult.deliveryType || 'D2D',
      
      // SECONDARY: Courier fields (backward compatibility)
      courier_tracking_id: String(externalId),
      courier_waybill: String(syncResult.waybill || externalId),
      awb_number: String(syncResult.waybill || externalId),
      
      // STATUS: Move order out of "Pending" to next stage
      status: POST_SYNC_STATUS,
      handover_at: new Date().toISOString(),
      
      // Timestamp
      updated_at: new Date().toISOString(),
    };

    console.log('\n📤 [LogisticsOrderService] Update Data:');
    console.log(JSON.stringify(updateData, null, 2));

    // STEP 1: Perform the update
    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateError) {
      console.error('\n❌ [LogisticsOrderService] DB UPDATE FAILED!');
      console.error('   Error Code:', updateError.code);
      console.error('   Error Message:', updateError.message);
      console.error('   Error Details:', updateError.details);
      console.error('   Error Hint:', updateError.hint);
      
      logger.error(`[LogisticsOrderService] Failed to update order ${orderId}`, { 
        error: updateError,
        updateData,
      });
      
      throw new AppError(
        `Failed to update order: ${updateError.message}`,
        500,
        'UPDATE_FAILED'
      );
    }

    // STEP 2: Verify the update by re-fetching
    console.log('\n🔍 [LogisticsOrderService] Verifying update...');
    
    const { data: verifyData, error: verifyError } = await supabase
      .from('orders')
      .select('id, readable_id, is_logistics_synced, external_order_id, status, logistics_provider')
      .eq('id', orderId)
      .single();

    if (verifyError) {
      console.warn('⚠️ [LogisticsOrderService] Verification query failed:', verifyError.message);
    } else {
      console.log('\n✅ [LogisticsOrderService] VERIFICATION RESULT:');
      console.log(`   Order: ${verifyData.readable_id}`);
      console.log(`   is_logistics_synced: ${verifyData.is_logistics_synced}`);
      console.log(`   external_order_id: ${verifyData.external_order_id}`);
      console.log(`   status: ${verifyData.status}`);
      console.log(`   logistics_provider: ${verifyData.logistics_provider}`);
      
      // Final check
      if (!verifyData.is_logistics_synced || !verifyData.external_order_id) {
        console.error('\n❌ [LogisticsOrderService] CRITICAL: Update did NOT persist!');
        console.error('   Expected is_logistics_synced: true');
        console.error('   Actual is_logistics_synced:', verifyData.is_logistics_synced);
        console.error('   Expected external_order_id:', externalId);
        console.error('   Actual external_order_id:', verifyData.external_order_id);
        
        // Try one more time with force
        console.log('\n🔄 [LogisticsOrderService] Retrying update...');
        const { error: retryError } = await supabase
          .from('orders')
          .update({
            external_order_id: String(externalId),
            is_logistics_synced: true,
            status: POST_SYNC_STATUS,
          })
          .eq('id', orderId);
          
        if (retryError) {
          console.error('❌ Retry also failed:', retryError.message);
        } else {
          console.log('✅ Retry update executed');
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ [LogisticsOrderService] DB UPDATE COMPLETE');
    console.log('='.repeat(60) + '\n');
    
    logger.info(`[LogisticsOrderService] Order ${orderId} updated successfully`, {
      trackingId: externalId,
      status: POST_SYNC_STATUS,
      provider: syncResult.provider,
    });
  }

  /**
   * Record sync failure for debugging
   */
  async _recordSyncFailure(orderId, error) {
    try {
      await supabase
        .from('orders')
        .update({
          logistics_response: {
            success: false,
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString(),
          },
        })
        .eq('id', orderId);
    } catch (updateError) {
      logger.error(`[LogisticsOrderService] Failed to record sync failure`, { updateError });
    }
  }

  // ===========================================================================
  // STATUS CHECK
  // ===========================================================================

  /**
   * Get sync status for an order
   */
  async getSyncStatus(orderId) {
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id,
        readable_id,
        order_number,
        is_logistics_synced,
        external_order_id,
        logistics_provider,
        logistics_synced_at,
        logistics_response,
        courier_partner,
        courier_tracking_id,
        courier_waybill,
        awb_number
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    return {
      orderId: order.id,
      orderNumber: order.readable_id || order.order_number,
      isSynced: order.is_logistics_synced || false,
      externalOrderId: order.external_order_id,
      provider: order.logistics_provider,
      courierPartner: order.courier_partner,
      trackingId: order.courier_tracking_id || order.external_order_id,
      waybill: order.courier_waybill || order.awb_number,
      syncedAt: order.logistics_synced_at,
      response: order.logistics_response,
    };
  }

  /**
   * Get tracking info from provider
   */
  async getTrackingInfo(orderId) {
    const status = await this.getSyncStatus(orderId);

    if (!status.isSynced || !status.trackingId) {
      throw new AppError('Order not synced to logistics', 400, 'NOT_SYNCED');
    }

    const provider = status.provider?.toLowerCase();

    if (provider === 'ncm') {
      return await ncmService.getOrderStatus(status.trackingId);
    } else if (provider === 'gaaubesi') {
      return await this.gaauBesiProvider.pullStatus(status.trackingId);
    }

    throw new AppError(`Unknown provider: ${status.provider}`, 400, 'UNKNOWN_PROVIDER');
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

const logisticsOrderService = new LogisticsOrderService();
export default logisticsOrderService;
