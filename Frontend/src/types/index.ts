/**
 * Centralized TypeScript Types
 * Single Source of Truth for all data structures
 * These types mirror the backend database schema
 */

// =============================================================================
// CORE ENTITIES
// =============================================================================

/**
 * Customer - Always has { id, name, phone }
 * Used in orders, shipping, and anywhere customer data is needed
 */
export interface Customer {
  id: string;
  name: string;
  phone: string;
  alt_phone?: string | null;
  email?: string | null;
  
  // Address
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string;
  
  // Tracking
  ip_address?: string | null;
  fbid?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  
  // Metrics
  total_orders?: number;
  total_spent?: number;
  last_order_date?: string | null;
  
  notes?: string | null;
  tags?: string[];
  is_blocked?: boolean;
  created_at: string;
  updated_at?: string;
}

/**
 * Vendor - Supplier with ledger balance
 */
export interface Vendor {
  id: string;
  name: string;
  company_name?: string | null;
  phone: string;
  alt_phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
  pan_number?: string | null;
  bank_details?: {
    bank_name?: string;
    account_no?: string;
    ifsc?: string;
  };
  balance: number;
  credit_limit?: number;
  payment_terms?: number;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
}

/**
 * Product - Master product catalog
 */
export interface Product {
  id: string;
  name: string;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
  is_active: boolean;
  meta?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

/**
 * Variant Attributes - Dynamic key-value pairs
 * Supports ANY product type (like Shopify)
 * 
 * @example
 * // Clothing: { color: "Red", size: "XL", material: "Cotton" }
 * // Laptop: { processor: "i7", ram: "16GB", storage: "512GB" }
 * // Jewelry: { metal: "Gold", stone: "Diamond", size: "7" }
 */
export type VariantAttributes = Record<string, string>;

/**
 * ProductVariant - SKU level inventory with dynamic attributes
 */
export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  barcode?: string | null;
  
  /**
   * Dynamic attributes - replaces hardcoded color/size/material
   * Use this for ALL variant-specific properties
   */
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
  reserved_stock: number;
  reorder_level?: number;
  is_active: boolean;
  meta?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  
  // Joined data
  product?: Product;
}

/**
 * Attribute Template - Suggested attributes per category
 */
export interface AttributeTemplate {
  id: string;
  category: string;
  attribute_key: string;
  display_name: string;
  input_type: 'text' | 'select' | 'color' | 'number';
  options?: string[];
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

/**
 * Attribute Key-Value for form handling
 */
export interface AttributeField {
  key: string;
  value: string;
}

// =============================================================================
// ORDER TYPES
// =============================================================================

/**
 * Order Status - State machine values
 * Extended for Nepal logistics
 */
export type OrderStatus = 
  | 'intake'
  | 'converted'
  | 'followup'
  | 'hold'
  | 'packed'
  | 'out_for_delivery'      // Inside Valley: Rider has the order
  | 'handover_to_courier'   // Outside Valley: Given to logistics
  | 'in_transit'            // Outside Valley: Courier is delivering
  | 'shipped'               // Legacy status
  | 'store_sale'            // Store: Immediate sale
  | 'delivered'
  | 'cancelled'
  | 'refund'
  | 'return';

/**
 * Order Source - Channel where order originated
 */
export type OrderSource = 
  | 'manual'
  | 'website'
  | 'store'
  | 'todaytrend'
  | 'seetara'
  | 'shopify'
  | 'woocommerce'
  | 'api';

/**
 * Fulfillment Type - Nepal logistics context
 */
export type FulfillmentType = 
  | 'inside_valley'   // Delivered by our own riders (Kathmandu, Lalitpur, Bhaktapur)
  | 'outside_valley'  // Handed over to 3rd party courier
  | 'store_pickup';   // Walk-in customers, immediate handover

/**
 * Payment Status
 */
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';

/**
 * Order Item - Line item in an order
 */
export interface OrderItem {
  id: string;
  order_id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_per_unit?: number;
  total_price: number;
  fulfilled_quantity?: number;
  created_at: string;
  
  // Joined data
  variant?: ProductVariant;
}

/**
 * Order - Full order entity
 */
export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  
  // Source
  source: OrderSource;
  source_order_id?: string | null;
  
  // Status
  status: OrderStatus;
  
  // Pricing
  subtotal: number;
  discount_amount?: number;
  discount_code?: string | null;
  shipping_charges?: number;
  cod_charges?: number;
  total_amount: number;
  
  // Payment
  payment_method?: string;
  payment_status: PaymentStatus;
  paid_amount?: number;
  
  // Shipping snapshot
  shipping_name?: string | null;
  shipping_phone?: string | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_pincode?: string | null;
  
  // Logistics
  courier_partner?: string | null;
  awb_number?: string | null;
  tracking_url?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  
  // Internal
  assigned_to?: string | null;
  priority?: number;
  internal_notes?: string | null;
  customer_notes?: string | null;
  
  // Timestamps
  created_at: string;
  updated_at?: string;
  cancelled_at?: string | null;
  
  is_deleted?: boolean;
  
  // Joined data
  customer?: Customer;
  items?: OrderItem[];
}

/**
 * OrderListItem - Flattened order data for list views
 * This is what the API returns for list endpoints
 */
export interface OrderListItem {
  id: string;
  order_number: string;
  
  // Customer (flattened)
  customer_name: string;
  customer_phone: string;
  customer_city: string | null;
  customer_address: string | null;
  
  // Order details
  total_amount: number;
  status: OrderStatus;
  source: OrderSource;
  payment_status: PaymentStatus;
  
  // Nepal Logistics
  fulfillment_type: FulfillmentType;
  rider_id?: string | null;
  rider_name?: string | null;
  courier_partner?: string | null;
  courier_tracking_id?: string | null;
  awb_number?: string | null;
  
  // Aggregated
  item_count: number;
  vendor_name: string | null;
  
  priority?: number;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Rider - Delivery personnel for Inside Valley orders
 */
export interface Rider {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  vehicle_type: 'bike' | 'scooter' | 'van';
  vehicle_number?: string;
  is_available: boolean;
  total_deliveries: number;
  successful_deliveries: number;
  average_rating: number;
}

/**
 * Courier Partner - 3rd party logistics for Outside Valley
 */
export interface CourierPartner {
  id: string;
  name: string;
  code: string;
  phone?: string;
  tracking_url_template?: string;
  is_active: boolean;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Pagination metadata
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
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: Pagination;
}

/**
 * API error response
 */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// =============================================================================
// UI HELPER TYPES
// =============================================================================

/**
 * Status configuration for UI display
 */
export interface StatusConfig {
  label: string;
  bgColor: string;
  textColor: string;
  dotColor: string;
  icon?: string;
}

/**
 * Filter options for order list
 */
export interface OrderFilters {
  status?: OrderStatus;
  source?: OrderSource;
  fulfillmentType?: FulfillmentType;
  search?: string;
  startDate?: string;
  endDate?: string;
  customerId?: string;
  assignedTo?: string;
  riderId?: string;
}

/**
 * Sort options
 */
export interface SortOptions {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

// =============================================================================
// COMPONENT PROP TYPES
// =============================================================================

/**
 * Common table column definition
 */
export interface ColumnDef<T> {
  id: string;
  header: string;
  accessorKey?: keyof T;
  cell?: (row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
  hidden?: boolean;
}
