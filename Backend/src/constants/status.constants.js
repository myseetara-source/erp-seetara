/**
 * STATUS CONSTANTS - Single Source of Truth
 * 
 * These MUST match Database ENUMs EXACTLY (case-sensitive)
 * Source: Backend/database/01_master_schema.sql
 * 
 * CRITICAL: Any changes here must be synced with:
 * 1. Database migrations
 * 2. Frontend type definitions
 * 3. All controller validation logic
 */

// =============================================================================
// ORDER STATUS (from order_status ENUM)
// =============================================================================

/**
 * Order lifecycle statuses - lowercase as defined in database
 * CREATE TYPE order_status AS ENUM (...)
 */
export const ORDER_STATUS = {
  // Sales/Lead stage
  INTAKE: 'intake',
  FOLLOW_UP: 'follow_up',
  CONVERTED: 'converted',
  HOLD: 'hold',
  
  // Processing stage
  PACKED: 'packed',
  
  // Fulfillment stage (Inside Valley)
  ASSIGNED: 'assigned',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  
  // Fulfillment stage (Outside Valley)
  HANDOVER_TO_COURIER: 'handover_to_courier',
  IN_TRANSIT: 'in_transit',
  
  // Store POS
  STORE_SALE: 'store_sale',
  
  // Final states
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  
  // Returns (Legacy)
  RETURN_INITIATED: 'return_initiated',
  RETURNED: 'returned',
  
  // P0 RTO (Return to Origin) - Holding State Workflow
  // Courier says rejected/undelivered → RTO_INITIATED
  // Courier says delivered back to vendor → RTO_VERIFICATION_PENDING (holding state)
  // Warehouse scans & verifies → RETURNED (only then inventory updates)
  // Item lost in transit → LOST_IN_TRANSIT (for courier disputes)
  RTO_INITIATED: 'rto_initiated',                    // Courier says customer rejected
  RTO_VERIFICATION_PENDING: 'rto_verification_pending', // Courier says returned, awaiting physical verification
  LOST_IN_TRANSIT: 'lost_in_transit',                // Item lost, open courier dispute
};

/**
 * All valid order statuses as array
 */
export const VALID_ORDER_STATUSES = Object.values(ORDER_STATUS);

/**
 * Status groups for filtering
 */
export const ORDER_STATUS_GROUPS = {
  SALES: [ORDER_STATUS.INTAKE, ORDER_STATUS.FOLLOW_UP, ORDER_STATUS.CONVERTED],
  PROCESSING: [ORDER_STATUS.HOLD, ORDER_STATUS.PACKED],
  IN_FULFILLMENT: [
    ORDER_STATUS.ASSIGNED,
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.HANDOVER_TO_COURIER,
    ORDER_STATUS.IN_TRANSIT,
  ],
  COMPLETED: [ORDER_STATUS.DELIVERED, ORDER_STATUS.STORE_SALE],
  CANCELLED: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED],
  RETURNS: [ORDER_STATUS.RETURN_INITIATED, ORDER_STATUS.RETURNED],
  // P0: RTO Verification Workflow - Orders requiring warehouse action
  RTO_PENDING: [
    ORDER_STATUS.RTO_INITIATED,           // Courier returning the package
    ORDER_STATUS.RTO_VERIFICATION_PENDING, // Awaiting warehouse verification
  ],
  // P0: All RTO-related statuses for filtering
  ALL_RTO: [
    ORDER_STATUS.RETURN_INITIATED,
    ORDER_STATUS.RTO_INITIATED,
    ORDER_STATUS.RTO_VERIFICATION_PENDING,
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.LOST_IN_TRANSIT,
  ],
  // P0: Dispute statuses (need investigation)
  DISPUTES: [ORDER_STATUS.LOST_IN_TRANSIT],
};

// =============================================================================
// LEAD STATUS (stored as TEXT in leads table, not an ENUM)
// =============================================================================

/**
 * Lead statuses - UPPERCASE as used in leads table
 * Note: leads.status is TEXT, not ENUM
 */
export const LEAD_STATUS = {
  INTAKE: 'INTAKE',
  FOLLOW_UP: 'FOLLOW_UP',
  BUSY: 'BUSY',
  CONVERTED: 'CONVERTED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
};

/**
 * All valid lead statuses as array
 */
export const VALID_LEAD_STATUSES = Object.values(LEAD_STATUS);

// =============================================================================
// FULFILLMENT TYPE (from fulfillment_type ENUM)
// =============================================================================

/**
 * Fulfillment types - lowercase as defined in database
 * CREATE TYPE fulfillment_type AS ENUM ('inside_valley', 'outside_valley', 'store')
 */
export const FULFILLMENT_TYPE = {
  INSIDE_VALLEY: 'inside_valley',
  OUTSIDE_VALLEY: 'outside_valley',
  STORE: 'store',
};

/**
 * All valid fulfillment types as array
 */
export const VALID_FULFILLMENT_TYPES = Object.values(FULFILLMENT_TYPE);

/**
 * Fulfillment type aliases (frontend variations → database value)
 */
export const FULFILLMENT_TYPE_MAP = {
  // Inside Valley variations
  'inside': FULFILLMENT_TYPE.INSIDE_VALLEY,
  'Inside': FULFILLMENT_TYPE.INSIDE_VALLEY,
  'INSIDE': FULFILLMENT_TYPE.INSIDE_VALLEY,
  'INSIDE_VALLEY': FULFILLMENT_TYPE.INSIDE_VALLEY,
  'inside_valley': FULFILLMENT_TYPE.INSIDE_VALLEY,
  
  // Outside Valley variations
  'outside': FULFILLMENT_TYPE.OUTSIDE_VALLEY,
  'Outside': FULFILLMENT_TYPE.OUTSIDE_VALLEY,
  'OUTSIDE': FULFILLMENT_TYPE.OUTSIDE_VALLEY,
  'OUTSIDE_VALLEY': FULFILLMENT_TYPE.OUTSIDE_VALLEY,
  'outside_valley': FULFILLMENT_TYPE.OUTSIDE_VALLEY,
  
  // Store variations
  'store': FULFILLMENT_TYPE.STORE,
  'Store': FULFILLMENT_TYPE.STORE,
  'STORE': FULFILLMENT_TYPE.STORE,
  'POS': FULFILLMENT_TYPE.STORE,
  'pos': FULFILLMENT_TYPE.STORE,
  'store_pickup': FULFILLMENT_TYPE.STORE,
};

// =============================================================================
// LOCATION TYPE (from location ENUM in orders/leads tables)
// =============================================================================

/**
 * Location types - UPPERCASE as defined in database
 * Used in orders.location and leads.location columns
 */
export const LOCATION_TYPE = {
  INSIDE_VALLEY: 'INSIDE_VALLEY',
  OUTSIDE_VALLEY: 'OUTSIDE_VALLEY',
  POS: 'POS',
};

/**
 * All valid location types as array
 */
export const VALID_LOCATION_TYPES = Object.values(LOCATION_TYPE);

/**
 * Location type aliases (frontend variations → database value)
 */
export const LOCATION_TYPE_MAP = {
  'Inside': LOCATION_TYPE.INSIDE_VALLEY,
  'inside': LOCATION_TYPE.INSIDE_VALLEY,
  'INSIDE': LOCATION_TYPE.INSIDE_VALLEY,
  'INSIDE_VALLEY': LOCATION_TYPE.INSIDE_VALLEY,
  'inside_valley': LOCATION_TYPE.INSIDE_VALLEY,
  
  'Outside': LOCATION_TYPE.OUTSIDE_VALLEY,
  'outside': LOCATION_TYPE.OUTSIDE_VALLEY,
  'OUTSIDE': LOCATION_TYPE.OUTSIDE_VALLEY,
  'OUTSIDE_VALLEY': LOCATION_TYPE.OUTSIDE_VALLEY,
  'outside_valley': LOCATION_TYPE.OUTSIDE_VALLEY,
  
  'Store': LOCATION_TYPE.POS,
  'store': LOCATION_TYPE.POS,
  'STORE': LOCATION_TYPE.POS,
  'POS': LOCATION_TYPE.POS,
  'pos': LOCATION_TYPE.POS,
};

// =============================================================================
// STATUS MAPPING (Frontend → Database)
// =============================================================================

/**
 * Maps frontend status values to database enum values
 * This handles all the variations and legacy names
 */
export const STATUS_TO_DB_MAP = {
  // Order statuses (exact matches)
  'intake': ORDER_STATUS.INTAKE,
  'follow_up': ORDER_STATUS.FOLLOW_UP,
  'followup': ORDER_STATUS.FOLLOW_UP,
  'converted': ORDER_STATUS.CONVERTED,
  'hold': ORDER_STATUS.HOLD,
  'packed': ORDER_STATUS.PACKED,
  'assigned': ORDER_STATUS.ASSIGNED,
  'out_for_delivery': ORDER_STATUS.OUT_FOR_DELIVERY,
  'handover_to_courier': ORDER_STATUS.HANDOVER_TO_COURIER,
  'in_transit': ORDER_STATUS.IN_TRANSIT,
  'store_sale': ORDER_STATUS.STORE_SALE,
  'delivered': ORDER_STATUS.DELIVERED,
  'cancelled': ORDER_STATUS.CANCELLED,
  'rejected': ORDER_STATUS.REJECTED,
  'return_initiated': ORDER_STATUS.RETURN_INITIATED,
  'returned': ORDER_STATUS.RETURNED,
  
  // UPPERCASE variations
  'INTAKE': ORDER_STATUS.INTAKE,
  'FOLLOW_UP': ORDER_STATUS.FOLLOW_UP,
  'FOLLOWUP': ORDER_STATUS.FOLLOW_UP,
  'CONVERTED': ORDER_STATUS.CONVERTED,
  'HOLD': ORDER_STATUS.HOLD,
  'PACKED': ORDER_STATUS.PACKED,
  'ASSIGNED': ORDER_STATUS.ASSIGNED,
  'OUT_FOR_DELIVERY': ORDER_STATUS.OUT_FOR_DELIVERY,
  'HANDOVER_TO_COURIER': ORDER_STATUS.HANDOVER_TO_COURIER,
  'IN_TRANSIT': ORDER_STATUS.IN_TRANSIT,
  'STORE_SALE': ORDER_STATUS.STORE_SALE,
  'DELIVERED': ORDER_STATUS.DELIVERED,
  'CANCELLED': ORDER_STATUS.CANCELLED,
  'REJECTED': ORDER_STATUS.REJECTED,
  'RETURN_INITIATED': ORDER_STATUS.RETURN_INITIATED,
  'RETURNED': ORDER_STATUS.RETURNED,
  
  // P0: RTO Verification Workflow statuses
  'rto_initiated': ORDER_STATUS.RTO_INITIATED,
  'RTO_INITIATED': ORDER_STATUS.RTO_INITIATED,
  'rto_verification_pending': ORDER_STATUS.RTO_VERIFICATION_PENDING,
  'RTO_VERIFICATION_PENDING': ORDER_STATUS.RTO_VERIFICATION_PENDING,
  'lost_in_transit': ORDER_STATUS.LOST_IN_TRANSIT,
  'LOST_IN_TRANSIT': ORDER_STATUS.LOST_IN_TRANSIT,
  
  // Legacy/frontend variations that need mapping
  'SENT_FOR_DELIVERY': ORDER_STATUS.OUT_FOR_DELIVERY,  // ← FIX: Frontend bug
  'sent_for_delivery': ORDER_STATUS.OUT_FOR_DELIVERY,
  'dispatched': ORDER_STATUS.OUT_FOR_DELIVERY,
  'DISPATCHED': ORDER_STATUS.OUT_FOR_DELIVERY,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize a single status value to database format
 * @param {string} status - Status from frontend (any case/variation)
 * @returns {string|null} - Database-compliant status or null if invalid
 */
export function normalizeOrderStatus(status) {
  if (!status || typeof status !== 'string') return null;
  
  const trimmed = status.trim();
  const normalized = STATUS_TO_DB_MAP[trimmed];
  
  if (normalized) {
    return normalized;
  }
  
  // Try lowercase as fallback
  const lowercased = trimmed.toLowerCase();
  if (VALID_ORDER_STATUSES.includes(lowercased)) {
    return lowercased;
  }
  
  return null;
}

/**
 * Normalize comma-separated status values
 * @param {string} statusString - Comma-separated status values
 * @returns {string[]} - Array of normalized database-compliant statuses
 */
export function normalizeOrderStatuses(statusString) {
  if (!statusString || typeof statusString !== 'string') return [];
  
  const statuses = statusString.split(',').map(s => s.trim()).filter(Boolean);
  const normalized = statuses
    .map(s => normalizeOrderStatus(s))
    .filter(Boolean);
  
  // Remove duplicates
  return [...new Set(normalized)];
}

/**
 * Normalize fulfillment type to database format
 * @param {string} type - Fulfillment type from frontend
 * @returns {string|null} - Database-compliant fulfillment_type or null
 */
export function normalizeFulfillmentType(type) {
  if (!type || typeof type !== 'string') return null;
  
  const mapped = FULFILLMENT_TYPE_MAP[type.trim()];
  return mapped || null;
}

/**
 * Normalize location to database format
 * @param {string} location - Location from frontend
 * @returns {string|null} - Database-compliant location or null
 */
export function normalizeLocation(location) {
  if (!location || typeof location !== 'string') return null;
  
  const mapped = LOCATION_TYPE_MAP[location.trim()];
  return mapped || null;
}

/**
 * Validate if status is valid for a given fulfillment type
 * @param {string} status - Order status
 * @param {string} fulfillmentType - Fulfillment type
 * @returns {boolean} - Whether the status is valid for this fulfillment type
 */
export function isValidStatusForFulfillment(status, fulfillmentType) {
  // Inside Valley: Cannot use outside valley statuses
  if (fulfillmentType === FULFILLMENT_TYPE.INSIDE_VALLEY) {
    return ![ORDER_STATUS.HANDOVER_TO_COURIER, ORDER_STATUS.IN_TRANSIT].includes(status);
  }
  
  // Outside Valley: Cannot use inside valley statuses
  if (fulfillmentType === FULFILLMENT_TYPE.OUTSIDE_VALLEY) {
    return ![ORDER_STATUS.ASSIGNED, ORDER_STATUS.OUT_FOR_DELIVERY].includes(status);
  }
  
  // Store: Cannot use delivery statuses
  if (fulfillmentType === FULFILLMENT_TYPE.STORE) {
    return ![
      ORDER_STATUS.ASSIGNED,
      ORDER_STATUS.OUT_FOR_DELIVERY,
      ORDER_STATUS.HANDOVER_TO_COURIER,
      ORDER_STATUS.IN_TRANSIT,
    ].includes(status);
  }
  
  return true;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  ORDER_STATUS,
  VALID_ORDER_STATUSES,
  ORDER_STATUS_GROUPS,
  LEAD_STATUS,
  VALID_LEAD_STATUSES,
  FULFILLMENT_TYPE,
  VALID_FULFILLMENT_TYPES,
  FULFILLMENT_TYPE_MAP,
  LOCATION_TYPE,
  VALID_LOCATION_TYPES,
  LOCATION_TYPE_MAP,
  STATUS_TO_DB_MAP,
  normalizeOrderStatus,
  normalizeOrderStatuses,
  normalizeFulfillmentType,
  normalizeLocation,
  isValidStatusForFulfillment,
};
