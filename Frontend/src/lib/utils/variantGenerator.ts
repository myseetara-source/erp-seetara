/**
 * Variant Generator Utility
 * 
 * Generates Cartesian Product of N-level product options
 * to automatically create all possible variant combinations.
 * 
 * @example
 * Input:
 * [
 *   { name: 'RAM', values: ['8GB', '16GB'] },
 *   { name: 'Storage', values: ['256GB', '512GB'] }
 * ]
 * 
 * Output:
 * [
 *   { name: '8GB / 256GB', attributes: { ram: '8GB', storage: '256GB' }, sku: 'XXX-8GB-256' },
 *   { name: '8GB / 512GB', attributes: { ram: '8GB', storage: '512GB' }, sku: 'XXX-8GB-512' },
 *   { name: '16GB / 256GB', attributes: { ram: '16GB', storage: '256GB' }, sku: 'XXX-16G-256' },
 *   { name: '16GB / 512GB', attributes: { ram: '16GB', storage: '512GB' }, sku: 'XXX-16G-512' }
 * ]
 */

import type { VariantAttributes, AttributeField } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface ProductOption {
  /** Option name (e.g., "Processor", "RAM", "Color") */
  name: string;
  /** All possible values for this option */
  values: string[];
}

export interface GeneratedVariant {
  /** Human-readable name like "Red / XL / Cotton" */
  name: string;
  /** Suggested SKU code */
  sku: string;
  /** Attributes as key-value object */
  attributes: VariantAttributes;
  /** Attributes as array for form compatibility */
  attributeFields: AttributeField[];
  /** Default pricing (user can override) */
  cost_price: number;
  selling_price: number;
  mrp: number;
  current_stock: number;
  is_active: boolean;
}

// =============================================================================
// CARTESIAN PRODUCT ALGORITHM
// =============================================================================

/**
 * Generates the Cartesian Product of N arrays
 * 
 * This is the mathematical operation that creates all possible combinations
 * of elements from multiple sets.
 * 
 * @example
 * cartesianProduct([['A', 'B'], ['1', '2'], ['X', 'Y']])
 * // Returns: [['A','1','X'], ['A','1','Y'], ['A','2','X'], ['A','2','Y'], ['B','1','X'], ...]
 * 
 * @param arrays - Array of arrays to combine
 * @returns Array of all possible combinations
 */
export function cartesianProduct<T>(arrays: T[][]): T[][] {
  // Handle edge cases
  if (arrays.length === 0) return [];
  if (arrays.some(arr => arr.length === 0)) return [];
  
  // Recursive Cartesian product implementation
  const combine = (arrays: T[][], prefix: T[] = []): T[][] => {
    // Base case: no more arrays to process
    if (arrays.length === 0) {
      return [prefix];
    }
    
    const [first, ...rest] = arrays;
    const results: T[][] = [];
    
    // For each value in the first array, combine with all combinations of the rest
    for (const value of first) {
      const combinations = combine(rest, [...prefix, value]);
      results.push(...combinations);
    }
    
    return results;
  };
  
  return combine(arrays);
}

/**
 * Alternative iterative implementation (more memory efficient for large sets)
 */
export function cartesianProductIterative<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [];
  if (arrays.some(arr => arr.length === 0)) return [];
  
  // Start with empty combination
  let result: T[][] = [[]];
  
  for (const array of arrays) {
    const newResult: T[][] = [];
    
    for (const combination of result) {
      for (const value of array) {
        newResult.push([...combination, value]);
      }
    }
    
    result = newResult;
  }
  
  return result;
}

// =============================================================================
// VARIANT GENERATOR
// =============================================================================

/**
 * Generates all possible variant combinations from product options
 * 
 * @param options - Array of product options with their values
 * @param productName - Product name for SKU generation
 * @param defaultPricing - Optional default pricing for all variants
 * @returns Array of generated variants ready for the form
 */
export function generateVariants(
  options: ProductOption[],
  productName: string = '',
  defaultPricing?: {
    cost_price?: number;
    selling_price?: number;
    mrp?: number;
  }
): GeneratedVariant[] {
  // Filter out options with no values
  const validOptions = options.filter(opt => opt.name.trim() && opt.values.length > 0);
  
  if (validOptions.length === 0) {
    return [];
  }
  
  // Extract just the values arrays for Cartesian product
  const valueArrays = validOptions.map(opt => opt.values);
  
  // Generate all combinations
  const combinations = cartesianProduct(valueArrays);
  
  // Map combinations to variant objects
  return combinations.map((combo, index) => {
    // Build attributes object and array
    const attributes: VariantAttributes = {};
    const attributeFields: AttributeField[] = [];
    
    validOptions.forEach((option, optIndex) => {
      const key = option.name.toLowerCase().replace(/\s+/g, '_');
      const value = combo[optIndex];
      attributes[key] = value;
      attributeFields.push({ key, value });
    });
    
    // Generate human-readable name
    const name = combo.join(' / ');
    
    // Generate SKU
    const sku = generateSkuFromOptions(productName, combo);
    
    return {
      name,
      sku,
      attributes,
      attributeFields,
      cost_price: defaultPricing?.cost_price ?? 0,
      selling_price: defaultPricing?.selling_price ?? 0,
      mrp: defaultPricing?.mrp ?? 0,
      current_stock: 0,
      is_active: true,
    };
  });
}

/**
 * Generates a SKU from product name and attribute values
 * 
 * @param productName - Base product name
 * @param values - Array of attribute values
 * @returns SKU string
 */
export function generateSkuFromOptions(productName: string, values: string[]): string {
  // Product prefix: first 3-4 characters
  const prefix = productName
    .substring(0, 4)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  
  // Attribute codes: first 3 chars of each value
  const attrCodes = values.map(val => {
    // Handle numeric values differently
    if (/^\d+/.test(val)) {
      return val.replace(/[^0-9]/g, '').substring(0, 3);
    }
    return val.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  
  const suffix = attrCodes.join('-');
  
  return prefix ? `${prefix}-${suffix}` : suffix;
}

/**
 * Estimates the total number of variants that will be generated
 * 
 * @param options - Product options
 * @returns Total variant count
 */
export function estimateVariantCount(options: ProductOption[]): number {
  const validOptions = options.filter(opt => opt.name.trim() && opt.values.length > 0);
  
  if (validOptions.length === 0) return 0;
  
  return validOptions.reduce((total, opt) => total * opt.values.length, 1);
}

/**
 * Validates product options before generation
 * 
 * @param options - Product options to validate
 * @returns Validation result with errors if any
 */
export function validateOptions(options: ProductOption[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for empty options
  if (options.length === 0) {
    errors.push('Add at least one option type');
  }
  
  // Check each option
  options.forEach((opt, index) => {
    if (!opt.name.trim()) {
      errors.push(`Option ${index + 1} needs a name`);
    }
    
    if (opt.values.length === 0) {
      errors.push(`"${opt.name || `Option ${index + 1}`}" needs at least one value`);
    }
    
    // Check for duplicate values within an option
    const uniqueValues = new Set(opt.values.map(v => v.toLowerCase()));
    if (uniqueValues.size !== opt.values.length) {
      warnings.push(`"${opt.name}" has duplicate values`);
    }
  });
  
  // Check for duplicate option names
  const optionNames = options.map(opt => opt.name.toLowerCase().trim());
  const uniqueNames = new Set(optionNames);
  if (uniqueNames.size !== options.length) {
    errors.push('Duplicate option names found');
  }
  
  // Warn about large combinations
  const totalVariants = estimateVariantCount(options);
  if (totalVariants > 100) {
    warnings.push(`This will create ${totalVariants} variants. Consider reducing options.`);
  }
  if (totalVariants > 500) {
    errors.push(`Too many variants (${totalVariants}). Maximum allowed is 500.`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// MERGE UTILITY
// =============================================================================

/**
 * Merges newly generated variants with existing variants
 * Preserves existing variant data (prices, stock) where SKU matches
 * 
 * @param existing - Current variants in the form
 * @param generated - Newly generated variants
 * @returns Merged variant list
 */
export function mergeVariants(
  existing: GeneratedVariant[],
  generated: GeneratedVariant[]
): GeneratedVariant[] {
  const existingMap = new Map(
    existing.map(v => [v.sku.toLowerCase(), v])
  );
  
  return generated.map(newVariant => {
    const existingVariant = existingMap.get(newVariant.sku.toLowerCase());
    
    if (existingVariant) {
      // Preserve existing pricing/stock, update attributes
      return {
        ...newVariant,
        cost_price: existingVariant.cost_price,
        selling_price: existingVariant.selling_price,
        mrp: existingVariant.mrp,
        current_stock: existingVariant.current_stock,
      };
    }
    
    return newVariant;
  });
}

// =============================================================================
// GROUPED MATRIX TABLE UTILITIES
// =============================================================================

export interface GroupedVariant {
  /** Index in the original flat array */
  originalIndex: number;
  /** The variant data */
  variant: GeneratedVariant;
  /** Combined name of secondary attributes (e.g., "M / Cotton") */
  secondaryName: string;
  /** Array of secondary attribute values */
  secondaryValues: string[];
}

export interface VariantGroup {
  /** Primary attribute value (e.g., "Black") */
  primaryValue: string;
  /** Primary attribute key (e.g., "color") */
  primaryKey: string;
  /** All variants in this group */
  variants: GroupedVariant[];
  /** Number of variants in group (for rowSpan) */
  rowSpan: number;
}

export interface GroupedVariantsResult {
  /** The primary attribute name (e.g., "Color") */
  primaryAttribute: string;
  /** The secondary attribute names (e.g., ["Size", "Fabric"]) */
  secondaryAttributes: string[];
  /** Grouped variants by primary attribute */
  groups: VariantGroup[];
  /** Total variant count */
  totalCount: number;
}

/**
 * Groups variants by the first attribute for matrix table display.
 * This creates the Daraz-style grouped table structure.
 * 
 * @example
 * Input variants with attributes: { color: "Black", size: "M", fabric: "Cotton" }
 * 
 * Output:
 * {
 *   primaryAttribute: "color",
 *   secondaryAttributes: ["size", "fabric"],
 *   groups: [
 *     {
 *       primaryValue: "Black",
 *       rowSpan: 3,
 *       variants: [
 *         { secondaryName: "M / Cotton", ... },
 *         { secondaryName: "L / Cotton", ... },
 *         { secondaryName: "XL / Cotton", ... },
 *       ]
 *     },
 *     ...
 *   ]
 * }
 */
export function groupVariantsByFirstAttribute(
  variants: GeneratedVariant[],
  options?: ProductOption[]
): GroupedVariantsResult | null {
  if (!variants || variants.length === 0) {
    return null;
  }

  // Get attribute keys from first variant
  const firstVariant = variants[0];
  const attributeKeys = firstVariant.attributeFields.map(f => f.key);
  
  if (attributeKeys.length === 0) {
    return null;
  }

  // Primary is the first attribute, secondary is the rest
  const primaryKey = attributeKeys[0];
  const secondaryKeys = attributeKeys.slice(1);

  // Group variants by primary attribute value
  const groupMap = new Map<string, GroupedVariant[]>();
  
  variants.forEach((variant, originalIndex) => {
    const primaryValue = variant.attributes[primaryKey] || '';
    
    // Get secondary attribute values
    const secondaryValues = secondaryKeys.map(key => variant.attributes[key] || '');
    const secondaryName = secondaryValues.join(' / ');
    
    const groupedVariant: GroupedVariant = {
      originalIndex,
      variant,
      secondaryName,
      secondaryValues,
    };
    
    if (!groupMap.has(primaryValue)) {
      groupMap.set(primaryValue, []);
    }
    groupMap.get(primaryValue)!.push(groupedVariant);
  });

  // Convert map to array of groups
  const groups: VariantGroup[] = Array.from(groupMap.entries()).map(([primaryValue, variants]) => ({
    primaryValue,
    primaryKey,
    variants,
    rowSpan: variants.length,
  }));

  // Format attribute names for display
  const formatAttrName = (key: string) => 
    key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');

  return {
    primaryAttribute: formatAttrName(primaryKey),
    secondaryAttributes: secondaryKeys.map(formatAttrName),
    groups,
    totalCount: variants.length,
  };
}

/**
 * Flattens grouped variants back to a flat array
 * Used when saving data back to the form
 */
export function flattenGroupedVariants(
  groups: VariantGroup[]
): GeneratedVariant[] {
  const result: { index: number; variant: GeneratedVariant }[] = [];
  
  groups.forEach(group => {
    group.variants.forEach(gv => {
      result.push({ index: gv.originalIndex, variant: gv.variant });
    });
  });
  
  // Sort by original index to maintain order
  result.sort((a, b) => a.index - b.index);
  
  return result.map(r => r.variant);
}

/**
 * Applies a value to all variants in a group
 */
export function applyToGroup<K extends keyof GeneratedVariant>(
  groups: VariantGroup[],
  groupIndex: number,
  field: K,
  value: GeneratedVariant[K]
): VariantGroup[] {
  return groups.map((group, idx) => {
    if (idx !== groupIndex) return group;
    
    return {
      ...group,
      variants: group.variants.map(gv => ({
        ...gv,
        variant: {
          ...gv.variant,
          [field]: value,
        },
      })),
    };
  });
}

/**
 * Applies a value to all variants across all groups
 */
export function applyToAll<K extends keyof GeneratedVariant>(
  groups: VariantGroup[],
  field: K,
  value: GeneratedVariant[K]
): VariantGroup[] {
  return groups.map(group => ({
    ...group,
    variants: group.variants.map(gv => ({
      ...gv,
      variant: {
        ...gv.variant,
        [field]: value,
      },
    })),
  }));
}

/**
 * Updates a single variant in the groups
 */
export function updateVariantInGroups(
  groups: VariantGroup[],
  originalIndex: number,
  updates: Partial<GeneratedVariant>
): VariantGroup[] {
  return groups.map(group => ({
    ...group,
    variants: group.variants.map(gv => {
      if (gv.originalIndex !== originalIndex) return gv;
      
      return {
        ...gv,
        variant: {
          ...gv.variant,
          ...updates,
        },
      };
    }),
  }));
}

export default generateVariants;
