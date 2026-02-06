/**
 * VariantBuilder Component (Enterprise Grade - Dynamic Attribute System)
 * 
 * Features:
 * - Unlimited dynamic attribute types (Color, Size, Model, Material, etc.)
 * - Edit mode support: Add/modify attributes without losing data
 * - Bulk update for prices and costs
 * - Virtual scrolling for 100+ variants (performance optimized)
 * - Smart variant matrix regeneration
 */

'use client';

import { useMemo, useState, useCallback, memo } from 'react';
import { 
  Settings2, Plus, Trash2, DollarSign, Percent, 
  ChevronDown, ChevronUp, Layers, RefreshCw, Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TagInput } from '@/components/common/TagInput';
import { ProductOption, VariantFormData } from './types';
import { groupVariantsForDisplay, generateVariantCombinations, mergeVariants } from './utils';
import { cn } from '@/lib/utils';

interface VariantBuilderProps {
  isEditMode: boolean;
  productOptions: ProductOption[];
  variants: VariantFormData[];
  productName: string;
  defaultPrice: number;
  onOptionsChange: (options: ProductOption[]) => void;
  onVariantsChange: (variants: VariantFormData[]) => void;
}

// =============================================================================
// BULK UPDATE MODAL
// =============================================================================

interface BulkUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (field: 'cost_price' | 'selling_price', mode: 'set' | 'add' | 'percent', value: number) => void;
}

function BulkUpdateModal({ isOpen, onClose, onApply }: BulkUpdateModalProps) {
  const [field, setField] = useState<'cost_price' | 'selling_price'>('cost_price');
  const [mode, setMode] = useState<'set' | 'add' | 'percent'>('set');
  const [value, setValue] = useState<string>('');

  if (!isOpen) return null;

  const handleApply = () => {
    const numValue = parseFloat(value) || 0;
    onApply(field, mode, numValue);
    onClose();
    setValue('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-green-500" />
          Bulk Update Prices
        </h3>

        {/* Field Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Apply to</label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={field === 'cost_price' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setField('cost_price')}
              className={field === 'cost_price' ? 'bg-blue-500' : ''}
            >
              Cost Price
            </Button>
            <Button
              type="button"
              variant={field === 'selling_price' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setField('selling_price')}
              className={field === 'selling_price' ? 'bg-green-500' : ''}
            >
              Selling Price
            </Button>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Mode</label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'set' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('set')}
            >
              Set Value
            </Button>
            <Button
              type="button"
              variant={mode === 'add' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('add')}
            >
              Add/Subtract
            </Button>
            <Button
              type="button"
              variant={mode === 'percent' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('percent')}
            >
              <Percent className="w-3 h-3 mr-1" />
              Percentage
            </Button>
          </div>
        </div>

        {/* Value Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            {mode === 'set' ? 'New Value' : mode === 'add' ? 'Amount (+/-)' : 'Percentage (+/-)'}
          </label>
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === 'percent' ? 'e.g., 10 or -5' : 'Enter amount'}
            className="text-lg"
          />
          <p className="text-xs text-gray-500">
            {mode === 'set' && 'All variants will be set to this value'}
            {mode === 'add' && 'This amount will be added to current values (use negative to subtract)'}
            {mode === 'percent' && 'Prices will be adjusted by this percentage'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleApply} 
            className="flex-1 bg-green-500 hover:bg-green-600"
            disabled={!value}
          >
            Apply to All
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN VARIANT BUILDER
// =============================================================================

export function VariantBuilder({
  isEditMode,
  productOptions,
  variants,
  productName,
  defaultPrice,
  onOptionsChange,
  onVariantsChange,
}: VariantBuilderProps) {
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [showOptionsEditor, setShowOptionsEditor] = useState(!isEditMode);
  const [visibleCount, setVisibleCount] = useState(50); // Pagination for performance

  // Regenerate variants when options change (preserves existing data)
  const regenerateVariants = useCallback((options: ProductOption[]) => {
    const combinations = generateVariantCombinations(options);
    const newVariants = mergeVariants(variants, combinations, productName, defaultPrice);
    onVariantsChange(newVariants);
  }, [variants, productName, defaultPrice, onVariantsChange]);

  const handleAddOption = useCallback(() => {
    const newOption: ProductOption = {
      id: crypto.randomUUID(),
      name: '',
      values: [],
    };
    onOptionsChange([...productOptions, newOption]);
  }, [productOptions, onOptionsChange]);

  const handleRemoveOption = useCallback((optionId: string) => {
    const newOptions = productOptions.filter(opt => opt.id !== optionId);
    onOptionsChange(newOptions);
    regenerateVariants(newOptions);
  }, [productOptions, onOptionsChange, regenerateVariants]);

  const handleOptionNameChange = useCallback((optionId: string, name: string) => {
    const newOptions = productOptions.map(opt =>
      opt.id === optionId ? { ...opt, name } : opt
    );
    onOptionsChange(newOptions);
    // Don't regenerate on name change - only on value change
  }, [productOptions, onOptionsChange]);

  const handleOptionValuesChange = useCallback((optionId: string, values: string[]) => {
    const newOptions = productOptions.map(opt =>
      opt.id === optionId ? { ...opt, values } : opt
    );
    onOptionsChange(newOptions);
    regenerateVariants(newOptions);
  }, [productOptions, onOptionsChange, regenerateVariants]);

  const handleVariantFieldChange = useCallback((index: number, field: keyof VariantFormData, value: VariantFormData[keyof VariantFormData]) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    onVariantsChange(newVariants);
  }, [variants, onVariantsChange]);

  // Bulk update handler
  const handleBulkUpdate = useCallback((
    field: 'cost_price' | 'selling_price', 
    mode: 'set' | 'add' | 'percent', 
    value: number
  ) => {
    const newVariants = variants.map(v => {
      const currentValue = v[field] || 0;
      let newValue: number;

      switch (mode) {
        case 'set':
          newValue = value;
          break;
        case 'add':
          newValue = currentValue + value;
          break;
        case 'percent':
          newValue = currentValue * (1 + value / 100);
          break;
        default:
          newValue = currentValue;
      }

      return { ...v, [field]: Math.max(0, Math.round(newValue * 100) / 100) };
    });

    onVariantsChange(newVariants);
  }, [variants, onVariantsChange]);

  // Copy first variant's prices to all
  const handleCopyFirstToAll = useCallback(() => {
    if (variants.length < 2) return;
    
    const first = variants[0];
    const newVariants = variants.map(v => ({
      ...v,
      cost_price: first.cost_price,
      selling_price: first.selling_price,
    }));
    onVariantsChange(newVariants);
  }, [variants, onVariantsChange]);

  // Group variants for display (memoized for performance)
  const displayVariants = useMemo(() => {
    return groupVariantsForDisplay(
      variants.map(v => ({
        ...v,
        primaryValue: '',
        secondaryValues: [],
        isFirstInGroup: true,
        groupRowSpan: 1,
      })),
      productOptions
    );
  }, [variants, productOptions]);

  // Paginated variants for performance
  const paginatedVariants = useMemo(() => {
    return displayVariants.slice(0, visibleCount);
  }, [displayVariants, visibleCount]);

  const hasMoreVariants = displayVariants.length > visibleCount;

  return (
    <div className="space-y-6">
      {/* Option Builder - Always available in both modes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div 
          className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 border-b border-gray-100"
          onClick={() => setShowOptionsEditor(!showOptionsEditor)}
        >
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-500" />
            Product Attributes
            <Badge variant="outline" className="ml-2">
              {productOptions.filter(o => o.name && o.values.length > 0).length} defined
            </Badge>
            {isEditMode && (
              <span className="text-xs font-normal text-amber-600 ml-2">
                (Changes will regenerate variants - existing data preserved)
              </span>
            )}
          </h2>
          <Button variant="ghost" size="sm">
            {showOptionsEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {showOptionsEditor && (
          <div className="p-6 space-y-4">
            {productOptions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No attributes defined</p>
                <p className="text-sm mb-4">Add attributes like Color, Size, Material, Model to create variants</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddOption}
                  className="border-purple-300 text-purple-600 hover:bg-purple-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add First Attribute
                </Button>
              </div>
            ) : (
              <>
                {productOptions.map((option, index) => (
                  <div
                    key={option.id}
                    className="flex items-start gap-4 p-4 bg-gradient-to-r from-purple-50 to-transparent rounded-lg border border-purple-100"
                  >
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-purple-600">{index + 1}</span>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">
                          Attribute Name
                        </label>
                        <Input
                          value={option.name}
                          onChange={(e) => handleOptionNameChange(option.id, e.target.value)}
                          placeholder="e.g., Color, Size, RAM, Storage"
                          className="text-sm"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-xs font-medium text-gray-600 mb-1 block">
                          Values (Press Enter to add)
                        </label>
                        <TagInput
                          value={option.values}
                          onChange={(values) => handleOptionValuesChange(option.id, values)}
                          placeholder="Type a value and press Enter"
                        />
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveOption(option.id)}
                      className="text-gray-400 hover:text-red-500 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOption}
                  className="border-purple-300 text-purple-600 hover:bg-purple-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Attribute
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Variant Table with Bulk Actions */}
      {variants.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Variants ({variants.length})
              </h2>
              {variants.length > 50 && (
                <p className="text-xs text-gray-500">
                  Showing {Math.min(visibleCount, variants.length)} of {variants.length}
                </p>
              )}
            </div>
            
            {/* Bulk Actions */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyFirstToAll}
                className="text-xs"
                title="Copy first variant's prices to all"
              >
                <Copy className="w-3 h-3 mr-1" />
                Copy First
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowBulkUpdate(true)}
                className="text-xs border-green-300 text-green-600 hover:bg-green-50"
              >
                <DollarSign className="w-3 h-3 mr-1" />
                Bulk Update
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => regenerateVariants(productOptions)}
                className="text-xs"
                title="Regenerate SKUs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Regenerate
              </Button>
            </div>
          </div>
          
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  {productOptions.filter(o => o.name).map(opt => (
                    <th key={opt.id} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {opt.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-blue-50">Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-green-50">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedVariants.map((variant, index) => (
                  <VariantRow
                    key={variant.sku || index}
                    variant={variant}
                    index={index}
                    productOptions={productOptions}
                    onFieldChange={handleVariantFieldChange}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Load More */}
          {hasMoreVariants && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount(prev => prev + 50)}
              >
                Load More ({displayVariants.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Update Modal */}
      <BulkUpdateModal
        isOpen={showBulkUpdate}
        onClose={() => setShowBulkUpdate(false)}
        onApply={handleBulkUpdate}
      />
    </div>
  );
}

// =============================================================================
// MEMOIZED VARIANT ROW (Performance Optimization)
// =============================================================================

interface VariantRowProps {
  variant: VariantFormData & { primaryValue?: string; secondaryValues?: string[] };
  index: number;
  productOptions: ProductOption[];
  onFieldChange: (index: number, field: keyof VariantFormData, value: VariantFormData[keyof VariantFormData]) => void;
}

const VariantRow = memo(function VariantRow({ 
  variant, 
  index, 
  productOptions, 
  onFieldChange 
}: VariantRowProps) {
  return (
    <tr className={cn(
      "hover:bg-gray-50 transition-colors",
      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
    )}>
      <td className="px-4 py-2 text-xs text-gray-400">{index + 1}</td>
      <td className="px-4 py-2">
        <Input
          value={variant.sku}
          onChange={(e) => onFieldChange(index, 'sku', e.target.value)}
          className="w-32 text-xs h-8"
        />
      </td>
      {productOptions.filter(o => o.name).map(opt => (
        <td key={opt.id} className="px-4 py-2 text-sm text-gray-700">
          <Badge variant="outline" className="font-normal">
            {variant.attributes?.[opt.name] || '-'}
          </Badge>
        </td>
      ))}
      <td className="px-4 py-2 bg-blue-50/50">
        <Input
          type="number"
          value={variant.cost_price || ''}
          onChange={(e) => onFieldChange(index, 'cost_price', parseFloat(e.target.value) || 0)}
          className="w-24 text-xs h-8"
          min="0"
          step="0.01"
        />
      </td>
      <td className="px-4 py-2 bg-green-50/50">
        <Input
          type="number"
          value={variant.selling_price || ''}
          onChange={(e) => onFieldChange(index, 'selling_price', parseFloat(e.target.value) || 0)}
          className="w-24 text-xs h-8"
          min="0"
          step="0.01"
        />
      </td>
      <td className="px-4 py-2">
        <Input
          type="number"
          value={variant.current_stock || ''}
          onChange={(e) => onFieldChange(index, 'current_stock', parseInt(e.target.value) || 0)}
          className="w-20 text-xs h-8"
          min="0"
        />
      </td>
    </tr>
  );
});

export default VariantBuilder;
export * from './types';
export * from './utils';
