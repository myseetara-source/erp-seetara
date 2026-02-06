/**
 * QuickCreatePanel - Refactored with Proper Validation
 * 
 * P0 FIXES IMPLEMENTED:
 * 1. Zone is REQUIRED for inside_valley (validation + API mapping)
 * 2. Discount and delivery_charge are properly typed as numbers (default 0)
 * 3. Branch is REQUIRED for outside_valley
 * 4. Proper API payload transformation
 * 
 * Uses modular sub-components for cleaner code.
 * 
 * @author Code Quality Team
 * @priority P0 - Form Bug Fixes
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChevronDown,
  ChevronUp,
  Zap,
  User,
  Phone,
  Truck,
  Building2,
  Store,
  Clock,
  Check,
  Command,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Form components
import { CustomerLookup, type CustomerResult } from './form/CustomerLookup';
import { AddressSection } from './form/AddressSection';
import { ProductEntry, type ProductItem, type ProductSelectOption } from './form/ProductEntry';
import { OrderTotals } from './form/OrderTotals';

// Validation
import {
  quickOrderSchema,
  type QuickOrderInput,
  getQuickOrderDefaults,
  transformToApiPayload,
  DEFAULT_SHIPPING,
} from '@/validations/orderSchema';

// API
import apiClient from '@/lib/api/apiClient';
import { withErrorHandling } from '@/utils/errorHandler';

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
// CONSTANTS
// =============================================================================

const FULFILLMENT_OPTIONS = [
  { value: 'inside_valley' as const, label: 'Inside', icon: Truck },
  { value: 'outside_valley' as const, label: 'Outside', icon: Building2 },
  { value: 'store' as const, label: 'Store', icon: Store },
];

const STATUS_OPTIONS = [
  { value: 'intake' as const, label: 'New', icon: Clock },
  { value: 'converted' as const, label: 'Converted', icon: Check },
];

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const prevFulfillmentTypeRef = useRef<FulfillmentType>('inside_valley');
  
  // =========================================================================
  // FORM SETUP with Zod validation
  // =========================================================================
  
  const form = useForm<QuickOrderInput>({
    resolver: zodResolver(quickOrderSchema) as any,
    defaultValues: getQuickOrderDefaults(),
    mode: 'onChange',
  });
  
  const {
    register,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = form;
  
  // Field array for items
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  
  // Watch values
  const watchedValues = watch();
  const fulfillmentType = watchedValues.fulfillment_type;
  const status = watchedValues.status;
  const items = watchedValues.items || [];
  const deliveryCharge = watchedValues.delivery_charge ?? 0;
  const discountAmount = watchedValues.discount_amount ?? 0;
  
  // =========================================================================
  // CALCULATIONS
  // =========================================================================
  
  const calculations = useMemo(() => {
    const subtotal = items.reduce(
      (sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0),
      0
    );
    const shipping = Number(deliveryCharge) || 0;
    const discount = Number(discountAmount) || 0;
    const total = Math.max(0, subtotal + shipping - discount);
    
    return { subtotal, shipping, discount, total };
  }, [items, deliveryCharge, discountAmount]);
  
  // =========================================================================
  // FULFILLMENT TYPE CHANGE EFFECT
  // P0 FIX: Only update shipping when type ACTUALLY changes
  // =========================================================================
  
  useEffect(() => {
    const prevType = prevFulfillmentTypeRef.current;
    const typeChanged = prevType !== fulfillmentType;
    
    if (!typeChanged) return;
    
    // Reset zone/branch when switching types
    setValue('zone_code', null);
    setValue('zone_id', null);
    setValue('destination_branch', null);
    
    // Update shipping and status based on type
    if (fulfillmentType === 'store') {
      setValue('status', 'store_sale');
      setValue('delivery_charge', DEFAULT_SHIPPING.STORE);
    } else if (fulfillmentType === 'outside_valley') {
      if (status === 'store_sale') {
        setValue('status', 'intake');
      }
      setValue('delivery_charge', DEFAULT_SHIPPING.OUTSIDE_VALLEY);
    } else {
      // inside_valley
      if (status === 'store_sale') {
        setValue('status', 'intake');
      }
      setValue('delivery_charge', DEFAULT_SHIPPING.INSIDE_VALLEY);
    }
    
    prevFulfillmentTypeRef.current = fulfillmentType;
  }, [fulfillmentType, status, setValue]);
  
  // =========================================================================
  // HANDLERS
  // =========================================================================
  
  const handleExpandToggle = useCallback(() => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    onExpandChange?.(newState);
  }, [isExpanded, onExpandChange]);
  
  const handleCustomerSelect = useCallback((customer: CustomerResult) => {
    setValue('customer_name', customer.name);
    setValue('customer_phone', customer.phone);
    if (customer.address) {
      setValue('customer_address', customer.address);
    }
  }, [setValue]);
  
  const handleProductSelect = useCallback((product: ProductSelectOption) => {
    // Check if already in list
    const existingIndex = items.findIndex(
      item => item.variant_id === product.variant_id
    );
    
    if (existingIndex >= 0) {
      // Increment quantity
      const existingItem = items[existingIndex];
      update(existingIndex, {
        ...existingItem,
        quantity: (existingItem.quantity || 1) + 1,
      });
    } else {
      // Add new item
      append({
        variant_id: product.variant_id,
        product_id: product.product_id,
        product_name: product.product_name,
        variant_name: product.variant_name,
        sku: product.sku,
        quantity: 1,
        unit_price: product.price,
        shipping_inside: product.shipping_inside || DEFAULT_SHIPPING.INSIDE_VALLEY,
        shipping_outside: product.shipping_outside || DEFAULT_SHIPPING.OUTSIDE_VALLEY,
      });
    }
  }, [items, append, update]);
  
  const handleAddItem = useCallback((item: ProductItem) => {
    append({
      variant_id: item.variant_id,
      product_id: item.product_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
      shipping_inside: item.shipping_inside ?? 0,
      shipping_outside: item.shipping_outside ?? 0,
    });
  }, [append]);
  
  const handleRemoveItem = useCallback((index: number) => {
    remove(index);
  }, [remove]);
  
  const handleUpdateQuantity = useCallback((index: number, quantity: number) => {
    const item = items[index];
    if (item) {
      update(index, { ...item, quantity });
    }
  }, [items, update]);
  
  // =========================================================================
  // FORM SUBMISSION
  // P0 FIX: Proper API payload transformation with zone_id mapping
  // =========================================================================
  
  const onSubmit = useCallback(async (data: QuickOrderInput) => {
    setIsSubmitting(true);
    
    try {
      // Transform form data to API payload
      const payload = transformToApiPayload(data);
      
      // Submit to API
      const response = await apiClient.post('/orders', payload);
      
      if (response.data?.id || response.data?.success) {
        toast.success('Order created successfully!', {
          description: `Order ${response.data?.order_id || response.data?.id} has been created.`,
        });
        
        // Reset form
        reset(getQuickOrderDefaults());
        prevFulfillmentTypeRef.current = 'inside_valley';
        
        // Collapse and notify
        setIsExpanded(false);
        onExpandChange?.(false);
        onSuccess?.();
      }
    } catch (error) {
      console.error('[QuickCreatePanel] Submit error:', error);
      toast.error('Failed to create order', {
        description: 'Please check the form and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [reset, onExpandChange, onSuccess]);
  
  // =========================================================================
  // KEYBOARD SHORTCUTS
  // =========================================================================
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + N to toggle panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleExpandToggle();
      }
      // Cmd/Ctrl + Enter to submit (when expanded)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isExpanded) {
        e.preventDefault();
        handleSubmit(onSubmit)();
      }
      // Escape to close
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
        onExpandChange?.(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, handleSubmit, onSubmit, onExpandChange, handleExpandToggle]);
  
  // =========================================================================
  // RENDER
  // =========================================================================
  
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
            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Header */}
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

                {/* Phone with Customer Lookup */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <CustomerLookup
                    phone={watchedValues.customer_phone || ''}
                    onPhoneChange={(phone) => setValue('customer_phone', phone)}
                    onCustomerSelect={handleCustomerSelect}
                    error={errors.customer_phone?.message}
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1">
                    Address <span className="text-gray-400">(optional)</span>
                  </label>
                  <Input
                    {...register('customer_address')}
                    placeholder="Area, City"
                    className="h-10"
                  />
                </div>
              </div>

              {/* Row 2: Fulfillment Type & Status/Zone */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Fulfillment Type */}
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2 block">Type</label>
                  <div className="flex gap-2">
                    {FULFILLMENT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setValue('fulfillment_type', option.value)}
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

                {/* Status (for delivery) or Zone/Branch */}
                {fulfillmentType !== 'store' ? (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Status</label>
                    <div className="flex gap-2">
                      {STATUS_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setValue('status', option.value)}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-all',
                              status === option.value
                                ? 'bg-blue-600 text-white border-blue-600'
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
                  <div>
                    {/* Store mode: Show discount input */}
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Discount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">Rs.</span>
                      <Input
                        type="number"
                        {...register('discount_amount', { valueAsNumber: true })}
                        min={0}
                        placeholder="0"
                        className="pl-10 h-10"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Row 3: Zone/Branch (P0 FIX: Required validation) */}
              {fulfillmentType !== 'store' && (
                <div className="mb-4">
                  <AddressSection
                    fulfillmentType={fulfillmentType}
                    address={watchedValues.customer_address || ''}
                    onAddressChange={(addr) => setValue('customer_address', addr)}
                    zoneCode={watchedValues.zone_code}
                    onZoneChange={(code) => {
                      setValue('zone_code', code);
                      setValue('zone_id', code); // Map to zone_id as well
                    }}
                    zoneError={errors.zone_code?.message}
                    branch={watchedValues.destination_branch}
                    onBranchChange={(branch) => setValue('destination_branch', branch)}
                    branchError={errors.destination_branch?.message}
                    showLabels={true}
                    compact={true}
                  />
                </div>
              )}

              {/* Row 4: Products */}
              <div className="mb-4">
                <ProductEntry
                  items={items.map(item => ({
                    variant_id: item.variant_id,
                    product_id: item.product_id,
                    product_name: item.product_name || '',
                    variant_name: item.variant_name,
                    sku: item.sku,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                  }))}
                  onAddItem={handleAddItem}
                  onRemoveItem={handleRemoveItem}
                  onUpdateQuantity={handleUpdateQuantity}
                  error={errors.items?.message || errors.items?.root?.message}
                />
              </div>

              {/* Row 5: Totals (P0 FIX: Proper number handling) */}
              {items.length > 0 && (
                <div className="mb-4">
                  <OrderTotals
                    subtotal={calculations.subtotal}
                    deliveryCharge={deliveryCharge}
                    onDeliveryChargeChange={(val) => setValue('delivery_charge', val)}
                    deliveryChargeError={errors.delivery_charge?.message}
                    discountAmount={discountAmount}
                    onDiscountChange={(val) => setValue('discount_amount', val)}
                    discountError={errors.discount_amount?.message}
                    fulfillmentType={fulfillmentType}
                    compact={true}
                  />
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono">⌘+Enter</kbd> to submit
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      reset(getQuickOrderDefaults());
                      setIsExpanded(false);
                      onExpandChange?.(false);
                    }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || items.length === 0}
                    className="bg-orange-600 hover:bg-orange-700 gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Create Order
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuickCreatePanel;
