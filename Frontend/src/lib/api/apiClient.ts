/**
 * API Client
 * Centralized axios instance for all API calls
 * Uses Supabase Auth tokens for authentication
 * 
 * FEATURES:
 * - Smart baseURL detection (auto-detects port)
 * - Exponential backoff retry for 429/5xx errors
 * - Request deduplication to prevent duplicate calls
 * - Auth token injection
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { createClient } from '@/lib/supabase/client';

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2; // Reduced from 3 to minimize retry spam
const INITIAL_RETRY_DELAY = 2000; // Increased from 1s to 2s

// =============================================================================
// SMART BASE URL DETECTION
// =============================================================================

function getBaseURL(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  }
  return '/api/v1';
}

const API_BASE_URL = getBaseURL();

// =============================================================================
// REQUEST DEDUPLICATION
// =============================================================================
// Prevents duplicate requests from firing simultaneously

interface PendingRequest {
  promise: Promise<AxiosResponse>;
  timestamp: number;
}

const pendingRequests = new Map<string, PendingRequest>();
const DEDUP_WINDOW_MS = 100; // Deduplicate requests within 100ms

function getRequestKey(config: InternalAxiosRequestConfig): string {
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${config.method}:${config.url}:${params}`;
}

// =============================================================================
// AXIOS INSTANCE
// =============================================================================

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// =============================================================================
// EXPONENTIAL BACKOFF RETRY
// =============================================================================

interface RetryConfig {
  retryCount?: number;
  skipRetry?: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retryCount = 0
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    
    // Retry on 429 (Rate Limit) or 5xx (Server Error)
    const shouldRetry = status === 429 || (status && status >= 500);
    
    if (shouldRetry && retryCount < MAX_RETRIES) {
      // Exponential backoff: 1s, 2s, 4s
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 500;
      
      console.warn(`[API] Retry ${retryCount + 1}/${MAX_RETRIES} after ${delay + jitter}ms (status: ${status})`);
      
      await sleep(delay + jitter);
      return retryWithBackoff(fn, retryCount + 1);
    }
    
    throw error;
  }
}

// =============================================================================
// REQUEST INTERCEPTOR
// =============================================================================

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Debug log for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, {
        params: config.params,
      });
    }
    
    // Add auth token
    if (typeof window !== 'undefined') {
      let token: string | null = null;
      
      // P0 FIX: Check for custom JWT tokens first (Rider/Vendor portals)
      // These portals use localStorage tokens instead of Supabase Auth
      const riderToken = localStorage.getItem('rider_token');
      const portalToken = localStorage.getItem('portal_token');
      
      if (riderToken) {
        token = riderToken;
      } else if (portalToken) {
        token = portalToken;
      } else {
        // Fallback to Supabase Auth token (Dashboard users)
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session?.access_token) {
            token = session.access_token;
          }
        } catch {
          // Auth error - continue without token
          console.warn('[API] Could not get auth token');
        }
      }
      
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// =============================================================================
// RESPONSE INTERCEPTOR WITH RETRY
// =============================================================================

apiClient.interceptors.response.use(
  (response) => {
    // Debug log for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[API] Response ${response.status}`, {
        url: response.config.url,
        dataKeys: response.data ? Object.keys(response.data) : [],
        success: response.data?.success,
        dataLength: Array.isArray(response.data?.data) ? response.data.data.length : undefined,
      });
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & RetryConfig;
    
    if (!config || config.skipRetry) {
      return Promise.reject(error);
    }
    
    const status = error.response?.status;
    
    // P0 FIX: DO NOT retry 429 (Rate Limited) - respect the rate limit!
    // Retrying 429 errors makes the problem worse and floods the server
    if (status === 429) {
      console.warn(`[API] Rate limited (429). NOT retrying. Please wait before making more requests.`);
      // Don't retry - just reject immediately
      return Promise.reject(error);
    }
    
    // Handle 5xx server errors with retry (but not 429)
    if (status && status >= 500 && status < 600) {
      const retryCount = config.retryCount || 0;
      
      if (retryCount < MAX_RETRIES) {
        config.retryCount = retryCount + 1;
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        
        console.warn(`[API] Server error ${status}. Retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms`);
        
        await sleep(delay);
        return apiClient.request(config);
      }
    }
    
    // Handle 401 Unauthorized
    if (status === 401) {
      if (typeof window !== 'undefined') {
        const isRiderPortal = window.location.pathname.includes('/portal/rider');
        const isVendorPortal = window.location.pathname.includes('/portal/vendor');
        
        // Clear appropriate tokens based on portal
        if (isRiderPortal) {
          localStorage.removeItem('rider_token');
          localStorage.removeItem('rider_user');
          document.cookie = 'rider_token=; path=/; max-age=0';
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/portal/rider/login';
          }
        } else if (isVendorPortal) {
          localStorage.removeItem('portal_token');
          localStorage.removeItem('portal_user');
          document.cookie = 'portal_token=; path=/; max-age=0';
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/portal/vendor/login';
          }
        } else {
          // Dashboard users - use Supabase signout
          try {
            const supabase = createClient();
            await supabase.auth.signOut();
          } catch {
            // Sign out failed
          }
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        }
      }
    }
    
    // Handle 404 Not Found - log helpful debug info
    if (status === 404) {
      console.error('[API] 404 Not Found:', {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        fullURL: `${error.config?.baseURL}${error.config?.url}`,
        message: 'Check if backend server is running on port 3000',
      });
    }
    
    return Promise.reject(error);
  }
);

// =============================================================================
// WRAPPED API METHODS WITH DEDUPLICATION
// =============================================================================

/**
 * GET request with deduplication
 * Prevents duplicate simultaneous requests to the same endpoint
 */
export async function apiGet<T = unknown>(
  url: string, 
  config?: { params?: Record<string, unknown>; skipDedup?: boolean }
): Promise<AxiosResponse<T>> {
  const requestKey = `GET:${url}:${JSON.stringify(config?.params || {})}`;
  
  // Check for pending duplicate request
  if (!config?.skipDedup) {
    const pending = pendingRequests.get(requestKey);
    if (pending && Date.now() - pending.timestamp < DEDUP_WINDOW_MS) {
      return pending.promise as Promise<AxiosResponse<T>>;
    }
  }
  
  // Create new request
  const promise = apiClient.get<T>(url, config);
  
  // Store for deduplication
  pendingRequests.set(requestKey, {
    promise: promise as Promise<AxiosResponse>,
    timestamp: Date.now(),
  });
  
  // Clean up after request completes
  promise.finally(() => {
    setTimeout(() => pendingRequests.delete(requestKey), DEDUP_WINDOW_MS);
  });
  
  return promise;
}

/**
 * POST request (no deduplication - mutations should always execute)
 */
export async function apiPost<T = unknown>(
  url: string,
  data?: unknown,
  config?: Record<string, unknown>
): Promise<AxiosResponse<T>> {
  return apiClient.post<T>(url, data, config);
}

/**
 * PUT request
 */
export async function apiPut<T = unknown>(
  url: string,
  data?: unknown,
  config?: Record<string, unknown>
): Promise<AxiosResponse<T>> {
  return apiClient.put<T>(url, data, config);
}

/**
 * DELETE request
 */
export async function apiDelete<T = unknown>(
  url: string,
  config?: Record<string, unknown>
): Promise<AxiosResponse<T>> {
  return apiClient.delete<T>(url, config);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default apiClient;

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// =============================================================================
// USER-FRIENDLY ERROR EXTRACTION
// =============================================================================

/**
 * Extract a user-friendly error message from an API error
 * Use this in UI components to show meaningful error messages
 * 
 * @example
 * try {
 *   await createPurchase(data);
 * } catch (error) {
 *   toast.error(getErrorMessage(error));
 * }
 */
export function getErrorMessage(error: unknown): string {
  // Handle Axios errors
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ message?: string; error?: string }>;
    const status = axiosError.response?.status;
    const data = axiosError.response?.data;
    
    // Extract message from backend response
    if (data?.message) {
      return data.message;
    }
    if (data?.error) {
      return data.error;
    }
    
    // Provide user-friendly messages for common errors
    switch (status) {
      case 400:
        return 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Session expired. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 409:
        return 'A conflict occurred. This record may already exist.';
      case 422:
        return 'Validation failed. Please check your input.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'An internal server error occurred. Please try again later.';
      case 502:
      case 503:
      case 504:
        return 'Server is temporarily unavailable. Please try again later.';
      default:
        return axiosError.message || 'An unexpected error occurred.';
    }
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message;
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }
  
  // Fallback
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Check if an error is a specific HTTP status
 */
export function isHttpError(error: unknown, status: number): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === status;
  }
  return false;
}
