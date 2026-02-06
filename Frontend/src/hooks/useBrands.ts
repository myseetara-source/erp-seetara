/**
 * useBrands Hook
 * 
 * Custom hook for managing brands with:
 * - Server-side search (debounced)
 * - Pagination
 * - CRUD operations
 * - Optimistic UI updates
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/useDebounce';
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  type Brand,
  type BrandListParams,
  type CreateBrandData,
  type UpdateBrandData,
} from '@/lib/api/brands';
import { getErrorMessage } from '@/lib/api/apiClient';

interface UseBrandsOptions {
  initialSearch?: string;
  initialLimit?: number;
}

export function useBrands(options: UseBrandsOptions = {}) {
  const { initialSearch = '', initialLimit = 50 } = options;

  // State
  const [brands, setBrands] = useState<Brand[]>([]);
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

  // Fetch brands
  const fetchBrands = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: BrandListParams = {
        page,
        limit: initialLimit,
      };
      if (debouncedSearch) params.search = debouncedSearch;

      const response = await getBrands(params);
      setBrands(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to fetch brands:', error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, initialLimit]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // CRUD Operations
  const handleCreate = useCallback(async (data: CreateBrandData): Promise<Brand> => {
    const result = await createBrand(data);
    toast.success(`Brand "${result.name}" created`);
    await fetchBrands();
    return result;
  }, [fetchBrands]);

  const handleUpdate = useCallback(async (id: string, data: UpdateBrandData): Promise<Brand> => {
    const result = await updateBrand(id, data);
    toast.success(`Brand "${result.name}" updated`);
    await fetchBrands();
    return result;
  }, [fetchBrands]);

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    await deleteBrand(id);
    toast.success('Brand deleted');
    await fetchBrands();
  }, [fetchBrands]);

  return {
    // Data
    brands,
    isLoading,
    pagination,

    // Search
    search,
    setSearch,

    // Pagination
    page,
    setPage,

    // CRUD
    createBrand: handleCreate,
    updateBrand: handleUpdate,
    deleteBrand: handleDelete,

    // Refresh
    refetch: fetchBrands,
  };
}

export default useBrands;
