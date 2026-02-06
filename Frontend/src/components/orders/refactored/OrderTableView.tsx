'use client';

/**
 * OrderTableView - Main Table Container
 * 
 * Orchestrates filters, table rows, pagination, and bulk actions.
 * Uses memoized subcomponents to minimize re-renders.
 * 
 * @refactor Phase 2 - OrderTableView Extraction
 * @architecture Modular composition with React.memo
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

// Refactored components
import { OrderTableFilters } from './OrderTableFilters';
import { OrderTableRow } from './OrderTableRow';
import { OrderTablePagination } from './OrderTablePagination';
import { OrderBulkActions } from './OrderBulkActions';

// Modals
import { ExchangeModal } from '@/components/orders/ExchangeModal';
import AdvancePaymentModal from '@/components/orders/AdvancePaymentModal';

// Types
import { type DateRangeOption } from '@/components/orders/OrderDateFilter';
import {
  type Order,
  type LocationType,
  type StatusFilter,
  type Pagination,
  STATUS_FILTERS,
} from './types';

// =============================================================================
// PROPS
// =============================================================================

export interface OrderTableViewProps {
  orders: Order[];
  isLoading: boolean;
  isFetching?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  activeLocation: LocationType;
  onLocationChange: (location: LocationType) => void;
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  dateRange: DateRangeOption;
  onDateRangeChange: (range: DateRangeOption) => void;
  onRefresh: () => void;
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => void;
  onSelectOrder: (id: string) => void;
  pagination: Pagination;
  onPageChange: (page: number) => void;
  quickCreateExpanded?: boolean;
  onQuickCreateExpandChange?: (expanded: boolean) => void;
}

// =============================================================================
// TABLE HEADER
// =============================================================================

interface TableHeaderProps {
  activeLocation: LocationType;
  isAllSelected: boolean;
  onSelectAll: (checked: boolean) => void;
}

const TableHeader = React.memo<TableHeaderProps>(({ activeLocation, isAllSelected, onSelectAll }) => {
  const isPOS = activeLocation === 'POS';
  
  return (
    <thead className="sticky top-0 z-10 bg-gray-50/95 border-b border-gray-200">
      <tr>
        {/* Checkbox - 24px */}
        <th className="w-6 px-1 py-1.5 text-center">
          <Checkbox 
            checked={isAllSelected}
            onCheckedChange={onSelectAll}
            className="data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500 h-3.5 w-3.5"
          />
        </th>
        {/* Eye icon - 24px */}
        <th className="w-6 px-0.5 py-1.5 text-center"></th>
        {/* Order ID + Status */}
        <th className={cn(
          "px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500",
          isPOS ? 'w-[12%]' : 'w-[9%]'
        )}>Order</th>
        {/* Customer */}
        <th className={cn(
          "px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500",
          isPOS ? 'w-[16%]' : 'w-[12%]'
        )}>Customer</th>
        {/* Address - HIDDEN for Store POS */}
        {!isPOS && (
          <th className="w-[14%] px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500">Address</th>
        )}
        {/* Product */}
        <th className={cn(
          "px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500",
          isPOS ? 'w-[16%]' : 'w-[10%]'
        )}>Product</th>
        {/* SKU */}
        <th className={cn(
          "px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500",
          isPOS ? 'w-[10%]' : 'w-[8%]'
        )}>SKU</th>
        {/* Payable/Total */}
        <th className={cn(
          "px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500",
          isPOS ? 'w-[12%]' : 'w-[7%]'
        )}>{isPOS ? 'Total' : 'Payable'}</th>
        {/* Adjustments - HIDDEN for Store POS */}
        {!isPOS && (
          <th className="w-[7%] px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500">Adjust</th>
        )}
        {/* Delivery - HIDDEN for Store POS */}
        {!isPOS && (
          <th className="w-[8%] px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500">Delivery</th>
        )}
        {/* Remarks */}
        <th className={cn(
          "px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500",
          isPOS ? 'w-[14%]' : 'w-[10%]'
        )}>Remarks</th>
        {/* Date column for Store POS */}
        {isPOS && (
          <th className="w-[10%] px-1.5 py-1.5 text-left font-semibold text-[10px] uppercase tracking-wider text-gray-500">Date</th>
        )}
        {/* Actions menu */}
        <th className="w-6 px-0.5 py-1.5 text-center"></th>
      </tr>
    </thead>
  );
});

TableHeader.displayName = 'TableHeader';

// =============================================================================
// LOADING SKELETON
// =============================================================================

const LoadingSkeleton = React.memo(() => (
  <div className="flex-1 p-6 space-y-4 overflow-auto">
    {[...Array(12)].map((_, i) => (
      <div key={i} className="flex items-center gap-4">
        <Skeleton className="w-5 h-5 rounded" />
        <div className="flex-1">
          <Skeleton className="h-4 w-32 mb-2" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
    ))}
  </div>
));

LoadingSkeleton.displayName = 'LoadingSkeleton';

// =============================================================================
// EMPTY STATE
// =============================================================================

const EmptyState = React.memo(() => (
  <div className="flex-1 flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
        <Package className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">No Orders Found</h3>
      <p className="mt-2 text-gray-500">Try adjusting your filters or search term</p>
    </div>
  </div>
));

EmptyState.displayName = 'EmptyState';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function OrderTableViewComponent({
  orders,
  isLoading,
  isFetching = false,
  search,
  onSearchChange,
  activeLocation,
  onLocationChange,
  activeFilter,
  onFilterChange,
  dateRange,
  onDateRangeChange,
  onRefresh,
  onUpdateOrder,
  onSelectOrder,
  pagination,
  onPageChange,
  quickCreateExpanded,
  onQuickCreateExpandChange,
}: OrderTableViewProps) {
  // ==========================================================================
  // LOCAL STATE
  // ==========================================================================
  
  // Selection state for bulk actions
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  
  // Expanded order rows (to show item details)
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  
  // Modal states
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [exchangeOrderId, setExchangeOrderId] = useState<string | null>(null);
  const [advancePaymentModalOpen, setAdvancePaymentModalOpen] = useState(false);
  const [advancePaymentOrder, setAdvancePaymentOrder] = useState<Order | null>(null);

  // ==========================================================================
  // MEMOIZED VALUES
  // ==========================================================================
  
  // Filter orders by status locally for display
  const filteredOrders = useMemo(() => {
    if (activeFilter === 'all') return orders;
    const statuses = STATUS_FILTERS.find(f => f.key === activeFilter)?.statuses || [];
    return orders.filter(o => statuses.includes(o.status?.toLowerCase()));
  }, [orders, activeFilter]);

  // Count stats for each filter tab
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: orders.length,
      leads: orders.filter(o => ['new', 'follow_up', 'intake'].includes(o.status?.toLowerCase())).length,
      fulfillment: orders.filter(o => ['converted', 'packed'].includes(o.status?.toLowerCase())).length,
      logistics: orders.filter(o => ['assigned', 'out_for_delivery', 'rescheduled', 'in_transit', 'handover_to_courier'].includes(o.status?.toLowerCase())).length,
      completed: orders.filter(o => ['delivered', 'returned', 'rejected', 'refunded', 'exchange', 'store_sale'].includes(o.status?.toLowerCase())).length,
      cancelled: orders.filter(o => ['cancelled', 'trash'].includes(o.status?.toLowerCase())).length,
    };
    return counts;
  }, [orders]);

  // Check if all filtered orders are selected
  const isAllSelected = useMemo(() => {
    return selectedOrders.length === filteredOrders.length && filteredOrders.length > 0;
  }, [selectedOrders, filteredOrders]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================
  
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedOrders(filteredOrders.map(o => o.id));
    } else {
      setSelectedOrders([]);
    }
  }, [filteredOrders]);

  const handleToggleSelection = useCallback((orderId: string, checked: boolean) => {
    setSelectedOrders(prev => 
      checked 
        ? [...prev, orderId]
        : prev.filter(id => id !== orderId)
    );
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedOrders([]);
  }, []);

  const toggleOrderExpand = useCallback((orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  }, []);

  const handleOpenExchangeModal = useCallback((orderId: string) => {
    setExchangeOrderId(orderId);
    setExchangeModalOpen(true);
  }, []);

  const handleOpenAdvancePaymentModal = useCallback((order: Order) => {
    setAdvancePaymentOrder(order);
    setAdvancePaymentModalOpen(true);
  }, []);

  // P0: Handle fulfillment type change
  const handleFulfillmentChange = useCallback(async (orderId: string, newType: 'inside_valley' | 'outside_valley') => {
    // Optimistic update
    onUpdateOrder(orderId, { fulfillment_type: newType });
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('Not authenticated');
      
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const response = await fetch(`${backendUrl}/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ fulfillment_type: newType }),
      });
      
      if (!response.ok) {
        onRefresh(); // Revert by refreshing
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('[FULFILLMENT-FIX] Failed:', error);
    }
  }, [onUpdateOrder, onRefresh]);

  // P0: Handle customer/address inline edits
  const handleCustomerUpdate = useCallback(async (orderId: string, updates: {
    shipping_name?: string;
    shipping_phone?: string;
    alt_phone?: string;
    shipping_address?: string;
    staff_remarks?: string;
  }) => {
    const originalOrder = orders.find(o => o.id === orderId);
    
    // Optimistic update
    onUpdateOrder(orderId, updates);
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        if (originalOrder) onUpdateOrder(orderId, originalOrder);
        return;
      }
      
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const response = await fetch(`${backendUrl}/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        if (originalOrder) onUpdateOrder(orderId, originalOrder);
      }
    } catch (error) {
      console.error('[INLINE-EDIT] Failed:', error);
      if (originalOrder) onUpdateOrder(orderId, originalOrder);
    }
  }, [orders, onUpdateOrder]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  const isPOS = activeLocation === 'POS';

  return (
    <div className="flex flex-col h-full bg-gray-100/50 p-1">
      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden relative">
        
        {/* Filters */}
        <OrderTableFilters
          activeLocation={activeLocation}
          onLocationChange={onLocationChange}
          search={search}
          onSearchChange={onSearchChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
          statusCounts={statusCounts}
          onRefresh={onRefresh}
          quickCreateExpanded={quickCreateExpanded}
          onQuickCreateExpandChange={onQuickCreateExpandChange}
        />

        {/* Table Section */}
        <div className="flex-1 flex flex-col min-h-0">
          {isLoading ? (
            <LoadingSkeleton />
          ) : filteredOrders.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-auto">
              <table className={cn(
                "w-full table-fixed",
                isPOS ? 'min-w-[850px]' : 'min-w-[1200px]'
              )}>
                <TableHeader
                  activeLocation={activeLocation}
                  isAllSelected={isAllSelected}
                  onSelectAll={handleSelectAll}
                />
                <tbody className="divide-y divide-gray-50 bg-white">
                  {filteredOrders.map((order) => (
                    <OrderTableRow
                      key={order.id}
                      order={order}
                      activeLocation={activeLocation}
                      isSelected={selectedOrders.includes(order.id)}
                      isExpanded={expandedOrders.has(order.id)}
                      onSelect={onSelectOrder}
                      onToggleSelection={handleToggleSelection}
                      onToggleExpand={toggleOrderExpand}
                      onUpdateOrder={onUpdateOrder}
                      onCustomerUpdate={handleCustomerUpdate}
                      onFulfillmentChange={handleFulfillmentChange}
                      onRefresh={onRefresh}
                      onOpenExchangeModal={handleOpenExchangeModal}
                      onOpenAdvancePaymentModal={handleOpenAdvancePaymentModal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        <OrderTablePagination
          pagination={pagination}
          onPageChange={onPageChange}
          isFetching={isFetching}
        />

        {/* Bulk Actions Bar */}
        <OrderBulkActions
          selectedOrders={selectedOrders}
          orders={filteredOrders}
          onClearSelection={handleClearSelection}
          onUpdateOrder={onUpdateOrder}
          onRefresh={onRefresh}
        />
      </div>

      {/* Modals */}
      <ExchangeModal
        open={exchangeModalOpen}
        onOpenChange={setExchangeModalOpen}
        orderId={exchangeOrderId || ''}
        onSuccess={onRefresh}
      />
      
      {advancePaymentOrder && (
        <AdvancePaymentModal
          isOpen={advancePaymentModalOpen}
          onClose={() => setAdvancePaymentModalOpen(false)}
          onSuccess={onRefresh}
          orderId={advancePaymentOrder.id}
          orderNumber={advancePaymentOrder.order_number}
          totalAmount={advancePaymentOrder.total_amount}
          currentAdvance={advancePaymentOrder.paid_amount || 0}
        />
      )}
    </div>
  );
}

// Export memoized component
export const OrderTableView = React.memo(OrderTableViewComponent);
OrderTableView.displayName = 'OrderTableView';

export default OrderTableView;
