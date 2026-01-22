'use client';

/**
 * ProductVariantSelect - Unified Product Variant Selector
 * 
 * A simple, reusable component for selecting product variants.
 * Drop this into ANY form - Quick Create, Full Order Form, Inventory, etc.
 * 
 * Features:
 * - Auto-open on focus (shows recent/popular items)
 * - Search as you type
 * - Shows: "Product Name - Variant (Stock: X)"
 * - Out-of-stock items disabled
 * - Click to select
 * 
 * Usage:
 * <ProductVariantSelect
 *   value={selectedVariant}
 *   onChange={(variant) => {
 *     setValue('variant_id', variant.variant_id);
 *     setValue('unit_price', variant.price);
 *   }}
 *   placeholder="Search product..."
 * />
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Package, Loader2, X, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { API_ROUTES } from '@/lib/routes';

// =============================================================================
// TYPES
// =============================================================================

export interface VariantOption {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  price: number;
  stock: number;
  image_url?: string;
  attributes?: Record<string, string>;
  shipping_inside?: number;
  shipping_outside?: number;
}

type SearchMode = 'SALES' | 'INVENTORY';

interface ProductVariantSelectProps {
  /** Currently selected variant */
  value?: VariantOption | null;
  /** Callback when variant is selected */
  onChange: (variant: VariantOption) => void;
  /** Callback when selection is cleared */
  onClear?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disable the component */
  disabled?: boolean;
  /** Error message */
  error?: string;
  /** Allow selecting out of stock items */
  allowOutOfStock?: boolean;
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** Additional class names */
  className?: string;
  /** 
   * Search mode:
   * - SALES: Only products with stock > 0 (for Order Forms)
   * - INVENTORY: All active products even with 0 stock (for Purchases)
   */
  mode?: SearchMode;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProductVariantSelect({
  value,
  onChange,
  onClear,
  placeholder = 'Search product or SKU...',
  disabled = false,
  error,
  allowOutOfStock = false,
  autoFocus = false,
  className,
  mode = 'SALES',
}: ProductVariantSelectProps) {
  // State
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VariantOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce timer
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================================================
  // SEARCH FUNCTION
  // ==========================================================================

  const searchVariants = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    try {
      // Use FULL mode to get complete variant data
      const response = await apiClient.get(API_ROUTES.PRODUCTS.SEARCH, {
        params: {
          q: searchQuery || '', // Empty query = recent/popular items
          limit: 15,
          mode: 'FULL', // Always use FULL to get variants
        },
      });

      if (response.data.success) {
        // Transform to flat variant list
        const options: VariantOption[] = [];
        const products = response.data.data || [];

        for (const product of products) {
          // Handle both 'variants' and 'product_variants' keys
          const variants = product.variants || product.product_variants || [];
          
          if (!Array.isArray(variants) || variants.length === 0) {
            // Product with no variants - skip or add as single item
            continue;
          }

          for (const variant of variants) {
            // Apply stock filter based on mode
            if (mode === 'SALES' && (variant.current_stock || 0) <= 0) {
              continue; // Skip out-of-stock for SALES mode
            }
            
            options.push({
              variant_id: variant.id,
              product_id: product.id,
              product_name: product.name,
              variant_name: Object.values(variant.attributes || {}).join(' / ') || 'Default',
              sku: variant.sku,
              price: variant.selling_price || variant.price || 0,
              stock: variant.current_stock || 0,
              image_url: product.image_url,
              attributes: variant.attributes,
              shipping_inside: product.shipping_inside,
              shipping_outside: product.shipping_outside,
            });
          }
        }

        setResults(options);
        setHighlightIndex(0);
      }
    } catch (err) {
      console.error('Product search failed:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce search
    debounceRef.current = setTimeout(() => {
      if (newQuery.length >= 1) {
        searchVariants(newQuery);
      } else {
        searchVariants(''); // Fetch default items
      }
    }, 200);
  };

  // Handle focus - AUTO OPEN with default items
  const handleFocus = () => {
    if (!disabled) {
      setIsOpen(true);
      // Fetch default/recent items on focus
      if (results.length === 0) {
        searchVariants(query || '');
      }
    }
  };

  // Handle select
  const handleSelect = (variant: VariantOption) => {
    if (!allowOutOfStock && variant.stock <= 0) {
      return; // Don't allow selecting out of stock
    }
    onChange(variant);
    setQuery('');
    setIsOpen(false);
    setResults([]);
  };

  // Handle clear
  const handleClear = () => {
    setQuery('');
    setResults([]);
    onClear?.();
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        searchVariants(query || '');
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[highlightIndex]) {
          handleSelect(results[highlightIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  // ==========================================================================
  // CLICK OUTSIDE
  // ==========================================================================

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // ==========================================================================
  // RENDER: SELECTED VALUE
  // ==========================================================================

  if (value) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-2.5 border border-gray-300 rounded-lg bg-gray-50',
          className
        )}
      >
        {/* Image */}
        <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
          {value.image_url ? (
            <img src={value.image_url} alt="" className="w-full h-full object-cover rounded" />
          ) : (
            <Package className="w-5 h-5 text-gray-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">
            {value.product_name} - {value.variant_name}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-mono">{value.sku}</span>
            <span>•</span>
            <span className="text-orange-600 font-medium">Rs. {value.price}</span>
            <span>•</span>
            <span className={value.stock > 0 ? 'text-green-600' : 'text-red-500'}>
              Stock: {value.stock}
            </span>
          </div>
        </div>

        {/* Clear Button */}
        <button
          type="button"
          onClick={handleClear}
          className="p-1.5 hover:bg-gray-200 rounded-full transition-colors"
          disabled={disabled}
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    );
  }

  // ==========================================================================
  // RENDER: SEARCH INPUT
  // ==========================================================================

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            'pl-9 pr-10',
            error && 'border-red-300 focus:ring-red-500',
            disabled && 'bg-gray-100 cursor-not-allowed'
          )}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-72 overflow-auto">
          {results.length === 0 && !isLoading ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              {query ? `No products found for "${query}"` : 'Start typing to search...'}
            </div>
          ) : (
            results.map((variant, index) => {
              const isOutOfStock = variant.stock <= 0;
              const isHighlighted = index === highlightIndex;
              const isDisabled = isOutOfStock && !allowOutOfStock;

              return (
                <button
                  key={variant.variant_id}
                  type="button"
                  onClick={() => handleSelect(variant)}
                  disabled={isDisabled}
                  className={cn(
                    'w-full px-3 py-2.5 text-left flex items-center gap-3 border-b border-gray-100 last:border-0 transition-colors',
                    isHighlighted && !isDisabled && 'bg-orange-50',
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed bg-gray-50'
                      : 'hover:bg-orange-50'
                  )}
                >
                  {/* Image */}
                  <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                    {variant.image_url ? (
                      <img src={variant.image_url} alt="" className="w-full h-full object-cover rounded" />
                    ) : (
                      <Package className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'font-medium text-sm truncate',
                      isDisabled ? 'text-gray-500' : 'text-gray-900'
                    )}>
                      {variant.product_name} - {variant.variant_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-gray-400 font-mono">{variant.sku}</span>
                      {variant.attributes && Object.entries(variant.attributes).slice(0, 2).map(([key, val]) => (
                        <Badge key={key} variant="outline" className="text-xs px-1.5 py-0 h-4">
                          {String(val)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Price & Stock */}
                  <div className="text-right flex-shrink-0">
                    <p className={cn(
                      'font-semibold text-sm',
                      isDisabled ? 'text-gray-400' : 'text-orange-600'
                    )}>
                      Rs. {variant.price?.toLocaleString()}
                    </p>
                    <p className={cn(
                      'text-xs font-medium',
                      isOutOfStock ? 'text-red-500' : 'text-green-600'
                    )}>
                      {isOutOfStock ? 'Out of stock' : `Stock: ${variant.stock}`}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default ProductVariantSelect;
