/**
 * useAuth Hook - JWT-Based Authentication
 * 
 * ARCHITECTURE:
 * - Primary: Read role from session.user.app_metadata.role (synced from public.users)
 * - Fallback: Read from user_metadata.role (for backward compatibility)
 * - Last Resort: Query public.users (only if metadata is missing)
 * 
 * BENEFITS:
 * ✅ No extra DB call after login
 * ✅ No UI flickering
 * ✅ Instant role-based routing
 * ✅ SSR-safe
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export type UserRole = 'admin' | 'manager' | 'operator' | 'staff' | 'warehouse' | 'rider' | 'vendor' | 'csr';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  vendorId?: string;
  isActive: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export interface AuthHelpers {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isVendor: boolean;
  isStaff: boolean;
  canSeeFinancials: boolean;
  canManageUsers: boolean;
  canMakePayments: boolean;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export type UseAuthReturn = AuthState & AuthHelpers;

// =============================================================================
// ROLE CONFIGURATION
// =============================================================================

const FINANCIAL_ROLES: UserRole[] = ['admin', 'manager'];
const USER_MANAGEMENT_ROLES: UserRole[] = ['admin'];
const PAYMENT_ROLES: UserRole[] = ['admin'];
const VENDOR_MANAGEMENT_ROLES: UserRole[] = ['admin', 'manager'];

// =============================================================================
// HELPER: Extract Role from Session
// =============================================================================

function extractRoleFromSession(session: Session | null): UserRole {
  if (!session?.user) return 'staff';
  
  const user = session.user;
  
  // DEBUG: Log what metadata we're seeing
  console.log('[useAuth] Session metadata:', {
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
  });
  
  // Priority 1: app_metadata.role (synced by trigger)
  const appMetaRole = user.app_metadata?.role as UserRole | undefined;
  if (appMetaRole) {
    console.log('[useAuth] Using app_metadata.role:', appMetaRole);
    return appMetaRole;
  }
  
  // Priority 2: user_metadata.role (set during signup)
  const userMetaRole = user.user_metadata?.role as UserRole | undefined;
  if (userMetaRole) {
    console.log('[useAuth] Using user_metadata.role:', userMetaRole);
    return userMetaRole;
  }
  
  // Default fallback
  console.log('[useAuth] No role found, defaulting to staff');
  return 'staff';
}

function extractVendorIdFromSession(session: Session | null): string | undefined {
  if (!session?.user) return undefined;
  
  const user = session.user;
  
  // Check app_metadata first (synced by trigger)
  const appMetaVendorId = user.app_metadata?.vendor_id as string | undefined;
  if (appMetaVendorId) return appMetaVendorId;
  
  // Check user_metadata
  const userMetaVendorId = user.user_metadata?.vendor_id as string | undefined;
  if (userMetaVendorId) return userMetaVendorId;
  
  return undefined;
}

function extractNameFromSession(session: Session | null): string {
  if (!session?.user) return 'User';
  
  const user = session.user;
  
  // Try various metadata fields
  return (
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.app_metadata?.name ||
    user.email?.split('@')[0] ||
    'User'
  );
}

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  const supabase = useMemo(() => createClient(), []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Get current session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (mounted) {
          if (session) {
            // Extract user info from JWT metadata
            let role = extractRoleFromSession(session);
            let vendorId = extractVendorIdFromSession(session);
            let name = extractNameFromSession(session);
            
            // FALLBACK: If role is 'staff' (default), try to refresh session first
            // This handles cases where app_metadata wasn't synced properly
            if (role === 'staff') {
              console.log('[useAuth] Role is staff, attempting session refresh...');
              try {
                // Force session refresh to get latest app_metadata
                const { data: refreshData } = await supabase.auth.refreshSession();
                if (refreshData?.session) {
                  const refreshedRole = extractRoleFromSession(refreshData.session);
                  if (refreshedRole !== 'staff') {
                    role = refreshedRole;
                    vendorId = extractVendorIdFromSession(refreshData.session);
                    name = extractNameFromSession(refreshData.session);
                    console.log('[useAuth] Role after refresh:', role);
                  }
                }
              } catch (refreshError) {
                console.warn('[useAuth] Session refresh failed:', refreshError);
              }
            }

            const authUser: AuthUser = {
              id: session.user.id,
              email: session.user.email || '',
              name,
              role,
              vendorId,
              isActive: true,
            };

            setState({
              user: authUser,
              session,
              loading: false,
              error: null,
            });
          } else {
            setState({
              user: null,
              session: null,
              loading: false,
              error: null,
            });
          }
        }
      } catch (error) {
        if (mounted) {
          setState({
            user: null,
            session: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Auth error',
          });
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setState({
            user: null,
            session: null,
            loading: false,
            error: null,
          });
        } else if (session) {
          // Extract user info from JWT metadata
          let role = extractRoleFromSession(session);
          let vendorId = extractVendorIdFromSession(session);
          let name = extractNameFromSession(session);
          
          // FALLBACK: If role is 'staff' (default), try to refresh session
          if (role === 'staff') {
            console.log('[useAuth] onAuthStateChange: Role is staff, checking refresh...');
            try {
              const { data: refreshData } = await supabase.auth.refreshSession();
              if (refreshData?.session) {
                const refreshedRole = extractRoleFromSession(refreshData.session);
                if (refreshedRole !== 'staff') {
                  role = refreshedRole;
                  vendorId = extractVendorIdFromSession(refreshData.session);
                  name = extractNameFromSession(refreshData.session);
                  console.log('[useAuth] Role after refresh:', role);
                }
              }
            } catch (refreshError) {
              console.warn('[useAuth] Session refresh in auth change failed:', refreshError);
            }
          }

          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email || '',
            name,
            role,
            vendorId,
            isActive: true,
          };

          setState({
            user: authUser,
            session,
            loading: false,
            error: null,
          });
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Sign out handler
  const signOut = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      await supabase.auth.signOut();
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Sign out failed',
      }));
    }
  }, [supabase]);

  // Refresh session (forces re-fetch of JWT with updated metadata)
  const refreshSession = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) throw error;

      if (session) {
        const authUser: AuthUser = {
          id: session.user.id,
          email: session.user.email || '',
          name: extractNameFromSession(session),
          role: extractRoleFromSession(session),
          vendorId: extractVendorIdFromSession(session),
          isActive: true,
        };

        setState({
          user: authUser,
          session,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Session refresh failed',
      }));
    }
  }, [supabase]);

  // Role check helper
  const hasRole = useCallback((role: UserRole | UserRole[]): boolean => {
    if (!state.user) return false;
    if (Array.isArray(role)) {
      return role.includes(state.user.role);
    }
    return state.user.role === role;
  }, [state.user]);

  // Compute derived state
  const helpers: AuthHelpers = useMemo(() => ({
    isAuthenticated: !!state.user,
    isAdmin: state.user?.role === 'admin',
    isManager: state.user?.role === 'manager',
    isVendor: state.user?.role === 'vendor',
    isStaff: ['staff', 'operator', 'warehouse', 'csr'].includes(state.user?.role || ''),
    canSeeFinancials: FINANCIAL_ROLES.includes(state.user?.role as UserRole),
    canManageUsers: USER_MANAGEMENT_ROLES.includes(state.user?.role as UserRole),
    canMakePayments: PAYMENT_ROLES.includes(state.user?.role as UserRole),
    hasRole,
    signOut,
    refreshSession,
  }), [state.user, hasRole, signOut, refreshSession]);

  return {
    ...state,
    ...helpers,
  };
}

// =============================================================================
// CONVENIENCE HOOKS
// =============================================================================

/**
 * Quick check if current user is admin
 */
export function useIsAdmin(): boolean {
  const { isAdmin, loading } = useAuth();
  // Return false while loading to prevent flash of admin content
  return !loading && isAdmin;
}

/**
 * Quick check if current user can see financial data
 */
export function useCanSeeFinancials(): boolean {
  const { canSeeFinancials, loading } = useAuth();
  return !loading && canSeeFinancials;
}

/**
 * Get user role directly
 */
export function useUserRole(): UserRole | null {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user?.role || null;
}

/**
 * Check if user is a vendor
 */
export function useIsVendor(): boolean {
  const { isVendor, loading } = useAuth();
  return !loading && isVendor;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default useAuth;
