/**
 * Data Masking Utility
 * 
 * SECURITY: Implements strict "Operational vs. Financial" separation.
 * 
 * Core Rule:
 * - Staff/Operators: Execute operations (Stock In/Out, Returns, Damages)
 *   but NEVER see financial data (Cost Prices, Vendor Balances, Profit/Loss).
 * - Admins: See everything including financials.
 * 
 * Usage:
 *   import { maskSensitiveData } from '../utils/dataMasking.js';
 *   res.json({ success: true, data: maskSensitiveData(data, req.user?.role) });
 */

import { createLogger } from './logger.js';

const logger = createLogger('DataMasking');

// =============================================================================
// CONFIGURATION: Sensitive Fields by Category
// =============================================================================

/**
 * Financial fields - ONLY visible to admins
 * These contain profit/loss information
 */
export const FINANCIAL_FIELDS = [
  'cost_price',
  'buy_price',
  'unit_cost',
  'purchase_price',
  'profit',
  'margin',
  'markup',
  'gross_profit',
  'net_profit',
  'profit_margin',
  'total_cost',
  'cost_of_goods',
  'cogs',
];

/**
 * Vendor financial fields - ONLY visible to admins
 * These reveal vendor relationships and business terms
 */
export const VENDOR_FINANCIAL_FIELDS = [
  'balance',
  'credit_limit',
  'payment_terms',
  'outstanding',
  'vendor_balance',
  'total_payable',
  'total_paid',
  'amount_due',
];

/**
 * Personal Identifiable Information (PII)
 * Hidden from non-admins to comply with data privacy
 */
export const PII_FIELDS = [
  'email',
  'phone',
  'alt_phone',
  'address',
  'address_line1',
  'address_line2',
  'bank_details',
  'gst_number',
  'pan_number',
  'ip_address',
];

/**
 * Roles that can see ALL data including financials
 */
export const PRIVILEGED_ROLES = ['admin', 'manager', 'accountant'];

/**
 * Roles that can only see operational data
 */
export const OPERATIONAL_ROLES = ['operator', 'staff', 'warehouse', 'rider'];

// =============================================================================
// CORE MASKING FUNCTIONS
// =============================================================================

/**
 * Check if a role has access to financial data
 * @param {string} role - User role
 * @returns {boolean}
 */
export function canSeeFinancials(role) {
  if (!role) return false;
  return PRIVILEGED_ROLES.includes(role.toLowerCase());
}

/**
 * Check if a role can see PII data
 * @param {string} role - User role  
 * @returns {boolean}
 */
export function canSeePII(role) {
  if (!role) return false;
  // Only admin can see full PII
  return role.toLowerCase() === 'admin';
}

/**
 * Get all sensitive field names that should be masked for a role
 * @param {string} role - User role
 * @param {object} options - Masking options
 * @returns {Set<string>} Set of field names to mask
 */
export function getFieldsToMask(role, options = {}) {
  const { includePII = false, includeVendorData = true } = options;
  const fieldsToMask = new Set();

  // Non-privileged roles: mask financial data
  if (!canSeeFinancials(role)) {
    FINANCIAL_FIELDS.forEach(f => fieldsToMask.add(f));
    
    if (includeVendorData) {
      VENDOR_FINANCIAL_FIELDS.forEach(f => fieldsToMask.add(f));
    }
  }

  // Mask PII if not admin and includePII is true
  if (includePII && !canSeePII(role)) {
    PII_FIELDS.forEach(f => fieldsToMask.add(f));
  }

  return fieldsToMask;
}

/**
 * Recursively mask sensitive data in an object or array
 * 
 * @param {any} data - Data to mask (object, array, or primitive)
 * @param {string} userRole - User's role
 * @param {object} options - Masking options
 * @param {boolean} options.includePII - Also mask PII fields
 * @param {boolean} options.includeVendorData - Mask vendor financial fields
 * @param {Set<string>} options.additionalFields - Extra fields to mask
 * @param {Set<string>} options.preserveFields - Fields to always preserve
 * @returns {any} Masked data
 * 
 * @example
 * // In a controller:
 * const vendor = await vendorService.getVendorById(id);
 * res.json({ 
 *   success: true, 
 *   data: maskSensitiveData(vendor, req.user?.role) 
 * });
 */
export function maskSensitiveData(data, userRole, options = {}) {
  // If user is admin, return data as-is
  if (canSeeFinancials(userRole)) {
    return data;
  }

  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item, userRole, options));
  }

  // Handle Date objects
  if (data instanceof Date) {
    return data;
  }

  // Handle non-objects (strings, numbers, booleans)
  if (typeof data !== 'object') {
    return data;
  }

  // Get fields to mask
  const fieldsToMask = getFieldsToMask(userRole, options);
  const { preserveFields = new Set(), additionalFields = new Set() } = options;

  // Add additional fields to mask
  additionalFields.forEach(f => fieldsToMask.add(f));

  // Create a new object without sensitive fields
  const maskedData = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip if field should be masked (unless preserved)
    if (fieldsToMask.has(key) && !preserveFields.has(key)) {
      continue;
    }

    // Recursively mask nested objects
    if (value !== null && typeof value === 'object') {
      maskedData[key] = maskSensitiveData(value, userRole, options);
    } else {
      maskedData[key] = value;
    }
  }

  return maskedData;
}

/**
 * Create a masked version of vendor data for non-admin users
 * Non-admins only see: id, name, company_name, is_active
 * 
 * @param {object} vendor - Full vendor object
 * @param {string} userRole - User's role
 * @returns {object} Masked vendor data
 */
export function maskVendorForNonAdmin(vendor, userRole) {
  if (!vendor) return null;
  
  if (canSeeFinancials(userRole)) {
    return vendor;
  }

  // Non-admins get minimal vendor info
  return {
    id: vendor.id,
    name: vendor.name,
    company_name: vendor.company_name,
    is_active: vendor.is_active,
  };
}

/**
 * Create a masked version of product/variant data
 * Removes cost_price for non-admins
 * 
 * @param {object} product - Product or variant object
 * @param {string} userRole - User's role
 * @returns {object} Masked product data
 */
export function maskProductFinancials(product, userRole) {
  if (!product) return null;

  if (canSeeFinancials(userRole)) {
    return product;
  }

  const masked = { ...product };
  
  // Remove financial fields
  delete masked.cost_price;
  delete masked.buy_price;
  delete masked.profit;
  delete masked.margin;

  // Recursively mask variants if present
  if (masked.variants && Array.isArray(masked.variants)) {
    masked.variants = masked.variants.map(v => maskProductFinancials(v, userRole));
  }

  return masked;
}

/**
 * Create a staff-friendly response for purchase operations
 * Hides all financial impact (vendor balance changes, etc.)
 * 
 * @param {object} purchase - Full purchase object
 * @param {string} userRole - User's role
 * @returns {object} Masked purchase response
 */
export function maskPurchaseResponse(purchase, userRole) {
  if (!purchase) return null;

  if (canSeeFinancials(userRole)) {
    return purchase;
  }

  // Staff gets operational data only
  return {
    id: purchase.id,
    supply_number: purchase.supply_number,
    vendor_name: purchase.vendor?.name || purchase.vendor_name,
    invoice_number: purchase.invoice_number,
    invoice_date: purchase.invoice_date,
    status: purchase.status,
    item_count: purchase.items?.length || purchase.item_count,
    created_at: purchase.created_at,
    // Include items without cost data
    items: purchase.items?.map(item => ({
      id: item.id,
      variant_id: item.variant_id,
      sku: item.sku || item.variant?.sku,
      product_name: item.product_name || item.variant?.product?.name,
      quantity: item.quantity,
      received_quantity: item.received_quantity,
    })),
    summary: {
      total_items: purchase.summary?.total_items || purchase.items?.length,
      stock_updates_successful: purchase.summary?.stock_updates_successful,
    },
    message: 'Stock updated successfully',
  };
}

/**
 * Create a staff-friendly response for stock adjustments/damages
 * Never reveals financial loss
 * 
 * @param {object} adjustment - Stock adjustment object
 * @param {string} userRole - User's role
 * @returns {object} Masked adjustment response
 */
export function maskStockAdjustmentResponse(adjustment, userRole) {
  if (!adjustment) return null;

  const baseResponse = {
    id: adjustment.id,
    variant_id: adjustment.variant_id,
    sku: adjustment.sku || adjustment.variant?.sku,
    product_name: adjustment.product_name || adjustment.variant?.product?.name,
    movement_type: adjustment.movement_type,
    quantity: adjustment.quantity,
    reason: adjustment.reason,
    created_at: adjustment.created_at,
    created_by: adjustment.created_by_name,
  };

  // Admin sees full financial impact
  if (canSeeFinancials(userRole)) {
    return {
      ...adjustment,
      financial_impact: {
        loss_amount: adjustment.loss_amount,
        cost_per_unit: adjustment.cost_per_unit,
      },
    };
  }

  // Staff sees only operational message
  return {
    ...baseResponse,
    message: 'Stock adjusted successfully',
  };
}

/**
 * Mask vendor ledger entries for non-admin users
 * @param {Array} ledgerEntries - Vendor ledger entries
 * @param {string} userRole - User's role
 * @returns {Array} Masked ledger (or null if not admin)
 */
export function maskVendorLedger(ledgerEntries, userRole) {
  // Ledger is COMPLETELY hidden from non-admins
  if (!canSeeFinancials(userRole)) {
    return null;
  }
  return ledgerEntries;
}

// =============================================================================
// RESPONSE WRAPPER HELPERS
// =============================================================================

/**
 * Create a secure JSON response with automatic data masking
 * Use this in controllers instead of raw res.json()
 * 
 * @param {object} res - Express response object
 * @param {object} data - Response data
 * @param {string} userRole - User's role
 * @param {object} options - Additional options
 * @returns {void}
 * 
 * @example
 * // In a controller:
 * secureJsonResponse(res, { success: true, data: vendor }, req.user?.role);
 */
export function secureJsonResponse(res, responseBody, userRole, options = {}) {
  const { statusCode = 200, maskOptions = {} } = options;

  // If response has a 'data' field, mask it
  if (responseBody.data !== undefined) {
    responseBody.data = maskSensitiveData(responseBody.data, userRole, maskOptions);
  }

  // Also check for paginated responses
  if (responseBody.pagination && Array.isArray(responseBody.data)) {
    responseBody.data = maskSensitiveData(responseBody.data, userRole, maskOptions);
  }

  return res.status(statusCode).json(responseBody);
}

// =============================================================================
// EXPORT ALL
// =============================================================================

export default {
  // Configuration
  FINANCIAL_FIELDS,
  VENDOR_FINANCIAL_FIELDS,
  PII_FIELDS,
  PRIVILEGED_ROLES,
  OPERATIONAL_ROLES,
  
  // Core functions
  canSeeFinancials,
  canSeePII,
  getFieldsToMask,
  maskSensitiveData,
  
  // Specialized masking
  maskVendorForNonAdmin,
  maskProductFinancials,
  maskPurchaseResponse,
  maskStockAdjustmentResponse,
  maskVendorLedger,
  
  // Response helpers
  secureJsonResponse,
};
