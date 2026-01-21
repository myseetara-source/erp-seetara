/**
 * Integration Service
 * Handles external API integrations (SMS, Facebook CAPI, Logistics)
 * 
 * This service is structured for easy plug-in of actual APIs
 */

import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { hashForFacebook } from '../utils/helpers.js';
import { ExternalServiceError } from '../utils/errors.js';

const logger = createLogger('IntegrationService');

class IntegrationService {
  // ===========================================================================
  // SMS INTEGRATION
  // ===========================================================================

  /**
   * SMS Templates
   */
  smsTemplates = {
    order_created: (data) => 
      `Hi! Your order ${data.order_number} for ₹${data.amount} has been received. We'll update you once it ships.`,
    
    order_shipped: (data) => 
      `Your order ${data.order_number} has been shipped! Track here: ${data.tracking_url || 'N/A'}`,
    
    order_delivered: (data) => 
      `Your order ${data.order_number} has been delivered. Thank you for shopping with us!`,
    
    order_cancelled: (data) => 
      `Your order ${data.order_number} has been cancelled. If you paid, refund will be processed in 5-7 days.`,
    
    otp: (data) => 
      `Your OTP is ${data.otp}. Valid for 10 minutes. Do not share with anyone.`,
  };

  /**
   * Send SMS using configured provider
   * @param {string} phone - Phone number
   * @param {string} template - Template name
   * @param {Object} data - Template data
   */
  async sendSMS(phone, template, data = {}) {
    if (!config.sms.apiKey) {
      logger.debug('SMS not configured, skipping', { phone, template });
      return { success: false, reason: 'not_configured' };
    }

    const message = this.smsTemplates[template]?.(data);
    if (!message) {
      logger.warn('Unknown SMS template', { template });
      return { success: false, reason: 'unknown_template' };
    }

    // Add country code if not present
    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;

    try {
      // MSG91 Integration (placeholder - implement actual API call)
      if (config.sms.provider === 'msg91') {
        // const response = await fetch('https://api.msg91.com/api/v5/flow/', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'authkey': config.sms.apiKey,
        //   },
        //   body: JSON.stringify({
        //     sender: config.sms.senderId,
        //     mobiles: formattedPhone,
        //     message: message,
        //   }),
        // });
        // 
        // if (!response.ok) throw new Error('SMS API failed');

        logger.info('SMS sent (simulated)', { phone: formattedPhone, template });
        return { success: true, message: 'SMS queued' };
      }

      // Add other providers here (Twilio, AWS SNS, etc.)

      return { success: false, reason: 'unsupported_provider' };
    } catch (error) {
      logger.error('SMS sending failed', { phone, template, error: error.message });
      throw new ExternalServiceError('SMS', error.message);
    }
  }

  // ===========================================================================
  // FACEBOOK CONVERSION API
  // ===========================================================================

  /**
   * Track Facebook event via Conversion API
   * @param {string} eventName - Event name (Purchase, Lead, etc.)
   * @param {Object} eventData - Event data
   */
  async trackFacebookEvent(eventName, eventData = {}) {
    if (!config.facebook.pixelId || !config.facebook.accessToken) {
      logger.debug('Facebook CAPI not configured, skipping', { eventName });
      return { success: false, reason: 'not_configured' };
    }

    try {
      const event = {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: eventData.source_url,
        action_source: 'website',
        user_data: {},
        custom_data: {},
      };

      // Hash user data for privacy
      if (eventData.customer_email) {
        event.user_data.em = await hashForFacebook(eventData.customer_email);
      }
      if (eventData.customer_phone) {
        event.user_data.ph = await hashForFacebook(eventData.customer_phone);
      }
      if (eventData.fbclid) {
        event.user_data.fbc = `fb.1.${Date.now()}.${eventData.fbclid}`;
      }

      // Add custom data
      if (eventName === 'Purchase') {
        event.custom_data = {
          currency: eventData.currency || 'INR',
          value: eventData.value,
          order_id: eventData.order_id,
          content_type: 'product',
        };
      }

      // Facebook Conversion API call (placeholder)
      // const response = await fetch(
      //   `https://graph.facebook.com/v18.0/${config.facebook.pixelId}/events`,
      //   {
      //     method: 'POST',
      //     headers: {
      //       'Content-Type': 'application/json',
      //     },
      //     body: JSON.stringify({
      //       data: [event],
      //       access_token: config.facebook.accessToken,
      //       test_event_code: config.facebook.testEventCode, // Remove in production
      //     }),
      //   }
      // );
      // 
      // if (!response.ok) throw new Error('Facebook CAPI failed');

      logger.info('Facebook event tracked (simulated)', { 
        eventName, 
        orderId: eventData.order_id 
      });
      return { success: true };
    } catch (error) {
      logger.error('Facebook CAPI failed', { eventName, error: error.message });
      throw new ExternalServiceError('Facebook CAPI', error.message);
    }
  }

  // ===========================================================================
  // SHIPROCKET LOGISTICS
  // ===========================================================================

  shiprocketToken = null;
  shiprocketTokenExpiry = null;

  /**
   * Authenticate with Shiprocket
   */
  async authenticateShiprocket() {
    if (!config.shiprocket.email || !config.shiprocket.password) {
      return null;
    }

    // Check if token is still valid
    if (this.shiprocketToken && this.shiprocketTokenExpiry > Date.now()) {
      return this.shiprocketToken;
    }

    try {
      // Shiprocket Auth API (placeholder)
      // const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     email: config.shiprocket.email,
      //     password: config.shiprocket.password,
      //   }),
      // });
      // 
      // const data = await response.json();
      // this.shiprocketToken = data.token;
      // this.shiprocketTokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      logger.info('Shiprocket authenticated (simulated)');
      return 'simulated_token';
    } catch (error) {
      logger.error('Shiprocket auth failed', { error: error.message });
      throw new ExternalServiceError('Shiprocket', 'Authentication failed');
    }
  }

  /**
   * Create Shiprocket shipment
   * @param {Object} order - Order data
   * @param {Object} items - Order items
   */
  async createShipment(order, items) {
    const token = await this.authenticateShiprocket();
    if (!token) {
      return { success: false, reason: 'not_configured' };
    }

    try {
      const shipmentData = {
        order_id: order.order_number,
        order_date: order.created_at.split('T')[0],
        pickup_location: 'Primary', // Configure in Shiprocket
        billing_customer_name: order.shipping_name,
        billing_address: order.shipping_address,
        billing_city: order.shipping_city,
        billing_pincode: order.shipping_pincode,
        billing_state: order.shipping_state,
        billing_country: 'India',
        billing_phone: order.shipping_phone,
        shipping_is_billing: true,
        order_items: items.map(item => ({
          name: item.product_name,
          sku: item.sku,
          units: item.quantity,
          selling_price: item.unit_price,
        })),
        payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
        sub_total: order.total_amount,
      };

      // Shiprocket Create Order API (placeholder)
      // const response = await fetch('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${token}`,
      //   },
      //   body: JSON.stringify(shipmentData),
      // });
      // 
      // const data = await response.json();

      logger.info('Shipment created (simulated)', { orderId: order.id });
      return {
        success: true,
        shiprocket_order_id: 'SR_' + Date.now(),
        shipment_id: 'SHIP_' + Date.now(),
      };
    } catch (error) {
      logger.error('Shiprocket shipment creation failed', { 
        orderId: order.id, 
        error: error.message 
      });
      throw new ExternalServiceError('Shiprocket', error.message);
    }
  }

  /**
   * Track shipment
   * @param {string} awbNumber - AWB number
   */
  async trackShipment(awbNumber) {
    const token = await this.authenticateShiprocket();
    if (!token) {
      return { success: false, reason: 'not_configured' };
    }

    try {
      // Shiprocket Tracking API (placeholder)
      // const response = await fetch(
      //   `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbNumber}`,
      //   {
      //     headers: { 'Authorization': `Bearer ${token}` },
      //   }
      // );
      // 
      // return await response.json();

      return {
        success: true,
        awb: awbNumber,
        status: 'In Transit',
        last_update: new Date().toISOString(),
        activities: [],
      };
    } catch (error) {
      logger.error('Shiprocket tracking failed', { awbNumber, error: error.message });
      throw new ExternalServiceError('Shiprocket', error.message);
    }
  }

  // ===========================================================================
  // WEBHOOK HANDLERS
  // ===========================================================================

  /**
   * Process external order webhook (from Shopify, WooCommerce, etc.)
   * @param {string} source - Order source
   * @param {Object} payload - Webhook payload
   * @returns {Object} Normalized order data
   */
  normalizeExternalOrder(source, payload) {
    switch (source) {
      case 'shopify':
        return this.normalizeShopifyOrder(payload);
      case 'woocommerce':
        return this.normalizeWooCommerceOrder(payload);
      default:
        throw new Error(`Unsupported order source: ${source}`);
    }
  }

  normalizeShopifyOrder(payload) {
    // Transform Shopify order format to our internal format
    return {
      source: 'shopify',
      source_order_id: payload.id?.toString(),
      customer: {
        name: `${payload.customer?.first_name || ''} ${payload.customer?.last_name || ''}`.trim(),
        phone: payload.shipping_address?.phone || payload.customer?.phone,
        email: payload.customer?.email,
        address_line1: payload.shipping_address?.address1,
        address_line2: payload.shipping_address?.address2,
        city: payload.shipping_address?.city,
        state: payload.shipping_address?.province,
        pincode: payload.shipping_address?.zip,
      },
      items: (payload.line_items || []).map(item => ({
        sku: item.sku,
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
      })),
      discount_amount: parseFloat(payload.total_discounts || 0),
      shipping_charges: parseFloat(payload.shipping_lines?.[0]?.price || 0),
      payment_method: payload.financial_status === 'paid' ? 'prepaid' : 'cod',
    };
  }

  normalizeWooCommerceOrder(payload) {
    // Transform WooCommerce order format to our internal format
    return {
      source: 'woocommerce',
      source_order_id: payload.id?.toString(),
      customer: {
        name: `${payload.billing?.first_name || ''} ${payload.billing?.last_name || ''}`.trim(),
        phone: payload.billing?.phone,
        email: payload.billing?.email,
        address_line1: payload.shipping?.address_1,
        address_line2: payload.shipping?.address_2,
        city: payload.shipping?.city,
        state: payload.shipping?.state,
        pincode: payload.shipping?.postcode,
      },
      items: (payload.line_items || []).map(item => ({
        sku: item.sku,
        quantity: item.quantity,
        unit_price: parseFloat(item.price),
      })),
      discount_amount: parseFloat(payload.discount_total || 0),
      shipping_charges: parseFloat(payload.shipping_total || 0),
      payment_method: payload.payment_method === 'cod' ? 'cod' : 'prepaid',
    };
  }
}

export const integrationService = new IntegrationService();
export default integrationService;
