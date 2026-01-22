'use client';

/**
 * Vendor Management Page - Role-Based UI
 * 
 * Traffic Control:
 * - Admin: VendorMasterView (Split-view with payments, portal access, ledger)
 * - Staff: VendorSimpleList (Read-only table view)
 */

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth, useIsAdmin } from '@/components/auth/PermissionGuard';
import VendorMasterView from '@/components/vendors/VendorMasterView';
import VendorSimpleList from '@/components/vendors/VendorSimpleList';

// =============================================================================
// LOADING COMPONENT
// =============================================================================

function LoadingState() {
  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading vendors...</p>
      </div>
    </div>
  );
}

// =============================================================================
// ROLE-BASED VIEW SWITCHER
// =============================================================================

function VendorPageContent() {
  const { loading } = useAuth();
  const isAdmin = useIsAdmin();

  // Still loading auth state
  if (loading) {
    return <LoadingState />;
  }

  // Admin/Manager gets the full Master-Detail view
  if (isAdmin) {
    return (
      <Suspense fallback={<LoadingState />}>
        <VendorMasterView />
      </Suspense>
    );
  }

  // Staff gets the simple read-only list
  return <VendorSimpleList />;
}

// =============================================================================
// MAIN PAGE EXPORT
// =============================================================================

export default function VendorsPage() {
  return <VendorPageContent />;
}
