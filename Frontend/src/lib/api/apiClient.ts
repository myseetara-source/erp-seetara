/**
 * API Client
 * Centralized axios instance for all API calls
 * Uses Supabase Auth tokens for authentication
 * 
 * PORT FIX: Uses smart baseURL detection to avoid ERR_CONNECTION_REFUSED
 * - Server Side: Uses absolute URL from env or localhost:3000
 * - Client Side: Uses relative '/api/v1' (auto-detects current port)
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { createClient } from '@/lib/supabase/client';

// =============================================================================
// SMART BASE URL DETECTION
// =============================================================================
// 
// Problem: Hardcoded http://localhost:3000 fails when app runs on port 3001
// 
// Solution:
// - Server Side (SSR): Use absolute URL (env var or fallback)
// - Client Side (Browser): Use relative path '/api/v1'
//   The browser will automatically prepend the current origin (http://localhost:3001)
//

/**
 * Get the appropriate base URL based on execution environment
 */
function getBaseURL(): string {
  // Server-side rendering (Node.js environment)
  if (typeof window === 'undefined') {
    // Use environment variable if set, otherwise fallback to localhost
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  }
  
  // Client-side (Browser)
  // Use relative path so browser automatically uses current origin/port
  // This works whether the app runs on 3000, 3001, 8080, or any port
  return '/api/v1';
}

// API Configuration
const API_BASE_URL = getBaseURL();
const API_TIMEOUT = 30000; // 30 seconds

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// =============================================================================
// REQUEST INTERCEPTOR
// =============================================================================
// Add Supabase auth token to all requests

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.access_token && config.headers) {
          config.headers.Authorization = `Bearer ${session.access_token}`;
        }
      } catch {
        // Auth session error - request will proceed without token
        // Server will return 401 if auth is required
      }
    }
    
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// =============================================================================
// RESPONSE INTERCEPTOR
// =============================================================================
// Handle errors globally

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response) {
      const { status } = error.response;
      
      switch (status) {
        case 401:
          // Unauthorized - sign out and redirect to login
          if (typeof window !== 'undefined') {
            try {
              const supabase = createClient();
              await supabase.auth.signOut();
            } catch {
              // Sign out failed - continue to redirect
            }
            // Redirect to login (skip if already on login page)
            if (!window.location.pathname.includes('/login')) {
              window.location.href = '/login';
            }
          }
          break;
        // Other error statuses are passed through to the caller
        // No console.log to avoid security leaks in production
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;

// Type definitions for API responses
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
