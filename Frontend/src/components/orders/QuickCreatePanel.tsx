'use client';

/**
 * Quick Create Panel - Expandable Inline Order Form
 * 
 * Matches the reference design: An expandable panel at the top of orders page
 * for rapid order entry without leaving the page.
 * 
 * Features:
 * - Collapsible panel
 * - Minimal fields for speed
 * - Product search with autocomplete
 * - Auto-calculation of totals
 * - Keyboard shortcuts (Cmd+N to open, Cmd+Enter to submit)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  Zap,
  User,
  Phone,
  MapPin,
  Plus,
  Minus,
  X,
  Truck,
  Building2,
  Store,
  Clock,
  Check,
  Command,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useQuickOrderForm, ProductOption } from '@/hooks/useOrderForm';
import { AsyncProductSelect } from '@/components/common/AsyncProductSelect';

// =============================================================================
// TYPES
// =============================================================================

interface QuickCreatePanelProps {
  onSuccess?: () => void;
  defaultExpanded?: boolean;
}

type FulfillmentType = 'inside_valley' | 'outside_valley' | 'store';
type OrderStatus = 'intake' | 'converted';


// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function QuickCreatePanel({ onSuccess, defaultExpanded = false }: QuickCreatePanelProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const formRef = useRef<HTMLDivElement>(null);

  const {
    form,
    items,
    appendItem,
    removeItem,
    updateItemQuantity,
    subtotal,
    total,
    codAmount,
    submitOrder,
    isSubmitting,
    isSuccess,
    resetForm,
  } = useQuickOrderForm({
    onSuccess: (order) => {
      resetForm();
      setIsExpanded(false);
      onSuccess?.();
    },
  });

  const { register, watch, setValue, formState: { errors } } = form;
  const watchedItems = watch('items') || [];
  const fulfillmentType = watch('fulfillment_type');
  const status = watch('status');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + N to toggle panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setIsExpanded(prev => !prev);
      }
      // Cmd/Ctrl + Enter to submit (when expanded)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isExpanded) {
        e.preventDefault();
        submitOrder();
      }
      // Escape to close
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, submitOrder]);

  // Handle product selection
  const handleProductSelect = (product: ProductOption) => {
    // Check if already in list
    const existingIndex = watchedItems.findIndex(
      (item: any) => item.variant_id === product.variant_id
    );

    if (existingIndex >= 0) {
      // Increment quantity
      updateItemQuantity(existingIndex, (watchedItems[existingIndex]?.quantity || 1) + 1);
    } else {
      // Add new item
      appendItem({
        variant_id: product.variant_id,
        product_name: product.product_name,
        variant_name: product.variant_name,
        sku: product.sku,
        quantity: 1,
        unit_price: product.price,
      });
    }
  };

  const fulfillmentOptions = [
    { value: 'inside_valley', label: 'Inside', icon: Truck },
    { value: 'outside_valley', label: 'Outside', icon: Building2 },
    { value: 'store', label: 'Store', icon: Store },
  ];

  const statusOptions = [
    { value: 'intake', label: 'Intake', icon: Clock },
    { value: 'converted', label: 'Converted', icon: Check },
  ];

  return (
    <div className="mb-4">
      {/* Collapsed State - Quick Create Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl p-4',
          'flex items-center justify-center gap-2 hover:from-orange-600 hover:to-orange-700',
          'transition-all shadow-lg shadow-orange-500/20',
          isExpanded && 'rounded-b-none'
        )}
      >
        <Zap className="w-5 h-5" />
        <span className="font-semibold">Quick Create Order</span>
        <Badge variant="outline" className="ml-2 bg-white/20 text-white border-white/30">
          <Command className="w-3 h-3 mr-1" />N
        </Badge>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 ml-auto" />
        ) : (
          <ChevronDown className="w-5 h-5 ml-auto" />
        )}
      </button>

      {/* Expanded Form */}
      {isExpanded && (
        <div
          ref={formRef}
          className="bg-white border border-t-0 border-gray-200 rounded-b-xl p-6 shadow-lg animate-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-start gap-2 mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Quick Create</h3>
              <p className="text-sm text-gray-500">Add new order instantly</p>
            </div>
          </div>

          {/* Row 1: Customer Info */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Customer Name */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                Customer <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  {...register('customer_name')}
                  placeholder="Full name"
                  className={cn(
                    'pl-9 h-10',
                    errors.customer_name && 'border-red-500 focus:ring-red-500'
                  )}
                />
              </div>
              {errors.customer_name && (
                <p className="text-xs text-red-500 mt-1">{errors.customer_name.message}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  {...register('customer_phone')}
                  placeholder="98XXXXXXXX"
                  className={cn(
                    'pl-9 h-10',
                    errors.customer_phone && 'border-red-500 focus:ring-red-500'
                  )}
                />
              </div>
              {errors.customer_phone && (
                <p className="text-xs text-red-500 mt-1">{errors.customer_phone.message}</p>
              )}
            </div>

            {/* Address */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1">
                Address <span className="text-gray-400">(optional)</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  {...register('customer_address')}
                  placeholder="Area, City"
                  className="pl-9 h-10"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Type & Status */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Fulfillment Type */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Type</label>
              <div className="flex gap-2">
                {fulfillmentOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValue('fulfillment_type', option.value as FulfillmentType)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all',
                        fulfillmentType === option.value
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">Status</label>
              <div className="flex gap-2">
                {statusOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValue('status', option.value as OrderStatus)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all',
                        status === option.value
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 3: Products */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-700 mb-2 block">Products</label>
            
            {/* Product Search + Items Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Header Row */}
              <div className="bg-gray-50 px-4 py-2 flex items-center gap-4 text-xs font-medium text-gray-600 border-b">
                <div className="flex-1">Product <span className="text-red-500">*</span></div>
                <div className="w-24 text-center">Qty</div>
                <div className="w-28 text-right">Total Price</div>
                <div className="w-16"></div>
              </div>

              {/* Items */}
              {watchedItems.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {watchedItems.map((item: any, index: number) => (
                    <div key={index} className="px-4 py-2 flex items-center gap-4">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">{item.product_name}</p>
                        <p className="text-xs text-gray-500">{item.variant_name} · {item.sku}</p>
                      </div>
                      <div className="w-24 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(index, Math.max(1, (item.quantity || 1) - 1))}
                          className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(index, (item.quantity || 1) + 1)}
                          className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="w-28 text-right font-medium text-gray-900">
                        {(item.quantity * item.unit_price).toLocaleString()}
                      </div>
                      <div className="w-16 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Product Row - Using AsyncProductSelect */}
              <div className="px-4 py-3 bg-gray-50 flex items-center gap-4">
                <div className="flex-1">
                  <AsyncProductSelect
                    placeholder="Search products by name, SKU..."
                    direction="up"
                    usePortal={true}
                    onSelect={(product, variant) => {
                      // Check if already in list
                      const existingIndex = watchedItems.findIndex(
                        (item: any) => item.variant_id === variant.id
                      );

                      if (existingIndex >= 0) {
                        // Increment quantity
                        updateItemQuantity(existingIndex, (watchedItems[existingIndex]?.quantity || 1) + 1);
                      } else {
                        // Add new item
                        const variantName = variant.attributes 
                          ? Object.values(variant.attributes).join(' / ')
                          : [variant.color, variant.size].filter(Boolean).join(' / ') || variant.sku;

                        appendItem({
                          variant_id: variant.id,
                          product_name: product.name,
                          variant_name: variantName,
                          sku: variant.sku,
                          quantity: 1,
                          unit_price: variant.selling_price,
                        });
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={() => router.push('/dashboard/products/add')}
                >
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>

              {errors.items && (
                <p className="text-xs text-red-500 px-4 py-2 bg-red-50">{errors.items.message}</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            {/* Keyboard hints */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">⌘</kbd>
                <span>+</span>
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Enter</kbd>
                <span>to create</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Esc</kbd>
                <span>to discard</span>
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push('/dashboard/orders/new')}
                className="text-gray-600"
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Full Form
              </Button>
              <Button
                type="button"
                onClick={submitOrder}
                disabled={isSubmitting || watchedItems.length === 0}
                className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-6"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Order
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuickCreatePanel;
