'use client';

/**
 * PermissionGuard Component - JWT-Based Authorization
 * 
 * Uses the useAuth hook which reads role from JWT metadata (app_metadata.role)
 * No extra DB calls needed.
 * 
 * Usage:
 * 
 * 1. Hide content from non-admins:
 * <PermissionGuard requiredRole="admin">
 *   <CostPriceColumn />
 * </PermissionGuard>
 * 
 * 2. Show alternative content:
 * <PermissionGuard 
 *   requiredRole="admin" 
 *   fallback={<p>Access denied</p>}
 * >
 *   <FinancialDashboard />
 * </PermissionGuard>
 * 
 * 3. Check for financial access:
 * <PermissionGuard requireFinancials>
 *   <ProfitMarginDisplay />
 * </PermissionGuard>
 */

import { ReactNode } from 'react';
import { useAuth, UserRole } from '@/hooks/useAuth';

// =============================================================================
// RE-EXPORT TYPES FROM useAuth FOR CONVENIENCE
// =============================================================================

export type { UserRole, AuthUser } from '@/hooks/useAuth';
export { useAuth, useIsAdmin, useCanSeeFinancials, useUserRole, useIsVendor } from '@/hooks/useAuth';

// =============================================================================
// PERMISSION CONFIGURATION
// =============================================================================

/**
 * Roles that can see financial data (cost prices, profits, vendor balances)
 */
export const FINANCIAL_ROLES: UserRole[] = ['admin', 'manager'];

/**
 * Roles that can manage vendors (create, edit, delete)
 */
export const VENDOR_MANAGEMENT_ROLES: UserRole[] = ['admin'];

/**
 * Roles that can make payments
 */
export const PAYMENT_ROLES: UserRole[] = ['admin'];

/**
 * Roles that can view reports
 */
export const REPORT_ROLES: UserRole[] = ['admin', 'manager'];

/**
 * Operational roles that can do daily work but not see financials
 */
export const OPERATIONAL_ROLES: UserRole[] = ['operator', 'staff', 'warehouse'];

// =============================================================================
// PERMISSION GUARD COMPONENT
// =============================================================================

interface PermissionGuardProps {
  children: ReactNode;
  
  /** Required role(s) to view content */
  requiredRole?: UserRole | UserRole[];
  
  /** Check if user can see financials */
  requireFinancials?: boolean;
  
  /** Check if specific data exists (for masked data) */
  hasData?: boolean;
  
  /** Fallback content when access denied */
  fallback?: ReactNode;
  
  /** Invert the check (show when NOT authorized) */
  invert?: boolean;
  
  /** Show loading state while auth is loading */
  showLoading?: boolean;
}

/**
 * PermissionGuard - Conditionally render content based on user permissions
 */
export function PermissionGuard({
  children,
  requiredRole,
  requireFinancials = false,
  hasData,
  fallback = null,
  invert = false,
  showLoading = false,
}: PermissionGuardProps) {
  const { user, loading, hasRole, canSeeFinancials } = useAuth();

  // Show nothing while loading (prevents flash of content)
  if (loading) {
    return showLoading ? <>{fallback}</> : null;
  }

  // Check if user has access
  let hasAccess = true;

  // Role-based check
  if (requiredRole) {
    hasAccess = hasRole(requiredRole);
  }

  // Financial access check
  if (requireFinancials) {
    hasAccess = hasAccess && canSeeFinancials;
  }

  // Data existence check (for masked data)
  if (hasData !== undefined) {
    hasAccess = hasAccess && hasData;
  }

  // Invert if needed
  if (invert) {
    hasAccess = !hasAccess;
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// =============================================================================
// SPECIALIZED GUARDS
// =============================================================================

/**
 * AdminOnly - Only renders for admin users
 */
export function AdminOnly({ 
  children, 
  fallback 
}: { 
  children: ReactNode; 
  fallback?: ReactNode;
}) {
  return (
    <PermissionGuard requiredRole="admin" fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

/**
 * FinancialsOnly - Only renders for users who can see financial data
 */
export function FinancialsOnly({ 
  children, 
  fallback 
}: { 
  children: ReactNode; 
  fallback?: ReactNode;
}) {
  return (
    <PermissionGuard requireFinancials fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

/**
 * HideFromStaff - Hides content from operational staff
 */
export function HideFromStaff({ 
  children 
}: { 
  children: ReactNode;
}) {
  return (
    <PermissionGuard requiredRole={FINANCIAL_ROLES}>
      {children}
    </PermissionGuard>
  );
}

/**
 * ShowIfDataExists - Only renders if the data field exists
 * Used for conditionally rendering masked data
 * 
 * @example
 * <ShowIfDataExists data={vendor.balance}>
 *   <span>Balance: Rs. {vendor.balance}</span>
 * </ShowIfDataExists>
 */
export function ShowIfDataExists<T>({ 
  data, 
  children 
}: { 
  data: T | undefined | null; 
  children: ReactNode;
}) {
  const exists = data !== undefined && data !== null;
  return exists ? <>{children}</> : null;
}

// =============================================================================
// HIGHER-ORDER COMPONENT
// =============================================================================

/**
 * withPermission HOC - Wraps a component with permission check
 * 
 * @example
 * const AdminDashboard = withPermission(Dashboard, 'admin');
 */
export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  requiredRole: UserRole | UserRole[],
  fallback?: ReactNode
) {
  return function PermissionWrapper(props: P) {
    return (
      <PermissionGuard requiredRole={requiredRole} fallback={fallback}>
        <Component {...props} />
      </PermissionGuard>
    );
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default PermissionGuard;
