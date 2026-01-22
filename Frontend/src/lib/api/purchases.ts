/**
 * Purchase API Functions
 * Handles stock injection via vendor purchases
 * 
 * NOTE: Mock data removed - API should always be available in production
 */

import apiClient from './apiClient';
import type { ApiResponse } from './apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  company_name?: string;
  balance?: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  color?: string;
  size?: string;
  current_stock: number;
  cost_price: number;
  selling_price: number;
  product?: {
    id: string;
    name: string;
    image_url?: string;
  };
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  variants?: ProductVariant[];
}

export interface PurchaseItem {
  variant_id: string;
  quantity: number;
  unit_cost: number;
}

export interface CreatePurchaseData {
  vendor_id: string;
  invoice_number?: string;
  invoice_date?: string;
  notes?: string;
  items: PurchaseItem[];
}

export interface Purchase {
  id: string;
  supply_number: string;
  vendor_id: string;
  vendor?: Vendor;
  total_amount: number;
  paid_amount: number;
  status: string;
  invoice_number?: string;
  created_at: string;
}

export interface PurchasePagination {
  page: number;
  limit: number;
  total: number;
  totalPages?: number;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get all vendors
 */
export async function getVendors(): Promise<Vendor[]> {
  const response = await apiClient.get<ApiResponse<Vendor[]>>('/vendors');
  return response.data.data || [];
}

/**
 * Get all products with variants
 */
export async function getProducts(): Promise<Product[]> {
  const response = await apiClient.get<ApiResponse<Product[]>>('/products', {
    params: { include_variants: true },
  });
  return response.data.data || [];
}

/**
 * Get all variants (flattened)
 */
export async function getVariants(): Promise<ProductVariant[]> {
  const response = await apiClient.get<ApiResponse<ProductVariant[]>>('/variants');
  return response.data.data || [];
}

/**
 * Create a new purchase
 */
export async function createPurchase(data: CreatePurchaseData): Promise<Purchase> {
  const response = await apiClient.post<ApiResponse<Purchase>>(
    '/purchases',
    data
  );
  return response.data.data;
}

/**
 * Get purchase list
 */
export async function getPurchases(params?: {
  page?: number;
  limit?: number;
  vendor_id?: string;
}): Promise<{ data: Purchase[]; pagination: PurchasePagination }> {
  const response = await apiClient.get<{
    success: boolean;
    data: Purchase[];
    pagination: PurchasePagination;
  }>('/purchases', { params });
  return response.data;
}
