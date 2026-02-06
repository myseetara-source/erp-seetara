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

/**
 * Fetch all orders with optional filters
 * GET /api/v1/orders
 * 
 * Note: No mock data fallback - always fetch from real API
 */
export async function getOrders(params: OrderListParams = {}): Promise<OrderListResponse> {
  const response = await apiClient.get<ApiResponse<Order[]>>('/orders', { params });
  
  return {
    orders: response.data.data || [],
    pagination: response.data.pagination || {
      page: params.page || 1,
      limit: params.limit || 20,
      total: response.data.data?.length || 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
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

// =============================================================================
// POS RECONCILIATION (Exchange/Refund)
// =============================================================================

export interface POSOrderItem {
  id?: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  product_name?: string;
  variant_name?: string;
  sku?: string;
  total_price?: number;
}

export interface POSOrderForReconcile {
  id: string;
  order_number: string;
  readable_id?: string;
  status: string;
  fulfillment_type: string;
  customer_id: string;
  subtotal: number;
  total_amount: number;
  discount_amount: number;
  shipping_name: string;
  shipping_phone: string;
  created_at: string;
  items: POSOrderItem[];
}

export interface ReconcileRequest {
  original_order_id: string;
  reason: string;  // Compulsory reason for exchange/refund
  return_items: Array<{
    variant_id: string;
    quantity: number;
    unit_price: number;
  }>;
  new_items: Array<{
    variant_id: string;
    quantity: number;
    unit_price: number;
    product_name?: string;
    variant_name?: string;
    sku?: string;
  }>;
}

export interface ReconcileResponse {
  reconciliation_order: {
    id: string;
    order_number: string;
    readable_id?: string;
  };
  original_order_id: string;
  transaction_type: 'exchange' | 'refund' | 'addon';
  financials: {
    return_total: number;
    new_total: number;
    net_amount: number;
    customer_owes: number;
    refund_due: number;
  };
  items_returned: number;
  items_added: number;
}

/**
 * Get order details for POS reconciliation
 * GET /api/v1/pos/order/:id
 */
export async function getPOSOrderForReconcile(orderId: string): Promise<POSOrderForReconcile> {
  const response = await apiClient.get<ApiResponse<POSOrderForReconcile>>(`/pos/order/${orderId}`);
  return response.data.data;
}

/**
 * Process POS Exchange or Refund
 * POST /api/v1/pos/reconcile
 */
export async function reconcilePOS(data: ReconcileRequest): Promise<ReconcileResponse> {
  const response = await apiClient.post<ApiResponse<ReconcileResponse>>('/pos/reconcile', data);
  return response.data.data;
}
