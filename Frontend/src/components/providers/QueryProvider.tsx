'use client';

/**
 * TanStack Query Provider
 * Wraps the app with QueryClientProvider for server state management
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';
import { ReactNode, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Create a new QueryClient instance for each session to avoid sharing state
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={client}>
      {children}
      {/* Only show devtools in development */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom" />
      )}
    </QueryClientProvider>
  );
}

export default QueryProvider;
