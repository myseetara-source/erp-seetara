/**
 * Headerless Layout Group
 * 
 * Pages in this route group display the dashboard layout
 * with sidebar only - NO top header bar (focus mode).
 * Ideal for pages that need maximum vertical space.
 */

import DashboardLayout from '@/components/layouts/DashboardLayout';

export default function HeaderlessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout showHeader={false}>{children}</DashboardLayout>;
}