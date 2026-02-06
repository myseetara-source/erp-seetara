'use client';

/**
 * Exchange/Refund Modal for Store POS
 * 
 * P0 REDESIGN: Wide, Compact, High-Density Layout
 * 
 * Features:
 * - Wide modal (90vw, max-w-6xl) for spacious workspace
 * - Compact item rows (max 60px) for bulk operations
 * - Fixed search at top with auto-clear for rapid entry
 * - Independent scrollable zones for each column
 * - Real-time financial calculation
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { 
  Loader2, 
  ArrowLeftRight, 
  Minus, 
  Plus, 
  X,
  RefreshCcw,
  ShoppingBag,
  Undo2,
  Check,
  AlertCircle,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ProductVariantSelect, type VariantOption } from '@/components/form/ProductVariantSelect';
import { 
  getPOSOrderForReconcile, 
  reconcilePOS,
  type POSOrderForReconcile,
  type POSOrderItem,
} from '@/lib/api/orders';

// =============================================================================
// TYPES
// =============================================================================

interface ReturnItem extends POSOrderItem {
  selected: boolean;
  returnQty: number;
  maxQty: number;
}

interface NewItem {
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
}

interface ExchangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onSuccess?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ExchangeModal({
  open,
  onOpenChange,
  orderId,
  onSuccess,
}: ExchangeModalProps) {
  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<POSOrderForReconcile | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');  // Compulsory reason field
  const [reasonError, setReasonError] = useState(false);
  
  // Ref for resetting search after adding item
  const [searchKey, setSearchKey] = useState(0);

  // Load order data when modal opens
  useEffect(() => {
    if (open && orderId) {
      loadOrder();
      // Reset reason on modal open
      setReason('');
      setReasonError(false);
    }
  }, [open, orderId]);

  const loadOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPOSOrderForReconcile(orderId);
      setOrder(data);
      
      // Initialize return items from order items
      setReturnItems(
        data.items.map(item => ({
          ...item,
          selected: false,
          returnQty: 0,
          maxQty: item.quantity,
        }))
      );
      setNewItems([]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load order');
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // RETURN ITEMS HANDLERS
  // ==========================================================================

  const handleReturnToggle = (variantId: string, checked: boolean) => {
    setReturnItems(items =>
      items.map(item =>
        item.variant_id === variantId
          ? { ...item, selected: checked, returnQty: checked ? item.maxQty : 0 }
          : item
      )
    );
  };

  const handleReturnQtyChange = (variantId: string, qty: number) => {
    setReturnItems(items =>
      items.map(item =>
        item.variant_id === variantId
          ? { 
              ...item, 
              returnQty: Math.min(Math.max(0, qty), item.maxQty),
              selected: qty > 0,
            }
          : item
      )
    );
  };

  // ==========================================================================
  // NEW ITEMS HANDLERS
  // ==========================================================================

  /**
   * Handle adding a new item from ProductVariantSelect
   * The component returns a flat VariantOption with all necessary data
   * P0 FIX: Auto-clear search after adding for rapid entry
   */
  const handleAddNewItem = (variant: VariantOption) => {
    const existingIndex = newItems.findIndex(
      item => item.variant_id === variant.variant_id
    );

    if (existingIndex >= 0) {
      // Increment quantity if item already in cart
      setNewItems(items =>
        items.map((item, i) =>
          i === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
      toast.success(`+1 ${variant.variant_name}`, { duration: 1500 });
    } else {
      // Add new item to cart
      setNewItems(items => [
        ...items,
        {
          variant_id: variant.variant_id,
          product_name: variant.product_name,
          variant_name: variant.variant_name,
          sku: variant.sku || 'N/A',
          quantity: 1,
          unit_price: variant.price || 0,
        },
      ]);
      toast.success(`Added ${variant.product_name}`, { duration: 1500 });
    }
    
    // Auto-clear search for continuous entry
    setSearchKey(k => k + 1);
  };

  const handleNewItemQtyChange = (variantId: string, qty: number) => {
    if (qty <= 0) {
      setNewItems(items => items.filter(item => item.variant_id !== variantId));
    } else {
      setNewItems(items =>
        items.map(item =>
          item.variant_id === variantId
            ? { ...item, quantity: qty }
            : item
        )
      );
    }
  };

  const handleRemoveNewItem = (variantId: string) => {
    setNewItems(items => items.filter(item => item.variant_id !== variantId));
  };

  // ==========================================================================
  // CALCULATIONS
  // ==========================================================================

  const calculations = useMemo(() => {
    const returnTotal = returnItems
      .filter(item => item.selected && item.returnQty > 0)
      .reduce((sum, item) => sum + item.returnQty * item.unit_price, 0);

    const newTotal = newItems.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    );

    const netAmount = newTotal - returnTotal;

    return {
      returnTotal,
      newTotal,
      netAmount,
      customerOwes: netAmount > 0 ? netAmount : 0,
      refundDue: netAmount < 0 ? Math.abs(netAmount) : 0,
      isExchange: returnTotal > 0 && newTotal > 0,
      isRefundOnly: returnTotal > 0 && newTotal === 0,
      isAddOn: returnTotal === 0 && newTotal > 0,
    };
  }, [returnItems, newItems]);

  const hasChanges = 
    returnItems.some(item => item.selected && item.returnQty > 0) ||
    newItems.length > 0;

  // ==========================================================================
  // SUBMIT
  // ==========================================================================

  const handleSubmit = async () => {
    if (!hasChanges) {
      toast.error('Please select items to return or add new items');
      return;
    }

    // Validate reason (compulsory)
    if (!reason.trim()) {
      setReasonError(true);
      toast.error('Please provide a reason for this exchange/refund');
      return;
    }
    setReasonError(false);

    setSubmitting(true);
    try {
      const result = await reconcilePOS({
        original_order_id: orderId,
        reason: reason.trim(),  // Include reason in API call
        return_items: returnItems
          .filter(item => item.selected && item.returnQty > 0)
          .map(item => ({
            variant_id: item.variant_id,
            quantity: item.returnQty,
            unit_price: item.unit_price,
          })),
        new_items: newItems.map(item => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          product_name: item.product_name,
          variant_name: item.variant_name,
          sku: item.sku,
        })),
      });

      const actionType = calculations.isExchange
        ? 'Exchange'
        : calculations.isRefundOnly
        ? 'Refund'
        : 'Add-on';

      toast.success(`${actionType} Successful!`, {
        description: `New order created: ${result.reconciliation_order.readable_id || result.reconciliation_order.order_number}`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      toast.error('Transaction Failed', {
        description: err.response?.data?.message || 'Failed to process transaction',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const formatCurrency = (amount: number) => {
    return `रु. ${amount.toLocaleString()}`;
  };

  // Compact item row component for returns
  const ReturnItemRow = ({ item }: { item: ReturnItem }) => (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-2 border-b last:border-b-0 transition-colors',
        item.selected
          ? 'bg-red-50/70'
          : 'bg-white hover:bg-gray-50'
      )}
    >
      {/* Left: Checkbox + Item Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Checkbox
          checked={item.selected}
          onCheckedChange={(checked) =>
            handleReturnToggle(item.variant_id, checked as boolean)
          }
          className="flex-shrink-0 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-gray-900 truncate leading-tight">
            {item.product_name}
          </p>
          <p className="text-xs text-gray-500 truncate leading-tight">
            {item.variant_name} • <span className="font-mono">{item.sku}</span>
          </p>
        </div>
      </div>

      {/* Right: Qty Stepper + Price */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {item.selected ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleReturnQtyChange(item.variant_id, item.returnQty - 1)}
              className="w-6 h-6 flex items-center justify-center rounded bg-red-100 hover:bg-red-200 text-red-700 text-xs"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center font-semibold text-sm">{item.returnQty}</span>
            <button
              type="button"
              onClick={() => handleReturnQtyChange(item.variant_id, item.returnQty + 1)}
              disabled={item.returnQty >= item.maxQty}
              className="w-6 h-6 flex items-center justify-center rounded bg-red-100 hover:bg-red-200 text-red-700 text-xs disabled:opacity-40"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-400 w-20 text-center">×{item.maxQty} avail</span>
        )}
        <div className="w-24 text-right">
          <span className={cn(
            'font-semibold text-sm',
            item.selected && item.returnQty > 0 ? 'text-red-600' : 'text-gray-500'
          )}>
            {item.selected && item.returnQty > 0
              ? `-${formatCurrency(item.returnQty * item.unit_price)}`
              : formatCurrency(item.unit_price)}
          </span>
        </div>
      </div>
    </div>
  );

  // Compact item row component for new items
  const NewItemRow = ({ item }: { item: NewItem }) => (
    <div className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 bg-green-50/50 hover:bg-green-50">
      {/* Left: Item Info */}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-gray-900 truncate leading-tight">
          {item.product_name}
        </p>
        <p className="text-xs text-gray-500 truncate leading-tight">
          {item.variant_name} • <span className="font-mono">{item.sku}</span>
        </p>
      </div>

      {/* Right: Qty Stepper + Price + Remove */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleNewItemQtyChange(item.variant_id, item.quantity - 1)}
            className="w-6 h-6 flex items-center justify-center rounded bg-green-100 hover:bg-green-200 text-green-700 text-xs"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-8 text-center font-semibold text-sm">{item.quantity}</span>
          <button
            type="button"
            onClick={() => handleNewItemQtyChange(item.variant_id, item.quantity + 1)}
            className="w-6 h-6 flex items-center justify-center rounded bg-green-100 hover:bg-green-200 text-green-700 text-xs"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="w-24 text-right">
          <span className="font-semibold text-sm text-green-600">
            +{formatCurrency(item.quantity * item.unit_price)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleRemoveNewItem(item.variant_id)}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* P0 FIX: Wide modal (90vw, max-w-6xl, 85vh) with flex layout */}
      <DialogContent className="max-w-6xl w-[90vw] h-[85vh] p-0 flex flex-col overflow-hidden">
        {/* Fixed Header */}
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b bg-white">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ArrowLeftRight className="w-5 h-5 text-orange-500" />
            Exchange / Refund
            {order && (
              <Badge variant="outline" className="ml-2 font-mono">
                #{order.readable_id || order.order_number}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {order && (
              <span className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-700">{order.shipping_name}</span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-600">{order.shipping_phone}</span>
                <span className="text-gray-400">•</span>
                <span className="font-semibold text-gray-800">{formatCurrency(order.total_amount)}</span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
            <p className="text-red-600 font-medium">{error}</p>
            <Button variant="outline" onClick={loadOrder}>
              <RefreshCcw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* Main Content: 2-Column Grid with Independent Scroll */}
            <div className="flex-1 grid grid-cols-2 min-h-0 overflow-hidden">
              {/* ============================================================ */}
              {/* LEFT COLUMN: Return Items */}
              {/* ============================================================ */}
              <div className="flex flex-col border-r overflow-hidden">
                {/* Column Header */}
                <div className="flex-shrink-0 px-4 py-3 bg-red-50 border-b border-red-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Undo2 className="w-4 h-4 text-red-600" />
                      <span className="font-semibold text-red-700">Return Items</span>
                      <Badge variant="secondary" className="text-xs bg-red-100 text-red-700">
                        {returnItems.filter(i => i.selected).length} selected
                      </Badge>
                    </div>
                    <span className="font-bold text-red-700">
                      -{formatCurrency(calculations.returnTotal)}
                    </span>
                  </div>
                </div>
                
                {/* Scrollable Item List */}
                <div className="flex-1 overflow-y-auto">
                  {returnItems.map(item => (
                    <ReturnItemRow key={item.variant_id} item={item} />
                  ))}
                </div>
              </div>

              {/* ============================================================ */}
              {/* RIGHT COLUMN: New Items */}
              {/* ============================================================ */}
              <div className="flex flex-col overflow-hidden">
                {/* Column Header */}
                <div className="flex-shrink-0 px-4 py-3 bg-green-50 border-b border-green-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-green-600" />
                      <span className="font-semibold text-green-700">New Items</span>
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                        {newItems.length} items
                      </Badge>
                    </div>
                    <span className="font-bold text-green-700">
                      +{formatCurrency(calculations.newTotal)}
                    </span>
                  </div>
                </div>

                {/* Fixed Search Bar - P0: Always visible at top */}
                <div className="flex-shrink-0 p-3 border-b bg-white">
                  <ProductVariantSelect
                    key={searchKey}
                    placeholder="Search & add product (auto-clears)..."
                    onChange={handleAddNewItem}
                    mode="INVENTORY"
                    allowOutOfStock={false}
                  />
                </div>

                {/* Scrollable Item List */}
                <div className="flex-1 overflow-y-auto">
                  {newItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
                      <Search className="w-10 h-10 mb-2 opacity-50" />
                      <p className="text-sm font-medium">No items added yet</p>
                      <p className="text-xs">Search above for rapid entry</p>
                    </div>
                  ) : (
                    newItems.map(item => (
                      <NewItemRow key={item.variant_id} item={item} />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Fixed Footer: Reason + Financial Summary + Actions */}
            <div className="flex-shrink-0 border-t bg-gray-50 px-6 py-4">
              {/* Reason Field (Compulsory) */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Reason for Exchange/Refund <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g., Size exchange, Defective product, Customer request..."
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (e.target.value.trim()) setReasonError(false);
                  }}
                  className={cn(
                    'w-full',
                    reasonError && 'border-red-500 focus:ring-red-500'
                  )}
                />
                {reasonError && (
                  <p className="text-xs text-red-500 mt-1">Reason is required</p>
                )}
              </div>

              {/* Financial Summary Row */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 uppercase tracking-wide">Return</span>
                    <span className="text-lg font-bold text-red-700">
                      -{formatCurrency(calculations.returnTotal)}
                    </span>
                  </div>
                  <div className="text-gray-300 text-2xl">+</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 uppercase tracking-wide">New</span>
                    <span className="text-lg font-bold text-green-700">
                      +{formatCurrency(calculations.newTotal)}
                    </span>
                  </div>
                  <div className="text-gray-300 text-2xl">=</div>
                  <div
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg',
                      calculations.netAmount >= 0 ? 'bg-emerald-100' : 'bg-orange-100'
                    )}
                  >
                    <span
                      className={cn(
                        'text-xs uppercase tracking-wide',
                        calculations.netAmount >= 0 ? 'text-emerald-600' : 'text-orange-600'
                      )}
                    >
                      {calculations.netAmount >= 0 ? 'Bill Amount' : 'Refund Amount'}
                    </span>
                    <span
                      className={cn(
                        'text-xl font-bold',
                        calculations.netAmount >= 0 ? 'text-emerald-700' : 'text-orange-700'
                      )}
                    >
                      {calculations.netAmount < 0 ? '-' : ''}रु.{Math.abs(calculations.netAmount).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!hasChanges || submitting}
                    size="lg"
                    className={cn(
                      'min-w-[180px]',
                      calculations.isRefundOnly
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'bg-emerald-500 hover:bg-emerald-600'
                    )}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        {calculations.isRefundOnly
                          ? 'Process Refund'
                          : calculations.isExchange
                          ? 'Process Exchange'
                          : 'Process Add-on'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ExchangeModal;
