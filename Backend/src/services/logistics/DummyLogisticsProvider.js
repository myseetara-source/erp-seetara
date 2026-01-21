/**
 * Dummy Logistics Provider
 * 
 * A test implementation of LogisticsAdapter for development and testing.
 * Logs all actions to console without making real API calls.
 * 
 * Usage:
 * const adapter = await LogisticsAdapterFactory.getAdapter('dummy');
 * await adapter.pushOrder(order);  // Logs to console, returns mock data
 */

import { LogisticsAdapter, LogisticsAdapterFactory } from './LogisticsAdapter.js';
import logger from '../../utils/logger.js';

// =============================================================================
// DUMMY LOGISTICS PROVIDER
// =============================================================================

export class DummyLogisticsProvider extends LogisticsAdapter {
  constructor(providerCode, config = {}) {
    super(providerCode || 'dummy', {
      name: 'Dummy Logistics (Test)',
      webhookSecret: 'dummy_secret_key_2026',
      statusMapping: {
        'BOOKED': 'handover_to_courier',
        'PICKED': 'in_transit',
        'INTRANSIT': 'in_transit',
        'OFD': 'in_transit',
        'DELIVERED': 'delivered',
        'RTO': 'return',
        'CANCELLED': 'cancelled',
      },
      ...config,
    });
    
    // Simulate delays for realistic testing
    this.simulateDelay = config.simulateDelay ?? true;
    this.delayMs = config.delayMs ?? 500;
  }

  /**
   * Simulate network delay
   */
  async _delay() {
    if (this.simulateDelay) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
  }

  /**
   * Generate mock tracking ID
   */
  _generateTrackingId() {
    const prefix = 'DMY';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  // =========================================================================
  // IMPLEMENTATION: Push Order
  // =========================================================================

  async pushOrder(order) {
    await this._delay();
    
    const trackingId = this._generateTrackingId();
    const awbNumber = `AWB${trackingId}`;
    
    logger.info('==========================================');
    logger.info('🚚 DUMMY LOGISTICS: Order Pushed');
    logger.info('==========================================');
    logger.info(`Order Number: ${order.order_number}`);
    logger.info(`Customer: ${order.customer?.name || order.shipping_name}`);
    logger.info(`Phone: ${order.customer?.phone || order.shipping_phone}`);
    logger.info(`Address: ${order.shipping_address || order.customer?.address_line1}`);
    logger.info(`City: ${order.shipping_city || order.customer?.city}`);
    logger.info(`Amount: ₹${order.total_amount} (${order.payment_method})`);
    logger.info('------------------------------------------');
    logger.info(`Generated Tracking ID: ${trackingId}`);
    logger.info(`Generated AWB: ${awbNumber}`);
    logger.info('==========================================');

    // TODO: In real provider, this would make API call
    // Example for NCM:
    // const response = await axios.post(this.config.apiUrl + '/create-order', {
    //   apiKey: this.config.apiKey,
    //   orderDetails: { ... }
    // });

    return {
      success: true,
      trackingId,
      awbNumber,
      message: 'Order pushed successfully (SIMULATED)',
      estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // +3 days
      providerOrderId: `DUMMY-${Date.now()}`,
    };
  }

  // =========================================================================
  // IMPLEMENTATION: Pull Status
  // =========================================================================

  async pullStatus(trackingId) {
    await this._delay();
    
    // Simulate random status
    const statuses = [
      { status: 'BOOKED', location: 'Warehouse', remarks: 'Order received at hub' },
      { status: 'PICKED', location: 'Kathmandu Hub', remarks: 'Package picked up by courier' },
      { status: 'INTRANSIT', location: 'In Transit', remarks: 'On the way to destination' },
      { status: 'OFD', location: 'Local Hub', remarks: 'Out for delivery' },
      { status: 'DELIVERED', location: 'Customer Address', remarks: 'Delivered successfully' },
    ];
    
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    logger.info('==========================================');
    logger.info('📦 DUMMY LOGISTICS: Status Pulled');
    logger.info('==========================================');
    logger.info(`Tracking ID: ${trackingId}`);
    logger.info(`Status: ${randomStatus.status}`);
    logger.info(`Location: ${randomStatus.location}`);
    logger.info(`Remarks: ${randomStatus.remarks}`);
    logger.info('==========================================');

    return {
      trackingId,
      status: randomStatus.status,
      internalStatus: this.mapStatus(randomStatus.status),
      location: randomStatus.location,
      remarks: randomStatus.remarks,
      timestamp: new Date().toISOString(),
      history: statuses.slice(0, statuses.indexOf(randomStatus) + 1).map((s, i) => ({
        ...s,
        timestamp: new Date(Date.now() - (statuses.length - i) * 6 * 60 * 60 * 1000).toISOString(),
      })),
    };
  }

  // =========================================================================
  // IMPLEMENTATION: Cancel Shipment
  // =========================================================================

  async cancelShipment(trackingId, reason) {
    await this._delay();
    
    logger.info('==========================================');
    logger.info('❌ DUMMY LOGISTICS: Shipment Cancelled');
    logger.info('==========================================');
    logger.info(`Tracking ID: ${trackingId}`);
    logger.info(`Reason: ${reason}`);
    logger.info('==========================================');

    return {
      success: true,
      message: 'Shipment cancelled successfully (SIMULATED)',
      cancellationId: `CANCEL-${Date.now()}`,
    };
  }

  // =========================================================================
  // IMPLEMENTATION: Request Pickup
  // =========================================================================

  async requestPickup(pickupDetails) {
    await this._delay();
    
    logger.info('==========================================');
    logger.info('📤 DUMMY LOGISTICS: Pickup Requested');
    logger.info('==========================================');
    logger.info(`Pickup Address: ${pickupDetails.address}`);
    logger.info(`Contact: ${pickupDetails.contactPerson}`);
    logger.info(`Phone: ${pickupDetails.phone}`);
    logger.info(`Preferred Time: ${pickupDetails.preferredTime || 'Any time'}`);
    logger.info(`Packages: ${pickupDetails.packageCount || 1}`);
    logger.info('==========================================');

    return {
      success: true,
      pickupId: `PICKUP-${Date.now()}`,
      scheduledTime: pickupDetails.preferredTime || '10:00 AM - 12:00 PM',
      message: 'Pickup scheduled successfully (SIMULATED)',
    };
  }

  // =========================================================================
  // IMPLEMENTATION: Get Shipping Rates
  // =========================================================================

  async getShippingRates(shipmentDetails) {
    await this._delay();
    
    // Simple rate calculation
    const baseRate = 100;
    const weightRate = (shipmentDetails.weight || 0.5) * 50; // ₹50 per kg
    const distanceMultiplier = shipmentDetails.isOutsideValley ? 1.5 : 1;
    
    const totalCost = Math.round((baseRate + weightRate) * distanceMultiplier);
    const estimatedDays = shipmentDetails.isOutsideValley ? 3 : 1;
    
    logger.info('==========================================');
    logger.info('💰 DUMMY LOGISTICS: Rate Calculated');
    logger.info('==========================================');
    logger.info(`Origin: ${shipmentDetails.origin || 'Kathmandu'}`);
    logger.info(`Destination: ${shipmentDetails.destination}`);
    logger.info(`Weight: ${shipmentDetails.weight || 0.5} kg`);
    logger.info(`Calculated Cost: ₹${totalCost}`);
    logger.info(`Estimated Days: ${estimatedDays}`);
    logger.info('==========================================');

    return {
      cost: totalCost,
      currency: 'NPR',
      estimatedDays,
      serviceType: shipmentDetails.isOutsideValley ? 'Standard' : 'Express',
      breakdown: {
        baseRate,
        weightCharge: weightRate,
        distanceCharge: (totalCost - baseRate - weightRate),
      },
    };
  }

  // =========================================================================
  // OVERRIDE: Webhook Processing
  // =========================================================================

  normalizeWebhookData(webhookData) {
    // Dummy provider webhook format
    return {
      trackingId: webhookData.tracking_id || webhookData.trackingId,
      status: this.mapStatus(webhookData.status),
      remarks: webhookData.remarks || webhookData.comment || 'No remarks',
      location: webhookData.location || 'Unknown',
      timestamp: webhookData.timestamp || new Date().toISOString(),
      rawData: webhookData,
    };
  }

  verifyWebhookSignature(signature, payload) {
    // Dummy: Accept 'dummy_secret_key_2026' or any valid signature
    return signature === this.config.webhookSecret || signature === 'test_mode';
  }
}

// =============================================================================
// REGISTER DUMMY PROVIDER
// =============================================================================

LogisticsAdapterFactory.registerAdapter('dummy', DummyLogisticsProvider);

export default DummyLogisticsProvider;
