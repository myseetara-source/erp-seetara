/**
 * Order Status Groups (Engines)
 * 
 * Consolidated tabs for improved workflow management
 * Each tab groups related statuses for specific operational views
 * 
 * @author Senior Frontend Architect
 * @priority P1 - Tab Refactoring
 */

export interface OrderTab {
  id: string;
  label: string;
  shortLabel: string;
  statuses: string[];
  color: 'blue' | 'orange' | 'purple' | 'green' | 'red' | 'gray' | 'amber';
  icon: string;
  description: string;
}

/**
 * Main Order Tabs Configuration
 * 
 * Flow: Leads → Fulfillment → Logistics → Completed → Cancelled
 */
export const ORDER_TABS: OrderTab[] = [
  {
    id: 'leads',
    label: 'New',
    shortLabel: 'New',
    statuses: ['new', 'follow_up'],
    color: 'blue',
    icon: 'phone',
    description: 'New and follow-up orders',
  },
  {
    id: 'fulfillment',
    label: 'Processing',
    shortLabel: 'Processing',
    statuses: ['converted', 'packed'],
    color: 'orange',
    icon: 'package',
    description: 'Orders being prepared for dispatch',
  },
  {
    id: 'logistics',
    label: 'In Transit',
    shortLabel: 'Transit',
    statuses: ['assigned', 'out_for_delivery', 'rescheduled', 'in_transit', 'handover_to_courier'],
    color: 'purple',
    icon: 'truck',
    description: 'Orders on the way to customers',
  },
  {
    id: 'completed',
    label: 'Completed',
    shortLabel: 'Done',
    statuses: ['delivered', 'returned', 'rejected', 'refunded', 'exchange'],
    color: 'green',
    icon: 'check-circle',
    description: 'Delivered, returned, or settled orders',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    statuses: ['cancelled', 'trash'],
    color: 'gray',
    icon: 'x-circle',
    description: 'Cancelled or discarded orders',
  },
];

/**
 * Color mappings for tab styling
 */
export const TAB_COLORS = {
  blue: {
    bg: 'bg-blue-500',
    bgLight: 'bg-blue-50',
    bgHover: 'hover:bg-blue-100',
    text: 'text-blue-700',
    textLight: 'text-blue-600',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    activeBadge: 'bg-blue-600 text-white',
  },
  orange: {
    bg: 'bg-orange-500',
    bgLight: 'bg-orange-50',
    bgHover: 'hover:bg-orange-100',
    text: 'text-orange-700',
    textLight: 'text-orange-600',
    border: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-700',
    activeBadge: 'bg-orange-600 text-white',
  },
  purple: {
    bg: 'bg-purple-500',
    bgLight: 'bg-purple-50',
    bgHover: 'hover:bg-purple-100',
    text: 'text-purple-700',
    textLight: 'text-purple-600',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
    activeBadge: 'bg-purple-600 text-white',
  },
  green: {
    bg: 'bg-emerald-500',
    bgLight: 'bg-emerald-50',
    bgHover: 'hover:bg-emerald-100',
    text: 'text-emerald-700',
    textLight: 'text-emerald-600',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    activeBadge: 'bg-emerald-600 text-white',
  },
  red: {
    bg: 'bg-red-500',
    bgLight: 'bg-red-50',
    bgHover: 'hover:bg-red-100',
    text: 'text-red-700',
    textLight: 'text-red-600',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    activeBadge: 'bg-red-600 text-white',
  },
  amber: {
    bg: 'bg-amber-500',
    bgLight: 'bg-amber-50',
    bgHover: 'hover:bg-amber-100',
    text: 'text-amber-700',
    textLight: 'text-amber-600',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    activeBadge: 'bg-amber-600 text-white',
  },
  gray: {
    bg: 'bg-gray-500',
    bgLight: 'bg-gray-50',
    bgHover: 'hover:bg-gray-100',
    text: 'text-gray-700',
    textLight: 'text-gray-600',
    border: 'border-gray-200',
    badge: 'bg-gray-100 text-gray-700',
    activeBadge: 'bg-gray-600 text-white',
  },
};

/**
 * Get tab by ID
 */
export function getTabById(tabId: string): OrderTab | undefined {
  return ORDER_TABS.find(tab => tab.id === tabId);
}

/**
 * Get tab by status (finds which tab contains a given status)
 */
export function getTabByStatus(status: string): OrderTab | undefined {
  return ORDER_TABS.find(tab => tab.statuses.includes(status));
}

/**
 * Get all unique statuses across all tabs
 */
export function getAllStatuses(): string[] {
  return ORDER_TABS.flatMap(tab => tab.statuses);
}

/**
 * Format statuses for API query
 * Returns comma-separated string for backend filtering
 */
export function formatStatusesForApi(statuses: string[]): string {
  return statuses.join(',');
}

/**
 * Default tab ID
 */
export const DEFAULT_TAB_ID = 'leads';

/**
 * Status to human-readable label mapping
 */
export const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  follow_up: 'Follow Up',
  followup: 'Follow Up',  // alias for compatibility
  converted: 'Converted',
  packed: 'Packed',
  assigned: 'Assigned',
  out_for_delivery: 'Out for Delivery',
  rescheduled: 'Next Attempt',
  in_transit: 'In Transit',
  handover_to_courier: 'With Courier',
  delivered: 'Delivered',
  returned: 'Returned',
  rejected: 'Rejected',
  refunded: 'Refunded',
  exchange: 'Exchange',
  cancelled: 'Cancelled',
  trash: 'Trash',
};
