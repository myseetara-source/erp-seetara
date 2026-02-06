/**
 * Order Validation Schemas
 * Comprehensive validation for order management with state machine support
 */

import { z } from 'zod';
import config from '../config/index.js';
import {
  uuidSchema,
  phoneSchema,
  optionalPhoneSchema,
  optionalEmailSchema,
  priceSchema,
  positiveIntegerSchema,
  paginationSchema,
  addressSchema,
  pincodeSchema,
} from './common.validation.js';

// ============================================================================
// ENUM SCHEMAS
// ============================================================================

/**
 * Order Status Enum
 * Updated to match database order_status ENUM
 */
export const orderStatusSchema = z.enum([
  'intake',
  'follow_up',
  'converted',
  'hold',
  'packed',
  'assigned',
  'out_for_delivery',
  'handover_to_courier',
  'in_transit',
  'store_sale',
  'delivered',
  'cancelled',
  'rejected',
  'return_initiated',
  'returned',
  // P0: RTO Verification Workflow
  'rto_initiated',              // Courier says customer rejected
  'rto_verification_pending',   // Awaiting physical verification at warehouse
  'lost_in_transit',            // Item lost, open courier dispute
]);

/**
 * Order Source Enum
 */
export const orderSourceSchema = z.enum([
  'manual',
  'todaytrend',
  'seetara',
  'shopify',
  'woocommerce',
  'api',
]);

/**
 * Payment Method Enum
 * NOTE: 'cash' is used for Store POS (in-store cash payment)
 */
export const paymentMethodSchema = z.enum(['cod', 'prepaid', 'partial', 'cash']);

/**
 * Payment Status Enum
 */
export const paymentStatusSchema = z.enum(['pending', 'partial', 'paid', 'refunded']);

/**
 * Fulfillment Type Enum
 * NOTE: Moved here (before createOrderSchema) to avoid "Cannot access before initialization" error
 */
export const fulfillmentTypeSchema = z.enum(['inside_valley', 'outside_valley', 'store']);

// ============================================================================
// CUSTOMER SCHEMAS (For Order Creation)
// ============================================================================

/**
 * Customer Details for Order
 * 
 * Flexible validation for Nepal e-commerce:
 * - Accepts minimal address info for quick orders
 * - Full address for proper shipping
 * - Auto-trims and cleans input
 */
export const orderCustomerSchema = z.object({
  // Existing customer ID (optional - for linking)
  id: uuidSchema.optional().nullable(),
  
  // Required fields
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(255)
    .trim(),
  phone: phoneSchema,
  
  // Optional contact
  alt_phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  
  // Address - Made more flexible for Nepal
  address_line1: z.string()
    .min(3, 'Address is required (min 3 chars)')
    .max(500)
    .trim()
    .default('To be confirmed'),
  address_line2: z.string().max(500).optional().nullable(),
  city: z.string()
    .min(2, 'City is required')
    .max(100)
    .trim()
    .default('Kathmandu'),
  state: z.string()
    .min(2, 'State/Province is required')
    .max(100)
    .trim()
    .default('Bagmati'),
  pincode: z.string()
    .min(5, 'Pincode required')
    .max(10)
    .default('44600'),
  country: z.string().trim().default('Nepal'),
  
  // Tracking (for Meta Pixel / Analytics)
  ip_address: z.string().ip().optional().nullable(),
  fbid: z.string().max(100).optional().nullable(),
  fbclid: z.string().max(255).optional().nullable(),
  gclid: z.string().max(255).optional().nullable(),
  utm_source: z.string().max(100).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(255).optional().nullable(),
});

// ============================================================================
// ORDER ITEM SCHEMAS
// ============================================================================

/**
 * Order Item Schema
 * 
 * Uses coercion for quantity and price to handle string inputs from forms
 */
export const orderItemSchema = z.object({
  variant_id: uuidSchema,
  quantity: z.coerce
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(999, 'Quantity cannot exceed 999'),
  unit_price: z.coerce
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price cannot be negative')
    .optional()
    .default(0),
  discount_per_unit: z.coerce
    .number()
    .min(0)
    .optional()
    .default(0),
});

/**
 * Order Items Array
 */
export const orderItemsArraySchema = z
  .array(orderItemSchema)
  .min(1, 'Order must have at least one item')
  .max(50, 'Order cannot have more than 50 items');

// ============================================================================
// CREATE ORDER SCHEMA
// ============================================================================

/**
 * Create Order Schema
 * Accepts customer details and items for order creation
 * 
 * Enhanced with coercion for all numeric fields to handle string inputs from forms
 * 
 * P0 FIX: Added zone_code and destination_branch fields
 */
export const createOrderSchema = z.object({
  // Customer can be new or existing
  customer: orderCustomerSchema,
  
  // Order Items
  items: orderItemsArraySchema,
  
  // Order Details
  source: orderSourceSchema.default('manual'),
  source_id: uuidSchema.optional().nullable(),  // FK to order_sources (page/brand)
  source_order_id: z.string().max(100).optional().nullable(),
  
  // Fulfillment & Status (for Store POS, etc.)
  // NOTE: Status is optional here - defaults to 'intake' in service if not provided
  // For Store POS: frontend sends fulfillment_type='store' and status='store_sale'
  fulfillment_type: fulfillmentTypeSchema.optional().default('inside_valley'),
  status: orderStatusSchema.optional(), // Will default in service layer based on fulfillment_type
  
  // P0 FIX: Zone/Branch Routing - MUST be included in create schema
  // zone_code: For inside_valley delivery routing (NORTH, WEST, CENTER, EAST, LALIT)
  // destination_branch: For outside_valley courier routing (e.g., Narayanghat, Pokhara)
  zone_code: z.enum(['NORTH', 'WEST', 'CENTER', 'EAST', 'LALIT']).optional().nullable(),
  destination_branch: z.string().max(100).optional().nullable(),
  
  // P0 FIX: Courier partner for outside_valley orders (Nepal Can Move, Gaau Besi)
  courier_partner: z.string().max(100).optional().nullable(),
  
  // P0 FIX: NCM delivery type - D2D (Home Delivery) or D2B (Branch Pickup)
  // CRITICAL: Must be saved at order creation to persist across sessions
  delivery_type: z.enum(['D2D', 'D2B']).optional().nullable(),
  
  // Pricing Overrides (with coercion)
  discount_amount: z.coerce.number().min(0).default(0),
  discount_code: z.string().max(50).optional().nullable(),
  shipping_charges: z.coerce.number().min(0).default(100),
  cod_charges: z.coerce.number().min(0).default(0),
  
  // Payment
  payment_method: paymentMethodSchema.default('cod'),
  payment_status: paymentStatusSchema.optional(), // For Store POS: 'paid'
  paid_amount: z.coerce.number().min(0).default(0),
  
  // Internal (with coercion for priority)
  priority: z.coerce.number().int().min(0).max(2).default(0),
  internal_notes: z.string().max(1000).optional().nullable(),
  customer_notes: z.string().max(1000).optional().nullable(),
});

// ============================================================================
// UPDATE ORDER SCHEMA
// ============================================================================

/**
 * Update Order Schema
 * For updating order details (not status)
 */
export const updateOrderSchema = z.object({
  // Shipping address updates
  shipping_name: z.string().min(2).max(255).optional(),
  shipping_phone: phoneSchema.optional(),
  alt_phone: optionalPhoneSchema, // Secondary phone number
  shipping_address: z.string().max(500).optional(),
  shipping_city: z.string().max(100).optional(),
  shipping_state: z.string().max(100).optional(),
  shipping_pincode: pincodeSchema.optional(),
  
  // Pricing
  discount_amount: priceSchema.optional(),
  discount_code: z.string().max(50).optional().nullable(),
  shipping_charges: priceSchema.optional(),
  cod_charges: priceSchema.optional(),
  
  // Payment
  payment_method: paymentMethodSchema.optional(),
  paid_amount: priceSchema.optional(),
  
  // Source / Page
  source_id: uuidSchema.optional().nullable(),
  
  // Logistics
  courier_partner: z.string().max(100).optional().nullable(),
  awb_number: z.string().max(100).optional().nullable(),
  tracking_url: z.string().url().optional().nullable(),
  
  // Internal
  priority: z.number().int().min(0).max(2).optional(),
  internal_notes: z.string().max(1000).optional().nullable(),
  customer_notes: z.string().max(1000).optional().nullable(),
  assigned_to: uuidSchema.optional().nullable(),
  
  // Zone/Branch (for inside_valley and outside_valley routing)
  zone_code: z.enum(['NORTH', 'WEST', 'CENTER', 'EAST', 'LALIT']).optional().nullable(),
  destination_branch: z.string().max(100).optional().nullable(),
  
  // Fulfillment type (allows switching between Inside Valley ↔ Outside Valley)
  fulfillment_type: z.enum(['inside_valley', 'outside_valley']).optional(),
  
  // P0 FIX: NCM delivery type - D2D (Home Delivery) or D2B (Branch Pickup)
  delivery_type: z.enum(['D2D', 'D2B']).optional().nullable(),
  
  // Staff remarks (internal notes for order handling)
  staff_remarks: z.string().max(1000).optional().nullable(),
});

// ============================================================================
// STATUS UPDATE SCHEMA
// ============================================================================

/**
 * Update Order Status Schema
 * Validates status transitions according to state machine
 */
export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
  reason: z.string().max(500).optional(), // Required for cancellation
  
  // Additional data for specific statuses
  awb_number: z.string().max(100).optional(), // For 'shipped' status
  courier_partner: z.string().max(100).optional(), // For 'shipped' status
}).refine(
  (data) => {
    // Reason required for cancellation, refund, return
    if (['cancelled', 'refund', 'return'].includes(data.status)) {
      return !!data.reason;
    }
    return true;
  },
  {
    message: 'Reason is required for cancellation, refund, or return',
    path: ['reason'],
  }
).refine(
  (data) => {
    // AWB required for shipped status
    if (data.status === 'shipped') {
      return !!data.awb_number;
    }
    return true;
  },
  {
    message: 'AWB number is required when marking as shipped',
    path: ['awb_number'],
  }
);

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

/**
 * Location Type Enum (maps to fulfillment_type in backend)
 */
export const locationTypeSchema = z.enum(['INSIDE_VALLEY', 'OUTSIDE_VALLEY', 'POS']);

/**
 * Order List Query
 * Accepts comma-separated status values for multi-status filtering
 */
export const orderListQuerySchema = paginationSchema.extend({
  // Status can be a single value or comma-separated string (e.g., "intake,packed")
  status: z.string().optional(),
  source: orderSourceSchema.optional(),
  customer_id: uuidSchema.optional(),
  payment_status: paymentStatusSchema.optional(),
  assigned_to: uuidSchema.optional(),
  // Support both snake_case and camelCase date formats
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(), // Search by order number, customer name, phone
  awb: z.string().optional(), // Search by AWB number
  // Tri-Core Architecture: Location and Fulfillment Type filters
  location: locationTypeSchema.optional(),
  fulfillmentType: fulfillmentTypeSchema.optional(),
  fulfillment_type: fulfillmentTypeSchema.optional(),
});

/**
 * Order ID Parameter
 */
export const orderIdSchema = z.object({
  id: uuidSchema,
});

/**
 * Order Number Parameter
 */
export const orderNumberSchema = z.object({
  orderNumber: z.string().regex(
    /^ORD-\d{4}-\d{6}$/,
    'Invalid order number format. Expected: ORD-YYYY-XXXXXX'
  ),
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk Status Update Schema
 */
export const bulkStatusUpdateSchema = z.object({
  order_ids: z
    .array(uuidSchema)
    .min(1, 'At least one order ID required')
    .max(50, 'Maximum 50 orders per bulk operation'),
  status: orderStatusSchema,
  reason: z.string().max(500).optional(),
});

/**
 * Bulk Assign Schema
 */
export const bulkAssignSchema = z.object({
  order_ids: z
    .array(uuidSchema)
    .min(1)
    .max(50),
  assigned_to: uuidSchema,
});

// ============================================================================
// NEPAL LOGISTICS SCHEMAS
// ============================================================================

/**
 * Assign Rider Schema (Inside Valley)
 * Used when assigning an internal rider to an order
 */
export const assignRiderSchema = z.object({
  rider_id: uuidSchema,
});

/**
 * Handover to Courier Schema (Outside Valley)
 * Used when handing over order to third-party courier
 */
export const handoverCourierSchema = z.object({
  courier_partner: z.string()
    .min(1, 'Courier partner is required')
    .max(100, 'Courier partner name too long'),
  courier_tracking_id: z.string()
    .min(1, 'Tracking ID is required')
    .max(100, 'Tracking ID too long')
    .optional(),
  awb_number: z.string()
    .min(1, 'AWB number is required')
    .max(100, 'AWB number too long')
    .optional(),
}).refine(
  (data) => data.courier_tracking_id || data.awb_number,
  {
    message: 'Either Tracking ID or AWB number is required',
    path: ['courier_tracking_id'],
  }
);

/**
 * Mark Delivered Schema
 * Optional proof of delivery details
 */
export const markDeliveredSchema = z.object({
  receiver_name: z.string().max(255).optional(),
  receiver_phone: optionalPhoneSchema,
  pod_image_url: z.string().url().optional().nullable(),
  notes: z.string().max(500).optional(),
});

/**
 * Mark Returned Schema
 * Requires reason for return
 */
export const markReturnedSchema = z.object({
  return_reason: z.string()
    .min(1, 'Return reason is required')
    .max(500, 'Return reason too long'),
  notes: z.string().max(500).optional(),
});

// ============================================================================
// API ORDER SCHEMA (For external integrations)
// ============================================================================

/**
 * External API Order Schema
 * More relaxed validation for external sources
 */
export const apiOrderSchema = z.object({
  // Source identification
  source: orderSourceSchema,
  source_order_id: z.string().max(100),
  
  // Customer
  customer_name: z.string().min(1).max(255),
  customer_phone: z.string().min(10).max(20), // More relaxed phone validation
  customer_email: z.string().email().optional().nullable(),
  
  // Shipping Address
  shipping_address: z.string().min(5).max(1000),
  shipping_city: z.string().min(2).max(100),
  shipping_state: z.string().min(2).max(100),
  shipping_pincode: z.string().min(5).max(10),
  
  // Items
  items: z.array(
    z.object({
      sku: z.string().min(1),
      quantity: positiveIntegerSchema,
      unit_price: priceSchema,
    })
  ).min(1),
  
  // Totals
  subtotal: priceSchema,
  discount: priceSchema.optional().default(0),
  shipping: priceSchema.optional().default(0),
  total: priceSchema,
  
  // Payment
  payment_method: z.string().default('cod'),
  payment_status: z.string().default('pending'),
  
  // Tracking
  utm_source: z.string().optional().nullable(),
  utm_medium: z.string().optional().nullable(),
  utm_campaign: z.string().optional().nullable(),
  fbclid: z.string().optional().nullable(),
});

export default {
  orderStatusSchema,
  orderSourceSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  orderCustomerSchema,
  orderItemSchema,
  orderItemsArraySchema,
  createOrderSchema,
  updateOrderSchema,
  updateOrderStatusSchema,
  orderListQuerySchema,
  orderIdSchema,
  orderNumberSchema,
  bulkStatusUpdateSchema,
  bulkAssignSchema,
  apiOrderSchema,
  // Nepal Logistics
  assignRiderSchema,
  handoverCourierSchema,
  markDeliveredSchema,
  markReturnedSchema,
};
