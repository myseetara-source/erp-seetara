/**
 * OrderItemsHover Component
 * 
 * Displays detailed product breakdown on hover/click
 * Shows: Product image, name, variant, SKU, quantity
 * 
 * @author Senior Frontend Architect
 * @priority P0 - UX Enhancement
 */

'use client';

import { ReactNode } from 'react';
import Image from 'next/image';
import { Package, ShoppingBag } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { OrderItemPreview } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

interface OrderItemsHoverProps {
  /** Order items to display */
  items: OrderItemPreview[];
  /** Trigger element (children) */
  children: ReactNode;
  /** Alignment of popover */
  align?: 'start' | 'center' | 'end';
  /** Side of popover */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Additional className for trigger */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function OrderItemsHover({
  items,
  children,
  align = 'start',
  side = 'bottom',
  className,
}: OrderItemsHoverProps) {
  // No items = no tooltip
  if (!items || items.length === 0) {
    return <>{children}</>;
  }

  // Calculate totals
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalItems = items.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span 
          className={cn(
            'cursor-help decoration-dashed underline-offset-2',
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent 
        className="w-72 p-0 shadow-lg" 
        align={align}
        side={side}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b bg-gray-50/80">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-gray-500" />
            <span className="text-xs font-medium text-gray-700">
              Order Contents
            </span>
            <span className="ml-auto text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {totalItems} item{totalItems !== 1 ? 's' : ''} · {totalQuantity} qty
            </span>
          </div>
        </div>

        {/* Items List */}
        <div className="max-h-64 overflow-y-auto">
          {items.map((item, index) => (
            <ItemRow key={item.id || index} item={item} />
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t bg-gray-50/50">
          <p className="text-[10px] text-gray-500 text-center">
            Click row to view order details
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// ITEM ROW COMPONENT
// =============================================================================

interface ItemRowProps {
  item: OrderItemPreview;
}

function ItemRow({ item }: ItemRowProps) {
  // Get image URL from variant's product
  const imageUrl = item.variant?.product?.image_url;
  const productName = item.product_name || item.variant?.product?.name || 'Unknown Product';
  const variantName = item.variant_name || formatVariantFromAttributes(item.variant);
  
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
      {/* Product Image */}
      <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={productName}
            width={32}
            height={32}
            className="w-full h-full object-cover"
          />
        ) : (
          <Package className="w-4 h-4 text-gray-400" />
        )}
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-gray-900 truncate" title={productName}>
          {productName}
        </p>
        <div className="flex items-center gap-1.5">
          {variantName && (
            <span className="text-[10px] text-gray-500 truncate">
              {variantName}
            </span>
          )}
          {item.sku && (
            <span className="text-[9px] text-gray-400 font-mono">
              · {item.sku}
            </span>
          )}
        </div>
      </div>

      {/* Quantity Badge */}
      <div className="shrink-0">
        <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 text-[10px] font-semibold bg-primary/10 text-primary rounded">
          ×{item.quantity}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format variant name from attributes if variant_name is not available
 */
function formatVariantFromAttributes(variant?: OrderItemPreview['variant']): string {
  if (!variant) return '';
  
  // Try attributes object first
  if (variant.attributes && Object.keys(variant.attributes).length > 0) {
    return Object.values(variant.attributes).join(' / ');
  }
  
  // Fall back to color/size
  const parts: string[] = [];
  if (variant.size) parts.push(variant.size);
  if (variant.color) parts.push(variant.color);
  
  return parts.join(' / ');
}

// =============================================================================
// CONVENIENCE COMPONENTS
// =============================================================================

/**
 * ItemCountHover - Pre-styled hover for item count display
 * Use in the Product column: "Product Name" + "+ X more items..."
 */
interface ItemCountHoverProps {
  items: OrderItemPreview[];
  primaryItemName?: string;
}

export function ItemCountHover({ items, primaryItemName }: ItemCountHoverProps) {
  if (!items || items.length <= 1) {
    return (
      <span className="font-medium text-gray-900 truncate text-[11px]">
        {primaryItemName || items?.[0]?.product_name || '—'}
      </span>
    );
  }

  const additionalCount = items.length - 1;
  const displayName = primaryItemName || items[0]?.product_name || 'Product';

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-gray-900 truncate text-[11px]" title={displayName}>
        {displayName}
      </span>
      <OrderItemsHover items={items}>
        <span className="text-[10px] text-orange-600 hover:text-orange-700 underline decoration-dashed">
          + {additionalCount} more item{additionalCount !== 1 ? 's' : ''}...
        </span>
      </OrderItemsHover>
    </div>
  );
}

/**
 * QuantityHover - Pre-styled hover for quantity display
 * Use in Qty column: Hovering shows item breakdown
 */
interface QuantityHoverProps {
  items: OrderItemPreview[];
  totalQuantity?: number;
}

export function QuantityHover({ items, totalQuantity }: QuantityHoverProps) {
  const qty = totalQuantity ?? items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  
  if (!items || items.length === 0) {
    return <span className="text-[11px] text-gray-700">{qty}</span>;
  }

  return (
    <OrderItemsHover items={items} align="end">
      <span className="text-[11px] text-gray-700 underline decoration-dashed decoration-gray-400 cursor-help">
        Qty: {qty}
      </span>
    </OrderItemsHover>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default OrderItemsHover;
