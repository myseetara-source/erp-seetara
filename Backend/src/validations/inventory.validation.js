/**
 * Inventory Transaction Validation Schemas
 * 
 * Unified validation for:
 * - PURCHASE: Stock In from vendors
 * - PURCHASE_RETURN: Return stock to vendors
 * - DAMAGE: Write-off damaged stock
 * - ADJUSTMENT: Manual stock corrections
 */

import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const TransactionType = {
  PURCHASE: 'purchase',
  PURCHASE_RETURN: 'purchase_return',
  DAMAGE: 'damage',
  ADJUSTMENT: 'adjustment',
};

export const transactionTypeSchema = z.enum([
  'purchase',
  'purchase_return',
  'damage',
  'adjustment',
]);

// =============================================================================
// TRANSACTION ITEM SCHEMA
// =============================================================================

export const transactionItemSchema = z.object({
  variant_id: z.string().uuid('Invalid variant ID'),
  quantity: z.number().int().refine(val => val !== 0, {
    message: 'Quantity cannot be zero',
  }),
  unit_cost: z.coerce.number().min(0, 'Cost must be positive').default(0),
  notes: z.string().optional(),
});

// =============================================================================
// BASE TRANSACTION SCHEMA
// =============================================================================

const baseTransactionSchema = z.object({
  // invoice_no is optional - backend generates it automatically if not provided
  invoice_no: z.string().optional(),
  transaction_date: z.string().or(z.date()).optional(),
  notes: z.string().optional(),
  items: z.array(transactionItemSchema).min(1, 'At least one item is required'),
});

// =============================================================================
// TYPE-SPECIFIC SCHEMAS
// =============================================================================

/**
 * PURCHASE Schema
 * - Vendor: Required
 * - Unit Cost: Required (>0)
 * - Quantity: Positive only
 */
export const purchaseTransactionSchema = baseTransactionSchema.extend({
  transaction_type: z.literal('purchase'),
  vendor_id: z.string().uuid('Vendor is required for purchase'),
  reason: z.string().optional(),
  items: z.array(
    transactionItemSchema.extend({
      quantity: z.number().int().min(1, 'Quantity must be positive for purchase'),
      unit_cost: z.coerce.number().min(0.01, 'Cost price is required for purchase'),
    })
  ).min(1, 'At least one item is required'),
});

/**
 * PURCHASE_RETURN Schema (Direct Vendor Return / Debit Note)
 * - Vendor: Required
 * - Reference Transaction: OPTIONAL (no invoice linking required)
 * - Quantity: Positive (will be converted to negative internally)
 * - Source Type: Required (fresh or damaged)
 * 
 * NEW LOGIC: Direct return to vendor without linking to original invoice.
 * Stock is validated against current warehouse stock, not purchase history.
 */
export const purchaseReturnTransactionSchema = baseTransactionSchema.extend({
  transaction_type: z.literal('purchase_return'),
  vendor_id: z.string().uuid('Vendor is required for purchase return'),
  // DIRECT RETURN: No invoice linking required
  reference_transaction_id: z.string().uuid().optional().nullable(),
  reason: z.string().min(5, 'Return reason is required (min 5 chars)'),
  items: z.array(
    transactionItemSchema.extend({
      quantity: z.number().int().min(1, 'Quantity must be positive'),
      source_type: z.enum(['fresh', 'damaged']).default('fresh'),
    })
  ).min(1, 'At least one item is required'),
});

/**
 * DAMAGE Schema
 * - Vendor: Optional
 * - Reason: Required (min 5 chars)
 * - Unit Cost: Hidden/Optional
 */
export const damageTransactionSchema = baseTransactionSchema.extend({
  transaction_type: z.literal('damage'),
  vendor_id: z.string().uuid().optional().nullable(),
  reason: z.string().min(5, 'Damage reason is required (min 5 characters)'),
  items: z.array(
    transactionItemSchema.extend({
      quantity: z.number().int().min(1, 'Quantity must be positive'),
      unit_cost: z.coerce.number().optional().default(0), // Optional for damage
    })
  ).min(1, 'At least one item is required'),
});

/**
 * ADJUSTMENT Schema
 * - Vendor: Not applicable
 * - Reason: Required (min 5 chars)
 * - Quantity: Can be positive or negative
 */
export const adjustmentTransactionSchema = baseTransactionSchema.extend({
  transaction_type: z.literal('adjustment'),
  vendor_id: z.string().uuid().optional().nullable(),
  reason: z.string().min(5, 'Adjustment reason is required (min 5 characters)'),
  items: z.array(
    transactionItemSchema.extend({
      // Adjustment can be + or -
      quantity: z.number().int().refine(val => val !== 0, {
        message: 'Quantity cannot be zero',
      }),
      unit_cost: z.coerce.number().optional().default(0),
    })
  ).min(1, 'At least one item is required'),
});

// =============================================================================
// UNIFIED DISCRIMINATED UNION SCHEMA
// =============================================================================

export const createInventoryTransactionSchema = z.discriminatedUnion('transaction_type', [
  purchaseTransactionSchema,
  purchaseReturnTransactionSchema,
  damageTransactionSchema,
  adjustmentTransactionSchema,
]);

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: transactionTypeSchema.optional(),
  vendor_id: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().optional(),
});

// =============================================================================
// HELPER: Get appropriate schema based on type
// =============================================================================

export function getSchemaForType(transactionType) {
  switch (transactionType) {
    case 'purchase':
      return purchaseTransactionSchema;
    case 'purchase_return':
      return purchaseReturnTransactionSchema;
    case 'damage':
      return damageTransactionSchema;
    case 'adjustment':
      return adjustmentTransactionSchema;
    default:
      throw new Error(`Unknown transaction type: ${transactionType}`);
  }
}

// =============================================================================
// HELPER: Get display config for each type
// =============================================================================

export const transactionTypeConfig = {
  purchase: {
    label: 'Purchase',
    prefix: 'PUR',
    icon: 'package-plus',
    color: 'green',
    vendorRequired: true,
    reasonRequired: false,
    costRequired: true,
    quantityDirection: 'in', // Stock increases
  },
  purchase_return: {
    label: 'Purchase Return',
    prefix: 'RET',
    icon: 'package-x',
    color: 'orange',
    vendorRequired: true,
    reasonRequired: true,
    costRequired: false,
    quantityDirection: 'out', // Stock decreases
  },
  damage: {
    label: 'Damage',
    prefix: 'DMG',
    icon: 'alert-triangle',
    color: 'red',
    vendorRequired: false,
    reasonRequired: true,
    costRequired: false,
    quantityDirection: 'out', // Stock decreases
  },
  adjustment: {
    label: 'Adjustment',
    prefix: 'ADJ',
    icon: 'settings',
    color: 'blue',
    vendorRequired: false,
    reasonRequired: true,
    costRequired: false,
    quantityDirection: 'both', // Can increase or decrease
  },
};

export default {
  createInventoryTransactionSchema,
  listTransactionsQuerySchema,
  transactionTypeConfig,
  getSchemaForType,
};
