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
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

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
    // Add auth token
    if (typeof window !== 'undefined') {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.access_token && config.headers) {
          config.headers.Authorization = `Bearer ${session.access_token}`;
        }
      } catch {
        // Auth error - continue without token
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
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & RetryConfig;
    
    if (!config || config.skipRetry) {
      return Promise.reject(error);
    }
    
    const status = error.response?.status;
    
    // Handle 429 Too Many Requests with retry
    if (status === 429) {
      const retryCount = config.retryCount || 0;
      
      if (retryCount < MAX_RETRIES) {
        config.retryCount = retryCount + 1;
        
        // Exponential backoff with jitter
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        const jitter = Math.random() * 500;
        
        console.warn(`[API] Rate limited. Retry ${retryCount + 1}/${MAX_RETRIES} in ${Math.round(delay + jitter)}ms`);
        
        await sleep(delay + jitter);
        return apiClient.request(config);
      }
    }
    
    // Handle 5xx server errors with retry
    if (status && status >= 500 && status < 600) {
      const retryCount = config.retryCount || 0;
      
      if (retryCount < MAX_RETRIES) {
        config.retryCount = retryCount + 1;
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        
        console.warn(`[API] Server error ${status}. Retry ${retryCount + 1}/${MAX_RETRIES}`);
        
        await sleep(delay);
        return apiClient.request(config);
      }
    }
    
    // Handle 401 Unauthorized
    if (status === 401) {
      if (typeof window !== 'undefined') {
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
