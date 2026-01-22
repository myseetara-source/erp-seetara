'use client';

/**
 * Vendor Management Page - Role-Based UI (JWT-Based Auth)
 * 
 * ARCHITECTURE:
 * - Role is read from session.user.app_metadata.role (synced by trigger)
 * - No extra DB call needed
 * - Zero UI flickering
 * 
 * Traffic Control:
 * - Admin: VendorMasterView (Split-view with payments, portal access, ledger)
 * - Vendor: VendorPortal (Self-service view of their own data)
 * - Staff: VendorSimpleList (Read-only table view)
 */

import { Suspense } from 'react';
import { Loader2, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
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
// VENDOR PORTAL (For Vendor Role Users)
// =============================================================================

function VendorPortalView() {
  const { user } = useAuth();
  
  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-8 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Vendor Portal</h1>
              <p className="text-orange-100">Welcome back, {user?.name}</p>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">--</p>
              <p className="text-sm text-gray-500">Total Orders</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">--</p>
              <p className="text-sm text-gray-500">Pending Payments</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-600">--</p>
              <p className="text-sm text-gray-500">Current Balance</p>
            </div>
          </div>
          
          <div className="text-center text-gray-500 py-8">
            <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">Vendor Portal Coming Soon</h3>
            <p className="text-sm">
              This self-service portal will allow you to view your transactions, 
              download statements, and track payments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ROLE-BASED VIEW SWITCHER
// =============================================================================

function VendorPageContent() {
  const { user, loading, isAdmin, isVendor } = useAuth();

  // Still loading auth state
  if (loading) {
    return <LoadingState />;
  }

  // Vendor users see their own portal
  if (isVendor) {
    return (
      <Suspense fallback={<LoadingState />}>
        <VendorPortalView />
      </Suspense>
    );
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
