/**
 * Logistics Adapter - Abstract Base Class
 * 
 * Implements the Adapter Pattern for Third-Party Logistics (3PL) integration.
 * Each logistics provider (NCM, Pathao, Sundar, etc.) implements this interface.
 * 
 * This allows swapping providers without changing core order logic.
 * 
 * Usage:
 * const adapter = LogisticsAdapterFactory.getAdapter('ncm');
 * await adapter.pushOrder(order);
 * const status = await adapter.pullStatus(trackingId);
 */

import { AppError } from '../../utils/errors.js';
import { supabaseAdmin } from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import { sanitizeSearchInput } from '../../utils/helpers.js';

// =============================================================================
// LOGISTICS ADAPTER INTERFACE (Abstract Base Class)
// =============================================================================

export class LogisticsAdapter {
  /**
   * @param {string} providerCode - Unique identifier for the provider
   * @param {Object} config - Provider configuration
   */
  constructor(providerCode, config = {}) {
    if (new.target === LogisticsAdapter) {
      throw new Error('LogisticsAdapter is abstract and cannot be instantiated directly');
    }
    
    this.providerCode = providerCode;
    this.config = config;
    this.name = config.name || providerCode;
  }

  // =========================================================================
  // ABSTRACT METHODS - Must be implemented by each provider
  // =========================================================================

  /**
   * Push order to logistics provider
   * Called when order is handed over to courier
   * 
   * @param {Object} order - Order object with customer, items, etc.
   * @returns {Promise<{success: boolean, trackingId: string, awbNumber: string, message: string}>}
   */
  async pushOrder(order) {
    throw new Error('pushOrder() must be implemented by subclass');
  }

  /**
   * Pull current status from logistics provider
   * Used for polling/sync when webhook isn't available
   * 
   * @param {string} trackingId - Tracking ID or AWB number
   * @returns {Promise<{status: string, location: string, timestamp: Date, remarks: string}>}
   */
  async pullStatus(trackingId) {
    throw new Error('pullStatus() must be implemented by subclass');
  }

  /**
   * Cancel shipment with logistics provider
   * 
   * @param {string} trackingId - Tracking ID or AWB number
   * @param {string} reason - Cancellation reason
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async cancelShipment(trackingId, reason) {
    throw new Error('cancelShipment() must be implemented by subclass');
  }

  /**
   * Request pickup from logistics provider
   * 
   * @param {Object} pickupDetails - Address, time, etc.
   * @returns {Promise<{success: boolean, pickupId: string, message: string}>}
   */
  async requestPickup(pickupDetails) {
    throw new Error('requestPickup() must be implemented by subclass');
  }

  /**
   * Get shipping rates/cost estimate
   * 
   * @param {Object} shipmentDetails - Origin, destination, weight, etc.
   * @returns {Promise<{cost: number, estimatedDays: number, serviceType: string}>}
   */
  async getShippingRates(shipmentDetails) {
    throw new Error('getShippingRates() must be implemented by subclass');
  }

  // =========================================================================
  // COMMON METHODS - Shared across all providers
  // =========================================================================

  /**
   * Map provider's status code to our internal status
   * 
   * @param {string} providerStatus - Status code from provider
   * @returns {string} Internal order status
   */
  mapStatus(providerStatus) {
    const mapping = this.config.statusMapping || {};
    return mapping[providerStatus] || mapping[providerStatus.toUpperCase()] || 'unknown';
  }

  /**
   * Verify webhook signature/secret
   * 
   * @param {string} signature - Signature from webhook headers
   * @param {string} payload - Raw request body
   * @returns {boolean}
   */
  verifyWebhookSignature(signature, payload) {
    // Default: simple secret key matching
    return signature === this.config.webhookSecret;
  }

  /**
   * Process incoming webhook data
   * Maps provider-specific format to our internal format
   * 
   * @param {Object} webhookData - Raw webhook payload
   * @returns {Object} Normalized webhook data
   */
  normalizeWebhookData(webhookData) {
    // Default implementation - override in provider
    return {
      trackingId: webhookData.tracking_id || webhookData.awb || webhookData.trackingId,
      status: this.mapStatus(webhookData.status || webhookData.event),
      remarks: webhookData.remarks || webhookData.comment || webhookData.message,
      location: webhookData.location || webhookData.city,
      timestamp: webhookData.timestamp || webhookData.date || new Date().toISOString(),
      rawData: webhookData,
    };
  }

  /**
   * Add a logistics comment to the order
   * 
   * @param {string} orderId - Order UUID
   * @param {string} comment - Comment text
   * @param {string} externalId - External comment ID (for deduplication)
   * @param {string} eventType - Event type from logistics
   */
  async addComment(orderId, comment, externalId = null, eventType = 'comment') {
    try {
      // Check for duplicate
      if (externalId) {
        const { data: existing } = await supabaseAdmin
          .from('order_comments')
          .select('id')
          .eq('order_id', orderId)
          .eq('external_comment_id', externalId)
          .single();
        
        if (existing) {
          logger.debug(`Duplicate comment skipped: ${externalId}`);
          return null;
        }
      }

      const { data, error } = await supabaseAdmin
        .from('order_comments')
        .insert({
          order_id: orderId,
          comment: `[${this.name}] ${comment}`,
          source: 'logistics',
          external_comment_id: externalId,
          external_event_type: eventType,
          is_internal: false,
        })
        .select()
        .single();

      if (error) throw error;

      logger.info(`Logistics comment added to order ${orderId}: ${comment}`);
      return data;
    } catch (error) {
      logger.error(`Failed to add logistics comment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log webhook request for audit trail
   * 
   * @param {Object} request - Express request object
   * @param {string} status - Processing status
   * @param {string} orderId - Matched order ID (if any)
   * @param {string} errorMessage - Error message (if failed)
   */
  async logWebhook(request, status, orderId = null, errorMessage = null) {
    try {
      await supabaseAdmin
        .from('logistics_webhook_logs')
        .insert({
          provider_code: this.providerCode,
          tracking_id: request.body?.tracking_id || request.body?.awb,
          request_headers: request.headers,
          request_body: request.body,
          status,
          order_id: orderId,
          error_message: errorMessage,
          ip_address: request.ip,
          processed_at: status !== 'pending' ? new Date().toISOString() : null,
        });

      // Update courier partner webhook stats
      await supabaseAdmin
        .from('courier_partners')
        .update({
          last_webhook_at: new Date().toISOString(),
          webhook_count: supabaseAdmin.raw('webhook_count + 1'),
        })
        .eq('code', this.providerCode);
    } catch (error) {
      logger.error(`Failed to log webhook: ${error.message}`);
    }
  }

  /**
   * Find order by tracking ID
   * 
   * @param {string} trackingId - Tracking ID or AWB number
   * @returns {Promise<Object|null>} Order or null
   */
  async findOrderByTrackingId(trackingId) {
    // SECURITY: Sanitize tracking ID to prevent SQL injection
    const sanitizedTrackingId = sanitizeSearchInput(trackingId);
    if (!sanitizedTrackingId) {
      return null;
    }
    
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*, customer:customers(*)')
      .or(`courier_tracking_id.eq.${sanitizedTrackingId},awb_number.eq.${sanitizedTrackingId}`)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;
  }

  /**
   * Update order status based on webhook
   * 
   * @param {string} orderId - Order UUID
   * @param {string} newStatus - New internal status
   * @param {Object} additionalData - Extra data to update
   */
  async updateOrderStatus(orderId, newStatus, additionalData = {}) {
    const updateData = {
      status: newStatus,
      ...additionalData,
      updated_at: new Date().toISOString(),
    };

    // Set delivered_at timestamp if delivered
    if (newStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Order ${orderId} status updated to ${newStatus} via ${this.name}`);
    
    // TODO: Send SMS notification to customer
    // TODO: Trigger internal notification
    
    return data;
  }
}

// =============================================================================
// LOGISTICS ADAPTER FACTORY
// =============================================================================

export class LogisticsAdapterFactory {
  static adapters = new Map();
  static providerConfigs = new Map();

  /**
   * Register a logistics provider adapter
   * 
   * @param {string} code - Provider code (e.g., 'ncm')
   * @param {typeof LogisticsAdapter} AdapterClass - Adapter class
   */
  static registerAdapter(code, AdapterClass) {
    this.adapters.set(code.toLowerCase(), AdapterClass);
    logger.info(`Logistics adapter registered: ${code}`);
  }

  /**
   * Get adapter instance for a provider
   * 
   * @param {string} code - Provider code
   * @returns {LogisticsAdapter}
   */
  static async getAdapter(code) {
    const normalizedCode = code.toLowerCase();
    const AdapterClass = this.adapters.get(normalizedCode);

    if (!AdapterClass) {
      throw new AppError(`Unknown logistics provider: ${code}`, 400, 'UNKNOWN_PROVIDER');
    }

    // Get provider config from database
    let config = this.providerConfigs.get(normalizedCode);
    
    if (!config) {
      const { data: provider } = await supabaseAdmin
        .from('courier_partners')
        .select('id, order_number, status, courier_partner, awb_number, tracking_url, shipped_at')
        .eq('code', normalizedCode)
        .single();

      if (provider) {
        config = {
          name: provider.name,
          apiUrl: provider.api_url,
          apiKey: provider.api_key,
          webhookSecret: provider.webhook_secret,
          statusMapping: provider.status_mapping || {},
          trackingUrlTemplate: provider.tracking_url_template,
        };
        this.providerConfigs.set(normalizedCode, config);
      } else {
        config = {};
      }
    }

    return new AdapterClass(normalizedCode, config);
  }

  /**
   * Get adapter by tracking ID (searches all providers)
   * 
   * @param {string} trackingId - Tracking ID
   * @returns {Promise<LogisticsAdapter|null>}
   */
  static async getAdapterByTrackingId(trackingId) {
    // SECURITY: Sanitize tracking ID to prevent SQL injection
    const sanitizedTrackingId = sanitizeSearchInput(trackingId);
    if (!sanitizedTrackingId) {
      return null;
    }
    
    // Find order with this tracking ID to get provider
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('courier_partner')
      .or(`courier_tracking_id.eq.${sanitizedTrackingId},awb_number.eq.${sanitizedTrackingId}`)
      .single();

    if (order?.courier_partner) {
      const providerCode = order.courier_partner.toLowerCase().replace(' ', '_');
      return this.getAdapter(providerCode);
    }

    return null;
  }

  /**
   * List all registered adapters
   * 
   * @returns {string[]}
   */
  static listAdapters() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Clear cached configs (useful for testing)
   */
  static clearCache() {
    this.providerConfigs.clear();
  }
}

export default LogisticsAdapter;
