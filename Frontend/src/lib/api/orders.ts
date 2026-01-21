/**
 * Orders API
 * All order-related API calls
 */

import apiClient, { ApiResponse } from './apiClient';
import type { 
  OrderListItem, 
  OrderStatus, 
  OrderSource,
  Pagination 
} from '@/types';

// Re-export types for convenience
export type { OrderListItem as Order, OrderStatus, OrderSource };

export interface OrderListParams {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  source?: OrderSource;
  fulfillment_type?: 'inside_valley' | 'outside_valley' | 'store';  // FIXED: was 'store_pickup'
  search?: string;
  start_date?: string;
  end_date?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface OrderListResponse {
  orders: OrderListItem[];
  pagination: Pagination;
}

// Mock data for demo/development when backend is unavailable
// Includes Nepal logistics fulfillment types
const MOCK_ORDERS: OrderListItem[] = [
  {
    id: '1',
    order_number: 'ORD-2026-00001',
    customer_name: 'Ram Sharma',
    customer_phone: '9841234567',
    customer_city: 'Kathmandu',
    customer_address: 'Baluwatar, Kathmandu',
    total_amount: 2500,
    status: 'intake',
    source: 'manual',
    fulfillment_type: 'inside_valley',  // Kathmandu = Inside Valley
    vendor_name: null,
    item_count: 2,
    payment_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    order_number: 'ORD-2026-00002',
    customer_name: 'Sita Devi',
    customer_phone: '9856789012',
    customer_city: 'Pokhara',
    customer_address: 'Lakeside, Pokhara',
    total_amount: 4500,
    status: 'packed',
    source: 'todaytrend',
    fulfillment_type: 'outside_valley',  // Pokhara = Outside Valley
    vendor_name: 'Today Trend',
    item_count: 1,
    payment_status: 'partial',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '3',
    order_number: 'ORD-2026-00003',
    customer_name: 'Hari Bahadur',
    customer_phone: '9812345678',
    customer_city: 'Lalitpur',
    customer_address: 'Patan, Lalitpur',
    total_amount: 1800,
    status: 'delivered',
    source: 'manual',
    fulfillment_type: 'inside_valley',  // Lalitpur = Inside Valley
    vendor_name: null,
    rider_name: 'Rajesh Rider',
    item_count: 1,
    payment_status: 'paid',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    updated_at: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: '4',
    order_number: 'ORD-2026-00004',
    customer_name: 'Gita Kumari',
    customer_phone: '9867890123',
    customer_city: 'Bhaktapur',
    customer_address: 'Durbar Square, Bhaktapur',
    total_amount: 3200,
    status: 'packed',
    source: 'seetara',
    fulfillment_type: 'inside_valley',  // Bhaktapur = Inside Valley
    vendor_name: 'Seetara',
    rider_name: 'Kumar Delivery',  // Rider already assigned
    item_count: 3,
    payment_status: 'pending',
    created_at: new Date(Date.now() - 43200000).toISOString(),
    updated_at: new Date(Date.now() - 43200000).toISOString(),
  },
  {
    id: '5',
    order_number: 'ORD-2026-00005',
    customer_name: 'Krishna KC',
    customer_phone: '9823456789',
    customer_city: 'Chitwan',
    customer_address: 'Bharatpur, Chitwan',
    total_amount: 5500,
    status: 'follow_up',  // FIXED: was 'followup'
    source: 'shopify',
    fulfillment_type: 'outside_valley',  // Chitwan = Outside Valley
    vendor_name: 'Shopify Store',
    item_count: 1,
    payment_status: 'pending',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '6',
    order_number: 'ORD-2026-00006',
    customer_name: 'Binod Thapa',
    customer_phone: '9745678901',
    customer_city: 'Butwal',
    customer_address: 'Golpark, Butwal',
    total_amount: 7800,
    status: 'handover_to_courier',
    source: 'manual',
    fulfillment_type: 'outside_valley',  // Butwal = Outside Valley
    vendor_name: null,
    courier_partner: 'NCM Express',
    courier_tracking_id: 'NCM123456789',
    item_count: 4,
    payment_status: 'paid',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    updated_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: '7',
    order_number: 'ORD-2026-00007',
    customer_name: 'Store Customer',
    customer_phone: '9800000001',
    customer_city: 'Kathmandu',
    customer_address: 'Store Counter',
    total_amount: 1500,
    status: 'store_sale',
    source: 'store',
    fulfillment_type: 'store',  // Walk-in customer (FIXED from store_pickup)
    vendor_name: null,
    item_count: 1,
    payment_status: 'paid',
    created_at: new Date(Date.now() - 1800000).toISOString(),
    updated_at: new Date(Date.now() - 1800000).toISOString(),
  },
];

/**
 * Fetch all orders with optional filters
 * GET /api/v1/orders
 * Falls back to mock data if API is unavailable (for demo purposes)
 */
export async function getOrders(params: OrderListParams = {}): Promise<OrderListResponse> {
  try {
    const response = await apiClient.get<ApiResponse<Order[]>>('/orders', { params });
    
    return {
      orders: response.data.data,
      pagination: response.data.pagination || {
        page: 1,
        limit: 20,
        total: response.data.data.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    };
  } catch (error) {
    // Fallback to mock data for demo purposes
    console.warn('API unavailable, using mock data:', error);
    
    let filteredOrders = [...MOCK_ORDERS];
    
    // Apply status filter
    if (params.status) {
      filteredOrders = filteredOrders.filter(o => o.status === params.status);
    }
    
    // Apply fulfillment type filter (Nepal Logistics)
    if (params.fulfillment_type) {
      filteredOrders = filteredOrders.filter(o => o.fulfillment_type === params.fulfillment_type);
    }
    
    // Apply search filter
    if (params.search) {
      const search = params.search.toLowerCase();
      filteredOrders = filteredOrders.filter(o => 
        o.order_number.toLowerCase().includes(search) ||
        o.customer_name.toLowerCase().includes(search) ||
        o.customer_phone.includes(search)
      );
    }
    
    return {
      orders: filteredOrders,
      pagination: {
        page: params.page || 1,
        limit: params.limit || 20,
        total: filteredOrders.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    };
  }
}

/**
 * Fetch single order by ID
 * GET /api/v1/orders/:id
 */
export async function getOrderById(id: string): Promise<Order> {
  const response = await apiClient.get<ApiResponse<Order>>(`/orders/${id}`);
  return response.data.data;
}

/**
 * Update order status
 * PATCH /api/v1/orders/:id/status
 */
export async function updateOrderStatus(
  id: string, 
  status: OrderStatus, 
  reason?: string
): Promise<Order> {
  const response = await apiClient.patch<ApiResponse<Order>>(`/orders/${id}/status`, {
    status,
    reason,
  });
  return response.data.data;
}

/**
 * Create new order
 * POST /api/v1/orders
 */
export async function createOrder(data: {
  customer: {
    name: string;
    phone: string;
    address_line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  items: Array<{
    variant_id: string;
    quantity: number;
    unit_price?: number;
  }>;
  source?: string;
}): Promise<Order> {
  const response = await apiClient.post<ApiResponse<Order>>('/orders', data);
  return response.data.data;
}

/**
 * Bulk update order status
 * POST /api/v1/orders/bulk/status
 */
export async function bulkUpdateStatus(
  orderIds: string[],
  status: OrderStatus,
  reason?: string
): Promise<{ success: string[]; failed: Array<{ orderId: string; error: string }> }> {
  const response = await apiClient.post('/orders/bulk/status', {
    order_ids: orderIds,
    status,
    reason,
  });
  return response.data.data;
}
