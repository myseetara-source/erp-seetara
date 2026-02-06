/**
 * ProductEntry Component
 * 
 * Dynamic list of products with add/remove functionality.
 * Integrates with AsyncProductSelect for product search.
 * 
 * @author Code Quality Team
 * @priority P0 - Form Refactoring
 */

'use client';

import { memo, useCallback } from 'react';
import { Plus, Minus, X, Package, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { 
  AsyncProductSelect, 
  type Product as AsyncProduct, 
  type ProductVariant as AsyncProductVariant 
} from '@/components/common/AsyncProductSelect';
import { formatCurrency } from '@/config/app.config';

// =============================================================================
// TYPES
// =============================================================================

export interface ProductItem {
  variant_id: string;
  product_id?: string;
  product_name: string;
  variant_name?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  image_url?: string;
  current_stock?: number;
  shipping_inside?: number;
  shipping_outside?: number;
}

export interface ProductSelectOption {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  price: number;
  current_stock?: number;
  image_url?: string;
  shipping_inside?: number;
  shipping_outside?: number;
}

export interface ProductEntryProps {
  /** Current items in the order */
  items: ProductItem[];
  /** Add new item handler */
  onAddItem: (item: ProductItem) => void;
  /** Remove item handler */
  onRemoveItem: (index: number) => void;
  /** Update item quantity handler */
  onUpdateQuantity: (index: number, quantity: number) => void;
  /** Update item price handler (optional) */
  onUpdatePrice?: (index: number, price: number) => void;
  /** Validation error */
  error?: string;
  /** Whether to allow price editing */
  allowPriceEdit?: boolean;
  /** Max items allowed */
  maxItems?: number;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// SINGLE ITEM ROW
// =============================================================================

interface ItemRowProps {
  item: ProductItem;
  index: number;
  onRemove: () => void;
  onQuantityChange: (quantity: number) => void;
  onPriceChange?: (price: number) => void;
  allowPriceEdit?: boolean;
}

const ItemRow = memo(function ItemRow({
  item,
  index,
  onRemove,
  onQuantityChange,
  onPriceChange,
  allowPriceEdit = false,
}: ItemRowProps) {
  const lineTotal = item.quantity * item.unit_price;
  
  const handleIncrement = useCallback(() => {
    if (item.current_stock === undefined || item.quantity < item.current_stock) {
      onQuantityChange(item.quantity + 1);
    }
  }, [item.quantity, item.current_stock, onQuantityChange]);
  
  const handleDecrement = useCallback(() => {
    if (item.quantity > 1) {
      onQuantityChange(item.quantity - 1);
    }
  }, [item.quantity, onQuantityChange]);
  
  const handleQuantityInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1) {
      if (item.current_stock === undefined || value <= item.current_stock) {
        onQuantityChange(value);
      }
    }
  }, [item.current_stock, onQuantityChange]);
  
  const handlePriceInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0 && onPriceChange) {
      onPriceChange(value);
    }
  }, [onPriceChange]);
  
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 truncate">
          {item.product_name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.variant_name && (
            <span className="text-xs text-gray-500">{item.variant_name}</span>
          )}
          {item.sku && (
            <span className="text-xs text-gray-400 font-mono">{item.sku}</span>
          )}
        </div>
        {item.current_stock !== undefined && item.current_stock <= 5 && (
          <p className="text-xs text-orange-600 mt-0.5">
            Only {item.current_stock} in stock
          </p>
        )}
      </div>
      
      {/* Price (editable or display) */}
      <div className="w-24 text-right">
        {allowPriceEdit && onPriceChange ? (
          <Input
            type="number"
            value={item.unit_price}
            onChange={handlePriceInput}
            min={0}
            step={10}
            className="h-8 text-sm text-right"
          />
        ) : (
          <span className="text-sm font-medium text-gray-700">
            {formatCurrency(item.unit_price)}
          </span>
        )}
      </div>
      
      {/* Quantity Controls */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleDecrement}
          disabled={item.quantity <= 1}
          className="h-8 w-8"
        >
          <Minus className="w-3 h-3" />
        </Button>
        <Input
          type="number"
          value={item.quantity}
          onChange={handleQuantityInput}
          min={1}
          max={item.current_stock}
          className="h-8 w-14 text-center text-sm font-medium"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleIncrement}
          disabled={item.current_stock !== undefined && item.quantity >= item.current_stock}
          className="h-8 w-8"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      
      {/* Line Total */}
      <div className="w-24 text-right">
        <span className="text-sm font-semibold text-gray-900">
          {formatCurrency(lineTotal)}
        </span>
      </div>
      
      {/* Remove Button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-8 w-8 text-gray-400 hover:text-red-500"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ProductEntry = memo(function ProductEntry({
  items,
  onAddItem,
  onRemoveItem,
  onUpdateQuantity,
  onUpdatePrice,
  error,
  allowPriceEdit = false,
  maxItems = 20,
  className,
}: ProductEntryProps) {
  // Handle product selection from search
  const handleProductSelect = useCallback((product: AsyncProduct, variant: AsyncProductVariant) => {
    // Check if product already exists
    const existingIndex = items.findIndex(
      item => item.variant_id === variant.id
    );
    
    if (existingIndex >= 0) {
      // Increment quantity
      onUpdateQuantity(existingIndex, items[existingIndex].quantity + 1);
    } else if (items.length < maxItems) {
      // Add new item
      onAddItem({
        variant_id: variant.id,
        product_id: product.id,
        product_name: product.name,
        variant_name: variant.variant_name,
        sku: variant.sku,
        quantity: 1,
        unit_price: variant.selling_price,
        image_url: product.image_url,
        current_stock: variant.current_stock,
        shipping_inside: 0, // Default, will be updated based on order
        shipping_outside: 0, // Default, will be updated based on order
      });
    }
  }, [items, maxItems, onAddItem, onUpdateQuantity]);
  
  // Calculate subtotal
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
  
  return (
    <div className={cn('space-y-3', className)}>
      {/* Product Search */}
      <div>
        <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
          <Package className="w-3 h-3" />
          Add Products <span className="text-red-500">*</span>
        </label>
        <AsyncProductSelect
          onSelect={handleProductSelect}
          placeholder="Search products by name or SKU..."
          disabled={items.length >= maxItems}
        />
        {items.length >= maxItems && (
          <p className="text-xs text-orange-500 mt-1">
            Maximum {maxItems} items allowed per order
          </p>
        )}
      </div>
      
      {/* Items List */}
      {items.length > 0 && (
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center text-xs font-medium text-gray-500 px-3">
            <div className="flex-1">Product</div>
            <div className="w-24 text-right">Price</div>
            <div className="w-32 text-center">Qty</div>
            <div className="w-24 text-right">Total</div>
            <div className="w-8"></div>
          </div>
          
          {/* Items */}
          {items.map((item, index) => (
            <ItemRow
              key={`${item.variant_id}-${index}`}
              item={item}
              index={index}
              onRemove={() => onRemoveItem(index)}
              onQuantityChange={(qty) => onUpdateQuantity(index, qty)}
              onPriceChange={onUpdatePrice ? (price) => onUpdatePrice(index, price) : undefined}
              allowPriceEdit={allowPriceEdit}
            />
          ))}
          
          {/* Subtotal */}
          <div className="flex items-center justify-end pt-2 border-t border-gray-200">
            <span className="text-sm text-gray-600 mr-4">Subtotal:</span>
            <span className="text-lg font-bold text-gray-900">
              {formatCurrency(subtotal)}
            </span>
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {items.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Search and add products above</p>
        </div>
      )}
      
      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
});

export default ProductEntry;
