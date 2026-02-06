/**
 * BACKEND CONSTANTS - Single Source of Truth
 * 
 * P1 REFACTOR: Consolidates all magic strings to prevent typo-related bugs (Audit 5.2)
 * 
 * These constants MUST match Database ENUMs EXACTLY (case-sensitive)
 * Source: Backend/database/01_master_schema.sql
 * 
 * @module constants
 */

// Re-export all status constants
export * from './status.constants.js';
export { default as statusConstants } from './status.constants.js';

// =============================================================================
// LOGISTICS PROVIDER CONSTANTS
// =============================================================================

/**
 * Logistics provider identifiers used throughout the system
 * These map to the courier_partner field in orders table
 */
export const LOGISTICS_PROVIDER = {
  NCM: 'NCM',                    // Nepal Can Move
  GAAUBESI: 'GBL',               // Gaau Besi Logistics
  GAAU_BESI: 'GBL',              // Alias for Gaau Besi
  PATHAO: 'Pathao',              // Pathao Courier
  SUNDAR: 'Sundar',              // Sundar Express
  SHIPROCKET: 'Shiprocket',      // Shiprocket Aggregator
  INTERNAL: 'internal',          // Internal/Own riders
  DUMMY: 'dummy',                // Testing provider
};

/**
 * All valid logistics providers as array
 */
export const VALID_LOGISTICS_PROVIDERS = Object.values(LOGISTICS_PROVIDER);

/**
 * Logistics provider aliases (various formats → canonical form)
 */
export const LOGISTICS_PROVIDER_MAP = {
  // NCM variations
  'ncm': LOGISTICS_PROVIDER.NCM,
  'NCM': LOGISTICS_PROVIDER.NCM,
  'nepal_can_move': LOGISTICS_PROVIDER.NCM,
  'nepalcanmove': LOGISTICS_PROVIDER.NCM,
  
  // Gaau Besi variations
  'gbl': LOGISTICS_PROVIDER.GAAUBESI,
  'GBL': LOGISTICS_PROVIDER.GAAUBESI,
  'gaaubesi': LOGISTICS_PROVIDER.GAAUBESI,
  'gaau_besi': LOGISTICS_PROVIDER.GAAUBESI,
  'gaau-besi': LOGISTICS_PROVIDER.GAAUBESI,
  'Gaau Besi': LOGISTICS_PROVIDER.GAAUBESI,
  
  // Other providers
  'pathao': LOGISTICS_PROVIDER.PATHAO,
  'Pathao': LOGISTICS_PROVIDER.PATHAO,
  'sundar': LOGISTICS_PROVIDER.SUNDAR,
  'Sundar': LOGISTICS_PROVIDER.SUNDAR,
  'shiprocket': LOGISTICS_PROVIDER.SHIPROCKET,
  'Shiprocket': LOGISTICS_PROVIDER.SHIPROCKET,
  'internal': LOGISTICS_PROVIDER.INTERNAL,
  'dummy': LOGISTICS_PROVIDER.DUMMY,
};

// =============================================================================
// PAYMENT CONSTANTS
// =============================================================================

/**
 * Payment methods
 */
export const PAYMENT_METHOD = {
  COD: 'cod',
  PREPAID: 'prepaid',
  PARTIAL: 'partial',
  ESEWA: 'esewa',
  KHALTI: 'khalti',
  FONEPAY: 'fonepay',
  BANK_TRANSFER: 'bank_transfer',
  CASH: 'cash',
};

/**
 * Payment statuses
 */
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  REFUNDED: 'refunded',
  FAILED: 'failed',
};

/**
 * All valid payment statuses as array
 */
export const VALID_PAYMENT_STATUSES = Object.values(PAYMENT_STATUS);

/**
 * All valid payment methods as array
 */
export const VALID_PAYMENT_METHODS = Object.values(PAYMENT_METHOD);

// =============================================================================
// TRANSACTION CONSTANTS
// =============================================================================

/**
 * Inventory transaction types
 */
export const TRANSACTION_TYPE = {
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  RETURN: 'RETURN',
  ADJUSTMENT: 'ADJUSTMENT',
  DAMAGE: 'DAMAGE',
  TRANSFER: 'TRANSFER',
};

/**
 * Transaction statuses
 */
export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  VOIDED: 'voided',
  REJECTED: 'rejected',
};

/**
 * All valid transaction types as array
 */
export const VALID_TRANSACTION_TYPES = Object.values(TRANSACTION_TYPE);

/**
 * All valid transaction statuses as array
 */
export const VALID_TRANSACTION_STATUSES = Object.values(TRANSACTION_STATUS);

// =============================================================================
// STOCK MOVEMENT CONSTANTS
// =============================================================================

/**
 * Stock movement types
 */
export const STOCK_MOVEMENT_TYPE = {
  PURCHASE: 'PURCHASE',
  SALE: 'SALE',
  RETURN: 'RETURN',
  ADJUSTMENT_IN: 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT: 'ADJUSTMENT_OUT',
  DAMAGE: 'DAMAGE',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
};

// =============================================================================
// ACTIVITY LOG CONSTANTS
// =============================================================================

/**
 * Activity log types
 */
export const ACTIVITY_TYPE = {
  STATUS_CHANGE: 'status_change',
  PAYMENT: 'payment',
  ASSIGNMENT: 'assignment',
  PACK: 'pack',
  NOTE: 'note',
  SYSTEM_LOG: 'system_log',
  SMS: 'sms',
  LOGISTICS: 'logistics',
  RETURN: 'return',
  EXCHANGE: 'exchange',
  EDIT: 'edit',
};

// =============================================================================
// USER ROLE CONSTANTS
// =============================================================================

/**
 * User roles
 */
export const USER_ROLE = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  OPERATOR: 'operator',
  RIDER: 'rider',
  VIEWER: 'viewer',
};

/**
 * All valid user roles as array
 */
export const VALID_USER_ROLES = Object.values(USER_ROLE);

// =============================================================================
// ORDER SOURCE CONSTANTS
// =============================================================================

/**
 * Order sources (where the order originated)
 */
export const ORDER_SOURCE = {
  MANUAL: 'manual',
  TODAYTREND: 'todaytrend',
  SEETARA: 'seetara',
  SHOPIFY: 'shopify',
  WOOCOMMERCE: 'woocommerce',
  API: 'api',
  POS: 'pos',
};

/**
 * All valid order sources as array
 */
export const VALID_ORDER_SOURCES = Object.values(ORDER_SOURCE);

// =============================================================================
// NCM STATUS MAPPING (External → Internal)
// =============================================================================

import { ORDER_STATUS } from './status.constants.js';

/**
 * NCM status codes mapped to internal order statuses
 * Used by NCMService.js for status normalization
 */
export const NCM_STATUS_MAP = {
  'Booked': ORDER_STATUS.HANDOVER_TO_COURIER,
  'Picked Up': ORDER_STATUS.IN_TRANSIT,
  'In Transit': ORDER_STATUS.IN_TRANSIT,
  'Out for Delivery': ORDER_STATUS.OUT_FOR_DELIVERY,
  'Delivered': ORDER_STATUS.DELIVERED,
  'Returned': ORDER_STATUS.RETURNED,
  'RTO': ORDER_STATUS.RETURNED,
  'Cancelled': ORDER_STATUS.CANCELLED,
  'On Hold': ORDER_STATUS.HOLD,
  // Additional NCM statuses
  'Pickup Order Created': ORDER_STATUS.HANDOVER_TO_COURIER,
  'Drop Off Order Created': ORDER_STATUS.HANDOVER_TO_COURIER,
  'Package at Hub': ORDER_STATUS.IN_TRANSIT,
  'Undelivered': ORDER_STATUS.RTO_INITIATED,
  'Return in Transit': ORDER_STATUS.RTO_INITIATED,
  'Return Completed': ORDER_STATUS.RTO_VERIFICATION_PENDING,
};

// =============================================================================
// GAAU BESI STATUS MAPPING (External → Internal)
// =============================================================================

/**
 * Gaau Besi status codes mapped to internal order statuses
 * Used by GaauBesiProvider.js for status normalization
 */
export const GAAUBESI_STATUS_MAP = {
  'Drop Off Order Created': ORDER_STATUS.HANDOVER_TO_COURIER,
  'Pickup Order Created': ORDER_STATUS.HANDOVER_TO_COURIER,
  'Package Picked': ORDER_STATUS.IN_TRANSIT,
  'Package in Transit': ORDER_STATUS.IN_TRANSIT,
  'Out for Delivery': ORDER_STATUS.OUT_FOR_DELIVERY,
  'Delivered': ORDER_STATUS.DELIVERED,
  'Returned': ORDER_STATUS.RETURNED,
  'Cancelled': ORDER_STATUS.CANCELLED,
  'On Hold': ORDER_STATUS.HOLD,
  // Additional Gaau Besi statuses
  'Package at Branch': ORDER_STATUS.IN_TRANSIT,
  'Delivery Attempted': ORDER_STATUS.OUT_FOR_DELIVERY,
  'Customer Not Available': ORDER_STATUS.HOLD,
  'Return Initiated': ORDER_STATUS.RTO_INITIATED,
};

// =============================================================================
// EDITABLE STATUS CONSTANTS
// =============================================================================

/**
 * Statuses where order details can still be edited
 */
export const EDITABLE_STATUSES = [
  ORDER_STATUS.INTAKE,
  ORDER_STATUS.FOLLOW_UP,
  ORDER_STATUS.CONVERTED,
];

/**
 * Statuses that represent final states (no further transitions)
 */
export const TERMINAL_STATUSES = [
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.LOST_IN_TRANSIT,
];

/**
 * Statuses that should restore stock when transitioned to
 */
export const STOCK_RESTORING_STATUSES = [
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.REJECTED,
  ORDER_STATUS.RETURNED,
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize logistics provider to canonical form
 * @param {string} provider - Provider name in any format
 * @returns {string|null} - Canonical provider code or null if invalid
 */
export function normalizeLogisticsProvider(provider) {
  if (!provider || typeof provider !== 'string') return null;
  
  const trimmed = provider.trim();
  const normalized = LOGISTICS_PROVIDER_MAP[trimmed] || LOGISTICS_PROVIDER_MAP[trimmed.toLowerCase()];
  
  return normalized || null;
}

/**
 * Check if a provider is NCM
 * @param {string} provider - Provider name
 * @returns {boolean}
 */
export function isNCMProvider(provider) {
  const normalized = normalizeLogisticsProvider(provider);
  return normalized === LOGISTICS_PROVIDER.NCM;
}

/**
 * Check if a provider is Gaau Besi
 * @param {string} provider - Provider name
 * @returns {boolean}
 */
export function isGaauBesiProvider(provider) {
  const normalized = normalizeLogisticsProvider(provider);
  return normalized === LOGISTICS_PROVIDER.GAAUBESI;
}

/**
 * Get internal status from NCM status code
 * @param {string} ncmStatus - NCM status string
 * @returns {string|null} - Internal order status or null
 */
export function mapNCMStatus(ncmStatus) {
  if (!ncmStatus) return null;
  return NCM_STATUS_MAP[ncmStatus] || null;
}

/**
 * Get internal status from Gaau Besi status code
 * @param {string} gblStatus - Gaau Besi status string
 * @returns {string|null} - Internal order status or null
 */
export function mapGaauBesiStatus(gblStatus) {
  if (!gblStatus) return null;
  return GAAUBESI_STATUS_MAP[gblStatus] || null;
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  // Status constants (from status.constants.js)
  ORDER_STATUS,
  
  // Logistics
  LOGISTICS_PROVIDER,
  VALID_LOGISTICS_PROVIDERS,
  LOGISTICS_PROVIDER_MAP,
  NCM_STATUS_MAP,
  GAAUBESI_STATUS_MAP,
  
  // Payment
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  VALID_PAYMENT_METHODS,
  VALID_PAYMENT_STATUSES,
  
  // Transactions
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  VALID_TRANSACTION_TYPES,
  VALID_TRANSACTION_STATUSES,
  STOCK_MOVEMENT_TYPE,
  
  // Activity
  ACTIVITY_TYPE,
  
  // Users
  USER_ROLE,
  VALID_USER_ROLES,
  
  // Orders
  ORDER_SOURCE,
  VALID_ORDER_SOURCES,
  EDITABLE_STATUSES,
  TERMINAL_STATUSES,
  STOCK_RESTORING_STATUSES,
  
  // Helpers
  normalizeLogisticsProvider,
  isNCMProvider,
  isGaauBesiProvider,
  mapNCMStatus,
  mapGaauBesiStatus,
};
