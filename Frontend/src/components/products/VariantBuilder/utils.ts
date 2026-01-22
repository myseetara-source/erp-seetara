/**
 * VariantBuilder Utilities
 * 
 * Functions for generating and managing variant combinations
 */

import { ProductOption, VariantFormData, VariantRow } from './types';

/**
 * Generate all combinations from product options
 */
export function generateVariantCombinations(options: ProductOption[]): Record<string, string>[] {
  const validOptions = options.filter(opt => opt.name && opt.values.length > 0);
  
  if (validOptions.length === 0) {
    return [{}];
  }
  
  const combinations: Record<string, string>[] = [];
  
  function recurse(index: number, current: Record<string, string>) {
    if (index >= validOptions.length) {
      combinations.push({ ...current });
      return;
    }
    
    const option = validOptions[index];
    for (const value of option.values) {
      current[option.name] = value;
      recurse(index + 1, current);
    }
    delete current[option.name];
  }
  
  recurse(0, {});
  return combinations;
}

/**
 * Generate SKU from product name and attributes
 */
export function generateSKU(
  productName: string,
  attributes: Record<string, string>,
  index: number
): string {
  const prefix = (productName || 'PROD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
    
  const attrPart = Object.values(attributes)
    .map(v => (v || '').toUpperCase().slice(0, 3))
    .join('-');
    
  const suffix = String(index + 1).padStart(3, '0');
  
  return attrPart ? `${prefix}-${attrPart}-${suffix}` : `${prefix}-${suffix}`;
}

/**
 * Group variants for display with rowspan support
 */
export function groupVariantsForDisplay(
  variants: VariantRow[],
  options: ProductOption[]
): VariantRow[] {
  if (options.length < 2 || variants.length === 0) {
    return variants.map(v => ({
      ...v,
      isFirstInGroup: true,
      groupRowSpan: 1,
    }));
  }
  
  const primaryOption = options[0];
  const groups = new Map<string, VariantRow[]>();
  
  for (const variant of variants) {
    const primaryValue = variant.attributes?.[primaryOption.name] || variant.color || '';
    const existing = groups.get(primaryValue) || [];
    existing.push(variant);
    groups.set(primaryValue, existing);
  }
  
  const result: VariantRow[] = [];
  
  for (const [primaryValue, group] of groups) {
    group.forEach((variant, idx) => {
      result.push({
        ...variant,
        primaryValue,
        isFirstInGroup: idx === 0,
        groupRowSpan: group.length,
      });
    });
  }
  
  return result;
}

/**
 * Merge existing variants with new combinations
 */
export function mergeVariants(
  existingVariants: VariantFormData[],
  combinations: Record<string, string>[],
  productName: string,
  defaultPrice: number = 0
): VariantFormData[] {
  return combinations.map((combo, index) => {
    // Try to find existing variant with matching attributes
    const existing = existingVariants.find(v => {
      const existingAttrs = v.attributes || { color: v.color, size: v.size };
      return Object.keys(combo).every(key => existingAttrs[key] === combo[key]);
    });
    
    if (existing) {
      return {
        ...existing,
        attributes: combo,
      };
    }
    
    return {
      sku: generateSKU(productName, combo, index),
      attributes: combo,
      color: combo.Color || combo.color || '',
      size: combo.Size || combo.size || '',
      selling_price: defaultPrice,
      cost_price: 0,
      current_stock: 0,
      is_active: true,
    };
  });
}
