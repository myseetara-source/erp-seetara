'use client';

/**
 * Product Options Builder
 * 
 * A dynamic N-level attribute system for creating product variants.
 * Similar to Shopify's variant options builder.
 * 
 * Features:
 * - Add unlimited option types (Processor, RAM, Color, Size, etc.)
 * - Add multiple values per option using Tag Input
 * - Auto-generates Cartesian Product of all combinations
 * - Preview generated variants before adding
 * - Applies default pricing to all generated variants
 * 
 * @example
 * Options:
 *   - RAM: [8GB, 16GB]
 *   - Storage: [256GB, 512GB, 1TB]
 * 
 * Generates 6 variants:
 *   8GB/256GB, 8GB/512GB, 8GB/1TB, 16GB/256GB, 16GB/512GB, 16GB/1TB
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Wand2,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Layers,
  Settings2,
  Sparkles,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TagInput } from '@/components/common/TagInput';
import {
  generateVariants,
  estimateVariantCount,
  validateOptions,
  groupVariantsByFirstAttribute,
  type ProductOption,
  type GeneratedVariant,
} from '@/lib/utils/variantGenerator';
import { cn } from '@/lib/utils';
import { VariantMatrixTable } from './VariantMatrixTable';

// =============================================================================
// COMMON OPTION SUGGESTIONS
// =============================================================================

const COMMON_OPTIONS: Record<string, string[]> = {
  // Universal
  'Color': ['Red', 'Blue', 'Black', 'White', 'Green', 'Yellow', 'Pink', 'Purple', 'Orange', 'Gray', 'Brown', 'Navy'],
  'Size': ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'],
  
  // Electronics
  'Storage': ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'],
  'RAM': ['4GB', '8GB', '16GB', '32GB', '64GB', '128GB'],
  'Processor': ['Intel i3', 'Intel i5', 'Intel i7', 'Intel i9', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Apple M1', 'Apple M2', 'Apple M3', 'Apple M3 Pro', 'Apple M3 Max'],
  'Screen Size': ['13"', '14"', '15"', '16"', '17"', '24"', '27"', '32"'],
  
  // Clothing
  'Material': ['Cotton', 'Polyester', 'Silk', 'Wool', 'Linen', 'Denim', 'Leather'],
  'Pattern': ['Solid', 'Striped', 'Checked', 'Printed', 'Floral'],
  
  // Jewelry
  'Metal': ['Gold', 'Silver', 'Rose Gold', 'Platinum', 'White Gold', 'Brass'],
  'Stone': ['Diamond', 'Ruby', 'Sapphire', 'Emerald', 'Pearl', 'Cubic Zirconia'],
  'Ring Size': ['5', '6', '7', '8', '9', '10', '11', '12'],
  
  // Footwear
  'Shoe Size': ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'],
  'Width': ['Narrow', 'Standard', 'Wide', 'Extra Wide'],
  
  // Books
  'Format': ['Hardcover', 'Paperback', 'eBook', 'Audiobook'],
  'Language': ['English', 'Nepali', 'Hindi', 'Spanish', 'French'],
};

const OPTION_NAME_SUGGESTIONS = Object.keys(COMMON_OPTIONS);

// =============================================================================
// TYPES
// =============================================================================

interface ProductOptionsBuilderProps {
  /** Callback when variants are generated */
  onGenerate: (variants: GeneratedVariant[]) => void;
  /** Product name for SKU generation */
  productName: string;
  /** Current number of variants in form */
  currentVariantCount: number;
  /** Default pricing to apply to generated variants */
  defaultPricing?: {
    cost_price?: number;
    selling_price?: number;
    mrp?: number;
  };
  /** Class name */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProductOptionsBuilder({
  onGenerate,
  productName,
  currentVariantCount,
  defaultPricing,
  className,
}: ProductOptionsBuilderProps) {
  // State
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPricing, setShowPricing] = useState(false);
  const [pricing, setPricing] = useState({
    cost_price: defaultPricing?.cost_price || 0,
    selling_price: defaultPricing?.selling_price || 0,
    mrp: defaultPricing?.mrp || 0,
  });

  // Validation
  const validation = useMemo(() => validateOptions(options), [options]);
  const variantCount = useMemo(() => estimateVariantCount(options), [options]);

  // Preview generated variants (limited to 10 for performance)
  const previewVariants = useMemo(() => {
    if (!validation.isValid || variantCount === 0) return [];
    return generateVariants(options, productName, pricing).slice(0, 10);
  }, [options, productName, pricing, validation.isValid, variantCount]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const addOption = useCallback(() => {
    setOptions(prev => [...prev, { name: '', values: [] }]);
  }, []);

  const removeOption = useCallback((index: number) => {
    setOptions(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateOptionName = useCallback((index: number, name: string) => {
    setOptions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name };
      return updated;
    });
  }, []);

  const updateOptionValues = useCallback((index: number, values: string[]) => {
    setOptions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], values };
      return updated;
    });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!validation.isValid) return;
    
    const variants = generateVariants(options, productName, pricing);
    onGenerate(variants);
    
    // Clear options after generation
    setOptions([]);
    setIsExpanded(false);
  }, [options, productName, pricing, validation.isValid, onGenerate]);

  const getSuggestionsForOption = (optionName: string): string[] => {
    const normalized = optionName.trim();
    // Find matching key (case-insensitive)
    const matchingKey = Object.keys(COMMON_OPTIONS).find(
      k => k.toLowerCase() === normalized.toLowerCase()
    );
    return matchingKey ? COMMON_OPTIONS[matchingKey] : [];
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className={cn('bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200', className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-purple-100/50 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Variant Generator</h3>
            <p className="text-xs text-gray-500">
              Auto-create all combinations from options
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {options.length > 0 && (
            <Badge variant="secondary" className="bg-purple-100 text-purple-700">
              {options.length} options → {variantCount} variants
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          {/* Options List */}
          <div className="space-y-3">
            {options.map((option, index) => (
              <div
                key={index}
                className="bg-white rounded-lg border border-gray-200 p-4 space-y-3"
              >
                <div className="flex items-center gap-3">
                  {/* Option Number */}
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-purple-600">{index + 1}</span>
                  </div>

                  {/* Option Name */}
                  <div className="flex-1">
                    <Input
                      value={option.name}
                      onChange={(e) => updateOptionName(index, e.target.value)}
                      placeholder="Option name (e.g., Processor, RAM, Color)"
                      className="font-medium"
                      list={`option-suggestions-${index}`}
                    />
                    <datalist id={`option-suggestions-${index}`}>
                      {OPTION_NAME_SUGGESTIONS
                        .filter(s => !options.some(o => o.name.toLowerCase() === s.toLowerCase()))
                        .map(s => <option key={s} value={s} />)
                      }
                    </datalist>
                  </div>

                  {/* Remove Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(index)}
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Option Values (Tag Input) */}
                <div className="pl-11">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Values for "{option.name || 'this option'}"
                  </label>
                  <TagInput
                    value={option.values}
                    onChange={(values) => updateOptionValues(index, values)}
                    placeholder={`Add values (e.g., ${getSuggestionsForOption(option.name).slice(0, 3).join(', ') || 'value1, value2'})`}
                    suggestions={getSuggestionsForOption(option.name)}
                    size="sm"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Add Option Button */}
          <Button
            type="button"
            variant="outline"
            onClick={addOption}
            className="w-full border-dashed border-purple-300 text-purple-600 hover:bg-purple-50 hover:border-purple-400"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Option Type
          </Button>

          {/* Validation Errors */}
          {validation.errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-1">
                <AlertCircle className="w-4 h-4" />
                Validation Errors
              </div>
              <ul className="text-xs text-red-600 space-y-1 pl-6">
                {validation.errors.map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation Warnings */}
          {validation.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
                <AlertTriangle className="w-4 h-4" />
                Warnings
              </div>
              <ul className="text-xs text-amber-600 space-y-1 pl-6">
                {validation.warnings.map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Default Pricing Section */}
          {options.length > 0 && (
            <div className="border-t border-purple-200 pt-4">
              <button
                type="button"
                onClick={() => setShowPricing(!showPricing)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <Settings2 className="w-4 h-4" />
                Default Pricing for Generated Variants
                {showPricing ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showPricing && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Cost Price</label>
                    <Input
                      type="number"
                      value={pricing.cost_price || ''}
                      onChange={(e) => setPricing(p => ({ ...p, cost_price: Number(e.target.value) }))}
                      placeholder="0"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Selling Price</label>
                    <Input
                      type="number"
                      value={pricing.selling_price || ''}
                      onChange={(e) => setPricing(p => ({ ...p, selling_price: Number(e.target.value) }))}
                      placeholder="0"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">MRP</label>
                    <Input
                      type="number"
                      value={pricing.mrp || ''}
                      onChange={(e) => setPricing(p => ({ ...p, mrp: Number(e.target.value) }))}
                      placeholder="0"
                      className="text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview Section - Grouped Matrix Table */}
          {previewVariants.length > 0 && (
            <div className="border-t border-purple-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Layers className="w-4 h-4" />
                  Preview ({variantCount} variants will be created)
                </div>
                <Badge variant="outline" className="text-xs">
                  Grouped by {groupVariantsByFirstAttribute(previewVariants)?.primaryAttribute || 'First Option'}
                </Badge>
              </div>

              {/* Show preview of first 12 variants in matrix format */}
              {variantCount <= 20 ? (
                <VariantMatrixTable
                  variants={previewVariants}
                  onChange={(updated) => {
                    // Update preview variants with new values
                    // This allows editing pricing before generating
                    previewVariants.forEach((v, i) => {
                      if (updated[i]) {
                        v.cost_price = updated[i].cost_price;
                        v.selling_price = updated[i].selling_price;
                        v.current_stock = updated[i].current_stock;
                        v.sku = updated[i].sku;
                      }
                    });
                  }}
                  productName={productName}
                  compact
                />
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Variant</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Attributes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewVariants.slice(0, 8).map((variant, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{variant.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{variant.sku}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {variant.attributeFields.map((attr, j) => (
                                <Badge key={j} variant="outline" className="text-xs">
                                  {attr.key}: {attr.value}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50">
                        <td colSpan={3} className="px-3 py-2 text-center text-xs text-gray-500">
                          ... and {variantCount - 8} more variants (full matrix editor will open after generation)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Generate Button */}
          {options.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-gray-500">
                {currentVariantCount > 0 && (
                  <span>
                    ⚠️ This will replace your {currentVariantCount} existing variant{currentVariantCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!validation.isValid || variantCount === 0}
                className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate {variantCount} Variants
              </Button>
            </div>
          )}

          {/* Empty State */}
          {options.length === 0 && (
            <div className="text-center py-6">
              <Package className="w-12 h-12 text-purple-300 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-2">
                Add option types to automatically generate all variant combinations
              </p>
              <p className="text-xs text-gray-400">
                Example: Add "RAM" (8GB, 16GB) + "Storage" (256GB, 512GB) → 4 variants
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductOptionsBuilder;
