/**
 * TanStack Query Client Configuration
 * 
 * Optimized for high-volume order management (100+ concurrent users)
 * 
 * Features:
 * - Smart caching with stale-while-revalidate
 * - Background refetching
 * - Error retry with exponential backoff
 * - Window focus refetching (disabled for performance)
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 30 seconds
      staleTime: 30 * 1000,
      
      // Cache data for 5 minutes
      gcTime: 5 * 60 * 1000,
      
      // Retry failed requests 2 times
      retry: 2,
      
      // Exponential backoff for retries
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      
      // Don't refetch on window focus (too aggressive for high-volume)
      refetchOnWindowFocus: false,
      
      // Don't refetch on reconnect automatically
      refetchOnReconnect: false,
      
      // Keep previous data while fetching new data (prevents flickering)
      placeholderData: (previousData: unknown) => previousData,
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
});

export default queryClient;
