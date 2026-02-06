/**
 * useOrdersOptimized - Drop-in Replacement for Existing Order Fetching
 * 
 * This hook provides the same interface as the existing fetchOrders pattern
 * but uses TanStack Query under the hood for:
 * - Debounced search (500ms)
 * - Server-side pagination
 * - Smart caching
 * - Realtime notifications
 * 
 * Usage (drop-in replacement):
 * ```
 * // Before:
 * const [orders, setOrders] = useState([]);
 * const fetchOrders = useCallback(async () => { ... }, [deps]);
 * useEffect(() => { fetchOrders(); }, [fetchOrders]);
 * 
 * // After:
 * const { orders, isLoading, refetch, ... } = useOrdersOptimized({ search, status, ... });
 * ```
 */

'use client';

import { useMemo } from 'react';
import { useOrders, OrderFilters, OrderListItem } from './useOrders';

// Map frontend location values to backend fulfillment types
const locationToFulfillmentMap: Record<string, string | undefined> = {
  'all': undefined,
  'INSIDE_VALLEY': 'inside_valley',
  'OUTSIDE_VALLEY': 'outside_valley',
  'POS': 'store',
  'inside_valley': 'inside_valley',
  'outside_valley': 'outside_valley',
  'store': 'store',
};

// Map frontend status filters to backend status values
const statusFilterMap: Record<string, string | undefined> = {
  'all': undefined,
  'intake': 'intake',
  'processing': 'confirmed,packed,assigned',
  'dispatched': 'out_for_delivery,shipped,in_transit,handover_to_courier',
  'delivered': 'delivered,store_sale',
  'returns': 'return_initiated,returned,rejected',
};

export interface UseOrdersOptimizedOptions {
  search?: string;
  location?: string; // 'all' | 'INSIDE_VALLEY' | 'OUTSIDE_VALLEY' | 'POS'
  statusFilter?: string; // 'all' | 'intake' | 'processing' | 'dispatched' | 'delivered' | 'returns'
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export function useOrdersOptimized(options: UseOrdersOptimizedOptions = {}) {
  const {
    search,
    location = 'all',
    statusFilter = 'all',
    startDate,
    endDate,
    limit = 25,
  } = options;

  // Convert frontend filter values to backend API format
  const apiFilters: OrderFilters = useMemo(() => ({
    search: search || undefined,
    fulfillmentType: locationToFulfillmentMap[location],
    status: statusFilterMap[statusFilter],
    startDate,
    endDate,
    limit,
  }), [search, location, statusFilter, startDate, endDate, limit]);

  // Use the base useOrders hook
  const ordersHook = useOrders(apiFilters);

  // Return a compatible interface
  return {
    // Data
    orders: ordersHook.orders,
    pagination: ordersHook.pagination,
    
    // Loading states
    isLoading: ordersHook.isLoading,
    isFetching: ordersHook.isFetching,
    
    // Actions
    refetch: ordersHook.refetch,
    fetchOrders: (page: number = 1) => {
      ordersHook.setPage(page);
    },
    
    // Realtime
    newOrderCount: ordersHook.newOrderNotification.count,
    hasNewOrders: ordersHook.hasNewOrders,
    showNewOrders: ordersHook.showNewOrders,
    dismissNewOrders: ordersHook.dismissNewOrders,
    
    // Filter setters (for advanced usage)
    setSearch: ordersHook.setSearch,
    setPage: ordersHook.setPage,
    setStatus: ordersHook.setStatus,
    setFulfillmentType: ordersHook.setFulfillmentType,
  };
}

export default useOrdersOptimized;
