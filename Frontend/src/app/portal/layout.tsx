/**
 * Vendor Portal Layout
 * 
 * ISOLATED FROM MAIN APP
 * - Different styling (emerald/teal theme vs orange)
 * - No sidebar (clean, minimal)
 * - View-only purpose
 */

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vendor Portal - Today Trend',
  description: 'Vendor portal for Today Trend / Seetara suppliers',
  robots: 'noindex, nofollow', // Don't index portal pages
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
