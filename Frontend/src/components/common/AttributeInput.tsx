'use client';

/**
 * AttributeInput Component
 * 
 * A dynamic key-value attribute builder for product variants.
 * Replaces hardcoded color/size/material fields with flexible attributes.
 * 
 * Features:
 * - Add unlimited key-value pairs
 * - Auto-suggest common attribute keys
 * - Auto-generate SKU from attribute values
 * - Supports attribute templates per category
 * 
 * Usage:
 * <AttributeInput
 *   value={[{ key: 'color', value: 'Red' }, { key: 'size', value: 'XL' }]}
 *   onChange={(attrs) => setValue('attributes', attrs)}
 *   category="Clothing"
 * />
 */

import { useState, useCallback, useMemo } from 'react';
import { Plus, Trash2, Sparkles, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttributeField, VariantAttributes } from '@/types';

// =============================================================================
// COMMON ATTRIBUTE SUGGESTIONS
// =============================================================================

const COMMON_ATTRIBUTES: Record<string, string[]> = {
  // Clothing
  color: ['Red', 'Blue', 'Green', 'Black', 'White', 'Yellow', 'Pink', 'Purple', 'Orange', 'Brown', 'Gray', 'Navy', 'Beige', 'Multicolor'],
  size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size', '28', '30', '32', '34', '36', '38', '40'],
  material: ['Cotton', 'Polyester', 'Silk', 'Wool', 'Linen', 'Denim', 'Leather', 'Rayon', 'Nylon', 'Velvet'],
  
  // Electronics
  storage: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'],
  ram: ['4GB', '8GB', '16GB', '32GB', '64GB'],
  processor: ['Intel i3', 'Intel i5', 'Intel i7', 'Intel i9', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Apple M1', 'Apple M2', 'Apple M3'],
  
  // Footwear
  width: ['Narrow', 'Standard', 'Wide', 'Extra Wide'],
  
  // Jewelry
  metal: ['Gold', 'Silver', 'Rose Gold', 'Platinum', 'Brass', 'Copper', 'Stainless Steel'],
  stone: ['Diamond', 'Ruby', 'Sapphire', 'Emerald', 'Pearl', 'Cubic Zirconia', 'None'],
};

// Category-specific attribute suggestions
const CATEGORY_TEMPLATES: Record<string, string[]> = {
  'Clothing': ['color', 'size', 'material'],
  'Footwear': ['color', 'size', 'width'],
  'Electronics': ['color', 'storage', 'ram', 'processor'],
  'Bags': ['color', 'size', 'material'],
  'Jewelry': ['metal', 'stone', 'size'],
  'Watches': ['color', 'band_material', 'dial_color'],
  'Accessories': ['color', 'size', 'material'],
};

// All unique attribute keys
const ALL_ATTRIBUTE_KEYS = Object.keys(COMMON_ATTRIBUTES);

// =============================================================================
// TYPES
// =============================================================================

interface AttributeInputProps {
  /** Current attribute values as an array of key-value pairs */
  value: AttributeField[];
  /** Callback when attributes change */
  onChange: (attributes: AttributeField[]) => void;
  /** Product category for attribute suggestions */
  category?: string;
  /** Disable editing */
  disabled?: boolean;
  /** Show compact view */
  compact?: boolean;
  /** Class name for container */
  className?: string;
  /** Error state */
  error?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AttributeInput({
  value = [],
  onChange,
  category,
  disabled = false,
  compact = false,
  className,
  error,
}: AttributeInputProps) {
  const [newKey, setNewKey] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Get suggested keys based on category
  const suggestedKeys = useMemo(() => {
    const categoryKeys = category ? CATEGORY_TEMPLATES[category] || [] : [];
    const usedKeys = value.map(attr => attr.key.toLowerCase());
    return [...categoryKeys, ...ALL_ATTRIBUTE_KEYS]
      .filter((key, index, self) => self.indexOf(key) === index) // unique
      .filter(key => !usedKeys.includes(key.toLowerCase())); // not already used
  }, [category, value]);

  // Add new attribute
  const handleAddAttribute = useCallback((key: string) => {
    if (!key.trim()) return;
    
    const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
    
    // Check if key already exists
    if (value.some(attr => attr.key.toLowerCase() === normalizedKey)) {
      return;
    }
    
    onChange([...value, { key: normalizedKey, value: '' }]);
    setNewKey('');
    setShowSuggestions(false);
  }, [value, onChange]);

  // Update attribute value
  const handleValueChange = useCallback((index: number, newValue: string) => {
    const updated = [...value];
    updated[index] = { ...updated[index], value: newValue };
    onChange(updated);
  }, [value, onChange]);

  // Update attribute key
  const handleKeyChange = useCallback((index: number, newKey: string) => {
    const normalizedKey = newKey.toLowerCase().trim().replace(/\s+/g, '_');
    const updated = [...value];
    updated[index] = { ...updated[index], key: normalizedKey };
    onChange(updated);
  }, [value, onChange]);

  // Remove attribute
  const handleRemoveAttribute = useCallback((index: number) => {
    onChange(value.filter((_, i) => i !== index));
  }, [value, onChange]);

  // Get value suggestions for a key
  const getValueSuggestions = (key: string): string[] => {
    return COMMON_ATTRIBUTES[key.toLowerCase()] || [];
  };

  // Quick add from template
  const handleQuickAddTemplate = useCallback(() => {
    if (!category) return;
    const templateKeys = CATEGORY_TEMPLATES[category] || [];
    const newAttributes = templateKeys
      .filter(key => !value.some(attr => attr.key.toLowerCase() === key.toLowerCase()))
      .map(key => ({ key, value: '' }));
    
    if (newAttributes.length > 0) {
      onChange([...value, ...newAttributes]);
    }
  }, [category, value, onChange]);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header with quick template button */}
      {!compact && category && CATEGORY_TEMPLATES[category] && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Suggested for {category}: {CATEGORY_TEMPLATES[category].join(', ')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleQuickAddTemplate}
            disabled={disabled}
            className="text-xs"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Auto-add
          </Button>
        </div>
      )}

      {/* Existing Attributes */}
      <div className="space-y-2">
        {value.map((attr, index) => (
          <div 
            key={index} 
            className={cn(
              'flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200',
              compact && 'p-1.5'
            )}
          >
            {/* Key Input */}
            <div className="relative flex-shrink-0 w-32">
              <Tag className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <Input
                value={attr.key}
                onChange={(e) => handleKeyChange(index, e.target.value)}
                placeholder="Key"
                disabled={disabled}
                className={cn(
                  'pl-7 text-sm font-medium bg-white',
                  compact && 'h-8 text-xs'
                )}
                list={`keys-${index}`}
              />
              <datalist id={`keys-${index}`}>
                {ALL_ATTRIBUTE_KEYS.map(key => (
                  <option key={key} value={key} />
                ))}
              </datalist>
            </div>

            {/* Separator */}
            <span className="text-gray-400 flex-shrink-0">=</span>

            {/* Value Input */}
            <div className="flex-1">
              <Input
                value={attr.value}
                onChange={(e) => handleValueChange(index, e.target.value)}
                placeholder={`Enter ${attr.key}...`}
                disabled={disabled}
                className={cn('text-sm bg-white', compact && 'h-8 text-xs')}
                list={`values-${index}`}
              />
              {getValueSuggestions(attr.key).length > 0 && (
                <datalist id={`values-${index}`}>
                  {getValueSuggestions(attr.key).map(val => (
                    <option key={val} value={val} />
                  ))}
                </datalist>
              )}
            </div>

            {/* Remove Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleRemoveAttribute(index)}
              disabled={disabled}
              className={cn(
                'flex-shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50',
                compact && 'h-8 w-8'
              )}
            >
              <Trash2 className={cn('w-4 h-4', compact && 'w-3 h-3')} />
            </Button>
          </div>
        ))}
      </div>

      {/* Add New Attribute */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddAttribute(newKey);
                }
              }}
              placeholder="Add attribute (e.g., color, ram, fabric)..."
              disabled={disabled}
              className={cn('text-sm', compact && 'h-8 text-xs')}
            />
            
            {/* Suggestions Dropdown */}
            {showSuggestions && suggestedKeys.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                {suggestedKeys
                  .filter(key => key.toLowerCase().includes(newKey.toLowerCase()))
                  .slice(0, 10)
                  .map(key => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleAddAttribute(key)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-orange-50 flex items-center gap-2"
                    >
                      <Tag className="w-3 h-3 text-gray-400" />
                      <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                      {COMMON_ATTRIBUTES[key] && (
                        <span className="text-xs text-gray-400 ml-auto">
                          {COMMON_ATTRIBUTES[key].length} options
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size={compact ? 'sm' : 'default'}
            onClick={() => handleAddAttribute(newKey)}
            disabled={disabled || !newKey.trim()}
          >
            <Plus className={cn('w-4 h-4', compact && 'w-3 h-3')} />
            {!compact && <span className="ml-1">Add</span>}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* Preview Badges */}
      {value.length > 0 && value.some(attr => attr.value) && (
        <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500 mr-1">Preview:</span>
          {value
            .filter(attr => attr.value)
            .map((attr, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="text-xs bg-orange-50 text-orange-700"
              >
                {attr.key}: {attr.value}
              </Badge>
            ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert AttributeField array to VariantAttributes object
 */
export function attributeFieldsToObject(fields: AttributeField[]): VariantAttributes {
  return fields.reduce((acc, field) => {
    if (field.key && field.value) {
      acc[field.key] = field.value;
    }
    return acc;
  }, {} as VariantAttributes);
}

/**
 * Convert VariantAttributes object to AttributeField array
 */
export function objectToAttributeFields(obj: VariantAttributes | undefined): AttributeField[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .filter(([key, value]) => key && value)
    .map(([key, value]) => ({ key, value }));
}

/**
 * Generate SKU from product name and attributes
 */
export function generateSkuFromAttributes(
  productName: string,
  attributes: AttributeField[]
): string {
  if (!productName) return '';
  
  // Get product prefix (first 3 letters)
  const prefix = productName
    .substring(0, 3)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  
  // Get attribute codes (first 3 letters of each value)
  const attrCodes = attributes
    .filter(attr => attr.value)
    .map(attr => attr.value.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .join('-');
  
  return attrCodes ? `${prefix}-${attrCodes}` : prefix;
}

export default AttributeInput;
