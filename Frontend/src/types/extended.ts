/**
 * Extended Type Definitions
 * 
 * P1 Code Quality Fix: These types replace `any` usages throughout the codebase.
 * Import these types to ensure type safety.
 * 
 * @author Code Quality Team
 * @priority P1 - Code Quality
 */

import type { OrderStatus, PaymentStatus, FulfillmentType } from './order';

// =============================================================================
// ORDER ITEM TYPES
// =============================================================================

/**
 * Order item as returned from API
 * Used in: order lists, order details, order forms
 */
export interface OrderItem {
  id: string;
  order_id: string;
  variant_id: string;
  product_id?: string;
  quantity: number;
  selling_price: number;
  cost_price?: number; // Admin only
  
  // Product info (joined)
  product_name?: string;
  product_title?: string;
  variant_name?: string;
  sku?: string;
  image_url?: string;
  
  // Vendor info
  vendor_id?: string;
  vendor_name?: string;
  
  // Computed
  line_total?: number;
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

/**
 * Order item for form input
 * Used in: NewOrderModal, QuickOrderForm, QuickCreatePanel
 */
export interface OrderFormItem {
  variant_id: string;
  product_id: string;
  quantity: number;
  selling_price: number;
  cost_price?: number;
  
  // Display info (for UI)
  product_name: string;
  variant_name: string;
  sku: string;
  image_url?: string;
  current_stock?: number;
  
  // Vendor info
  vendor_id?: string;
  vendor_name?: string;
}

// =============================================================================
// CUSTOMER TYPES
// =============================================================================

/**
 * Customer as returned from API
 */
export interface Customer {
  id: string;
  name: string;
  phone: string;
  alt_phone?: string;
  email?: string;
  address?: string;
  city?: string;
  landmark?: string;
  zone_code?: string;
  
  // Stats
  total_orders?: number;
  total_spent?: number;
  average_order_value?: number;
  last_order_date?: string;
  
  // Flags
  is_blocked?: boolean;
  is_verified?: boolean;
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

/**
 * Customer info embedded in order
 */
export interface OrderCustomer {
  id?: string;
  name: string;
  phone: string;
  alt_phone?: string;
  address?: string;
  city?: string;
  landmark?: string;
}

// =============================================================================
// ORDER TYPES (EXTENDED)
// =============================================================================

/**
 * Order as returned from list API
 * Includes all fields that may be accessed via `order as any`
 */
export interface OrderListItem {
  id: string;
  order_id: string;
  readable_id?: string;
  order_number?: string;
  
  // Customer info
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  alt_phone?: string;
  shipping_name?: string;
  shipping_phone?: string;
  shipping_address?: string;
  shipping_city?: string;
  city?: string;
  landmark?: string;
  
  // Status
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_type: FulfillmentType;
  location?: 'INSIDE_VALLEY' | 'OUTSIDE_VALLEY' | 'POS' | 'all';
  
  // Amounts
  subtotal: number;
  delivery_charge: number;
  shipping_cost?: number;
  discount?: number;
  total_amount: number;
  collected_amount?: number;
  paid_amount?: number;
  due_amount?: number;
  cod_amount?: number;
  
  // Delivery info
  zone_code?: string;
  destination_branch?: string;
  rider_id?: string;
  rider_name?: string;
  rider_phone?: string;
  rider_code?: string;
  assigned_rider?: { id?: string; name: string; phone: string; code?: string };
  
  // Staff info
  created_by?: string;
  assigned_to?: string;
  staff_remarks?: string;
  remarks?: string;
  vendor_name?: string;
  
  // Items (may be included)
  items?: OrderItem[];
  item_count?: number | { count: number };
  total_quantity?: number;
  
  // Courier info
  courier_partner?: string;
  courier_tracking_id?: string;
  awb_number?: string;
  tracking_url?: string;
  
  // P0 FIX: NCM delivery type (D2D = Home Delivery, D2B = Branch Pickup)
  delivery_type?: 'D2D' | 'D2B' | null;
  
  // Logistics sync fields
  is_logistics_synced?: boolean;
  external_order_id?: string;
  logistics_provider?: string;
  logistics_synced_at?: string;
  
  // Exchange/Return info
  parent_order_id?: string;
  is_exchange?: boolean;
  is_exchange_child?: boolean;
  is_refund_only?: boolean;
  has_new_items?: boolean;
  has_exchange_children?: boolean;
  exchange_status?: string;
  exchange_children?: OrderListItem[];
  
  // Timestamps
  created_at: string;
  updated_at?: string;
  delivered_at?: string;
  dispatched_at?: string;
  
  // Computed fields
  customer?: OrderCustomer;
  
  // Delivery metadata
  delivery_metadata?: Record<string, unknown>;
  payment_method?: string;
}

/**
 * Order detail (full order with all relations)
 */
export interface OrderDetail extends OrderListItem {
  items: OrderItem[];
  customer: Customer;
  activities?: OrderActivity[];
  timeline?: OrderTimelineEntry[];
  logs?: OrderLog[];
}

/**
 * Order activity entry
 */
export interface OrderActivity {
  id: string;
  order_id: string;
  action: string;
  description?: string;
  old_value?: string;
  new_value?: string;
  performed_by?: string;
  performer_name?: string;
  created_at: string;
}

/**
 * Order timeline entry
 */
export interface OrderTimelineEntry {
  id: string;
  order_id: string;
  status: OrderStatus;
  note?: string;
  created_at: string;
  created_by?: string;
  performer_name?: string;
}

/**
 * Order log entry
 */
export interface OrderLog {
  id: string;
  order_id: string;
  field: string;
  old_value?: string;
  new_value?: string;
  changed_by?: string;
  changer_name?: string;
  created_at: string;
}

// =============================================================================
// PRODUCT TYPES
// =============================================================================

/**
 * Product variant
 */
export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  
  // Prices
  cost_price: number;
  selling_price: number;
  compare_at_price?: number;
  
  // Stock
  current_stock: number;
  reserved_stock?: number;
  available_stock?: number;
  low_stock_threshold?: number;
  
  // Attributes
  attributes?: Record<string, string>;
  
  // Images
  image_url?: string;
  images?: string[];
  
  // Flags
  is_active?: boolean;
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

/**
 * Product for search/select dropdowns
 */
export interface ProductOption {
  id: string;
  title: string;
  sku?: string;
  vendor_id?: string;
  vendor_name?: string;
  category_id?: string;
  category_name?: string;
  image_url?: string;
  
  // Variants
  variants?: ProductVariant[];
  variant_count?: number;
  
  // Flags
  is_active?: boolean;
  has_variants?: boolean;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Generic API response wrapper
 * Use this to type all API responses consistently
 * 
 * @example
 * ```ts
 * const response = await api.get<ApiResponse<Order>>('/orders/123');
 * if (response.data.success) {
 *   setOrder(response.data.data);
 * }
 * ```
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    timestamp?: string;
    requestId?: string;
    [key: string]: unknown;
  };
}

/**
 * API error response structure
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}

/**
 * Pagination info from API
 */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Standard pagination parameters for requests
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Generic paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

/**
 * API list response with pagination
 */
export interface ApiListResponse<T> extends ApiResponse<T[]> {
  pagination: Pagination;
}

/**
 * Order creation response
 */
export interface CreatedOrderResponse {
  id: string;
  order_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_amount: number;
  items?: OrderItem[];
  created_at: string;
}

// =============================================================================
// QUERY PARAMETER TYPES
// =============================================================================

/**
 * Order list filters
 */
export interface OrderFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus | OrderStatus[];
  payment_status?: PaymentStatus | PaymentStatus[];
  fulfillment_type?: FulfillmentType;
  zone_code?: string;
  date_from?: string;
  date_to?: string;
  rider_id?: string;
  assigned_to?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Product query params
 */
export interface ProductQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  category_id?: string;
  vendor_id?: string;
  is_active?: boolean;
  low_stock?: boolean;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Vendor query params
 */
export interface VendorQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Customer list params
 */
export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  is_blocked?: boolean;
  sort_by?: 'name' | 'created_at' | 'total_orders' | 'total_spent';
  sort_order?: 'asc' | 'desc';
}

/**
 * Inventory transaction filters
 */
export interface InventoryTransactionFilters {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  vendor_id?: string;
  date_from?: string;
  date_to?: string;
}

// =============================================================================
// ERROR HANDLING TYPES
// =============================================================================

/**
 * API error response
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

/**
 * Type guard for API errors
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Make certain properties required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make certain properties optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract ID type from entity
 */
export type EntityId<T extends { id: unknown }> = T['id'];

/**
 * Callback type for success handlers
 */
export type SuccessCallback<T> = (data: T) => void;

/**
 * Callback type for error handlers
 */
export type ErrorCallback = (error: unknown) => void;

// =============================================================================
// FORM TYPES
// =============================================================================

/**
 * Order form success callback type
 * Replaces: `onSuccess?: (order: any) => void`
 */
export type OrderFormSuccessCallback = SuccessCallback<CreatedOrderResponse>;

/**
 * Order form props
 */
export interface OrderFormProps {
  onSuccess?: OrderFormSuccessCallback;
  onCancel?: () => void;
  initialData?: Partial<OrderListItem>;
  mode?: 'create' | 'edit';
}

// =============================================================================
// COMPONENT PROP TYPES
// =============================================================================

/**
 * Icon component type (for Lucide icons)
 */
export type IconComponent = React.ComponentType<{
  className?: string;
  size?: number | string;
  strokeWidth?: number;
}>;

/**
 * Table column definition
 */
export interface TableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
}

// =============================================================================
// EXPORT ALL
// =============================================================================

export type {
  // Re-export from order.ts for convenience
  OrderStatus,
  PaymentStatus,
  FulfillmentType,
};
