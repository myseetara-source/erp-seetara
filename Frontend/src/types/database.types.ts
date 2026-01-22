/**
 * DATABASE TYPES - Auto-generated from 000_schema_final.sql
 * 
 * ⚠️ CRITICAL: This file MUST match the database schema exactly.
 * Any schema change in SQL must be reflected here.
 * 
 * Generated: 2026-01-22
 * Source: Backend/database/000_schema_final.sql
 */

// =============================================================================
// DATABASE ENUMS (Must match SQL exactly)
// =============================================================================

export type UserRole = 'admin' | 'manager' | 'operator' | 'vendor' | 'rider' | 'viewer';

export type OrderStatus =
  | 'intake'
  | 'follow_up'
  | 'converted'
  | 'hold'
  | 'packed'
  | 'assigned'
  | 'out_for_delivery'
  | 'handover_to_courier'
  | 'in_transit'
  | 'store_sale'
  | 'delivered'
  | 'cancelled'
  | 'rejected'
  | 'return_initiated'
  | 'returned';

export type OrderSource =
  | 'manual'
  | 'website'
  | 'facebook'
  | 'instagram'
  | 'store'
  | 'todaytrend'
  | 'seetara'
  | 'shopify'
  | 'woocommerce'
  | 'api';

export type FulfillmentType = 'inside_valley' | 'outside_valley' | 'store';

export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded' | 'cod';

export type PaymentMethod = 'cod' | 'esewa' | 'khalti' | 'bank_transfer' | 'cash';

export type InventoryTransactionType = 'purchase' | 'purchase_return' | 'damage' | 'adjustment';

export type InventoryTransactionStatus = 'pending' | 'approved' | 'rejected' | 'voided';

export type StockSourceType = 'fresh' | 'damaged';

export type CustomerTier = 'new' | 'regular' | 'vip' | 'gold' | 'platinum' | 'warning' | 'blacklisted';

export type ZoneType = 'inside_valley' | 'outside_valley';

export type RiderStatus = 'available' | 'on_delivery' | 'on_break' | 'off_duty' | 'suspended';

export type DeliveryResult = 'delivered' | 'rejected' | 'not_home' | 'wrong_address' | 'rescheduled' | 'returned';

export type DeliveryStatus = 'assigned' | 'picked' | 'in_transit' | 'delivered' | 'failed' | 'returned';

export type TicketType = 'issue' | 'task' | 'feedback' | 'vendor_dispute' | 'return_request' | 'inquiry';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TicketStatus = 'open' | 'pending' | 'in_progress' | 'escalated' | 'resolved' | 'closed';

export type SmsStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'failed' | 'blocked' | 'skipped';

export type CommentSource = 'staff' | 'logistics' | 'system' | 'customer';

// =============================================================================
// DATABASE TABLES
// =============================================================================

/**
 * User - System user with role-based access
 * Table: users
 */
export interface DbUser {
  id: string; // UUID
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  vendor_id: string | null; // FK to vendors
  last_login: string | null; // TIMESTAMPTZ
  created_at: string;
  updated_at: string;
}

/**
 * Vendor - Supplier master
 * Table: vendors
 */
export interface DbVendor {
  id: string;
  name: string;
  company_name: string | null;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  pan_number: string | null;
  bank_details: Record<string, unknown>;
  balance: number; // DECIMAL(14,2)
  credit_limit: number;
  payment_terms: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Customer - Customer master with CRM metrics
 * Table: customers
 */
export interface DbCustomer {
  id: string;
  name: string;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  
  // Address
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  
  // Marketing Attribution
  ip_address: string | null; // INET stored as string
  fbid: string | null;
  fbclid: string | null;
  gclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  
  // Metrics
  total_orders: number;
  total_spent: number;
  return_count: number;
  customer_score: number;
  tier: CustomerTier;
  avg_order_value: number;
  delivery_success_rate: number;
  
  // Timestamps
  first_order_at: string | null;
  last_order_at: string | null;
  
  // Status
  notes: string | null;
  tags: string[];
  is_blocked: boolean;
  
  created_at: string;
  updated_at: string;
}

/**
 * Product - Product catalog master
 * Table: products
 */
export interface DbProduct {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  
  // Shipping Rates (for Highest Value Rule)
  shipping_inside: number | null; // NULL = use default (100)
  shipping_outside: number | null; // NULL = use default (150)
  
  // Relations
  vendor_id: string | null;
  
  // Status
  is_active: boolean;
  meta: Record<string, unknown>;
  
  created_at: string;
  updated_at: string;
}

/**
 * ProductVariant - SKU-level inventory with dynamic attributes
 * Table: product_variants
 * 
 * CRITICAL: Includes Dual-Bucket Inventory (current_stock + damaged_stock)
 */
export interface DbProductVariant {
  id: string;
  product_id: string;
  
  // Identity
  sku: string;
  barcode: string | null;
  
  /**
   * Dynamic Attributes (JSONB)
   * Replaces hardcoded color/size/material
   * @example { "color": "Red", "size": "XL", "material": "Cotton" }
   */
  attributes: Record<string, string>;
  
  // Legacy columns (deprecated, use attributes)
  color: string | null;
  size: string | null;
  material: string | null;
  
  // Physical
  weight_grams: number | null;
  
  // Pricing (DECIMAL for accuracy)
  cost_price: number;
  selling_price: number;
  mrp: number | null;
  
  // DUAL-BUCKET INVENTORY
  current_stock: number;   // Fresh/sellable stock
  damaged_stock: number;   // Quarantined/damaged - not for sale
  reserved_stock: number;  // Reserved for pending orders
  reorder_level: number;
  
  // Status
  is_active: boolean;
  meta: Record<string, unknown>;
  
  created_at: string;
  updated_at: string;
}

/**
 * Order - Order master with Nepal logistics support
 * Table: orders
 */
export interface DbOrder {
  id: string;
  order_number: string;
  customer_id: string;
  
  // Source
  source: OrderSource;
  source_order_id: string | null;
  
  // Status
  status: OrderStatus;
  fulfillment_type: FulfillmentType;
  
  // Pricing
  subtotal: number;
  discount_amount: number;
  discount_code: string | null;
  shipping_charges: number;
  cod_charges: number;
  total_amount: number;
  
  // Payment
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  paid_amount: number;
  
  // Shipping Snapshot
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_pincode: string | null;
  
  // Logistics (Inside Valley)
  rider_id: string | null;
  rider_assigned_at: string | null;
  
  // Logistics (Outside Valley)
  courier_partner: string | null;
  awb_number: string | null;
  tracking_url: string | null;
  handover_at: string | null;
  
  // Workflow
  assigned_to: string | null;
  priority: number;
  followup_date: string | null;
  followup_reason: string | null;
  followup_count: number;
  
  // Notes
  internal_notes: string | null;
  customer_notes: string | null;
  
  // Cancellation/Return
  cancellation_reason: string | null;
  cancelled_by: string | null;
  rejection_reason: string | null;
  rejected_by: string | null;
  return_reason: string | null;
  return_initiated_at: string | null;
  returned_at: string | null;
  
  // Timestamps
  dispatched_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  is_deleted: boolean;
  
  created_at: string;
  updated_at: string;
}

/**
 * OrderItem - Line items for orders
 * Table: order_items
 */
export interface DbOrderItem {
  id: string;
  order_id: string;
  variant_id: string;
  vendor_id: string | null;
  
  // Product Snapshot
  sku: string;
  product_name: string;
  variant_name: string | null;
  
  // Quantities & Pricing
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_per_unit: number;
  total_price: number;
  
  // Fulfillment
  fulfilled_quantity: number;
  
  created_at: string;
}

/**
 * OrderLog - Audit trail for order changes
 * Table: order_logs
 */
export interface DbOrderLog {
  id: string;
  order_id: string;
  old_status: OrderStatus | null;
  new_status: OrderStatus;
  action: string;
  description: string | null;
  changed_by: string | null;
  ip_address: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

/**
 * OrderComment - Comments and notes on orders
 * Table: order_comments
 */
export interface DbOrderComment {
  id: string;
  order_id: string;
  comment: string;
  source: CommentSource;
  is_internal: boolean;
  is_pinned: boolean;
  created_by: string | null;
  created_at: string;
}

/**
 * InventoryTransaction - Unified inventory transaction header
 * Table: inventory_transactions
 * 
 * Handles: Purchase, Purchase Return, Damage, Adjustment
 */
export interface DbInventoryTransaction {
  id: string;
  
  // Identity
  transaction_type: InventoryTransactionType;
  invoice_no: string;
  
  // Relations
  vendor_id: string | null;
  performed_by: string;
  
  // Dates
  transaction_date: string; // DATE
  server_timestamp: string; // TIMESTAMPTZ
  
  // Details
  reason: string | null;
  notes: string | null;
  
  // Maker-Checker Workflow
  status: InventoryTransactionStatus;
  reference_transaction_id: string | null; // For Purchase Returns
  approved_by: string | null;
  approval_date: string | null;
  rejection_reason: string | null;
  
  // Computed Totals
  total_quantity: number;
  total_cost: number;
  
  created_at: string;
  updated_at: string;
}

/**
 * InventoryTransactionItem - Line items for inventory transactions
 * Table: inventory_transaction_items
 */
export interface DbInventoryTransactionItem {
  id: string;
  transaction_id: string;
  variant_id: string;
  
  /**
   * Quantity
   * - Positive: stock in (purchase)
   * - Negative: stock out (return, damage)
   */
  quantity: number;
  unit_cost: number;
  
  /**
   * Dual-Bucket Source
   * - 'fresh': affects current_stock
   * - 'damaged': affects damaged_stock
   */
  source_type: StockSourceType;
  
  // Stock Snapshot (filled by trigger)
  stock_before: number | null;
  stock_after: number | null;
  
  notes: string | null;
  created_at: string;
}

/**
 * StockMovement - Audit trail of all stock changes
 * Table: stock_movements
 */
export interface DbStockMovement {
  id: string;
  variant_id: string;
  movement_type: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  reference_id: string | null;
  order_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * CourierPartner - 3rd party logistics providers
 * Table: courier_partners
 */
export interface DbCourierPartner {
  id: string;
  name: string;
  code: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  api_url: string | null;
  api_key: string | null;
  tracking_url_template: string | null;
  base_rate: number;
  per_kg_rate: number;
  cod_percentage: number;
  is_active: boolean;
  coverage_areas: string[];
  created_at: string;
  updated_at: string;
}

/**
 * DeliveryZone - Delivery zones configuration
 * Table: delivery_zones
 */
export interface DbDeliveryZone {
  id: string;
  city_name: string;
  district: string | null;
  state_province: string | null;
  zone_type: ZoneType;
  delivery_charge: number;
  estimated_days: number;
  is_cod_available: boolean;
  is_prepaid_available: boolean;
  default_courier_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Standard API Response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Paginated API Response
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Insert type helper - makes id and timestamps optional
 */
export type DbInsert<T> = Omit<T, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Update type helper - makes everything partial except id
 */
export type DbUpdate<T> = Partial<Omit<T, 'id' | 'created_at'>> & {
  id: string;
};

// Type aliases for common operations
export type UserInsert = DbInsert<DbUser>;
export type UserUpdate = DbUpdate<DbUser>;
export type ProductInsert = DbInsert<DbProduct>;
export type ProductUpdate = DbUpdate<DbProduct>;
export type OrderInsert = DbInsert<DbOrder>;
export type OrderUpdate = DbUpdate<DbOrder>;
export type CustomerInsert = DbInsert<DbCustomer>;
export type CustomerUpdate = DbUpdate<DbCustomer>;
