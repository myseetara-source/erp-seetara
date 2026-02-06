'use client';

/**
 * OrderTableFilters - Extracted Component
 * 
 * Contains location tabs, search input, date filter, and status pills.
 * Memoized to prevent re-renders when table data changes.
 * 
 * @refactor Phase 2 - OrderTableView Extraction
 */

import React, { useCallback } from 'react';
import { Search, Package, Truck, Store, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import OrderDateFilter, { type DateRangeOption } from '@/components/orders/OrderDateFilter';
import { QuickCreatePanel } from '@/components/orders/QuickCreatePanel';
import {
  type LocationType,
  type StatusFilter,
  LOCATION_TABS,
  STATUS_FILTERS,
} from './types';

// =============================================================================
// PROPS
// =============================================================================

interface OrderTableFiltersProps {
  // Location
  activeLocation: LocationType;
  onLocationChange: (location: LocationType) => void;
  // Search
  search: string;
  onSearchChange: (value: string) => void;
  // Date
  dateRange: DateRangeOption;
  onDateRangeChange: (range: DateRangeOption) => void;
  // Status
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  statusCounts: Record<StatusFilter, number>;
  // Quick Create
  onRefresh: () => void;
  quickCreateExpanded?: boolean;
  onQuickCreateExpandChange?: (expanded: boolean) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

function OrderTableFiltersComponent({
  activeLocation,
  onLocationChange,
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  activeFilter,
  onFilterChange,
  statusCounts,
  onRefresh,
  quickCreateExpanded,
  onQuickCreateExpandChange,
}: OrderTableFiltersProps) {
  // Memoized handlers
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  }, [onSearchChange]);

  const handleLocationClick = useCallback((location: LocationType) => {
    onLocationChange(location);
  }, [onLocationChange]);

  const handleFilterClick = useCallback((filter: StatusFilter) => {
    onFilterChange(filter);
  }, [onFilterChange]);

  return (
    <div className="flex-shrink-0 px-4 pt-3 pb-3 border-b border-gray-100">
      {/* Filters Row - Compact */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Location Tabs */}
        <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded-lg">
          {LOCATION_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleLocationClick(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                  activeLocation === tab.id 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', activeLocation === tab.id && 'text-orange-500')} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            type="text"
            placeholder="Search order ID, customer..."
            value={search}
            onChange={handleSearchChange}
            className="pl-8 h-8 text-sm rounded-lg border-gray-200 bg-gray-50 focus:bg-white"
          />
        </div>
        
        {/* Date Range Filter */}
        <OrderDateFilter
          value={dateRange}
          onChange={onDateRangeChange}
        />
      </div>

      {/* Status Filters Row */}
      <div className="flex items-center gap-1.5 mt-2">
        {STATUS_FILTERS.map((filter) => {
          const count = statusCounts[filter.key];
          return (
            <button
              key={filter.key}
              onClick={() => handleFilterClick(filter.key)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                activeFilter === filter.key
                  ? `${filter.color} text-white shadow-sm`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <span>{filter.label}</span>
              <span className={cn(
                'min-w-[18px] h-4 flex items-center justify-center px-1 rounded-full text-[10px] font-bold',
                activeFilter === filter.key
                  ? 'bg-white/25 text-white'
                  : 'bg-gray-200 text-gray-700'
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Quick Create Panel */}
      <div className="mt-2">
        <QuickCreatePanel 
          onSuccess={onRefresh}
          defaultExpanded={quickCreateExpanded}
          onExpandChange={onQuickCreateExpandChange}
        />
      </div>
    </div>
  );
}

// Export memoized component
export const OrderTableFilters = React.memo(OrderTableFiltersComponent);
OrderTableFilters.displayName = 'OrderTableFilters';

export default OrderTableFilters;
