/**
 * Dashboard Root Layout
 * 
 * Provides shared providers and error boundary for all dashboard pages.
 * The actual layout (sidebar + optional header) is handled by route groups:
 * - (header)   → DashboardLayout with header visible
 * - (headerless) → DashboardLayout without header (focus mode)
 */

import ErrorBoundary from '@/components/common/ErrorBoundary';
import { QueryProvider } from '@/lib/providers/QueryProvider';

export default function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <QueryProvider>
        {children}
      </QueryProvider>
    </ErrorBoundary>
  );
}
