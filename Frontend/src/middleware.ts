/**
 * Next.js Middleware - Supabase Auth Security Layer
 * 
 * SECURITY RULES:
 * 1. /dashboard/* -> Admin, Manager, Operator only
 * 2. /portal/vendor/* -> Vendor role only
 * 3. /portal/rider/* -> Rider role only
 * 4. /login -> Redirect authenticated users to appropriate portal
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/middleware';

// Route configurations
const PROTECTED_ROUTES = {
  dashboard: {
    path: '/dashboard',
    allowedRoles: ['admin', 'manager', 'operator'],
    redirectTo: '/login',
  },
  vendorPortal: {
    path: '/portal/vendor',
    allowedRoles: ['vendor'],
    redirectTo: '/portal/login',
  },
  riderPortal: {
    path: '/portal/rider',
    allowedRoles: ['rider'],
    redirectTo: '/portal/rider/login',
  },
};

const AUTH_ROUTES = ['/login', '/portal/login', '/portal/rider/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  try {
    // Create Supabase client
    const { supabase, response } = await createClient(request);
    
    // Get current session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    const isAuthenticated = !!user && !authError;
    const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));
    
    // =========================================================================
    // RULE 1: Redirect authenticated users away from auth pages
    // =========================================================================
    if (isAuthenticated && isAuthRoute) {
      // Get user role from public.users table
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      
      const role = userData?.role || 'operator';
      
      // Redirect based on role
      if (role === 'vendor') {
        return NextResponse.redirect(new URL('/portal/vendor', request.url));
      } else if (role === 'rider') {
        return NextResponse.redirect(new URL('/portal/rider', request.url));
      } else {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    
    // =========================================================================
    // RULE 2: Protect Dashboard Routes (Admin/Manager/Operator)
    // =========================================================================
    if (pathname.startsWith('/dashboard')) {
      if (!isAuthenticated) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }
      
      // Check role
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user!.id)
        .single();
      
      const role = userData?.role;
      const allowedRoles = PROTECTED_ROUTES.dashboard.allowedRoles;
      
      if (!role || !allowedRoles.includes(role)) {
        // Redirect to appropriate portal based on role
        if (role === 'vendor') {
          return NextResponse.redirect(new URL('/portal/vendor', request.url));
        } else if (role === 'rider') {
          return NextResponse.redirect(new URL('/portal/rider', request.url));
        } else {
          // Unknown role - logout and redirect to login
          await supabase.auth.signOut();
          return NextResponse.redirect(new URL('/login', request.url));
        }
      }
    }
    
    // =========================================================================
    // RULE 3: Protect Vendor Portal
    // =========================================================================
    if (pathname.startsWith('/portal/vendor') && !pathname.includes('/login')) {
      if (!isAuthenticated) {
        return NextResponse.redirect(new URL('/portal/login', request.url));
      }
      
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user!.id)
        .single();
      
      if (userData?.role !== 'vendor') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    
    // =========================================================================
    // RULE 4: Protect Rider Portal
    // =========================================================================
    if (pathname.startsWith('/portal/rider') && !pathname.includes('/login')) {
      if (!isAuthenticated) {
        return NextResponse.redirect(new URL('/portal/rider/login', request.url));
      }
      
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user!.id)
        .single();
      
      if (userData?.role !== 'rider') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    
    return response;
    
  } catch (error) {
    console.error('Middleware error:', error);
    // On error, allow request to proceed (fail open for development)
    // In production, you might want to fail closed
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    // Match all dashboard routes
    '/dashboard/:path*',
    // Match all portal routes
    '/portal/:path*',
    // Match login routes
    '/login',
  ],
};
