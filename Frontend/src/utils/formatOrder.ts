/**
 * Order Data Extraction Utilities
 * 
 * Safe helpers for extracting nested data from order objects.
 * Handles missing/null data gracefully with fallback values.
 */

// =============================================================================
// TYPES
// =============================================================================

interface OrderItem {
  id: string;
  product_name: string;
  variant_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sku?: string;
}

interface DeliveryMetadata {
  rider_name?: string;
  rider_phone?: string;
  courier_name?: string;
  courier_tracking?: string;
  branch_name?: string;
  branch_id?: string;
  estimated_delivery?: string;
  [key: string]: unknown;
}

interface Order {
  id: string;
  readable_id?: string;
  order_number: string;
  customer_id: string;
  customer?: { name: string; phone: string; email?: string; secondary_phone?: string };
  customer_name?: string;
  customer_phone?: string;
  status: string;
  location?: string;
  fulfillment_type?: string;
  total_amount: number;
  subtotal?: number;
  // P0 FIX: Match actual database column names
  discount?: number;           // Legacy name
  discount_amount?: number;    // Actual DB column name
  shipping_cost?: number;      // Legacy name  
  shipping_charges?: number;   // Actual DB column name
  advance_payment?: number;
  shipping_name?: string;
  shipping_phone?: string;
  shipping_address?: string;
  shipping_city?: string;
  delivery_metadata?: DeliveryMetadata;
  payment_method?: string;
  payment_status?: string;
  paid_amount?: number;
  due_amount?: number;
  items?: OrderItem[];
  item_count?: number | { count: number };
  // P0 FIX: Flat fields from backend for table display
  first_product_name?: string;
  first_sku?: string;
  first_quantity?: number;
  first_variant_name?: string;
  remarks?: string;
  created_at: string;
  dispatched_at?: string;
  delivered_at?: string;
  assigned_rider?: { name: string; phone: string };
  vendor_name?: string;
  // P0 FIX: Logistics fields
  delivery_type?: 'D2D' | 'D2B' | null;
  courier_partner?: string;
  destination_branch?: string;
  zone_code?: string;
}

// =============================================================================
// CUSTOMER EXTRACTION
// =============================================================================

export function getCustomerName(order: Order): string {
  return order.shipping_name 
    || order.customer_name 
    || order.customer?.name 
    || '-';
}

export function getCustomerPhone(order: Order): string {
  const primary = order.shipping_phone 
    || order.customer_phone 
    || order.customer?.phone;
  
  const secondary = order.customer?.secondary_phone;
  
  if (!primary) return '-';
  if (secondary) return `${primary} / ${secondary}`;
  return primary;
}

export function getCustomerInitial(order: Order): string {
  const name = getCustomerName(order);
  return name !== '-' ? name.charAt(0).toUpperCase() : '?';
}

// =============================================================================
// ADDRESS EXTRACTION
// =============================================================================

export function getStreetAddress(order: Order): string {
  return order.shipping_address || '-';
}

export function getBranchName(order: Order): string {
  const branch = order.delivery_metadata?.branch_name 
    || order.shipping_city 
    || null;
  
  return branch ? `📍 ${branch}` : '-';
}

// =============================================================================
// PRODUCT & ITEMS EXTRACTION
// P0 FIX: Check both flat fields and nested items array
// =============================================================================

export function getMainItemName(order: Order): string {
  // Priority 1: Flat field from backend (optimized for list view)
  if (order.first_product_name) {
    return order.first_product_name;
  }
  // Priority 2: From items array
  if (order.items && order.items.length > 0) {
    return order.items[0].product_name || '-';
  }
  return '-';
}

export function getItemCount(order: Order): number {
  // Priority 1: Direct number
  if (typeof order.item_count === 'number') return order.item_count;
  // Priority 2: Object with count
  if (order.item_count && typeof order.item_count === 'object' && 'count' in order.item_count) {
    return order.item_count.count ?? 0;
  }
  // Priority 3: Items array length
  if (order.items) return order.items.length;
  return 0;
}

export function getItemCountLabel(order: Order): string {
  const count = getItemCount(order);
  return `Item count: ${count}`;
}

// =============================================================================
// VARIANT & SKU EXTRACTION
// P0 FIX: Check both flat fields and nested items array
// =============================================================================

export function getSkuCode(order: Order): string {
  // Priority 1: Flat field from backend
  if (order.first_sku) {
    return order.first_sku;
  }
  // Priority 2: From items array
  if (order.items && order.items.length > 0) {
    const item = order.items[0];
    return item.sku || item.variant_name || '-';
  }
  return '-';
}

export function getFirstItemQuantity(order: Order): string {
  // Priority 1: Flat field from backend
  if (order.first_quantity !== undefined && order.first_quantity !== null) {
    return `Qty: ${order.first_quantity}`;
  }
  // Priority 2: From items array
  if (order.items && order.items.length > 0) {
    return `Qty: ${order.items[0].quantity}`;
  }
  return 'Qty: -';
}

export function getFirstVariantName(order: Order): string {
  // Priority 1: Flat field from backend
  if (order.first_variant_name) {
    return order.first_variant_name;
  }
  // Priority 2: From items array
  if (order.items && order.items.length > 0) {
    return order.items[0].variant_name || 'Default';
  }
  return 'Default';
}

// =============================================================================
// FINANCE EXTRACTION
// =============================================================================

export function getTotalAmount(order: Order): number {
  return order.total_amount || 0;
}

export function getShippingFee(order: Order): number {
  // P0 FIX: Check both legacy name and actual DB column name
  return order.shipping_charges ?? order.shipping_cost ?? 0;
}

export function getAdvancePayment(order: Order): number {
  return order.advance_payment || order.paid_amount || 0;
}

export function getDiscount(order: Order): number {
  // P0 FIX: Check both legacy name and actual DB column name
  return order.discount_amount ?? order.discount ?? 0;
}

export function getPaymentStatus(order: Order): 'paid' | 'partial' | 'unpaid' {
  if (order.payment_status === 'paid') return 'paid';
  if ((order.paid_amount || 0) > 0) return 'partial';
  return 'unpaid';
}

// =============================================================================
// SOURCE & HANDLER EXTRACTION
// =============================================================================

export type SourceType = 'I' | 'O' | 'S';

export interface SourceInfo {
  type: SourceType;
  label: string;
  color: string;
  bgColor: string;
}

export function getSourceInfo(order: Order): SourceInfo {
  const location = order.location || order.fulfillment_type;
  
  switch (location) {
    case 'INSIDE_VALLEY':
      return { type: 'I', label: 'Inside Valley', color: 'text-orange-700', bgColor: 'bg-orange-100' };
    case 'OUTSIDE_VALLEY':
      return { type: 'O', label: 'Outside Valley', color: 'text-blue-700', bgColor: 'bg-blue-100' };
    case 'POS':
    case 'STORE_POS':
      return { type: 'S', label: 'Store POS', color: 'text-green-700', bgColor: 'bg-green-100' };
    default:
      return { type: 'I', label: 'Inside Valley', color: 'text-orange-700', bgColor: 'bg-orange-100' };
  }
}

export function getHandlerName(order: Order): string {
  const source = getSourceInfo(order);
  
  switch (source.type) {
    case 'I':
      // Inside Valley - Show Rider Name
      return order.assigned_rider?.name 
        || order.delivery_metadata?.rider_name as string
        || 'Unassigned';
    case 'O':
      // Outside Valley - Show Courier Name
      return order.delivery_metadata?.courier_name as string || 'Pending';
    case 'S':
      // Store POS - Counter Sales
      return 'Counter Sales';
    default:
      return '-';
  }
}

// =============================================================================
// ORDER ID & STATUS
// =============================================================================

export function getOrderId(order: Order): string {
  return order.readable_id || order.order_number || order.id.slice(0, 8);
}

export function getOrderStatus(order: Order): string {
  return order.status?.toLowerCase() || 'intake';
}

// =============================================================================
// CURRENCY FORMATTER
// =============================================================================

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'NPR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount).replace('NPR', 'रु.');
}

// =============================================================================
// DATE FORMATTER
// =============================================================================

export function formatOrderDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
