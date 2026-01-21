/**
 * Common Validation Schemas
 * Reusable validation patterns used across the application
 */

import { z } from 'zod';
import { isValidNepalPhone, validateNepalPhone } from '../utils/phone.js';

// ============================================================================
// PRIMITIVE VALIDATORS
// ============================================================================

/**
 * UUID validation
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Phone number validation (Nepal format: 97/98 prefix)
 * Uses centralized phone utility for consistent validation
 */
export const phoneSchema = z
  .string()
  .refine(isValidNepalPhone, 'Invalid phone number. Must be 10 digits starting with 97 or 98')
  .transform((val) => {
    const result = validateNepalPhone(val);
    return result.cleaned || val.replace(/\D/g, '');
  });

/**
 * Optional phone validation (Nepal format)
 */
export const optionalPhoneSchema = z
  .string()
  .refine((val) => !val || isValidNepalPhone(val), 'Invalid phone number format')
  .optional()
  .nullable()
  .transform((val) => {
    if (!val) return null;
    const result = validateNepalPhone(val);
    return result.cleaned || null;
  });

/**
 * Email validation
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .toLowerCase()
  .trim();

/**
 * Optional email (accepts empty string, null, or valid email)
 */
export const optionalEmailSchema = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string().email('Invalid email format').toLowerCase().trim().nullable().optional()
);

/**
 * Indian Pincode validation
 */
export const pincodeSchema = z
  .string()
  .regex(/^[1-9][0-9]{5}$/, 'Invalid pincode. Must be 6 digits');

/**
 * Positive number validation
 */
export const positiveNumberSchema = z
  .number()
  .positive('Value must be positive');

/**
 * Non-negative number validation
 */
export const nonNegativeNumberSchema = z
  .number()
  .min(0, 'Value cannot be negative');

/**
 * Positive integer validation
 */
export const positiveIntegerSchema = z
  .number()
  .int('Value must be an integer')
  .positive('Value must be positive');

/**
 * Price validation (max 2 decimal places)
 */
export const priceSchema = z
  .number()
  .min(0, 'Price cannot be negative')
  .transform((val) => parseFloat(val.toFixed(2)));

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

/**
 * Pagination query parameters
 */
export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0, 'Page must be positive'),
  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => Math.min(parseInt(val, 10), 100))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  sortBy: z.string().optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// ============================================================================
// SEARCH & FILTER SCHEMAS
// ============================================================================

/**
 * Date range filter
 */
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  { message: 'Start date must be before end date' }
);

/**
 * Search query
 */
export const searchQuerySchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters').optional(),
  ...paginationSchema.shape,
});

// ============================================================================
// ADDRESS SCHEMA
// ============================================================================

/**
 * Full address validation
 */
export const addressSchema = z.object({
  address_line1: z.string().min(5, 'Address is too short').max(500),
  address_line2: z.string().max(500).optional().nullable(),
  city: z.string().min(2, 'City name is too short').max(100),
  state: z.string().min(2, 'State name is too short').max(100),
  pincode: pincodeSchema,
  country: z.string().default('India'),
});

/**
 * Partial address (for updates)
 */
export const partialAddressSchema = addressSchema.partial();

// ============================================================================
// ID ARRAYS
// ============================================================================

/**
 * Array of UUIDs (for bulk operations)
 */
export const uuidArraySchema = z
  .array(uuidSchema)
  .min(1, 'At least one ID is required')
  .max(100, 'Maximum 100 items allowed');

// ============================================================================
// GST / PAN VALIDATION
// ============================================================================

/**
 * GST Number validation (Indian format) - accepts empty string, null, or valid GST
 */
export const gstNumberSchema = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'Invalid GST number format'
    )
    .nullable()
    .optional()
);

/**
 * PAN Number validation (Indian format) - accepts empty string, null, or valid PAN
 */
export const panNumberSchema = z.preprocess(
  (val) => (val === '' ? null : val),
  z.string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number format')
    .nullable()
    .optional()
);

export default {
  uuidSchema,
  phoneSchema,
  optionalPhoneSchema,
  emailSchema,
  optionalEmailSchema,
  pincodeSchema,
  positiveNumberSchema,
  nonNegativeNumberSchema,
  positiveIntegerSchema,
  priceSchema,
  paginationSchema,
  dateRangeSchema,
  searchQuerySchema,
  addressSchema,
  partialAddressSchema,
  uuidArraySchema,
  gstNumberSchema,
  panNumberSchema,
};
