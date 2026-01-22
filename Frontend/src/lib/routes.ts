/**
 * CENTRALIZED API ROUTES
 * 
 * Single source of truth for all backend API endpoints.
 * Import this instead of hardcoding URLs.
 * 
 * @example
 * import { API_ROUTES } from '@/lib/routes';
 * 
 * // Instead of: apiClient.get('/orders')
 * apiClient.get(API_ROUTES.ORDERS.LIST);
 * 
 * // With ID: apiClient.get(API_ROUTES.ORDERS.DETAIL('uuid'))
 */

const BASE_URL = '/api/v1';

// =============================================================================
// API ROUTES OBJECT
// =============================================================================

export const API_ROUTES = {
  // ---------------------------------------------------------------------------
  // HEALTH & SYSTEM
  // ---------------------------------------------------------------------------
  HEALTH: `${BASE_URL}/health`,
  
  // ---------------------------------------------------------------------------
  // AUTHENTICATION
  // ---------------------------------------------------------------------------
  AUTH: {
    LOGIN: `${BASE_URL}/auth/login`,
    LOGOUT: `${BASE_URL}/auth/logout`,
    REFRESH: `${BASE_URL}/auth/refresh`,
    ME: `${BASE_URL}/auth/me`,
    CHANGE_PASSWORD: `${BASE_URL}/auth/change-password`,
  },

  // ---------------------------------------------------------------------------
  // ORDERS
  // ---------------------------------------------------------------------------
  ORDERS: {
    LIST: `${BASE_URL}/orders`,
    CREATE: `${BASE_URL}/orders`,
    DETAIL: (id: string) => `${BASE_URL}/orders/${id}`,
    UPDATE: (id: string) => `${BASE_URL}/orders/${id}`,
    DELETE: (id: string) => `${BASE_URL}/orders/${id}`,
    STATUS: (id: string) => `${BASE_URL}/orders/${id}/status`,
    ASSIGN: (id: string) => `${BASE_URL}/orders/${id}/assign`,
    COMMENTS: (id: string) => `${BASE_URL}/orders/${id}/comments`,
    LOGS: (id: string) => `${BASE_URL}/orders/${id}/logs`,
    PRINT: (id: string) => `${BASE_URL}/orders/${id}/print`,
    STATS: `${BASE_URL}/orders/stats`,
  },

  // ---------------------------------------------------------------------------
  // PRODUCTS
  // ---------------------------------------------------------------------------
  PRODUCTS: {
    LIST: `${BASE_URL}/products`,
    CREATE: `${BASE_URL}/products`,
    DETAIL: (id: string) => `${BASE_URL}/products/${id}`,
    UPDATE: (id: string) => `${BASE_URL}/products/${id}`,
    DELETE: (id: string) => `${BASE_URL}/products/${id}`,
    SEARCH: `${BASE_URL}/products/search`,
    TOGGLE_STATUS: (id: string) => `${BASE_URL}/products/${id}/toggle-status`,
    VARIANTS: (id: string) => `${BASE_URL}/products/${id}/variants`,
  },

  // ---------------------------------------------------------------------------
  // VARIANTS (Direct access)
  // ---------------------------------------------------------------------------
  VARIANTS: {
    LIST: `${BASE_URL}/variants`,
    DETAIL: (id: string) => `${BASE_URL}/variants/${id}`,
    UPDATE: (id: string) => `${BASE_URL}/variants/${id}`,
    STOCK: (id: string) => `${BASE_URL}/variants/${id}/stock`,
  },

  // ---------------------------------------------------------------------------
  // INVENTORY (Unified Transaction System)
  // ---------------------------------------------------------------------------
  INVENTORY: {
    // Transactions
    TRANSACTIONS: {
      LIST: `${BASE_URL}/inventory/transactions`,
      CREATE: `${BASE_URL}/inventory/transactions`,
      DETAIL: (id: string) => `${BASE_URL}/inventory/transactions/${id}`,
      NEXT_INVOICE: `${BASE_URL}/inventory/transactions/next-invoice`,
      PENDING: `${BASE_URL}/inventory/transactions/pending`,
      APPROVE: (id: string) => `${BASE_URL}/inventory/transactions/${id}/approve`,
      REJECT: (id: string) => `${BASE_URL}/inventory/transactions/${id}/reject`,
      VOID: (id: string) => `${BASE_URL}/inventory/transactions/${id}/void`,
    },
    // Legacy endpoints
    ADJUSTMENTS: `${BASE_URL}/inventory/adjustments`,
    DAMAGES: `${BASE_URL}/inventory/damages`,
    MOVEMENTS: `${BASE_URL}/inventory/movements`,
    VALUATION: `${BASE_URL}/inventory/valuation`,
    LOW_STOCK: `${BASE_URL}/inventory/low-stock`,
    VARIANT_MOVEMENTS: (variantId: string) => `${BASE_URL}/inventory/variants/${variantId}/movements`,
    PURCHASES_SEARCH: `${BASE_URL}/inventory/purchases/search`,
  },

  // ---------------------------------------------------------------------------
  // CUSTOMERS
  // ---------------------------------------------------------------------------
  CUSTOMERS: {
    LIST: `${BASE_URL}/customers`,
    CREATE: `${BASE_URL}/customers`,
    DETAIL: (id: string) => `${BASE_URL}/customers/${id}`,
    UPDATE: (id: string) => `${BASE_URL}/customers/${id}`,
    SEARCH: `${BASE_URL}/customers/search`,
    ORDERS: (id: string) => `${BASE_URL}/customers/${id}/orders`,
    STATS: (id: string) => `${BASE_URL}/customers/${id}/stats`,
  },

  // ---------------------------------------------------------------------------
  // VENDORS
  // ---------------------------------------------------------------------------
  VENDORS: {
    LIST: `${BASE_URL}/vendors`,
    CREATE: `${BASE_URL}/vendors`,
    DETAIL: (id: string) => `${BASE_URL}/vendors/${id}`,
    UPDATE: (id: string) => `${BASE_URL}/vendors/${id}`,
    DELETE: (id: string) => `${BASE_URL}/vendors/${id}`,
    PURCHASES: (id: string) => `${BASE_URL}/vendors/${id}/purchases`,
    LEDGER: (id: string) => `${BASE_URL}/vendors/${id}/ledger`,
  },

  // ---------------------------------------------------------------------------
  // DISPATCH & RIDERS
  // ---------------------------------------------------------------------------
  DISPATCH: {
    RUNS: `${BASE_URL}/dispatch/runs`,
    CREATE_RUN: `${BASE_URL}/dispatch/runs`,
    RUN_DETAIL: (id: string) => `${BASE_URL}/dispatch/runs/${id}`,
    ASSIGN_ORDER: `${BASE_URL}/dispatch/assign`,
    AVAILABLE_ORDERS: `${BASE_URL}/dispatch/available-orders`,
  },
  RIDERS: {
    LIST: `${BASE_URL}/riders`,
    DETAIL: (id: string) => `${BASE_URL}/riders/${id}`,
    UPDATE_STATUS: (id: string) => `${BASE_URL}/riders/${id}/status`,
    DELIVERIES: (id: string) => `${BASE_URL}/riders/${id}/deliveries`,
    PERFORMANCE: (id: string) => `${BASE_URL}/riders/${id}/performance`,
  },

  // ---------------------------------------------------------------------------
  // LOGISTICS
  // ---------------------------------------------------------------------------
  LOGISTICS: {
    COURIERS: `${BASE_URL}/logistics/couriers`,
    HANDOVER: `${BASE_URL}/logistics/handover`,
    TRACK: (awb: string) => `${BASE_URL}/logistics/track/${awb}`,
    MANIFEST: `${BASE_URL}/logistics/manifest`,
  },

  // ---------------------------------------------------------------------------
  // TICKETS / SUPPORT
  // ---------------------------------------------------------------------------
  TICKETS: {
    LIST: `${BASE_URL}/tickets`,
    CREATE: `${BASE_URL}/tickets`,
    DETAIL: (id: string) => `${BASE_URL}/tickets/${id}`,
    UPDATE: (id: string) => `${BASE_URL}/tickets/${id}`,
    MESSAGES: (id: string) => `${BASE_URL}/tickets/${id}/messages`,
    RESOLVE: (id: string) => `${BASE_URL}/tickets/${id}/resolve`,
    ESCALATE: (id: string) => `${BASE_URL}/tickets/${id}/escalate`,
  },

  // ---------------------------------------------------------------------------
  // UPLOADS
  // ---------------------------------------------------------------------------
  UPLOAD: {
    SINGLE: `${BASE_URL}/upload`,
    MULTIPLE: `${BASE_URL}/upload/multiple`,
    DELETE: `${BASE_URL}/upload`,
  },

  // ---------------------------------------------------------------------------
  // SMS
  // ---------------------------------------------------------------------------
  SMS: {
    SEND: `${BASE_URL}/sms/send`,
    TEMPLATES: `${BASE_URL}/sms/templates`,
    LOGS: `${BASE_URL}/sms/logs`,
  },

  // ---------------------------------------------------------------------------
  // STATIC DATA (Cached)
  // ---------------------------------------------------------------------------
  STATIC: {
    CATEGORIES: `${BASE_URL}/static/categories`,
    BRANDS: `${BASE_URL}/static/brands`,
    DELIVERY_ZONES: `${BASE_URL}/static/delivery-zones`,
    FULFILLMENT_TYPES: `${BASE_URL}/static/fulfillment-types`,
    ORDER_STATUSES: `${BASE_URL}/static/order-statuses`,
    STATUS_TRANSITIONS: `${BASE_URL}/static/status-transitions`,
    PAYMENT_METHODS: `${BASE_URL}/static/payment-methods`,
    ORDER_SOURCES: `${BASE_URL}/static/order-sources`,
    APP_CONFIG: `${BASE_URL}/static/app-config`,
  },

  // ---------------------------------------------------------------------------
  // BACKWARD COMPATIBLE ROUTES (Legacy)
  // ---------------------------------------------------------------------------
  LEGACY: {
    CATEGORIES: `${BASE_URL}/categories`,  // Redirects to /static/categories
    BRANDS: `${BASE_URL}/brands`,          // Redirects to /static/brands
    PURCHASES: `${BASE_URL}/purchases`,
  },

  // ---------------------------------------------------------------------------
  // EXTERNAL INTEGRATIONS
  // ---------------------------------------------------------------------------
  EXTERNAL: {
    WEBSITE_ORDER: `${BASE_URL}/external/order`,
    SHOPIFY_WEBHOOK: `${BASE_URL}/webhooks/shopify`,
    WOOCOMMERCE_WEBHOOK: `${BASE_URL}/webhooks/woocommerce`,
  },

  // ---------------------------------------------------------------------------
  // VENDOR PORTAL
  // ---------------------------------------------------------------------------
  VENDOR_PORTAL: {
    LOGIN: `${BASE_URL}/vendor-portal/login`,
    ORDERS: `${BASE_URL}/vendor-portal/orders`,
    PRODUCTS: `${BASE_URL}/vendor-portal/products`,
    PAYMENTS: `${BASE_URL}/vendor-portal/payments`,
    STATS: `${BASE_URL}/vendor-portal/stats`,
  },
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build URL with query parameters
 */
export function buildUrl(baseUrl: string, params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return baseUrl;
  
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  
  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Type-safe route builder for orders
 */
export const orderRoutes = {
  list: (params?: { page?: number; limit?: number; status?: string; search?: string }) => 
    buildUrl(API_ROUTES.ORDERS.LIST, params),
  detail: (id: string) => API_ROUTES.ORDERS.DETAIL(id),
  updateStatus: (id: string) => API_ROUTES.ORDERS.STATUS(id),
};

/**
 * Type-safe route builder for products
 */
export const productRoutes = {
  list: (params?: { page?: number; limit?: number; is_active?: boolean }) => 
    buildUrl(API_ROUTES.PRODUCTS.LIST, params),
  search: (query: string, limit = 15, mode?: 'SALES' | 'INVENTORY') => 
    buildUrl(API_ROUTES.PRODUCTS.SEARCH, { q: query, limit, mode }),
  detail: (id: string) => API_ROUTES.PRODUCTS.DETAIL(id),
};

/**
 * Type-safe route builder for inventory
 */
export const inventoryRoutes = {
  transactions: (params?: { page?: number; limit?: number; type?: string }) => 
    buildUrl(API_ROUTES.INVENTORY.TRANSACTIONS.LIST, params),
  nextInvoice: (type: string) => 
    buildUrl(API_ROUTES.INVENTORY.TRANSACTIONS.NEXT_INVOICE, { type }),
  purchaseSearch: (params?: { vendor_id?: string; invoice_no?: string; limit?: number }) => 
    buildUrl(API_ROUTES.INVENTORY.PURCHASES_SEARCH, params),
};

// Export default for convenience
export default API_ROUTES;
