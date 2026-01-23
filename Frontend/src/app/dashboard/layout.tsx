/**
 * Dashboard Layout
 * Wraps all dashboard pages with sidebar, header, and error boundary
 */

import DashboardLayout from '@/components/layouts/DashboardLayout';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { QueryProvider } from '@/lib/providers/QueryProvider';

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </QueryProvider>
    </ErrorBoundary>
  );
}
