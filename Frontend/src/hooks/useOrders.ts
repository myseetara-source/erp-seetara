/**
 * useOrders Hook - Optimized Order Management
 * 
 * Architecture: Server-Side Pagination + Full-Text Search + React Query
 * 
 * Features:
 * - 500ms debounced search (prevents API spam)
 * - Server-side pagination (no client memory bloat)
 * - keepPreviousData (prevents flickering)
 * - Smart caching with stale-while-revalidate
 * - Realtime notification badge (not auto-refetch)
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Performance Critical
 */

'use client';

import { useQuery, useQueryClient, useMutation, useIsFetching } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import apiClient from '@/lib/api/apiClient';
import { createClient } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderFilters {
  search?: string;
  status?: string;
  fulfillmentType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface OrderListItem {
  id: string;
  readable_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  delivery_address?: string;
  delivery_city?: string;
  status: string;
  fulfillment_type: string;
  total_amount: number;
  payment_status: string;
  created_at: string;
  items?: any[];
  customer?: any;
  // Exchange/refund analysis
  exchange_status?: string;
  parent_order_id?: string;
  
  // P0 FIX: Logistics fields - CRITICAL for D2B/D2D badge display
  courier_partner?: string;
  destination_branch?: string;
  zone_code?: string;
  rider_id?: string;
  rider_name?: string;
  delivery_type?: 'D2D' | 'D2B' | null;  // D2D = Home, D2B = Branch Pickup
  is_logistics_synced?: boolean;
  external_order_id?: string;
  logistics_provider?: string;
  logistics_synced_at?: string;
}

export interface OrdersResponse {
  data: OrderListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface NewOrderNotification {
  count: number;
  lastOrderId: string | null;
  timestamp: Date | null;
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: OrderFilters) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
  stats: () => [...orderKeys.all, 'stats'] as const,
};

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchOrders(filters: OrderFilters): Promise<OrdersResponse> {
  const params = new URLSearchParams();
  
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.fulfillmentType) params.set('fulfillmentType', filters.fulfillmentType);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  
  const response = await apiClient.get(`/orders?${params.toString()}`);
  return response.data;
}

async function updateOrderStatus(orderId: string, data: { status: string; reason?: string }) {
  const response = await apiClient.patch(`/orders/${orderId}/status`, data);
  return response.data;
}

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useOrders(initialFilters: OrderFilters = {}) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // =========================================================================
  // STATE
  // =========================================================================
  
  // P1 PERFORMANCE FIX: Default 50 rows for optimal pagination
  const [filters, setFilters] = useState<OrderFilters>({
    page: 1,
    limit: 50,
    sortBy: 'created_at',
    sortOrder: 'desc',
    ...initialFilters,
  });
  
  // New order notification state
  const [newOrderNotification, setNewOrderNotification] = useState<NewOrderNotification>({
    count: 0,
    lastOrderId: null,
    timestamp: null,
  });
  
  // Debounce search to prevent API spam (500ms)
  const debouncedSearch = useDebounce(filters.search || '', 500);
  
  // Effective filters with debounced search
  const effectiveFilters = {
    ...filters,
    search: debouncedSearch,
  };

  // =========================================================================
  // MAIN QUERY
  // =========================================================================
  
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: orderKeys.list(effectiveFilters),
    queryFn: () => fetchOrders(effectiveFilters),
    // Keep previous data while fetching new data (prevents flickering)
    placeholderData: (previousData) => previousData,
    // Stale after 30 seconds
    staleTime: 30 * 1000,
    // Garbage collect after 5 minutes
    gcTime: 5 * 60 * 1000,
  });

  // =========================================================================
  // PREFETCH NEXT PAGE (Target: <250ms perceived latency)
  // =========================================================================
  
  useEffect(() => {
    const currentPage = effectiveFilters.page || 1;
    const totalPages = data?.pagination?.totalPages || 1;
    
    // Prefetch next page if it exists
    if (currentPage < totalPages) {
      const nextPageFilters = { ...effectiveFilters, page: currentPage + 1 };
      queryClient.prefetchQuery({
        queryKey: orderKeys.list(nextPageFilters),
        queryFn: () => fetchOrders(nextPageFilters),
        staleTime: 30 * 1000,
      });
    }
    
    // Also prefetch previous page if we're beyond page 1
    if (currentPage > 1) {
      const prevPageFilters = { ...effectiveFilters, page: currentPage - 1 };
      queryClient.prefetchQuery({
        queryKey: orderKeys.list(prevPageFilters),
        queryFn: () => fetchOrders(prevPageFilters),
        staleTime: 30 * 1000,
      });
    }
  }, [data?.pagination?.totalPages, effectiveFilters, queryClient]);

  // =========================================================================
  // STATUS UPDATE MUTATION
  // =========================================================================
  
  const statusMutation = useMutation({
    mutationFn: ({ orderId, status, reason }: { orderId: string; status: string; reason?: string }) =>
      updateOrderStatus(orderId, { status, reason }),
    onSuccess: () => {
      // Invalidate and refetch orders list
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });

  // =========================================================================
  // FILTER SETTERS
  // =========================================================================
  
  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search, page: 1 })); // Reset to page 1 on search
  }, []);
  
  const setStatus = useCallback((status: string | undefined) => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
  }, []);
  
  const setFulfillmentType = useCallback((fulfillmentType: string | undefined) => {
    setFilters(prev => ({ ...prev, fulfillmentType, page: 1 }));
  }, []);
  
  const setDateRange = useCallback((startDate?: string, endDate?: string) => {
    setFilters(prev => ({ ...prev, startDate, endDate, page: 1 }));
  }, []);
  
  const setPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }));
  }, []);
  
  const setLimit = useCallback((limit: number) => {
    setFilters(prev => ({ ...prev, limit, page: 1 }));
  }, []);
  
  const setSorting = useCallback((sortBy: string, sortOrder: 'asc' | 'desc') => {
    setFilters(prev => ({ ...prev, sortBy, sortOrder }));
  }, []);
  
  const resetFilters = useCallback(() => {
    setFilters({
      page: 1,
      limit: 50,
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
  }, []);

  // =========================================================================
  // REALTIME: Notification Badge Strategy
  // Instead of auto-refetching on every INSERT (expensive), we show a badge
  // =========================================================================
  
  useEffect(() => {
    // Setup realtime subscription for new orders
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('[useOrders] New order detected:', payload.new.readable_id);
          
          // Increment notification count instead of auto-refetching
          setNewOrderNotification(prev => ({
            count: prev.count + 1,
            lastOrderId: payload.new.id,
            timestamp: new Date(),
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          // For updates, we could optionally update the cache
          // But for now, just log it
          console.log('[useOrders] Order updated:', payload.new.readable_id, payload.new.status);
        }
      )
      .subscribe((status) => {
        console.log('[useOrders] Realtime subscription status:', status);
      });
    
    channelRef.current = channel;
    
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase]);

  // =========================================================================
  // NEW ORDERS HANDLER
  // =========================================================================
  
  const showNewOrders = useCallback(() => {
    // Reset notification count
    setNewOrderNotification({
      count: 0,
      lastOrderId: null,
      timestamp: null,
    });
    
    // Go to first page and refetch
    setFilters(prev => ({ ...prev, page: 1 }));
    refetch();
  }, [refetch]);
  
  const dismissNewOrders = useCallback(() => {
    setNewOrderNotification({
      count: 0,
      lastOrderId: null,
      timestamp: null,
    });
  }, []);

  // =========================================================================
  // RETURN
  // =========================================================================
  
  // Build pagination with hasNext/hasPrev
  const paginationData = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 };
  const fullPagination = {
    ...paginationData,
    hasNext: paginationData.page < paginationData.totalPages,
    hasPrev: paginationData.page > 1,
  };
  
  return {
    // Data
    orders: data?.data || [],
    pagination: fullPagination,
    
    // Loading states
    isLoading,
    isFetching,
    isError,
    error,
    
    // Filters
    filters,
    setSearch,
    setStatus,
    setFulfillmentType,
    setDateRange,
    setPage,
    setLimit,
    setSorting,
    resetFilters,
    
    // Actions
    refetch,
    updateStatus: statusMutation.mutate,
    isUpdatingStatus: statusMutation.isPending,
    
    // Realtime notifications
    newOrderNotification,
    showNewOrders,
    dismissNewOrders,
    hasNewOrders: newOrderNotification.count > 0,
  };
}

// =============================================================================
// SINGLE ORDER HOOK
// =============================================================================

export function useOrder(orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(orderId || ''),
    queryFn: async () => {
      if (!orderId) return null;
      const response = await apiClient.get(`/orders/${orderId}`);
      return response.data.data || response.data;
    },
    enabled: !!orderId,
    staleTime: 30 * 1000,
  });
}

// =============================================================================
// ORDER STATS HOOK
// =============================================================================

export function useOrderStats() {
  return useQuery({
    queryKey: orderKeys.stats(),
    queryFn: async () => {
      const response = await apiClient.get('/orders/stats');
      return response.data.data || response.data;
    },
    staleTime: 60 * 1000, // Stats are less time-sensitive
  });
}

// =============================================================================
// OPTIMISTIC UPDATE HOOK
// =============================================================================

/**
 * Hook to optimistically update an order in the cache
 * 
 * @returns Function to update order in cache optimistically
 * 
 * @usage
 * ```tsx
 * const optimisticUpdate = useOrderOptimisticUpdate();
 * 
 * // When user changes status:
 * optimisticUpdate(orderId, { status: 'packed' });
 * ```
 */
export function useOrderOptimisticUpdate() {
  const queryClient = useQueryClient();
  
  return useCallback((orderId: string, updates: Partial<OrderListItem>) => {
    // Update all order list queries that might contain this order
    queryClient.setQueriesData<OrdersResponse>(
      { queryKey: orderKeys.lists() },
      (oldData) => {
        if (!oldData?.data) return oldData;
        
        return {
          ...oldData,
          data: oldData.data.map((order) =>
            order.id === orderId ? { ...order, ...updates } : order
          ),
        };
      }
    );
    
    // Also update the detail query if it exists
    queryClient.setQueryData<OrderListItem>(
      orderKeys.detail(orderId),
      (oldData) => oldData ? { ...oldData, ...updates } : oldData
    );
  }, [queryClient]);
}

// =============================================================================
// CACHE INVALIDATION HELPERS
// =============================================================================

/**
 * Hook to invalidate order queries (useful after mutations)
 */
export function useInvalidateOrders() {
  const queryClient = useQueryClient();
  
  return useCallback(async (orderId?: string) => {
    // Invalidate list queries
    await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    
    // If specific order, invalidate its detail query
    if (orderId) {
      await queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
    }
    
    // Invalidate stats
    await queryClient.invalidateQueries({ queryKey: orderKeys.stats() });
  }, [queryClient]);
}

export default useOrders;
