/**
 * Optimistic Mutation Hooks
 * 
 * Provides instant UI feedback while syncing with server.
 * If server fails, automatically rolls back UI state.
 * 
 * PATTERN:
 * 1. User clicks action
 * 2. UI updates immediately (optimistic)
 * 3. Request sent to server in background
 * 4. Success: Keep UI state
 * 5. Failure: Rollback + Show error toast
 * 
 * USAGE:
 * ```tsx
 * const { mutate, isPending } = useOptimisticStatusUpdate({
 *   onSuccess: () => toast.success('Status updated!'),
 * });
 * 
 * mutate({ orderId: 'xxx', newStatus: 'packed' });
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import type { OrderStatus } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

interface MutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onMutate?: (variables: TVariables) => (() => void) | void;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables, rollback?: () => void) => void;
  onSettled?: (data: TData | undefined, error: Error | null, variables: TVariables) => void;
}

interface MutationState<TData> {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  data: TData | undefined;
}

// =============================================================================
// GENERIC OPTIMISTIC MUTATION HOOK
// =============================================================================

export function useOptimisticMutation<TData = unknown, TVariables = unknown>(
  options: MutationOptions<TData, TVariables>
) {
  const [state, setState] = useState<MutationState<TData>>({
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: undefined,
  });
  
  const rollbackRef = useRef<(() => void) | null>(null);

  const mutate = useCallback(async (variables: TVariables) => {
    setState({
      isPending: true,
      isSuccess: false,
      isError: false,
      error: null,
      data: undefined,
    });

    // Execute onMutate (optimistic update) and get rollback function
    if (options.onMutate) {
      const rollback = options.onMutate(variables);
      if (typeof rollback === 'function') {
        rollbackRef.current = rollback;
      }
    }

    try {
      const data = await options.mutationFn(variables);
      
      setState({
        isPending: false,
        isSuccess: true,
        isError: false,
        error: null,
        data,
      });

      options.onSuccess?.(data, variables);
      options.onSettled?.(data, null, variables);
      
      return data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      
      // Rollback optimistic update
      if (rollbackRef.current) {
        rollbackRef.current();
        rollbackRef.current = null;
      }

      setState({
        isPending: false,
        isSuccess: false,
        isError: true,
        error: err,
        data: undefined,
      });

      options.onError?.(err, variables, rollbackRef.current || undefined);
      options.onSettled?.(undefined, err, variables);
      
      throw error;
    }
  }, [options]);

  const reset = useCallback(() => {
    setState({
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      data: undefined,
    });
  }, []);

  return {
    mutate,
    mutateAsync: mutate,
    reset,
    ...state,
  };
}

// =============================================================================
// ORDER STATUS UPDATE (Optimistic)
// =============================================================================

interface StatusUpdateInput {
  orderId: string;
  newStatus: OrderStatus;
  currentStatus?: OrderStatus;
  reason?: string;
}

interface StatusUpdateOptions {
  onOptimisticUpdate?: (orderId: string, newStatus: OrderStatus, oldStatus?: OrderStatus) => void;
  onRollback?: (orderId: string, oldStatus?: OrderStatus) => void;
  onSuccess?: (orderId: string, newStatus: OrderStatus) => void;
  onError?: (error: Error, orderId: string) => void;
}

export function useOptimisticStatusUpdate(options: StatusUpdateOptions = {}) {
  const toastIdRef = useRef<string | number | null>(null);

  return useOptimisticMutation<unknown, StatusUpdateInput>({
    mutationFn: async ({ orderId, newStatus, reason }) => {
      const response = await apiClient.patch(`/orders/${orderId}/status`, {
        status: newStatus,
        reason,
      });
      return response.data;
    },

    onMutate: ({ orderId, newStatus, currentStatus }) => {
      // Show optimistic toast
      toastIdRef.current = toast.loading('Updating status...');
      
      // Apply optimistic update to UI
      options.onOptimisticUpdate?.(orderId, newStatus, currentStatus);

      // Return rollback function
      return () => {
        options.onRollback?.(orderId, currentStatus);
      };
    },

    onSuccess: (_, { orderId, newStatus }) => {
      // Dismiss loading toast and show success
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      toast.success('Status updated!', {
        description: `Order marked as ${newStatus}`,
        duration: 2000,
      });
      
      options.onSuccess?.(orderId, newStatus);
    },

    onError: (error, { orderId }) => {
      // Dismiss loading toast and show error
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      toast.error('Failed to update status', {
        description: error.message || 'Please try again',
        duration: 4000,
      });
      
      options.onError?.(error, orderId);
    },
  });
}

// =============================================================================
// DELETE ORDER (Optimistic with Confirmation)
// =============================================================================

interface DeleteInput {
  orderId: string;
  orderNumber?: string;
}

interface DeleteOptions {
  onOptimisticRemove?: (orderId: string) => void;
  onRollback?: (orderId: string) => void;
  onSuccess?: (orderId: string) => void;
  onError?: (error: Error, orderId: string) => void;
}

export function useOptimisticDelete(options: DeleteOptions = {}) {
  const toastIdRef = useRef<string | number | null>(null);

  return useOptimisticMutation<unknown, DeleteInput>({
    mutationFn: async ({ orderId }) => {
      const response = await apiClient.delete(`/orders/${orderId}`);
      return response.data;
    },

    onMutate: ({ orderId }) => {
      // Show optimistic toast
      toastIdRef.current = toast.loading('Deleting...');
      
      // Apply optimistic removal
      options.onOptimisticRemove?.(orderId);

      // Return rollback function
      return () => {
        options.onRollback?.(orderId);
      };
    },

    onSuccess: (_, { orderId, orderNumber }) => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      toast.success('Order deleted', {
        description: orderNumber ? `${orderNumber} has been deleted` : 'Order removed',
        duration: 2000,
      });
      
      options.onSuccess?.(orderId);
    },

    onError: (error, { orderId }) => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      toast.error('Failed to delete', {
        description: error.message || 'Please try again',
        duration: 4000,
      });
      
      options.onError?.(error, orderId);
    },
  });
}

// =============================================================================
// INVENTORY TRANSACTION APPROVE (Optimistic)
// =============================================================================

interface ApproveInput {
  transactionId: string;
  invoiceNo?: string;
}

interface ApproveOptions {
  onOptimisticApprove?: (transactionId: string) => void;
  onRollback?: (transactionId: string) => void;
  onSuccess?: (transactionId: string) => void;
  onError?: (error: Error, transactionId: string) => void;
}

export function useOptimisticApprove(options: ApproveOptions = {}) {
  const toastIdRef = useRef<string | number | null>(null);

  return useOptimisticMutation<unknown, ApproveInput>({
    mutationFn: async ({ transactionId }) => {
      const response = await apiClient.post(`/inventory/transactions/${transactionId}/approve`);
      return response.data;
    },

    onMutate: ({ transactionId }) => {
      toastIdRef.current = toast.loading('Approving transaction...');
      options.onOptimisticApprove?.(transactionId);

      return () => {
        options.onRollback?.(transactionId);
      };
    },

    onSuccess: (_, { transactionId, invoiceNo }) => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      toast.success('Transaction approved!', {
        description: invoiceNo ? `${invoiceNo} approved. Stock updated.` : 'Stock has been updated.',
        duration: 3000,
      });
      
      options.onSuccess?.(transactionId);
    },

    onError: (error, { transactionId }) => {
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      toast.error('Approval failed', {
        description: error.message || 'Please try again',
        duration: 4000,
      });
      
      options.onError?.(error, transactionId);
    },
  });
}

// =============================================================================
// QUICK STOCK UPDATE (Optimistic)
// =============================================================================

interface StockUpdateInput {
  variantId: string;
  quantity: number;
  type: 'increment' | 'decrement' | 'set';
  currentStock?: number;
}

interface StockUpdateOptions {
  onOptimisticUpdate?: (variantId: string, newStock: number) => void;
  onRollback?: (variantId: string, oldStock: number) => void;
  onSuccess?: (variantId: string, newStock: number) => void;
  onError?: (error: Error, variantId: string) => void;
}

export function useOptimisticStockUpdate(options: StockUpdateOptions = {}) {
  return useOptimisticMutation<unknown, StockUpdateInput>({
    mutationFn: async ({ variantId, quantity, type }) => {
      const response = await apiClient.patch(`/variants/${variantId}/stock`, {
        quantity,
        type,
      });
      return response.data;
    },

    onMutate: ({ variantId, quantity, type, currentStock = 0 }) => {
      let newStock: number;
      switch (type) {
        case 'increment':
          newStock = currentStock + quantity;
          break;
        case 'decrement':
          newStock = Math.max(0, currentStock - quantity);
          break;
        case 'set':
          newStock = quantity;
          break;
        default:
          newStock = currentStock;
      }
      
      options.onOptimisticUpdate?.(variantId, newStock);

      return () => {
        options.onRollback?.(variantId, currentStock);
      };
    },

    onSuccess: (_, { variantId, quantity, type, currentStock = 0 }) => {
      const newStock = type === 'set' 
        ? quantity 
        : type === 'increment' 
          ? currentStock + quantity 
          : Math.max(0, currentStock - quantity);
      
      toast.success('Stock updated', { duration: 1500 });
      options.onSuccess?.(variantId, newStock);
    },

    onError: (error, { variantId }) => {
      toast.error('Stock update failed', {
        description: error.message,
      });
      options.onError?.(error, variantId);
    },
  });
}

// =============================================================================
// EXPORT
// =============================================================================

export default {
  useOptimisticMutation,
  useOptimisticStatusUpdate,
  useOptimisticDelete,
  useOptimisticApprove,
  useOptimisticStockUpdate,
};
