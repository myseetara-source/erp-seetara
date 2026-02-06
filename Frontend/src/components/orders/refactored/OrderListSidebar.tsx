'use client';

/**
 * OrderListSidebar - Extracted Component
 * 
 * Displays a scrollable list of orders in the 3-panel split view.
 * Used when an order is selected for detail viewing.
 * 
 * @refactor Phase 1 - Component Extraction
 * @optimization React.memo prevents unnecessary re-renders
 */

import React, { useMemo, useCallback } from 'react';
import { Search, ArrowLeft, RefreshCw, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency as formatAmount } from '@/utils/formatOrder';
import {
  Order,
  StatusFilter,
  STATUS_FILTERS,
  STATUS_CONFIG,
  getEffectiveStatus,
} from './types';

// =============================================================================
// PROPS INTERFACE
// =============================================================================

interface OrderListSidebarProps {
  orders: Order[];
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  onRefresh: () => void;
  onBack: () => void;
}

// =============================================================================
// MEMOIZED ORDER LIST ITEM
// =============================================================================

interface OrderListItemProps {
  order: Order;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const OrderListItem = React.memo<OrderListItemProps>(({ order, isSelected, onSelect }) => {
  const effectiveStatus = getEffectiveStatus(order);
  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.intake;
  const StatusIcon = statusConfig.icon;
  
  const handleClick = useCallback(() => {
    onSelect(order.id);
  }, [onSelect, order.id]);
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border-2',
        isSelected
          ? 'bg-orange-50 border-orange-300 shadow-sm'
          : 'border-transparent hover:bg-gray-50 hover:border-orange-200'
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center shadow-sm',
        statusConfig.bg
      )}>
        <StatusIcon className={cn('w-5 h-5', statusConfig.color)} />
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">
            {order.readable_id || order.order_number}
          </span>
          <Badge className={cn('text-[10px] px-1.5 py-0', statusConfig.bg, statusConfig.color)}>
            {statusConfig.label}
          </Badge>
        </div>
        <p className="text-xs text-gray-500 truncate">
          {order.shipping_name || order.customer?.name || 'Unknown'}
        </p>
        <p className="text-[10px] text-gray-400">
          {new Date(order.created_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
          })}
        </p>
      </div>
      
      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-gray-900">
          {formatAmount(order.total_amount || 0)}
        </p>
        <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
      </div>
    </button>
  );
});

OrderListItem.displayName = 'OrderListItem';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function OrderListSidebarComponent({
  orders,
  selectedOrderId,
  onSelectOrder,
  isLoading,
  search,
  onSearchChange,
  activeFilter,
  onFilterChange,
  onRefresh,
  onBack,
}: OrderListSidebarProps) {
  // Filter orders locally
  const filteredOrders = useMemo(() => {
    if (activeFilter === 'all') return orders;
    const statuses = STATUS_FILTERS.find(f => f.key === activeFilter)?.statuses || [];
    return orders.filter(o => statuses.includes(o.status?.toLowerCase() || ''));
  }, [orders, activeFilter]);

  // Calculate stats
  const stats = useMemo(() => ({
    count: filteredOrders.length,
    totalValue: filteredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
  }), [filteredOrders]);

  // Memoized handlers
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  }, [onSearchChange]);

  const handleFilterClick = useCallback((key: StatusFilter) => {
    onFilterChange(key);
  }, [onFilterChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gradient-to-r from-orange-500 to-amber-500">
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white hover:bg-white/20 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="text-white hover:bg-white/20"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-300" />
          <Input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={handleSearchChange}
            className="pl-9 h-10 rounded-xl bg-white/90 border-0 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex-shrink-0 p-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.slice(0, 4).map((filter) => (
            <button
              key={filter.key}
              onClick={() => handleFilterClick(filter.key)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                activeFilter === filter.key
                  ? `${filter.color} text-white shadow-sm`
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-200'
              )}
            >
              {filter.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Order List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No orders found</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderListItem
              key={order.id}
              order={order}
              isSelected={selectedOrderId === order.id}
              onSelect={onSelectOrder}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-3 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">
            {stats.count} order{stats.count !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-bold text-gray-700">
            Total: {formatAmount(stats.totalValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Export memoized component
export const OrderListSidebar = React.memo(OrderListSidebarComponent);
OrderListSidebar.displayName = 'OrderListSidebar';

export default OrderListSidebar;
