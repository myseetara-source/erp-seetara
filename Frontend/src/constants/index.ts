/**
 * Centralized Constants (QUAL-001)
 * 
 * Single source of truth for all hardcoded values.
 * Import from this file instead of using inline strings.
 * 
 * BENEFITS:
 * - Type safety with const assertions
 * - Easy to update in one place
 * - Better IDE autocomplete
 * - Prevents typos
 * 
 * @example
 * import { FULFILLMENT_TYPES, ORDER_STATUSES } from '@/constants';
 * 
 * if (order.fulfillmentType === FULFILLMENT_TYPES.INSIDE_VALLEY) { ... }
 */

// =============================================================================
// FULFILLMENT TYPES
// =============================================================================

export const FULFILLMENT_TYPES = {
  INSIDE_VALLEY: 'inside_valley',
  OUTSIDE_VALLEY: 'outside_valley',
  STORE: 'store',
} as const;

export type FulfillmentType = typeof FULFILLMENT_TYPES[keyof typeof FULFILLMENT_TYPES];

export const FULFILLMENT_TYPE_LABELS: Record<FulfillmentType, string> = {
  [FULFILLMENT_TYPES.INSIDE_VALLEY]: 'Inside Valley',
  [FULFILLMENT_TYPES.OUTSIDE_VALLEY]: 'Outside Valley',
  [FULFILLMENT_TYPES.STORE]: 'Store Pickup',
};

export const FULFILLMENT_TYPE_OPTIONS = [
  { value: FULFILLMENT_TYPES.INSIDE_VALLEY, label: 'Inside Valley', description: 'Kathmandu Valley - Same day delivery' },
  { value: FULFILLMENT_TYPES.OUTSIDE_VALLEY, label: 'Outside Valley', description: 'Outside Kathmandu - 3-7 days' },
  { value: FULFILLMENT_TYPES.STORE, label: 'Store Pickup', description: 'Customer picks up from store' },
] as const;

// =============================================================================
// ORDER STATUSES
// =============================================================================

export const ORDER_STATUSES = {
  INTAKE: 'intake',
  FOLLOW_UP: 'follow_up',
  CONVERTED: 'converted',
  HOLD: 'hold',
  PACKED: 'packed',
  ASSIGNED: 'assigned',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  HANDOVER_TO_COURIER: 'handover_to_courier',
  IN_TRANSIT: 'in_transit',
  STORE_SALE: 'store_sale',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  RETURN_INITIATED: 'return_initiated',
  RETURNED: 'returned',
} as const;

export type OrderStatus = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [ORDER_STATUSES.INTAKE]: 'Intake',
  [ORDER_STATUSES.FOLLOW_UP]: 'Follow Up',
  [ORDER_STATUSES.CONVERTED]: 'Converted',
  [ORDER_STATUSES.HOLD]: 'On Hold',
  [ORDER_STATUSES.PACKED]: 'Packed',
  [ORDER_STATUSES.ASSIGNED]: 'Assigned',
  [ORDER_STATUSES.OUT_FOR_DELIVERY]: 'Out for Delivery',
  [ORDER_STATUSES.HANDOVER_TO_COURIER]: 'Handover to Courier',
  [ORDER_STATUSES.IN_TRANSIT]: 'In Transit',
  [ORDER_STATUSES.STORE_SALE]: 'Store Sale',
  [ORDER_STATUSES.DELIVERED]: 'Delivered',
  [ORDER_STATUSES.CANCELLED]: 'Cancelled',
  [ORDER_STATUSES.REJECTED]: 'Rejected',
  [ORDER_STATUSES.RETURN_INITIATED]: 'Return Initiated',
  [ORDER_STATUSES.RETURNED]: 'Returned',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  [ORDER_STATUSES.INTAKE]: 'blue',
  [ORDER_STATUSES.FOLLOW_UP]: 'yellow',
  [ORDER_STATUSES.CONVERTED]: 'green',
  [ORDER_STATUSES.HOLD]: 'gray',
  [ORDER_STATUSES.PACKED]: 'indigo',
  [ORDER_STATUSES.ASSIGNED]: 'blue',
  [ORDER_STATUSES.OUT_FOR_DELIVERY]: 'orange',
  [ORDER_STATUSES.HANDOVER_TO_COURIER]: 'purple',
  [ORDER_STATUSES.IN_TRANSIT]: 'cyan',
  [ORDER_STATUSES.STORE_SALE]: 'teal',
  [ORDER_STATUSES.DELIVERED]: 'emerald',
  [ORDER_STATUSES.CANCELLED]: 'red',
  [ORDER_STATUSES.REJECTED]: 'red',
  [ORDER_STATUSES.RETURN_INITIATED]: 'pink',
  [ORDER_STATUSES.RETURNED]: 'gray',
};

// Terminal statuses (no further transitions)
export const TERMINAL_STATUSES: OrderStatus[] = [
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.REJECTED,
  ORDER_STATUSES.RETURNED,
];

// =============================================================================
// PAYMENT STATUSES
// =============================================================================

export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PAID: 'paid',
  PARTIAL: 'partial',
  REFUNDED: 'refunded',
  COD: 'cod',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUSES[keyof typeof PAYMENT_STATUSES];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PAYMENT_STATUSES.PENDING]: 'Pending',
  [PAYMENT_STATUSES.PAID]: 'Paid',
  [PAYMENT_STATUSES.PARTIAL]: 'Partial',
  [PAYMENT_STATUSES.REFUNDED]: 'Refunded',
  [PAYMENT_STATUSES.COD]: 'Cash on Delivery',
};

// =============================================================================
// PAYMENT METHODS
// =============================================================================

export const PAYMENT_METHODS = {
  COD: 'cod',
  ESEWA: 'esewa',
  KHALTI: 'khalti',
  BANK_TRANSFER: 'bank_transfer',
  CASH: 'cash',
} as const;

export type PaymentMethod = typeof PAYMENT_METHODS[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_OPTIONS = [
  { value: PAYMENT_METHODS.COD, label: 'Cash on Delivery', icon: 'Banknote' },
  { value: PAYMENT_METHODS.ESEWA, label: 'eSewa', icon: 'Wallet' },
  { value: PAYMENT_METHODS.KHALTI, label: 'Khalti', icon: 'Wallet' },
  { value: PAYMENT_METHODS.BANK_TRANSFER, label: 'Bank Transfer', icon: 'Building' },
  { value: PAYMENT_METHODS.CASH, label: 'Cash', icon: 'Banknote' },
] as const;

// =============================================================================
// ORDER SOURCES
// =============================================================================

export const ORDER_SOURCES = {
  MANUAL: 'manual',
  WEBSITE: 'website',
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  STORE: 'store',
  TODAYTREND: 'todaytrend',
  SEETARA: 'seetara',
  API: 'api',
} as const;

export type OrderSource = typeof ORDER_SOURCES[keyof typeof ORDER_SOURCES];

export const ORDER_SOURCE_OPTIONS = [
  { value: ORDER_SOURCES.MANUAL, label: 'Manual Entry' },
  { value: ORDER_SOURCES.WEBSITE, label: 'Website' },
  { value: ORDER_SOURCES.FACEBOOK, label: 'Facebook' },
  { value: ORDER_SOURCES.INSTAGRAM, label: 'Instagram' },
  { value: ORDER_SOURCES.STORE, label: 'Store Walk-in' },
  { value: ORDER_SOURCES.TODAYTREND, label: 'Today Trend' },
  { value: ORDER_SOURCES.SEETARA, label: 'Seetara' },
] as const;

// =============================================================================
// INVENTORY TRANSACTION TYPES
// =============================================================================

export const TRANSACTION_TYPES = {
  PURCHASE: 'purchase',
  PURCHASE_RETURN: 'purchase_return',
  DAMAGE: 'damage',
  ADJUSTMENT: 'adjustment',
} as const;

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  [TRANSACTION_TYPES.PURCHASE]: 'Purchase',
  [TRANSACTION_TYPES.PURCHASE_RETURN]: 'Purchase Return',
  [TRANSACTION_TYPES.DAMAGE]: 'Damage / Write-off',
  [TRANSACTION_TYPES.ADJUSTMENT]: 'Adjustment',
};

export const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  [TRANSACTION_TYPES.PURCHASE]: 'green',
  [TRANSACTION_TYPES.PURCHASE_RETURN]: 'orange',
  [TRANSACTION_TYPES.DAMAGE]: 'red',
  [TRANSACTION_TYPES.ADJUSTMENT]: 'blue',
};

// =============================================================================
// TRANSACTION STATUSES (Maker-Checker)
// =============================================================================

export const TRANSACTION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  VOIDED: 'voided',
} as const;

export type TransactionStatus = typeof TRANSACTION_STATUSES[keyof typeof TRANSACTION_STATUSES];

// =============================================================================
// USER ROLES
// =============================================================================

export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  OPERATOR: 'operator',
  VENDOR: 'vendor',
  RIDER: 'rider',
  VIEWER: 'viewer',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [USER_ROLES.ADMIN]: 'Administrator',
  [USER_ROLES.MANAGER]: 'Manager',
  [USER_ROLES.OPERATOR]: 'Operator',
  [USER_ROLES.VENDOR]: 'Vendor',
  [USER_ROLES.RIDER]: 'Rider',
  [USER_ROLES.VIEWER]: 'Viewer',
};

// Roles that can see financial data
export const FINANCIAL_ROLES: UserRole[] = [USER_ROLES.ADMIN];

// =============================================================================
// SHIPPING DEFAULTS
// =============================================================================

export const SHIPPING_DEFAULTS = {
  INSIDE_VALLEY: 100,
  OUTSIDE_VALLEY: 150,
  STORE_PICKUP: 0,
} as const;

// =============================================================================
// STOCK THRESHOLDS
// =============================================================================

export const STOCK_THRESHOLDS = {
  LOW_STOCK: 10,
  OUT_OF_STOCK: 0,
  REORDER_LEVEL: 5,
} as const;

// =============================================================================
// PAGINATION DEFAULTS
// =============================================================================

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  ORDERS_PER_PAGE: 25,
  PRODUCTS_PER_PAGE: 20,
  CUSTOMERS_PER_PAGE: 50,
} as const;

// =============================================================================
// DATE FORMATS
// =============================================================================

export const DATE_FORMATS = {
  DISPLAY: 'MMM dd, yyyy',
  DISPLAY_WITH_TIME: 'MMM dd, yyyy HH:mm',
  API: 'yyyy-MM-dd',
  ISO: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
} as const;

// =============================================================================
// REGEX PATTERNS
// =============================================================================

export const PATTERNS = {
  PHONE_NP: /^[0-9]{10}$/, // Nepal phone: 10 digits
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  SKU: /^[A-Z0-9-]+$/i,
  ORDER_NUMBER: /^ORD-\d+$/,
} as const;

// =============================================================================
// API ENDPOINTS (for consistency)
// =============================================================================

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
  },
  PRODUCTS: {
    LIST: '/products',
    SEARCH: '/products/search',
    BY_ID: (id: string) => `/products/${id}`,
    VARIANTS: (id: string) => `/products/${id}/variants`,
  },
  ORDERS: {
    LIST: '/orders',
    BY_ID: (id: string) => `/orders/${id}`,
    UPDATE_STATUS: (id: string) => `/orders/${id}/status`,
  },
  INVENTORY: {
    TRANSACTIONS: '/inventory/transactions',
    NEXT_INVOICE: '/inventory/transactions/next-invoice',
    PENDING: '/inventory/transactions/pending',
  },
  STATIC: {
    CATEGORIES: '/static/categories',
    BRANDS: '/static/brands',
    DELIVERY_ZONES: '/static/delivery-zones',
    FULFILLMENT_TYPES: '/static/fulfillment-types',
    ORDER_STATUSES: '/static/order-statuses',
    PAYMENT_METHODS: '/static/payment-methods',
  },
} as const;

// =============================================================================
// ERROR CODES
// =============================================================================

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_INVOICE: 'DUPLICATE_INVOICE',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  RETURN_QUANTITY_EXCEEDED: 'RETURN_QUANTITY_EXCEEDED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  FULFILLMENT_TYPES,
  FULFILLMENT_TYPE_LABELS,
  FULFILLMENT_TYPE_OPTIONS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  TERMINAL_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_OPTIONS,
  ORDER_SOURCES,
  ORDER_SOURCE_OPTIONS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  TRANSACTION_STATUSES,
  USER_ROLES,
  USER_ROLE_LABELS,
  FINANCIAL_ROLES,
  SHIPPING_DEFAULTS,
  STOCK_THRESHOLDS,
  PAGINATION,
  DATE_FORMATS,
  PATTERNS,
  API_ENDPOINTS,
  ERROR_CODES,
};
