/**
 * VariantBuilder Component
 * 
 * Extracted from ProductForm.tsx
 * Handles: Product options, variant generation, and SKU matrix
 */

'use client';

import { useMemo } from 'react';
import { Settings2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TagInput } from '@/components/common/TagInput';
import { ProductOption, VariantFormData } from './types';
import { groupVariantsForDisplay, generateVariantCombinations, mergeVariants } from './utils';

interface VariantBuilderProps {
  isEditMode: boolean;
  productOptions: ProductOption[];
  variants: VariantFormData[];
  productName: string;
  defaultPrice: number;
  onOptionsChange: (options: ProductOption[]) => void;
  onVariantsChange: (variants: VariantFormData[]) => void;
}

export function VariantBuilder({
  isEditMode,
  productOptions,
  variants,
  productName,
  defaultPrice,
  onOptionsChange,
  onVariantsChange,
}: VariantBuilderProps) {
  // Regenerate variants when options change
  const regenerateVariants = (options: ProductOption[]) => {
    const combinations = generateVariantCombinations(options);
    const newVariants = mergeVariants(variants, combinations, productName, defaultPrice);
    onVariantsChange(newVariants);
  };

  const handleAddOption = () => {
    const newOption: ProductOption = {
      id: crypto.randomUUID(),
      name: '',
      values: [],
    };
    onOptionsChange([...productOptions, newOption]);
  };

  const handleRemoveOption = (optionId: string) => {
    const newOptions = productOptions.filter(opt => opt.id !== optionId);
    onOptionsChange(newOptions);
    regenerateVariants(newOptions);
  };

  const handleOptionNameChange = (optionId: string, name: string) => {
    const newOptions = productOptions.map(opt =>
      opt.id === optionId ? { ...opt, name } : opt
    );
    onOptionsChange(newOptions);
    regenerateVariants(newOptions);
  };

  const handleOptionValuesChange = (optionId: string, values: string[]) => {
    const newOptions = productOptions.map(opt =>
      opt.id === optionId ? { ...opt, values } : opt
    );
    onOptionsChange(newOptions);
    regenerateVariants(newOptions);
  };

  const handleVariantFieldChange = (index: number, field: keyof VariantFormData, value: any) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    onVariantsChange(newVariants);
  };

  // Group variants for display
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

  // Don't show option builder in edit mode
  if (isEditMode) {
    return (
      <VariantTable
        variants={displayVariants}
        productOptions={productOptions}
        onFieldChange={handleVariantFieldChange}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Option Builder */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-500" />
            Product Options
            <span className="text-xs font-normal text-gray-400 ml-2">
              (Variants auto-update as you type)
            </span>
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddOption}
            className="border-purple-300 text-purple-600 hover:bg-purple-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Option
          </Button>
        </div>

        {productOptions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Settings2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No options defined</p>
            <p className="text-sm">Click "Add Option" to create variants (e.g., Color, Size, RAM)</p>
          </div>
        ) : (
          <div className="space-y-4">
            {productOptions.map((option, index) => (
              <div
                key={option.id}
                className="flex items-start gap-4 p-4 bg-gradient-to-r from-purple-50 to-transparent rounded-lg border border-purple-100"
              >
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-purple-600">{index + 1}</span>
                </div>

                <div className="flex-1 grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Option Name
                    </label>
                    <Input
                      value={option.name}
                      onChange={(e) => handleOptionNameChange(option.id, e.target.value)}
                      placeholder="e.g., Color, Size, RAM"
                      className="text-sm"
                    />
                  </div>

                  <div className="col-span-2">
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
          </div>
        )}
      </div>

      {/* Variant Table */}
      {variants.length > 0 && (
        <VariantTable
          variants={displayVariants}
          productOptions={productOptions}
          onFieldChange={handleVariantFieldChange}
        />
      )}
    </div>
  );
}

// Variant Table Sub-component
interface VariantTableProps {
  variants: ReturnType<typeof groupVariantsForDisplay>;
  productOptions: ProductOption[];
  onFieldChange: (index: number, field: keyof VariantFormData, value: any) => void;
}

function VariantTable({ variants, productOptions, onFieldChange }: VariantTableProps) {
  if (variants.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">
          Variants ({variants.length})
        </h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
              {productOptions.slice(0, 2).map(opt => (
                <th key={opt.id} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {opt.name || 'Option'}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {variants.map((variant, index) => (
              <tr key={variant.sku || index} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Input
                    value={variant.sku}
                    onChange={(e) => onFieldChange(index, 'sku', e.target.value)}
                    className="w-32 text-xs"
                  />
                </td>
                {productOptions.slice(0, 2).map(opt => (
                  <td key={opt.id} className="px-4 py-3 text-sm text-gray-700">
                    {variant.attributes?.[opt.name] || variant.color || variant.size || '-'}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    value={variant.cost_price || ''}
                    onChange={(e) => onFieldChange(index, 'cost_price', parseFloat(e.target.value) || 0)}
                    className="w-20 text-xs"
                    min="0"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    value={variant.selling_price || ''}
                    onChange={(e) => onFieldChange(index, 'selling_price', parseFloat(e.target.value) || 0)}
                    className="w-20 text-xs"
                    min="0"
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    value={variant.current_stock || ''}
                    onChange={(e) => onFieldChange(index, 'current_stock', parseInt(e.target.value) || 0)}
                    className="w-16 text-xs"
                    min="0"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default VariantBuilder;
export * from './types';
export * from './utils';
