/**
 * Master Order Schema
 * 
 * This is the SINGLE SOURCE OF TRUTH for order validation.
 * Both FullOrderForm and QuickOrderForm use this schema.
 * 
 * Fields with .default() are auto-filled for Quick form.
 */

import { z } from 'zod';

// Enums matching database
export const OrderSource = z.enum(['website', 'manual', 'store', 'facebook', 'instagram']);
export const OrderStatus = z.enum([
  'intake', 
  'follow_up', 
  'converted', 
  'packed', 
  'out_for_delivery', 
  'handover_to_courier',
  'in_transit',
  'delivered', 
  'returned', 
  'cancelled',
  'store_sale',
]);
export const FulfillmentType = z.enum(['inside_valley', 'outside_valley', 'store_pickup']);
export const PaymentStatus = z.enum(['pending', 'partial', 'paid', 'refunded']);
export const PaymentMethod = z.enum(['cod', 'esewa', 'khalti', 'bank_transfer', 'cash', 'other']);

// Customer schema (embedded or referenced)
export const CustomerSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string()
    .min(10, 'Phone must be at least 10 digits')
    .regex(/^[0-9+\-\s]+$/, 'Invalid phone number format'),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional().default(''),
});

// Order item schema
export const OrderItemSchema = z.object({
  variant_id: z.string().uuid('Please select a product variant'),
  product_name: z.string().optional(), // For display
  variant_name: z.string().optional(), // For display
  sku: z.string().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unit_price: z.number().min(0, 'Price cannot be negative'),
  discount: z.number().min(0).max(100).default(0), // Percentage
  total: z.number().optional(), // Calculated
});

// Shipping schema
export const ShippingSchema = z.object({
  address: z.string().min(5, 'Address is required').default(''),
  city: z.string().min(2, 'City is required').default(''),
  district: z.string().optional().default(''),
  landmark: z.string().optional().default(''),
  postal_code: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

// ============================================================================
// MASTER ORDER SCHEMA
// ============================================================================

export const OrderSchema = z.object({
  // Customer (Required)
  customer: CustomerSchema,
  
  // Items (At least one required)
  items: z.array(OrderItemSchema).min(1, 'At least one item is required'),
  
  // Shipping (Optional for store pickup)
  shipping: ShippingSchema.optional(),
  
  // Order metadata
  source: OrderSource.default('manual'),
  status: OrderStatus.default('intake'),
  fulfillment_type: FulfillmentType.optional(),
  
  // Financial
  subtotal: z.number().min(0).default(0),
  discount_amount: z.number().min(0).default(0),
  delivery_charge: z.number().min(0).default(100),
  total_amount: z.number().min(0).default(0),
  
  // Payment
  payment_status: PaymentStatus.default('pending'),
  payment_method: PaymentMethod.default('cod'),
  paid_amount: z.number().min(0).default(0),
  
  // Notes
  internal_notes: z.string().optional().default(''),
  customer_notes: z.string().optional().default(''),
  
  // Timestamps (auto-set)
  created_at: z.string().optional(),
});

// ============================================================================
// DERIVED SCHEMAS FOR DIFFERENT FORM VERSIONS
// ============================================================================

/**
 * Quick Order Schema - Minimal fields
 * Used in header modal for fast order entry
 */
export const QuickOrderSchema = z.object({
  // Only essential customer info
  customer_name: z.string().min(2, 'Name required'),
  customer_phone: z.string().min(10, 'Valid phone required'),
  
  // Single product (simplified)
  variant_id: z.string().uuid('Select a product'),
  quantity: z.number().int().min(1).default(1),
  unit_price: z.number().min(0).default(0),
  
  // Optional
  notes: z.string().optional().default(''),
});

// Types
export type OrderFormData = z.infer<typeof OrderSchema>;
export type QuickOrderFormData = z.infer<typeof QuickOrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type Customer = z.infer<typeof CustomerSchema>;

// ============================================================================
// HELPER: Transform Quick Form to Full Order
// ============================================================================

export function transformQuickToFullOrder(quickData: QuickOrderFormData): Partial<OrderFormData> {
  const total = quickData.quantity * quickData.unit_price;
  
  return {
    customer: {
      name: quickData.customer_name,
      phone: quickData.customer_phone,
      address: '',
    },
    items: [
      {
        variant_id: quickData.variant_id,
        quantity: quickData.quantity,
        unit_price: quickData.unit_price,
        discount: 0,
        total,
      },
    ],
    source: 'manual',
    status: 'intake',
    subtotal: total,
    discount_amount: 0,
    delivery_charge: 100, // Default
    total_amount: total + 100,
    payment_status: 'pending',
    payment_method: 'cod',
    paid_amount: 0,
    internal_notes: quickData.notes || '',
    customer_notes: '',
  };
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const defaultOrderValues: Partial<OrderFormData> = {
  customer: {
    name: '',
    phone: '',
    email: '',
    address: '',
  },
  items: [],
  shipping: {
    address: '',
    city: '',
    district: '',
    landmark: '',
    postal_code: '',
    notes: '',
  },
  source: 'manual',
  status: 'intake',
  subtotal: 0,
  discount_amount: 0,
  delivery_charge: 100,
  total_amount: 0,
  payment_status: 'pending',
  payment_method: 'cod',
  paid_amount: 0,
  internal_notes: '',
  customer_notes: '',
};

export const defaultQuickOrderValues: QuickOrderFormData = {
  customer_name: '',
  customer_phone: '',
  variant_id: '',
  quantity: 1,
  unit_price: 0,
  notes: '',
};
