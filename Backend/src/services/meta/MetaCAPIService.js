/**
 * Meta Conversions API (CAPI) Service
 * 
 * World-Class Implementation for Multi-Brand Pixel Routing
 * 
 * Features:
 * - Automatic pixel detection from product's sales channel
 * - Event deduplication with browser pixel
 * - SHA256 hashing for user data
 * - Retry mechanism for failed events
 * - Event logging for debugging
 * 
 * API Docs: https://developers.facebook.com/docs/marketing-api/conversions-api/
 */

import crypto from 'crypto';
import axios from 'axios';
import { supabaseAdmin } from '../../config/supabase.js';
import { createLogger } from '../../utils/logger.js';
import config from '../../config/index.js';

const logger = createLogger('MetaCAPIService');

// Meta Graph API Version
const GRAPH_API_VERSION = 'v18.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * SHA256 hash a value for Meta CAPI
 * @param {string} value - Value to hash
 * @returns {string|null} - Hashed value or null
 */
function sha256Hash(value) {
  if (!value || value.trim() === '') return null;
  
  // Normalize: lowercase, trim, remove extra spaces
  const normalized = value.toLowerCase().trim().replace(/\s+/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Normalize phone number for Nepal
 * Removes country code, spaces, dashes
 * @param {string} phone 
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone) return null;
  
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove Nepal country code if present
  if (cleaned.startsWith('977')) {
    cleaned = cleaned.substring(3);
  }
  
  // Should be 10 digits for Nepal
  if (cleaned.length !== 10) {
    logger.warn('Invalid phone number format', { phone, cleaned });
  }
  
  return cleaned;
}

/**
 * Generate unique event ID
 * @param {string} prefix - Optional prefix (e.g., 'MANUAL', 'WEB')
 * @returns {string}
 */
export function generateEventId(prefix = 'ERP') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${timestamp}-${random}`;
}

// =============================================================================
// META CAPI SERVICE CLASS
// =============================================================================

class MetaCAPIService {
  constructor() {
    this.testMode = process.env.NODE_ENV !== 'production';
    logger.info('Meta CAPI Service initialized', { testMode: this.testMode });
  }

  /**
   * Get sales channel credentials by channel ID
   * @param {string} channelId - UUID of sales channel
   * @returns {Object|null} - Channel with pixel credentials
   */
  async getChannelCredentials(channelId) {
    const { data, error } = await supabaseAdmin
      .from('sales_channels')
      .select('id, name, slug, pixel_id, capi_token, test_event_code, currency, is_capi_enabled')
      .eq('id', channelId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      logger.error('Failed to get channel credentials', { channelId, error });
      return null;
    }

    if (!data.is_capi_enabled) {
      logger.info('CAPI is disabled for channel', { channel: data.name });
      return null;
    }

    return data;
  }

  /**
   * Get pixel credentials from product ID
   * Automatic Product-Led Routing
   * @param {string} productId - Product UUID
   * @returns {Object|null} - Channel credentials
   */
  async getPixelFromProduct(productId) {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(`
        id,
        name,
        channel:sales_channels (
          id,
          name,
          slug,
          pixel_id,
          capi_token,
          test_event_code,
          currency,
          is_capi_enabled
        )
      `)
      .eq('id', productId)
      .single();

    if (error || !data || !data.channel) {
      logger.warn('No channel found for product', { productId, error });
      return null;
    }

    if (!data.channel.is_capi_enabled) {
      logger.info('CAPI disabled for product channel', { 
        product: data.name, 
        channel: data.channel.name 
      });
      return null;
    }

    return data.channel;
  }

  /**
   * Build user data object for CAPI
   * @param {Object} customer - Customer data
   * @param {Object} meta - Technical meta (fbp, fbc, ip, user_agent)
   * @returns {Object} - Hashed user data
   */
  buildUserData(customer, meta = {}) {
    const userData = {};

    // Phone (required for Nepal market)
    if (customer?.phone) {
      const normalizedPhone = normalizePhone(customer.phone);
      userData.ph = [sha256Hash(normalizedPhone)];
    }

    // Email
    if (customer?.email) {
      userData.em = [sha256Hash(customer.email)];
    }

    // Name
    if (customer?.name) {
      const nameParts = customer.name.trim().split(' ');
      if (nameParts.length > 0) {
        userData.fn = sha256Hash(nameParts[0]); // First name
      }
      if (nameParts.length > 1) {
        userData.ln = sha256Hash(nameParts[nameParts.length - 1]); // Last name
      }
    }

    // Location (for Nepal)
    userData.country = sha256Hash('np');
    if (customer?.city) {
      userData.ct = sha256Hash(customer.city);
    }
    if (customer?.district) {
      userData.st = sha256Hash(customer.district);
    }

    // External ID (Customer ID from our system)
    if (customer?.id) {
      userData.external_id = sha256Hash(customer.id);
    }

    // Facebook Browser ID (_fbp cookie)
    if (meta.fbp) {
      userData.fbp = meta.fbp;
    }

    // Facebook Click ID (_fbc cookie)
    if (meta.fbc) {
      userData.fbc = meta.fbc;
    }

    // Client IP Address (not hashed)
    if (meta.ip_address) {
      userData.client_ip_address = meta.ip_address;
    }

    // User Agent
    if (meta.user_agent) {
      userData.client_user_agent = meta.user_agent;
    }

    return userData;
  }

  /**
   * Build custom data for e-commerce events
   * @param {Object} order - Order data
   * @param {Array} items - Order items
   * @returns {Object}
   */
  buildCustomData(order, items = []) {
    const customData = {
      currency: order.currency || 'NPR',
      value: parseFloat(order.total_amount) || 0,
    };

    // Content IDs (SKUs)
    if (items.length > 0) {
      customData.content_ids = items.map(item => item.sku || item.variant_id);
      customData.contents = items.map(item => ({
        id: item.sku || item.variant_id,
        quantity: item.quantity,
        item_price: parseFloat(item.unit_price) || 0,
      }));
      customData.content_type = 'product';
      customData.num_items = items.reduce((sum, item) => sum + item.quantity, 0);
    }

    // Order ID
    if (order.order_number) {
      customData.order_id = order.order_number;
    }

    return customData;
  }

  /**
   * Send event to Meta CAPI
   * @param {Object} channel - Sales channel with pixel credentials
   * @param {Object} eventData - Event payload
   * @returns {Object} - Response
   */
  async sendEvent(channel, eventData) {
    if (!channel?.pixel_id || !channel?.capi_token) {
      logger.error('Missing CAPI credentials', { channel: channel?.name });
      return { success: false, error: 'Missing CAPI credentials' };
    }

    const url = `${GRAPH_API_BASE}/${channel.pixel_id}/events`;

    const payload = {
      data: [eventData],
      access_token: channel.capi_token,
    };

    // Add test event code in non-production
    if (this.testMode && channel.test_event_code) {
      payload.test_event_code = channel.test_event_code;
    }

    try {
      logger.info('Sending CAPI event', {
        channel: channel.name,
        pixel: channel.pixel_id,
        event: eventData.event_name,
        eventId: eventData.event_id,
        testMode: this.testMode,
      });

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 seconds
      });

      logger.info('CAPI event sent successfully', {
        eventId: eventData.event_id,
        events_received: response.data.events_received,
        messages: response.data.messages,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error('CAPI event failed', {
        eventId: eventData.event_id,
        error: error.response?.data || error.message,
      });

      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Log CAPI event to database for debugging and retry
   * @param {Object} params - Event parameters
   */
  async logEvent(params) {
    const { orderId, channelId, eventId, eventName, payload, status, response, error } = params;

    try {
      await supabaseAdmin
        .from('capi_events')
        .insert({
          order_id: orderId,
          channel_id: channelId,
          event_id: eventId,
          event_name: eventName,
          event_time: new Date().toISOString(),
          payload,
          status,
          response,
          error_message: error,
          sent_at: status === 'sent' ? new Date().toISOString() : null,
        });
    } catch (err) {
      logger.error('Failed to log CAPI event', { error: err.message });
    }
  }

  /**
   * Update order's technical_meta after CAPI send
   * @param {string} orderId - Order UUID
   * @param {Object} capiResult - Result from CAPI
   */
  async updateOrderMeta(orderId, capiResult) {
    try {
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('technical_meta')
        .eq('id', orderId)
        .single();

      const updatedMeta = {
        ...(order?.technical_meta || {}),
        capi_sent: capiResult.success,
        capi_sent_at: new Date().toISOString(),
        capi_response: capiResult.data || capiResult.error,
      };

      await supabaseAdmin
        .from('orders')
        .update({ technical_meta: updatedMeta })
        .eq('id', orderId);
    } catch (err) {
      logger.error('Failed to update order meta', { orderId, error: err.message });
    }
  }

  // ===========================================================================
  // PUBLIC API: E-COMMERCE EVENTS
  // ===========================================================================

  /**
   * Send Purchase Event
   * 
   * @param {Object} params
   * @param {Object} params.order - Order data
   * @param {Object} params.customer - Customer data
   * @param {Array} params.items - Order items
   * @param {Object} params.meta - Technical meta (event_id, fbp, fbc, ip, user_agent)
   * @param {Object} params.channel - Sales channel (optional, auto-detected from product)
   * @returns {Object}
   */
  async sendPurchaseEvent({ order, customer, items, meta = {}, channel }) {
    // Auto-detect channel from first item's product if not provided
    if (!channel && items.length > 0) {
      const productId = items[0].product_id;
      if (productId) {
        channel = await this.getPixelFromProduct(productId);
      }
    }

    if (!channel) {
      logger.warn('No channel found for purchase event, skipping CAPI', { orderId: order.id });
      return { success: false, error: 'No channel configured' };
    }

    // Generate event ID if not provided
    const eventId = meta.event_id || generateEventId('PURCHASE');

    // Build event payload
    const eventData = {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: channel.website_url || 'https://todaytrend.com.np',
      action_source: meta.action_source || 'website',
      user_data: this.buildUserData(customer, meta),
      custom_data: this.buildCustomData(order, items),
    };

    // Send to Meta
    const result = await this.sendEvent(channel, eventData);

    // Log event
    await this.logEvent({
      orderId: order.id,
      channelId: channel.id,
      eventId,
      eventName: 'Purchase',
      payload: eventData,
      status: result.success ? 'sent' : 'failed',
      response: result.data,
      error: result.error,
    });

    // Update order meta
    await this.updateOrderMeta(order.id, result);

    return result;
  }

  /**
   * Send Refund Event (Official Meta Refund Event)
   * 
   * IMPORTANT: Uses the SAME event_id as original purchase
   * for proper attribution and matching
   * 
   * @param {Object} params
   * @param {Object} params.order - Original order data
   * @param {Object} params.customer - Customer data
   * @param {number} params.refundAmount - Amount refunded
   * @param {Array} params.items - Items being refunded (optional)
   * @returns {Object}
   */
  async sendRefundEvent({ order, customer, refundAmount, items = [] }) {
    // Get channel from order's technical_meta
    const channelId = order.technical_meta?.source_channel_id;
    if (!channelId) {
      logger.warn('No channel found for refund, skipping CAPI');
      return { success: false, error: 'No channel in order meta' };
    }

    const channel = await this.getChannelCredentials(channelId);
    if (!channel) {
      return { success: false, error: 'Channel not found or disabled' };
    }

    // CRITICAL: Use the SAME event_id as original purchase for proper matching
    // This allows Meta to link refund to the original purchase event
    const originalEventId = order.technical_meta?.event_id;
    
    if (!originalEventId) {
      logger.warn('No original event_id found, refund cannot be matched');
    }

    const eventData = {
      event_name: 'Refund',  // Official Meta Refund Event ✅
      event_time: Math.floor(Date.now() / 1000),
      event_id: originalEventId || generateEventId('REFUND'), // Same ID as purchase!
      action_source: 'system_generated',
      user_data: this.buildUserData(customer, {}),
      custom_data: {
        currency: order.currency || 'NPR',
        value: parseFloat(refundAmount),  // Positive value for Refund event
        order_id: order.order_number,
        content_ids: items.length > 0 
          ? items.map(i => i.sku || i.variant_id)
          : order.items?.map(i => i.sku) || [],
        content_type: 'product',
      },
    };

    const result = await this.sendEvent(channel, eventData);

    await this.logEvent({
      orderId: order.id,
      channelId: channel.id,
      eventId: eventData.event_id,
      eventName: 'Refund',
      payload: eventData,
      status: result.success ? 'sent' : 'failed',
      response: result.data,
      error: result.error,
    });

    logger.info('Refund event sent', {
      orderId: order.id,
      orderNumber: order.order_number,
      originalEventId,
      refundAmount,
      success: result.success,
    });

    return result;
  }

  /**
   * Send InitiateCheckout Event
   * For abandoned cart recovery
   */
  async sendInitiateCheckoutEvent({ customer, items, meta = {}, channel }) {
    if (!channel && items.length > 0) {
      channel = await this.getPixelFromProduct(items[0].product_id);
    }

    if (!channel) return { success: false, error: 'No channel' };

    const eventId = meta.event_id || generateEventId('CHECKOUT');

    const eventData = {
      event_name: 'InitiateCheckout',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      user_data: this.buildUserData(customer, meta),
      custom_data: {
        currency: channel.currency || 'NPR',
        value: items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        content_ids: items.map(i => i.sku),
        content_type: 'product',
        num_items: items.reduce((sum, i) => sum + i.quantity, 0),
      },
    };

    return this.sendEvent(channel, eventData);
  }

  /**
   * Send Manual/Offline Purchase Event
   * 
   * For orders created manually in ERP (store sales, phone orders)
   * Uses action_source = 'physical_store' for proper attribution
   * 
   * PRODUCT-LED ROUTING:
   * 1. Admin selects Product
   * 2. System looks up Product's channel_id
   * 3. System fetches Channel's pixel_id and capi_token
   * 4. System fires CAPI to correct pixel automatically
   * 
   * @param {Object} params
   * @param {Object} params.order - Order data
   * @param {Object} params.customer - Customer data
   * @param {Array} params.items - Order items with product_id
   * @returns {Object}
   */
  async sendManualPurchaseEvent({ order, customer, items }) {
    // PRODUCT-LED ROUTING: Get channel from first product
    let channel = null;
    
    if (items.length > 0 && items[0].product_id) {
      channel = await this.getPixelFromProduct(items[0].product_id);
    }

    if (!channel) {
      logger.warn('No channel found for manual order, skipping CAPI', { 
        orderId: order.id,
        message: 'Product may not be linked to a sales channel'
      });
      return { success: false, error: 'No channel configured for product' };
    }

    // Generate NEW event_id for manual orders (no browser pixel to dedupe with)
    const eventId = generateEventId('MANUAL');

    logger.info('Product-Led Routing', {
      product: items[0].product_name,
      channel: channel.name,
      pixelId: channel.pixel_id,
      eventId,
    });

    // Build event payload for OFFLINE/PHYSICAL STORE
    const eventData = {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'physical_store',  // ◄── CRITICAL: Offline attribution
      user_data: this.buildUserData(customer, {
        // No fbp/fbc for manual orders (no browser)
        ip_address: null,
        user_agent: null,
      }),
      custom_data: this.buildCustomData(order, items),
    };

    // Send to Meta
    const result = await this.sendEvent(channel, eventData);

    // Log event
    await this.logEvent({
      orderId: order.id,
      channelId: channel.id,
      eventId,
      eventName: 'Purchase (Manual)',
      payload: eventData,
      status: result.success ? 'sent' : 'failed',
      response: result.data,
      error: result.error,
    });

    // Update order meta
    await this.updateOrderMeta(order.id, {
      ...result,
      event_id: eventId,
      source_channel_id: channel.id,
      action_source: 'physical_store',
    });

    logger.info('Manual purchase event sent', {
      orderId: order.id,
      orderNumber: order.order_number,
      channel: channel.name,
      pixelId: channel.pixel_id,
      success: result.success,
    });

    return result;
  }

  /**
   * Send Lead Event
   * For contact form submissions
   */
  async sendLeadEvent({ customer, meta = {}, channelId }) {
    const channel = await this.getChannelCredentials(channelId);
    if (!channel) return { success: false, error: 'No channel' };

    const eventId = meta.event_id || generateEventId('LEAD');

    const eventData = {
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: meta.action_source || 'website',
      user_data: this.buildUserData(customer, meta),
    };

    return this.sendEvent(channel, eventData);
  }
}

// Export singleton instance
export const metaCAPIService = new MetaCAPIService();
export default metaCAPIService;
