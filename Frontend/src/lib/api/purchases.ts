/**
 * Purchase API Functions
 * Handles stock injection via vendor purchases
 */

import apiClient from './apiClient';

// Types
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

// Mock data for development
const MOCK_VENDORS: Vendor[] = [
  { id: 'v1', name: 'Supplier A', phone: '9841000001', company_name: 'ABC Trading', balance: 50000 },
  { id: 'v2', name: 'Supplier B', phone: '9841000002', company_name: 'XYZ Wholesale', balance: 25000 },
  { id: 'v3', name: 'Supplier C', phone: '9841000003', company_name: 'Nepal Imports', balance: 0 },
];

const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Classic T-Shirt',
    brand: 'Seetara',
    category: 'Clothing',
    variants: [
      { id: 'pv1', sku: 'TSH-RED-M', color: 'Red', size: 'M', current_stock: 50, cost_price: 300, selling_price: 599, product: { id: 'p1', name: 'Classic T-Shirt' } },
      { id: 'pv2', sku: 'TSH-RED-L', color: 'Red', size: 'L', current_stock: 30, cost_price: 300, selling_price: 599, product: { id: 'p1', name: 'Classic T-Shirt' } },
      { id: 'pv3', sku: 'TSH-BLU-M', color: 'Blue', size: 'M', current_stock: 45, cost_price: 300, selling_price: 599, product: { id: 'p1', name: 'Classic T-Shirt' } },
    ],
  },
  {
    id: 'p2',
    name: 'Denim Jeans',
    brand: 'Seetara',
    category: 'Clothing',
    variants: [
      { id: 'pv4', sku: 'DNM-BLK-32', color: 'Black', size: '32', current_stock: 20, cost_price: 800, selling_price: 1499, product: { id: 'p2', name: 'Denim Jeans' } },
      { id: 'pv5', sku: 'DNM-BLK-34', color: 'Black', size: '34', current_stock: 15, cost_price: 800, selling_price: 1499, product: { id: 'p2', name: 'Denim Jeans' } },
    ],
  },
  {
    id: 'p3',
    name: 'Sneakers Pro',
    brand: 'TodayTrend',
    category: 'Footwear',
    variants: [
      { id: 'pv6', sku: 'SNK-WHT-42', color: 'White', size: '42', current_stock: 10, cost_price: 1200, selling_price: 2299, product: { id: 'p3', name: 'Sneakers Pro' } },
      { id: 'pv7', sku: 'SNK-WHT-43', color: 'White', size: '43', current_stock: 8, cost_price: 1200, selling_price: 2299, product: { id: 'p3', name: 'Sneakers Pro' } },
    ],
  },
];

/**
 * Get all vendors
 */
export async function getVendors(): Promise<Vendor[]> {
  try {
    const response = await apiClient.get<{ success: boolean; data: Vendor[] }>('/vendors');
    return response.data.data || [];
  } catch (error) {
    console.warn('Using mock vendors', error);
    return MOCK_VENDORS;
  }
}

/**
 * Get all products with variants
 */
export async function getProducts(): Promise<Product[]> {
  try {
    const response = await apiClient.get<{ success: boolean; data: Product[] }>('/products', {
      params: { include_variants: true },
    });
    return response.data.data || [];
  } catch (error) {
    console.warn('Using mock products', error);
    return MOCK_PRODUCTS;
  }
}

/**
 * Get all variants (flattened)
 */
export async function getVariants(): Promise<ProductVariant[]> {
  try {
    const response = await apiClient.get<{ success: boolean; data: ProductVariant[] }>('/variants');
    return response.data.data || [];
  } catch (error) {
    console.warn('Using mock variants', error);
    // Flatten mock products to variants
    return MOCK_PRODUCTS.flatMap(p => p.variants || []);
  }
}

/**
 * Create a new purchase
 */
export async function createPurchase(data: CreatePurchaseData): Promise<Purchase> {
  try {
    const response = await apiClient.post<{ success: boolean; data: Purchase; message: string }>(
      '/purchases',
      data
    );
    return response.data.data;
  } catch (error: any) {
    // For demo, simulate success
    if (error.code === 'ERR_NETWORK' || error.response?.status === 500) {
      console.warn('API unavailable, simulating purchase creation');
      return {
        id: `mock-${Date.now()}`,
        supply_number: `SUP-2026-${String(Math.floor(Math.random() * 100000)).padStart(6, '0')}`,
        vendor_id: data.vendor_id,
        total_amount: data.items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0),
        paid_amount: 0,
        status: 'received',
        invoice_number: data.invoice_number,
        created_at: new Date().toISOString(),
      };
    }
    throw error;
  }
}

/**
 * Get purchase list
 */
export async function getPurchases(params?: {
  page?: number;
  limit?: number;
  vendor_id?: string;
}): Promise<{ data: Purchase[]; pagination: any }> {
  try {
    const response = await apiClient.get('/purchases', { params });
    return response.data;
  } catch (error) {
    console.warn('Using empty purchase list', error);
    return { data: [], pagination: { page: 1, limit: 20, total: 0 } };
  }
}
