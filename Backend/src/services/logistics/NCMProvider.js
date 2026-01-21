/**
 * NCM Express Logistics Provider
 * 
 * Real implementation for NCM Express courier integration.
 * NCM is a popular courier service in Nepal.
 * 
 * API Documentation: https://ncm.com.np/api-docs (hypothetical)
 */

import axios from 'axios';
import { LogisticsAdapter, LogisticsAdapterFactory } from './LogisticsAdapter.js';
import logger from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

// =============================================================================
// NCM EXPRESS PROVIDER
// =============================================================================

export class NCMProvider extends LogisticsAdapter {
  constructor(providerCode, config = {}) {
    super(providerCode || 'ncm', {
      name: 'NCM Express',
      statusMapping: {
        // NCM status codes -> Our internal statuses
        'BOOKED': 'handover_to_courier',
        'RCVD': 'handover_to_courier',
        'MANIFESTED': 'handover_to_courier',
        'PKP': 'in_transit',           // Picked up
        'PKD': 'in_transit',           // Picked
        'INTRANSIT': 'in_transit',
        'IT': 'in_transit',
        'ARR': 'in_transit',           // Arrived at hub
        'OFD': 'in_transit',           // Out for delivery
        'DLV': 'delivered',
        'DLVD': 'delivered',
        'DELIVERED': 'delivered',
        'RTO': 'return',               // Return to origin
        'RTOD': 'return',              // RTO Delivered
        'CNCL': 'cancelled',
        'CANCELLED': 'cancelled',
        'HLD': 'hold',                 // On hold
        'NDR': 'hold',                 // Non-delivery report
        'UND': 'hold',                 // Undelivered
      },
      ...config,
    });
    
    this.apiClient = axios.create({
      baseURL: config.apiUrl || 'https://api.ncm.com.np/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });
  }

  // =========================================================================
  // IMPLEMENTATION: Push Order
  // =========================================================================

  async pushOrder(order) {
    try {
      // Format order data for NCM API
      const payload = {
        reference_number: order.order_number,
        consignee_name: order.shipping_name || order.customer?.name,
        consignee_phone: order.shipping_phone || order.customer?.phone,
        consignee_address: order.shipping_address || order.customer?.address_line1,
        consignee_city: order.shipping_city || order.customer?.city,
        consignee_pincode: order.shipping_pincode || order.customer?.pincode,
        
        // Package details
        weight: 0.5, // kg - would calculate from items
        dimensions: {
          length: 20,
          width: 15,
          height: 10,
        },
        
        // Payment
        cod_amount: order.payment_method === 'cod' ? order.total_amount : 0,
        declared_value: order.total_amount,
        
        // Items description
        product_description: `Order ${order.order_number} - ${order.item_count || 1} items`,
        
        // Pickup address (your warehouse)
        pickup_address: {
          name: 'ERP Warehouse',
          phone: '9800000000', // From config
          address: 'Kathmandu Office',
          city: 'Kathmandu',
        },
      };

      logger.info(`Pushing order ${order.order_number} to NCM Express`);

      // Make API call
      const response = await this.apiClient.post('/shipments/create', payload);

      if (!response.data.success) {
        throw new AppError(
          response.data.message || 'NCM API error',
          400,
          'NCM_API_ERROR'
        );
      }

      logger.info(`Order ${order.order_number} pushed to NCM. Tracking: ${response.data.tracking_id}`);

      return {
        success: true,
        trackingId: response.data.tracking_id,
        awbNumber: response.data.awb_number,
        message: 'Order pushed to NCM Express',
        estimatedDelivery: response.data.estimated_delivery,
        providerOrderId: response.data.order_id,
      };
    } catch (error) {
      logger.error(`NCM pushOrder failed: ${error.message}`);
      
      // If it's an Axios error, extract the response
      if (error.response) {
        throw new AppError(
          error.response.data?.message || 'NCM API request failed',
          error.response.status,
          'NCM_API_ERROR'
        );
      }
      
      throw error;
    }
  }

  // =========================================================================
  // IMPLEMENTATION: Pull Status
  // =========================================================================

  async pullStatus(trackingId) {
    try {
      logger.info(`Pulling status for ${trackingId} from NCM Express`);

      const response = await this.apiClient.get(`/shipments/track/${trackingId}`);

      if (!response.data.success) {
        throw new AppError(
          response.data.message || 'Tracking not found',
          404,
          'TRACKING_NOT_FOUND'
        );
      }

      const data = response.data.data;

      return {
        trackingId,
        status: data.current_status,
        internalStatus: this.mapStatus(data.current_status),
        location: data.current_location,
        remarks: data.current_remarks,
        timestamp: data.last_update,
        expectedDelivery: data.expected_delivery,
        history: data.tracking_history?.map(h => ({
          status: h.status,
          internalStatus: this.mapStatus(h.status),
          location: h.location,
          remarks: h.remarks,
          timestamp: h.timestamp,
        })),
      };
    } catch (error) {
      logger.error(`NCM pullStatus failed: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // IMPLEMENTATION: Cancel Shipment
  // =========================================================================

  async cancelShipment(trackingId, reason) {
    try {
      logger.info(`Cancelling shipment ${trackingId} with NCM Express`);

      const response = await this.apiClient.post(`/shipments/${trackingId}/cancel`, {
        reason,
      });

      return {
        success: response.data.success,
        message: response.data.message || 'Shipment cancelled',
        cancellationId: response.data.cancellation_id,
      };
    } catch (error) {
      logger.error(`NCM cancelShipment failed: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // IMPLEMENTATION: Request Pickup
  // =========================================================================

  async requestPickup(pickupDetails) {
    try {
      logger.info('Requesting pickup from NCM Express');

      const response = await this.apiClient.post('/pickups/schedule', {
        pickup_address: pickupDetails.address,
        contact_person: pickupDetails.contactPerson,
        contact_phone: pickupDetails.phone,
        preferred_date: pickupDetails.preferredDate,
        preferred_time_slot: pickupDetails.preferredTime,
        package_count: pickupDetails.packageCount || 1,
        remarks: pickupDetails.remarks,
      });

      return {
        success: response.data.success,
        pickupId: response.data.pickup_id,
        scheduledTime: response.data.scheduled_time,
        message: response.data.message || 'Pickup scheduled',
      };
    } catch (error) {
      logger.error(`NCM requestPickup failed: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // IMPLEMENTATION: Get Shipping Rates
  // =========================================================================

  async getShippingRates(shipmentDetails) {
    try {
      const response = await this.apiClient.post('/rates/calculate', {
        origin_city: shipmentDetails.origin || 'Kathmandu',
        destination_city: shipmentDetails.destination,
        weight: shipmentDetails.weight || 0.5,
        cod_amount: shipmentDetails.codAmount || 0,
      });

      return {
        cost: response.data.total_cost,
        currency: 'NPR',
        estimatedDays: response.data.estimated_days,
        serviceType: response.data.service_type,
        breakdown: {
          baseRate: response.data.base_rate,
          weightCharge: response.data.weight_charge,
          fuelSurcharge: response.data.fuel_surcharge,
          codCharge: response.data.cod_charge,
        },
      };
    } catch (error) {
      logger.error(`NCM getShippingRates failed: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // OVERRIDE: Webhook Processing
  // =========================================================================

  /**
   * NCM webhook payload structure:
   * {
   *   "awb_number": "NCM123456789",
   *   "status_code": "DLVD",
   *   "status_description": "Delivered",
   *   "location": "Pokhara",
   *   "remarks": "Delivered to customer",
   *   "receiver_name": "Ram Sharma",
   *   "timestamp": "2026-01-19T10:30:00Z",
   *   "signature": "abc123..."
   * }
   */
  normalizeWebhookData(webhookData) {
    return {
      trackingId: webhookData.awb_number || webhookData.tracking_id,
      status: this.mapStatus(webhookData.status_code),
      remarks: webhookData.remarks || webhookData.status_description,
      location: webhookData.location,
      timestamp: webhookData.timestamp,
      receiverName: webhookData.receiver_name,
      rawData: webhookData,
    };
  }

  verifyWebhookSignature(signature, payload) {
    // NCM uses HMAC-SHA256 signature verification
    // For now, simple secret matching
    // TODO: Implement proper HMAC verification
    // const crypto = require('crypto');
    // const expectedSignature = crypto
    //   .createHmac('sha256', this.config.webhookSecret)
    //   .update(JSON.stringify(payload))
    //   .digest('hex');
    // return signature === expectedSignature;
    
    return signature === this.config.webhookSecret;
  }
}

// =============================================================================
// REGISTER NCM PROVIDER
// =============================================================================

LogisticsAdapterFactory.registerAdapter('ncm', NCMProvider);

export default NCMProvider;
