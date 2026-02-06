/**
 * Order Form Validation Schemas
 * 
 * P0 CRITICAL FIXES:
 * 1. Zone is REQUIRED when fulfillment_type is 'inside_valley'
 * 2. Discount and delivery_charge are properly typed as numbers (default 0)
 * 3. Branch is REQUIRED when fulfillment_type is 'outside_valley'
 * 
 * Uses Zod for runtime validation with react-hook-form integration.
 * 
 * @author Code Quality Team
 * @priority P0 - Form Validation Fixes
 */

import { z } from 'zod';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Valid Nepal phone prefixes */
const PHONE_PREFIXES = ['97', '98'];

/** Phone validation regex (10 digits, starts with 97/98) */
const PHONE_REGEX = /^(97|98)\d{8}$/;

/** Default shipping charges */
export const DEFAULT_SHIPPING = {
  INSIDE_VALLEY: 100,
  OUTSIDE_VALLEY: 150,
  STORE: 0,
} as const;

// =============================================================================
// PHONE VALIDATION HELPER
// =============================================================================

/**
 * Validates and normalizes Nepal phone numbers
 */
export function validateNepalPhone(phone: string): {
  isValid: boolean;
  cleaned: string;
  error?: string;
} {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // Check length
  if (cleaned.length !== 10) {
    return { isValid: false, cleaned, error: 'Phone must be 10 digits' };
  }
  
  // Check prefix
  const prefix = cleaned.substring(0, 2);
  if (!PHONE_PREFIXES.includes(prefix)) {
    return { isValid: false, cleaned, error: 'Phone must start with 97 or 98' };
  }
  
  return { isValid: true, cleaned };
}

// =============================================================================
// BASE SCHEMAS (Reusable)
// =============================================================================

/** Order item schema */
export const orderItemSchema = z.object({
  variant_id: z.string().uuid('Invalid product variant'),
  product_id: z.string().uuid().optional(),
  product_name: z.string().optional(),
  variant_name: z.string().optional(),
  sku: z.string().optional(),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(999, 'Quantity cannot exceed 999'),
  unit_price: z
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price cannot be negative'),
  // Product shipping rates (for auto-calculation)
  shipping_inside: z.number().min(0).optional().default(DEFAULT_SHIPPING.INSIDE_VALLEY),
  shipping_outside: z.number().min(0).optional().default(DEFAULT_SHIPPING.OUTSIDE_VALLEY),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

/** Customer info schema */
export const customerInfoSchema = z.object({
  customer_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  customer_phone: z
    .string()
    .min(10, 'Phone must be 10 digits')
    .max(10, 'Phone must be 10 digits')
    .regex(PHONE_REGEX, 'Invalid Nepal phone number (must start with 97/98)'),
  customer_email: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),
  customer_address: z.string().optional().default(''),
  customer_city: z.string().optional().default(''),
  customer_landmark: z.string().optional().default(''),
});

// =============================================================================
// QUICK ORDER SCHEMA
// =============================================================================

/**
 * Quick Order Form Schema
 * 
 * Used for: QuickCreatePanel, NewOrderModal
 * 
 * Key validations:
 * - Zone REQUIRED for inside_valley
 * - Branch REQUIRED for outside_valley
 * - Discount/delivery_charge default to 0
 */
export const quickOrderSchema = z.object({
  // Customer (required)
  customer_name: z
    .string()
    .min(2, 'Customer name is required'),
  customer_phone: z
    .string()
    .min(10, 'Phone is required')
    .regex(PHONE_REGEX, 'Invalid phone (must be 10 digits starting with 97/98)'),
  customer_address: z.string().optional().default(''),
  
  // Fulfillment type (required)
  fulfillment_type: z
    .enum(['inside_valley', 'outside_valley', 'store'], {
      required_error: 'Select delivery type',
    })
    .default('inside_valley'),
  
  // Order status
  status: z
    .enum(['intake', 'converted', 'store_sale'])
    .default('intake'),
  
  // Payment status
  payment_status: z
    .enum(['pending', 'paid', 'partial', 'cod'])
    .default('pending'),
  
  // =========================================================================
  // P0 FIX: Zone - Required for inside_valley
  // =========================================================================
  zone_id: z.string().optional().nullable(),
  zone_code: z.string().optional().nullable(),
  
  // =========================================================================
  // P0 FIX: Branch - Required for outside_valley
  // =========================================================================
  destination_branch: z.string().optional().nullable(),
  
  // =========================================================================
  // P0 FIX: Items array with proper validation
  // =========================================================================
  items: z
    .array(orderItemSchema)
    .min(1, 'Add at least one product'),
  
  // =========================================================================
  // P0 FIX: Financial fields as numbers (with coercion and defaults)
  // =========================================================================
  delivery_charge: z
    .coerce
    .number({ invalid_type_error: 'Shipping must be a number' })
    .min(0, 'Shipping cannot be negative')
    .default(DEFAULT_SHIPPING.INSIDE_VALLEY),
  
  discount_amount: z
    .coerce
    .number({ invalid_type_error: 'Discount must be a number' })
    .min(0, 'Discount cannot be negative')
    .default(0),
  
  prepaid_amount: z
    .coerce
    .number({ invalid_type_error: 'Prepaid amount must be a number' })
    .min(0, 'Prepaid cannot be negative')
    .default(0),
  
  // Notes
  notes: z.string().optional().default(''),
  remarks: z.string().optional().default(''),
  
}).superRefine((data, ctx) => {
  // =========================================================================
  // P0 FIX: Conditional validation based on fulfillment_type
  // =========================================================================
  
  // Inside Valley: Zone is REQUIRED
  if (data.fulfillment_type === 'inside_valley') {
    if (!data.zone_code && !data.zone_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Zone is required for Inside Valley delivery',
        path: ['zone_code'],
      });
    }
  }
  
  // Outside Valley: Branch is REQUIRED
  if (data.fulfillment_type === 'outside_valley') {
    if (!data.destination_branch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination branch is required for Outside Valley delivery',
        path: ['destination_branch'],
      });
    }
  }
  
  // Store: No zone/branch needed, auto-set delivery_charge to 0
  // (handled in form logic, not validation)
});

export type QuickOrderInput = z.infer<typeof quickOrderSchema>;

// =============================================================================
// FULL ORDER SCHEMA
// =============================================================================

/**
 * Full Order Form Schema
 * 
 * Used for: Full order creation page with all fields
 */
export const fullOrderSchema = z.object({
  // Customer info
  ...customerInfoSchema.shape,
  
  // Shipping address (required for delivery)
  shipping_address: z.string().min(5, 'Address is required'),
  shipping_city: z.string().min(2, 'City is required'),
  shipping_district: z.string().optional().default(''),
  shipping_landmark: z.string().optional().default(''),
  
  // Fulfillment
  fulfillment_type: z
    .enum(['inside_valley', 'outside_valley', 'store'])
    .default('inside_valley'),
  status: z
    .enum(['intake', 'converted', 'packed', 'store_sale'])
    .default('intake'),
  source: z
    .enum(['manual', 'website', 'facebook', 'instagram', 'tiktok', 'store', 'referral'])
    .default('manual'),
  
  // Zone/Branch
  zone_id: z.string().optional().nullable(),
  zone_code: z.string().optional().nullable(),
  destination_branch: z.string().optional().nullable(),
  
  // Items
  items: z
    .array(orderItemSchema)
    .min(1, 'Add at least one product'),
  
  // Financial
  delivery_charge: z.coerce.number().min(0).default(DEFAULT_SHIPPING.INSIDE_VALLEY),
  discount_amount: z.coerce.number().min(0).default(0),
  discount_percent: z.coerce.number().min(0).max(100).default(0),
  prepaid_amount: z.coerce.number().min(0).default(0),
  
  // Payment
  payment_method: z
    .enum(['cod', 'esewa', 'khalti', 'fonepay', 'bank_transfer', 'cash', 'card'])
    .default('cod'),
  payment_status: z
    .enum(['pending', 'paid', 'partial', 'cod'])
    .default('pending'),
  
  // Notes
  customer_notes: z.string().optional().default(''),
  internal_notes: z.string().optional().default(''),
  staff_remarks: z.string().optional().default(''),
  
}).superRefine((data, ctx) => {
  // Inside Valley: Zone required
  if (data.fulfillment_type === 'inside_valley' && !data.zone_code && !data.zone_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Zone is required for Inside Valley delivery',
      path: ['zone_code'],
    });
  }
  
  // Outside Valley: Branch required
  if (data.fulfillment_type === 'outside_valley' && !data.destination_branch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Destination branch is required',
      path: ['destination_branch'],
    });
  }
});

export type FullOrderInput = z.infer<typeof fullOrderSchema>;

// =============================================================================
// API PAYLOAD TRANSFORMER
// =============================================================================

/**
 * Transform form data to API payload format
 * 
 * P0 FIX: Ensures zone_id, discount, and delivery_charge are properly mapped
 */
export function transformToApiPayload(data: QuickOrderInput | FullOrderInput): Record<string, unknown> {
  return {
    // Customer
    customer_name: data.customer_name,
    customer_phone: data.customer_phone,
    customer_address: data.customer_address || '',
    
    // Fulfillment
    fulfillment_type: data.fulfillment_type,
    status: data.status,
    
    // =========================================================================
    // P0 FIX: Zone mapping - send both zone_id and zone_code
    // =========================================================================
    zone_id: data.zone_id || null,
    zone_code: data.zone_code || null,
    destination_branch: data.destination_branch || null,
    
    // Items (transform to API format)
    items: data.items.map(item => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
      selling_price: item.unit_price,
    })),
    
    // =========================================================================
    // P0 FIX: Financial fields - ensure numbers
    // =========================================================================
    delivery_charge: Number(data.delivery_charge) || 0,
    discount_amount: Number(data.discount_amount) || 0,
    prepaid_amount: Number(data.prepaid_amount) || 0,
    
    // Notes
    remarks: data.remarks || data.notes || '',
    
    // Payment
    payment_status: data.payment_status || 'pending',
  };
}

// =============================================================================
// FORM DEFAULT VALUES
// =============================================================================

/**
 * Get default values for quick order form
 */
export function getQuickOrderDefaults(): QuickOrderInput {
  return {
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    fulfillment_type: 'inside_valley',
    status: 'intake',
    payment_status: 'pending',
    zone_id: null,
    zone_code: null,
    destination_branch: null,
    items: [],
    delivery_charge: DEFAULT_SHIPPING.INSIDE_VALLEY,
    discount_amount: 0,
    prepaid_amount: 0,
    notes: '',
    remarks: '',
  };
}

/**
 * Get default values for full order form
 */
export function getFullOrderDefaults(): FullOrderInput {
  return {
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    customer_city: '',
    customer_landmark: '',
    shipping_address: '',
    shipping_city: '',
    shipping_district: '',
    shipping_landmark: '',
    fulfillment_type: 'inside_valley',
    status: 'intake',
    source: 'manual',
    zone_id: null,
    zone_code: null,
    destination_branch: null,
    items: [],
    delivery_charge: DEFAULT_SHIPPING.INSIDE_VALLEY,
    discount_amount: 0,
    discount_percent: 0,
    prepaid_amount: 0,
    payment_method: 'cod',
    payment_status: 'pending',
    customer_notes: '',
    internal_notes: '',
    staff_remarks: '',
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  quickOrderSchema,
  fullOrderSchema,
  orderItemSchema,
  customerInfoSchema,
  transformToApiPayload,
  getQuickOrderDefaults,
  getFullOrderDefaults,
  validateNepalPhone,
  DEFAULT_SHIPPING,
};
