/**
 * Header Layout Group
 * 
 * Pages in this route group display the full dashboard layout
 * with sidebar AND top header bar.
 */

import DashboardLayout from '@/components/layouts/DashboardLayout';

export default function HeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout showHeader={true}>{children}</DashboardLayout>;
}
