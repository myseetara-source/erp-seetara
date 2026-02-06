/**
 * useOrderFilters Hook
 * 
 * Manages filter state for the Orders page with:
 * - Debounced search input
 * - URL query parameter synchronization
 * - Type-safe filter object
 * 
 * @author Code Quality Team
 * @priority P0 - Orders Page Refactoring
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useDebounce } from '@/hooks/useDebounce';
import { PAGINATION } from '@/config/app.config';
import type { OrderStatus, PaymentStatus, FulfillmentType } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Date range filter
 */
export interface DateRange {
  from: Date | null;
  to: Date | null;
}

/**
 * Order filters state
 */
export interface OrderFiltersState {
  search: string;
  status: OrderStatus | 'all';
  paymentStatus: PaymentStatus | 'all';
  fulfillmentType: FulfillmentType | 'all';
  zone: string;
  dateRange: DateRange;
  assignedTo: string;
  riderId: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

/**
 * Filters ready to send to API (excludes 'all' values)
 */
export interface OrderFiltersQuery {
  search?: string;
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  fulfillment_type?: FulfillmentType;
  zone_code?: string;
  date_from?: string;
  date_to?: string;
  assigned_to?: string;
  rider_id?: string;
  page: number;
  limit: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Hook options
 */
export interface UseOrderFiltersOptions {
  /** Sync filters to URL query params */
  syncToUrl?: boolean;
  /** Debounce delay for search in ms */
  searchDebounce?: number;
  /** Default page limit */
  defaultLimit?: number;
  /** Initial filters */
  initialFilters?: Partial<OrderFiltersState>;
}

/**
 * Hook return type
 */
export interface UseOrderFiltersReturn {
  // State
  filters: OrderFiltersState;
  debouncedSearch: string;
  
  // API-ready query
  query: OrderFiltersQuery;
  
  // Setters
  setSearch: (search: string) => void;
  setStatus: (status: OrderStatus | 'all') => void;
  setPaymentStatus: (status: PaymentStatus | 'all') => void;
  setFulfillmentType: (type: FulfillmentType | 'all') => void;
  setZone: (zone: string) => void;
  setDateRange: (range: DateRange) => void;
  setAssignedTo: (userId: string) => void;
  setRiderId: (riderId: string) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  
  // Actions
  resetFilters: () => void;
  resetToFirstPage: () => void;
  
  // Helpers
  hasActiveFilters: boolean;
  activeFilterCount: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_FILTERS: OrderFiltersState = {
  search: '',
  status: 'all',
  paymentStatus: 'all',
  fulfillmentType: 'all',
  zone: '',
  dateRange: { from: null, to: null },
  assignedTo: '',
  riderId: '',
  page: 1,
  limit: PAGINATION.ORDERS_PER_PAGE,
  sortBy: 'created_at',
  sortOrder: 'desc',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse URL search params into filter state
 */
function parseUrlParams(
  searchParams: URLSearchParams,
  defaults: OrderFiltersState
): Partial<OrderFiltersState> {
  const parsed: Partial<OrderFiltersState> = {};
  
  const search = searchParams.get('search');
  if (search) parsed.search = search;
  
  const status = searchParams.get('status') as OrderStatus | 'all' | null;
  if (status) parsed.status = status;
  
  const paymentStatus = searchParams.get('payment_status') as PaymentStatus | 'all' | null;
  if (paymentStatus) parsed.paymentStatus = paymentStatus;
  
  const fulfillmentType = searchParams.get('fulfillment_type') as FulfillmentType | 'all' | null;
  if (fulfillmentType) parsed.fulfillmentType = fulfillmentType;
  
  const zone = searchParams.get('zone');
  if (zone) parsed.zone = zone;
  
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  if (dateFrom || dateTo) {
    parsed.dateRange = {
      from: dateFrom ? new Date(dateFrom) : null,
      to: dateTo ? new Date(dateTo) : null,
    };
  }
  
  const assignedTo = searchParams.get('assigned_to');
  if (assignedTo) parsed.assignedTo = assignedTo;
  
  const riderId = searchParams.get('rider_id');
  if (riderId) parsed.riderId = riderId;
  
  const page = searchParams.get('page');
  if (page) parsed.page = parseInt(page, 10) || defaults.page;
  
  const limit = searchParams.get('limit');
  if (limit) parsed.limit = parseInt(limit, 10) || defaults.limit;
  
  const sortBy = searchParams.get('sort_by');
  if (sortBy) parsed.sortBy = sortBy;
  
  const sortOrder = searchParams.get('sort_order') as 'asc' | 'desc' | null;
  if (sortOrder) parsed.sortOrder = sortOrder;
  
  return parsed;
}

/**
 * Convert filter state to URL search params
 */
function filtersToUrlParams(filters: OrderFiltersState, defaults: OrderFiltersState): URLSearchParams {
  const params = new URLSearchParams();
  
  if (filters.search && filters.search !== defaults.search) {
    params.set('search', filters.search);
  }
  
  if (filters.status !== 'all' && filters.status !== defaults.status) {
    params.set('status', filters.status);
  }
  
  if (filters.paymentStatus !== 'all' && filters.paymentStatus !== defaults.paymentStatus) {
    params.set('payment_status', filters.paymentStatus);
  }
  
  if (filters.fulfillmentType !== 'all' && filters.fulfillmentType !== defaults.fulfillmentType) {
    params.set('fulfillment_type', filters.fulfillmentType);
  }
  
  if (filters.zone && filters.zone !== defaults.zone) {
    params.set('zone', filters.zone);
  }
  
  if (filters.dateRange.from) {
    params.set('date_from', filters.dateRange.from.toISOString().split('T')[0]);
  }
  
  if (filters.dateRange.to) {
    params.set('date_to', filters.dateRange.to.toISOString().split('T')[0]);
  }
  
  if (filters.assignedTo && filters.assignedTo !== defaults.assignedTo) {
    params.set('assigned_to', filters.assignedTo);
  }
  
  if (filters.riderId && filters.riderId !== defaults.riderId) {
    params.set('rider_id', filters.riderId);
  }
  
  if (filters.page !== defaults.page) {
    params.set('page', String(filters.page));
  }
  
  if (filters.limit !== defaults.limit) {
    params.set('limit', String(filters.limit));
  }
  
  if (filters.sortBy !== defaults.sortBy) {
    params.set('sort_by', filters.sortBy);
  }
  
  if (filters.sortOrder !== defaults.sortOrder) {
    params.set('sort_order', filters.sortOrder);
  }
  
  return params;
}

/**
 * Convert filter state to API query format
 */
function filtersToQuery(filters: OrderFiltersState, debouncedSearch: string): OrderFiltersQuery {
  const query: OrderFiltersQuery = {
    page: filters.page,
    limit: filters.limit,
  };
  
  // Only include search if it has a value
  if (debouncedSearch.trim()) {
    query.search = debouncedSearch.trim();
  }
  
  // Only include status if not 'all'
  if (filters.status !== 'all') {
    query.status = filters.status;
  }
  
  if (filters.paymentStatus !== 'all') {
    query.payment_status = filters.paymentStatus;
  }
  
  if (filters.fulfillmentType !== 'all') {
    query.fulfillment_type = filters.fulfillmentType;
  }
  
  if (filters.zone) {
    query.zone_code = filters.zone;
  }
  
  if (filters.dateRange.from) {
    query.date_from = filters.dateRange.from.toISOString();
  }
  
  if (filters.dateRange.to) {
    query.date_to = filters.dateRange.to.toISOString();
  }
  
  if (filters.assignedTo) {
    query.assigned_to = filters.assignedTo;
  }
  
  if (filters.riderId) {
    query.rider_id = filters.riderId;
  }
  
  if (filters.sortBy) {
    query.sort_by = filters.sortBy;
    query.sort_order = filters.sortOrder;
  }
  
  return query;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Custom hook for managing order filters with debounce and URL sync
 * 
 * @example
 * ```tsx
 * const {
 *   filters,
 *   query,
 *   setSearch,
 *   setStatus,
 *   resetFilters,
 *   hasActiveFilters,
 * } = useOrderFilters({ syncToUrl: true });
 * 
 * // Use query for API calls
 * const { data } = useQuery(['orders', query], () => fetchOrders(query));
 * 
 * // Use filters for UI state
 * <Input value={filters.search} onChange={(e) => setSearch(e.target.value)} />
 * ```
 */
export function useOrderFilters(options: UseOrderFiltersOptions = {}): UseOrderFiltersReturn {
  const {
    syncToUrl = false,
    searchDebounce = 500,
    defaultLimit = PAGINATION.ORDERS_PER_PAGE,
    initialFilters = {},
  } = options;
  
  // Navigation hooks (for URL sync)
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Merge defaults with initial filters
  const defaults = useMemo<OrderFiltersState>(() => ({
    ...DEFAULT_FILTERS,
    limit: defaultLimit,
    ...initialFilters,
  }), [defaultLimit, initialFilters]);
  
  // Initialize state from URL params if syncing
  const initialState = useMemo<OrderFiltersState>(() => {
    if (syncToUrl && searchParams) {
      return {
        ...defaults,
        ...parseUrlParams(searchParams, defaults),
      };
    }
    return defaults;
  }, [syncToUrl, searchParams, defaults]);
  
  // Main filter state
  const [filters, setFilters] = useState<OrderFiltersState>(initialState);
  
  // Debounced search value
  const debouncedSearch = useDebounce(filters.search, searchDebounce);
  
  // API-ready query object (memoized)
  const query = useMemo<OrderFiltersQuery>(
    () => filtersToQuery(filters, debouncedSearch),
    [filters, debouncedSearch]
  );
  
  // ==========================================================================
  // URL Sync Effect
  // ==========================================================================
  
  useEffect(() => {
    if (!syncToUrl) return;
    
    const params = filtersToUrlParams(filters, defaults);
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    
    // Use replace to avoid adding to browser history on every filter change
    router.replace(newUrl, { scroll: false });
  }, [filters, syncToUrl, pathname, router, defaults]);
  
  // ==========================================================================
  // Setters (with auto page reset on filter change)
  // ==========================================================================
  
  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({
      ...prev,
      search,
      page: 1, // Reset to first page on search
    }));
  }, []);
  
  const setStatus = useCallback((status: OrderStatus | 'all') => {
    setFilters(prev => ({
      ...prev,
      status,
      page: 1,
    }));
  }, []);
  
  const setPaymentStatus = useCallback((paymentStatus: PaymentStatus | 'all') => {
    setFilters(prev => ({
      ...prev,
      paymentStatus,
      page: 1,
    }));
  }, []);
  
  const setFulfillmentType = useCallback((fulfillmentType: FulfillmentType | 'all') => {
    setFilters(prev => ({
      ...prev,
      fulfillmentType,
      page: 1,
    }));
  }, []);
  
  const setZone = useCallback((zone: string) => {
    setFilters(prev => ({
      ...prev,
      zone,
      page: 1,
    }));
  }, []);
  
  const setDateRange = useCallback((dateRange: DateRange) => {
    setFilters(prev => ({
      ...prev,
      dateRange,
      page: 1,
    }));
  }, []);
  
  const setAssignedTo = useCallback((assignedTo: string) => {
    setFilters(prev => ({
      ...prev,
      assignedTo,
      page: 1,
    }));
  }, []);
  
  const setRiderId = useCallback((riderId: string) => {
    setFilters(prev => ({
      ...prev,
      riderId,
      page: 1,
    }));
  }, []);
  
  const setPage = useCallback((page: number) => {
    setFilters(prev => ({
      ...prev,
      page,
    }));
  }, []);
  
  const setLimit = useCallback((limit: number) => {
    setFilters(prev => ({
      ...prev,
      limit,
      page: 1, // Reset to first page when changing limit
    }));
  }, []);
  
  const setSorting = useCallback((sortBy: string, sortOrder: 'asc' | 'desc') => {
    setFilters(prev => ({
      ...prev,
      sortBy,
      sortOrder,
    }));
  }, []);
  
  // ==========================================================================
  // Actions
  // ==========================================================================
  
  const resetFilters = useCallback(() => {
    setFilters(defaults);
  }, [defaults]);
  
  const resetToFirstPage = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      page: 1,
    }));
  }, []);
  
  // ==========================================================================
  // Helpers
  // ==========================================================================
  
  const hasActiveFilters = useMemo(() => {
    return (
      filters.search !== '' ||
      filters.status !== 'all' ||
      filters.paymentStatus !== 'all' ||
      filters.fulfillmentType !== 'all' ||
      filters.zone !== '' ||
      filters.dateRange.from !== null ||
      filters.dateRange.to !== null ||
      filters.assignedTo !== '' ||
      filters.riderId !== ''
    );
  }, [filters]);
  
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.status !== 'all') count++;
    if (filters.paymentStatus !== 'all') count++;
    if (filters.fulfillmentType !== 'all') count++;
    if (filters.zone) count++;
    if (filters.dateRange.from || filters.dateRange.to) count++;
    if (filters.assignedTo) count++;
    if (filters.riderId) count++;
    return count;
  }, [filters]);
  
  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    // State
    filters,
    debouncedSearch,
    
    // API-ready query
    query,
    
    // Setters
    setSearch,
    setStatus,
    setPaymentStatus,
    setFulfillmentType,
    setZone,
    setDateRange,
    setAssignedTo,
    setRiderId,
    setPage,
    setLimit,
    setSorting,
    
    // Actions
    resetFilters,
    resetToFirstPage,
    
    // Helpers
    hasActiveFilters,
    activeFilterCount,
  };
}

export default useOrderFilters;
