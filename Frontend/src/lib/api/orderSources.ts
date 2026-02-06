/**
 * Order Sources API Client
 * 
 * CRUD operations for managing order sources (Facebook Pages / Brands).
 * These are used to track which page/brand an order came from.
 */

import apiClient, { getErrorMessage } from './apiClient';
import { API_ROUTES } from '../routes';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderSource {
  id: string;
  name: string;
  pixel_id: string | null;
  is_active: boolean;
  order_count?: number;
  created_at: string;
  updated_at: string;
}

export interface OrderSourceListParams {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: string;
}

export interface CreateOrderSourceData {
  name: string;
  pixel_id?: string | null;
  is_active?: boolean;
}

export interface UpdateOrderSourceData {
  name?: string;
  pixel_id?: string | null;
  is_active?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: {
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

const ROUTES = API_ROUTES.ORDER_SOURCES;

export async function getOrderSources(params?: OrderSourceListParams) {
  const response = await apiClient.get<ApiResponse<OrderSource[]>>(ROUTES.LIST, { params });
  return response.data;
}

export async function getOrderSource(id: string) {
  const response = await apiClient.get<ApiResponse<OrderSource>>(ROUTES.DETAIL(id));
  return response.data.data;
}

export async function createOrderSource(data: CreateOrderSourceData) {
  const response = await apiClient.post<ApiResponse<OrderSource>>(ROUTES.CREATE, data);
  return response.data.data;
}

export async function updateOrderSource(id: string, data: UpdateOrderSourceData) {
  const response = await apiClient.patch<ApiResponse<OrderSource>>(ROUTES.UPDATE(id), data);
  return response.data.data;
}

export async function deleteOrderSource(id: string) {
  const response = await apiClient.delete<ApiResponse<void>>(ROUTES.DELETE(id));
  return response.data;
}

/**
 * Get active order sources (for dropdowns)
 * Lightweight call that only fetches active sources
 */
export async function getActiveOrderSources(): Promise<OrderSource[]> {
  const response = await apiClient.get<ApiResponse<OrderSource[]>>(ROUTES.LIST, {
    params: { is_active: 'true', limit: 100 },
  });
  return response.data.data || [];
}
