/**
 * Utility Helper Functions
 * Common utilities used across the application
 */

/**
 * Generate a random alphanumeric string
 * @param {number} length - Length of the string
 * @returns {string}
 */
export const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Sanitize phone number to standard format
 * @param {string} phone - Phone number to sanitize
 * @returns {string} Sanitized phone number
 */
export const sanitizePhone = (phone) => {
  if (!phone) return null;
  
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove country code if present (91 for India)
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    cleaned = cleaned.substring(2);
  }
  
  // Remove leading zero if present
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  return cleaned;
};

/**
 * Format currency in INR
 * @param {number} amount - Amount to format
 * @returns {string} Formatted amount
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
};

/**
 * Calculate order totals
 * @param {Array} items - Order items with quantity and unit_price
 * @param {Object} options - Additional options (discount, shipping, cod)
 * @returns {Object} Calculated totals
 */
export const calculateOrderTotals = (items, options = {}) => {
  const { discountAmount = 0, shippingCharges = 0, codCharges = 0 } = options;
  
  const subtotal = items.reduce((sum, item) => {
    return sum + (item.quantity * item.unit_price);
  }, 0);
  
  const totalAmount = subtotal - discountAmount + shippingCharges + codCharges;
  
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    shippingCharges: parseFloat(shippingCharges.toFixed(2)),
    codCharges: parseFloat(codCharges.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2)),
  };
};

/**
 * Paginate results
 * @param {number} page - Current page (1-indexed)
 * @param {number} limit - Items per page
 * @returns {Object} Pagination config for Supabase
 */
export const paginate = (page = 1, limit = 20) => {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * safeLimit;
  
  return {
    from: offset,
    to: offset + safeLimit - 1,
    limit: safeLimit,
    page: safePage,
  };
};

/**
 * Build pagination response
 * @param {Array} data - Result data
 * @param {number} total - Total count
 * @param {Object} pagination - Pagination config
 * @returns {Object} Paginated response
 */
export const buildPaginatedResponse = (data, total, pagination) => {
  const totalPages = Math.ceil(total / pagination.limit);
  
  return {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages,
      hasNext: pagination.page < totalPages,
      hasPrev: pagination.page > 1,
    },
  };
};

/**
 * Sleep utility for rate limiting
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Hash email for Facebook CAPI
 * @param {string} email - Email to hash
 * @returns {string} SHA256 hashed email
 */
export const hashForFacebook = async (value) => {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Get available stock (current - reserved)
 * @param {Object} variant - Product variant
 * @returns {number} Available stock
 */
export const getAvailableStock = (variant) => {
  return (variant.current_stock || 0) - (variant.reserved_stock || 0);
};

/**
 * Format variant display name
 * @param {Object} variant - Product variant
 * @returns {string} Display name
 */
export const formatVariantName = (variant) => {
  const parts = [];
  if (variant.color) parts.push(variant.color);
  if (variant.size) parts.push(variant.size);
  return parts.join(' - ') || 'Default';
};

export default {
  generateRandomString,
  sanitizePhone,
  formatCurrency,
  calculateOrderTotals,
  paginate,
  buildPaginatedResponse,
  sleep,
  hashForFacebook,
  getAvailableStock,
  formatVariantName,
};
