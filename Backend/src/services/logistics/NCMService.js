/**
 * NCM (Nepal Can Move) Logistics Service
 * 
 * P0 Integration for Nepal Can Move courier API.
 * 
 * API VERSIONING (IMPORTANT):
 * - V2 Endpoints: /api/v2/branches, /api/v2/tracking
 * - V1 Endpoints: /api/v1/shipping-rate, /api/v1/order/create
 * 
 * The NCM_API_URL env var may point to v2, but we extract the origin
 * and construct versioned URLs as needed.
 * 
 * Features:
 * - Get Branches: Fetch available destination branches (V2)
 * - Get Shipping Rate: Calculate delivery cost (V1)
 * - Create Order: Push order to NCM and get tracking ID (V1)
 * - Get Order Status: Track shipment status
 * - Get Order Details: Full order information
 * - Cancel Order: Cancel shipment if allowed
 * 
 * @priority P0 - NCM Logistics Integration
 */

import axios from 'axios';
import logger from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { getNcmEndpoint, extractNcmOrigin } from '../../utils/ncmUrlHelper.js';
import { 
  NCM_STATUS_MAP, 
  ORDER_STATUS, 
  LOGISTICS_PROVIDER,
  PAYMENT_METHOD,
} from '../../constants/index.js';

// =============================================================================
// CONSTANTS (P1 REFACTOR: Now imported from centralized constants)
// =============================================================================
// NCM_STATUS_MAP is now imported from constants/index.js

// =============================================================================
// NCM SERVICE CLASS
// =============================================================================

class NCMService {
  constructor() {
    this.apiUrl = process.env.NCM_API_URL || 'https://api.nepalcanmove.com/api/v2';
    this.apiToken = process.env.NCM_API_TOKEN;
    this.sourceBranch = process.env.NCM_SOURCE_BRANCH || 'TINKUNE';

    if (!this.apiToken) {
      logger.warn('[NCMService] NCM_API_TOKEN not configured. API calls will fail.');
    }

    // Create axios client with default config
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.apiToken}`,
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`[NCMService] Request: ${config.method?.toUpperCase()} ${config.url}`, {
          data: config.data,
        });
        return config;
      },
      (error) => {
        logger.error('[NCMService] Request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`[NCMService] Response: ${response.status}`, {
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error(`[NCMService] Response error: ${error.response?.status || error.message}`, {
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );

    logger.info('[NCMService] Initialized', { apiUrl: this.apiUrl });
  }

  // ===========================================================================
  // GET BRANCHES
  // ===========================================================================

  /**
   * Fetch available destination branches from NCM API
   * 
   * NOTE: This method STRICTLY calls the NCM API. No fallback mock data.
   * Frontend should cache branches locally and handle errors gracefully.
   * 
   * @returns {Promise<Array<{label: string, value: string, city?: string}>>}
   * @throws {AppError} If API call fails
   */
  async getBranches() {
    try {
      logger.info('[NCMService] Fetching branches from NCM API');

      if (!this.apiToken) {
        throw new AppError('NCM_API_TOKEN not configured', 500, 'NCM_CONFIG_ERROR');
      }

      const response = await this.client.get('/branches');

      // NCM API might return branches as array or object
      let branches = [];
      
      if (Array.isArray(response.data)) {
        branches = response.data;
      } else if (response.data?.branches) {
        branches = response.data.branches;
      } else if (response.data?.data) {
        branches = response.data.data;
      }

      if (!branches || branches.length === 0) {
        throw new AppError('No branches returned from NCM API', 404, 'NCM_NO_BRANCHES');
      }

      // Debug: Log sample branch structure to understand available fields
      if (branches.length > 0) {
        const sampleBranch = branches[0];
        logger.info('[NCMService] Sample branch structure:', {
          keys: Object.keys(sampleBranch || {}),
          sample: JSON.stringify(sampleBranch).substring(0, 500),
        });
      }

      // Map to standard format with ALL fields needed by frontend
      // Format: "ITAHARI (Sunsari)" - shows district for context
      const mapped = branches.map((branch) => {
        const name = branch.name || branch.branch_name || (typeof branch === 'string' ? branch : '');
        const code = branch.code || branch.branch_code || name;
        const district = branch.district || branch.city || null;
        const municipality = branch.municipality || branch.area || null;
        const phone = branch.phone || branch.contact || branch.contact_number || null;
        
        // covered_areas can be string or array - normalize to string for search
        let covered_areas = branch.covered_areas || branch.areas || branch.coverage || '';
        if (Array.isArray(covered_areas)) {
          covered_areas = covered_areas.join(', ');
        }
        
        return {
          // Label includes district for easy identification
          label: district ? `${name} (${district})` : name,
          value: code,
          // All fields needed by frontend for display and search
          name: name,
          code: code,
          city: district,
          district: district,
          municipality: municipality,
          phone: phone,
          covered_areas: covered_areas,
          // Original data for reference
          raw: branch,
        };
      });

      logger.info(`[NCMService] Fetched ${mapped.length} branches from NCM API with full data`);
      return mapped;
    } catch (error) {
      logger.error(`[NCMService] getBranches failed: ${error.message}`, {
        responseStatus: error.response?.status,
        responseData: error.response?.data,
      });

      // Re-throw AppError as-is
      if (error instanceof AppError) {
        throw error;
      }

      // Wrap other errors
      throw new AppError(
        `Failed to fetch NCM branches: ${error.message}`,
        error.response?.status || 500,
        'NCM_API_ERROR'
      );
    }
  }

  // ===========================================================================
  // GET SHIPPING RATE (V1 API)
  // ===========================================================================

  /**
   * Get shipping rate from NCM for a destination branch
   * 
   * USES V1 API: GET /api/v1/shipping-rate
   * 
   * @param {string} destinationBranch - Destination branch name (e.g., "POKHARA")
   * @param {string} deliveryType - "Pickup/Collect" (door-to-door) or "D2B" (to branch)
   * @returns {Promise<{success: boolean, charge: number, d2dPrice: number, d2bPrice: number}>}
   */
  async getShippingRate(destinationBranch, deliveryType = 'Pickup/Collect') {
    try {
      if (!destinationBranch) {
        throw new AppError('Destination branch is required', 400, 'VALIDATION_ERROR');
      }

      // Use V1 endpoint for shipping rate
      const url = getNcmEndpoint('shipping-rate', 'v1');

      logger.info(`[NCMService] Getting shipping rate: ${this.sourceBranch} → ${destinationBranch}`);

      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.apiToken}`,
        },
        timeout: this.client.defaults.timeout,
        params: {
          creation: this.sourceBranch,
          destination: destinationBranch,
          type: deliveryType,
        },
      });

      // NCM returns: { "charge": "170.00" }
      const charge = parseFloat(response.data?.charge) || null;

      if (charge === null) {
        throw new AppError('Invalid rate response from NCM', 500, 'NCM_API_ERROR');
      }

      // D2B (Branch Pickup) is typically Rs. 50 less
      const d2dPrice = charge;
      const d2bPrice = Math.max(0, charge - 50);

      logger.info(`[NCMService] Shipping rate: Rs. ${d2dPrice} (D2D), Rs. ${d2bPrice} (D2B)`);

      return {
        success: true,
        charge,
        d2dPrice,
        d2bPrice,
        sourceBranch: this.sourceBranch,
        destinationBranch,
      };
    } catch (error) {
      logger.error(`[NCMService] getShippingRate failed: ${error.message}`, {
        destinationBranch,
        responseData: error.response?.data,
      });

      if (error instanceof AppError) {
        throw error;
      }

      // Check if it's an HTML error page (invalid request)
      if (typeof error.response?.data === 'string' && error.response.data.includes('<!DOCTYPE')) {
        throw new AppError(
          `Invalid destination branch: ${destinationBranch}`,
          400,
          'NCM_INVALID_BRANCH'
        );
      }

      throw new AppError(
        `Failed to get shipping rate: ${error.message}`,
        error.response?.status || 500,
        'NCM_API_ERROR'
      );
    }
  }

  // ===========================================================================
  // CREATE ORDER (V1 API) - OFFICIAL NCM API MAPPING
  // ===========================================================================

  /**
   * Create order in NCM system
   * 
   * USES V1 API: POST /api/v1/order/create
   * 
   * OFFICIAL NCM API PARAMETERS:
   * - name (required): customer name
   * - phone (required): 10-digit customer phone number
   * - phone2 (optional): customer secondary phone
   * - cod_charge (required): cod amount including delivery (STRING)
   * - address (required): general address of customer
   * - fbranch (required): From branch name (source)
   * - branch (required): Destination branch name
   * - package (optional): Package name or type
   * - vref_id (optional): Vendor reference id
   * - instruction (optional): Delivery Instruction
   * - delivery_type (optional): Door2Door, Branch2Door, Branch2Branch, Door2Branch (default: Door2Door)
   * - weight (optional): Weight in kg (default: 1 kg if not provided)
   * 
   * @param {Object} order - Order object from our database
   * @param {string} deliveryType - 'D2D' or 'D2B' (mapped to NCM's enum values)
   * @returns {Promise<{success: boolean, trackingId: string, waybill: string, message: string}>}
   */
  async createOrder(order, deliveryType = 'D2D') {
    console.log('\n========================================');
    console.log('🚀 [NCMService] Starting Order Creation');
    console.log('========================================');
    
    try {
      // =========================================================================
      // STEP 0: Validate required order object
      // =========================================================================
      if (!order) {
        throw new AppError('Order object is required', 400, 'VALIDATION_ERROR');
      }

      console.log('📋 [NCMService] Order Input:', {
        id: order.id,
        readable_id: order.readable_id,
        customer_name: order.customer_name,
        shipping_name: order.shipping_name,
        customer_phone: order.customer_phone,
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
        throw new AppError('NCM Rejected: Customer name is missing', 400, 'VALIDATION_ERROR');
      }

      // 1b. Phone Number (CRITICAL: NCM requires exactly 10 digits)
      const rawPhone = order.shipping_phone || order.customer_phone || order.customer?.phone || '';
      const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10); // Remove non-digits, take last 10
      console.log(`📞 [NCMService] Phone Sanitization: "${rawPhone}" → "${cleanPhone}"`);
      
      if (!cleanPhone || cleanPhone.length !== 10) {
        throw new AppError(`NCM Rejected: Invalid Phone Number (must be 10 digits, got: ${cleanPhone.length || 0})`, 400, 'VALIDATION_ERROR');
      }

      // 1c. Secondary Phone (optional, sanitize same way)
      const rawPhone2 = order.alt_phone || order.customer_phone_secondary || '';
      const cleanPhone2 = rawPhone2 ? String(rawPhone2).replace(/\D/g, '').slice(-10) : '';
      // Only include if it's a valid 10-digit number, otherwise send empty string
      const phone2Value = cleanPhone2.length === 10 ? cleanPhone2 : '';

      // 1d. Address (trim, fallback to "Nepal" if empty)
      const rawAddress = order.shipping_address || order.customer_address || order.customer?.address_line1 || '';
      const customerAddress = rawAddress.trim() || 'Nepal';

      // 1e. Destination Branch (trim whitespace, UPPERCASE for consistency)
      const rawBranch = order.destination_branch || '';
      const destinationBranch = rawBranch.trim().toUpperCase();
      if (!destinationBranch) {
        throw new AppError('NCM Rejected: Destination branch is missing', 400, 'VALIDATION_ERROR');
      }

      // =========================================================================
      // STEP 2: Calculate COD Amount (CRITICAL: Must be STRING)
      // P1 REFACTOR: Using PAYMENT_METHOD constant
      // =========================================================================
      const isCOD = !order.payment_method || order.payment_method?.toLowerCase() === PAYMENT_METHOD.COD;
      // Use payable_amount (includes shipping), fallback to total_amount
      const codAmount = isCOD ? Math.round(order.payable_amount || order.total_amount || 0) : 0;
      const codChargeString = String(codAmount); // NCM expects STRING
      console.log(`💰 [NCMService] COD: isCOD=${isCOD}, amount=${codAmount} → "${codChargeString}"`);

      // =========================================================================
      // STEP 3: Generate Package String from order items
      // Format: "ProductName (Variant) x Quantity, ..."
      // =========================================================================
      const packageString = this._generatePackageString(order);
      console.log(`📦 [NCMService] Package: "${packageString.substring(0, 100)}..."`);

      // =========================================================================
      // STEP 4: Map delivery_type to NCM's specific enum values
      // Our Internal → NCM API
      // 'D2D', 'Home Delivery' → 'Door2Door'
      // 'D2B', 'Pickup' → 'Door2Branch'
      // =========================================================================
      const ncmDeliveryType = this._mapDeliveryType(deliveryType || order.delivery_type);
      console.log(`🚚 [NCMService] Delivery Type: "${deliveryType || order.delivery_type}" → "${ncmDeliveryType}"`);

      // =========================================================================
      // STEP 5: Construct the Payload (STRICT NCM API MAPPING)
      // =========================================================================
      const payload = {
        // REQUIRED FIELDS (per NCM API docs)
        name: customerName,
        phone: cleanPhone,                    // Sanitized 10-digit
        cod_charge: codChargeString,          // STRING, not number
        address: customerAddress,
        fbranch: this.sourceBranch,           // "TINKUNE" (hardcoded)
        branch: destinationBranch,            // UPPERCASE, trimmed
        
        // OPTIONAL FIELDS
        phone2: phone2Value,                  // Empty string if invalid, not null
        package: packageString,               // Generated from order items
        // P1: Use order source name as vref_id so courier rider sees the brand
        // Falls back to readable_id if no source is linked
        vref_id: order.order_source?.name || order.readable_id || '',
        instruction: 'Handle with care',      // Default instruction
        delivery_type: ncmDeliveryType,       // 'Door2Door' or 'Door2Branch'
      };

      // =========================================================================
      // STEP 6: Log payload for debugging (CRITICAL for debugging)
      // P0 FIX: Added explicit delivery type verification log
      // =========================================================================
      console.log('\n' + '='.repeat(60));
      console.log('🚚 [NCMService] SENDING TO NCM:');
      console.log('='.repeat(60));
      console.log(`   Order ID: ${order.readable_id || order.order_number}`);
      console.log(`   Source/Brand: ${order.order_source?.name || 'none'}`);
      console.log(`   VREF ID: ${payload.vref_id}`);
      console.log(`   Input Delivery Type: "${deliveryType || order.delivery_type}"`);
      console.log(`   Mapped NCM Type: "${ncmDeliveryType}"`);
      console.log(`   Branch: ${destinationBranch}`);
      console.log(`   COD Amount: Rs.${codAmount}`);
      console.log('='.repeat(60));
      console.log('\n📤 [NCMService] FULL PAYLOAD:');
      console.log(JSON.stringify(payload, null, 2));
      console.log('');
      
      logger.info(`[NCMService] Creating NCM order`, {
        orderNumber: order.readable_id || order.order_number,
        destinationBranch,
        inputDeliveryType: deliveryType || order.delivery_type,
        mappedDeliveryType: ncmDeliveryType,
        codAmount,
        phone: cleanPhone,
      });

      // =========================================================================
      // STEP 7: Execute POST request to NCM V1 API
      // =========================================================================
      const url = getNcmEndpoint('order/create', 'v1');
      console.log(`🌐 [NCMService] POST ${url}`);
      
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.apiToken}`,
        },
        timeout: this.client.defaults.timeout,
      });

      console.log('\n📥 [NCMService] NCM RESPONSE:');
      console.log(JSON.stringify(response.data, null, 2));

      // =========================================================================
      // STEP 8: COMPREHENSIVE RESPONSE VALIDATION (P0 FIX - Prevent Ghost Orders)
      // 
      // NCM API can return HTTP 200 with errors in the body. We must validate:
      // 1. response.data.Error - Object with field-specific errors
      // 2. response.data.error - String error message
      // 3. response.data.code === 'ERROR' - Generic error flag
      // 4. response.data.success === false - Explicit failure flag
      // 5. Missing orderid - No tracking ID returned
      // =========================================================================
      
      // Check 1: NCM Error object (most common pattern)
      if (response.data?.Error) {
        const errorDetails = response.data.Error;
        const userFriendlyError = this._extractUserFriendlyError(errorDetails);
        console.error('❌ [NCMService] NCM API returned Error object:', JSON.stringify(errorDetails, null, 2));
        throw new AppError(userFriendlyError, 400, 'NCM_API_ERROR');
      }

      // Check 2: Lowercase error string
      if (response.data?.error) {
        const errorMsg = typeof response.data.error === 'string' 
          ? response.data.error 
          : JSON.stringify(response.data.error);
        console.error('❌ [NCMService] NCM API returned error:', errorMsg);
        throw new AppError(`NCM Rejected: ${errorMsg}`, 400, 'NCM_API_ERROR');
      }

      // Check 3: Generic error code
      if (response.data?.code === 'ERROR' || response.data?.status === 'error') {
        const errorMsg = response.data.message || response.data.msg || 'Unknown error';
        console.error('❌ [NCMService] NCM API returned error code:', errorMsg);
        throw new AppError(`NCM Rejected: ${errorMsg}`, 400, 'NCM_API_ERROR');
      }

      // Check 4: Explicit success=false flag
      if (response.data?.success === false) {
        const errorMsg = response.data.message || response.data.msg || 'Operation failed';
        console.error('❌ [NCMService] NCM API returned success=false:', errorMsg);
        throw new AppError(`NCM Rejected: ${errorMsg}`, 400, 'NCM_API_ERROR');
      }

      // Check 5: NCM returns orderid (not order_id)
      const trackingId = response.data.orderid || response.data.order_id || response.data.tracking_id;
      
      if (!trackingId) {
        console.error('❌ [NCMService] NCM did not return orderid in response');
        console.error('❌ Full response:', JSON.stringify(response.data, null, 2));
        throw new AppError('NCM did not return order ID - order may not have been created', 500, 'NCM_API_ERROR');
      }

      const waybill = response.data.waybill || response.data.awb_number || String(trackingId);

      console.log('\n✅ ========================================');
      console.log(`✅ [NCMService] ORDER CREATED SUCCESSFULLY`);
      console.log(`✅ NCM Order ID: ${trackingId}`);
      console.log(`✅ Waybill: ${waybill}`);
      console.log('✅ ========================================\n');

      logger.info(`[NCMService] Order created successfully`, {
        orderNumber: order.readable_id || order.order_number,
        ncmOrderId: trackingId,
        waybill,
      });

      return {
        success: true,
        trackingId: String(trackingId),
        waybill: String(waybill),
        message: response.data.Message || response.data.message || 'Order created successfully',
        rawResponse: response.data,
      };
    } catch (error) {
      console.error('\n❌ ========================================');
      console.error('❌ [NCMService] ORDER CREATION FAILED');
      console.error('❌ ========================================');
      console.error('❌ Error Message:', error.message);
      
      // Log detailed error info for debugging
      if (error.response) {
        console.error('❌ HTTP Status:', error.response.status);
        console.error('❌ NCM Error Details:', JSON.stringify(error.response.data || 'No data', null, 2));
      }
      console.error('');

      logger.error(`[NCMService] createOrder failed`, {
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
        const errorDetails = error.response.data?.Error || error.response.data;
        const userFriendlyError = this._extractUserFriendlyError(errorDetails);
        throw new AppError(userFriendlyError, error.response.status || 400, 'NCM_API_ERROR');
      }

      throw new AppError(`NCM API Error: ${error.message}`, 500, 'NCM_API_ERROR');
    }
  }

  // ===========================================================================
  // HELPER: Extract User-Friendly Error from NCM Response
  // ===========================================================================
  
  /**
   * Convert NCM error response to user-friendly message
   * 
   * NCM Error format: { "Error": { "phone": "Invalid Phone Number", "branch": "Invalid Branch" } }
   * Output: "NCM Rejected: Invalid Phone Number, Invalid Branch"
   * 
   * @param {Object|string} errorData - NCM error response
   * @returns {string} User-friendly error message
   */
  _extractUserFriendlyError(errorData) {
    if (typeof errorData === 'string') {
      return `NCM Rejected: ${errorData}`;
    }

    if (errorData && typeof errorData === 'object') {
      const errorMessages = [];
      
      // Known field-specific errors
      const fieldLabels = {
        phone: 'Phone Number',
        name: 'Customer Name',
        address: 'Address',
        branch: 'Branch',
        fbranch: 'Source Branch',
        cod_charge: 'COD Amount',
        delivery_type: 'Delivery Type',
      };

      for (const [field, message] of Object.entries(errorData)) {
        const label = fieldLabels[field] || field;
        if (typeof message === 'string') {
          errorMessages.push(`${label}: ${message}`);
        } else if (Array.isArray(message)) {
          errorMessages.push(`${label}: ${message.join(', ')}`);
        }
      }

      if (errorMessages.length > 0) {
        return `NCM Rejected: ${errorMessages.join('; ')}`;
      }

      // Try common error fields
      if (errorData.message) return `NCM Rejected: ${errorData.message}`;
      if (errorData.error) return `NCM Rejected: ${errorData.error}`;
      if (errorData.detail) return `NCM Rejected: ${errorData.detail}`;
    }

    return 'NCM Rejected: Unknown error from NCM API';
  }

  // ===========================================================================
  // HELPER: Generate Package String from Order Items
  // ===========================================================================
  
  /**
   * Generate package description string from order items
   * Format: "ProductName (Variant) x Qty, ProductName2 x Qty2"
   * 
   * @param {Object} order - Order object with items array
   * @returns {string} Package description string
   */
  /**
   * Generate rich package description from order items
   * 
   * Format: "Product Name (Variant) [SKU: xxx] x Qty + ..."
   * Max Length: 200 characters (NCM safety limit)
   * 
   * @param {Object} order - Order with items array
   * @returns {string} Package description
   */
  _generatePackageString(order) {
    if (!order.items || order.items.length === 0) {
      // Fallback to order number if no items
      return `Order ${order.readable_id || order.order_number}`;
    }

    const MAX_LENGTH = 200;
    const itemStrings = [];

    for (const item of order.items) {
      const productName = item.product_name || item.name || 'Item';
      const variant = item.variant_name || item.variant || '';
      const sku = item.sku || item.variant_id || '';
      const quantity = item.quantity || 1;

      // Build item string: "Product Name (Variant) [SKU: xxx] x Qty"
      let itemStr = productName;
      
      if (variant) {
        itemStr += ` (${variant})`;
      }
      
      if (sku) {
        itemStr += ` [${sku}]`;
      }
      
      itemStr += ` x ${quantity}`;
      
      itemStrings.push(itemStr);
    }

    // Join with " + " separator
    let result = itemStrings.join(' + ');

    // Truncate if exceeds max length
    if (result.length > MAX_LENGTH) {
      const itemCount = order.items.length;
      const suffix = ` +${itemCount - 1} more items`;
      const maxFirstItemLen = MAX_LENGTH - suffix.length;
      
      // Take first item and truncate
      result = itemStrings[0].substring(0, maxFirstItemLen) + suffix;
    }

    return result;
  }

  // ===========================================================================
  // HELPER: Map Internal Delivery Type to NCM Enum
  // ===========================================================================

  /**
   * Map our internal delivery_type to NCM's specific enum values
   * 
   * NCM delivery_type values:
   * - Door2Door: Home delivery (customer's address)
   * - Door2Branch: Branch pickup (customer picks from NCM branch)
   * - Branch2Door: (Not used - we always ship from TINKUNE)
   * - Branch2Branch: (Not used)
   * 
   * @param {string} internalType - Our internal type ('D2D', 'D2B', etc.)
   * @returns {string} NCM delivery type enum value
   */
  _mapDeliveryType(internalType) {
    if (!internalType) {
      console.log(`🚚 [NCMService] _mapDeliveryType: null/undefined → "Door2Door" (Default)`);
      return 'Door2Door'; // Default
    }

    const normalized = internalType.toLowerCase().trim();
    const upperNormalized = internalType.toUpperCase().trim();

    // =======================================================================
    // P0 FIX: D2B / Branch Pickup Detection
    // Handles all known formats:
    // - 'D2B', 'd2b'
    // - 'BRANCH_PICKUP', 'branch_pickup', 'Branch Pickup'
    // - 'pickup', 'Pickup'
    // - 'Door2Branch', 'door2branch'
    // =======================================================================
    const isBranchPickup = 
      normalized === 'd2b' ||
      upperNormalized === 'BRANCH_PICKUP' ||
      upperNormalized === 'BRANCHPICKUP' ||
      normalized.includes('pickup') ||
      normalized === 'door2branch';

    if (isBranchPickup) {
      console.log(`🚚 [NCMService] _mapDeliveryType: "${internalType}" → "Door2Branch" (Branch Pickup)`);
      return 'Door2Branch';
    }

    // =======================================================================
    // D2D / Home Delivery (default for all other values)
    // Handles: 'D2D', 'd2d', 'HOME_DELIVERY', 'Door2Door', etc.
    // =======================================================================
    console.log(`🚚 [NCMService] _mapDeliveryType: "${internalType}" → "Door2Door" (Home Delivery)`);
    return 'Door2Door';
  }

  // ===========================================================================
  // BULK CREATE ORDERS
  // ===========================================================================

  /**
   * Create multiple orders in NCM system
   * 
   * @param {Array<Object>} orders - Array of order objects (each must have destination_branch)
   * @param {string} deliveryType - 'D2D' or 'D2B' for all orders
   * @returns {Promise<{success: Array, failed: Array}>}
   */
  async createOrdersBulk(orders, deliveryType = 'D2D') {
    const results = {
      success: [],
      failed: [],
    };

    for (const order of orders) {
      try {
        // Use order's own delivery_type if set, otherwise use provided deliveryType
        const orderDeliveryType = order.delivery_type || deliveryType;
        const result = await this.createOrder(order, orderDeliveryType);
        results.success.push({
          order_id: order.id,
          readable_id: order.readable_id,
          tracking_id: result.trackingId,
          waybill: result.waybill,
        });
        
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        results.failed.push({
          order_id: order.id,
          readable_id: order.readable_id,
          error: error.message,
        });
      }
    }

    logger.info(`[NCMService] Bulk order creation completed`, {
      success: results.success.length,
      failed: results.failed.length,
    });

    return results;
  }

  // ===========================================================================
  // GET ORDER STATUS
  // ===========================================================================

  /**
   * Get tracking status from NCM
   * 
   * @param {string} trackingId - NCM order ID / tracking number
   * @returns {Promise<Object>}
   */
  async getOrderStatus(trackingId) {
    try {
      if (!trackingId) {
        throw new AppError('Tracking ID is required', 400, 'VALIDATION_ERROR');
      }

      logger.info(`[NCMService] Getting status for ${trackingId}`);

      const response = await this.client.get('/orders/status', {
        params: { order_id: trackingId },
      });

      if (!response.data?.success) {
        throw new AppError(
          response.data?.message || 'Failed to get status',
          404,
          'ORDER_NOT_FOUND'
        );
      }

      const rawStatus = response.data.status || response.data.current_status;
      const internalStatus = NCM_STATUS_MAP[rawStatus] || 'unknown';

      return {
        success: true,
        trackingId,
        rawStatus,
        internalStatus,
        location: response.data.location || response.data.current_location,
        remarks: response.data.remarks,
        timestamp: response.data.updated_at || response.data.timestamp,
        rawResponse: response.data,
      };
    } catch (error) {
      logger.error(`[NCMService] getOrderStatus failed: ${error.message}`);
      throw error;
    }
  }

  // ===========================================================================
  // GET ORDER DETAILS
  // ===========================================================================

  /**
   * Get full order details from NCM
   * 
   * @param {string} trackingId - NCM order ID
   * @returns {Promise<Object>}
   */
  async getOrderDetails(trackingId) {
    try {
      if (!trackingId) {
        throw new AppError('Tracking ID is required', 400, 'VALIDATION_ERROR');
      }

      logger.info(`[NCMService] Getting order details for ${trackingId}`);

      const response = await this.client.get('/orders/detail', {
        params: { order_id: trackingId },
      });

      if (!response.data?.success) {
        throw new AppError(
          response.data?.message || 'Order not found',
          404,
          'ORDER_NOT_FOUND'
        );
      }

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error(`[NCMService] getOrderDetails failed: ${error.message}`);
      throw error;
    }
  }

  // ===========================================================================
  // COMMENTS API (V1)
  // ===========================================================================

  /**
   * Post a comment to NCM for an order
   * 
   * USES V1 API: POST /api/v1/comment
   * 
   * @param {string} externalOrderId - NCM order ID (from createOrder response)
   * @param {string} commentText - Comment message
   * @returns {Promise<{success: boolean, message: string, commentId?: string}>}
   */
  async postComment(externalOrderId, commentText) {
    try {
      if (!externalOrderId) {
        throw new AppError('NCM Order ID is required', 400, 'VALIDATION_ERROR');
      }
      if (!commentText || !commentText.trim()) {
        throw new AppError('Comment text is required', 400, 'VALIDATION_ERROR');
      }

      logger.info(`[NCMService] Posting comment to NCM order ${externalOrderId}`);
      console.log(`💬 [NCMService] Posting comment to order ${externalOrderId}: "${commentText.substring(0, 50)}..."`);

      const url = getNcmEndpoint('comment', 'v1');
      
      const payload = {
        orderid: String(externalOrderId),
        comments: commentText.trim(),
      };

      console.log(`📤 [NCMService] Comment Payload:`, JSON.stringify(payload, null, 2));

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.apiToken}`,
        },
        timeout: this.client.defaults.timeout,
      });

      console.log(`📥 [NCMService] Comment Response:`, JSON.stringify(response.data, null, 2));

      // Check for error in response
      if (response.data?.Error) {
        const errorMsg = this._extractUserFriendlyError(response.data.Error);
        throw new AppError(errorMsg, 400, 'NCM_COMMENT_ERROR');
      }

      logger.info(`[NCMService] Comment posted successfully to NCM order ${externalOrderId}`);

      return {
        success: true,
        message: response.data?.Message || response.data?.message || 'Comment posted successfully',
        commentId: response.data?.id || response.data?.comment_id || null,
        rawResponse: response.data,
      };
    } catch (error) {
      logger.error(`[NCMService] postComment failed: ${error.message}`, {
        externalOrderId,
        error: error.response?.data,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Failed to post comment: ${error.message}`,
        error.response?.status || 500,
        'NCM_COMMENT_ERROR'
      );
    }
  }

  /**
   * Get comments for an NCM order
   * 
   * USES V1 API: GET /api/v1/order/comment?id=ORDERID
   * 
   * @param {string} externalOrderId - NCM order ID
   * @returns {Promise<{success: boolean, comments: Array<{id, text, sender, created_at}>}>}
   */
  async getComments(externalOrderId) {
    try {
      if (!externalOrderId) {
        throw new AppError('NCM Order ID is required', 400, 'VALIDATION_ERROR');
      }

      logger.info(`[NCMService] Fetching comments for NCM order ${externalOrderId}`);

      const url = getNcmEndpoint('order/comment', 'v1');
      
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.apiToken}`,
        },
        timeout: this.client.defaults.timeout,
        params: {
          id: String(externalOrderId),
        },
      });

      console.log(`📥 [NCMService] Comments Response:`, JSON.stringify(response.data, null, 2));

      // Check for error in response
      if (response.data?.Error) {
        const errorMsg = this._extractUserFriendlyError(response.data.Error);
        throw new AppError(errorMsg, 400, 'NCM_COMMENT_ERROR');
      }

      // Parse comments array
      let comments = [];
      
      if (Array.isArray(response.data)) {
        comments = response.data;
      } else if (Array.isArray(response.data?.comments)) {
        comments = response.data.comments;
      } else if (Array.isArray(response.data?.data)) {
        comments = response.data.data;
      }

      // Normalize comment format
      // IMPORTANT: sender is determined by addedBy field from NCM API
      // - addedBy: "NCM Staff" -> LOGISTICS_PROVIDER (gray bubble)
      // - addedBy: "Vendor" / company name -> ERP_USER (blue bubble)
      const normalizedComments = comments.map(c => {
        const sender = this._determineCommentSender(c);
        // Preserve addedBy for display - this shows "NCM Staff" or "Seetara Global"
        const senderName = c.addedBy || c.added_by || c.user || c.sender_name || c.created_by || null;
        
        return {
          id: c.id || c.comment_id || null,
          text: c.comments || c.comment || c.text || c.message || '',
          sender, // 'ERP_USER' or 'LOGISTICS_PROVIDER'
          sender_name: senderName, // "NCM Staff", "Seetara Global", etc.
          created_at: c.created_at || c.timestamp || c.date || new Date().toISOString(),
          raw: c, // Keep raw for debugging
        };
      });

      logger.info(`[NCMService] Fetched ${normalizedComments.length} comments for NCM order ${externalOrderId}`);

      return {
        success: true,
        comments: normalizedComments,
        rawResponse: response.data,
      };
    } catch (error) {
      logger.error(`[NCMService] getComments failed: ${error.message}`, {
        externalOrderId,
        error: error.response?.data,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `Failed to fetch comments: ${error.message}`,
        error.response?.status || 500,
        'NCM_COMMENT_ERROR'
      );
    }
  }

  /**
   * Determine if comment is from ERP (Vendor) or Logistics Provider (NCM Staff)
   * 
   * According to NCM API Docs (Page 21/22):
   * - addedBy: "NCM Staff" or contains "ncm" = Courier Team (LOGISTICS_PROVIDER) - Gray bubble
   * - addedBy: "Vendor" or Company Name (Seetara, Today Trend) = ERP User - Blue bubble
   * 
   * @param {Object} comment - Raw comment from NCM API
   * @returns {'ERP_USER' | 'LOGISTICS_PROVIDER'}
   */
  _determineCommentSender(comment) {
    // =======================================================================
    // PRIMARY CHECK: addedBy field (NCM API standard field)
    // =======================================================================
    const addedBy = (comment.addedBy || comment.added_by || '').toLowerCase().trim();
    
    if (addedBy) {
      // If addedBy contains "ncm" -> It's NCM Staff (Logistics Provider)
      if (addedBy.includes('ncm') || addedBy.includes('staff') || addedBy.includes('nepal can move')) {
        console.log(`💬 [NCMService] Comment sender: LOGISTICS_PROVIDER (addedBy: "${comment.addedBy}")`);
        return 'LOGISTICS_PROVIDER';
      }
      
      // If addedBy is "Vendor" or contains our company names -> It's from us (ERP User)
      if (
        addedBy === 'vendor' ||
        addedBy.includes('seetara') ||
        addedBy.includes('today trend') ||
        addedBy.includes('todaytrend')
      ) {
        console.log(`💬 [NCMService] Comment sender: ERP_USER (addedBy: "${comment.addedBy}")`);
        return 'ERP_USER';
      }
      
      // Any other value in addedBy likely means it's from vendor (our side)
      // NCM Staff is usually explicitly labeled as "NCM Staff"
      console.log(`💬 [NCMService] Comment sender: ERP_USER (addedBy not NCM: "${comment.addedBy}")`);
      return 'ERP_USER';
    }

    // =======================================================================
    // FALLBACK: Check other possible fields
    // =======================================================================
    
    // Check for explicit sender_type
    if (comment.sender_type) {
      const senderType = comment.sender_type.toLowerCase();
      if (senderType.includes('vendor') || senderType.includes('user') || senderType.includes('erp')) {
        return 'ERP_USER';
      }
      return 'LOGISTICS_PROVIDER';
    }
    
    // Check user/created_by field
    const user = (comment.user || comment.created_by || comment.sender_name || '').toLowerCase();
    if (user) {
      // Our vendor identifiers
      if (user.includes('today trend') || user.includes('todaytrend') || 
          user.includes('seetara') || user.includes('vendor')) {
        return 'ERP_USER';
      }
      // NCM identifiers
      if (user.includes('ncm') || user.includes('nepal can') || user.includes('staff')) {
        return 'LOGISTICS_PROVIDER';
      }
    }
    
    // =======================================================================
    // DEFAULT: If we can't determine, assume it's from NCM (safer assumption)
    // Better to show as NCM than to show as "our" message when it's not
    // =======================================================================
    console.log(`💬 [NCMService] Comment sender: LOGISTICS_PROVIDER (default - no addedBy field)`);
    return 'LOGISTICS_PROVIDER';
  }

  // ===========================================================================
  // REDIRECT ORDER (V2 API) - P0 NCM ORDER REDIRECT FEATURE
  // ===========================================================================

  /**
   * Redirect an existing NCM order to a new customer/order
   * 
   * USES V2 API: POST /api/v2/vendor/order/redirect
   * 
   * NCM API Parameters (from API docs page 20-21):
   * - pk (required): Old NCM Order ID to redirect
   * - name (required): New customer name
   * - phone (required): New customer phone (10 digits)
   * - address (required): New delivery address
   * - cod_charge (required): New COD amount
   * - destination (optional): New branch ID (only if branch is changing)
   * 
   * @param {string} oldExternalId - The NCM order ID to redirect
   * @param {Object} newOrderDetails - New order details
   * @param {string} newOrderDetails.customer_name - New customer name
   * @param {string} newOrderDetails.customer_phone - New customer phone
   * @param {string} newOrderDetails.shipping_address - New delivery address
   * @param {number} newOrderDetails.payable_amount - New COD amount
   * @param {string} newOrderDetails.destination_branch - New destination branch name
   * @param {string|null} newBranchId - NCM branch ID (if branch is changing)
   * @returns {Promise<{success: boolean, message: string, trackingId?: string}>}
   */
  async redirectOrder(oldExternalId, newOrderDetails, newBranchId = null) {
    console.log('\n========================================');
    console.log('🔄 [NCMService] REDIRECTING ORDER');
    console.log('========================================');
    console.log(`   Old NCM Order ID: ${oldExternalId}`);
    console.log(`   New Customer: ${newOrderDetails.customer_name || newOrderDetails.shipping_name}`);
    console.log(`   New Branch ID: ${newBranchId || 'Same branch'}`);
    
    try {
      // =========================================================================
      // STEP 1: Validate inputs
      // =========================================================================
      if (!oldExternalId) {
        throw new AppError('Old NCM order ID is required for redirect', 400, 'VALIDATION_ERROR');
      }

      // Extract and sanitize new customer details
      const newName = (newOrderDetails.shipping_name || newOrderDetails.customer_name || '').trim();
      if (!newName) {
        throw new AppError('New customer name is required', 400, 'VALIDATION_ERROR');
      }

      const rawPhone = newOrderDetails.shipping_phone || newOrderDetails.customer_phone || '';
      const newPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
      if (!newPhone || newPhone.length !== 10) {
        throw new AppError(`Invalid phone number (must be 10 digits, got: ${newPhone.length || 0})`, 400, 'VALIDATION_ERROR');
      }

      const newAddress = (newOrderDetails.shipping_address || newOrderDetails.customer_address || '').trim();
      if (!newAddress) {
        throw new AppError('New delivery address is required', 400, 'VALIDATION_ERROR');
      }

      // COD amount (use payable_amount which includes shipping)
      const codCharge = Math.round(newOrderDetails.payable_amount || newOrderDetails.total_amount || 0);

      // =========================================================================
      // STEP 2: Build redirect payload
      // =========================================================================
      const payload = {
        pk: oldExternalId,
        name: newName,
        phone: newPhone,
        address: newAddress,
        cod_charge: String(codCharge), // NCM expects string
      };

      // Only include destination if branch is changing
      if (newBranchId) {
        payload.destination = newBranchId;
        console.log(`   Branch changing to ID: ${newBranchId}`);
      }

      console.log('\n📤 [NCMService] Redirect Payload:');
      console.log(JSON.stringify(payload, null, 2));

      // =========================================================================
      // STEP 3: Call NCM redirect API
      // =========================================================================
      const url = getNcmEndpoint('vendor/order/redirect', 'v2');
      logger.info(`[NCMService] Calling redirect API: ${url}`);

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.apiToken}`,
        },
        timeout: 30000,
      });

      console.log('\n📥 [NCMService] Redirect Response:');
      console.log(JSON.stringify(response.data, null, 2));

      // =========================================================================
      // STEP 4: Handle response
      // =========================================================================
      if (response.data?.success === false || response.data?.error) {
        const errorMsg = this._extractErrorMessage(response.data);
        throw new AppError(`NCM Redirect Failed: ${errorMsg}`, 400, 'NCM_REDIRECT_ERROR');
      }

      // Extract new tracking ID if provided (NCM might return same or new ID)
      const newTrackingId = response.data?.order_id || response.data?.tracking_id || oldExternalId;

      console.log('\n✅ ========================================');
      console.log('✅ [NCMService] ORDER REDIRECTED SUCCESSFULLY');
      console.log(`✅ Tracking ID: ${newTrackingId}`);
      console.log('✅ ========================================\n');

      logger.info(`[NCMService] Order redirected successfully`, {
        oldOrderId: oldExternalId,
        newTrackingId,
        newCustomer: newName,
      });

      return {
        success: true,
        message: response.data?.message || 'Order redirected successfully',
        trackingId: String(newTrackingId),
        oldOrderId: oldExternalId,
      };

    } catch (error) {
      console.error('\n❌ ========================================');
      console.error('❌ [NCMService] REDIRECT FAILED');
      console.error('❌ ========================================');
      console.error('❌ Error:', error.message);
      
      if (error.response) {
        console.error('❌ HTTP Status:', error.response.status);
        console.error('❌ Response:', JSON.stringify(error.response.data || 'No data', null, 2));
      }

      logger.error(`[NCMService] redirectOrder failed`, {
        oldOrderId: oldExternalId,
        error: error.message,
        httpStatus: error.response?.status,
        responseData: error.response?.data,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        `NCM Redirect Error: ${error.response?.data?.message || error.message}`,
        error.response?.status || 500,
        'NCM_REDIRECT_ERROR'
      );
    }
  }

  /**
   * Get NCM branch ID by branch name
   * Helper for redirect when branch is changing
   * 
   * @param {string} branchName - Branch name (e.g., "POKHARA")
   * @returns {Promise<string|null>} Branch ID or null if not found
   */
  async getBranchIdByName(branchName) {
    try {
      if (!branchName) return null;

      const normalizedName = branchName.toUpperCase().trim();
      
      // Try to get from cached branches or fetch
      const response = await this.client.get('/branches');
      
      let branches = [];
      if (Array.isArray(response.data)) {
        branches = response.data;
      } else if (response.data?.branches) {
        branches = response.data.branches;
      } else if (response.data?.data) {
        branches = response.data.data;
      }

      // Find branch by name (case-insensitive)
      const branch = branches.find(b => {
        const name = (b.name || b.branch_name || '').toUpperCase();
        const code = (b.code || b.branch_code || '').toUpperCase();
        return name === normalizedName || code === normalizedName;
      });

      if (branch) {
        const branchId = branch.id || branch.pk || branch.branch_id;
        logger.info(`[NCMService] Found branch ID for "${branchName}": ${branchId}`);
        return branchId ? String(branchId) : null;
      }

      logger.warn(`[NCMService] Branch not found: ${branchName}`);
      return null;

    } catch (error) {
      logger.error(`[NCMService] getBranchIdByName failed: ${error.message}`);
      return null;
    }
  }

  // ===========================================================================
  // GET MASTER DATA (Branches with Pricing)
  // ===========================================================================

  /**
   * Get master data including branches with pricing
   * Used by the Compare Logistics Prices feature
   * 
   * @returns {Promise<Object>} { branches: Array, lastSync: Date }
   */
  async getMasterData() {
    try {
      logger.info('[NCMService] Fetching master data (branches with pricing)');

      // Get branches from the existing method
      const branches = await this.getBranches();

      // Return in expected format
      return {
        branches: branches.map(branch => ({
          ...branch,
          // Pricing - if not included in branch data, these are defaults
          d2d_price: branch.d2d_price || branch.price || 220,
          d2b_price: branch.d2b_price || (branch.d2d_price ? branch.d2d_price - 50 : 170),
          // Metadata
          provider: 'ncm',
          supports_d2b: true, // NCM supports both D2D and D2B
        })),
        lastSync: new Date().toISOString(),
        provider: 'ncm',
      };
    } catch (error) {
      logger.error(`[NCMService] getMasterData failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync master data from NCM API
   * @returns {Promise<Object>} Sync result
   */
  async syncMasterData() {
    try {
      logger.info('[NCMService] Syncing master data');
      const data = await this.getMasterData();
      return {
        success: true,
        branchCount: data.branches?.length || 0,
        lastSync: data.lastSync,
      };
    } catch (error) {
      logger.error(`[NCMService] syncMasterData failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get sync status
   * @returns {Promise<Object>} Sync status
   */
  async getSyncStatus() {
    return {
      lastSync: new Date().toISOString(),
      status: 'active',
      provider: 'ncm',
    };
  }

  // ===========================================================================
  // CANCEL ORDER
  // ===========================================================================

  /**
   * Cancel order in NCM system (if allowed)
   * 
   * @param {string} trackingId - NCM order ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<Object>}
   */
  async cancelOrder(trackingId, reason = 'Customer request') {
    try {
      logger.info(`[NCMService] Cancelling order ${trackingId}`);

      const response = await this.client.post('/orders/cancel', {
        order_id: trackingId,
        reason,
      });

      return {
        success: response.data?.success || false,
        message: response.data?.message || 'Cancellation request submitted',
      };
    } catch (error) {
      logger.error(`[NCMService] cancelOrder failed: ${error.message}`);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
      };
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Extract error message from NCM API response
   */
  _extractErrorMessage(responseData) {
    if (typeof responseData === 'string') return responseData;
    
    if (responseData && typeof responseData === 'object') {
      // Check for field-specific errors
      const errors = [];
      for (const [field, messages] of Object.entries(responseData)) {
        if (Array.isArray(messages)) {
          errors.push(`${field}: ${messages.join(', ')}`);
        } else if (typeof messages === 'string' && field !== 'success') {
          errors.push(messages);
        }
      }
      if (errors.length > 0) return errors.join('; ');
      
      // Check common error fields
      if (responseData.message) return responseData.message;
      if (responseData.error) return responseData.error;
      if (responseData.detail) return responseData.detail;
    }

    return 'Unknown NCM API error';
  }

  /**
   * Map NCM status to internal status
   */
  mapStatus(ncmStatus) {
    return NCM_STATUS_MAP[ncmStatus] || 'unknown';
  }
}

// =============================================================================
// EXPORT SINGLETON INSTANCE
// =============================================================================

const ncmService = new NCMService();

export default ncmService;
export { NCMService, NCM_STATUS_MAP };
