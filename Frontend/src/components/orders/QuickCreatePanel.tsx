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

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useQuickOrderForm, ProductOption } from '@/hooks/useOrderForm';
import { AsyncProductSelect } from '@/components/common/AsyncProductSelect';
import { DELIVERY_ZONES, ZoneConfig } from '@/config/zones';
import { getActiveOrderSources, type OrderSource } from '@/lib/api/orderSources';

// =============================================================================
// TYPES
// =============================================================================

interface QuickCreatePanelProps {
  onSuccess?: () => void;
  defaultExpanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  newOrderSlot?: React.ReactNode;
}

type FulfillmentType = 'inside_valley' | 'outside_valley' | 'store';
type OrderStatus = 'intake' | 'converted' | 'store_sale';


// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function QuickCreatePanel({ 
  onSuccess, 
  defaultExpanded = false,
  onExpandChange,
  newOrderSlot,
}: QuickCreatePanelProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [orderSourceOptions, setOrderSourceOptions] = useState<OrderSource[]>([]);
  const formRef = useRef<HTMLDivElement>(null);

  // Load order sources on mount
  useEffect(() => {
    getActiveOrderSources()
      .then(setOrderSourceOptions)
      .catch(() => {});
  }, []);

  // Notify parent when expand state changes
  const handleExpandToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    onExpandChange?.(newState);
  };

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
      onExpandChange?.(false);
      onSuccess?.();
    },
  });

  const { register, watch, setValue, formState: { errors } } = form;
  const watchedItems = watch('items') || [];
  const fulfillmentType = watch('fulfillment_type');
  const status = watch('status');

  // Track previous fulfillment type to only update shipping when type CHANGES
  const prevFulfillmentTypeRef = useRef(fulfillmentType);
  
  // AUTO-SET: When fulfillment type changes, set appropriate shipping and status
  // P0 FIX: Only update delivery_charge when fulfillment_type ACTUALLY changes
  // This prevents overwriting user's manual shipping input when status changes
  useEffect(() => {
    const prevType = prevFulfillmentTypeRef.current;
    const typeChanged = prevType !== fulfillmentType;
    
    if (fulfillmentType === 'store') {
      // Store POS: Auto-complete as store_sale with payment paid, no shipping
      setValue('status', 'store_sale' as any);
      if (typeChanged) {
        setValue('delivery_charge', 0);
      }
    } else if (fulfillmentType === 'outside_valley') {
      // Outside Valley: 150 shipping
      if (status === 'store_sale') {
        setValue('status', 'intake' as any);
      }
      if (typeChanged) {
        setValue('delivery_charge', 150);
      }
    } else {
      // Inside Valley: 100 shipping (default)
      if (status === 'store_sale') {
        setValue('status', 'intake' as any);
      }
      if (typeChanged) {
        setValue('delivery_charge', 100);
      }
    }
    
    // Update ref to current value
    prevFulfillmentTypeRef.current = fulfillmentType;
  }, [fulfillmentType, setValue, status]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + N to toggle panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        const newState = !isExpanded;
        setIsExpanded(newState);
        onExpandChange?.(newState);
      }
      // Cmd/Ctrl + Enter to submit (when expanded)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isExpanded) {
        e.preventDefault();
        submitOrder();
      }
      // Escape to close
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
        onExpandChange?.(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, submitOrder, onExpandChange]);

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
    { value: 'intake', label: 'New', icon: Clock },
    { value: 'converted', label: 'Converted', icon: Check },
  ];

  return (
    <div className="flex items-stretch gap-3">
      {/* New Order Button Slot - Only show when collapsed */}
      {!isExpanded && newOrderSlot}
      
      {/* Quick Create Panel */}
      <div className="flex-1">
        {/* Collapsed State - Quick Create Button */}
        <button
          onClick={handleExpandToggle}
          className={cn(
            'w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl px-5 py-3.5',
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
                  placeholder={fulfillmentType === 'store' ? "Walk-in customer" : "Full name"}
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

            {/* Address - Always visible */}
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

          {/* Row 2: Type & Status/Discount - Always 2 columns */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Fulfillment Type - Always visible */}
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

            {/* Right Side: Status (for delivery) OR Discount (for store) */}
            {fulfillmentType !== 'store' ? (
              /* Inside/Outside Valley: Show Status buttons */
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
            ) : (
              /* Store POS: Show Discount input */
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Discount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">Rs.</span>
                  <input
                    type="number"
                    min="0"
                    {...register('discount_amount', { valueAsNumber: true })}
                    placeholder="0"
                    className="w-full h-10 pl-10 pr-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Row 2.5: Source / Page Selector */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-700 mb-2 block">
              Source / Page <span className="text-[10px] text-gray-400 ml-1">(shown on courier manifest)</span>
            </label>
            <select
              {...register('source_id')}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
            >
              <option value="">— Select Page —</option>
              {orderSourceOptions.map(src => (
                <option key={src.id} value={src.id}>{src.name}</option>
              ))}
            </select>
          </div>

          {/* Hidden input to ALWAYS register zone field with react-hook-form */}
          {/* P0 FIX: Moved outside conditional to prevent field unregistration issues */}
          <input type="hidden" {...register('zone')} />
          
          {/* Row 2.5: Zone Selector - Only for Inside Valley */}
          {fulfillmentType === 'inside_valley' && (
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5" />
                Delivery Zone
              </label>
              <TooltipProvider delayDuration={200}>
                <div className="grid grid-cols-5 gap-2">
                  {DELIVERY_ZONES.map((zone) => {
                    const isSelected = watch('zone') === zone.code;
                    return (
                      <Tooltip key={zone.code}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setValue('zone', zone.code)}
                            className={cn(
                              'relative flex flex-col items-center justify-center py-2.5 px-2 rounded-lg border-2 transition-all',
                              isSelected
                                ? `${zone.bgColor} text-white border-transparent shadow-lg`
                                : `bg-white text-gray-700 ${zone.borderColor} border-opacity-30 hover:border-opacity-100`
                            )}
                            style={!isSelected ? { borderColor: zone.colorHex + '50' } : undefined}
                          >
                            {/* Short Name (Bold) */}
                            <span className={cn(
                              'font-bold text-xs leading-tight',
                              isSelected ? 'text-white' : zone.textColor
                            )}>
                              {zone.shortName}
                            </span>
                            {/* Route (Smaller) */}
                            <span className={cn(
                              'text-[10px] leading-tight mt-0.5 text-center',
                              isSelected ? 'text-white/90' : 'text-gray-500'
                            )}>
                              {zone.route}
                            </span>
                            {/* Selected indicator */}
                            {isSelected && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow">
                                <Check className="w-3 h-3" style={{ color: zone.colorHex }} />
                              </div>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p className="font-semibold text-sm">{zone.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Areas: {zone.areas.join(', ')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>
          )}

          {/* Row 3: Products */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-700 mb-2 block">Products</label>
            
            {/* Product Search + Items Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Table Header - 6 Columns */}
              <div className="bg-gray-100 border-b border-gray-200">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                  <div className="col-span-3">Item Name</div>
                  <div className="col-span-2">Variant</div>
                  <div className="col-span-2">SKU</div>
                  <div className="col-span-1 text-right">Rate</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-1 text-right">Total</div>
                  <div className="col-span-1"></div>
                </div>
              </div>

              {/* Items Table Body */}
              {watchedItems.length > 0 && (
                <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {watchedItems.map((item: any, index: number) => (
                    <div key={index} className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-gray-50">
                      {/* Item Name */}
                      <div className="col-span-3 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{item.product_name}</p>
                      </div>
                      
                      {/* Variant */}
                      <div className="col-span-2 min-w-0">
                        <span className="text-sm text-gray-600 truncate block">{item.variant_name || 'Default'}</span>
                      </div>
                      
                      {/* SKU */}
                      <div className="col-span-2 min-w-0">
                        <code className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded truncate block">
                          {item.sku}
                        </code>
                      </div>
                      
                      {/* Rate (Unit Price) */}
                      <div className="col-span-1 text-right">
                        <span className="text-sm text-gray-700">
                          {(item.unit_price || 0).toLocaleString()}
                        </span>
                      </div>
                      
                      {/* Quantity Controls */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(index, Math.max(1, (item.quantity || 1) - 1))}
                          className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-semibold text-gray-900">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(index, (item.quantity || 1) + 1)}
                          className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      
                      {/* Total Price */}
                      <div className="col-span-1 text-right">
                        <span className="font-semibold text-gray-900">
                          {(() => {
                            const total = (item.quantity || 0) * (item.unit_price || 0);
                            return isNaN(total) ? '0' : total.toLocaleString();
                          })()}
                        </span>
                      </div>
                      
                      {/* Delete Button */}
                      <div className="col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
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
                    // Allow out of stock for Inside/Outside Valley (pre-orders)
                    // Block out of stock for Store POS (immediate sale)
                    allowOutOfStock={fulfillmentType !== 'store'}
                    onSelect={(product, variant) => {
                      // Check if already in list
                      const existingIndex = watchedItems.findIndex(
                        (item: any) => item.variant_id === variant.id
                      );

                      if (existingIndex >= 0) {
                        // Increment quantity
                        updateItemQuantity(existingIndex, (watchedItems[existingIndex]?.quantity || 1) + 1);
                      } else {
                        // Get variant name - use direct field or build from attributes
                        let variantName = variant.variant_name || 'Default';
                        if (variantName === 'Default' && variant.attributes && Object.keys(variant.attributes).length > 0) {
                          variantName = Object.values(variant.attributes).join(' / ');
                        } else if (variantName === 'Default' && (variant.color || variant.size)) {
                          variantName = [variant.color, variant.size].filter(Boolean).join(' / ');
                        }

                        // Get price - handle undefined/null
                        const price = Number(variant.selling_price) || 0;

                        console.log('[QuickCreatePanel] Adding item:', {
                          variant_id: variant.id,
                          product_name: product.name,
                          variant_name: variantName,
                          sku: variant.sku,
                          unit_price: price,
                        });

                        appendItem({
                          variant_id: variant.id,
                          product_name: product.name,
                          variant_name: variantName,
                          sku: variant.sku || 'N/A',
                          quantity: 1,
                          unit_price: price,
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

          {/* Footer - Thin container, normal text */}
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
            {/* Left Side: Full Form Link */}
            <button
              type="button"
              onClick={() => router.push('/dashboard/orders/new')}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 hover:underline"
            >
              <ArrowRight className="w-4 h-4" />
              Open Full Form
            </button>

            {/* Center: Pricing - Different for Store vs Delivery */}
            {watchedItems.length > 0 && (
              <div className="flex items-center gap-3 text-sm">
                {fulfillmentType !== 'store' ? (
                  /* Inside/Outside Valley: Show DISC, SHIP, COD */
                  <>
                    {/* Discount */}
                    <span className="text-gray-500">DISC</span>
                    <input
                      type="number"
                      min="0"
                      {...register('discount_amount', { valueAsNumber: true })}
                      placeholder="0"
                      className="w-14 h-7 px-2 text-sm text-center border border-gray-200 rounded focus:ring-1 focus:ring-orange-500 focus:border-transparent"
                    />
                    <span className="text-gray-300">|</span>
                    {/* Shipping */}
                    <span className="text-gray-500">SHIP</span>
                    <input
                      type="number"
                      min="0"
                      {...register('delivery_charge', { valueAsNumber: true })}
                      placeholder="0"
                      className="w-14 h-7 px-2 text-sm text-center border border-gray-200 rounded focus:ring-1 focus:ring-orange-500 focus:border-transparent"
                    />
                    <span className="text-gray-300">|</span>
                    {/* COD Amount */}
                    <span className="text-orange-500 font-medium">COD</span>
                    <span className="font-bold text-orange-600">₹{codAmount.toLocaleString()}</span>
                  </>
                ) : (
                  /* Store POS: Only show Grand Total (Discount is in row above, no shipping) */
                  <>
                    <span className="text-green-600 font-medium">TOTAL</span>
                    <span className="font-bold text-green-600 text-lg">₹{codAmount.toLocaleString()}</span>
                  </>
                )}
              </div>
            )}

            {/* Right Side: Primary Action */}
            <Button
              type="button"
              onClick={submitOrder}
              disabled={isSubmitting || watchedItems.length === 0}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-5"
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
      )}
      </div>
    </div>
  );
}

export default QuickCreatePanel;
