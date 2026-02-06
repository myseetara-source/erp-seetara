/**
 * useCategories Hook
 * 
 * Custom hook for managing categories with:
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
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type Category,
  type CategoryListParams,
  type CreateCategoryData,
  type UpdateCategoryData,
} from '@/lib/api/categories';
import { getErrorMessage } from '@/lib/api/apiClient';

interface UseCategoriesOptions {
  initialSearch?: string;
  initialLimit?: number;
}

export function useCategories(options: UseCategoriesOptions = {}) {
  const { initialSearch = '', initialLimit = 50 } = options;

  // State
  const [categories, setCategories] = useState<Category[]>([]);
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

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: CategoryListParams = {
        page,
        limit: initialLimit,
      };
      if (debouncedSearch) params.search = debouncedSearch;

      const response = await getCategories(params);
      setCategories(response.data);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, initialLimit]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // CRUD Operations
  const handleCreate = useCallback(async (data: CreateCategoryData): Promise<Category> => {
    const result = await createCategory(data);
    toast.success(`Category "${result.name}" created`);
    await fetchCategories();
    return result;
  }, [fetchCategories]);

  const handleUpdate = useCallback(async (id: string, data: UpdateCategoryData): Promise<Category> => {
    const result = await updateCategory(id, data);
    toast.success(`Category "${result.name}" updated`);
    await fetchCategories();
    return result;
  }, [fetchCategories]);

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    await deleteCategory(id);
    toast.success('Category deleted');
    await fetchCategories();
  }, [fetchCategories]);

  return {
    // Data
    categories,
    isLoading,
    pagination,

    // Search
    search,
    setSearch,

    // Pagination
    page,
    setPage,

    // CRUD
    createCategory: handleCreate,
    updateCategory: handleUpdate,
    deleteCategory: handleDelete,

    // Refresh
    refetch: fetchCategories,
  };
}

export default useCategories;
