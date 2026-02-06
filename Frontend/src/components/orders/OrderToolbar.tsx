/**
 * OrderToolbar Component
 * 
 * Search bar, filter tabs, and action buttons for the orders page.
 * 
 * @author Code Quality Team
 * @priority P0 - Orders Page Refactoring
 */

'use client';

import { memo, useCallback, useState } from 'react';
import {
  Search,
  X,
  Plus,
  Download,
  RefreshCw,
  Filter,
  SlidersHorizontal,
  MapPin,
  Globe,
  Store,
  LayoutList,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { OrderFiltersState, DateRange } from '@/hooks/orders';
import type { OrderStatus, FulfillmentType } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderToolbarProps {
  /** Current filter state */
  filters: OrderFiltersState;
  /** Search value change handler */
  onSearchChange: (value: string) => void;
  /** Status filter change handler */
  onStatusChange?: (status: OrderStatus | 'all') => void;
  /** Fulfillment type change handler */
  onFulfillmentChange?: (type: FulfillmentType | 'all') => void;
  /** Zone filter change handler */
  onZoneChange?: (zone: string) => void;
  /** Date range change handler */
  onDateRangeChange?: (range: DateRange) => void;
  /** Reset all filters */
  onReset?: () => void;
  /** Refresh data */
  onRefresh?: () => void;
  /** Create new order */
  onCreateOrder?: () => void;
  /** Export orders */
  onExport?: () => void;
  /** Whether filters are currently active */
  hasActiveFilters?: boolean;
  /** Number of active filters */
  activeFilterCount?: number;
  /** Number of selected items (for bulk actions) */
  selectedCount?: number;
  /** Show loading state */
  loading?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// FULFILLMENT TABS CONFIG
// =============================================================================

interface TabConfig {
  value: FulfillmentType | 'all';
  label: string;
  icon: React.ElementType;
}

const FULFILLMENT_TABS: TabConfig[] = [
  { value: 'all', label: 'All Orders', icon: LayoutList },
  { value: 'inside_valley', label: 'Inside Valley', icon: MapPin },
  { value: 'outside_valley', label: 'Outside Valley', icon: Globe },
  { value: 'store', label: 'Store', icon: Store },
];

// =============================================================================
// SEARCH INPUT COMPONENT
// =============================================================================

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchInput = memo(function SearchInput({
  value,
  onChange,
  placeholder = 'Search orders, phone, name...',
  className,
}: SearchInputProps) {
  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9 h-10"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

// =============================================================================
// FULFILLMENT TABS COMPONENT
// =============================================================================

interface FulfillmentTabsProps {
  value: FulfillmentType | 'all';
  onChange: (value: FulfillmentType | 'all') => void;
  className?: string;
}

const FulfillmentTabs = memo(function FulfillmentTabs({
  value,
  onChange,
  className,
}: FulfillmentTabsProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border bg-muted p-1 gap-1',
        className
      )}
    >
      {FULFILLMENT_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = value === tab.value;

        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
});

// =============================================================================
// FILTER DROPDOWN COMPONENT
// =============================================================================

interface FilterDropdownProps {
  hasActiveFilters: boolean;
  activeFilterCount: number;
  onReset?: () => void;
  onOpenAdvanced?: () => void;
}

const FilterDropdown = memo(function FilterDropdown({
  hasActiveFilters,
  activeFilterCount,
  onReset,
  onOpenAdvanced,
}: FilterDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Quick Filters</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOpenAdvanced}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Advanced Filters
        </DropdownMenuItem>
        {hasActiveFilters && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReset} className="text-red-600">
              <X className="mr-2 h-4 w-4" />
              Clear All Filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

// =============================================================================
// ACTION BUTTONS COMPONENT
// =============================================================================

interface ActionButtonsProps {
  onCreateOrder?: () => void;
  onExport?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
}

const ActionButtons = memo(function ActionButtons({
  onCreateOrder,
  onExport,
  onRefresh,
  loading,
}: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      {onRefresh && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={loading}
          className="h-10 w-10"
          title="Refresh"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      )}
      
      {onExport && (
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          className="h-10 gap-2"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      )}
      
      {onCreateOrder && (
        <Button
          size="sm"
          onClick={onCreateOrder}
          className="h-10 gap-2"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Order</span>
        </Button>
      )}
    </div>
  );
});

// =============================================================================
// MAIN TOOLBAR COMPONENT
// =============================================================================

export const OrderToolbar = memo(function OrderToolbar({
  filters,
  onSearchChange,
  onStatusChange,
  onFulfillmentChange,
  onZoneChange,
  onDateRangeChange,
  onReset,
  onRefresh,
  onCreateOrder,
  onExport,
  hasActiveFilters = false,
  activeFilterCount = 0,
  selectedCount = 0,
  loading = false,
  className,
}: OrderToolbarProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const handleFulfillmentChange = useCallback(
    (type: FulfillmentType | 'all') => {
      onFulfillmentChange?.(type);
    },
    [onFulfillmentChange]
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Main Toolbar Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        {/* Left: Search */}
        <SearchInput
          value={filters.search}
          onChange={onSearchChange}
          className="flex-1 max-w-md"
        />

        {/* Middle: Fulfillment Tabs */}
        <FulfillmentTabs
          value={filters.fulfillmentType}
          onChange={handleFulfillmentChange}
          className="hidden md:inline-flex"
        />

        {/* Right: Actions */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <FilterDropdown
            hasActiveFilters={hasActiveFilters}
            activeFilterCount={activeFilterCount}
            onReset={onReset}
            onOpenAdvanced={() => setShowAdvancedFilters(true)}
          />
          
          <ActionButtons
            onCreateOrder={onCreateOrder}
            onExport={onExport}
            onRefresh={onRefresh}
            loading={loading}
          />
        </div>
      </div>

      {/* Mobile Fulfillment Tabs (shown below on small screens) */}
      <div className="md:hidden">
        <FulfillmentTabs
          value={filters.fulfillmentType}
          onChange={handleFulfillmentChange}
          className="w-full justify-center"
        />
      </div>

      {/* Active Filters Bar (shown when filters are active) */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          
          {filters.search && (
            <FilterChip
              label={`Search: "${filters.search}"`}
              onRemove={() => onSearchChange('')}
            />
          )}
          
          {filters.status !== 'all' && (
            <FilterChip
              label={`Status: ${filters.status}`}
              onRemove={() => onStatusChange?.('all')}
            />
          )}
          
          {filters.fulfillmentType !== 'all' && (
            <FilterChip
              label={`Type: ${filters.fulfillmentType.replace('_', ' ')}`}
              onRemove={() => onFulfillmentChange?.('all')}
            />
          )}
          
          {filters.zone && (
            <FilterChip
              label={`Zone: ${filters.zone}`}
              onRemove={() => onZoneChange?.('')}
            />
          )}
          
          {(filters.dateRange.from || filters.dateRange.to) && (
            <FilterChip
              label="Date range"
              onRemove={() => onDateRangeChange?.({ from: null, to: null })}
            />
          )}
          
          {activeFilterCount > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-7 text-xs text-muted-foreground hover:text-red-600"
            >
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// FILTER CHIP COMPONENT
// =============================================================================

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

const FilterChip = memo(function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-sm">
      <span className="truncate max-w-[150px]">{label}</span>
      <button
        onClick={onRemove}
        className="ml-1 h-4 w-4 rounded-full hover:bg-muted-foreground/20 flex items-center justify-center"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
});

// =============================================================================
// COMPACT TOOLBAR VARIANT
// =============================================================================

export interface OrderToolbarCompactProps {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateOrder?: () => void;
  className?: string;
}

export const OrderToolbarCompact = memo(function OrderToolbarCompact({
  search,
  onSearchChange,
  onCreateOrder,
  className,
}: OrderToolbarCompactProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Search..."
        className="flex-1"
      />
      {onCreateOrder && (
        <Button size="icon" onClick={onCreateOrder} className="h-10 w-10">
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
});

export default OrderToolbar;
