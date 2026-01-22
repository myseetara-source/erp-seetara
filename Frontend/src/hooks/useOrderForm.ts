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
import { API_ROUTES } from '@/lib/routes';
import type { OrderStatus, FulfillmentType } from '@/types/database.types';

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
    // Shipping rates for "Highest Shipping" calculation
    shipping_inside: z.number().min(0).optional().default(100),
    shipping_outside: z.number().min(0).optional().default(150),
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
  // Shipping rates per product
  shipping_inside?: number;
  shipping_outside?: number;
}

// =============================================================================
// TRANSFORM TO API PAYLOAD (Matches Backend createOrderSchema)
// =============================================================================

/**
 * Transform form data to the format expected by Backend API
 * 
 * Backend expects:
 * - customer object with address_line1, city, state, pincode (REQUIRED)
 * - items array with variant_id, quantity, unit_price, discount_per_unit
 * - source (default: 'manual')
 * - shipping_charges (default: 100)
 * - payment_method (default: 'cod')
 */
function transformToPayload(data: QuickOrderFormData | FullOrderFormData, mode: OrderFormMode) {
  const isQuick = mode === 'quick';
  const quickData = data as QuickOrderFormData;
  const fullData = data as FullOrderFormData;
  
  // Clean phone number
  const cleanPhone = data.customer_phone.replace(/[\s\-+]/g, '');
  
  // Get address - use customer_address for quick mode
  const address = isQuick 
    ? (quickData.customer_address || 'To be confirmed') 
    : fullData.shipping_address;
  
  const city = isQuick ? 'Kathmandu' : (fullData.shipping_city || 'Kathmandu');
  
  return {
    // Customer - MUST match Backend orderCustomerSchema
    customer: {
      name: data.customer_name.trim(),
      phone: cleanPhone,
      alt_phone: null,
      email: isQuick ? null : (fullData.customer_email || null),
      address_line1: address || 'To be confirmed',
      address_line2: null,
      city: city,
      state: 'Bagmati',
      pincode: '44600',
      country: 'Nepal',
    },
    
    // Items - MUST match Backend orderItemSchema
    items: data.items.map(item => ({
      variant_id: item.variant_id,
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      discount_per_unit: 0,
    })),
    
    // Order config
    source: 'manual',
    source_order_id: null,
    
    // Pricing
    discount_amount: Number(data.discount_amount) || 0,
    discount_code: null,
    shipping_charges: Number(data.delivery_charge) || 100,
    cod_charges: 0,
    
    // Payment
    payment_method: isQuick ? 'cod' : (fullData.payment_method || 'cod'),
    paid_amount: Number(data.prepaid_amount) || 0,
    
    // Priority & Notes
    priority: 0,
    internal_notes: isQuick ? (quickData.notes || null) : (fullData.internal_notes || null),
    customer_notes: isQuick ? null : (fullData.customer_notes || null),
  };
}

// =============================================================================
// MAIN HOOK - Type Safe (Audit Fix CRIT-006)
// =============================================================================

import type { 
  OrderStatus,
  FulfillmentType,
  PaymentMethod,
  VariantAttributes 
} from '@/types';

/**
 * Created Order Response from API
 */
export interface CreatedOrderResponse {
  id: string;
  order_number: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
}

/**
 * Order Item for form field array
 */
export interface OrderFormItem {
  variant_id: string;
  product_name?: string;
  variant_name?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  shipping_inside?: number;
  shipping_outside?: number;
  attributes?: VariantAttributes;
}

/**
 * Axios Error shape for type-safe error handling
 */
interface AxiosErrorShape {
  code?: string;
  message?: string;
  response?: {
    status?: number;
    data?: {
      message?: string;
      error?: { code?: string; message?: string };
    };
  };
}

interface UseOrderFormOptions {
  mode: OrderFormMode;
  onSuccess?: (order: CreatedOrderResponse) => void;
  onError?: (error: Error) => void;
}

interface UseOrderFormReturn<T extends QuickOrderFormData | FullOrderFormData> {
  form: UseFormReturn<T>;
  items: OrderFormItem[];
  appendItem: (item: OrderFormItem) => void;
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
  createdOrder: CreatedOrderResponse | null;
  
  // Utils
  resetForm: () => void;
  mode: OrderFormMode;
}

// Type guard for item arrays
type FormItemArray = QuickOrderFormData['items'] | FullOrderFormData['items'];

export function useOrderForm<T extends QuickOrderFormData | FullOrderFormData>(
  options: UseOrderFormOptions
): UseOrderFormReturn<T> {
  const { mode, onSuccess, onError } = options;
  
  // Determine schema and defaults based on mode
  const schema = mode === 'quick' ? QuickOrderSchema : FullOrderSchema;
  const defaultValues = (mode === 'quick' ? quickOrderDefaults : fullOrderDefaults) as T;
  
  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Initialize form with explicit typing
  // Note: zodResolver type inference is complex, using type assertion for compatibility
  const form = useForm<T>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues,
    mode: 'onChange',
  });
  
  // Items array management with explicit path typing
  const { fields: items, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items' as const,
  });
  
  // Watch items for calculations with type safety
  const watchedItems = (form.watch('items' as keyof T) || []) as FormItemArray;
  const watchedDelivery = (form.watch('delivery_charge' as keyof T) || 0) as number;
  const watchedDiscount = (form.watch('discount_amount' as keyof T) || 0) as number;
  const watchedPrepaid = (form.watch('prepaid_amount' as keyof T) || 0) as number;
  
  // Calculations with proper typing
  const subtotal = useMemo(() => {
    return watchedItems.reduce((sum: number, item) => {
      const qty = item?.quantity || 0;
      const price = item?.unit_price || 0;
      return sum + (qty * price);
    }, 0);
  }, [watchedItems]);
  
  const total = useMemo(() => {
    return subtotal + watchedDelivery - watchedDiscount;
  }, [subtotal, watchedDelivery, watchedDiscount]);
  
  const codAmount = useMemo(() => {
    return Math.max(0, total - watchedPrepaid);
  }, [total, watchedPrepaid]);
  
  // Append item helper with proper typing
  const appendItem = useCallback((item: OrderFormItem) => {
    const formItem = {
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: item.unit_price,
      shipping_inside: item.shipping_inside ?? 100,
      shipping_outside: item.shipping_outside ?? 150,
    };
    // Type assertion needed due to react-hook-form generics complexity
    append(formItem as Parameters<typeof append>[0]);
  }, [append]);
  
  // Remove item
  const removeItem = useCallback((index: number) => {
    remove(index);
  }, [remove]);
  
  // Update item quantity with proper typing
  const updateItemQuantity = useCallback((index: number, quantity: number) => {
    const currentItem = watchedItems[index];
    if (currentItem) {
      update(index, { ...currentItem, quantity } as Parameters<typeof update>[1]);
    }
  }, [update, watchedItems]);
  
  // Product search
  const searchProducts = useCallback(async (query: string): Promise<ProductOption[]> => {
    if (!query || query.length < 2) return [];
    
    setIsSearching(true);
    try {
      const response = await apiClient.get(API_ROUTES.PRODUCTS.SEARCH, {
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
              // Include product-level shipping rates for "Highest Shipping" calculation
              shipping_inside: product.shipping_inside ?? 100,
              shipping_outside: product.shipping_outside ?? 150,
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
      
      const response = await apiClient.post(API_ROUTES.ORDERS.CREATE, payload);
      
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
    } catch (err: unknown) {
      // Type-safe error handling (Audit Fix CRIT-006)
      const axiosError = err as AxiosErrorShape;
      
      let errorMessage: string;
      
      if (axiosError.code === 'ERR_NETWORK') {
        errorMessage = 'Connection failed. Order NOT saved.';
      } else if (axiosError.response?.status === 400) {
        errorMessage = axiosError.response?.data?.message || 'Validation failed';
      } else if (axiosError.response?.data?.error?.code === 'INSUFFICIENT_STOCK') {
        errorMessage = 'Insufficient stock available';
      } else {
        errorMessage = axiosError.message || 'Failed to create order';
      }
      
      setError(errorMessage);
      toast.error('Order Failed', { description: errorMessage });
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsSubmitting(false);
    }
  }, [form, mode, onSuccess, onError]);
  
  // Reset form
  const resetForm = useCallback(() => {
    form.reset(defaultValues);
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
