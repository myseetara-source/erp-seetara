/**
 * Error Utilities
 * Type-safe error handling utilities for the frontend
 * 
 * Usage:
 * ```typescript
 * try {
 *   await someAsyncOperation();
 * } catch (err: unknown) {
 *   const message = getErrorMessage(err);
 *   setError(message);
 * }
 * ```
 */

/**
 * Safely extract error message from unknown error type
 * Handles Error instances, strings, and API error responses
 * 
 * @param error - Unknown error from catch block
 * @returns Human-readable error message
 */
export function getErrorMessage(error: unknown): string {
  // Handle Error instances
  if (error instanceof Error) {
    return error.message;
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }
  
  // Handle API error responses (common in axios)
  if (isApiError(error)) {
    return error.response?.data?.message || 
           error.response?.data?.error?.message ||
           error.message ||
           'An API error occurred';
  }
  
  // Handle objects with message property
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  
  // Default fallback
  return 'An unexpected error occurred';
}

/**
 * API Error interface for axios-like errors
 */
interface ApiError {
  message?: string;
  response?: {
    data?: {
      message?: string;
      error?: {
        message?: string;
        code?: string;
      };
    };
    status?: number;
  };
}

/**
 * Type guard for API errors
 */
function isApiError(error: unknown): error is ApiError {
  return (
    error !== null &&
    typeof error === 'object' &&
    ('response' in error || 'message' in error)
  );
}

/**
 * Check if error is a network error (no response from server)
 */
export function isNetworkError(error: unknown): boolean {
  if (isApiError(error)) {
    return !error.response && !!error.message;
  }
  return false;
}

/**
 * Check if error is an authentication error (401)
 */
export function isAuthError(error: unknown): boolean {
  if (isApiError(error)) {
    return error.response?.status === 401;
  }
  return false;
}

/**
 * Check if error is a forbidden error (403)
 */
export function isForbiddenError(error: unknown): boolean {
  if (isApiError(error)) {
    return error.response?.status === 403;
  }
  return false;
}

/**
 * Check if error is a not found error (404)
 */
export function isNotFoundError(error: unknown): boolean {
  if (isApiError(error)) {
    return error.response?.status === 404;
  }
  return false;
}

/**
 * Check if error is a validation error (400)
 */
export function isValidationError(error: unknown): boolean {
  if (isApiError(error)) {
    return error.response?.status === 400;
  }
  return false;
}

/**
 * Check if error is a server error (5xx)
 */
export function isServerError(error: unknown): boolean {
  if (isApiError(error)) {
    const status = error.response?.status;
    return status !== undefined && status >= 500 && status < 600;
  }
  return false;
}

/**
 * Get appropriate user-facing message based on error type
 * More user-friendly than raw error messages
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Unable to connect to server. Please check your internet connection.';
  }
  
  if (isAuthError(error)) {
    return 'Your session has expired. Please log in again.';
  }
  
  if (isForbiddenError(error)) {
    return 'You do not have permission to perform this action.';
  }
  
  if (isNotFoundError(error)) {
    return 'The requested resource was not found.';
  }
  
  if (isServerError(error)) {
    return 'Server error. Please try again later or contact support.';
  }
  
  if (isValidationError(error)) {
    return getErrorMessage(error);
  }
  
  return getErrorMessage(error);
}
