/**
 * NCM URL Helper
 * 
 * Handles NCM API versioning mismatch:
 * - Branches API: /api/v2/branches
 * - Shipping Rate API: /api/v1/shipping-rate
 * - Order API: /api/v1/order/create
 * 
 * This helper extracts the origin from NCM_API_URL and constructs
 * the correct versioned endpoint regardless of what's configured.
 * 
 * @priority P0 - NCM API Integration
 */

// =============================================================================
// URL PARSING & CONSTRUCTION
// =============================================================================

/**
 * Extract origin from NCM API URL
 * 
 * Examples:
 * - "https://portal.nepalcanmove.com/api/v2" → "https://portal.nepalcanmove.com"
 * - "https://demo.nepalcanmove.com/api/v1" → "https://demo.nepalcanmove.com"
 * 
 * @param {string} apiUrl - The NCM API URL from environment
 * @returns {string} The origin (protocol + host)
 */
export function extractNcmOrigin(apiUrl) {
  if (!apiUrl) {
    throw new Error('NCM_API_URL is not configured');
  }
  
  try {
    const url = new URL(apiUrl);
    return url.origin; // Returns protocol + host (e.g., "https://portal.nepalcanmove.com")
  } catch (error) {
    // Fallback: Try to extract origin manually
    const match = apiUrl.match(/^(https?:\/\/[^\/]+)/);
    if (match) {
      return match[1];
    }
    throw new Error(`Invalid NCM_API_URL format: ${apiUrl}`);
  }
}

/**
 * Get NCM API endpoint with correct version
 * 
 * NCM has different API versions for different endpoints:
 * - v2: branches, tracking
 * - v1: shipping-rate, order/create, order/cancel
 * 
 * @param {string} path - The endpoint path (e.g., "branches", "shipping-rate")
 * @param {string} version - API version ("v1" or "v2", default: "v2")
 * @returns {string} Full URL to the endpoint
 * 
 * @example
 * getNcmEndpoint('branches', 'v2')
 * // Returns: "https://portal.nepalcanmove.com/api/v2/branches"
 * 
 * getNcmEndpoint('shipping-rate', 'v1')
 * // Returns: "https://portal.nepalcanmove.com/api/v1/shipping-rate"
 */
export function getNcmEndpoint(path, version = 'v2') {
  const apiUrl = process.env.NCM_API_URL;
  const origin = extractNcmOrigin(apiUrl);
  
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  return `${origin}/api/${version}/${cleanPath}`;
}

/**
 * Get NCM API base URL for a specific version
 * 
 * @param {string} version - API version ("v1" or "v2")
 * @returns {string} Base URL for the version
 */
export function getNcmBaseUrl(version = 'v2') {
  const apiUrl = process.env.NCM_API_URL;
  const origin = extractNcmOrigin(apiUrl);
  return `${origin}/api/${version}`;
}

// =============================================================================
// ENDPOINT SHORTCUTS
// =============================================================================

/**
 * NCM API Endpoints with their correct versions
 */
export const NCM_ENDPOINTS = {
  // V2 Endpoints
  branches: () => getNcmEndpoint('branches', 'v2'),
  branchDetails: (code) => getNcmEndpoint(`branches/${code}`, 'v2'),
  tracking: (trackingId) => getNcmEndpoint(`tracking/${trackingId}`, 'v2'),
  
  // V1 Endpoints
  shippingRate: () => getNcmEndpoint('shipping-rate', 'v1'),
  createOrder: () => getNcmEndpoint('order/create', 'v1'),
  cancelOrder: () => getNcmEndpoint('order/cancel', 'v1'),
  orderDetails: (trackingId) => getNcmEndpoint(`order/${trackingId}`, 'v1'),
  
  // V1 Comment Endpoints (P0 - 2-way communication)
  postComment: () => getNcmEndpoint('comment', 'v1'),
  getComments: (orderId) => getNcmEndpoint(`order/comment?id=${orderId}`, 'v1'),
};

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  extractNcmOrigin,
  getNcmEndpoint,
  getNcmBaseUrl,
  NCM_ENDPOINTS,
};
