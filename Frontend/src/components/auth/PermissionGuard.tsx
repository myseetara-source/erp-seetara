'use client';

/**
 * PermissionGuard Component
 * 
 * SECURITY: Implements "Operational vs. Financial" separation in the UI.
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
 * 3. Check if data exists (for masked data):
 * <PermissionGuard hasData={vendor.balance !== undefined}>
 *   <VendorBalance value={vendor.balance} />
 * </PermissionGuard>
 */

import { ReactNode, createContext, useContext, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type UserRole = 'admin' | 'manager' | 'operator' | 'staff' | 'warehouse' | 'rider' | 'vendor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isManager: boolean;
  canSeeFinancials: boolean;
  canManageVendors: boolean;
  canMakePayments: boolean;
  hasRole: (role: UserRole | UserRole[]) => boolean;
}

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
// AUTH CONTEXT
// =============================================================================

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Hook to access authentication context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (!context) {
    // Return default context for SSR or when not wrapped in provider
    // loading: true because user data hasn't been fetched yet
    return {
      user: null,
      loading: true,
      isAuthenticated: false,
      isAdmin: false,
      isManager: false,
      canSeeFinancials: false,
      canManageVendors: false,
      canMakePayments: false,
      hasRole: () => false,
    };
  }
  
  return context;
}

/**
 * AuthProvider - Wraps app to provide auth context
 */
export function AuthProvider({ 
  children, 
  user 
}: { 
  children: ReactNode; 
  user: User | null;
}) {
  const value = useMemo<AuthContextType>(() => {
    const role = user?.role;
    // loading is false once we have user data (or null after fetch)
    // Since parent passes user after fetch, user being explicitly passed means loading is done
    const loading = false; // Parent (DashboardLayout) only renders children after fetching user
    
    return {
      user,
      loading,
      isAuthenticated: !!user,
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      canSeeFinancials: FINANCIAL_ROLES.includes(role as UserRole),
      canManageVendors: VENDOR_MANAGEMENT_ROLES.includes(role as UserRole),
      canMakePayments: PAYMENT_ROLES.includes(role as UserRole),
      hasRole: (requiredRole) => {
        if (!role) return false;
        if (Array.isArray(requiredRole)) {
          return requiredRole.includes(role as UserRole);
        }
        return role === requiredRole;
      },
    };
  }, [user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

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
}: PermissionGuardProps) {
  const auth = useAuth();

  // Check if user has access
  let hasAccess = true;

  // Role-based check
  if (requiredRole) {
    hasAccess = auth.hasRole(requiredRole);
  }

  // Financial access check
  if (requireFinancials) {
    hasAccess = hasAccess && auth.canSeeFinancials;
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
// UTILITY HOOKS
// =============================================================================

/**
 * Hook to check if current user can see financial data
 */
export function useCanSeeFinancials(): boolean {
  const { canSeeFinancials } = useAuth();
  return canSeeFinancials;
}

/**
 * Hook to check if current user is admin
 */
export function useIsAdmin(): boolean {
  const { isAdmin } = useAuth();
  return isAdmin;
}

/**
 * Hook to get current user's role
 */
export function useUserRole(): UserRole | null {
  const { user } = useAuth();
  return user?.role || null;
}

/**
 * Hook to check if data should be displayed (for masked data handling)
 * Returns true if user can see financials OR if data is explicitly provided
 */
export function useShowFinancialData(data: unknown): boolean {
  const { canSeeFinancials } = useAuth();
  
  // If user can see financials, always show
  if (canSeeFinancials) return true;
  
  // If user can't see financials, only show if data was provided by API
  // (This means the backend decided this user should see it)
  return data !== undefined && data !== null;
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
