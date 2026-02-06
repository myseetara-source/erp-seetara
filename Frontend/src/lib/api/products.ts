/**
 * Product API Functions
 * 
 * Type-safe product CRUD operations using database types.
 * 
 * NOTE: Mock data removed for production. API should always be available.
 */

import apiClient from './apiClient';
import type { ApiResponse } from './apiClient';
import type { DbProduct, DbProductVariant } from '@/types/database.types';

// =============================================================================
// TYPES (Aligned with database.types.ts)
// =============================================================================

/**
 * Variant attributes - dynamic key-value pairs
 */
export type VariantAttributes = Record<string, string>;

/**
 * Product variant for API responses
 */
export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  barcode?: string | null;
  
  /** Dynamic attributes - replaces color/size/material */
  attributes: VariantAttributes;
  
  /** @deprecated Use attributes.color instead */
  color?: string | null;
  /** @deprecated Use attributes.size instead */
  size?: string | null;
  /** @deprecated Use attributes.material instead */
  material?: string | null;
  
  weight_grams?: number | null;
  cost_price: number;
  selling_price: number;
  mrp?: number | null;
  current_stock: number;
  damaged_stock?: number;
  reserved_stock: number;
  reorder_level?: number;
  is_active: boolean;
  meta?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Product for API responses
 */
export interface Product {
  id: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
  is_active: boolean;
  
  // Shipping rates (null = use global defaults)
  shipping_inside?: number | null;
  shipping_outside?: number | null;
  
  vendor_id?: string | null;
  meta?: Record<string, unknown>;
  
  created_at: string;
  updated_at: string;
  
  // Computed/joined fields
  variants?: ProductVariant[];
  total_stock?: number;
  variant_count?: number;
}

/**
 * Data for creating a new product
 */
export interface CreateProductData {
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  image_url?: string;
  shipping_inside?: number | null;
  shipping_outside?: number | null;
  vendor_id?: string;
  variants?: Omit<ProductVariant, 'id' | 'product_id' | 'created_at' | 'updated_at'>[];
}

/**
 * Query parameters for listing products
 */
export interface ProductQueryParams {
  search?: string;
  is_active?: boolean;
  brand?: string;
  category?: string;
  page?: number;
  limit?: number;
  include_variants?: boolean;
}

/**
 * Axios error shape for type-safe error handling
 */
interface AxiosErrorShape {
  code?: string;
  message?: string;
  response?: {
    status?: number;
    data?: {
      message?: string;
      error?: { code?: string; message?: string };
    };
  };
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get all products
 */
export async function getProducts(params?: ProductQueryParams): Promise<Product[]> {
  const response = await apiClient.get<ApiResponse<Product[]>>('/products', { params });
  return response.data.data || [];
}

/**
 * Get product by ID with variants
 */
export async function getProductById(id: string): Promise<Product> {
  const response = await apiClient.get<ApiResponse<Product>>(`/products/${id}`);
  return response.data.data;
}

/**
 * Create a new product with variants
 */
export async function createProduct(data: CreateProductData): Promise<Product> {
  const response = await apiClient.post<ApiResponse<Product>>('/products', data);
  return response.data.data;
}

/**
 * Update product
 */
export async function updateProduct(id: string, data: Partial<CreateProductData>): Promise<Product> {
  const response = await apiClient.patch<ApiResponse<Product>>(`/products/${id}`, data);
  return response.data.data;
}

/**
 * Toggle product active status
 */
export async function toggleProductStatus(id: string): Promise<Product> {
  const response = await apiClient.patch<ApiResponse<Product>>(`/products/${id}/toggle-status`);
  return response.data.data;
}

/**
 * Delete product
 */
export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/products/${id}`);
}

/**
 * Upload product image
 */
export async function uploadProductImage(file: File): Promise<{ url: string; key: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'products');

  const response = await apiClient.post<ApiResponse<{ url: string; key: string }>>(
    '/upload',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data;
}

// =============================================================================
// LOW STOCK ALERT (REORDER LEVEL) API FUNCTIONS
// =============================================================================

/**
 * Product stock configuration response
 */
export interface ProductStockConfig {
  id: string;
  name: string;
  image_url?: string | null;
  variants: {
    id: string;
    sku: string;
    attributes: VariantAttributes;
    current_stock: number;
    reorder_level: number | null;
    is_active: boolean;
  }[];
}

/**
 * Reorder level update payload
 */
export interface ReorderLevelUpdate {
  variant_id: string;
  reorder_level: number;
}

/**
 * Get product stock configuration (for Low Stock Alert settings)
 * ADMIN ONLY
 */
export async function getProductStockConfig(productId: string): Promise<ProductStockConfig> {
  const response = await apiClient.get<ApiResponse<ProductStockConfig>>(
    `/products/${productId}/stock-config`
  );
  return response.data.data;
}

/**
 * Update reorder levels for product variants (Low Stock Alert)
 * ADMIN ONLY
 */
export async function updateReorderLevels(
  productId: string, 
  variants: ReorderLevelUpdate[]
): Promise<{ updated: { id: string; sku: string; reorder_level: number }[]; failed: { variant_id: string; error: string }[] }> {
  const response = await apiClient.patch<ApiResponse<{ 
    updated: { id: string; sku: string; reorder_level: number }[]; 
    failed: { variant_id: string; error: string }[] 
  }>>(
    `/products/${productId}/reorder-levels`,
    { variants }
  );
  return response.data.data;
}

// =============================================================================
// TYPE MAPPERS (DbProduct → Product)
// =============================================================================

/**
 * Map database product to frontend product
 * Use when you need to transform raw DB response
 */
export function mapDbProductToProduct(db: DbProduct & { product_variants?: DbProductVariant[] }): Product {
  return {
    id: db.id,
    name: db.name,
    description: db.description,
    brand: db.brand,
    category: db.category,
    image_url: db.image_url,
    is_active: db.is_active,
    shipping_inside: db.shipping_inside,
    shipping_outside: db.shipping_outside,
    vendor_id: db.vendor_id,
    meta: db.meta,
    created_at: db.created_at,
    updated_at: db.updated_at,
    variants: db.product_variants?.map(mapDbVariantToVariant),
    total_stock: db.product_variants?.reduce((sum, v) => sum + v.current_stock, 0),
    variant_count: db.product_variants?.length,
  };
}

/**
 * Map database variant to frontend variant
 */
export function mapDbVariantToVariant(db: DbProductVariant): ProductVariant {
  return {
    id: db.id,
    product_id: db.product_id,
    sku: db.sku,
    barcode: db.barcode,
    attributes: db.attributes,
    color: db.color,
    size: db.size,
    material: db.material,
    weight_grams: db.weight_grams,
    cost_price: db.cost_price,
    selling_price: db.selling_price,
    mrp: db.mrp,
    current_stock: db.current_stock,
    damaged_stock: db.damaged_stock,
    reserved_stock: db.reserved_stock,
    reorder_level: db.reorder_level,
    is_active: db.is_active,
    meta: db.meta,
    created_at: db.created_at,
    updated_at: db.updated_at,
  };
}
