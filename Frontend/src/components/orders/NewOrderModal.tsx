'use client';

/**
 * New Order Modal - Two-Column Dialog
 * 
 * A modal dialog for creating new orders with:
 * - Left column: Customer info + Order settings
 * - Right column: Product selection
 * 
 * Uses unified ProductVariantSelect component for consistency.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  User,
  Phone,
  MapPin,
  Plus,
  Minus,
  Trash2,
  Package,
  Truck,
  Building2,
  Store,
  Clock,
  Check,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useQuickOrderForm, ProductOption } from '@/hooks/useOrderForm';
import { ProductVariantSelect, VariantOption } from '@/components/form/ProductVariantSelect';
import { calculateShipping } from '@/lib/utils/shippingCalculator';
import type { FulfillmentType } from '@/types/order';

// =============================================================================
// TYPES
// =============================================================================

interface NewOrderModalProps {
  trigger?: React.ReactNode;
  onSuccess?: (order: any) => void;
}

type FulfillmentType = 'inside_valley' | 'outside_valley' | 'store';
type OrderStatus = 'intake' | 'converted';

// =============================================================================
// HELPER: Convert VariantOption to ProductOption
// =============================================================================

function variantToProductOption(variant: VariantOption): ProductOption {
  return {
    variant_id: variant.variant_id,
    product_id: variant.product_id,
    product_name: variant.product_name,
    variant_name: variant.variant_name,
    sku: variant.sku,
    price: variant.price,
    stock: variant.stock,
    image_url: variant.image_url,
    attributes: variant.attributes,
    shipping_inside: variant.shipping_inside,
    shipping_outside: variant.shipping_outside,
  };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function NewOrderModal({ trigger, onSuccess }: NewOrderModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const {
    form,
    items,
    appendItem,
    removeItem,
    updateItemQuantity,
    searchProducts,
    isSearching,
    subtotal,
    total,
    codAmount,
    submitOrder,
    isSubmitting,
    isSuccess,
    resetForm,
  } = useQuickOrderForm({
    onSuccess: (order) => {
      onSuccess?.(order);
      setIsOpen(false);
      resetForm();
    },
  });

  const { register, watch, setValue, formState: { errors } } = form;
  const watchedItems = watch('items') || [];
  const fulfillmentType = watch('fulfillment_type');
  const status = watch('status');
  const deliveryCharge = watch('delivery_charge') || 0;
  const discountAmount = watch('discount_amount') || 0;
  const prepaidAmount = watch('prepaid_amount') || 0;

  // Handle product selection
  const handleProductSelect = (product: ProductOption) => {
    const existingIndex = watchedItems.findIndex(
      (item: any) => item.variant_id === product.variant_id
    );

    if (existingIndex >= 0) {
      updateItemQuantity(existingIndex, (watchedItems[existingIndex]?.quantity || 1) + 1);
    } else {
      appendItem({
        variant_id: product.variant_id,
        product_name: product.product_name,
        variant_name: product.variant_name,
        sku: product.sku,
        quantity: 1,
        unit_price: product.price,
        // Include shipping rates for "Highest Shipping" calculation
        shipping_inside: product.shipping_inside ?? 100,
        shipping_outside: product.shipping_outside ?? 150,
      });
    }
  };

  // ==========================================================================
  // HIGHEST SHIPPING RATE LOGIC (Centralized - DRY Principle)
  // ==========================================================================
  // Uses lib/utils/shippingCalculator.ts for consistency across app
  // - Shipping is FLAT RATE per ORDER (not per quantity/item)
  // - When multiple products: Use the HIGHEST shipping cost (Heavy Item Rule)
  // - Store pickup = 0
  // - User can manually override the suggested value
  // ==========================================================================
  
  useEffect(() => {
    // Skip if no items selected
    if (!watchedItems || watchedItems.length === 0) {
      return;
    }

    // Use centralized shipping calculator
    const suggestedShipping = calculateShipping(
      watchedItems as { shipping_inside?: number; shipping_outside?: number }[],
      fulfillmentType as FulfillmentType
    );

    // Auto-update the delivery charge field
    // Note: User can still manually override this value
    setValue('delivery_charge', suggestedShipping);
  }, [watchedItems, fulfillmentType, setValue]);

  // Reset when modal closes
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const fulfillmentOptions = [
    { value: 'inside_valley', label: 'In', icon: Truck },
    { value: 'outside_valley', label: 'Out', icon: Building2 },
    { value: 'store', label: 'Store', icon: Store },
  ];

  const statusOptions = [
    { value: 'intake', label: 'Intake', icon: Clock },
    { value: 'converted', label: 'Converted', icon: Check },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            New Order
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-4">
          <DialogTitle className="flex items-center gap-3 text-lg">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            New Order
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="grid grid-cols-2 divide-x divide-gray-200">
          {/* Left Column - Customer & Settings */}
          <div className="p-6 space-y-5">
            {/* Customer Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-orange-600">
                <User className="w-4 h-4" />
                <span className="font-medium text-sm">Customer</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Name */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    {...register('customer_name')}
                    placeholder="Full name"
                    className={cn(errors.customer_name && 'border-red-500')}
                  />
                  {errors.customer_name && (
                    <p className="text-xs text-red-500 mt-1">{errors.customer_name.message}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <Input
                    {...register('customer_phone')}
                    placeholder="98XXXXXXXX"
                    className={cn(errors.customer_phone && 'border-red-500')}
                  />
                  {errors.customer_phone && (
                    <p className="text-xs text-red-500 mt-1">{errors.customer_phone.message}</p>
                  )}
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  Address <span className="text-red-500">*</span>
                </label>
                <Input
                  {...register('customer_address')}
                  placeholder="Street, Area, City"
                />
              </div>
            </div>

            {/* Order Type */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-700 block">Order Type</label>
              <div className="flex gap-2">
                {fulfillmentOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValue('fulfillment_type', option.value as FulfillmentType)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all',
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
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-700 block">Status</label>
              <div className="flex gap-2">
                {statusOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValue('status', option.value as OrderStatus)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all',
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

            {/* Adjustments */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-700 block">Adjustments</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    Delivery
                    <span 
                      title="Auto-calculated based on highest shipping among selected products. You can override this value."
                      className="text-orange-400 cursor-help"
                    >
                      ✨
                    </span>
                  </label>
                  <Input
                    type="number"
                    {...register('delivery_charge', { valueAsNumber: true })}
                    placeholder="0"
                    className={cn(
                      'text-center',
                      deliveryCharge > 0 && 'border-orange-300 bg-orange-50/50'
                    )}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Discount</label>
                  <Input
                    type="number"
                    {...register('discount_amount', { valueAsNumber: true })}
                    placeholder="0"
                    className="text-center"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">PrePay</label>
                  <Input
                    type="number"
                    {...register('prepaid_amount', { valueAsNumber: true })}
                    placeholder="0"
                    className="text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Products */}
          <div className="p-6 bg-gray-50/50 flex flex-col">
            {/* Products Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-orange-600">
                <Package className="w-4 h-4" />
                <span className="font-medium text-sm">Products</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/dashboard/products/add')}
              >
                <Plus className="w-3 h-3 mr-1" />
                Product
              </Button>
            </div>

            {/* Product Search - Using Unified Component */}
            <ProductVariantSelect
              onChange={(variant) => handleProductSelect(variantToProductOption(variant))}
              placeholder="Search by product name, SKU, or attribute..."
              autoFocus={false}
            />

            {/* Product List */}
            <div className="flex-1 mt-4 min-h-[200px]">
              {watchedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-3">
                    <Package className="w-8 h-8 text-orange-300" />
                  </div>
                  <p className="text-sm font-medium">Search and add products above</p>
                  <p className="text-xs">Click the search bar to start</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {watchedItems.map((item: any, index: number) => (
                    <div
                      key={index}
                      className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3"
                    >
                      <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.variant_name} · Rs. {item.unit_price}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(index, Math.max(1, (item.quantity || 1) - 1))}
                          className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(index, (item.quantity || 1) + 1)}
                          className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="w-20 text-right font-semibold text-gray-900">
                        Rs. {(item.quantity * item.unit_price).toLocaleString()}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errors.items && (
              <p className="text-xs text-red-500 mt-2">{errors.items.message}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
          {/* Summary */}
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-sm font-medium">
              {watchedItems.length} Items
            </Badge>
            <span className="text-sm">•</span>
            <span className="text-sm font-semibold text-orange-600">
              COD: ₹{codAmount.toLocaleString()}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
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
                  <Send className="w-4 h-4 mr-2" />
                  Create Order
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NewOrderModal;
