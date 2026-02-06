/**
 * Orders Page - Shared Types & Constants
 * 
 * Centralized type definitions for the refactored orders components.
 * All extracted components import from this file to ensure type consistency.
 * 
 * @refactor Phase 1 - Component Extraction
 */

import { Package, Phone, Clock, CheckCircle, XCircle, RotateCcw, RefreshCw, Truck, Box, UserPlus, Send, Store, type LucideIcon } from 'lucide-react';

// =============================================================================
// LOCATION & FILTER TYPES
// =============================================================================

export type LocationType = 'all' | 'INSIDE_VALLEY' | 'OUTSIDE_VALLEY' | 'POS';
export type StatusFilter = 'all' | 'leads' | 'fulfillment' | 'logistics' | 'completed' | 'cancelled';

// =============================================================================
// ORDER INTERFACE (Unified - Extends base Order type)
// =============================================================================

export interface OrderItem {
  id: string;
  product_name: string;
  variant_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sku?: string;
  variant?: {
    sku?: string;
    color?: string;
    size?: string;
    product?: {
      image_url?: string;
    };
  };
}

export interface Order {
  id: string;
  readable_id?: string;
  order_number: string;
  customer_id?: string;
  customer?: { name: string; phone: string; email?: string };
  customer_name?: string;
  customer_phone?: string;
  status: string;
  location?: LocationType;
  fulfillment_type?: string;
  total_amount: number;
  subtotal?: number;
  discount?: number;
  shipping_cost?: number;
  shipping_name?: string;
  shipping_phone?: string;
  shipping_address?: string;
  shipping_city?: string;
  delivery_metadata?: Record<string, unknown>;
  payment_method?: string;
  payment_status?: string;
  paid_amount?: number;
  due_amount?: number;
  cod_amount?: number;
  items?: OrderItem[];
  item_count?: number | { count: number };
  remarks?: string;
  zone_code?: string | null;
  destination_branch?: string | null;
  created_at: string;
  dispatched_at?: string;
  delivered_at?: string;
  rider_id?: string;
  rider_name?: string;
  rider_phone?: string;
  rider_code?: string;
  alt_phone?: string;
  assigned_rider?: { id?: string; name: string; phone: string; code?: string };
  vendor_name?: string;
  is_logistics_synced?: boolean;
  external_order_id?: string;
  courier_partner?: string;
  logistics_provider?: string;
  logistics_synced_at?: string;
  delivery_type?: 'D2D' | 'D2B' | null;
  staff_remarks?: string;
  // Exchange/refund fields
  exchange_status?: string;
  parent_order_id?: string;
  is_exchange_child?: boolean;
  is_refund_only?: boolean;
  has_new_items?: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const LOCATION_TABS: { id: LocationType; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'All Orders', icon: Package },
  { id: 'INSIDE_VALLEY', label: 'Inside Valley', icon: Truck },
  { id: 'OUTSIDE_VALLEY', label: 'Outside Valley', icon: Package },
  { id: 'POS', label: 'Store POS', icon: Store },
];

export const STATUS_FILTERS: { 
  key: StatusFilter; 
  label: string; 
  shortLabel: string; 
  statuses: string[]; 
  color: string 
}[] = [
  { key: 'all', label: 'All Orders', shortLabel: 'All', statuses: [], color: 'bg-orange-500' },
  { key: 'leads', label: 'New', shortLabel: 'New', statuses: ['new', 'follow_up', 'intake'], color: 'bg-blue-500' },
  { key: 'fulfillment', label: 'Processing', shortLabel: 'Processing', statuses: ['converted', 'packed'], color: 'bg-orange-500' },
  { key: 'logistics', label: 'In Transit', shortLabel: 'Transit', statuses: ['assigned', 'out_for_delivery', 'rescheduled', 'in_transit', 'handover_to_courier'], color: 'bg-purple-500' },
  { key: 'completed', label: 'Completed', shortLabel: 'Done', statuses: ['delivered', 'returned', 'rejected', 'refunded', 'exchange', 'store_sale'], color: 'bg-emerald-500' },
  { key: 'cancelled', label: 'Cancelled', shortLabel: 'Cancelled', statuses: ['cancelled', 'trash'], color: 'bg-gray-500' },
];

export interface StatusConfigItem {
  label: string;
  color: string;
  bg: string;
  icon: LucideIcon;
}

export const STATUS_CONFIG: Record<string, StatusConfigItem> = {
  intake: { label: 'New', color: 'text-blue-700', bg: 'bg-blue-100', icon: Package },
  follow_up: { label: 'Follow Up', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: Clock },
  converted: { label: 'Converted', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  hold: { label: 'On Hold', color: 'text-gray-700', bg: 'bg-gray-100', icon: Clock },
  on_hold: { label: 'On Hold', color: 'text-gray-700', bg: 'bg-gray-100', icon: Clock },
  packed: { label: 'Packed', color: 'text-indigo-700', bg: 'bg-indigo-100', icon: Box },
  assigned: { label: 'Assigned', color: 'text-purple-700', bg: 'bg-purple-100', icon: UserPlus },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-amber-700', bg: 'bg-amber-100', icon: Truck },
  handover_to_courier: { label: 'With Courier', color: 'text-violet-700', bg: 'bg-violet-100', icon: Send },
  in_transit: { label: 'In Transit', color: 'text-cyan-700', bg: 'bg-cyan-100', icon: Truck },
  delivered: { label: 'Delivered', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  store_sale: { label: 'Store Sale', color: 'text-teal-700', bg: 'bg-teal-100', icon: Store },
  cancelled: { label: 'Cancelled', color: 'text-gray-700', bg: 'bg-gray-100', icon: XCircle },
  rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-100', icon: XCircle },
  returned: { label: 'Returned', color: 'text-orange-700', bg: 'bg-orange-100', icon: RotateCcw },
  return_initiated: { label: 'Return Initiated', color: 'text-pink-700', bg: 'bg-pink-100', icon: RotateCcw },
  store_exchange: { label: 'Exchange', color: 'text-violet-700', bg: 'bg-violet-100', icon: RefreshCw },
  store_refund: { label: 'Store Refund', color: 'text-rose-700', bg: 'bg-rose-100', icon: RotateCcw },
  partially_exchanged: { label: 'Partially Exchanged', color: 'text-amber-700', bg: 'bg-amber-100', icon: RefreshCw },
  store_return: { label: 'Store Return', color: 'text-rose-700', bg: 'bg-rose-100', icon: RotateCcw },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

export const getItemCount = (itemCount: number | { count: number } | undefined): number => {
  if (typeof itemCount === 'number') return itemCount;
  if (itemCount && typeof itemCount === 'object' && 'count' in itemCount) {
    return itemCount.count ?? 0;
  }
  return 0;
};

/**
 * Get effective status for display (handles exchange/refund logic)
 */
export const getEffectiveStatus = (order: Order): string => {
  let effectiveStatus = order.status?.toLowerCase() || 'intake';
  
  // PRIORITY 1: Use backend's calculated exchange_status for parent orders
  if (order.exchange_status && order.fulfillment_type === 'store') {
    effectiveStatus = order.exchange_status;
  }
  // PRIORITY 2: Child order (exchange/refund)
  else if (order.is_exchange_child || order.parent_order_id) {
    if (order.fulfillment_type === 'store') {
      if (order.is_refund_only || ((order.total_amount || 0) < 0 && !order.has_new_items)) {
        effectiveStatus = 'store_refund';
      } else {
        effectiveStatus = 'store_exchange';
      }
    }
  }
  // PRIORITY 3: Normal Store POS order
  else if (order.fulfillment_type === 'store' && order.status?.toLowerCase() === 'delivered') {
    effectiveStatus = 'store_sale';
  }
  
  return effectiveStatus;
};
