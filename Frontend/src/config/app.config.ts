/**
 * Centralized Application Configuration
 * 
 * P1 Code Quality Fix: All hardcoded values should be imported from here.
 * This enables easy changes across the entire application.
 * 
 * @author Code Quality Team
 * @priority P1 - Code Quality
 */

// =============================================================================
// API CONFIGURATION
// =============================================================================

export const API_CONFIG = {
  /** Base URL for API requests */
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  
  /** Request timeout in milliseconds */
  TIMEOUT: 30000,
  
  /** Maximum number of retries for failed requests */
  MAX_RETRIES: 3,
  
  /** Initial delay before retry (exponential backoff) */
  INITIAL_RETRY_DELAY: 1000,
  
  /** Window for deduplicating identical requests */
  DEDUP_WINDOW_MS: 100,
} as const;

// =============================================================================
// CURRENCY CONFIGURATION
// =============================================================================

export const CURRENCY_CONFIG = {
  /** ISO currency code */
  CODE: 'NPR',
  
  /** Currency symbol for display (Nepali) */
  SYMBOL: 'रु.',
  
  /** Currency symbol (English alternative) */
  SYMBOL_EN: 'Rs.',
  
  /** Number of decimal places */
  DECIMALS: 2,
  
  /** Locale for formatting */
  LOCALE: 'ne-NP',
  
  /** Thresholds for compact number formatting */
  COMPACT_THRESHOLDS: {
    CRORE: 10000000,   // 1 crore = 10 million
    LAKH: 100000,      // 1 lakh = 100 thousand
    THOUSAND: 1000,
  },
} as const;

/**
 * Format currency amount with proper symbol
 * @param amount - The amount to format
 * @param options - Formatting options
 */
export function formatCurrency(
  amount: number | null | undefined,
  options?: {
    compact?: boolean;
    showSymbol?: boolean;
    useEnglishSymbol?: boolean;
  }
): string {
  if (amount === null || amount === undefined) return '-';
  
  const { compact = false, showSymbol = true, useEnglishSymbol = false } = options || {};
  const symbol = useEnglishSymbol ? CURRENCY_CONFIG.SYMBOL_EN : CURRENCY_CONFIG.SYMBOL;
  
  let formatted: string;
  
  if (compact) {
    const { CRORE, LAKH, THOUSAND } = CURRENCY_CONFIG.COMPACT_THRESHOLDS;
    if (amount >= CRORE) {
      formatted = `${(amount / CRORE).toFixed(1)}Cr`;
    } else if (amount >= LAKH) {
      formatted = `${(amount / LAKH).toFixed(1)}L`;
    } else if (amount >= THOUSAND) {
      formatted = `${(amount / THOUSAND).toFixed(1)}K`;
    } else {
      formatted = amount.toLocaleString('en-IN');
    }
  } else {
    formatted = amount.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: CURRENCY_CONFIG.DECIMALS,
    });
  }
  
  return showSymbol ? `${symbol}${formatted}` : formatted;
}

// =============================================================================
// PAGINATION CONFIGURATION
// =============================================================================

export const PAGINATION = {
  /** Default items per page */
  DEFAULT_LIMIT: 20,
  
  /** Orders list page size */
  ORDERS_PER_PAGE: 25,
  
  /** Products list page size */
  PRODUCTS_PER_PAGE: 20,
  
  /** Customers list page size */
  CUSTOMERS_PER_PAGE: 50,
  
  /** Vendors list page size */
  VENDORS_PER_PAGE: 50,
  
  /** Transactions list page size */
  TRANSACTIONS_PER_PAGE: 20,
  
  /** Search dropdown results limit */
  SEARCH_RESULTS_LIMIT: 10,
  
  /** Command palette results per category */
  COMMAND_PALETTE_LIMIT: 5,
  
  /** Dashboard widget items */
  DASHBOARD_WIDGET_LIMIT: 5,
  
  /** Maximum items allowed in a single request */
  MAX_LIMIT: 100,
  
  /** Bulk operations maximum */
  BULK_MAX_LIMIT: 500,
} as const;

// =============================================================================
// ORDER STATUS CONFIGURATION
// =============================================================================

export const ORDER_STATUSES = {
  // Intake statuses
  INTAKE: 'intake',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  
  // Processing statuses
  PROCESSING: 'processing',
  READY_TO_DISPATCH: 'ready_to_dispatch',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  
  // Completion statuses
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  
  // Cancelled/Return statuses
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
  REFUNDED: 'refunded',
  REJECTED: 'rejected',
  
  // Special statuses
  ON_HOLD: 'on_hold',
  STORE_SALE: 'store_sale',
  EXCHANGE: 'exchange',
} as const;

export type OrderStatus = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

/** Statuses that are considered "closed" (cannot be modified) */
export const CLOSED_STATUSES: OrderStatus[] = [
  ORDER_STATUSES.DELIVERED,
  ORDER_STATUSES.COMPLETED,
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.RETURNED,
  ORDER_STATUSES.REFUNDED,
  ORDER_STATUSES.REJECTED,
];

/** Statuses that are considered "active" (in progress) */
export const ACTIVE_STATUSES: OrderStatus[] = [
  ORDER_STATUSES.INTAKE,
  ORDER_STATUSES.PENDING,
  ORDER_STATUSES.CONFIRMED,
  ORDER_STATUSES.PROCESSING,
  ORDER_STATUSES.READY_TO_DISPATCH,
  ORDER_STATUSES.OUT_FOR_DELIVERY,
];

// =============================================================================
// PAYMENT STATUS CONFIGURATION
// =============================================================================

export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  REFUNDED: 'refunded',
  COD: 'cod',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUSES[keyof typeof PAYMENT_STATUSES];

// =============================================================================
// FULFILLMENT CONFIGURATION
// =============================================================================

export const FULFILLMENT_TYPES = {
  INSIDE_VALLEY: 'inside_valley',
  OUTSIDE_VALLEY: 'outside_valley',
  STORE: 'store',
} as const;

export type FulfillmentType = typeof FULFILLMENT_TYPES[keyof typeof FULFILLMENT_TYPES];

// =============================================================================
// SHIPPING CONFIGURATION
// =============================================================================

export const SHIPPING_CONFIG = {
  /** Default shipping rate for inside valley */
  DEFAULT_INSIDE_VALLEY: 100,
  
  /** Default shipping rate for outside valley */
  DEFAULT_OUTSIDE_VALLEY: 150,
  
  /** Free shipping threshold */
  FREE_SHIPPING_THRESHOLD: 5000,
  
  /** Weight-based rate per kg */
  WEIGHT_RATE_PER_KG: 50,
  
  /** Maximum weight allowed (kg) */
  MAX_WEIGHT_KG: 30,
} as const;

// =============================================================================
// INVENTORY CONFIGURATION
// =============================================================================

export const INVENTORY_CONFIG = {
  /** Low stock warning threshold */
  LOW_STOCK_THRESHOLD: 5,
  
  /** Critical stock threshold */
  CRITICAL_STOCK_THRESHOLD: 2,
  
  /** Out of stock threshold */
  OUT_OF_STOCK_THRESHOLD: 0,
  
  /** Maximum stock quantity */
  MAX_STOCK_QUANTITY: 99999,
} as const;

// =============================================================================
// TRANSACTION TYPES
// =============================================================================

export const TRANSACTION_TYPES = {
  PURCHASE: 'purchase',
  PURCHASE_RETURN: 'purchase_return',
  SALE: 'sale',
  SALE_RETURN: 'sale_return',
  DAMAGE: 'damage',
  ADJUSTMENT: 'adjustment',
  TRANSFER: 'transfer',
} as const;

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];

// =============================================================================
// USER ROLES
// =============================================================================

export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  OPERATOR: 'operator',
  STAFF: 'staff',
  VENDOR: 'vendor',
  RIDER: 'rider',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

/** Roles that are considered "staff" (internal users) */
export const STAFF_ROLES: UserRole[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.MANAGER,
  USER_ROLES.OPERATOR,
  USER_ROLES.STAFF,
];

// =============================================================================
// DATE/TIME CONFIGURATION
// =============================================================================

export const DATE_CONFIG = {
  /** Default timezone */
  TIMEZONE: 'Asia/Kathmandu',
  
  /** Date format for display */
  DISPLAY_FORMAT: 'MMM dd, yyyy',
  
  /** Date-time format for display */
  DATETIME_FORMAT: 'MMM dd, yyyy HH:mm',
  
  /** Time format for display */
  TIME_FORMAT: 'HH:mm',
  
  /** ISO format for API */
  API_FORMAT: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
} as const;

// =============================================================================
// PHONE NUMBER CONFIGURATION (Nepal)
// =============================================================================

export const PHONE_CONFIG = {
  /** Country code */
  COUNTRY_CODE: '+977',
  
  /** Valid mobile prefixes */
  MOBILE_PREFIXES: ['97', '98'],
  
  /** Expected length (without country code) */
  LENGTH: 10,
  
  /** Regex pattern for validation */
  PATTERN: /^(97|98)\d{8}$/,
} as const;

// =============================================================================
// FILE UPLOAD CONFIGURATION
// =============================================================================

export const UPLOAD_CONFIG = {
  /** Maximum file size in bytes (5MB) */
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  
  /** Allowed image types */
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  
  /** Maximum images per product */
  MAX_PRODUCT_IMAGES: 10,
  
  /** Image quality for compression (0-1) */
  IMAGE_QUALITY: 0.8,
} as const;

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export const FEATURES = {
  /** Enable realtime inventory updates */
  REALTIME_INVENTORY: true,
  
  /** Enable SMS notifications */
  SMS_NOTIFICATIONS: true,
  
  /** Enable email notifications */
  EMAIL_NOTIFICATIONS: false,
  
  /** Enable vendor portal */
  VENDOR_PORTAL: true,
  
  /** Enable rider app */
  RIDER_APP: true,
  
  /** Enable POS mode */
  POS_MODE: true,
} as const;

// =============================================================================
// EXPORT DEFAULT
// =============================================================================

export default {
  API: API_CONFIG,
  CURRENCY: CURRENCY_CONFIG,
  PAGINATION,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  FULFILLMENT_TYPES,
  SHIPPING: SHIPPING_CONFIG,
  INVENTORY: INVENTORY_CONFIG,
  TRANSACTION_TYPES,
  USER_ROLES,
  DATE: DATE_CONFIG,
  PHONE: PHONE_CONFIG,
  UPLOAD: UPLOAD_CONFIG,
  FEATURES,
} as const;
