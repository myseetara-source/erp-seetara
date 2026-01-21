/**
 * Product API Functions
 * 
 * Updated to support dynamic JSONB attributes (like Shopify)
 */

import apiClient from './apiClient';
import type { VariantAttributes } from '@/types';

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  
  /** Dynamic attributes - replaces color/size/material */
  attributes: VariantAttributes;
  
  /** @deprecated Use attributes.color instead */
  color?: string;
  /** @deprecated Use attributes.size instead */
  size?: string;
  /** @deprecated Use attributes.material instead */
  material?: string;
  
  cost_price: number;
  selling_price: number;
  mrp?: number;
  current_stock: number;
  reserved_stock: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variants?: ProductVariant[];
  total_stock?: number;
  variant_count?: number;
}

export interface CreateProductData {
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  image_url?: string;
  variants?: Omit<ProductVariant, 'id' | 'product_id'>[];
}

// Mock data with dynamic attributes
const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Classic Cotton T-Shirt',
    brand: 'Seetara',
    category: 'Clothing',
    image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200',
    is_active: true,
    created_at: '2025-12-01T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    total_stock: 245,
    variant_count: 6,
    variants: [
      { id: 'v1', product_id: 'p1', sku: 'TSH-RED-S', attributes: { color: 'Red', size: 'S', material: 'Cotton' }, cost_price: 300, selling_price: 599, current_stock: 45, reserved_stock: 5, is_active: true },
      { id: 'v2', product_id: 'p1', sku: 'TSH-RED-M', attributes: { color: 'Red', size: 'M', material: 'Cotton' }, cost_price: 300, selling_price: 599, current_stock: 60, reserved_stock: 10, is_active: true },
      { id: 'v3', product_id: 'p1', sku: 'TSH-BLU-M', attributes: { color: 'Blue', size: 'M', material: 'Cotton' }, cost_price: 300, selling_price: 599, current_stock: 50, reserved_stock: 3, is_active: true },
    ],
  },
  {
    id: 'p2',
    name: 'Premium Denim Jeans',
    brand: 'TodayTrend',
    category: 'Clothing',
    image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=200',
    is_active: true,
    created_at: '2025-11-15T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
    total_stock: 78,
    variant_count: 4,
    variants: [
      { id: 'v4', product_id: 'p2', sku: 'DNM-BLK-32', attributes: { color: 'Black', size: '32', material: 'Denim' }, cost_price: 800, selling_price: 1499, current_stock: 20, reserved_stock: 2, is_active: true },
      { id: 'v5', product_id: 'p2', sku: 'DNM-BLK-34', attributes: { color: 'Black', size: '34', material: 'Denim' }, cost_price: 800, selling_price: 1499, current_stock: 15, reserved_stock: 0, is_active: true },
    ],
  },
  {
    id: 'p3',
    name: 'MacBook Pro 16"',
    brand: 'Apple',
    category: 'Electronics',
    image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200',
    is_active: true,
    created_at: '2025-10-01T10:00:00Z',
    updated_at: '2025-12-01T10:00:00Z',
    total_stock: 15,
    variant_count: 3,
    variants: [
      { id: 'v6', product_id: 'p3', sku: 'MAC-M3-16-512', attributes: { processor: 'M3 Pro', ram: '16GB', storage: '512GB', color: 'Space Gray' }, cost_price: 180000, selling_price: 249000, current_stock: 5, reserved_stock: 1, is_active: true },
      { id: 'v7', product_id: 'p3', sku: 'MAC-M3-32-1TB', attributes: { processor: 'M3 Max', ram: '32GB', storage: '1TB', color: 'Silver' }, cost_price: 280000, selling_price: 349000, current_stock: 3, reserved_stock: 0, is_active: true },
    ],
  },
  {
    id: 'p4',
    name: 'Gold Diamond Ring',
    brand: 'Seetara Jewels',
    category: 'Jewelry',
    image_url: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=200',
    is_active: true,
    created_at: '2025-09-01T10:00:00Z',
    updated_at: '2025-12-15T10:00:00Z',
    total_stock: 8,
    variant_count: 2,
    variants: [
      { id: 'v8', product_id: 'p4', sku: 'RING-G22-DIA-6', attributes: { metal: '22K Gold', stone: 'Diamond', size: '6' }, cost_price: 45000, selling_price: 65000, current_stock: 4, reserved_stock: 0, is_active: true },
      { id: 'v9', product_id: 'p4', sku: 'RING-G22-DIA-7', attributes: { metal: '22K Gold', stone: 'Diamond', size: '7' }, cost_price: 45000, selling_price: 65000, current_stock: 4, reserved_stock: 1, is_active: true },
    ],
  },
  {
    id: 'p5',
    name: 'Running Sneakers',
    brand: 'SportMax',
    category: 'Footwear',
    image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200',
    is_active: false,
    created_at: '2025-10-01T10:00:00Z',
    updated_at: '2025-12-01T10:00:00Z',
    total_stock: 0,
    variant_count: 2,
  },
];

/**
 * Get all products
 */
export async function getProducts(params?: { 
  search?: string; 
  is_active?: boolean;
  brand?: string;
  category?: string;
}): Promise<Product[]> {
  try {
    const response = await apiClient.get<{ success: boolean; data: Product[] }>('/products', { params });
    return response.data.data || [];
  } catch (error) {
    console.warn('Using mock products', error);
    let products = [...MOCK_PRODUCTS];
    if (params?.search) {
      const search = params.search.toLowerCase();
      products = products.filter(p => 
        p.name.toLowerCase().includes(search) || 
        p.brand?.toLowerCase().includes(search)
      );
    }
    if (params?.is_active !== undefined) {
      products = products.filter(p => p.is_active === params.is_active);
    }
    return products;
  }
}

/**
 * Get product by ID with variants
 */
export async function getProductById(id: string): Promise<Product> {
  try {
    const response = await apiClient.get<{ success: boolean; data: Product }>(`/products/${id}`);
    return response.data.data;
  } catch (error) {
    const product = MOCK_PRODUCTS.find(p => p.id === id);
    if (!product) throw new Error('Product not found');
    return product;
  }
}

/**
 * Create a new product with variants
 */
export async function createProduct(data: CreateProductData): Promise<Product> {
  try {
    const response = await apiClient.post<{ success: boolean; data: Product }>('/products', data);
    return response.data.data;
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK') {
      return {
        id: `mock-${Date.now()}`,
        name: data.name,
        description: data.description,
        brand: data.brand,
        category: data.category,
        image_url: data.image_url,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        variants: data.variants?.map((v, i) => ({
          ...v,
          id: `var-${Date.now()}-${i}`,
          product_id: `mock-${Date.now()}`,
          reserved_stock: 0,
          is_active: true,
        })) as ProductVariant[],
        total_stock: data.variants?.reduce((sum, v) => sum + (v.current_stock || 0), 0) || 0,
        variant_count: data.variants?.length || 0,
      };
    }
    throw error;
  }
}

/**
 * Update product
 */
export async function updateProduct(id: string, data: Partial<CreateProductData>): Promise<Product> {
  try {
    const response = await apiClient.patch<{ success: boolean; data: Product }>(`/products/${id}`, data);
    return response.data.data;
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK') {
      const product = MOCK_PRODUCTS.find(p => p.id === id);
      if (!product) throw new Error('Product not found');
      return { ...product, ...data, updated_at: new Date().toISOString() };
    }
    throw error;
  }
}

/**
 * Toggle product active status
 */
export async function toggleProductStatus(id: string): Promise<Product> {
  try {
    const response = await apiClient.patch<{ success: boolean; data: Product }>(`/products/${id}/toggle-status`);
    return response.data.data;
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK') {
      const product = MOCK_PRODUCTS.find(p => p.id === id);
      if (!product) throw new Error('Product not found');
      return { ...product, is_active: !product.is_active };
    }
    throw error;
  }
}

/**
 * Delete product
 */
export async function deleteProduct(id: string): Promise<void> {
  try {
    await apiClient.delete(`/products/${id}`);
  } catch (error: any) {
    if (error.code !== 'ERR_NETWORK') throw error;
  }
}

/**
 * Upload product image
 */
export async function uploadProductImage(file: File): Promise<{ url: string; key: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'products');

    const response = await apiClient.post<{ success: boolean; data: { url: string; key: string } }>(
      '/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data.data;
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK') {
      // Return placeholder for demo
      return {
        url: URL.createObjectURL(file),
        key: `mock-${Date.now()}`,
      };
    }
    throw error;
  }
}
