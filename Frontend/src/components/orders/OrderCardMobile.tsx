/**
 * OrderCardMobile - Mobile-optimized Order Card View
 * 
 * P1 FIX: Mobile Responsiveness
 * Replaces the table view on mobile devices with a card-based layout
 * 
 * Features:
 * - Touch-friendly card layout
 * - All key information visible without scrolling
 * - Swipe actions (future enhancement)
 * - Status badge prominent display
 * 
 * @author UI/UX Team
 * @priority P1 - Mobile Responsiveness
 */

'use client';

import React from 'react';
import { 
  Package, 
  Phone, 
  MapPin, 
  Eye,
  ChevronRight,
  Clock,
  IndianRupee,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import StatusBadge from '@/components/ui/StatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import type { Order } from '@/components/orders/refactored/types';

interface OrderCardMobileProps {
  order: Order;
  isSelected?: boolean;
  onSelect?: (order: Order) => void;
  onToggleSelect?: (id: string, selected: boolean) => void;
  onViewDetails?: (order: Order) => void;
}

export const OrderCardMobile: React.FC<OrderCardMobileProps> = ({
  order,
  isSelected = false,
  onSelect,
  onToggleSelect,
  onViewDetails,
}) => {
  // Get first product for display
  const firstItem = order.items?.[0];
  const itemCount = order.items?.length || 0;
  
  // Format date
  const formattedDate = new Date(order.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div 
      className={cn(
        'bg-white rounded-xl border shadow-sm p-4 transition-all duration-200',
        isSelected 
          ? 'border-orange-300 bg-orange-50/50 shadow-orange-100' 
          : 'border-gray-200 hover:border-gray-300 hover:shadow-md',
      )}
    >
      {/* Header Row - Order ID, Status, Checkbox */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {onToggleSelect && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelect(order.id, !!checked)}
              className="data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
            />
          )}
          <span className="font-mono text-sm font-bold text-gray-900">
            #{order.readable_id || order.order_number || order.id.slice(-6).toUpperCase()}
          </span>
        </div>
        <StatusBadge status={order.status as any} size="sm" />
      </div>

      {/* Customer Info */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">
            {order.customer_name || 'Walk-in Customer'}
          </p>
          <div className="flex items-center gap-2 mt-1 text-gray-500 text-sm">
            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{order.customer_phone || 'No phone'}</span>
          </div>
        </div>
        <button
          onClick={() => onViewDetails?.(order)}
          className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <Eye className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Address (if delivery) */}
      {order.fulfillment_type !== 'store' && order.shipping_address && (
        <div className="flex items-start gap-2 mb-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
          <p className="line-clamp-2">{order.shipping_address}</p>
        </div>
      )}

      {/* Product Summary */}
      <div className="flex items-center gap-2 mb-3 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
        <Package className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
        <p className="truncate flex-1">
          {firstItem?.product_name || 'No products'}
          {itemCount > 1 && (
            <span className="text-gray-400"> +{itemCount - 1} more</span>
          )}
        </p>
      </div>

      {/* Footer - Amount and Date */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <IndianRupee className="w-4 h-4 text-green-600" />
          <span className="font-bold text-lg text-gray-900">
            {(order.cod_amount || order.total_amount || 0).toLocaleString()}
          </span>
          {order.payment_status === 'paid' && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full ml-1">
              Paid
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          <span>{formattedDate}</span>
        </div>
      </div>

      {/* Quick Action Tap Area */}
      {onSelect && (
        <button
          onClick={() => onSelect(order)}
          className="w-full mt-3 py-2 text-sm text-orange-600 font-medium flex items-center justify-center gap-1 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
        >
          View Details
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

// =============================================================================
// MOBILE ORDER LIST - Renders list of order cards
// =============================================================================

interface OrderListMobileProps {
  orders: Order[];
  selectedOrders?: string[];
  onSelectOrder?: (order: Order) => void;
  onToggleSelect?: (id: string, selected: boolean) => void;
  onViewDetails?: (order: Order) => void;
  isLoading?: boolean;
}

export const OrderListMobile: React.FC<OrderListMobileProps> = ({
  orders,
  selectedOrders = [],
  onSelectOrder,
  onToggleSelect,
  onViewDetails,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="flex items-center justify-between mb-3">
              <div className="h-5 w-20 bg-gray-200 rounded" />
              <div className="h-6 w-16 bg-gray-200 rounded-full" />
            </div>
            <div className="h-5 w-32 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-10 w-full bg-gray-100 rounded-lg mb-3" />
            <div className="flex justify-between pt-3 border-t border-gray-100">
              <div className="h-6 w-20 bg-gray-200 rounded" />
              <div className="h-4 w-16 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <Package className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">No Orders Found</h3>
        <p className="text-sm text-gray-500">Try adjusting your filters or search term</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {orders.map((order) => (
        <OrderCardMobile
          key={order.id}
          order={order}
          isSelected={selectedOrders.includes(order.id)}
          onSelect={onSelectOrder}
          onToggleSelect={onToggleSelect}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  );
};

export default OrderCardMobile;
