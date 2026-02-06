/**
 * Centralized Error Handling Utilities
 * 
 * Sprint 1 Foundation: Standardized error handling across the application.
 * 
 * Features:
 * - Type-safe error message extraction
 * - Async operation wrapper with automatic toast notifications
 * - API error response parsing
 * - Error logging with context
 * 
 * @author Code Quality Team
 * @priority P0 - Sprint 1 Foundation
 */

import { toast } from 'sonner';
import { AxiosError } from 'axios';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Standard API error response structure
 */
export interface ApiErrorResponse {
  message: string;
  code?: string;
  status?: number;
  errors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}

/**
 * Options for error handling
 */
export interface ErrorHandlingOptions {
  /** Custom error message to show (overrides API message) */
  errorMessage?: string;
  /** Whether to show a toast notification (default: true) */
  showToast?: boolean;
  /** Whether to log error to console (default: true) */
  logError?: boolean;
  /** Additional context for logging */
  context?: string;
  /** Callback to execute on error */
  onError?: (error: unknown) => void;
}

/**
 * Options for withErrorHandling wrapper
 */
export interface WithErrorHandlingOptions<T> extends ErrorHandlingOptions {
  /** Message to show on success */
  successMessage?: string;
  /** Whether to show success toast (default: false) */
  showSuccessToast?: boolean;
  /** Callback to execute on success */
  onSuccess?: (data: T) => void;
  /** Default value to return on error (instead of null) */
  fallbackValue?: T;
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E; message: string };

// =============================================================================
// ERROR MESSAGE EXTRACTION
// =============================================================================

/**
 * Safely extracts an error message from any error type.
 * Handles Axios errors, standard errors, strings, and unknown objects.
 * 
 * @param error - The error to extract message from
 * @returns A user-friendly error message string
 * 
 * @example
 * ```ts
 * try {
 *   await api.createOrder(data);
 * } catch (error) {
 *   const message = getErrorMessage(error);
 *   toast.error(message);
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  // Handle null/undefined
  if (error === null || error === undefined) {
    return 'An unexpected error occurred';
  }

  // Handle Axios errors (most common in our app)
  if (isAxiosError(error)) {
    return extractAxiosErrorMessage(error);
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message || 'An error occurred';
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Handle objects with message property
  if (isObjectWithMessage(error)) {
    return String(error.message);
  }

  // Handle objects with error property
  if (isObjectWithError(error)) {
    return getErrorMessage(error.error);
  }

  // Fallback for unknown error types
  return 'An unexpected error occurred';
}

/**
 * Extracts error message from Axios error response
 */
function extractAxiosErrorMessage(error: AxiosError<ApiErrorResponse>): string {
  // Network errors (no response)
  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }
    if (error.code === 'ERR_NETWORK') {
      return 'Network error. Please check your connection.';
    }
    return 'Unable to connect to the server. Please try again.';
  }

  const { status, data } = error.response;

  // Try to get message from response data
  if (data?.message) {
    return data.message;
  }

  // Handle validation errors
  if (data?.errors) {
    const firstError = Object.values(data.errors)[0];
    if (Array.isArray(firstError) && firstError.length > 0) {
      return firstError[0];
    }
  }

  // Fallback to status-based messages
  return getStatusMessage(status);
}

/**
 * Returns a user-friendly message based on HTTP status code
 */
function getStatusMessage(status: number): string {
  const statusMessages: Record<number, string> = {
    400: 'Invalid request. Please check your input.',
    401: 'Session expired. Please log in again.',
    403: 'You don\'t have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'This action conflicts with existing data.',
    422: 'Validation failed. Please check your input.',
    429: 'Too many requests. Please wait a moment.',
    500: 'Server error. Please try again later.',
    502: 'Server is temporarily unavailable.',
    503: 'Service is under maintenance. Please try again later.',
    504: 'Request timed out. Please try again.',
  };

  return statusMessages[status] || `Request failed with status ${status}`;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for Axios errors
 */
export function isAxiosError(error: unknown): error is AxiosError<ApiErrorResponse> {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

/**
 * Type guard for objects with message property
 */
function isObjectWithMessage(error: unknown): error is { message: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  );
}

/**
 * Type guard for objects with error property
 */
function isObjectWithError(error: unknown): error is { error: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error
  );
}

/**
 * Type guard for API error response
 */
export function isApiErrorResponse(data: unknown): data is ApiErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof (data as ApiErrorResponse).message === 'string'
  );
}

// =============================================================================
// ERROR HANDLING WRAPPER
// =============================================================================

/**
 * Wraps an async operation with standardized error handling.
 * Automatically shows toast notifications and logs errors.
 * 
 * @param operation - The async operation to execute
 * @param options - Error handling options
 * @returns The operation result or null/fallbackValue on error
 * 
 * @example
 * ```ts
 * // Basic usage
 * const order = await withErrorHandling(
 *   () => api.createOrder(data),
 *   { successMessage: 'Order created!' }
 * );
 * 
 * // With custom error handling
 * const result = await withErrorHandling(
 *   () => api.updateStatus(id, status),
 *   {
 *     errorMessage: 'Failed to update order status',
 *     onError: (error) => analytics.track('order_update_failed', { error }),
 *     onSuccess: (data) => queryClient.invalidateQueries(['orders']),
 *   }
 * );
 * ```
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options: WithErrorHandlingOptions<T> = {}
): Promise<T | null> {
  const {
    errorMessage,
    successMessage,
    showToast = true,
    showSuccessToast = false,
    logError = true,
    context,
    onError,
    onSuccess,
    fallbackValue,
  } = options;

  try {
    const result = await operation();
    
    // Show success toast if configured
    if (showSuccessToast && successMessage) {
      toast.success(successMessage);
    }
    
    // Call success callback
    onSuccess?.(result);
    
    return result;
  } catch (error) {
    // Extract error message
    const message = errorMessage || getErrorMessage(error);
    
    // Log error with context
    if (logError) {
      const logContext = context ? `[${context}]` : '';
      console.error(`${logContext} Error:`, message, error);
    }
    
    // Show toast notification
    if (showToast) {
      toast.error(message);
    }
    
    // Call error callback
    onError?.(error);
    
    // Return fallback value or null
    return fallbackValue !== undefined ? fallbackValue : null;
  }
}

/**
 * Similar to withErrorHandling but returns a Result type for more explicit error handling.
 * Useful when you need to handle errors in the calling code.
 * 
 * @example
 * ```ts
 * const result = await tryAsync(() => api.getOrder(id));
 * 
 * if (result.success) {
 *   setOrder(result.data);
 * } else {
 *   setError(result.message);
 * }
 * ```
 */
export async function tryAsync<T>(
  operation: () => Promise<T>,
  options: ErrorHandlingOptions = {}
): Promise<Result<T>> {
  const { logError = true, context } = options;

  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const message = options.errorMessage || getErrorMessage(error);
    
    if (logError) {
      const logContext = context ? `[${context}]` : '';
      console.error(`${logContext} Error:`, message, error);
    }
    
    return {
      success: false,
      error: error instanceof Error ? error : new Error(message),
      message,
    };
  }
}

// =============================================================================
// SPECIALIZED ERROR HANDLERS
// =============================================================================

/**
 * Handle form submission errors with field-level error extraction.
 * Useful for setting form errors from API validation responses.
 * 
 * @example
 * ```ts
 * try {
 *   await api.createProduct(data);
 * } catch (error) {
 *   const errors = handleFormError(error);
 *   if (errors.fieldErrors) {
 *     Object.entries(errors.fieldErrors).forEach(([field, messages]) => {
 *       form.setError(field, { message: messages[0] });
 *     });
 *   }
 * }
 * ```
 */
export function handleFormError(error: unknown): {
  message: string;
  fieldErrors?: Record<string, string[]>;
} {
  if (isAxiosError(error) && error.response?.data?.errors) {
    return {
      message: getErrorMessage(error),
      fieldErrors: error.response.data.errors,
    };
  }
  
  return { message: getErrorMessage(error) };
}

/**
 * Check if error is a specific HTTP status
 */
export function isHttpError(error: unknown, status: number): boolean {
  return isAxiosError(error) && error.response?.status === status;
}

/**
 * Check if error is an authentication error (401)
 */
export function isAuthError(error: unknown): boolean {
  return isHttpError(error, 401);
}

/**
 * Check if error is a permission error (403)
 */
export function isPermissionError(error: unknown): boolean {
  return isHttpError(error, 403);
}

/**
 * Check if error is a validation error (400 or 422)
 */
export function isValidationError(error: unknown): boolean {
  return isHttpError(error, 400) || isHttpError(error, 422);
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  return isAxiosError(error) && !error.response;
}

// =============================================================================
// ERROR LOGGING
// =============================================================================

/**
 * Log error with structured context for debugging.
 * In production, this could send to an error tracking service.
 * 
 * @example
 * ```ts
 * logError(error, {
 *   component: 'OrderTable',
 *   action: 'updateStatus',
 *   orderId: '123',
 * });
 * ```
 */
export function logError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorInfo = {
    message: getErrorMessage(error),
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error]', errorInfo, error);
  } else {
    // In production, send to error tracking service
    // Example: Sentry.captureException(error, { extra: errorInfo });
    console.error('[Error]', errorInfo);
  }
}

// =============================================================================
// TOAST HELPERS
// =============================================================================

/**
 * Show error toast with consistent styling
 */
export function showErrorToast(error: unknown, customMessage?: string): void {
  const message = customMessage || getErrorMessage(error);
  toast.error(message);
}

/**
 * Show success toast with consistent styling
 */
export function showSuccessToast(message: string): void {
  toast.success(message);
}

/**
 * Show loading toast that can be updated
 */
export function showLoadingToast(message: string): string | number {
  return toast.loading(message);
}

/**
 * Update a toast (loading -> success/error)
 */
export function updateToast(
  toastId: string | number,
  type: 'success' | 'error',
  message: string
): void {
  toast.dismiss(toastId);
  if (type === 'success') {
    toast.success(message);
  } else {
    toast.error(message);
  }
}

// =============================================================================
// ASYNC OPERATION WITH LOADING STATE
// =============================================================================

/**
 * Execute an async operation with loading toast and automatic success/error handling.
 * Perfect for mutations that need user feedback.
 * 
 * @example
 * ```ts
 * await executeWithFeedback(
 *   () => api.deleteOrder(id),
 *   {
 *     loadingMessage: 'Deleting order...',
 *     successMessage: 'Order deleted successfully',
 *     errorMessage: 'Failed to delete order',
 *   }
 * );
 * ```
 */
export async function executeWithFeedback<T>(
  operation: () => Promise<T>,
  options: {
    loadingMessage: string;
    successMessage: string;
    errorMessage?: string;
    onSuccess?: (data: T) => void;
    onError?: (error: unknown) => void;
  }
): Promise<T | null> {
  const toastId = toast.loading(options.loadingMessage);
  
  try {
    const result = await operation();
    toast.success(options.successMessage, { id: toastId });
    options.onSuccess?.(result);
    return result;
  } catch (error) {
    const message = options.errorMessage || getErrorMessage(error);
    toast.error(message, { id: toastId });
    options.onError?.(error);
    console.error(`[Error] ${options.loadingMessage}:`, error);
    return null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getErrorMessage,
  withErrorHandling,
  tryAsync,
  handleFormError,
  isAxiosError,
  isHttpError,
  isAuthError,
  isPermissionError,
  isValidationError,
  isNetworkError,
  logError,
  showErrorToast,
  showSuccessToast,
  showLoadingToast,
  updateToast,
  executeWithFeedback,
};
