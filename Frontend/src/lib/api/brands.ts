/**
 * Brands API Client
 * Full CRUD operations for product brands.
 */

import apiClient from './apiClient';
import { API_ROUTES } from '@/lib/routes';

// =============================================================================
// TYPES
// =============================================================================

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  product_count?: number;
}

export interface BrandListParams {
  search?: string;
  page?: number;
  limit?: number;
  is_active?: string;
}

export interface CreateBrandData {
  name: string;
  logo_url?: string | null;
  is_active?: boolean;
}

export interface UpdateBrandData {
  name?: string;
  logo_url?: string | null;
  is_active?: boolean;
}

export interface BrandListResponse {
  success: boolean;
  data: Brand[];
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
 * List brands with pagination & search
 */
export async function getBrands(params?: BrandListParams): Promise<BrandListResponse> {
  const response = await apiClient.get(API_ROUTES.BRANDS.LIST, { params });
  return response.data;
}

/**
 * Get a single brand by ID
 */
export async function getBrand(id: string): Promise<Brand> {
  const response = await apiClient.get(API_ROUTES.BRANDS.DETAIL(id));
  return response.data.data;
}

/**
 * Create a new brand
 */
export async function createBrand(data: CreateBrandData): Promise<Brand> {
  const response = await apiClient.post(API_ROUTES.BRANDS.CREATE, data);
  return response.data.data;
}

/**
 * Update a brand
 */
export async function updateBrand(id: string, data: UpdateBrandData): Promise<Brand> {
  const response = await apiClient.patch(API_ROUTES.BRANDS.UPDATE(id), data);
  return response.data.data;
}

/**
 * Delete a brand
 */
export async function deleteBrand(id: string): Promise<void> {
  await apiClient.delete(API_ROUTES.BRANDS.DELETE(id));
}
