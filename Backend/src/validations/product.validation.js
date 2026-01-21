/**
 * Product & Variant Validation Schemas
 * Strict validation for inventory management
 */

import { z } from 'zod';
import {
  uuidSchema,
  priceSchema,
  positiveIntegerSchema,
  nonNegativeNumberSchema,
  paginationSchema,
} from './common.validation.js';

// ============================================================================
// SKU VALIDATION
// ============================================================================

/**
 * SKU format validation
 * Format: BRAND-CATEGORY-COLOR-SIZE or alphanumeric
 * Examples: NK-TS-BLK-XL, PROD001, ABC-123-XYZ
 */
export const skuSchema = z
  .string()
  .min(3, 'SKU must be at least 3 characters')
  .max(100, 'SKU cannot exceed 100 characters')
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9-_]*$/,
    'SKU must start with alphanumeric and contain only letters, numbers, hyphens, and underscores'
  )
  .transform((val) => val.toUpperCase());

// ============================================================================
// PRODUCT SCHEMAS
// ============================================================================

/**
 * Inline Variant Schema for Product Creation
 * Used when creating a product with variants in one request
 * SKU is optional - will be auto-generated if missing
 */
const inlineVariantSchema = z.object({
  sku: z.string().max(100).optional().nullable(), // Optional - auto-generated if missing
  barcode: z.string().max(100).optional().nullable(),
  attributes: z.record(z.string()).optional().default({}),
  // Legacy fields for backwards compatibility
  color: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  weight_grams: z.number().int().min(0).optional().nullable(),
  cost_price: priceSchema.optional().default(0), // Default 0 if not provided
  selling_price: priceSchema.optional().default(0), // Default 0 if not provided
  mrp: priceSchema.optional().nullable(),
  current_stock: z.number().int().min(0).default(0),
  reorder_level: z.number().int().min(0).default(10),
  is_active: z.boolean().default(true),
}).transform((data) => {
  // Merge legacy fields into attributes
  const attributes = { ...data.attributes };
  if (data.color && !attributes.color) attributes.color = data.color;
  if (data.size && !attributes.size) attributes.size = data.size;
  if (data.material && !attributes.material) attributes.material = data.material;
  
  // Auto-generate SKU if missing
  let sku = data.sku;
  if (!sku) {
    const attrValues = Object.values(attributes).filter(Boolean).join('-');
    const timestamp = Date.now().toString(36).toUpperCase();
    sku = attrValues ? `${attrValues.substring(0, 20).toUpperCase()}-${timestamp}` : `SKU-${timestamp}`;
  } else {
    sku = sku.toUpperCase();
  }
  
  return { ...data, attributes, sku };
});

/**
 * Base Product Schema (without transform for partial to work)
 */
const baseProductSchema = z.object({
  name: z
    .string()
    .min(2, 'Product name must be at least 2 characters')
    .max(500, 'Product name cannot exceed 500 characters')
    .trim(),
  description: z.string().max(5000).optional().nullable(),
  brand: z.string().max(255).optional().nullable(),
  category: z.string().max(255).optional().nullable(),
  // Allow empty string, null, undefined, or valid URL
  image_url: z.preprocess(
    (val) => (val === '' ? null : val),
    z.string().url().nullable().optional()
  ),
  is_active: z.boolean().default(true),
  meta: z.record(z.unknown()).optional().default({}),
  // Optional variants for bulk creation
  variants: z.array(inlineVariantSchema).optional(),
});

/**
 * Create Product Schema
 * Accepts optional variants array for bulk creation
 */
export const createProductSchema = baseProductSchema;

/**
 * Update Product Schema
 */
export const updateProductSchema = baseProductSchema.partial();

/**
 * Product ID parameter
 */
export const productIdSchema = z.object({
  id: uuidSchema,
});

// ============================================================================
// PRODUCT VARIANT SCHEMAS
// ============================================================================

// ============================================================================
// DYNAMIC ATTRIBUTES SCHEMA
// ============================================================================

/**
 * Dynamic Attributes Schema
 * Flexible key-value pairs for ANY product type (like Shopify)
 * 
 * Examples:
 * - Clothing: { "color": "Red", "size": "XL", "material": "Cotton" }
 * - Laptop: { "processor": "i7", "ram": "16GB", "storage": "512GB" }
 * - Jewelry: { "metal": "Gold", "stone": "Diamond", "size": "7" }
 */
export const variantAttributesSchema = z.record(
  z.string().min(1, 'Attribute key cannot be empty').max(50, 'Attribute key too long'),
  z.string().max(255, 'Attribute value too long')
).optional().default({});

/**
 * Create Variant Schema
 * Now uses dynamic JSONB attributes instead of hardcoded color/size/material
 */
export const createVariantSchema = z.object({
  product_id: uuidSchema,
  sku: skuSchema,
  barcode: z.string().max(100).optional().nullable(),
  
  // Dynamic attributes - replaces color, size, material
  attributes: variantAttributesSchema,
  
  // Deprecated fields - kept for backwards compatibility
  // TODO: Remove after migration is complete
  color: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  
  weight_grams: z.number().int().min(0).optional().nullable(),
  cost_price: priceSchema,
  selling_price: priceSchema,
  mrp: priceSchema.optional().nullable(),
  current_stock: z.number().int().min(0).default(0),
  reorder_level: z.number().int().min(0).default(10),
  is_active: z.boolean().default(true),
  meta: z.record(z.unknown()).optional().default({}),
}).transform((data) => {
  // Auto-migrate legacy fields to attributes if attributes is empty
  // This ensures backward compatibility during transition
  const attributes = { ...data.attributes };
  
  if (data.color && !attributes.color) {
    attributes.color = data.color;
  }
  if (data.size && !attributes.size) {
    attributes.size = data.size;
  }
  if (data.material && !attributes.material) {
    attributes.material = data.material;
  }
  
  return {
    ...data,
    attributes,
  };
}).refine(
  (data) => data.selling_price >= data.cost_price,
  {
    message: 'Selling price should not be less than cost price',
    path: ['selling_price'],
  }
).refine(
  (data) => !data.mrp || data.mrp >= data.selling_price,
  {
    message: 'MRP should not be less than selling price',
    path: ['mrp'],
  }
);

/**
 * Update Variant Schema
 */
export const updateVariantSchema = z.object({
  sku: skuSchema.optional(),
  barcode: z.string().max(100).optional().nullable(),
  
  // Dynamic attributes
  attributes: variantAttributesSchema,
  
  // Deprecated fields - kept for backwards compatibility
  color: z.string().max(100).optional().nullable(),
  size: z.string().max(50).optional().nullable(),
  material: z.string().max(100).optional().nullable(),
  
  weight_grams: z.number().int().min(0).optional().nullable(),
  cost_price: priceSchema.optional(),
  selling_price: priceSchema.optional(),
  mrp: priceSchema.optional().nullable(),
  reorder_level: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  meta: z.record(z.unknown()).optional(),
}).transform((data) => {
  // Auto-migrate legacy fields to attributes
  if (data.attributes || data.color || data.size || data.material) {
    const attributes = { ...data.attributes };
    if (data.color && !attributes.color) attributes.color = data.color;
    if (data.size && !attributes.size) attributes.size = data.size;
    if (data.material && !attributes.material) attributes.material = data.material;
    return { ...data, attributes };
  }
  return data;
});

/**
 * Variant ID parameter
 */
export const variantIdSchema = z.object({
  id: uuidSchema,
});

/**
 * SKU parameter (for lookup)
 */
export const skuParamSchema = z.object({
  sku: skuSchema,
});

// ============================================================================
// STOCK ADJUSTMENT SCHEMAS
// ============================================================================

/**
 * Stock Adjustment Types
 */
export const stockMovementType = z.enum([
  'inward',
  'outward',
  'adjustment',
  'return',
  'damage',
]);

/**
 * Stock Adjustment Schema
 */
export const stockAdjustmentSchema = z.object({
  variant_id: uuidSchema,
  movement_type: stockMovementType,
  quantity: z.number().int().refine(
    (val) => val !== 0,
    'Quantity cannot be zero'
  ),
  reason: z.string().min(3, 'Reason is required for stock adjustments').max(500),
  vendor_id: uuidSchema.optional().nullable(),
});

/**
 * Bulk Stock Adjustment Schema
 */
export const bulkStockAdjustmentSchema = z.object({
  adjustments: z
    .array(stockAdjustmentSchema)
    .min(1, 'At least one adjustment is required')
    .max(50, 'Maximum 50 adjustments per request'),
});

/**
 * Stock Check Schema (for order creation)
 */
export const stockCheckSchema = z.object({
  items: z.array(
    z.object({
      variant_id: uuidSchema,
      quantity: positiveIntegerSchema,
    })
  ).min(1, 'At least one item is required'),
});

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

/**
 * Product List Query
 */
export const productListQuerySchema = paginationSchema.extend({
  brand: z.string().optional(),
  category: z.string().optional(),
  is_active: z
    .string()
    .optional()
    .transform((val) => val === undefined ? undefined : val === 'true'),
  search: z.string().optional(),
});

/**
 * Variant List Query
 */
export const variantListQuerySchema = paginationSchema.extend({
  product_id: uuidSchema.optional(),
  low_stock: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  is_active: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  search: z.string().optional(),
});

/**
 * Inventory Report Query
 */
export const inventoryReportQuerySchema = z.object({
  include_inactive: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default('false'),
  category: z.string().optional(),
  brand: z.string().optional(),
});

export default {
  skuSchema,
  createProductSchema,
  updateProductSchema,
  productIdSchema,
  createVariantSchema,
  updateVariantSchema,
  variantIdSchema,
  skuParamSchema,
  stockMovementType,
  stockAdjustmentSchema,
  bulkStockAdjustmentSchema,
  stockCheckSchema,
  productListQuerySchema,
  variantListQuerySchema,
  inventoryReportQuerySchema,
};
