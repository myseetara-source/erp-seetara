/**
 * useOrderForm - Polymorphic Order Form Hook
 * 
 * THE SHARED BRAIN for both Quick and Full order forms.
 * Handles validation, submission, product search, and price calculation.
 * 
 * MODES:
 * - 'quick': Inline form for fast entry (expandable panel or modal)
 * - 'full': Complete form with all fields (dedicated page)
 * 
 * AUTO-INJECTION: Quick mode automatically fills hidden fields to pass validation.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useForm, useFieldArray, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// SCHEMAS
// =============================================================================

// Quick Order Schema (minimal fields)
export const QuickOrderSchema = z.object({
  customer_name: z.string().min(2, 'Name is required'),
  customer_phone: z.string().min(10, 'Valid phone required').regex(/^[0-9]{10}$/, 'Phone must be 10 digits'),
  customer_address: z.string().optional().default(''),
  fulfillment_type: z.enum(['inside_valley', 'outside_valley', 'store']).default('inside_valley'),
  status: z.enum(['intake', 'converted']).default('intake'),
  items: z.array(z.object({
    variant_id: z.string().min(1, 'Select a product'),
    product_name: z.string().optional(),
    variant_name: z.string().optional(),
    sku: z.string().optional(),
    quantity: z.number().int().min(1, 'Min 1'),
    unit_price: z.number().min(0),
  })).min(1, 'Add at least one product'),
  delivery_charge: z.number().min(0).default(0),
  discount_amount: z.number().min(0).default(0),
  prepaid_amount: z.number().min(0).default(0),
  notes: z.string().optional().default(''),
});

// Full Order Schema (all fields)
export const FullOrderSchema = z.object({
  // Customer
  customer_name: z.string().min(2, 'Name is required'),
  customer_phone: z.string().min(10, 'Valid phone required'),
  customer_email: z.string().email().optional().or(z.literal('')),
  
  // Shipping
  shipping_address: z.string().min(5, 'Address is required'),
  shipping_city: z.string().min(2, 'City is required'),
  shipping_district: z.string().optional().default(''),
  shipping_landmark: z.string().optional().default(''),
  
  // Order config
  fulfillment_type: z.enum(['inside_valley', 'outside_valley', 'store']).default('inside_valley'),
  status: z.enum(['intake', 'converted']).default('intake'),
  source: z.enum(['manual', 'website', 'facebook', 'instagram', 'store']).default('manual'),
  
  // Items
  items: z.array(z.object({
    variant_id: z.string().min(1, 'Select a product'),
    product_name: z.string().optional(),
    variant_name: z.string().optional(),
    sku: z.string().optional(),
    quantity: z.number().int().min(1),
    unit_price: z.number().min(0),
    discount_percent: z.number().min(0).max(100).default(0),
  })).min(1, 'Add at least one product'),
  
  // Financial
  delivery_charge: z.number().min(0).default(100),
  discount_amount: z.number().min(0).default(0),
  prepaid_amount: z.number().min(0).default(0),
  
  // Payment
  payment_method: z.enum(['cod', 'esewa', 'khalti', 'bank_transfer', 'cash']).default('cod'),
  
  // Notes
  customer_notes: z.string().optional().default(''),
  internal_notes: z.string().optional().default(''),
});

// Types
export type QuickOrderFormData = z.infer<typeof QuickOrderSchema>;
export type FullOrderFormData = z.infer<typeof FullOrderSchema>;
export type OrderFormMode = 'quick' | 'full';

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const quickOrderDefaults: QuickOrderFormData = {
  customer_name: '',
  customer_phone: '',
  customer_address: '',
  fulfillment_type: 'inside_valley',
  status: 'intake',
  items: [],
  delivery_charge: 0,
  discount_amount: 0,
  prepaid_amount: 0,
  notes: '',
};

export const fullOrderDefaults: FullOrderFormData = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  shipping_address: '',
  shipping_city: '',
  shipping_district: '',
  shipping_landmark: '',
  fulfillment_type: 'inside_valley',
  status: 'intake',
  source: 'manual',
  items: [],
  delivery_charge: 100,
  discount_amount: 0,
  prepaid_amount: 0,
  payment_method: 'cod',
  customer_notes: '',
  internal_notes: '',
};

// =============================================================================
// PRODUCT ITEM TYPE
// =============================================================================

export interface ProductOption {
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  price: number;
  stock: number;
  image_url?: string;
  attributes?: Record<string, string>;
}

// =============================================================================
// TRANSFORM TO API PAYLOAD
// =============================================================================

function transformToPayload(data: QuickOrderFormData | FullOrderFormData, mode: OrderFormMode) {
  const isQuick = mode === 'quick';
  const quickData = data as QuickOrderFormData;
  const fullData = data as FullOrderFormData;
  
  // Calculate totals
  const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const total = subtotal + (data.delivery_charge || 0) - (data.discount_amount || 0);
  const codAmount = total - (data.prepaid_amount || 0);
  
  return {
    // Customer
    customer: {
      name: data.customer_name,
      phone: data.customer_phone,
      email: isQuick ? '' : fullData.customer_email || '',
      address: isQuick ? quickData.customer_address || '' : fullData.shipping_address,
    },
    
    // Shipping
    shipping: {
      address: isQuick ? quickData.customer_address || '' : fullData.shipping_address,
      city: isQuick ? '' : fullData.shipping_city,
      district: isQuick ? '' : fullData.shipping_district || '',
      landmark: isQuick ? '' : fullData.shipping_landmark || '',
    },
    
    // Items
    items: data.items.map(item => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: 0,
      total: item.quantity * item.unit_price,
    })),
    
    // Order config
    source: isQuick ? 'manual' : fullData.source,
    status: data.status,
    fulfillment_type: data.fulfillment_type,
    
    // Financial
    subtotal,
    discount_amount: data.discount_amount || 0,
    delivery_charge: data.delivery_charge || 0,
    total_amount: total,
    
    // Payment
    payment_status: data.prepaid_amount && data.prepaid_amount >= total ? 'paid' : 'pending',
    payment_method: isQuick ? 'cod' : fullData.payment_method,
    paid_amount: data.prepaid_amount || 0,
    
    // Notes
    internal_notes: isQuick ? quickData.notes || '' : fullData.internal_notes || '',
    customer_notes: isQuick ? '' : fullData.customer_notes || '',
  };
}

// =============================================================================
// MAIN HOOK
// =============================================================================

interface UseOrderFormOptions {
  mode: OrderFormMode;
  onSuccess?: (order: any) => void;
  onError?: (error: Error) => void;
}

interface UseOrderFormReturn<T> {
  form: UseFormReturn<T>;
  items: any;
  appendItem: (item: any) => void;
  removeItem: (index: number) => void;
  updateItemQuantity: (index: number, quantity: number) => void;
  
  // Product search
  searchProducts: (query: string) => Promise<ProductOption[]>;
  isSearching: boolean;
  
  // Calculations
  subtotal: number;
  total: number;
  codAmount: number;
  
  // Submission
  submitOrder: () => Promise<void>;
  isSubmitting: boolean;
  isSuccess: boolean;
  error: string | null;
  createdOrder: any | null;
  
  // Utils
  resetForm: () => void;
  mode: OrderFormMode;
}

export function useOrderForm<T extends QuickOrderFormData | FullOrderFormData>(
  options: UseOrderFormOptions
): UseOrderFormReturn<T> {
  const { mode, onSuccess, onError } = options;
  
  // Determine schema and defaults based on mode
  const schema = mode === 'quick' ? QuickOrderSchema : FullOrderSchema;
  const defaultValues = mode === 'quick' ? quickOrderDefaults : fullOrderDefaults;
  
  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Initialize form
  const form = useForm<T>({
    resolver: zodResolver(schema as any),
    defaultValues: defaultValues as any,
    mode: 'onChange',
  });
  
  // Items array management
  const { fields: items, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items' as any,
  });
  
  // Watch items for calculations
  const watchedItems = form.watch('items' as any) || [];
  const watchedDelivery = form.watch('delivery_charge' as any) || 0;
  const watchedDiscount = form.watch('discount_amount' as any) || 0;
  const watchedPrepaid = form.watch('prepaid_amount' as any) || 0;
  
  // Calculations
  const subtotal = useMemo(() => {
    return (watchedItems as any[]).reduce((sum, item) => {
      return sum + ((item?.quantity || 0) * (item?.unit_price || 0));
    }, 0);
  }, [watchedItems]);
  
  const total = useMemo(() => {
    return subtotal + watchedDelivery - watchedDiscount;
  }, [subtotal, watchedDelivery, watchedDiscount]);
  
  const codAmount = useMemo(() => {
    return Math.max(0, total - watchedPrepaid);
  }, [total, watchedPrepaid]);
  
  // Append item helper
  const appendItem = useCallback((item: {
    variant_id: string;
    product_name?: string;
    variant_name?: string;
    sku?: string;
    quantity: number;
    unit_price: number;
  }) => {
    append(item as any);
  }, [append]);
  
  // Remove item
  const removeItem = useCallback((index: number) => {
    remove(index);
  }, [remove]);
  
  // Update item quantity
  const updateItemQuantity = useCallback((index: number, quantity: number) => {
    const currentItem = watchedItems[index];
    if (currentItem) {
      update(index, { ...currentItem, quantity } as any);
    }
  }, [update, watchedItems]);
  
  // Product search
  const searchProducts = useCallback(async (query: string): Promise<ProductOption[]> => {
    if (!query || query.length < 2) return [];
    
    setIsSearching(true);
    try {
      const response = await apiClient.get('/products/search', {
        params: { q: query, limit: 10, include_variants: true },
      });
      
      if (response.data.success) {
        // Transform to ProductOption format
        const products = response.data.data || [];
        const options: ProductOption[] = [];
        
        for (const product of products) {
          for (const variant of (product.variants || [])) {
            options.push({
              variant_id: variant.id,
              product_id: product.id,
              product_name: product.name,
              variant_name: Object.values(variant.attributes || {}).join(' / ') || 'Default',
              sku: variant.sku,
              price: variant.selling_price || variant.price || 0,
              stock: variant.current_stock || 0,
              image_url: product.image_url,
              attributes: variant.attributes,
            });
          }
        }
        
        return options;
      }
      return [];
    } catch (err) {
      console.error('Product search failed:', err);
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);
  
  // Submit handler
  const submitOrder = useCallback(async () => {
    // Trigger validation
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error('Please fix the errors before submitting');
      return;
    }
    
    const data = form.getValues() as T;
    
    setIsSubmitting(true);
    setError(null);
    setIsSuccess(false);
    
    try {
      const payload = transformToPayload(data, mode);
      console.log(`[${mode.toUpperCase()}] Submitting order:`, payload);
      
      const response = await apiClient.post('/orders', payload);
      
      if (response.data.success) {
        setIsSuccess(true);
        setCreatedOrder(response.data.data);
        
        const orderNum = response.data.data?.order_number || '';
        toast.success(`Order ${orderNum} created!`, {
          description: mode === 'quick' ? 'Quick order saved successfully' : 'Order has been created',
        });
        
        onSuccess?.(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to create order');
      }
    } catch (err: any) {
      let errorMessage: string;
      
      if (err.code === 'ERR_NETWORK') {
        errorMessage = 'Connection failed. Order NOT saved.';
      } else if (err.response?.status === 400) {
        errorMessage = err.response?.data?.message || 'Validation failed';
      } else if (err.response?.data?.error?.code === 'INSUFFICIENT_STOCK') {
        errorMessage = 'Insufficient stock available';
      } else {
        errorMessage = err.message || 'Failed to create order';
      }
      
      setError(errorMessage);
      toast.error('Order Failed', { description: errorMessage });
      onError?.(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, mode, onSuccess, onError]);
  
  // Reset form
  const resetForm = useCallback(() => {
    form.reset(defaultValues as any);
    setIsSuccess(false);
    setError(null);
    setCreatedOrder(null);
  }, [form, defaultValues]);
  
  return {
    form: form as unknown as UseFormReturn<T>,
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
    error,
    createdOrder,
    resetForm,
    mode,
  };
}

// =============================================================================
// CONVENIENCE HOOKS
// =============================================================================

export function useQuickOrderForm(options?: Omit<UseOrderFormOptions, 'mode'>) {
  return useOrderForm<QuickOrderFormData>({ mode: 'quick', ...options });
}

export function useFullOrderForm(options?: Omit<UseOrderFormOptions, 'mode'>) {
  return useOrderForm<FullOrderFormData>({ mode: 'full', ...options });
}

export default useOrderForm;
