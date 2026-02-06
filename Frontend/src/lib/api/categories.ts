/**
 * Categories API Client
 * Full CRUD operations for product categories.
 */

import apiClient from './apiClient';
import { API_ROUTES } from '@/lib/routes';

// =============================================================================
// TYPES
// =============================================================================

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  product_count?: number;
}

export interface CategoryListParams {
  search?: string;
  page?: number;
  limit?: number;
  is_active?: string;
}

export interface CreateCategoryData {
  name: string;
  parent_id?: string | null;
  image_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface UpdateCategoryData {
  name?: string;
  parent_id?: string | null;
  image_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface CategoryListResponse {
  success: boolean;
  data: Category[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * List categories with pagination & search
 */
export async function getCategories(params?: CategoryListParams): Promise<CategoryListResponse> {
  const response = await apiClient.get(API_ROUTES.CATEGORIES.LIST, { params });
  return response.data;
}

/**
 * Get a single category by ID
 */
export async function getCategory(id: string): Promise<Category> {
  const response = await apiClient.get(API_ROUTES.CATEGORIES.DETAIL(id));
  return response.data.data;
}

/**
 * Create a new category
 */
export async function createCategory(data: CreateCategoryData): Promise<Category> {
  const response = await apiClient.post(API_ROUTES.CATEGORIES.CREATE, data);
  return response.data.data;
}

/**
 * Update a category
 */
export async function updateCategory(id: string, data: UpdateCategoryData): Promise<Category> {
  const response = await apiClient.patch(API_ROUTES.CATEGORIES.UPDATE(id), data);
  return response.data.data;
}

/**
 * Delete a category
 */
export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(API_ROUTES.CATEGORIES.DELETE(id));
}
