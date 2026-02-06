/**
 * Status Configuration - Tri-Core Logic with Role-Based Access
 * 
 * Defines allowed status transitions based on:
 * - Current Status
 * - Fulfillment Type (Inside Valley / Outside Valley / POS)
 * - User Role (admin, manager, operator, rider)
 * 
 * THE "TRAFFIC POLICE" - Enforces strict workflow rules in UI
 */

// =============================================================================
// TYPES
// =============================================================================

export type FulfillmentType = 'INSIDE_VALLEY' | 'OUTSIDE_VALLEY' | 'POS' | 'inside_valley' | 'outside_valley' | 'pos';

export type UserRole = 'admin' | 'manager' | 'operator' | 'rider' | 'viewer';

// IMPORTANT: This enum MUST match the database order_status enum exactly!
// Database: 'intake', 'follow_up', 'converted', 'hold', 'packed', 'assigned',
//           'out_for_delivery', 'handover_to_courier', 'in_transit', 'store_sale',
//           'delivered', 'cancelled', 'rejected', 'return_initiated', 'returned'
export type OrderStatus = 
  | 'intake'
  | 'follow_up'
  | 'converted'
  | 'hold'
  | 'packed'
  | 'assigned'
  | 'out_for_delivery'
  | 'handover_to_courier'
  | 'in_transit'
  | 'store_sale'
  | 'delivered'
  | 'cancelled'
  | 'rejected'
  | 'return_initiated'
  | 'returned';

export interface StatusOption {
  value: OrderStatus;
  label: string;
  color: string;       // Tailwind color class for dot
  bgColor: string;     // Background color for badge
  textColor: string;   // Text color for badge
  icon?: string;       // Optional icon name
  type: 'positive' | 'neutral' | 'negative' | 'warning';
}

// =============================================================================
// STATUS DEFINITIONS
// =============================================================================

// STATUS_MAP: Maps each DB order_status to its display properties
// ALIGNED WITH DATABASE ENUM - DO NOT ADD STATUSES THAT DON'T EXIST IN DB!
export const STATUS_MAP: Record<OrderStatus, StatusOption> = {
  // === INTAKE/LEAD PHASE ===
  intake: {
    value: 'intake',
    label: 'New',
    color: 'bg-blue-500',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    type: 'neutral',
  },
  follow_up: {
    value: 'follow_up',
    label: 'Follow Up',
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    type: 'warning',
  },
  converted: {
    value: 'converted',
    label: 'Converted',
    color: 'bg-green-500',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    type: 'positive',
  },
  hold: {
    value: 'hold',
    label: 'On Hold',
    color: 'bg-orange-500',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    type: 'warning',
  },
  
  // === FULFILLMENT PHASE ===
  packed: {
    value: 'packed',
    label: 'Packed',
    color: 'bg-indigo-500',
    bgColor: 'bg-indigo-100',
    textColor: 'text-indigo-700',
    type: 'positive',
  },
  assigned: {
    value: 'assigned',
    label: 'Assigned',
    color: 'bg-purple-500',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    type: 'positive',
  },
  
  // === DELIVERY PHASE ===
  out_for_delivery: {
    value: 'out_for_delivery',
    label: 'Out for Delivery',
    color: 'bg-amber-500',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    type: 'positive',
  },
  handover_to_courier: {
    value: 'handover_to_courier',
    label: 'With Courier',
    color: 'bg-fuchsia-500',
    bgColor: 'bg-fuchsia-100',
    textColor: 'text-fuchsia-700',
    type: 'positive',
  },
  in_transit: {
    value: 'in_transit',
    label: 'In Transit',
    color: 'bg-teal-500',
    bgColor: 'bg-teal-100',
    textColor: 'text-teal-700',
    type: 'positive',
  },
  
  // === POS / STORE ===
  store_sale: {
    value: 'store_sale',
    label: 'Store Sale',
    color: 'bg-emerald-600',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    type: 'positive',
  },
  
  // === COMPLETION ===
  delivered: {
    value: 'delivered',
    label: 'Delivered',
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    type: 'positive',
  },
  
  // === NEGATIVE OUTCOMES ===
  cancelled: {
    value: 'cancelled',
    label: 'Cancelled',
    color: 'bg-gray-500',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    type: 'negative',
  },
  rejected: {
    value: 'rejected',
    label: 'Rejected',
    color: 'bg-red-500',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    type: 'negative',
  },
  return_initiated: {
    value: 'return_initiated',
    label: 'Return Initiated',
    color: 'bg-rose-500',
    bgColor: 'bg-rose-100',
    textColor: 'text-rose-700',
    type: 'negative',
  },
  returned: {
    value: 'returned',
    label: 'Returned',
    color: 'bg-red-400',
    bgColor: 'bg-red-50',
    textColor: 'text-red-600',
    type: 'negative',
  },
};

// =============================================================================
// TRANSITION RULES - TRI-CORE LOGIC
// =============================================================================
// ALIGNED WITH DATABASE ENUM - Only use statuses that exist in DB!

// Global transitions (apply to all fulfillment types)
const GLOBAL_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  intake: ['follow_up', 'converted', 'cancelled'],
};

// =============================================================================
// P0 FIX: STRICT STATUS TRANSITION RULES - ORDERS PAGE
// =============================================================================
// 
// PHILOSOPHY: "Sales" vs "Operations" separation
// 
// ORDERS PAGE (Sales Team):
//   - Only handles: New → Follow Up → Converted → Cancelled
//   - NO inventory deduction here
//   - Goal: Confirm the order
//
// DISPATCH CENTER (Operations Team):
//   - Handles: Converted → Packed → Assigned/Courier → Delivered
//   - Inventory deduction happens when PACKED
//   - Goal: Fulfill the order
//
// RIDER PORTAL (Delivery Team):
//   - Handles: Out for Delivery → Delivered/Rejected
//   - Goal: Complete delivery
//
// =============================================================================

// Inside Valley specific transitions (Own Riders)
// ORDERS PAGE: Only New, Follow Up, Converted, Cancelled
const INSIDE_VALLEY_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  ...GLOBAL_TRANSITIONS,
  // Follow-up can only convert or cancel
  follow_up: ['converted', 'cancelled'],
  // P0 FIX: Converted is END for Orders page - Dispatch handles packing
  converted: ['cancelled'],  // Only cancel allowed from Orders page
  // === BELOW: Managed by Dispatch Center, NOT Orders page ===
  packed: [],        // Dispatch: Assign to Rider
  assigned: [],      // Rider Portal: Out for delivery
  out_for_delivery: [], // Rider Portal: Delivered/Rejected
  hold: ['cancelled'],  // Can only cancel from Orders
  rejected: [],      // Dispatch: Process return
  return_initiated: [], // Dispatch: Complete return
};

// Outside Valley specific transitions (3rd Party Couriers)
// ORDERS PAGE: Only New, Follow Up, Converted, Cancelled
const OUTSIDE_VALLEY_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  ...GLOBAL_TRANSITIONS,
  // Follow-up can only convert or cancel
  follow_up: ['converted', 'cancelled'],
  // P0 FIX: Converted is END for Orders page - Dispatch handles packing
  converted: ['cancelled'],  // Only cancel allowed from Orders page
  // === BELOW: Managed by Dispatch Center, NOT Orders page ===
  packed: [],               // Dispatch: Handover to courier
  handover_to_courier: [],  // Courier system updates
  in_transit: [],           // Courier system updates
  hold: ['cancelled'],      // Can only cancel from Orders
  return_initiated: [],     // Dispatch: Process RTO return
};

// POS (Store) specific transitions - Direct sales
const POS_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  intake: ['store_sale', 'cancelled'],
  store_sale: [], // Final state
};

// =============================================================================
// ROLE-BASED LOCKING RULES (The "Rider Lock")
// =============================================================================

/**
 * Status states that are "locked" to specific roles
 */
export const STATUS_LOCKS: Record<OrderStatus, {
  lockedTo: string;
  allowedRoles: UserRole[];
  lockMessage: string;
  requiresAssignedUser: boolean;
} | null> = {
  // Rider Lock: When order is with rider, only rider (or admin) can update
  'assigned': {
    lockedTo: 'rider',
    allowedRoles: ['rider', 'admin'],
    lockMessage: 'Order is assigned to rider. Only the assigned rider or admin can update.',
    requiresAssignedUser: true,
  },
  'out_for_delivery': {
    lockedTo: 'rider',
    allowedRoles: ['rider', 'admin'],
    lockMessage: 'Order is out for delivery. Only the assigned rider or admin can update.',
    requiresAssignedUser: true,
  },
  
  // Courier Lock
  'handover_to_courier': {
    lockedTo: 'courier_system',
    allowedRoles: ['admin', 'manager'],
    lockMessage: 'Order is with courier. Updates require admin/manager approval.',
    requiresAssignedUser: false,
  },
  'in_transit': {
    lockedTo: 'courier_system',
    allowedRoles: ['admin', 'manager'],
    lockMessage: 'Order is in transit with courier.',
    requiresAssignedUser: false,
  },
  
  // No locks for these statuses
  'intake': null,
  'follow_up': null,
  'converted': null,
  'hold': null,
  'packed': null,
  'store_sale': null,
  'delivered': null,
  'cancelled': null,
  'rejected': null,
  'return_initiated': null,
  'returned': null,
};

// =============================================================================
// DISPATCH REQUIREMENTS (Modal Triggers)
// =============================================================================

export type ModalType = 
  | 'SELECT_RIDER' 
  | 'SELECT_COURIER' 
  | 'SCHEDULE_FOLLOWUP' 
  | 'CANCEL_ORDER' 
  | 'REJECT_ORDER' 
  | 'INITIATE_RETURN'
  | null;

export interface DispatchRequirement {
  requiredFields: string[];
  optionalFields?: string[];
  fulfillmentTypes?: string[];
  errorMessage: string;
  modalType: ModalType;
}

export const DISPATCH_REQUIREMENTS: Partial<Record<OrderStatus, DispatchRequirement>> = {
  'assigned': {
    requiredFields: ['rider_id'],
    fulfillmentTypes: ['inside_valley'],
    errorMessage: 'Please select a rider to assign this order.',
    modalType: 'SELECT_RIDER',
  },
  'handover_to_courier': {
    requiredFields: ['courier_partner'],
    optionalFields: ['awb_number', 'tracking_url'],
    fulfillmentTypes: ['outside_valley'],
    errorMessage: 'Please select a courier partner.',
    modalType: 'SELECT_COURIER',
  },
  'follow_up': {
    requiredFields: ['followup_date', 'followup_reason'],
    errorMessage: 'Please set follow-up date and reason.',
    modalType: 'SCHEDULE_FOLLOWUP',
  },
  'cancelled': {
    requiredFields: ['cancellation_reason'],
    errorMessage: 'Please provide a cancellation reason.',
    modalType: 'CANCEL_ORDER',
  },
  'rejected': {
    requiredFields: ['rejection_reason'],
    errorMessage: 'Please provide a rejection reason.',
    modalType: 'REJECT_ORDER',
  },
  'return_initiated': {
    requiredFields: ['return_reason'],
    errorMessage: 'Please provide a return reason.',
    modalType: 'INITIATE_RETURN',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize fulfillment type to uppercase
 */
export function normalizeFulfillmentType(type: string | undefined): 'INSIDE_VALLEY' | 'OUTSIDE_VALLEY' | 'POS' {
  if (!type) return 'INSIDE_VALLEY';
  const upper = type.toUpperCase();
  if (upper === 'POS' || upper === 'STORE_POS' || upper === 'STORE') return 'POS';
  if (upper === 'OUTSIDE_VALLEY') return 'OUTSIDE_VALLEY';
  return 'INSIDE_VALLEY';
}

/**
 * P0 FIX: Context-aware labels for specific statuses
 * Some statuses need different labels based on fulfillment type
 */
const CONTEXT_LABELS: Record<string, Partial<Record<OrderStatus, string>>> = {
  OUTSIDE_VALLEY: {
    // "Handover to Logistics" is more descriptive than "With Courier" for operators
    handover_to_courier: 'Handover to Logistics 🚚',
  },
};

/**
 * P0 FIX: Check if a status should show a special icon
 */
export type StatusIcon = 'truck' | 'user' | 'calendar' | null;

export function getStatusIcon(status: string, fulfillmentType?: string): StatusIcon {
  const normalized = status.toLowerCase();
  const type = normalizeFulfillmentType(fulfillmentType);
  
  // Outside Valley: Handover to Courier shows truck icon
  if (type === 'OUTSIDE_VALLEY' && normalized === 'handover_to_courier') {
    return 'truck';
  }
  
  return null;
}

/**
 * Get allowed next statuses based on current status and fulfillment type
 * P0 FIX: Applies context-aware labels for better UX
 * P0 FIX: Strict workflow rules - converted can only go to cancelled
 */
export function getAllowedTransitions(
  currentStatus: string,
  fulfillmentType: string | undefined
): StatusOption[] {
  const normalizedStatus = currentStatus.toLowerCase() as OrderStatus;
  const normalizedType = normalizeFulfillmentType(fulfillmentType);
  
  let transitions: OrderStatus[] = [];
  
  switch (normalizedType) {
    case 'INSIDE_VALLEY':
      transitions = INSIDE_VALLEY_TRANSITIONS[normalizedStatus] || [];
      break;
    case 'OUTSIDE_VALLEY':
      transitions = OUTSIDE_VALLEY_TRANSITIONS[normalizedStatus] || [];
      break;
    case 'POS':
      transitions = POS_TRANSITIONS[normalizedStatus] || [];
      break;
    default:
      transitions = INSIDE_VALLEY_TRANSITIONS[normalizedStatus] || [];
  }
  
  // P0 FIX: Filter out the current status (should never transition to itself)
  const filteredTransitions = transitions.filter(status => status !== normalizedStatus);
  
  // P0 FIX: Apply context-aware labels
  const contextLabels = CONTEXT_LABELS[normalizedType] || {};
  
  return filteredTransitions.map(status => {
    const option = STATUS_MAP[status];
    if (!option) return null;
    
    // Apply context-aware label if available
    const contextLabel = contextLabels[status];
    if (contextLabel) {
      return {
        ...option,
        label: contextLabel,
      };
    }
    
    return option;
  }).filter(Boolean) as StatusOption[];
}

// =============================================================================
// P0 FIX: UI-ONLY DISPLAY STATUSES (Not in database, just for badge display)
// =============================================================================
// These statuses are computed on frontend based on exchange/refund logic
// They are not stored in database and cannot be used for transitions
//
// LOGIC:
// 1. full_refund = All items returned + No new items → "Store Refund"
// 2. partial_refund = Some items returned + No new items → "Partially Refunded"
// 3. full_exchange = All items returned + New items added → "Exchange"
// 4. partial_exchange = Some items returned + New items added → "Partially Exchanged"
const UI_DISPLAY_STATUSES: Record<string, StatusOption> = {
  // For CHILD orders (exchange/refund transactions)
  store_exchange: {
    value: 'store_sale' as OrderStatus,
    label: 'Exchange',
    color: 'bg-violet-500',
    bgColor: 'bg-violet-100',
    textColor: 'text-violet-700',
    type: 'neutral',
  },
  store_refund: {
    value: 'store_sale' as OrderStatus,
    label: 'Store Refund',
    color: 'bg-rose-500',
    bgColor: 'bg-rose-100',
    textColor: 'text-rose-700',
    type: 'negative',
  },
  
  // For PARENT orders (based on exchange_status from backend)
  full_refund: {
    value: 'store_sale' as OrderStatus,
    label: 'Store Refund',
    color: 'bg-rose-500',
    bgColor: 'bg-rose-100',
    textColor: 'text-rose-700',
    type: 'negative',
  },
  partial_refund: {
    value: 'store_sale' as OrderStatus,
    label: 'Partially Refunded',
    color: 'bg-orange-500',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    type: 'warning',
  },
  full_exchange: {
    value: 'store_sale' as OrderStatus,
    label: 'Exchange',
    color: 'bg-violet-500',
    bgColor: 'bg-violet-100',
    textColor: 'text-violet-700',
    type: 'neutral',
  },
  partial_exchange: {
    value: 'store_sale' as OrderStatus,
    label: 'Partially Exchanged',
    color: 'bg-amber-500',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    type: 'warning',
  },
  
  // Legacy aliases
  partially_exchanged: {
    value: 'store_sale' as OrderStatus,
    label: 'Partially Exchanged',
    color: 'bg-amber-500',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
    type: 'warning',
  },
  store_return: {
    value: 'store_sale' as OrderStatus,
    label: 'Store Return',
    color: 'bg-rose-500',
    bgColor: 'bg-rose-100',
    textColor: 'text-rose-700',
    type: 'negative',
  },
};

/**
 * Get status option by value
 * P0 FIX: Check both database statuses and UI-only display statuses
 */
export function getStatusOption(status: string): StatusOption | undefined {
  const normalized = status.toLowerCase();
  
  // First check UI display statuses (for exchange/refund badges)
  if (UI_DISPLAY_STATUSES[normalized]) {
    return UI_DISPLAY_STATUSES[normalized];
  }
  
  // Then check database statuses
  return STATUS_MAP[normalized as OrderStatus];
}

/**
 * Check if a transition is valid
 */
export function isValidTransition(
  currentStatus: string,
  newStatus: string,
  fulfillmentType: string | undefined
): boolean {
  const allowed = getAllowedTransitions(currentStatus, fulfillmentType);
  return allowed.some(opt => opt.value === newStatus.toLowerCase());
}

/**
 * Check if a status is locked for a user
 */
export function checkStatusLock(
  currentStatus: string,
  userRole: UserRole,
  assignedRiderId?: string | null,
  currentUserId?: string | null
): { isLocked: boolean; lockMessage: string | null } {
  const normalized = currentStatus.toLowerCase() as OrderStatus;
  const lock = STATUS_LOCKS[normalized];
  
  if (!lock) {
    return { isLocked: false, lockMessage: null };
  }
  
  // Admin can bypass all locks
  if (userRole === 'admin') {
    return { isLocked: false, lockMessage: null };
  }
  
  // Check if user's role is allowed
  if (!lock.allowedRoles.includes(userRole)) {
    return { isLocked: true, lockMessage: lock.lockMessage };
  }
  
  // For rider lock, check if user is the assigned rider
  if (lock.requiresAssignedUser && userRole === 'rider') {
    if (assignedRiderId && currentUserId && assignedRiderId !== currentUserId) {
      return { 
        isLocked: true, 
        lockMessage: 'This order is assigned to a different rider.' 
      };
    }
  }
  
  return { isLocked: false, lockMessage: null };
}

/**
 * Get dispatch requirement for a status
 */
export function getDispatchRequirement(status: string): DispatchRequirement | null {
  const normalized = status.toLowerCase() as OrderStatus;
  return DISPATCH_REQUIREMENTS[normalized] || null;
}

/**
 * Check if a status requires a modal before transition
 */
export function requiresModal(status: string): ModalType {
  const req = getDispatchRequirement(status);
  return req?.modalType || null;
}
