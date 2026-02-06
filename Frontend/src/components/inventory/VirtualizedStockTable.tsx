'use client';

/**
 * VirtualizedStockTable - High-Performance Inventory Table
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * 1. React.memo on InventoryRow - Only re-renders when props change
 * 2. @tanstack/react-virtual - Only renders visible rows (DOM virtualization)
 * 3. useMemo for grouping/filtering - Prevents unnecessary recalculations
 * 4. useCallback for event handlers - Stable references
 * 
 * TARGET: <16ms frame times with 1000+ items
 */

import { useState, useMemo, useCallback, useRef, Fragment, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Package, CheckCircle, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';

// =============================================================================
// TYPES
// =============================================================================

export interface StockItem {
  id: string;
  sku: string;
  product_name: string;
  image_url?: string;
  current_stock: number;
  cost_price: number | string;
  selling_price: number;
  stock_value?: number | string;
  threshold?: number;
}

interface GroupedProduct {
  product_name: string;
  image_url?: string;
  total_stock: number;
  total_value: number;
  variant_count: number;
  variants: StockItem[];
}

interface VirtualizedStockTableProps {
  items: StockItem[];
  type: 'available' | 'out_of_stock' | 'low_stock';
  isLoading: boolean;
  canSeeFinancials: boolean;
}

// =============================================================================
// MEMOIZED ROW COMPONENTS
// =============================================================================

interface ProductRowProps {
  product: GroupedProduct;
  isExpanded: boolean;
  onToggle: (name: string) => void;
  canSeeFinancials: boolean;
}

/**
 * ProductRow - Memoized product group header row
 * 
 * Only re-renders when:
 * - Product data changes
 * - Expanded state changes
 * - Financial visibility changes
 */
const ProductRow = memo(function ProductRow({
  product,
  isExpanded,
  onToggle,
  canSeeFinancials,
}: ProductRowProps) {
  const hasVariants = product.variant_count > 1;
  
  const handleClick = useCallback(() => {
    if (hasVariants) {
      onToggle(product.product_name);
    }
  }, [hasVariants, onToggle, product.product_name]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && hasVariants) {
      e.preventDefault();
      onToggle(product.product_name);
    }
  }, [hasVariants, onToggle, product.product_name]);

  return (
    <div
      role="row"
      tabIndex={hasVariants ? 0 : -1}
      className={cn(
        'grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2.5 border-b border-gray-100',
        'hover:bg-gray-50 transition-colors cursor-pointer',
        isExpanded && 'bg-orange-50/50'
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Expand/Collapse */}
      <div className="w-6 h-6 flex items-center justify-center">
        {hasVariants ? (
          <span className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </span>
        ) : (
          <div className="w-5 h-5" />
        )}
      </div>

      {/* Product Info */}
      <div className="flex items-center gap-3 min-w-0">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.product_name}
            className="w-9 h-9 rounded-lg object-cover bg-gray-100 flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-gray-400" />
          </div>
        )}
        <div className="min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">
            {product.product_name}
          </div>
          <div className="text-xs text-gray-500">
            {product.variant_count} variant{product.variant_count > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Stock Badge */}
      <Badge
        className={cn(
          'font-semibold text-xs',
          product.total_stock > 10
            ? 'bg-green-100 text-green-700'
            : product.total_stock > 0
            ? 'bg-amber-100 text-amber-700'
            : 'bg-red-100 text-red-700'
        )}
      >
        {product.total_stock.toLocaleString()} units
      </Badge>

      {/* Value */}
      {canSeeFinancials && (
        <div className="text-right font-medium text-gray-700 text-sm w-24">
          {formatCurrency(product.total_value)}
        </div>
      )}
    </div>
  );
});

interface VariantRowProps {
  variant: StockItem;
  canSeeFinancials: boolean;
}

/**
 * VariantRow - Memoized variant detail row
 * 
 * Only re-renders when variant data or financial visibility changes
 */
const VariantRow = memo(function VariantRow({
  variant,
  canSeeFinancials,
}: VariantRowProps) {
  return (
    <div
      role="row"
      className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2 border-b border-gray-50 bg-gray-50/30 border-l-4 border-l-orange-300"
    >
      {/* Spacer */}
      <div className="w-6" />

      {/* Variant Info */}
      <div className="flex items-center gap-2 pl-10 min-w-0">
        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-700 truncate">{variant.sku}</span>
      </div>

      {/* Stock */}
      <span
        className={cn(
          'text-xs font-medium px-2 py-0.5 rounded',
          variant.current_stock > 10
            ? 'text-green-600 bg-green-50'
            : variant.current_stock > 0
            ? 'text-amber-600 bg-amber-50'
            : 'text-red-600 bg-red-50'
        )}
      >
        {variant.current_stock} units
      </span>

      {/* Value */}
      {canSeeFinancials && (
        <div className="text-right text-sm text-gray-600 w-24">
          {typeof variant.stock_value === 'number'
            ? formatCurrency(variant.stock_value)
            : '—'}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// MAIN VIRTUALIZED TABLE COMPONENT
// =============================================================================

export function VirtualizedStockTable({
  items,
  type,
  isLoading,
  canSeeFinancials,
}: VirtualizedStockTableProps) {
  const [search, setSearch] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  // Group items by product_name (memoized)
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, GroupedProduct>();

    items.forEach((item) => {
      const key = item.product_name;
      if (!groups.has(key)) {
        groups.set(key, {
          product_name: item.product_name,
          image_url: item.image_url,
          total_stock: 0,
          total_value: 0,
          variant_count: 0,
          variants: [],
        });
      }
      const group = groups.get(key)!;
      group.total_stock += item.current_stock || 0;
      group.total_value += typeof item.stock_value === 'number' ? item.stock_value : 0;
      group.variant_count += 1;
      group.variants.push(item);
    });

    return Array.from(groups.values()).sort((a, b) => b.total_stock - a.total_stock);
  }, [items]);

  // Filter grouped products (memoized)
  const filtered = useMemo(() => {
    if (!search) return groupedProducts;
    const lc = search.toLowerCase();
    return groupedProducts.filter(
      (p) =>
        p.product_name.toLowerCase().includes(lc) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(lc))
    );
  }, [groupedProducts, search]);

  // Build flat list for virtualizer (products + expanded variants)
  type FlatRow =
    | { type: 'product'; product: GroupedProduct }
    | { type: 'variant'; variant: StockItem; productName: string };

  const flatRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    filtered.forEach((product) => {
      rows.push({ type: 'product', product });
      if (expandedProducts.has(product.product_name)) {
        product.variants.forEach((variant) => {
          rows.push({ type: 'variant', variant, productName: product.product_name });
        });
      }
    });
    return rows;
  }, [filtered, expandedProducts]);

  // Virtualizer for efficient rendering
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      // Product rows are slightly taller than variant rows
      return flatRows[index]?.type === 'product' ? 56 : 44;
    }, [flatRows]),
    overscan: 5, // Render 5 extra items above/below viewport
  });

  // Toggle expansion (memoized)
  const handleToggle = useCallback((productName: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productName)) {
        next.delete(productName);
      } else {
        next.add(productName);
      }
      return next;
    });
  }, []);

  // Handle search change (memoized)
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
      </div>
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    const emptyConfig = {
      available: { icon: Package, text: 'No items in stock', color: 'text-gray-400' },
      out_of_stock: { icon: CheckCircle, text: 'All items in stock!', color: 'text-green-500' },
      low_stock: { icon: CheckCircle, text: 'No low stock items', color: 'text-green-500' },
    };
    const config = emptyConfig[type];
    const EmptyIcon = config.icon;

    return (
      <div className="p-8 text-center">
        <EmptyIcon className={cn('w-12 h-12 mx-auto mb-2', config.color)} />
        <p className="font-medium text-gray-600">{config.text}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={handleSearchChange}
          className="pl-10"
        />
      </div>

      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2 bg-gray-50 rounded-t-lg border border-gray-200 border-b-0">
        <div className="w-6" />
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Stock</div>
        {canSeeFinancials && (
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right w-24">Value</div>
        )}
      </div>

      {/* Virtualized Table Body */}
      <div
        ref={parentRef}
        className="border rounded-b-lg overflow-auto"
        style={{ height: '400px' }}
        role="table"
        aria-label="Stock list"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = flatRows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.type === 'product' ? (
                  <ProductRow
                    product={row.product}
                    isExpanded={expandedProducts.has(row.product.product_name)}
                    onToggle={handleToggle}
                    canSeeFinancials={canSeeFinancials}
                  />
                ) : (
                  <VariantRow
                    variant={row.variant}
                    canSeeFinancials={canSeeFinancials}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="text-xs text-gray-500 text-center">
        Showing {filtered.length} products ({items.length} variants)
        {flatRows.length > 50 && (
          <span className="ml-2 text-green-600">
            • Virtualized ({rowVirtualizer.getVirtualItems().length} DOM nodes)
          </span>
        )}
      </div>
    </div>
  );
}

export default VirtualizedStockTable;
