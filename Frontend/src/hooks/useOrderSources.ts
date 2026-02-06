/**
 * useOrderSources Hook
 * 
 * Custom hook for managing order sources with:
 * - Server-side search (debounced)
 * - Pagination
 * - CRUD operations
 * - Toast notifications
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/useDebounce';
import {
  getOrderSources,
  createOrderSource,
  updateOrderSource,
  deleteOrderSource,
  type OrderSource,
  type OrderSourceListParams,
  type CreateOrderSourceData,
  type UpdateOrderSourceData,
} from '@/lib/api/orderSources';
import { getErrorMessage } from '@/lib/api/apiClient';

interface UseOrderSourcesOptions {
  initialSearch?: string;
  initialLimit?: number;
}

export function useOrderSources(options: UseOrderSourcesOptions = {}) {
  const { initialSearch = '', initialLimit = 50 } = options;

  // State
  const [sources, setSources] = useState<OrderSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: initialLimit,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });

  const debouncedSearch = useDebounce(search, 400);

  // Fetch sources
  const fetchSources = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: OrderSourceListParams = {
        page,
        limit: initialLimit,
      };
      if (debouncedSearch) params.search = debouncedSearch;

      const response = await getOrderSources(params);
      setSources(response.data || []);
      if (response.pagination) {
        setPagination(response.pagination);
      }
    } catch (error) {
      toast.error('Failed to load order sources');
      console.error('Failed to fetch order sources:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, initialLimit]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Fetch on mount and when deps change
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Create
  const handleCreate = async (data: CreateOrderSourceData) => {
    try {
      const newSource = await createOrderSource(data);
      toast.success(`Order source "${newSource.name}" created`);
      await fetchSources();
      return newSource;
    } catch (error) {
      const message = getErrorMessage(error);
      toast.error(message || 'Failed to create order source');
      throw error;
    }
  };

  // Update
  const handleUpdate = async (id: string, data: UpdateOrderSourceData) => {
    try {
      const updated = await updateOrderSource(id, data);
      toast.success(`Order source "${updated.name}" updated`);
      await fetchSources();
      return updated;
    } catch (error) {
      const message = getErrorMessage(error);
      toast.error(message || 'Failed to update order source');
      throw error;
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    try {
      await deleteOrderSource(id);
      toast.success('Order source deleted');
      await fetchSources();
    } catch (error) {
      const message = getErrorMessage(error);
      toast.error(message || 'Failed to delete order source');
      throw error;
    }
  };

  return {
    sources,
    isLoading,
    pagination,
    search,
    setSearch,
    page,
    setPage,
    createSource: handleCreate,
    updateSource: handleUpdate,
    deleteSource: handleDelete,
    refetch: fetchSources,
  };
}
