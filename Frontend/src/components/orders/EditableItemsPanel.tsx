'use client';

/**
 * EditableItemsPanel v2 - Compact Inline Order Items Manager
 * 
 * Redesigned for speed & density:
 * - CSS Grid layout with proper column ratios (no wasted space)
 * - Inline always-visible product search (no extra click)
 * - Optimistic fire-and-forget adds (instant feel)
 * - Compact rows with minimal padding
 * 
 * Editable statuses: intake, follow_up, hold
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Package, Plus, Minus, Trash2, Loader2,
  X as XIcon, ShoppingBag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';
import { type Order, type OrderItem } from './refactored/types';
import { AsyncProductSelect, type Product, type ProductVariant } from '@/components/common/AsyncProductSelect';

// =============================================================================
// CONSTANTS
// =============================================================================

const EDITABLE_STATUSES = ['intake', 'follow_up', 'hold'];

// =============================================================================
// TYPES
// =============================================================================

interface EditableItemsPanelProps {
  order: Order;
  colSpan: number;
  onRefresh: () => void;
}

// =============================================================================
// SINGLE ITEM ROW (Compact grid-based)
// =============================================================================

const ItemRow: React.FC<{
  item: OrderItem;
  orderId: string;
  isEditable: boolean;
  isLastItem: boolean;
  onQuantityChange: (itemId: string, newQty: number) => Promise<void>;
  onRemove: (itemId: string) => Promise<void>;
}> = React.memo(({ item, orderId, isEditable, isLastItem, onQuantityChange, onRemove }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [localQty, setLocalQty] = useState(item.quantity);

  useEffect(() => { setLocalQty(item.quantity); }, [item.quantity]);

  const changeQty = async (delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newQty = localQty + delta;
    if (newQty < 1) return;
    setLocalQty(newQty);
    setIsUpdating(true);
    try {
      await onQuantityChange(item.id, newQty);
    } catch {
      setLocalQty(item.quantity);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRemoving(true);
    try { await onRemove(item.id); } catch { setIsRemoving(false); }
  };

  const lineTotal = (localQty || 0) * (item.unit_price || 0);

  return (
    <div className={cn(
      "grid items-center gap-x-2 px-2.5 py-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-all duration-150",
      isEditable
        ? "grid-cols-[28px_1fr_80px_56px_72px_64px_24px]"
        : "grid-cols-[28px_1fr_80px_40px_64px]",
      isRemoving && "opacity-30 scale-[0.98] pointer-events-none"
    )}>
      {/* Thumb */}
      <div className="w-7 h-7 rounded bg-gray-100 border border-gray-200/80 flex items-center justify-center overflow-hidden">
        {item.variant?.product?.image_url ? (
          <img src={item.variant.product.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Package className="w-3 h-3 text-gray-300" />
        )}
      </div>

      {/* Product + variant + SKU inline */}
      <div className="min-w-0 flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-gray-900 truncate">
          {item.product_name}
        </span>
        {(item.variant_name || item.variant?.color || item.variant?.size) && (
          <span className="text-[9px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded truncate flex-shrink-0">
            {item.variant_name || [item.variant?.color, item.variant?.size].filter(Boolean).join('/')}
          </span>
        )}
      </div>

      {/* SKU */}
      <span className="font-mono text-[10px] text-gray-400 truncate text-right">
        {item.sku || item.variant?.sku || '-'}
      </span>

      {/* Qty */}
      {isEditable ? (
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center bg-white border border-gray-200 rounded-md shadow-sm">
            <button
              onClick={(e) => changeQty(-1, e)}
              disabled={localQty <= 1 || isUpdating}
              className={cn(
                "w-5 h-5 flex items-center justify-center rounded-l-md transition-colors",
                localQty <= 1 ? "text-gray-200" : "text-gray-500 hover:bg-red-50 hover:text-red-500 active:scale-90"
              )}
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <span className="w-6 text-center text-[11px] font-bold tabular-nums border-x border-gray-100">
              {isUpdating ? <Loader2 className="w-2.5 h-2.5 animate-spin mx-auto text-orange-500" /> : localQty}
            </span>
            <button
              onClick={(e) => changeQty(1, e)}
              disabled={isUpdating}
              className="w-5 h-5 flex items-center justify-center rounded-r-md text-gray-500 hover:bg-green-50 hover:text-green-600 active:scale-90 transition-colors"
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      ) : (
        <span className="text-[11px] font-semibold text-gray-700 text-center tabular-nums">
          x{item.quantity}
        </span>
      )}

      {/* Price (only in edit mode - saves space in read mode) */}
      {isEditable && (
        <span className="text-[10px] text-gray-500 text-right tabular-nums">
          @{(item.unit_price || 0).toLocaleString()}
        </span>
      )}

      {/* Total */}
      <span className="text-[11px] font-semibold text-gray-900 text-right tabular-nums">
        {lineTotal.toLocaleString()}
      </span>

      {/* Remove */}
      {isEditable && (
        <div className="flex justify-center">
          {isLastItem ? <span className="w-4" /> : (
            <button
              onClick={handleRemove}
              disabled={isRemoving}
              className="w-4 h-4 flex items-center justify-center text-gray-300 hover:text-red-500 active:scale-90 transition-colors"
              title="Remove"
            >
              {isRemoving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <XIcon className="w-3 h-3" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

ItemRow.displayName = 'ItemRow';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const EditableItemsPanel: React.FC<EditableItemsPanelProps> = ({ order, colSpan, onRefresh }) => {
  const [items, setItems] = useState<OrderItem[]>(order.items || []);
  const [isAdding, setIsAdding] = useState(false);
  const [addedName, setAddedName] = useState<string | null>(null);
  const isEditable = EDITABLE_STATUSES.includes(order.status?.toLowerCase() || '');
  const addTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setItems(order.items || []); }, [order.items]);

  // Clear "added" indicator after 1.5s
  useEffect(() => {
    if (addedName) {
      addTimeoutRef.current = setTimeout(() => setAddedName(null), 1500);
      return () => { if (addTimeoutRef.current) clearTimeout(addTimeoutRef.current); };
    }
  }, [addedName]);

  const handleQuantityChange = useCallback(async (itemId: string, newQty: number) => {
    try {
      await apiClient.patch(`/orders/${order.id}/items/${itemId}`, { quantity: newQty });
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update');
      throw err;
    }
  }, [order.id, onRefresh]);

  const handleRemoveItem = useCallback(async (itemId: string) => {
    try {
      await apiClient.delete(`/orders/${order.id}/items/${itemId}`);
      setItems(prev => prev.filter(i => i.id !== itemId));
      toast.success('Removed');
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to remove');
      throw err;
    }
  }, [order.id, onRefresh]);

  // Fire-and-forget optimistic add
  const handleProductSelect = useCallback(async (product: Product, variant: ProductVariant) => {
    setIsAdding(true);
    setAddedName(product.name);

    // Optimistic: add to local items immediately
    const optimisticItem: OrderItem = {
      id: `temp-${Date.now()}`,
      product_name: product.name,
      variant_name: variant.variant_name || '',
      sku: variant.sku,
      quantity: 1,
      unit_price: variant.selling_price,
      total_price: variant.selling_price,
      variant: {
        id: variant.id,
        sku: variant.sku,
        color: (variant as any).color,
        size: (variant as any).size,
        product: { image_url: product.image_url },
      },
    };
    setItems(prev => [...prev, optimisticItem]);

    try {
      await apiClient.post(`/orders/${order.id}/items`, {
        variant_id: variant.id,
        quantity: 1,
        unit_price: variant.selling_price,
      });
      onRefresh(); // Sync real data
    } catch (err: any) {
      // Revert optimistic add
      setItems(prev => prev.filter(i => i.id !== optimisticItem.id));
      toast.error(err?.response?.data?.message || 'Failed to add');
    } finally {
      setIsAdding(false);
    }
  }, [order.id, onRefresh]);

  if (!items || items.length === 0) return null;

  const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const totalAmount = items.reduce((sum, i) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0);

  return (
    <tr className="bg-gray-50/60">
      <td colSpan={colSpan} className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="animate-in slide-in-from-top-1 duration-150">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm max-w-3xl mx-auto">

            {/* Header row */}
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50/80 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <ShoppingBag className="w-3 h-3 text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {items.length} Item{items.length > 1 ? 's' : ''}
                </span>
                {isEditable && (
                  <span className="text-[8px] font-bold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full uppercase tracking-widest ml-1">
                    Edit
                  </span>
                )}
              </div>
              {/* Inline total in header for quick glance */}
              <span className="text-[11px] font-bold text-gray-700 tabular-nums">
                रु.{totalAmount.toLocaleString()}
              </span>
            </div>

            {/* Column labels (subtle, only in edit mode) */}
            {isEditable && (
              <div className="grid grid-cols-[28px_1fr_80px_56px_72px_64px_24px] gap-x-2 px-2.5 py-1 border-b border-gray-50 text-[8px] font-semibold text-gray-300 uppercase tracking-widest">
                <span />
                <span>Product</span>
                <span className="text-right">SKU</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Total</span>
                <span />
              </div>
            )}

            {/* Items list */}
            <div>
              {items.map((item, idx) => (
                <ItemRow
                  key={item.id || idx}
                  item={item}
                  orderId={order.id}
                  isEditable={isEditable}
                  isLastItem={items.length <= 1}
                  onQuantityChange={handleQuantityChange}
                  onRemove={handleRemoveItem}
                />
              ))}
            </div>

            {/* Inline Add Product - always visible when editable */}
            {isEditable && (
              <div className="border-t border-gray-100 px-2.5 py-1.5 bg-gray-50/40" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <Plus className="w-3 h-3 text-orange-400 flex-shrink-0" />
                  <div className="flex-1 relative">
                    <AsyncProductSelect
                      onSelect={handleProductSelect}
                      placeholder="Add product... (search name or SKU)"
                      direction="down"
                      usePortal
                      allowOutOfStock={false}
                      className="!text-[11px] [&_input]:!h-7 [&_input]:!py-0 [&_input]:!text-[11px] [&_input]:!border-gray-200 [&_input]:!bg-white [&_input]:!rounded [&_input]:!shadow-none"
                    />
                  </div>
                  {/* Quick feedback: shows what was just added */}
                  {addedName && (
                    <span className="text-[9px] text-green-600 font-medium animate-in fade-in-0 whitespace-nowrap flex-shrink-0">
                      + {addedName}
                    </span>
                  )}
                  {isAdding && (
                    <Loader2 className="w-3 h-3 animate-spin text-orange-500 flex-shrink-0" />
                  )}
                </div>
              </div>
            )}

            {/* Footer total */}
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-orange-50/80 border-t border-orange-100/80">
              <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">
                Total ({totalQty} pcs)
              </span>
              <span className="text-xs font-bold text-orange-700 tabular-nums">
                रु.{totalAmount.toLocaleString()}
              </span>
            </div>

          </div>
        </div>
      </td>
    </tr>
  );
};

export default EditableItemsPanel;
