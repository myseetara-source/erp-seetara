/**
 * Master Order Schema
 * 
 * This is the SINGLE SOURCE OF TRUTH for order validation.
 * Both FullOrderForm and QuickOrderForm use this schema.
 * 
 * IMPORTANT: This schema MUST match the Backend validation schema
 * located at: Backend/src/validations/order.validation.js
 * 
 * Fields with .default() are auto-filled for Quick form.
 */

import { z } from 'zod';

// =============================================================================
// ENUMS (Must match Backend exactly)
// =============================================================================

export const OrderSource = z.enum([
  'manual', 'todaytrend', 'seetara', 'shopify', 'woocommerce', 'api'
]);

export const OrderStatus = z.enum([
  'intake', 'converted', 'followup', 'hold', 'packed', 'shipped',
  'delivered', 'cancelled', 'refund', 'return',
]);

export const FulfillmentType = z.enum([
  'inside_valley', 'outside_valley', 'store_pickup'
]);

export const PaymentStatus = z.enum(['pending', 'partial', 'paid', 'refunded']);

export const PaymentMethod = z.enum(['cod', 'prepaid', 'partial']);

// =============================================================================
// NEPAL PHONE NUMBER VALIDATION
// =============================================================================

const nepalPhoneRegex = /^(98|97|96|01)[0-9]{7,8}$/;

export const phoneSchema = z.string()
  .min(10, 'Phone must be at least 10 digits')
  .max(15, 'Phone number too long')
  .refine(
    (val) => nepalPhoneRegex.test(val.replace(/[\s\-+]/g, '')),
    'Invalid Nepal phone number (must start with 98, 97, 96, or 01)'
  );

// =============================================================================
// CUSTOMER SCHEMA (Matches Backend orderCustomerSchema)
// =============================================================================

export const CustomerSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  phone: phoneSchema,
  alt_phone: z.string().optional().nullable(),
  email: z.string().email('Invalid email').optional().or(z.literal('')).nullable(),
  
  // Address - Backend requires these for shipping
  address_line1: z.string().min(5, 'Address is required').max(500),
  address_line2: z.string().max(500).optional().nullable(),
  city: z.string().min(2, 'City is required').max(100),
  state: z.string().min(2, 'State/Province is required').max(100).default('Bagmati'),
  pincode: z.string().min(5, 'Postal code required').max(10).default('44600'),
  country: z.string().default('Nepal'),
  
  // Tracking (optional)
  ip_address: z.string().optional().nullable(),
  fbid: z.string().optional().nullable(),
  fbclid: z.string().optional().nullable(),
  gclid: z.string().optional().nullable(),
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
});

// =============================================================================
// ORDER ITEM SCHEMA (Matches Backend orderItemSchema)
// =============================================================================

export const OrderItemSchema = z.object({
  variant_id: z.string().uuid('Please select a product variant'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(999),
  unit_price: z.coerce.number().min(0, 'Price cannot be negative').optional(),
  discount_per_unit: z.coerce.number().min(0).default(0),
  
  // Display fields (not sent to API)
  product_name: z.string().optional(),
  variant_name: z.string().optional(),
  sku: z.string().optional(),
});

// =============================================================================
// SHIPPING SCHEMA (For display, merged into customer for API)
// =============================================================================

export const ShippingSchema = z.object({
  address_line1: z.string().min(5, 'Address is required').default(''),
  address_line2: z.string().optional().default(''),
  city: z.string().min(2, 'City is required').default(''),
  state: z.string().default('Bagmati'),
  pincode: z.string().default('44600'),
  landmark: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

// =============================================================================
// MASTER ORDER SCHEMA (Matches Backend createOrderSchema)
// =============================================================================

export const OrderSchema = z.object({
  // Customer (Required) - Must match Backend orderCustomerSchema
  customer: CustomerSchema,
  
  // Items (At least one required)
  items: z.array(OrderItemSchema).min(1, 'At least one item is required').max(50),
  
  // Order metadata
  source: OrderSource.default('manual'),
  source_order_id: z.string().max(100).optional().nullable(),
  
  // Pricing Overrides
  discount_amount: z.coerce.number().min(0).default(0),
  discount_code: z.string().max(50).optional().nullable(),
  shipping_charges: z.coerce.number().min(0).default(100),
  cod_charges: z.coerce.number().min(0).default(0),
  
  // Payment
  payment_method: PaymentMethod.default('cod'),
  paid_amount: z.coerce.number().min(0).default(0),
  
  // Priority and Notes
  priority: z.coerce.number().int().min(0).max(2).default(0),
  internal_notes: z.string().max(1000).optional().nullable(),
  customer_notes: z.string().max(1000).optional().nullable(),
});

// =============================================================================
// QUICK ORDER SCHEMA - Minimal fields for fast entry
// =============================================================================

/**
 * Quick Order Schema - Used in header modal
 * 
 * IMPORTANT: This is transformed to full order format before API submission
 * See transformQuickToFullOrder() below
 */
export const QuickOrderSchema = z.object({
  // Essential customer info
  customer_name: z.string().min(2, 'Name required').max(255),
  customer_phone: z.string().min(10, 'Valid phone required'),
  customer_address: z.string().optional().default(''),
  customer_city: z.string().optional().default('Kathmandu'),
  
  // Single product (simplified)
  variant_id: z.string().uuid('Select a product'),
  quantity: z.coerce.number().int().min(1).default(1),
  unit_price: z.coerce.number().min(0).default(0),
  
  // Optional notes
  notes: z.string().optional().default(''),
});

// =============================================================================
// TYPES
// =============================================================================

export type OrderFormData = z.infer<typeof OrderSchema>;
export type QuickOrderFormData = z.infer<typeof QuickOrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type Customer = z.infer<typeof CustomerSchema>;

// =============================================================================
// API PAYLOAD TYPE (What Backend expects)
// =============================================================================

export interface CreateOrderPayload {
  customer: {
    name: string;
    phone: string;
    alt_phone?: string | null;
    email?: string | null;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  items: Array<{
    variant_id: string;
    quantity: number;
    unit_price?: number;
    discount_per_unit?: number;
  }>;
  source: string;
  discount_amount?: number;
  shipping_charges?: number;
  payment_method?: string;
  internal_notes?: string;
}

// =============================================================================
// HELPER: Transform Quick Form to API Payload
// =============================================================================

/**
 * Transforms QuickOrderForm data to the format expected by Backend API
 * 
 * The Backend createOrderSchema expects:
 * - customer object with address_line1, city, state, pincode
 * - items array with variant_id, quantity, unit_price, discount_per_unit
 * - source (default: 'manual')
 * - shipping_charges (default: 100)
 * - payment_method (default: 'cod')
 */
export function transformQuickToFullOrder(quickData: QuickOrderFormData): CreateOrderPayload {
  return {
    customer: {
      name: quickData.customer_name.trim(),
      phone: quickData.customer_phone.replace(/[\s\-+]/g, ''), // Clean phone number
      address_line1: quickData.customer_address || 'To be confirmed',
      city: quickData.customer_city || 'Kathmandu',
      state: 'Bagmati',
      pincode: '44600',
      country: 'Nepal',
    },
    items: [
      {
        variant_id: quickData.variant_id,
        quantity: Number(quickData.quantity) || 1,
        unit_price: Number(quickData.unit_price) || 0,
        discount_per_unit: 0,
      },
    ],
    source: 'manual',
    discount_amount: 0,
    shipping_charges: 100,
    payment_method: 'cod',
    internal_notes: quickData.notes || '',
  };
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const defaultOrderValues: Partial<OrderFormData> = {
  customer: {
    name: '',
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: 'Kathmandu',
    state: 'Bagmati',
    pincode: '44600',
    country: 'Nepal',
  },
  items: [],
  source: 'manual',
  discount_amount: 0,
  shipping_charges: 100,
  cod_charges: 0,
  payment_method: 'cod',
  paid_amount: 0,
  priority: 0,
  internal_notes: '',
  customer_notes: '',
};

export const defaultQuickOrderValues: QuickOrderFormData = {
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  customer_city: 'Kathmandu',
  variant_id: '',
  quantity: 1,
  unit_price: 0,
  notes: '',
};
