'use client';

/**
 * AsyncProductSelect - Smart Product Search Component
 *
 * 🚀 PERFORMANCE UPGRADE: Local Cache + Realtime Sync
 * 
 * Features:
 * - 0ms search latency (all data in memory via Zustand store)
 * - 100% stock accuracy (realtime sync from Supabase)
 * - Table format: Item Name | Variant | SKU | Price | Stock
 * - Search by Product Name, Variant attributes, or SKU
 * - Keyboard navigation (up/down/enter)
 * - Click outside to close
 * - Smart positioning (up/down based on viewport)
 *
 * @author Senior Frontend Architect
 * @priority P0 - Performance Critical
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Package,
  Loader2,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProductStore, CachedProductVariant, searchVariants } from '@/stores/useProductStore';
import apiClient from '@/lib/api/apiClient';
import { useDebounce } from '@/hooks/useDebounce';

// =============================================================================
// TYPES
// =============================================================================

export interface ProductVariant {
  id: string;
  sku: string;
  color?: string;
  size?: string;
  attributes?: Record<string, string>;
  variant_name?: string;    // Combined variant name (e.g., "XL / Black")
  selling_price: number;
  cost_price?: number;
  current_stock: number;
  reserved_stock?: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  is_active: boolean;
  variants?: ProductVariant[];
}

export interface AsyncProductSelectProps {
  /** Callback when product+variant is selected */
  onSelect: (product: Product, variant: ProductVariant) => void;
  /** Callback when selection is cleared */
  onClear?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Error message */
  error?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Initial selected value for display */
  value?: { productName: string; variantName: string } | null;
  /** Show variant selector inline */
  showVariantSelector?: boolean;
  /** Auto-select first variant */
  autoSelectFirstVariant?: boolean;
  /** Additional class names */
  className?: string;
  /** Dropdown direction: 'auto', 'up', 'down' */
  direction?: 'auto' | 'up' | 'down';
  /** Use portal for rendering (helps with overflow issues) */
  usePortal?: boolean;
  /** Allow selecting out of stock items (for pre-orders). Default: false */
  allowOutOfStock?: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const getAvailableStock = (variant: CachedProductVariant): number => {
  return variant.available_stock;
};

// Convert CachedProductVariant to the expected Product/Variant format
const toProductVariant = (cached: CachedProductVariant): { product: Product; variant: ProductVariant } => {
  return {
    product: {
      id: cached.product_id,
      name: cached.product_name,
      brand: cached.brand,
      image_url: cached.image_url,
      is_active: cached.is_active,
    },
    variant: {
      id: cached.id,
      sku: cached.sku,
      selling_price: cached.selling_price,
      cost_price: cached.cost_price,
      current_stock: cached.current_stock,
      reserved_stock: cached.reserved_stock,
      is_active: cached.is_active,
      // Include variant name for proper display
      variant_name: cached.variant_name,
    },
  };
};

// =============================================================================
// COMPONENT
// =============================================================================

export const AsyncProductSelect = forwardRef<
  HTMLInputElement,
  AsyncProductSelectProps
>(
  (
    {
      onSelect,
      onClear,
      placeholder = 'Search products...',
      label,
      error,
      disabled = false,
      value = null,
      className,
      direction = 'auto',
      usePortal = true,
      allowOutOfStock = false,
    },
    ref
  ) => {
    // =========================================================================
    // STATE
    // =========================================================================
    
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [dropdownPosition, setDropdownPosition] = useState<'up' | 'down'>('down');
    const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // =========================================================================
    // LOCAL STORE - 0ms SEARCH (with API fallback)
    // =========================================================================
    
    const { variants, isLoading: storeLoading, isInitialized } = useProductStore();
    const [apiVariants, setApiVariants] = useState<CachedProductVariant[]>([]);
    const [apiFetching, setApiFetching] = useState(false);
    const debouncedQuery = useDebounce(query, 150);
    
    // Fallback: If store is empty after timeout, fetch from API
    useEffect(() => {
      if (isOpen && isInitialized && variants.length === 0 && !apiFetching) {
        console.log('[AsyncProductSelect] Store empty, falling back to API...');
        setApiFetching(true);
        
        apiClient.get(`/products/search?limit=50&mode=FULL`)
          .then(response => {
            const data = response.data.data || response.data || [];
            // Transform API data to CachedProductVariant format
            const transformed: CachedProductVariant[] = [];
            for (const product of data) {
              if (product.variants) {
                for (const v of product.variants) {
                  let variantName = 'Default';
                  if (v.attributes && Object.keys(v.attributes).length > 0) {
                    variantName = Object.values(v.attributes).join(' / ');
                  } else if (v.color || v.size) {
                    variantName = [v.size, v.color].filter(Boolean).join(' / ');
                  }
                  
                  transformed.push({
                    id: v.id,
                    sku: v.sku,
                    product_id: product.id,
                    product_name: product.name,
                    brand: product.brand,
                    variant_name: variantName,
                    display_name: `${product.name} - ${variantName}`,
                    selling_price: v.selling_price || 0,
                    cost_price: v.cost_price,
                    current_stock: v.current_stock || 0,
                    reserved_stock: v.reserved_stock || 0,
                    available_stock: (v.current_stock || 0) - (v.reserved_stock || 0),
                    is_active: v.is_active,
                    image_url: product.image_url,
                    search_text: [product.name, variantName, v.sku, product.brand].filter(Boolean).join(' ').toLowerCase(),
                  });
                }
              }
            }
            setApiVariants(transformed);
            console.log('[AsyncProductSelect] API fallback loaded:', transformed.length, 'variants');
          })
          .catch(err => {
            console.error('[AsyncProductSelect] API fallback error:', err);
          })
          .finally(() => setApiFetching(false));
      }
    }, [isOpen, isInitialized, variants.length, apiFetching]);
    
    // Use store variants if available, otherwise use API fallback
    const effectiveVariants = variants.length > 0 ? variants : apiVariants;
    const isLoading = storeLoading || (isInitialized && variants.length === 0 && apiFetching);

    // 🚀 INSTANT FILTERING - No API call, pure memory search
    const filteredVariants = useMemo(() => {
      if (!isOpen) return [];
      
      return searchVariants(effectiveVariants, query, {
        limit: 20,
        includeOutOfStock: true, // Always show, but mark as disabled if not allowed
        activeOnly: true,
      });
    }, [effectiveVariants, query, isOpen]);

    // ==========================================================================
    // POSITIONING LOGIC
    // ==========================================================================

    const calculateDropdownPosition = useCallback(() => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 320;

      let position: 'up' | 'down' = 'down';

      if (direction === 'up') {
        position = 'up';
      } else if (direction === 'down') {
        position = 'down';
      } else {
        position = spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down';
      }

      setDropdownPosition(position);

      if (usePortal) {
        const styles: React.CSSProperties = {
          position: 'fixed',
          left: rect.left,
          width: Math.max(rect.width, 600),
          zIndex: 9999,
        };

        if (position === 'up') {
          styles.bottom = viewportHeight - rect.top + 4;
        } else {
          styles.top = rect.bottom + 4;
        }

        setDropdownStyles(styles);
      }
    }, [direction, usePortal]);

    // Recalculate position on open/resize
    useEffect(() => {
      if (isOpen) {
        calculateDropdownPosition();
        window.addEventListener('resize', calculateDropdownPosition);
        window.addEventListener('scroll', calculateDropdownPosition, true);
      }

      return () => {
        window.removeEventListener('resize', calculateDropdownPosition);
        window.removeEventListener('scroll', calculateDropdownPosition, true);
      };
    }, [isOpen, calculateDropdownPosition]);

    // ==========================================================================
    // CLICK OUTSIDE HANDLER
    // ==========================================================================

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        const isInContainer = containerRef.current?.contains(target);
        const isInDropdown = dropdownRef.current?.contains(target);

        if (!isInContainer && !isInDropdown) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ==========================================================================
    // HANDLERS
    // ==========================================================================

    const handleVariantSelect = useCallback((cached: CachedProductVariant, e?: React.MouseEvent) => {
      e?.stopPropagation();
      e?.preventDefault();
      
      const stock = getAvailableStock(cached);
      // Block out of stock selection only if allowOutOfStock is false
      if (stock <= 0 && !allowOutOfStock) return;
      
      const { product, variant } = toProductVariant(cached);
      
      console.log('[AsyncProductSelect] ⚡ Instant select:', cached.sku, 'Stock:', stock);
      
      onSelect(product, variant);
      setQuery('');
      setIsOpen(false);
    }, [onSelect, allowOutOfStock]);

    // ==========================================================================
    // KEYBOARD NAVIGATION
    // ==========================================================================

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!isOpen) {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            setIsOpen(true);
            return;
          }
        }

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setHighlightedIndex((prev) =>
              Math.min(prev + 1, filteredVariants.length - 1)
            );
            break;
          case 'ArrowUp':
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
            break;
          case 'Enter':
            e.preventDefault();
            if (filteredVariants[highlightedIndex]) {
              const item = filteredVariants[highlightedIndex];
              const stock = getAvailableStock(item);
              if (stock > 0 || allowOutOfStock) {
                handleVariantSelect(item);
              }
            }
            break;
          case 'Escape':
            setIsOpen(false);
            break;
        }
      },
      [isOpen, filteredVariants, highlightedIndex, handleVariantSelect, allowOutOfStock]
    );

    // Reset highlighted index when filtered variants change
    useEffect(() => {
      setHighlightedIndex(0);
    }, [filteredVariants]);

    const handleInputFocus = () => {
      setIsOpen(true);
    };

    const handleClear = () => {
      setQuery('');
      onClear?.();
      inputRef.current?.focus();
    };

    // ==========================================================================
    // RENDER DROPDOWN - TABLE FORMAT
    // ==========================================================================

    const renderDropdownContent = () => (
      <div
        ref={dropdownRef}
        className={cn(
          'bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden',
          !usePortal && 'absolute w-full',
          !usePortal && dropdownPosition === 'up' && 'bottom-full mb-1',
          !usePortal && dropdownPosition === 'down' && 'top-full mt-1',
          !usePortal && 'z-[100]'
        )}
        style={usePortal ? dropdownStyles : { minWidth: '600px' }}
      >
        {/* Loading State - Only shown during initial load */}
        {!isInitialized && isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
            <span className="ml-2 text-gray-500 text-sm">Loading inventory...</span>
          </div>
        )}

        {/* No Results */}
        {isInitialized && filteredVariants.length === 0 && (
          <div className="text-center py-6 text-gray-500">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No products found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        )}

        {/* Table Format Variant List */}
        {filteredVariants.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {/* Table Header */}
            <div className="sticky top-0 bg-gray-100 border-b border-gray-200 grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              <div className="col-span-4">Item Name</div>
              <div className="col-span-2">Variant</div>
              <div className="col-span-2">SKU</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-2 text-right">Stock</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-gray-50">
              {filteredVariants.map((item, index) => {
                const stock = getAvailableStock(item);
                const isOutOfStock = stock <= 0;
                const isLowStock = stock > 0 && stock <= 5;
                const canSelect = !isOutOfStock || allowOutOfStock;
                
                return (
                  <div
                    key={item.id}
                    onClick={(e) => canSelect ? handleVariantSelect(item, e) : e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'grid grid-cols-12 gap-2 px-3 py-2.5 transition-all duration-100',
                      !canSelect 
                        ? 'bg-gray-50 opacity-50 cursor-not-allowed' 
                        : isOutOfStock && allowOutOfStock
                          ? highlightedIndex === index
                            ? 'bg-amber-50 border-l-2 border-l-amber-500 cursor-pointer'
                            : 'hover:bg-amber-50 border-l-2 border-l-transparent cursor-pointer'
                          : highlightedIndex === index
                            ? 'bg-orange-50 border-l-2 border-l-orange-500 cursor-pointer'
                            : 'hover:bg-gray-50 border-l-2 border-l-transparent cursor-pointer'
                    )}
                  >
                    {/* Item Name */}
                    <div className="col-span-4 min-w-0">
                      <p className={cn(
                        'font-medium text-sm truncate',
                        !canSelect ? 'text-gray-400' : 'text-gray-900'
                      )}>{item.product_name}</p>
                      {item.brand && (
                        <p className="text-[10px] text-gray-400 truncate">{item.brand}</p>
                      )}
                    </div>
                    
                    {/* Variant */}
                    <div className="col-span-2 flex items-center">
                      <span className={cn(
                        'text-sm truncate',
                        !canSelect ? 'text-gray-400' : 'text-gray-700'
                      )}>{item.variant_name}</span>
                    </div>
                    
                    {/* SKU */}
                    <div className="col-span-2 flex items-center">
                      <code className={cn(
                        'text-xs font-mono px-1.5 py-0.5 rounded truncate',
                        !canSelect ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-500'
                      )}>
                        {item.sku}
                      </code>
                    </div>
                    
                    {/* Price */}
                    <div className="col-span-2 flex items-center justify-end">
                      <span className={cn(
                        'text-sm font-semibold',
                        !canSelect ? 'text-gray-400' : 'text-gray-900'
                      )}>
                        रु. {item.selling_price.toLocaleString()}
                      </span>
                    </div>
                    
                    {/* Stock */}
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        isOutOfStock
                          ? allowOutOfStock 
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                          : isLowStock
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                      )}>
                        {isOutOfStock 
                          ? allowOutOfStock 
                            ? 'Pre-Order' 
                            : 'Out of Stock' 
                          : stock}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Results Count Footer with Realtime Indicator */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-3 py-1.5 flex items-center justify-between">
              <span className="text-[10px] text-gray-500">
                {filteredVariants.length} variant{filteredVariants.length !== 1 ? 's' : ''} found
                {query && ` matching "${query}"`}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-green-600">
                <Zap className="w-3 h-3" />
                Live Stock
              </span>
            </div>
          </div>
        )}
      </div>
    );

    // ==========================================================================
    // MAIN RENDER
    // ==========================================================================

    return (
      <div ref={containerRef} className={cn('relative', className)}>
        {/* Label */}
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}

        {/* Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            ref={(node) => {
              (inputRef as any).current = node;
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            type="text"
            value={value ? `${value.productName} - ${value.variantName}` : query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (value) onClear?.();
            }}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'block w-full pl-10 pr-10 py-2.5 text-sm border rounded-lg',
              'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500',
              'placeholder:text-gray-400 transition-colors',
              error
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 bg-white',
              disabled && 'bg-gray-100 cursor-not-allowed'
            )}
          />

          {/* Clear Button */}
          {(query || value) && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

        {/* Dropdown */}
        {isOpen &&
          (usePortal && typeof document !== 'undefined'
            ? createPortal(renderDropdownContent(), document.body)
            : renderDropdownContent())}
      </div>
    );
  }
);

AsyncProductSelect.displayName = 'AsyncProductSelect';

export default AsyncProductSelect;
