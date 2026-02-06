/**
 * Vendor Validation Schemas
 * For vendor management and ledger operations
 */

import { z } from 'zod';
import {
  uuidSchema,
  phoneSchema,
  optionalPhoneSchema,
  optionalEmailSchema,
  priceSchema,
  paginationSchema,
  gstNumberSchema,
  panNumberSchema,
} from './common.validation.js';

// ============================================================================
// BANK DETAILS SCHEMA
// ============================================================================

/**
 * Bank Details Schema
 */
export const bankDetailsSchema = z.object({
  bank_name: z.string().max(100).optional(),
  account_number: z.string().max(30).optional(),
  ifsc_code: z
    .string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code')
    .optional(),
  account_holder_name: z.string().max(100).optional(),
  branch: z.string().max(100).optional(),
});

// ============================================================================
// VENDOR SCHEMAS
// ============================================================================

/**
 * Create Vendor Schema
 */
export const createVendorSchema = z.object({
  name: z.string().min(2).max(255),
  company_name: z.string().max(255).optional().nullable(),
  phone: phoneSchema,
  alt_phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  address: z.string().max(1000).optional().nullable(),
  gst_number: gstNumberSchema,
  pan_number: panNumberSchema,
  bank_details: bankDetailsSchema.optional().default({}),
  credit_limit: priceSchema.optional().default(0),
  payment_terms: z.number().int().min(0).max(365).default(30),
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().default(true),
});

/**
 * Update Vendor Schema
 */
export const updateVendorSchema = createVendorSchema.partial();

/**
 * Vendor ID Parameter
 */
export const vendorIdSchema = z.object({
  id: uuidSchema,
});

// ============================================================================
// VENDOR SUPPLY SCHEMAS
// ============================================================================

/**
 * Supply Item Schema
 */
export const supplyItemSchema = z.object({
  variant_id: uuidSchema,
  quantity_ordered: z.number().int().positive(),
  unit_cost: priceSchema,
});

/**
 * Create Vendor Supply Schema
 */
export const createVendorSupplySchema = z.object({
  vendor_id: uuidSchema,
  items: z
    .array(supplyItemSchema)
    .min(1, 'At least one item required')
    .max(100, 'Maximum 100 items per supply'),
  invoice_number: z.string().max(100).optional().nullable(),
  invoice_date: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/**
 * Receive Supply Schema
 */
export const receiveSupplySchema = z.object({
  items: z.array(
    z.object({
      supply_item_id: uuidSchema,
      quantity_received: z.number().int().min(0),
    })
  ).min(1),
});

// ============================================================================
// VENDOR PAYMENT SCHEMAS
// ============================================================================

/**
 * Payment Mode Enum
 * 
 * Supports multiple payment providers:
 * - Standard: cash, cheque, bank_transfer
 * - UPI/Bank: upi, neft, rtgs, imps
 * - Nepal Digital Wallets: esewa, khalti, ime_pay, fonepay
 * - Generic: bank, online, other
 */
export const paymentModeSchema = z.enum([
  // Standard methods
  'cash',
  'cheque',
  'bank_transfer',
  // Bank/UPI methods
  'upi',
  'neft',
  'rtgs',
  'imps',
  'bank',        // Generic bank transfer (frontend sends this)
  // Nepal digital wallets
  'esewa',
  'khalti',
  'ime_pay',
  'fonepay',
  // Generic fallbacks
  'online',
  'other',
]);

/**
 * Create Vendor Payment Schema
 */
export const createVendorPaymentSchema = z.object({
  vendor_id: uuidSchema,
  amount: priceSchema.refine((val) => val > 0, 'Amount must be greater than 0'),
  payment_mode: paymentModeSchema,
  reference_number: z.string().max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

/**
 * Vendor List Query
 */
export const vendorListQuerySchema = paginationSchema.extend({
  is_active: z
    .string()
    .optional()
    .transform((val) => val === undefined ? undefined : val === 'true'),
  search: z.string().optional(),
  has_balance: z
    .string()
    .optional()
    .transform((val) => val === undefined ? undefined : val === 'true'),
});

/**
 * Vendor Ledger Query
 */
export const vendorLedgerQuerySchema = paginationSchema.extend({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  type: z.enum(['all', 'supplies', 'payments']).default('all'),
});

/**
 * Vendor Supply List Query
 */
export const vendorSupplyListQuerySchema = paginationSchema.extend({
  vendor_id: uuidSchema.optional(),
  status: z.enum(['pending', 'partial', 'received', 'cancelled']).optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

// ============================================================================
// VENDOR PORTAL SCHEMAS
// ============================================================================

/**
 * Vendor Login Schema
 */
export const vendorLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * Vendor Password Reset Schema
 */
export const vendorPasswordResetSchema = z.object({
  email: z.string().email(),
});

/**
 * Vendor Password Update Schema
 */
export const vendorPasswordUpdateSchema = z.object({
  current_password: z.string().min(6),
  new_password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirm_password: z.string(),
}).refine(
  (data) => data.new_password === data.confirm_password,
  {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  }
);

export default {
  bankDetailsSchema,
  createVendorSchema,
  updateVendorSchema,
  vendorIdSchema,
  supplyItemSchema,
  createVendorSupplySchema,
  receiveSupplySchema,
  paymentModeSchema,
  createVendorPaymentSchema,
  vendorListQuerySchema,
  vendorLedgerQuerySchema,
  vendorSupplyListQuerySchema,
  vendorLoginSchema,
  vendorPasswordResetSchema,
  vendorPasswordUpdateSchema,
};
