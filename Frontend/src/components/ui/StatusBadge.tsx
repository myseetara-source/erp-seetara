/**
 * StatusBadge Component
 * Displays order status with appropriate color coding
 * Visual representation only - no business logic
 * 
 * P0 FIX: Added fulfillmentType support to show "Store Sale" badge
 * P0 FIX: Added partial exchange/refund badge logic for exchanges
 */

'use client';

import { type OrderStatus } from '@/lib/api/orders';

interface StatusBadgeProps {
  status: OrderStatus;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  /** P0 FIX: For Store POS orders, show "Store Sale" instead of "Delivered" */
  fulfillmentType?: 'inside_valley' | 'outside_valley' | 'store' | string;
  /** For Exchange orders: detect Partial Exchange vs Refund Only */
  parentOrderId?: string | null;
  /** Total amount - negative for refunds */
  totalAmount?: number;
  /** Number of items in order */
  itemCount?: number;
  /** Delivery metadata - contains exchange_note for exchanges */
  deliveryMetadata?: { exchange_note?: string } | null;
}

// Status configuration - colors and labels
const STATUS_CONFIG: Record<string, { 
  label: string; 
  bgColor: string; 
  textColor: string;
  dotColor: string;
}> = {
  intake: {
    label: 'New',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    dotColor: 'bg-blue-500',
  },
  converted: {
    label: 'Converted',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    dotColor: 'bg-green-500',
  },
  followup: {
    label: 'Follow Up',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    dotColor: 'bg-yellow-500',
  },
  hold: {
    label: 'Hold',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    dotColor: 'bg-gray-500',
  },
  packed: {
    label: 'Packed',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    dotColor: 'bg-indigo-500',
  },
  shipped: {
    label: 'Shipped',
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-700',
    dotColor: 'bg-cyan-500',
  },
  delivered: {
    label: 'Delivered',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    dotColor: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    dotColor: 'bg-red-500',
  },
  refund: {
    label: 'Refund',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    dotColor: 'bg-orange-500',
  },
  return: {
    label: 'Return',
    bgColor: 'bg-pink-50',
    textColor: 'text-pink-700',
    dotColor: 'bg-pink-500',
  },
  // =========================================================================
  // Dispatch/Delivery Statuses
  // =========================================================================
  assigned: {
    label: 'Assigned',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    dotColor: 'bg-purple-500',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    bgColor: 'bg-sky-50',
    textColor: 'text-sky-700',
    dotColor: 'bg-sky-500',
  },
  rescheduled: {
    label: 'Next Attempt',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    dotColor: 'bg-amber-500',
  },
  rejected: {
    label: 'Rejected',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    dotColor: 'bg-red-500',
  },
  returned: {
    label: 'Returned',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    dotColor: 'bg-purple-500',
  },
  in_transit: {
    label: 'In Transit',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    dotColor: 'bg-blue-500',
  },
  handover_to_courier: {
    label: 'With Courier',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    dotColor: 'bg-indigo-500',
  },
  // =========================================================================
  // P0 FIX: Store Sale badge - distinct from standard Delivered
  // =========================================================================
  store_sale: {
    label: 'Store Sale',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    dotColor: 'bg-blue-600',
  },
  // =========================================================================
  // P0 FIX: Exchange/Refund badges for reconciliation orders
  // =========================================================================
  partial_exchange: {
    label: 'Partial Exchange',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    dotColor: 'bg-amber-500',
  },
  refund_only: {
    label: 'Refund Only',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700',
    dotColor: 'bg-rose-500',
  },
  exchange: {
    label: 'Exchange',
    bgColor: 'bg-violet-50',
    textColor: 'text-violet-700',
    dotColor: 'bg-violet-500',
  },
  addon: {
    label: 'Add-on',
    bgColor: 'bg-teal-50',
    textColor: 'text-teal-700',
    dotColor: 'bg-teal-500',
  },
};

// Size classes
const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

export default function StatusBadge({ 
  status, 
  size = 'md',
  showDot = true,
  fulfillmentType,
  parentOrderId,
  totalAmount,
  itemCount,
  deliveryMetadata,
}: StatusBadgeProps) {
  // =========================================================================
  // P0 FIX: Determine effective status based on order type
  // Priority: Exchange/Refund > Store Sale > Normal Status
  // =========================================================================
  
  let effectiveStatus: string = status;
  
  // Check if this is an exchange/refund order (has parent_order_id or exchange_note)
  const isExchangeOrder = parentOrderId || deliveryMetadata?.exchange_note;
  
  if (isExchangeOrder) {
    // Determine the type of exchange based on items and amount
    const hasPositiveItems = (itemCount || 0) > 0;
    const isNegativeAmount = (totalAmount || 0) < 0;
    
    if (isNegativeAmount && !hasPositiveItems) {
      // Only returns, no new items = Refund Only
      effectiveStatus = 'refund_only';
    } else if (isNegativeAmount && hasPositiveItems) {
      // Returns AND new items but still negative = Partial Exchange
      effectiveStatus = 'partial_exchange';
    } else if (hasPositiveItems && !isNegativeAmount) {
      // New items, positive amount = Add-on or Exchange
      effectiveStatus = parentOrderId ? 'exchange' : 'addon';
    } else {
      // Default exchange badge
      effectiveStatus = 'exchange';
    }
  } else if (fulfillmentType === 'store' && status === 'delivered') {
    // P0 FIX: Show "Store Sale" for POS orders instead of "Delivered"
    effectiveStatus = 'store_sale';
  }
  
  const config = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.intake;
  
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full
        ${config.bgColor} ${config.textColor} ${SIZE_CLASSES[size]}
      `}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      )}
      {config.label}
    </span>
  );
}

// Export for use in other components
export { STATUS_CONFIG };
