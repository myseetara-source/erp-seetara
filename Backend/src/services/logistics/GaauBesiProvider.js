/**
 * Gaau Besi Logistics Provider
 * 
 * Integration for Gaau Besi courier service in Nepal.
 * 
 * API Documentation: https://delivery.gaaubesi.com/api/v1/
 * Testing API: https://testing.gaaubesi.com.np/api/v1/
 * 
 * Features:
 * - Create Order (Push to Gaau Besi)
 * - Get Order Details
 * - Get Order Status
 * - Get Order Comments
 * - Post Order Comments
 * 
 * @priority P0 - Gaau Besi Integration
 */

import axios from 'axios';
import { LogisticsAdapter, LogisticsAdapterFactory } from './LogisticsAdapter.js';
import logger from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { formatPackageDescription, getVendorReference, formatInstruction } from '../../utils/logisticsHelper.js';
import {
  GAAUBESI_STATUS_MAP,
  ORDER_STATUS,
  LOGISTICS_PROVIDER,
  PAYMENT_METHOD,
} from '../../constants/index.js';

// =============================================================================
// CONSTANTS (P1 REFACTOR: Status mapping now imported from centralized constants)
// =============================================================================

// Common destination branches in Nepal
export const GAAU_BESI_BRANCHES = [
  { code: 'HEAD OFFICE', name: 'Head Office', city: 'Kathmandu' },
  { code: 'ITAHARI', name: 'Itahari', city: 'Itahari' },
  { code: 'BIRATNAGAR', name: 'Biratnagar', city: 'Biratnagar' },
  { code: 'DHARAN', name: 'Dharan', city: 'Dharan' },
  { code: 'POKHARA', name: 'Pokhara', city: 'Pokhara' },
  { code: 'BUTWAL', name: 'Butwal', city: 'Butwal' },
  { code: 'BHARATPUR', name: 'Bharatpur/Narayanghat', city: 'Chitwan' },
  { code: 'NEPALGUNJ', name: 'Nepalgunj', city: 'Nepalgunj' },
  { code: 'DHANGADHI', name: 'Dhangadhi', city: 'Dhangadhi' },
  { code: 'BIRGUNJ', name: 'Birgunj', city: 'Birgunj' },
  { code: 'HETAUDA', name: 'Hetauda', city: 'Hetauda' },
  { code: 'JANAKPUR', name: 'Janakpur', city: 'Janakpur' },
  { code: 'LAHAN', name: 'Lahan', city: 'Lahan' },
  { code: 'RAJBIRAJ', name: 'Rajbiraj', city: 'Rajbiraj' },
  { code: 'DAMAK', name: 'Damak', city: 'Damak' },
  { code: 'GORKHA', name: 'Gorkha', city: 'Gorkha' },
  { code: 'BANEPA', name: 'Banepa', city: 'Banepa' },
  { code: 'DHULIKHEL', name: 'Dhulikhel', city: 'Dhulikhel' },
];

// =============================================================================
// GAAU BESI PROVIDER
// =============================================================================

export class GaauBesiProvider extends LogisticsAdapter {
  constructor(providerCode, config = {}) {
    super(providerCode || 'gaaubesi', {
      name: 'Gaau Besi',
      // P1 REFACTOR: Using imported GAAUBESI_STATUS_MAP from centralized constants
      statusMapping: GAAUBESI_STATUS_MAP,
      ...config,
    });

    // API Configuration from environment
    const apiUrl = process.env.GAAU_BESI_API_URL || 'https://testing.gaaubesi.com.np/api/v1';
    const apiToken = process.env.GAAU_BESI_API_TOKEN;

    if (!apiToken) {
      logger.warn('GAAU_BESI_API_TOKEN not configured. API calls will fail.');
    }

    this.apiClient = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiToken}`,
      },
    });

    // Log request/response for debugging
    this.apiClient.interceptors.request.use((config) => {
      logger.debug(`[GaauBesi] Request: ${config.method?.toUpperCase()} ${config.url}`, {
        data: config.data,
      });
      return config;
    });

    this.apiClient.interceptors.response.use(
      (response) => {
        logger.debug(`[GaauBesi] Response: ${response.status}`, {
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error(`[GaauBesi] Error: ${error.response?.status || error.message}`, {
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );

    logger.info('[GaauBesi] Provider initialized', { apiUrl });
  }

  // =========================================================================
  // IMPLEMENTATION: Push Order (Create Order) - P0 ENHANCED
  // =========================================================================

  /**
   * Create order in Gaau Besi system
   * 
   * GAAU BESI API PARAMETERS (POST /order/create/):
   * - branch (required): Source branch (our pickup location) - HARDCODED to HEAD OFFICE
   * - destination_branch (required): Delivery branch name
   * - receiver_name (required): Customer name
   * - receiver_number (required): 10-digit phone number
   * - receiver_address (required): Delivery address
   * - cod_charge (required): COD amount (0 if prepaid)
   * - delivery_type (required): 'Drop Off' (D2D) or 'Pickup' (D2B/Branch Pickup)
   * - package_type (optional): Package description
   * - package_access (optional): "Can't Open" (COD) or "Can Open" (Prepaid)
   * - alt_receiver_number (optional): Secondary phone
   * - remarks (optional): Order notes
   * 
   * @param {Object} order - Order object from our system
   * @param {Object} options - Additional options
   * @param {string} options.destinationBranch - Branch code for delivery
   * @param {string} options.deliveryType - 'D2D' or 'D2B'
   * @returns {Promise<{success: boolean, trackingId: string, message: string}>}
   */
  async pushOrder(order, options = {}) {
    console.log('\n========================================');
    console.log('🚀 [GaauBesi] Starting Order Creation');
    console.log('========================================');
    
    try {
      // =========================================================================
      // STEP 0: Validate order object
      // =========================================================================
      if (!order) {
        throw new AppError('Order object is required', 400, 'VALIDATION_ERROR');
      }

      console.log('📋 [GaauBesi] Order Input:', {
        id: order.id,
        readable_id: order.readable_id,
        shipping_name: order.shipping_name,
        shipping_phone: order.shipping_phone,
        shipping_address: order.shipping_address,
        destination_branch: order.destination_branch,
        delivery_type: order.delivery_type,
        payment_method: order.payment_method,
        payable_amount: order.payable_amount,
        total_amount: order.total_amount,
        items_count: order.items?.length || 0,
      });

      // =========================================================================
      // STEP 1: Extract & Sanitize REQUIRED fields
      // =========================================================================
      
      // 1a. Customer Name (trim whitespace)
      const rawName = order.shipping_name || order.customer_name || order.customer?.name || '';
      const customerName = rawName.trim();
      if (!customerName) {
        throw new AppError('GBL Rejected: Customer name is missing', 400, 'VALIDATION_ERROR');
      }

      // 1b. Phone Number (CRITICAL: 10 digits required)
      const rawPhone = order.shipping_phone || order.customer_phone || order.customer?.phone || '';
      const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
      console.log(`📞 [GaauBesi] Phone Sanitization: "${rawPhone}" → "${cleanPhone}"`);
      
      if (!cleanPhone || cleanPhone.length !== 10) {
        throw new AppError(`GBL Rejected: Invalid Phone Number (must be 10 digits, got: ${cleanPhone.length || 0})`, 400, 'VALIDATION_ERROR');
      }

      // 1c. Secondary Phone (optional, sanitize same way)
      const rawPhone2 = order.alt_phone || order.customer_phone_secondary || '';
      const cleanPhone2 = rawPhone2 ? String(rawPhone2).replace(/\D/g, '').slice(-10) : '';
      const phone2Value = cleanPhone2.length === 10 ? cleanPhone2 : '';

      // 1d. Address (trim, required)
      const rawAddress = order.shipping_address || order.customer_address || order.customer?.address_line1 || '';
      const customerAddress = rawAddress.trim();
      if (!customerAddress) {
        throw new AppError('GBL Rejected: Customer address is missing', 400, 'VALIDATION_ERROR');
      }

      // 1e. Destination Branch (required)
      const destinationBranch = (options.destinationBranch || order.destination_branch || 'HEAD OFFICE').trim().toUpperCase();

      // =========================================================================
      // STEP 2: Calculate COD Amount
      // P1 REFACTOR: Using PAYMENT_METHOD constant
      // =========================================================================
      const isCOD = !order.payment_method || order.payment_method?.toLowerCase() === PAYMENT_METHOD.COD;
      // Use payable_amount (includes shipping), fallback to total_amount
      const codAmount = isCOD ? Math.round(order.payable_amount || order.total_amount || 0) : 0;
      console.log(`💰 [GaauBesi] COD: isCOD=${isCOD}, amount=${codAmount}`);

      // =========================================================================
      // STEP 3: Generate CLEAN Product & Package Descriptions
      // Format: "Ladies Work Bag * 3, Macbook Air * 2" (NO variants, NO SKUs)
      // =========================================================================
      const productDescription = formatPackageDescription(order.items, 250);
      const vendorRef = getVendorReference(order);
      const instructionText = formatInstruction(order);
      console.log(`📦 [GaauBesi] Description: "${productDescription}"`);
      console.log(`🏷️ [GaauBesi] Vendor Ref: "${vendorRef}"`);
      console.log(`📝 [GaauBesi] Instruction: "${instructionText}"`);

      // =========================================================================
      // STEP 4: Delivery Type (HARDCODED to "Pickup" per business requirement)
      // P0 FIX: GBL orders outside valley are always branch pickups
      // =========================================================================
      const gblDeliveryType = 'Pickup'; // HARDCODED - Do not change without business approval
      console.log(`🚚 [GaauBesi] Delivery Type: HARDCODED → "Pickup"`);

      // =========================================================================
      // STEP 5: Construct the Payload (STRICT GBL API MAPPING)
      // =========================================================================
      const sourceBranch = process.env.GAAU_BESI_SOURCE_BRANCH || 'HEAD OFFICE';
      
      const payload = {
        // REQUIRED FIELDS
        branch: sourceBranch,                      // Source branch (our pickup location)
        destination_branch: destinationBranch,    // Delivery branch
        receiver_name: customerName,              // Customer name
        receiver_number: cleanPhone,              // Sanitized 10-digit phone
        receiver_address: customerAddress,        // Delivery address
        cod_charge: codAmount,                    // COD amount (NUMBER, not string)
        delivery_type: gblDeliveryType,           // HARDCODED: 'Pickup' (Branch Pickup)
        
        // OPTIONAL FIELDS — P0 FIX: Clean, readable data for courier labels
        product_name: productDescription,         // "Ladies Work Bag * 3, Macbook Air * 2"
        alt_receiver_number: phone2Value,         // Secondary phone
        package_type: productDescription,         // Same clean format for package field
        package_access: isCOD ? "Can't Open" : 'Can Open', // Package inspection rule
        remarks: instructionText,                 // "Order #26-02-06-104 | Handle with care"
        order_contact_name: vendorRef,            // Source name: "Seetara" or "Today Trend"
        order_contact_number: process.env.COMPANY_PHONE || '9802359033',
      };

      // =========================================================================
      // STEP 6: Log payload for debugging
      // =========================================================================
      console.log('\n📤 [GaauBesi] FINAL PAYLOAD:');
      console.log(JSON.stringify(payload, null, 2));
      console.log('');

      logger.info(`[GaauBesi] Creating order`, {
        orderNumber: order.readable_id || order.order_number,
        destinationBranch,
        deliveryType: gblDeliveryType,
        codAmount,
        phone: cleanPhone,
      });

      // =========================================================================
      // STEP 7: Execute POST request to Gaau Besi API
      // =========================================================================
      console.log(`🌐 [GaauBesi] POST /order/create/`);
      
      const response = await this.apiClient.post('/order/create/', payload);

      console.log('\n📥 [GaauBesi] RESPONSE:');
      console.log(JSON.stringify(response.data, null, 2));

      // =========================================================================
      // STEP 8: COMPREHENSIVE RESPONSE VALIDATION (P0 FIX - Prevent Ghost Orders)
      // 
      // GBL API can return HTTP 200 with errors in the body. We must validate:
      // 1. response.data.success === false - Explicit failure flag
      // 2. response.data.error - Error object or string
      // 3. response.data.errors - Array of validation errors
      // 4. response.data.message containing error keywords
      // 5. Missing order_id - No tracking ID returned
      // =========================================================================
      
      // Check 1: Explicit success=false flag
      if (response.data?.success === false) {
        const errorDetails = response.data.error || response.data.message || response.data;
        const userFriendlyError = this._extractUserFriendlyError(errorDetails);
        console.error('❌ [GaauBesi] API returned success=false:', JSON.stringify(errorDetails, null, 2));
        throw new AppError(userFriendlyError, 400, 'GBL_API_ERROR');
      }

      // Check 2: Error object or string
      if (response.data?.error) {
        const errorDetails = response.data.error;
        const userFriendlyError = this._extractUserFriendlyError(errorDetails);
        console.error('❌ [GaauBesi] API returned error:', JSON.stringify(errorDetails, null, 2));
        throw new AppError(userFriendlyError, 400, 'GBL_API_ERROR');
      }

      // Check 3: Errors array (validation errors)
      if (response.data?.errors && Array.isArray(response.data.errors) && response.data.errors.length > 0) {
        const errorMessages = response.data.errors.map(e => 
          typeof e === 'string' ? e : (e.message || e.msg || JSON.stringify(e))
        ).join(', ');
        console.error('❌ [GaauBesi] API returned errors array:', response.data.errors);
        throw new AppError(`GBL Rejected: ${errorMessages}`, 400, 'GBL_API_ERROR');
      }

      // Check 4: Error keywords in message (edge case detection)
      if (response.data?.message) {
        const msg = response.data.message.toLowerCase();
        if (msg.includes('error') || msg.includes('failed') || msg.includes('invalid') || msg.includes('rejected')) {
          // Only treat as error if success is not explicitly true
          if (response.data.success !== true && !response.data.order_id) {
            console.error('❌ [GaauBesi] API message indicates error:', response.data.message);
            throw new AppError(`GBL Rejected: ${response.data.message}`, 400, 'GBL_API_ERROR');
          }
        }
      }

      // Check 5: Missing order_id (required for success)
      const trackingId = response.data.order_id || response.data.tracking_id || response.data.id;
      
      if (!trackingId) {
        console.error('❌ [GaauBesi] No order_id in response');
        console.error('❌ Full response:', JSON.stringify(response.data, null, 2));
        throw new AppError('GBL did not return order ID - order may not have been created', 500, 'GBL_API_ERROR');
      }

      console.log('\n✅ ========================================');
      console.log(`✅ [GaauBesi] ORDER CREATED SUCCESSFULLY`);
      console.log(`✅ GBL Order ID: ${trackingId}`);
      console.log('✅ ========================================\n');

      logger.info(`[GaauBesi] Order created successfully`, {
        orderNumber: order.readable_id || order.order_number,
        gblOrderId: trackingId,
      });

      return {
        success: true,
        trackingId: String(trackingId),
        awbNumber: String(trackingId),
        waybill: String(trackingId),
        message: response.data.message || 'Order created successfully',
        providerOrderId: trackingId,
        rawResponse: response.data,
      };
    } catch (error) {
      console.error('\n❌ ========================================');
      console.error('❌ [GaauBesi] ORDER CREATION FAILED');
      console.error('❌ ========================================');
      console.error('❌ Error Message:', error.message);
      
      if (error.response) {
        console.error('❌ HTTP Status:', error.response.status);
        console.error('❌ GBL Error Details:', JSON.stringify(error.response.data || 'No data', null, 2));
      }
      console.error('');

      logger.error(`[GaauBesi] pushOrder failed`, {
        orderNumber: order?.readable_id || order?.order_number,
        error: error.message,
        httpStatus: error.response?.status,
        responseData: error.response?.data,
      });

      // Re-throw AppError as-is
      if (error instanceof AppError) {
        throw error;
      }

      // Extract meaningful error from API response
      if (error.response?.data) {
        const errorDetails = error.response.data?.error || error.response.data;
        const userFriendlyError = this._extractUserFriendlyError(errorDetails);
        throw new AppError(userFriendlyError, error.response.status || 400, 'GBL_API_ERROR');
      }

      throw new AppError(`GBL API Error: ${error.message}`, 500, 'GBL_API_ERROR');
    }
  }

  // =========================================================================
  // HELPER: Map Internal Delivery Type to GBL Enum
  // =========================================================================

  /**
   * Map our internal delivery_type to Gaau Besi's enum values
   * 
   * GBL delivery_type values:
   * - 'Drop Off': Home delivery (D2D)
   * - 'Pickup': Branch pickup (D2B)
   * 
   * @param {string} internalType - Our internal type ('D2D', 'D2B', etc.)
   * @returns {string} GBL delivery type
   */
  _mapDeliveryType(internalType) {
    // P0 FIX: Default to "Pickup" (Branch Pickup) as per business requirement
    // GBL outside valley orders are typically branch pickups
    if (!internalType) {
      return 'Pickup'; // Default to branch pickup
    }

    const normalized = internalType.toLowerCase().trim();

    // D2D / Home Delivery (only if explicitly specified)
    if (
      normalized === 'd2d' ||
      normalized === 'drop off' ||
      normalized === 'dropoff' ||
      normalized === 'home delivery' ||
      normalized === 'home_delivery'
    ) {
      return 'Drop Off';
    }

    // Default to Pickup (D2B / Branch Pickup)
    return 'Pickup';
  }

  // =========================================================================
  // HELPER: Generate Product String (for product_name / Description field)
  // =========================================================================

  /**
   * Generate detailed product description for GBL "Description" field
   * Format: "Product Name (Variant) [SKU: xxx] x Qty, ..."
   * Example: "Winter Jacket (XL) [SKU: SKU-99] x 1, Socks (Free) x 2"
   * Max Length: 250 characters
   * 
   * @param {Array} items - Order items array
   * @returns {string} Formatted product string
   */
  _generateProductString(items) {
    if (!items || items.length === 0) {
      return 'Package';
    }

    const MAX_LENGTH = 250;
    const itemStrings = [];

    for (const item of items) {
      const productName = item.product_name || item.name || item.product?.name || 'Item';
      const variant = item.variant_name || item.variant || '';
      const sku = item.sku || '';
      const quantity = item.quantity || 1;

      let itemStr = productName;
      if (variant) itemStr += ` (${variant})`;
      if (sku) itemStr += ` [SKU: ${sku}]`;
      itemStr += ` x ${quantity}`;
      
      itemStrings.push(itemStr);
    }

    let result = itemStrings.join(', ');

    // Truncate if too long
    if (result.length > MAX_LENGTH) {
      const itemCount = items.length;
      const suffix = ` +${itemCount - 1} more items`;
      const maxFirstItemLen = MAX_LENGTH - suffix.length;
      result = itemStrings[0].substring(0, maxFirstItemLen) + suffix;
    }

    return result;
  }

  // =========================================================================
  // HELPER: Generate Package String (for package_type field - legacy)
  // =========================================================================

  /**
   * Generate package description from order items
   * Format: "Product Name (Variant) x Qty + ..."
   * Max Length: 200 characters
   */
  _generatePackageString(order) {
    if (!order.items || order.items.length === 0) {
      return `Order ${order.readable_id || order.order_number}`;
    }

    const MAX_LENGTH = 200;
    const itemStrings = [];

    for (const item of order.items) {
      const productName = item.product_name || item.name || 'Item';
      const variant = item.variant_name || item.variant || '';
      const sku = item.sku || '';
      const quantity = item.quantity || 1;

      let itemStr = productName;
      if (variant) itemStr += ` (${variant})`;
      if (sku) itemStr += ` [${sku}]`;
      itemStr += ` x ${quantity}`;
      
      itemStrings.push(itemStr);
    }

    let result = itemStrings.join(' + ');

    if (result.length > MAX_LENGTH) {
      const itemCount = order.items.length;
      const suffix = ` +${itemCount - 1} more items`;
      const maxFirstItemLen = MAX_LENGTH - suffix.length;
      result = itemStrings[0].substring(0, maxFirstItemLen) + suffix;
    }

    return result;
  }

  // =========================================================================
  // HELPER: Extract User-Friendly Error
  // =========================================================================

  /**
   * Convert GBL error response to user-friendly message
   */
  _extractUserFriendlyError(errorData) {
    if (typeof errorData === 'string') {
      return `GBL Rejected: ${errorData}`;
    }

    if (errorData && typeof errorData === 'object') {
      const errorMessages = [];
      
      const fieldLabels = {
        receiver_number: 'Phone Number',
        receiver_name: 'Customer Name',
        receiver_address: 'Address',
        destination_branch: 'Branch',
        branch: 'Source Branch',
        cod_charge: 'COD Amount',
        delivery_type: 'Delivery Type',
      };

      for (const [field, message] of Object.entries(errorData)) {
        if (field === 'success') continue;
        const label = fieldLabels[field] || field;
        if (typeof message === 'string') {
          errorMessages.push(`${label}: ${message}`);
        } else if (Array.isArray(message)) {
          errorMessages.push(`${label}: ${message.join(', ')}`);
        }
      }

      if (errorMessages.length > 0) {
        return `GBL Rejected: ${errorMessages.join('; ')}`;
      }

      if (errorData.message) return `GBL Rejected: ${errorData.message}`;
      if (errorData.error) return `GBL Rejected: ${errorData.error}`;
      if (errorData.detail) return `GBL Rejected: ${errorData.detail}`;
    }

    return 'GBL Rejected: Unknown error from Gaau Besi API';
  }

  // =========================================================================
  // IMPLEMENTATION: Pull Status (Get Order Status)
  // =========================================================================

  async pullStatus(trackingId) {
    try {
      logger.info(`[GaauBesi] Pulling status for ${trackingId}`);

      const response = await this.apiClient.get('/order/status/', {
        params: { order_id: trackingId },
      });

      if (!response.data.success) {
        throw new AppError(
          response.data.message || 'Failed to get status',
          404,
          'TRACKING_NOT_FOUND'
        );
      }

      const statusText = response.data.status?.[0] || 'Unknown';

      return {
        trackingId,
        status: statusText,
        internalStatus: this.mapStatus(statusText),
        location: null,
        remarks: statusText,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`[GaauBesi] pullStatus failed: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // IMPLEMENTATION: Get Order Details
  // =========================================================================

  async getOrderDetails(trackingId) {
    try {
      logger.info(`[GaauBesi] Getting order details for ${trackingId}`);

      const response = await this.apiClient.get('/order/detail/', {
        params: { order_id: trackingId },
      });

      if (!response.data.success) {
        throw new AppError(
          response.data.message || 'Order not found',
          404,
          'ORDER_NOT_FOUND'
        );
      }

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error(`[GaauBesi] getOrderDetails failed: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // IMPLEMENTATION: Get Order Comments
  // =========================================================================

  async getOrderComments(trackingId) {
    try {
      const response = await this.apiClient.get('/order/comment/list/', {
        params: { order_id: trackingId },
      });

      if (!response.data.success) {
        return { success: true, comments: [] };
      }

      return {
        success: true,
        comments: response.data.comments || [],
      };
    } catch (error) {
      logger.error(`[GaauBesi] getOrderComments failed: ${error.message}`);
      return { success: false, comments: [] };
    }
  }

  // =========================================================================
  // IMPLEMENTATION: Post Order Comment
  // =========================================================================

  async postOrderComment(trackingId, comment) {
    try {
      const response = await this.apiClient.post('/order/comment/create/', {
        order: trackingId,
        comments: comment,
      });

      return {
        success: response.data.success,
        message: response.data.message || 'Comment posted',
      };
    } catch (error) {
      logger.error(`[GaauBesi] postOrderComment failed: ${error.message}`);
      throw error;
    }
  }

  // =========================================================================
  // IMPLEMENTATION: Cancel Shipment (Not supported - placeholder)
  // =========================================================================

  async cancelShipment(trackingId, reason) {
    logger.warn(`[GaauBesi] cancelShipment not implemented`);
    return {
      success: false,
      message: 'Cancel shipment not supported via API. Please contact Gaau Besi support.',
    };
  }

  // =========================================================================
  // IMPLEMENTATION: Request Pickup (Not supported - placeholder)
  // =========================================================================

  async requestPickup(pickupDetails) {
    logger.warn(`[GaauBesi] requestPickup not implemented`);
    return {
      success: false,
      message: 'Request pickup not supported via API. Please contact Gaau Besi support.',
    };
  }

  // =========================================================================
  // IMPLEMENTATION: Get Shipping Rates
  // =========================================================================

  async getShippingRates(shipmentDetails) {
    try {
      const response = await this.apiClient.get('/locations_data/');

      if (!response.data) {
        throw new AppError('Failed to get rates', 400, 'RATES_ERROR');
      }

      // Rates are returned as { "LOCATION": rate }
      const destination = shipmentDetails.destination?.toUpperCase();
      const rate = response.data[destination] || response.data['KATHMANDU'] || 150;

      return {
        cost: rate,
        currency: 'NPR',
        estimatedDays: 3,
        serviceType: 'Standard',
        breakdown: {
          baseRate: rate,
        },
      };
    } catch (error) {
      logger.error(`[GaauBesi] getShippingRates failed: ${error.message}`);
      // Return default rate on error
      return {
        cost: 150,
        currency: 'NPR',
        estimatedDays: 3,
        serviceType: 'Standard',
      };
    }
  }

  // =========================================================================
  // GET BRANCHES WITH RATES (From API)
  // =========================================================================

  /**
   * Fetch branches with delivery rates from Gaau Besi API
   * API returns: { "ITAHARI": 200, "POKHARA": 180, ... }
   * 
   * @returns {Promise<Array<{label: string, value: string, rate: number}>>}
   */
  async getBranchesWithRates() {
    try {
      logger.info('[GaauBesi] Fetching branches with rates from API');
      
      const response = await this.apiClient.get('/locations_data/');
      
      if (!response.data || typeof response.data !== 'object') {
        throw new AppError('Invalid response from locations API', 400, 'API_ERROR');
      }

      // Map { "BRANCH": rate } to array format with enhanced labels
      const branches = Object.entries(response.data).map(([branchName, rate]) => ({
        label: `${branchName} - Rs. ${rate}`,  // e.g., "ITAHARI - Rs. 200"
        value: branchName,
        rate: typeof rate === 'number' ? rate : parseInt(rate, 10) || 0,
      }));

      // Sort alphabetically by name
      branches.sort((a, b) => a.value.localeCompare(b.value));

      logger.info(`[GaauBesi] Fetched ${branches.length} branches with rates`);
      return branches;
    } catch (error) {
      logger.error(`[GaauBesi] getBranchesWithRates failed: ${error.message}`);
      
      // Fallback to static branches if API fails
      return GAAU_BESI_BRANCHES.map(b => ({
        label: `${b.name} (${b.city})`,
        value: b.code,
        rate: 150, // Default rate
      }));
    }
  }

  // =========================================================================
  // STATIC: Get Branches List (Legacy)
  // =========================================================================

  static getBranches() {
    return GAAU_BESI_BRANCHES;
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Extract error message from API response (legacy method)
   */
  _extractErrorMessage(responseData) {
    return this._extractUserFriendlyError(responseData);
  }
}

// =============================================================================
// REGISTER GAAU BESI PROVIDER
// =============================================================================

LogisticsAdapterFactory.registerAdapter('gaaubesi', GaauBesiProvider);
LogisticsAdapterFactory.registerAdapter('gaau_besi', GaauBesiProvider);
LogisticsAdapterFactory.registerAdapter('gaau-besi', GaauBesiProvider);

export default GaauBesiProvider;
