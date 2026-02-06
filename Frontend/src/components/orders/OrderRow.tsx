/**
 * OrderRow Component - Memoized Table Row
 * 
 * PERFORMANCE OPTIMIZED (P0):
 * - Uses React.memo to prevent unnecessary re-renders
 * - Only re-renders when order data actually changes
 * - Callbacks are stable (passed from parent with useCallback)
 * - Includes checkbox for bulk selection
 * 
 * @author Performance Engineering Team
 * @priority P0 - Critical for 10,000+ orders
 */

'use client';

import React, { memo, useCallback } from 'react';
import {
  Phone,
  Eye,
  UserCheck,
  Send,
  Truck as TruckIcon,
} from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { OrderListItem, OrderStatus } from '@/types';
import { RemarksCell } from './RemarksCell';
import { FulfillmentTypeBadge } from './FulfillmentTypeBadge';
import { ItemCountHover, QuantityHover } from './OrderItemsHover';
import { LogisticsPopover } from './LogisticsPopover';

// =============================================================================
// TYPES
// =============================================================================

interface OrderRowProps {
  order: OrderListItem;
  index: number;
  isStorePOS: boolean;
  /** Whether this row is selected (for bulk actions) */
  isSelected?: boolean;
  /** Toggle selection callback */
  onToggleSelect?: (orderId: string) => void;
  /** Whether to show selection checkbox */
  showCheckbox?: boolean;
  onSelectOrder?: (order: OrderListItem) => void;
  onAssignRider?: (order: OrderListItem) => void;
  onHandoverCourier?: (order: OrderListItem) => void;
  onUpdateRemarks: (orderId: string, remarks: string | null) => void;
}

// =============================================================================
// STATUS BADGE CONFIGURATION
// =============================================================================

const STATUS_CONFIG: Record<OrderStatus | string, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
}> = {
  intake: {
    label: 'New',
    variant: 'secondary',
    className: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  },
  converted: {
    label: 'Converted',
    variant: 'secondary',
    className: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  },
  followup: {
    label: 'Follow Up',
    variant: 'secondary',
    className: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100',
  },
  hold: {
    label: 'Hold',
    variant: 'secondary',
    className: 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200',
  },
  packed: {
    label: 'Packed',
    variant: 'secondary',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    variant: 'secondary',
    className: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  },
  handover_to_courier: {
    label: 'Handover',
    variant: 'secondary',
    className: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
  },
  in_transit: {
    label: 'In Transit',
    variant: 'secondary',
    className: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
  },
  shipped: {
    label: 'Shipped',
    variant: 'secondary',
    className: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
  },
  store_sale: {
    label: 'Store Sale',
    variant: 'secondary',
    className: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
  },
  delivered: {
    label: 'Delivered',
    variant: 'secondary',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  },
  cancelled: {
    label: 'Cancelled',
    variant: 'destructive',
    className: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  },
  refund: {
    label: 'Refund',
    variant: 'secondary',
    className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  },
  return: {
    label: 'Return',
    variant: 'secondary',
    className: 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100',
  },
  store_exchange: {
    label: 'Exchange',
    variant: 'secondary',
    className: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
  },
  store_refund: {
    label: 'Store Refund',
    variant: 'secondary',
    className: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
  },
  partially_exchanged: {
    label: 'Partially Exchanged',
    variant: 'secondary',
    className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  },
  store_return: {
    label: 'Store Return',
    variant: 'secondary',
    className: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
  },
};

// =============================================================================
// UTILITY FUNCTIONS (Memoized outside component)
// =============================================================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
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

const getItemCount = (itemCount: number | { count: number } | undefined): number => {
  if (typeof itemCount === 'number') return itemCount;
  if (itemCount && typeof itemCount === 'object' && 'count' in itemCount) {
    return itemCount.count ?? 0;
  }
  return 0;
};

/**
 * Compute effective status for display
 * Handles Store POS exchange/refund status logic
 */
const computeEffectiveStatus = (order: OrderListItem): string => {
  let effectiveStatus = order.status;
  
  // Cast to any to access extended fields from API
  const orderData = order as any;
  
  // CASE 1: Parent order that has exchange children
  if (orderData.has_exchange_children && order.fulfillment_type === 'store') {
    effectiveStatus = 'partially_exchanged';
  }
  // CASE 2: Child order (exchange/refund) - has parent_order_id
  else if (orderData.is_exchange_child || orderData.parent_order_id) {
    if (order.fulfillment_type === 'store') {
      if (orderData.is_refund_only || ((order.total_amount || 0) < 0 && !orderData.has_new_items)) {
        effectiveStatus = 'store_refund';
      } else {
        effectiveStatus = 'store_exchange';
      }
    }
  }
  // CASE 3: Normal Store POS order
  else if (order.fulfillment_type === 'store' && order.status === 'delivered') {
    effectiveStatus = 'store_sale';
  }
  
  return effectiveStatus;
};

// =============================================================================
// COMPONENT
// =============================================================================

function OrderRowComponent({
  order,
  index,
  isStorePOS,
  isSelected = false,
  onToggleSelect,
  showCheckbox = false,
  onSelectOrder,
  onAssignRider,
  onHandoverCourier,
  onUpdateRemarks,
}: OrderRowProps) {
  // Compute effective status (memoized via React.memo)
  const effectiveStatus = computeEffectiveStatus(order);
  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.intake;

  // Event handlers (using useCallback for stable references)
  // P0 FIX: Removed row click handler - split view only opens via eye button
  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleCheckboxChange = useCallback(() => {
    onToggleSelect?.(order.id);
  }, [onToggleSelect, order.id]);

  const handleAssignRider = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAssignRider?.(order);
  }, [onAssignRider, order]);

  const handleHandoverCourier = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onHandoverCourier?.(order);
  }, [onHandoverCourier, order]);

  const handleViewDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectOrder?.(order);
  }, [onSelectOrder, order]);

  const handleRemarksUpdate = useCallback((newRemarks: string | null) => {
    onUpdateRemarks(order.id, newRemarks);
  }, [onUpdateRemarks, order.id]);

  return (
    <TableRow
      className={cn(
        'group transition-colors hover:bg-gray-50/50',
        isSelected && 'bg-blue-50 hover:bg-blue-100'
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Checkbox for selection */}
      {showCheckbox && (
        <TableCell className="py-1.5 px-2 w-10" onClick={handleCheckboxClick}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
          />
        </TableCell>
      )}

      {/* Order ID - Compact with quantity hover */}
      <TableCell className="py-1.5 px-2">
        <span className="font-mono text-[11px] font-medium text-gray-900 block truncate">
          {order.readable_id || order.order_number}
        </span>
        {order.items && order.items.length > 0 ? (
          <QuantityHover 
            items={order.items} 
            totalQuantity={order.total_quantity || getItemCount(order.item_count)} 
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {getItemCount(order.item_count)} item{getItemCount(order.item_count) !== 1 ? 's' : ''}
          </span>
        )}
      </TableCell>

      {/* Customer */}
      <TableCell className="py-1.5 px-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-medium text-[10px] shrink-0">
            {order.customer_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 text-[11px] truncate" title={order.customer_name}>
              {order.customer_name}
            </p>
            <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Phone className="w-2 h-2" />
              <span className="truncate">{order.customer_phone}</span>
            </div>
          </div>
        </div>
      </TableCell>

      {/* Address - Zone/Branch with Logistics Popover */}
      <TableCell className="py-1.5 px-2 hidden lg:table-cell">
        <div className="flex gap-2">
          {/* I/O Badge - Editable until packed */}
          {!isStorePOS && (
            <FulfillmentTypeBadge
              orderId={order.id}
              fulfillmentType={order.fulfillment_type}
              status={order.status}
              size="sm"
            />
          )}
          
          {/* Address and Logistics Popover */}
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span 
              className="text-[11px] text-gray-700 line-clamp-2 leading-tight" 
              title={order.shipping_address || ''}
            >
              {order.shipping_address || 'No address provided'}
            </span>
            {/* Logistics Popover - Comprehensive zone/courier/rider editor */}
            {/* P1: Added deliveryType prop for color-coded badges (D2D=Purple, D2B=Green) */}
            {!isStorePOS && (
              <LogisticsPopover
                orderId={order.id}
                fulfillmentType={order.fulfillment_type}
                courierPartner={(order as any).courier_partner}
                destinationBranch={(order as any).destination_branch}
                riderId={order.rider_id}
                riderName={order.rider_name}
                zoneCode={order.zone_code}
                deliveryType={(order as any).delivery_type}
                status={order.status}
                size="sm"
              />
            )}
          </div>
        </div>
      </TableCell>

      {/* Product */}
      <TableCell className="py-1.5 px-2 hidden md:table-cell">
        {order.items && order.items.length > 0 ? (
          <div className="min-w-0">
            <ItemCountHover 
              items={order.items || []}
              primaryItemName={order.items?.[0]?.product_name}
            />
            {order.items?.[0]?.sku && (
              <span className="text-[9px] text-muted-foreground font-mono block">
                {order.items?.[0]?.sku}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Amount */}
      <TableCell className="py-1.5 px-2 text-right">
        <span className="font-semibold text-gray-900 text-[11px] block">
          {formatCurrency(order.total_amount)}
        </span>
        {order.payment_status === 'paid' && (
          <span className="text-[9px] text-green-600 font-medium">Paid</span>
        )}
        {order.payment_status === 'partial' && (
          <span className="text-[9px] text-yellow-600 font-medium">Partial</span>
        )}
        {order.payment_status === 'pending' && (
          <span className="text-[9px] text-orange-500">COD</span>
        )}
      </TableCell>

      {/* Status */}
      <TableCell className="py-1.5 px-2">
        <Badge 
          variant={statusConfig.variant}
          className={`${statusConfig.className} font-medium text-[9px] px-1 py-0`}
        >
          {statusConfig.label}
        </Badge>
      </TableCell>

      {/* Remarks - Hidden for Store POS */}
      {!isStorePOS && (
        <TableCell className="py-1.5 px-2 hidden xl:table-cell">
          <RemarksCell
            orderId={order.id}
            initialRemarks={order.remarks || order.staff_remarks}
            onUpdate={(id, updates) => onUpdateRemarks(id, updates.staff_remarks)}
          />
        </TableCell>
      )}

      {/* Date */}
      <TableCell className="py-1.5 px-2 hidden md:table-cell">
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {formatDate(order.created_at)}
        </span>
      </TableCell>

      {/* Actions */}
      <TableCell className="py-1.5 px-2 text-right">
        <div className="flex items-center justify-end gap-0.5">
          {/* P0 FIX: Eye button always visible - primary action to view details */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleViewDetails}
            className="h-6 w-6 text-gray-500 hover:text-orange-600 hover:bg-orange-50"
            title="View Details (Split View)"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>

          {/* Secondary actions - show on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {!isStorePOS && (
              <>
                {/* Inside Valley: Assign Rider */}
                {order.fulfillment_type === 'inside_valley' && 
                 order.status === 'packed' && 
                 !order.rider_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleAssignRider}
                    className="h-6 w-6 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    title="Assign Rider"
                  >
                    <UserCheck className="w-3 h-3" />
                  </Button>
                )}

                {/* Inside Valley: Dispatch */}
                {order.fulfillment_type === 'inside_valley' && 
                 order.rider_name && 
                 order.status === 'packed' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-green-600 hover:bg-green-50"
                    title="Mark Out for Delivery"
                  >
                    <TruckIcon className="w-3 h-3" />
                  </Button>
                )}

                {/* Outside Valley: Add Courier */}
                {order.fulfillment_type === 'outside_valley' && 
                 order.status === 'packed' && 
                 !order.courier_tracking_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleHandoverCourier}
                    className="h-6 w-6 text-purple-600 hover:bg-purple-50"
                    title="Add Courier Info"
                  >
                    <Send className="w-3 h-3" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// MEMOIZED EXPORT
// Custom comparison function for optimal re-render prevention
// =============================================================================

export const OrderRow = memo(OrderRowComponent, (prevProps, nextProps) => {
  // Only re-render if these specific values change
  return (
    prevProps.order.id === nextProps.order.id &&
    prevProps.order.status === nextProps.order.status &&
    prevProps.order.fulfillment_type === nextProps.order.fulfillment_type &&
    prevProps.order.remarks === nextProps.order.remarks &&
    prevProps.order.total_amount === nextProps.order.total_amount &&
    prevProps.order.payment_status === nextProps.order.payment_status &&
    prevProps.order.zone_code === nextProps.order.zone_code &&
    prevProps.order.rider_id === nextProps.order.rider_id &&
    prevProps.order.rider_name === nextProps.order.rider_name &&
    (prevProps.order as any).destination_branch === (nextProps.order as any).destination_branch &&
    (prevProps.order as any).courier_partner === (nextProps.order as any).courier_partner &&
    (prevProps.order as any).delivery_type === (nextProps.order as any).delivery_type && // P1: Added for color-coded badges
    prevProps.isStorePOS === nextProps.isStorePOS &&
    prevProps.index === nextProps.index &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.showCheckbox === nextProps.showCheckbox
  );
});

OrderRow.displayName = 'OrderRow';
