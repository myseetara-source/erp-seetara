'use client';

/**
 * Orders Dashboard - REFACTORED VERSION
 * 
 * PHASE 1 & 2 COMPLETE: Component Extraction & State Unification
 * 
 * BEFORE: 3,166 lines in single file
 * AFTER:  ~200 lines (thin orchestrator)
 * 
 * KEY CHANGES:
 * 1. Uses useOrders hook (React Query) instead of local useState
 * 2. Phase 1 Components: OrderListSidebar, OrderDetailView, OrderTimelinePanel
 * 3. Phase 2 Components: OrderTableView (with Filters, Row, Pagination, BulkActions)
 * 4. All components wrapped in React.memo for re-render optimization
 * 5. Real-time ready: useOrders hook handles WebSocket updates
 * 
 * @refactor Phase 1 & 2 - State Unification + TableView Extraction
 * @author Senior Frontend Architect
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';

// Hooks
import { useOrders, useOrderOptimisticUpdate } from '@/hooks/useOrders';
import { useOrdersRealtime, RealtimeConnectionIndicator } from '@/hooks/useOrdersRealtime';

// Refactored Components (Phase 1 & 2)
import {
  // Phase 1: Detail View
  OrderListSidebar,
  OrderDetailView,
  OrderTimelinePanel,
  // Phase 2: Table View
  OrderTableView,
  // Types
  type LocationType,
  type StatusFilter,
  type Order,
  STATUS_FILTERS,
} from '@/components/orders/refactored';

// Date Filter Types
import { 
  type DateRangeOption, 
  getDateRangeFromOption,
  DEFAULT_DATE_RANGE,
} from '@/components/orders/OrderDateFilter';

// =============================================================================
// TYPES
// =============================================================================

interface OrdersPageState {
  activeLocation: LocationType;
  activeFilter: StatusFilter;
  dateRange: DateRangeOption;
  quickCreateExpanded: boolean;
  showTimeline: boolean;
  search: string;
}

// =============================================================================
// MAIN PAGE COMPONENT (Thin Orchestrator)
// =============================================================================

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // URL-driven state
  const selectedOrderId = searchParams.get('orderId');
  const expandQuickCreate = searchParams.get('expand') === 'quick';
  const dateRangeParam = searchParams.get('range') as DateRangeOption | null;
  
  // Initial date range from URL or default
  const initialDateRange: DateRangeOption = dateRangeParam && 
    ['today', 'yesterday', '2d', '7d', '30d', 'all'].includes(dateRangeParam) 
    ? dateRangeParam 
    : '2d';

  // ==========================================================================
  // LOCAL UI STATE (Thin - Only UI concerns)
  // ==========================================================================
  
  const [state, setState] = useState<OrdersPageState>({
    activeLocation: 'all',
    activeFilter: 'leads',
    dateRange: initialDateRange,
    quickCreateExpanded: expandQuickCreate,
    showTimeline: false,
    search: '',
  });

  // ==========================================================================
  // SERVER STATE (Via useOrders Hook - React Query)
  // ==========================================================================
  
  // Build filters from UI state
  const filters = useMemo(() => {
    const { startDate, endDate } = getDateRangeFromOption(state.dateRange);
    const statusConfig = STATUS_FILTERS.find(f => f.key === state.activeFilter);
    
    return {
      search: state.search || undefined,
      fulfillmentType: state.activeLocation !== 'all' 
        ? state.activeLocation === 'INSIDE_VALLEY' ? 'inside_valley' 
          : state.activeLocation === 'OUTSIDE_VALLEY' ? 'outside_valley' 
          : 'store'
        : undefined,
      status: statusConfig && state.activeFilter !== 'all' 
        ? statusConfig.statuses.join(',') 
        : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page: 1,
      limit: 50,
    };
  }, [state.activeLocation, state.activeFilter, state.dateRange, state.search]);
  
  // Use the centralized useOrders hook (React Query)
  const {
    orders,
    pagination,
    isLoading,
    isFetching,
    refetch,
    setPage,
    hasNewOrders,
    showNewOrders,
  } = useOrders(filters);
  
  // Optimistic update helper
  const optimisticUpdate = useOrderOptimisticUpdate();
  
  // Enable real-time updates
  useOrdersRealtime({ filters });

  // ==========================================================================
  // HANDLERS (Memoized)
  // ==========================================================================
  
  const handleSelectOrder = useCallback((id: string) => {
    router.push(`/dashboard/orders?orderId=${id}`, { scroll: false });
  }, [router]);

  const handleBackToTable = useCallback(() => {
    router.push('/dashboard/orders', { scroll: false });
    setState(prev => ({ ...prev, showTimeline: false }));
  }, [router]);

  const handleLocationChange = useCallback((location: LocationType) => {
    setState(prev => ({ 
      ...prev, 
      activeLocation: location,
      activeFilter: 'leads', // Reset to leads tab
    }));
  }, []);

  const handleFilterChange = useCallback((filter: StatusFilter) => {
    setState(prev => ({ ...prev, activeFilter: filter }));
  }, []);

  const handleSearchChange = useCallback((search: string) => {
    setState(prev => ({ ...prev, search }));
  }, []);

  const handleDateRangeChange = useCallback((newRange: DateRangeOption) => {
    setState(prev => ({ ...prev, dateRange: newRange }));
    
    // Update URL for persistence
    const params = new URLSearchParams(window.location.search);
    if (newRange === DEFAULT_DATE_RANGE) {
      params.delete('range');
    } else {
      params.set('range', newRange);
    }
    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}` 
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPage(page);
  }, [setPage]);

  const handleQuickCreateExpandChange = useCallback((expanded: boolean) => {
    setState(prev => ({ ...prev, quickCreateExpanded: expanded }));
  }, []);

  // Handle order updates (optimistic)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUpdateOrder = useCallback((orderId: string, updates: Partial<Order>) => {
    optimisticUpdate(orderId, updates as any);
  }, [optimisticUpdate]);

  // Clear expand param after opening
  useEffect(() => {
    if (expandQuickCreate) {
      setState(prev => ({ ...prev, quickCreateExpanded: true }));
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [expandQuickCreate]);

  // ==========================================================================
  // RENDER: Determine View Mode
  // ==========================================================================
  
  const isDetailView = !!selectedOrderId;

  // ==========================================================================
  // TABLE VIEW (Default - No order selected)
  // ==========================================================================
  
  if (!isDetailView) {
    return (
      <div className="relative h-full">
        {/* Real-time Connection Indicator */}
        <RealtimeConnectionIndicator />
        
        {/* New Orders Banner */}
        {hasNewOrders && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50">
            <button
              onClick={showNewOrders}
              className="px-4 py-2 bg-orange-500 text-white rounded-full shadow-lg hover:bg-orange-600 transition-colors text-sm font-medium animate-bounce"
            >
              ↑ New orders available
            </button>
          </div>
        )}
        
        {/* Phase 2: OrderTableView Component */}
        <OrderTableView
          orders={orders}
          isLoading={isLoading}
          isFetching={isFetching}
          search={state.search}
          onSearchChange={handleSearchChange}
          activeLocation={state.activeLocation}
          onLocationChange={handleLocationChange}
          activeFilter={state.activeFilter}
          onFilterChange={handleFilterChange}
          dateRange={state.dateRange}
          onDateRangeChange={handleDateRangeChange}
          onRefresh={refetch}
          onUpdateOrder={handleUpdateOrder}
          onSelectOrder={handleSelectOrder}
          pagination={pagination}
          onPageChange={handlePageChange}
          quickCreateExpanded={state.quickCreateExpanded}
          onQuickCreateExpandChange={handleQuickCreateExpandChange}
        />
      </div>
    );
  }

  // ==========================================================================
  // 3-PANEL SPLIT VIEW (Order selected)
  // ==========================================================================
  
  return (
    <div className="flex h-[calc(100vh-2rem)] -m-3 lg:-m-4 overflow-hidden">
      {/* Real-time Connection Indicator */}
      <RealtimeConnectionIndicator />
      
      {/* Left Panel: Order List Sidebar */}
      <div className="w-[340px] flex-shrink-0 border-r border-gray-200 bg-white h-full overflow-hidden">
        <OrderListSidebar
          orders={orders}
          selectedOrderId={selectedOrderId}
          onSelectOrder={handleSelectOrder}
          isLoading={isLoading}
          search={state.search}
          onSearchChange={handleSearchChange}
          activeFilter={state.activeFilter}
          onFilterChange={handleFilterChange}
          onRefresh={refetch}
          onBack={handleBackToTable}
        />
      </div>
      
      {/* Middle + Right Panels */}
      <div className="flex-1 flex overflow-hidden min-w-0 h-full">
        {/* Middle Panel: Order Detail */}
        <div className={`overflow-auto transition-all duration-300 ease-in-out bg-gray-50 h-full ${
          state.showTimeline ? 'flex-1 min-w-[500px]' : 'flex-1 min-w-0'
        }`}>
          <OrderDetailView 
            orderId={selectedOrderId}
            onRefresh={() => refetch()}
            onShowTimeline={() => setState(prev => ({ ...prev, showTimeline: true }))}
            onBack={handleBackToTable}
          />
        </div>
        
        {/* Right Panel: Timeline */}
        <AnimatePresence mode="wait">
          {state.showTimeline && selectedOrderId && (
            <OrderTimelinePanel
              orderId={selectedOrderId}
              onClose={() => setState(prev => ({ ...prev, showTimeline: false }))}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
