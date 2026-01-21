'use client';

/**
 * Variant Matrix Table
 * 
 * A Daraz Seller Center style grouped table for editing variants.
 * Groups variants by the first attribute (e.g., Color) with rowSpan merge.
 * 
 * Features:
 * - Grouped rows by primary attribute (rowSpan)
 * - Combined secondary attributes display
 * - Inline editing for Price, Stock, SKU
 * - Batch edit: Apply to All / Apply to Group
 * - Toggle availability per variant
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Check,
  Copy,
  DollarSign,
  Hash,
  Package,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronRight,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  type GeneratedVariant,
  type VariantGroup,
  type GroupedVariantsResult,
  groupVariantsByFirstAttribute,
  applyToAll,
  applyToGroup,
  updateVariantInGroups,
  flattenGroupedVariants,
} from '@/lib/utils/variantGenerator';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface VariantMatrixTableProps {
  /** Array of generated variants */
  variants: GeneratedVariant[];
  /** Callback when variants change */
  onChange: (variants: GeneratedVariant[]) => void;
  /** Product name for SKU generation */
  productName?: string;
  /** Compact mode */
  compact?: boolean;
  /** Class name */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function VariantMatrixTable({
  variants,
  onChange,
  productName = '',
  compact = false,
  className,
}: VariantMatrixTableProps) {
  // Group variants by first attribute
  const groupedData = useMemo(
    () => groupVariantsByFirstAttribute(variants),
    [variants]
  );

  // Internal state for groups (allows editing)
  const [groups, setGroups] = useState<VariantGroup[]>(
    groupedData?.groups || []
  );
  
  // Batch edit values
  const [batchPrice, setBatchPrice] = useState<string>('');
  const [batchStock, setBatchStock] = useState<string>('');
  const [batchCost, setBatchCost] = useState<string>('');
  
  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Sync internal groups when variants change
  useMemo(() => {
    if (groupedData) {
      setGroups(groupedData.groups);
    }
  }, [groupedData]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  // Update a single variant field
  const handleVariantChange = useCallback((
    originalIndex: number,
    field: keyof GeneratedVariant,
    value: string | number | boolean
  ) => {
    const updatedGroups = updateVariantInGroups(groups, originalIndex, { [field]: value });
    setGroups(updatedGroups);
    
    // Sync back to parent
    const flatVariants = flattenGroupedVariants(updatedGroups);
    onChange(flatVariants);
  }, [groups, onChange]);

  // Apply batch value to all variants
  const handleApplyToAll = useCallback((field: 'selling_price' | 'current_stock' | 'cost_price') => {
    let value: number;
    
    switch (field) {
      case 'selling_price':
        value = Number(batchPrice);
        if (!batchPrice || isNaN(value)) return;
        break;
      case 'current_stock':
        value = Number(batchStock);
        if (batchStock === '' || isNaN(value)) return;
        break;
      case 'cost_price':
        value = Number(batchCost);
        if (!batchCost || isNaN(value)) return;
        break;
    }
    
    const updatedGroups = applyToAll(groups, field, value);
    setGroups(updatedGroups);
    
    const flatVariants = flattenGroupedVariants(updatedGroups);
    onChange(flatVariants);
  }, [groups, batchPrice, batchStock, batchCost, onChange]);

  // Apply value to a specific group
  const handleApplyToGroup = useCallback((
    groupIndex: number,
    field: 'selling_price' | 'current_stock' | 'cost_price',
    value: number
  ) => {
    const updatedGroups = applyToGroup(groups, groupIndex, field, value);
    setGroups(updatedGroups);
    
    const flatVariants = flattenGroupedVariants(updatedGroups);
    onChange(flatVariants);
  }, [groups, onChange]);

  // Toggle group collapse
  const toggleGroupCollapse = useCallback((groupValue: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupValue)) {
        newSet.delete(groupValue);
      } else {
        newSet.add(groupValue);
      }
      return newSet;
    });
  }, []);

  // Toggle variant availability
  const handleToggleAvailability = useCallback((originalIndex: number, currentValue: boolean) => {
    handleVariantChange(originalIndex, 'is_active', !currentValue);
  }, [handleVariantChange]);

  // Generate SKU for a variant
  const handleGenerateSku = useCallback((originalIndex: number, variant: GeneratedVariant) => {
    const prefix = productName.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const attrCodes = variant.attributeFields
      .map(f => f.value.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, ''))
      .join('-');
    const newSku = prefix ? `${prefix}-${attrCodes}` : attrCodes;
    handleVariantChange(originalIndex, 'sku', newSku);
  }, [productName, handleVariantChange]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (!groupedData || groups.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No variants to display</p>
      </div>
    );
  }

  const { primaryAttribute, secondaryAttributes } = groupedData;
  const hasSecondaryAttrs = secondaryAttributes.length > 0;

  return (
    <div className={cn('bg-white rounded-xl border border-gray-200 overflow-hidden', className)}>
      {/* Batch Edit Header */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-4 border-b border-orange-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-orange-500" />
            <span className="font-medium text-gray-900">Batch Edit</span>
            <Badge variant="secondary" className="bg-orange-100 text-orange-700">
              {groupedData.totalCount} variants
            </Badge>
          </div>
          <span className="text-xs text-gray-500">
            Set values and click "Apply" to update all variants
          </span>
        </div>
        
        <div className="grid grid-cols-4 gap-3">
          {/* Cost Price */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cost Price</label>
            <div className="flex gap-1">
              <Input
                type="number"
                value={batchCost}
                onChange={(e) => setBatchCost(e.target.value)}
                placeholder="0"
                className="h-9 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyToAll('cost_price')}
                className="h-9 px-2"
                disabled={!batchCost}
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* Selling Price */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Selling Price</label>
            <div className="flex gap-1">
              <Input
                type="number"
                value={batchPrice}
                onChange={(e) => setBatchPrice(e.target.value)}
                placeholder="0"
                className="h-9 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyToAll('selling_price')}
                className="h-9 px-2"
                disabled={!batchPrice}
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* Stock */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Initial Stock</label>
            <div className="flex gap-1">
              <Input
                type="number"
                value={batchStock}
                onChange={(e) => setBatchStock(e.target.value)}
                placeholder="0"
                className="h-9 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyToAll('current_stock')}
                className="h-9 px-2"
                disabled={batchStock === ''}
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Quick Actions</label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (batchPrice && batchCost) {
                    handleApplyToAll('cost_price');
                    handleApplyToAll('selling_price');
                  }
                }}
                className="h-9 text-xs flex-1"
                disabled={!batchPrice || !batchCost}
              >
                Apply All Prices
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-3 text-left font-medium text-gray-600 border-b w-32">
                {primaryAttribute}
              </th>
              {hasSecondaryAttrs && (
                <th className="px-3 py-3 text-left font-medium text-gray-600 border-b">
                  {secondaryAttributes.join(' / ')}
                </th>
              )}
              <th className="px-3 py-3 text-left font-medium text-gray-600 border-b w-28">
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Cost
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-600 border-b w-28">
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Price *
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-600 border-b w-24">
                <div className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  Stock
                </div>
              </th>
              <th className="px-3 py-3 text-left font-medium text-gray-600 border-b w-40">
                <div className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  SKU
                </div>
              </th>
              <th className="px-3 py-3 text-center font-medium text-gray-600 border-b w-20">
                Active
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, groupIndex) => {
              const isCollapsed = collapsedGroups.has(group.primaryValue);
              
              return group.variants.map((gv, variantIndex) => {
                const isFirstInGroup = variantIndex === 0;
                const variant = gv.variant;
                
                // Don't render non-first rows if collapsed
                if (isCollapsed && !isFirstInGroup) {
                  return null;
                }
                
                return (
                  <tr
                    key={gv.originalIndex}
                    className={cn(
                      'border-b border-gray-100 hover:bg-gray-50 transition-colors',
                      !variant.is_active && 'opacity-50 bg-gray-50'
                    )}
                  >
                    {/* Primary Attribute (with rowSpan) */}
                    {isFirstInGroup && (
                      <td
                        className={cn(
                          'px-3 py-2 font-medium text-gray-900 align-top border-r border-gray-100',
                          'bg-gradient-to-r from-gray-50 to-transparent'
                        )}
                        rowSpan={isCollapsed ? 1 : group.rowSpan}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapse(group.primaryValue)}
                            className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                          <span>{group.primaryValue}</span>
                        </div>
                        
                        {/* Group actions */}
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs">
                            {group.rowSpan} variants
                          </Badge>
                          {batchPrice && (
                            <button
                              type="button"
                              onClick={() => handleApplyToGroup(groupIndex, 'selling_price', Number(batchPrice))}
                              className="text-xs text-orange-600 hover:underline"
                            >
                              Apply Rs.{batchPrice}
                            </button>
                          )}
                        </div>
                        
                        {isCollapsed && (
                          <div className="text-xs text-gray-400 mt-1">
                            {group.rowSpan - 1} hidden rows
                          </div>
                        )}
                      </td>
                    )}
                    
                    {/* Secondary Attributes */}
                    {hasSecondaryAttrs && (
                      <td className="px-3 py-2 text-gray-700">
                        <div className="flex items-center gap-1">
                          {gv.secondaryValues.map((val, i) => (
                            <span key={i}>
                              {val}
                              {i < gv.secondaryValues.length - 1 && (
                                <span className="text-gray-300 mx-1">/</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                    )}
                    
                    {/* Cost Price */}
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={variant.cost_price || ''}
                        onChange={(e) => handleVariantChange(
                          gv.originalIndex,
                          'cost_price',
                          Number(e.target.value) || 0
                        )}
                        placeholder="0"
                        className="h-8 text-sm w-full"
                        min="0"
                      />
                    </td>
                    
                    {/* Selling Price */}
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={variant.selling_price || ''}
                        onChange={(e) => handleVariantChange(
                          gv.originalIndex,
                          'selling_price',
                          Number(e.target.value) || 0
                        )}
                        placeholder="0"
                        className={cn(
                          'h-8 text-sm w-full',
                          !variant.selling_price && 'border-red-300'
                        )}
                        min="0"
                        required
                      />
                    </td>
                    
                    {/* Stock */}
                    <td className="px-2 py-1">
                      <Input
                        type="number"
                        value={variant.current_stock || ''}
                        onChange={(e) => handleVariantChange(
                          gv.originalIndex,
                          'current_stock',
                          Number(e.target.value) || 0
                        )}
                        placeholder="0"
                        className="h-8 text-sm w-full"
                        min="0"
                      />
                    </td>
                    
                    {/* SKU */}
                    <td className="px-2 py-1">
                      <div className="flex gap-1">
                        <Input
                          type="text"
                          value={variant.sku || ''}
                          onChange={(e) => handleVariantChange(
                            gv.originalIndex,
                            'sku',
                            e.target.value
                          )}
                          placeholder="SKU"
                          className={cn(
                            'h-8 text-xs font-mono w-full',
                            !variant.sku && 'border-red-300'
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleGenerateSku(gv.originalIndex, variant)}
                          className="h-8 w-8 flex-shrink-0"
                          title="Auto-generate SKU"
                        >
                          <Sparkles className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                    
                    {/* Active Toggle */}
                    <td className="px-3 py-1 text-center">
                      <Switch
                        checked={variant.is_active}
                        onCheckedChange={() => handleToggleAvailability(gv.originalIndex, variant.is_active)}
                      />
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between text-sm">
        <div className="flex items-center gap-4 text-gray-500">
          <span>
            <strong className="text-gray-900">{groups.length}</strong> {primaryAttribute.toLowerCase()}s
          </span>
          <span>•</span>
          <span>
            <strong className="text-gray-900">{groupedData.totalCount}</strong> total variants
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Tip: Use batch edit row above for bulk pricing</span>
        </div>
      </div>
    </div>
  );
}

export default VariantMatrixTable;
