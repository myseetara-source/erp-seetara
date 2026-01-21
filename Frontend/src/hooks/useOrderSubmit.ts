/**
 * useOrderSubmit Hook
 * 
 * POLYMORPHIC ORDER FORM STRATEGY
 * 
 * This is the "Brain" that powers both:
 * - QuickOrderDialog (modal for fast entry)
 * - FullOrderForm (page with all fields)
 * 
 * Features:
 * - Unified validation with Zod
 * - Automatic default values for hidden fields
 * - Transform logic for quick-to-full conversion
 * - Proper error handling (no demo mode)
 * 
 * @example
 * // Quick mode (modal)
 * const { form, submitOrder } = useQuickOrderSubmit({ onSuccess: handleClose });
 * 
 * // Full mode (page)
 * const { form, submitOrder } = useFullOrderSubmit({ onSuccess: () => router.push('/orders') });
 */

import { useState, useCallback } from 'react';
import { useForm, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export type FormMode = 'quick' | 'full';

interface UseOrderSubmitOptions<T extends z.ZodType> {
  schema: T;
  defaultValues?: Partial<z.infer<T>>;
  transformBeforeSubmit?: (data: z.infer<T>) => any;
  onSuccess?: (order: any) => void;
  onError?: (error: Error) => void;
  mode?: FormMode;
}

interface UseOrderSubmitReturn<T extends z.ZodType> {
  form: UseFormReturn<z.infer<T>>;
  isSubmitting: boolean;
  isSuccess: boolean;
  error: string | null;
  createdOrder: any | null;
  submitOrder: (data: z.infer<T>) => Promise<void>;
  resetForm: () => void;
  mode: FormMode;
}

// =============================================================================
// BASE HOOK (Generic)
// =============================================================================

export function useOrderSubmit<T extends z.ZodType>(
  options: UseOrderSubmitOptions<T>
): UseOrderSubmitReturn<T> {
  const { 
    schema, 
    defaultValues, 
    transformBeforeSubmit, 
    onSuccess, 
    onError,
    mode = 'full',
  } = options;

  // State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);

  // Initialize react-hook-form with Zod resolver
  const form = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as any,
    mode: 'onChange', // Validate on change for better UX
  });

  // Submit handler
  const submitOrder = useCallback(
    async (data: z.infer<T>) => {
      setIsSubmitting(true);
      setError(null);
      setIsSuccess(false);

      try {
        // Transform data if transformer provided
        const payload = transformBeforeSubmit ? transformBeforeSubmit(data) : data;

        console.log(`[${mode.toUpperCase()}] Submitting order:`, payload);

        // API call
        const response = await apiClient.post('/orders', payload);

        if (response.data.success) {
          setIsSuccess(true);
          setCreatedOrder(response.data.data);
          
          const orderNum = response.data.data.order_number || '';
          toast.success(`🎉 Order ${orderNum} created successfully!`, {
            description: mode === 'quick' 
              ? 'Quick order saved. View in orders list.'
              : 'Order has been saved.',
          });
          
          onSuccess?.(response.data.data);
        } else {
          throw new Error(response.data.message || 'Failed to create order');
        }
      } catch (err: any) {
        // =================================================================
        // PROPER ERROR HANDLING - No demo/simulation mode
        // =================================================================
        
        let errorMessage: string;
        
        // Handle network/connection errors
        if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
          errorMessage = 'Connection Failed. Order NOT saved. Please check your internet connection.';
        } 
        // Handle timeout errors
        else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          errorMessage = 'Request timed out. Order may not have been saved. Please verify.';
        }
        // Handle server errors
        else if (err.response?.status >= 500) {
          errorMessage = 'Server error. Order NOT saved. Please try again later.';
        }
        // Handle validation errors from server
        else if (err.response?.status === 400 || err.response?.status === 422) {
          const serverMsg = err.response?.data?.message || err.response?.data?.error?.message;
          errorMessage = serverMsg || 'Validation failed. Please check your input.';
        }
        // Handle auth errors
        else if (err.response?.status === 401) {
          errorMessage = 'Session expired. Please login again.';
        }
        // Handle insufficient stock
        else if (err.response?.data?.error?.code === 'INSUFFICIENT_STOCK') {
          errorMessage = 'Insufficient stock available. Please reduce quantity.';
        }
        // Default error message
        else {
          errorMessage = err.response?.data?.message || err.message || 'Failed to create order.';
        }
        
        setError(errorMessage);
        toast.error('Order Failed', { description: errorMessage });
        onError?.(err);
        
        console.error('Order submission failed:', {
          mode,
          code: err.code,
          status: err.response?.status,
          message: err.message,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [transformBeforeSubmit, onSuccess, onError, mode]
  );

  // Reset form and state
  const resetForm = useCallback(() => {
    form.reset(defaultValues as any);
    setIsSuccess(false);
    setError(null);
    setCreatedOrder(null);
  }, [form, defaultValues]);

  return {
    form,
    isSubmitting,
    isSuccess,
    error,
    createdOrder,
    submitOrder,
    resetForm,
    mode,
  };
}

// =============================================================================
// SCHEMA IMPORTS
// =============================================================================

import {
  OrderSchema,
  QuickOrderSchema,
  OrderFormData,
  QuickOrderFormData,
  defaultOrderValues,
  defaultQuickOrderValues,
  transformQuickToFullOrder,
} from '@/schemas/orderSchema';

// =============================================================================
// SPECIALIZED HOOKS
// =============================================================================

/**
 * Hook for Full Order Form (Page)
 * 
 * Use when you need all fields:
 * - Customer details
 * - Multiple items
 * - Shipping address
 * - Discount/delivery charges
 * - Payment details
 * - Notes
 */
export function useFullOrderSubmit(options?: {
  defaultValues?: Partial<OrderFormData>;
  onSuccess?: (order: any) => void;
  onError?: (error: Error) => void;
}) {
  return useOrderSubmit({
    schema: OrderSchema,
    defaultValues: { ...defaultOrderValues, ...options?.defaultValues },
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    mode: 'full',
  });
}

/**
 * Hook for Quick Order Form (Modal)
 * 
 * Use for fast entry with minimal fields:
 * - Customer name & phone
 * - Single product variant
 * - Quantity
 * 
 * AUTO-FILLS hidden fields:
 * - source: 'manual'
 * - status: 'intake'
 * - payment_status: 'pending'
 * - payment_method: 'cod'
 * - delivery_charge: 100 (default)
 */
export function useQuickOrderSubmit(options?: {
  defaultValues?: Partial<QuickOrderFormData>;
  onSuccess?: (order: any) => void;
  onError?: (error: Error) => void;
}) {
  return useOrderSubmit({
    schema: QuickOrderSchema,
    defaultValues: { ...defaultQuickOrderValues, ...options?.defaultValues },
    transformBeforeSubmit: transformQuickToFullOrder,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    mode: 'quick',
  });
}

// =============================================================================
// HELPER TYPES
// =============================================================================

export type { OrderFormData, QuickOrderFormData };

export default useOrderSubmit;
