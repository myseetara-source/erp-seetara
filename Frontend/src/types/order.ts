/**
 * Order Types and State Machine Configuration
 * 
 * Frontend implementation of the order state machine
 * Must stay in sync with backend: services/orderStateMachine.js
 */

// =============================================================================
// ENUMS
// =============================================================================

export type FulfillmentType = 'inside_valley' | 'outside_valley' | 'store';

export type OrderStatus = 
  | 'intake'
  | 'follow_up'
  | 'converted'
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

export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded' | 'cod';

export type DeliveryStatus = 'assigned' | 'picked' | 'in_transit' | 'delivered' | 'failed' | 'returned';

// =============================================================================
// STATUS CATEGORIES (For Kanban/Funnel Views)
// =============================================================================

export const STATUS_CATEGORIES = {
  INTAKE: ['intake', 'follow_up'] as OrderStatus[],
  PROCESSING: ['converted', 'packed'] as OrderStatus[],
  DISPATCH: ['assigned', 'out_for_delivery', 'handover_to_courier', 'in_transit', 'store_sale'] as OrderStatus[],
  COMPLETED: ['delivered'] as OrderStatus[],
  CANCELLED: ['cancelled', 'rejected'] as OrderStatus[],
  RETURNS: ['return_initiated', 'returned'] as OrderStatus[],
};

export type StatusCategory = keyof typeof STATUS_CATEGORIES;

// =============================================================================
// STATUS DISPLAY CONFIG
// =============================================================================

export interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  icon: string;
  description: string;
}

export const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  intake: {
    label: 'Intake',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    icon: 'Inbox',
    description: 'New order received',
  },
  follow_up: {
    label: 'Follow Up',
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    icon: 'Phone',
    description: 'Needs customer follow-up',
  },
  converted: {
    label: 'Converted',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: 'CheckCircle',
    description: 'Customer confirmed',
  },
  packed: {
    label: 'Packed',
    color: 'indigo',
    bgColor: 'bg-indigo-100',
    textColor: 'text-indigo-700',
    icon: 'Package',
    description: 'Ready for dispatch',
  },
  assigned: {
    label: 'Assigned',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    icon: 'User',
    description: 'Assigned to rider',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    icon: 'Truck',
    description: 'Rider is delivering',
  },
  handover_to_courier: {
    label: 'Handover to Courier',
    color: 'purple',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    icon: 'ExternalLink',
    description: 'Given to logistics partner',
  },
  in_transit: {
    label: 'In Transit',
    color: 'cyan',
    bgColor: 'bg-cyan-100',
    textColor: 'text-cyan-700',
    icon: 'Navigation',
    description: 'On the way',
  },
  store_sale: {
    label: 'Store Sale',
    color: 'teal',
    bgColor: 'bg-teal-100',
    textColor: 'text-teal-700',
    icon: 'Store',
    description: 'Walk-in sale',
  },
  delivered: {
    label: 'Delivered',
    color: 'emerald',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    icon: 'Check',
    description: 'Successfully delivered',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: 'XCircle',
    description: 'Order cancelled',
  },
  rejected: {
    label: 'Rejected',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: 'X',
    description: 'Order rejected',
  },
  return_initiated: {
    label: 'Return Initiated',
    color: 'pink',
    bgColor: 'bg-pink-100',
    textColor: 'text-pink-700',
    icon: 'RotateCcw',
    description: 'Return in progress',
  },
  returned: {
    label: 'Returned',
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    icon: 'Undo',
    description: 'Product returned',
  },
};

// =============================================================================
// STATE MACHINE - ALLOWED TRANSITIONS
// =============================================================================

const INSIDE_VALLEY_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  intake: ['follow_up', 'converted', 'cancelled', 'rejected'],
  follow_up: ['follow_up', 'converted', 'cancelled', 'rejected'],
  converted: ['packed', 'cancelled'],
  packed: ['assigned', 'cancelled'],
  assigned: ['out_for_delivery', 'packed', 'cancelled'],
  out_for_delivery: ['delivered', 'return_initiated', 'assigned'],
  handover_to_courier: [],
  in_transit: [],
  store_sale: [],
  delivered: ['return_initiated'],
  return_initiated: ['returned'],
  returned: [],
  cancelled: [],
  rejected: [],
};

const OUTSIDE_VALLEY_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  intake: ['follow_up', 'converted', 'cancelled', 'rejected'],
  follow_up: ['follow_up', 'converted', 'cancelled', 'rejected'],
  converted: ['packed', 'cancelled'],
  packed: ['handover_to_courier', 'cancelled'],
  assigned: [],
  out_for_delivery: [],
  handover_to_courier: ['in_transit', 'delivered', 'return_initiated'],
  in_transit: ['delivered', 'return_initiated'],
  store_sale: [],
  delivered: ['return_initiated'],
  return_initiated: ['returned'],
  returned: [],
  cancelled: [],
  rejected: [],
};

const STORE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  intake: ['converted', 'store_sale', 'cancelled', 'rejected'],
  follow_up: [],
  converted: ['packed', 'store_sale', 'cancelled'],
  packed: ['store_sale', 'cancelled'],
  assigned: [],
  out_for_delivery: [],
  handover_to_courier: [],
  in_transit: [],
  store_sale: ['delivered'],
  delivered: ['return_initiated'],
  return_initiated: ['returned'],
  returned: [],
  cancelled: [],
  rejected: [],
};

/**
 * Get allowed next statuses for an order
 */
export function getAllowedNextStatuses(
  currentStatus: OrderStatus,
  fulfillmentType: FulfillmentType
): OrderStatus[] {
  switch (fulfillmentType) {
    case 'inside_valley':
      return INSIDE_VALLEY_TRANSITIONS[currentStatus] || [];
    case 'outside_valley':
      return OUTSIDE_VALLEY_TRANSITIONS[currentStatus] || [];
    case 'store':
      return STORE_TRANSITIONS[currentStatus] || [];
    default:
      return [];
  }
}

/**
 * Check if a transition is valid
 */
export function isValidTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  fulfillmentType: FulfillmentType
): boolean {
  const allowed = getAllowedNextStatuses(currentStatus, fulfillmentType);
  return allowed.includes(newStatus);
}

// =============================================================================
// ACTION BUTTON CONFIG
// =============================================================================

export interface ActionButton {
  status: OrderStatus;
  label: string;
  icon: string;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'teal' | 'gray' | 'indigo' | 'cyan' | 'emerald' | 'pink';
  requiresModal?: boolean;
  modalType?: 'rider-select' | 'courier-handover' | 'followup' | 'cancel' | 'return';
  confirmMessage?: string;
}

const ACTION_BUTTON_CONFIG: Partial<Record<OrderStatus, Omit<ActionButton, 'status'>>> = {
  follow_up: {
    label: 'Schedule Follow-up',
    icon: 'Phone',
    color: 'orange',
    requiresModal: true,
    modalType: 'followup',
  },
  converted: {
    label: 'Mark Converted',
    icon: 'CheckCircle',
    color: 'green',
    confirmMessage: 'Mark this order as converted?',
  },
  packed: {
    label: 'Mark Packed',
    icon: 'Package',
    color: 'indigo',
    confirmMessage: 'Mark this order as packed?',
  },
  assigned: {
    label: 'Assign Rider',
    icon: 'User',
    color: 'blue',
    requiresModal: true,
    modalType: 'rider-select',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    icon: 'Truck',
    color: 'orange',
    confirmMessage: 'Mark as out for delivery?',
  },
  handover_to_courier: {
    label: 'Handover to Courier',
    icon: 'ExternalLink',
    color: 'purple',
    requiresModal: true,
    modalType: 'courier-handover',
  },
  in_transit: {
    label: 'Mark In Transit',
    icon: 'Navigation',
    color: 'cyan',
  },
  store_sale: {
    label: 'Complete Store Sale',
    icon: 'Store',
    color: 'teal',
    confirmMessage: 'Complete this store sale?',
  },
  delivered: {
    label: 'Mark Delivered',
    icon: 'Check',
    color: 'emerald',
    confirmMessage: 'Mark this order as delivered?',
  },
  cancelled: {
    label: 'Cancel Order',
    icon: 'XCircle',
    color: 'red',
    requiresModal: true,
    modalType: 'cancel',
  },
  rejected: {
    label: 'Reject Order',
    icon: 'X',
    color: 'red',
    requiresModal: true,
    modalType: 'cancel',
  },
  return_initiated: {
    label: 'Initiate Return',
    icon: 'RotateCcw',
    color: 'pink',
    requiresModal: true,
    modalType: 'return',
  },
  returned: {
    label: 'Mark Returned',
    icon: 'Undo',
    color: 'gray',
    confirmMessage: 'Mark this order as returned?',
  },
};

/**
 * Get action buttons for an order based on its current state
 */
export function getActionButtons(
  currentStatus: OrderStatus,
  fulfillmentType: FulfillmentType
): ActionButton[] {
  const allowedStatuses = getAllowedNextStatuses(currentStatus, fulfillmentType);
  const buttons: ActionButton[] = [];

  for (const status of allowedStatuses) {
    const config = ACTION_BUTTON_CONFIG[status];
    if (config) {
      buttons.push({
        status,
        ...config,
      });
    }
  }

  return buttons;
}

/**
 * Get primary action button (most likely next action)
 */
export function getPrimaryAction(
  currentStatus: OrderStatus,
  fulfillmentType: FulfillmentType
): ActionButton | null {
  const buttons = getActionButtons(currentStatus, fulfillmentType);
  
  // Primary actions by status (the most expected next action)
  const primaryActions: Partial<Record<OrderStatus, OrderStatus>> = {
    intake: 'converted',
    follow_up: 'converted',
    converted: 'packed',
    packed: fulfillmentType === 'inside_valley' ? 'assigned' : 
            fulfillmentType === 'outside_valley' ? 'handover_to_courier' : 
            'store_sale',
    assigned: 'out_for_delivery',
    out_for_delivery: 'delivered',
    handover_to_courier: 'in_transit',
    in_transit: 'delivered',
    store_sale: 'delivered',
  };

  const primaryStatus = primaryActions[currentStatus];
  if (primaryStatus) {
    return buttons.find(b => b.status === primaryStatus) || null;
  }

  return buttons[0] || null;
}

// =============================================================================
// ORDER INTERFACES
// =============================================================================

export interface OrderCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

export interface OrderItem {
  id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product?: {
    name: string;
    sku: string;
    image_url?: string;
  };
  variant?: {
    sku: string;
    attributes: Record<string, string>;
  };
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  source: 'website' | 'manual' | 'store' | 'api';
  
  // Customer
  customer_id: string;
  customer?: OrderCustomer;
  
  // Shipping
  shipping_address: string;
  shipping_city: string;
  shipping_district?: string;
  shipping_phone?: string;
  
  // Financial
  subtotal: number;
  discount_amount: number;
  delivery_charge: number;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method?: string;
  
  // Tracking
  assigned_rider_id?: string;
  assigned_at?: string;
  dispatched_at?: string;
  delivered_at?: string;
  courier_partner?: string;
  courier_tracking_id?: string;
  courier_manifest_id?: string;
  
  // Follow-up
  followup_date?: string;
  followup_reason?: string;
  followup_count?: number;
  
  // Cancellation/Rejection
  cancellation_reason?: string;
  cancelled_at?: string;
  rejection_reason?: string;
  
  // Return
  return_reason?: string;
  return_initiated_at?: string;
  returned_at?: string;
  
  // Items
  items?: OrderItem[];
  
  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

// =============================================================================
// RIDER INTERFACES
// =============================================================================

export interface Rider {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  vehicle_type?: string;
  vehicle_number?: string;
  is_available: boolean;
  current_zone?: string;
  max_daily_orders: number;
  current_order_count: number;
  capacityRemaining: number;
  total_deliveries: number;
  successful_deliveries: number;
  successRate: string;
  average_rating: number;
}

export interface DeliveryAssignment {
  id: string;
  order_id: string;
  rider_id: string;
  status: DeliveryStatus;
  attempt_number: number;
  assigned_at: string;
  picked_at?: string;
  delivered_at?: string;
  failed_at?: string;
  notes?: string;
  failure_reason?: string;
  proof_image_url?: string;
  order?: Order;
}

// =============================================================================
// MANIFEST INTERFACES
// =============================================================================

export interface CourierManifest {
  id: string;
  manifest_number: string;
  courier_partner: string;
  order_ids: string[];
  order_count: number;
  tracking_codes?: string[];
  status: 'draft' | 'dispatched' | 'in_transit' | 'delivered' | 'partial';
  total_cod_amount: number;
  courier_charge?: number;
  created_at: string;
  dispatched_at?: string;
  pickup_expected_at?: string;
  created_by?: string;
  dispatched_by?: string;
  orders?: Order[];
}

export interface CourierPartner {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get status category for funnel view
 */
export function getStatusCategory(status: OrderStatus): StatusCategory {
  for (const [category, statuses] of Object.entries(STATUS_CATEGORIES)) {
    if ((statuses as OrderStatus[]).includes(status)) {
      return category as StatusCategory;
    }
  }
  return 'INTAKE';
}

/**
 * Check if order is in terminal state
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return ['cancelled', 'rejected', 'returned'].includes(status);
}

/**
 * Check if order requires action
 */
export function requiresAction(status: OrderStatus): boolean {
  return !['delivered', 'cancelled', 'rejected', 'returned'].includes(status);
}

/**
 * Get estimated days based on fulfillment type
 */
export function getEstimatedDeliveryDays(fulfillmentType: FulfillmentType): string {
  switch (fulfillmentType) {
    case 'inside_valley':
      return 'Same day - 1 day';
    case 'outside_valley':
      return '3-7 days';
    case 'store':
      return 'Immediate';
    default:
      return 'Unknown';
  }
}
