'use client';

/**
 * AsyncProductSelect - Smart Product Search Component
 *
 * A reusable, scalable product search component with:
 * - Smart positioning (renders upward if at bottom of screen)
 * - High z-index for proper layering
 * - Debounced search (300ms)
 * - Default list on focus
 * - Stock display with low stock warnings
 * - Keyboard navigation
 * - Click outside to close
 *
 * @usage
 * <AsyncProductSelect
 *   onSelect={(product, variant) => handleSelection(product, variant)}
 *   placeholder="Search products..."
 * />
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Package,
  Loader2,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface ProductVariant {
  id: string;
  sku: string;
  color?: string;
  size?: string;
  attributes?: Record<string, string>;
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
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const getVariantDisplayName = (variant: ProductVariant): string => {
  if (variant.attributes && Object.keys(variant.attributes).length > 0) {
    return Object.values(variant.attributes).join(' / ');
  }
  // Fallback for legacy data
  const parts = [variant.color, variant.size].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : variant.sku;
};

const getAvailableStock = (variant: ProductVariant): number => {
  return variant.current_stock - (variant.reserved_stock || 0);
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
      showVariantSelector = true,
      autoSelectFirstVariant = false,
      className,
      direction = 'auto',
      usePortal = true,
    },
    ref
  ) => {
    // State
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [dropdownPosition, setDropdownPosition] = useState<'up' | 'down'>('down');
    const [dropdownStyles, setDropdownStyles] = useState<React.CSSProperties>({});

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Debounced search query
    const debouncedQuery = useDebounce(query, 300);

    // ==========================================================================
    // API CALLS
    // ==========================================================================

    const fetchProducts = useCallback(async (searchQuery: string = '') => {
      setIsLoading(true);
      try {
        const endpoint = searchQuery
          ? `/products/search?q=${encodeURIComponent(searchQuery)}&limit=10&include_variants=true`
          : `/products?limit=10&is_active=true`;

        const response = await apiClient.get(endpoint);
        const data = response.data.data || response.data || [];
        setProducts(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[AsyncProductSelect] Fetch error:', err);
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    }, []);

    // Fetch on debounced query change
    useEffect(() => {
      if (isOpen) {
        fetchProducts(debouncedQuery);
      }
    }, [debouncedQuery, isOpen, fetchProducts]);

    // ==========================================================================
    // POSITIONING LOGIC
    // ==========================================================================

    const calculateDropdownPosition = useCallback(() => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 320; // max-h-80 = 320px

      let position: 'up' | 'down' = 'down';

      if (direction === 'up') {
        position = 'up';
      } else if (direction === 'down') {
        position = 'down';
      } else {
        // Auto: prefer down, but use up if not enough space below
        position = spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down';
      }

      setDropdownPosition(position);

      // Calculate styles for portal positioning
      if (usePortal) {
        const styles: React.CSSProperties = {
          position: 'fixed',
          left: rect.left,
          width: rect.width,
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
          setSelectedProduct(null);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
              Math.min(prev + 1, products.length - 1)
            );
            break;
          case 'ArrowUp':
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
            break;
          case 'Enter':
            e.preventDefault();
            if (products[highlightedIndex]) {
              handleProductClick(products[highlightedIndex]);
            }
            break;
          case 'Escape':
            setIsOpen(false);
            setSelectedProduct(null);
            break;
        }
      },
      [isOpen, products, highlightedIndex]
    );

    // Reset highlighted index when products change
    useEffect(() => {
      setHighlightedIndex(0);
    }, [products]);

    // ==========================================================================
    // HANDLERS
    // ==========================================================================

    const handleInputFocus = () => {
      setIsOpen(true);
      if (products.length === 0) {
        fetchProducts('');
      }
    };

    const handleProductClick = (product: Product) => {
      setSelectedProduct(product);

      // If no variants or single variant, auto-select
      if (!product.variants || product.variants.length === 0) {
        // No variants - create dummy variant
        const dummyVariant: ProductVariant = {
          id: product.id,
          sku: 'N/A',
          selling_price: 0,
          current_stock: 0,
          is_active: true,
        };
        onSelect(product, dummyVariant);
        setIsOpen(false);
        setQuery(product.name);
      } else if (product.variants.length === 1 || autoSelectFirstVariant) {
        // Single variant - auto-select
        const variant = product.variants[0];
        onSelect(product, variant);
        setIsOpen(false);
        setQuery(`${product.name} - ${getVariantDisplayName(variant)}`);
        setSelectedProduct(null);
      }
      // If multiple variants, show variant selector
    };

    const handleVariantClick = (product: Product, variant: ProductVariant) => {
      onSelect(product, variant);
      setQuery(`${product.name} - ${getVariantDisplayName(variant)}`);
      setIsOpen(false);
      setSelectedProduct(null);
    };

    const handleClear = () => {
      setQuery('');
      setSelectedProduct(null);
      setProducts([]);
      onClear?.();
      inputRef.current?.focus();
    };

    // ==========================================================================
    // RENDER DROPDOWN
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
        style={usePortal ? dropdownStyles : undefined}
      >
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            <span className="ml-2 text-gray-500 text-sm">Searching...</span>
          </div>
        )}

        {/* No Results */}
        {!isLoading && products.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No products found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        )}

        {/* Product List */}
        {!isLoading && products.length > 0 && !selectedProduct && (
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {products.map((product, index) => (
              <li
                key={product.id}
                onClick={() => handleProductClick(product)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                  highlightedIndex === index
                    ? 'bg-orange-50'
                    : 'hover:bg-gray-50'
                )}
              >
                {/* Product Image */}
                <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {product.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {product.brand && <span>{product.brand}</span>}
                    {product.brand && <span>•</span>}
                    <span>
                      {product.variants?.length || 0} variant
                      {(product.variants?.length || 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Price Range */}
                {product.variants && product.variants.length > 0 && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900">
                      Rs.{' '}
                      {Math.min(
                        ...product.variants.map((v) => v.selling_price)
                      ).toLocaleString()}
                      {product.variants.length > 1 &&
                        ` - ${Math.max(
                          ...product.variants.map((v) => v.selling_price)
                        ).toLocaleString()}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      Stock:{' '}
                      {product.variants.reduce(
                        (sum, v) => sum + v.current_stock,
                        0
                      )}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Variant Selector */}
        {!isLoading && selectedProduct && showVariantSelector && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">
                Select Variant for{' '}
                <span className="text-orange-600">{selectedProduct.name}</span>
              </p>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid gap-2 max-h-60 overflow-y-auto">
              {selectedProduct.variants
                ?.filter((v) => v.is_active)
                .map((variant) => {
                  const stock = getAvailableStock(variant);
                  const isOutOfStock = stock <= 0;
                  const isLowStock = stock > 0 && stock <= 5;

                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() =>
                        !isOutOfStock &&
                        handleVariantClick(selectedProduct, variant)
                      }
                      disabled={isOutOfStock}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border text-left transition-all',
                        isOutOfStock
                          ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                          : 'bg-white border-gray-200 hover:border-orange-400 hover:bg-orange-50'
                      )}
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {getVariantDisplayName(variant)}
                        </p>
                        <p className="text-xs text-gray-500">{variant.sku}</p>
                      </div>

                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          Rs. {variant.selling_price.toLocaleString()}
                        </p>
                        <div
                          className={cn(
                            'text-xs flex items-center gap-1',
                            isOutOfStock
                              ? 'text-red-500'
                              : isLowStock
                              ? 'text-amber-500'
                              : 'text-green-600'
                          )}
                        >
                          {isLowStock && (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {isOutOfStock ? 'Out of Stock' : `Stock: ${stock}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
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
              // Handle both refs
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
