/**
 * Next.js Middleware - Subdomain-Based Routing
 * 
 * SECURITY ARCHITECTURE:
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         SUBDOMAIN ROUTING                               │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                         │
 * │  portal.todaytrend.com.np  →  /portal/*  (Vendor Portal - View Only)    │
 * │  app.todaytrend.com.np     →  /dashboard/* (Admin/Staff ERP)            │
 * │  localhost:3000            →  Both accessible (development)             │
 * │                                                                         │
 * │  SECURITY RULES:                                                        │
 * │  1. Portal users CANNOT access /dashboard/* routes                      │
 * │  2. Dashboard users cannot access /portal/* routes                      │
 * │  3. Cross-domain access is blocked                                      │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * DEPLOYMENT (Vercel):
 * 1. Go to Project Settings → Domains
 * 2. Add domain: portal.todaytrend.com.np
 * 3. Add domain: app.todaytrend.com.np (or www.todaytrend.com.np)
 * 4. Both point to the same deployment
 * 5. Middleware handles the routing based on hostname
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORTAL_SUBDOMAIN = 'portal';
const APP_SUBDOMAINS = ['app', 'www', ''];
const PRODUCTION_DOMAIN = 'todaytrend.com.np';

// Routes that require authentication
const PROTECTED_ROUTES = {
  portal: ['/portal', '/portal/transactions', '/portal/supplies', '/portal/payments'],
  dashboard: ['/dashboard'],
};

// Public routes (no auth required)
const PUBLIC_ROUTES = [
  '/portal/login',
  '/login',
  '/auth',
  '/_next',
  '/api',
  '/favicon.ico',
  '/images',
  '/fonts',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract subdomain from hostname
 * Examples:
 * - portal.todaytrend.com.np → 'portal'
 * - app.todaytrend.com.np → 'app'
 * - todaytrend.com.np → ''
 * - localhost:3000 → null (development)
 */
function getSubdomain(hostname: string): string | null {
  // Development mode - localhost
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return null; // No subdomain routing in dev by default
  }

  // Production domain check
  const parts = hostname.split('.');
  
  // todaytrend.com.np has 3 parts, so subdomain would be 4+ parts
  if (hostname.includes(PRODUCTION_DOMAIN)) {
    if (parts.length > 3) {
      return parts[0]; // Return the subdomain
    }
    return ''; // No subdomain (root domain)
  }

  // For other domains (staging, etc.)
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

/**
 * Check if route is public (no auth needed)
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Get auth token from cookies
 */
function getAuthToken(request: NextRequest): string | null {
  // Check for portal-specific token first
  const portalToken = request.cookies.get('portal_token')?.value;
  if (portalToken) return portalToken;

  // Check for main app token
  const appToken = request.cookies.get('auth_token')?.value;
  if (appToken) return appToken;

  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Decode JWT to get user info (without verification - just for routing)
 * Actual verification happens in backend
 */
function decodeToken(token: string): { role?: string; vendor_id?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return {
      role: payload.role,
      vendor_id: payload.vendor_id,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// MAIN MIDDLEWARE
// =============================================================================

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  const subdomain = getSubdomain(hostname);

  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // Static files like .css, .js, .ico
  ) {
    return NextResponse.next();
  }

  // ===========================================================================
  // DEVELOPMENT MODE (localhost)
  // ===========================================================================
  if (subdomain === null) {
    // In development, allow both portal and dashboard routes
    // Use query param ?portal=true to simulate portal subdomain
    const isPortalMode = request.nextUrl.searchParams.get('portal') === 'true';
    
    if (isPortalMode && pathname === '/') {
      // Redirect to portal login in dev mode with portal=true
      const url = request.nextUrl.clone();
      url.pathname = '/portal';
      return NextResponse.redirect(url);
    }
    
    // Allow normal routing in development
    return NextResponse.next();
  }

  // ===========================================================================
  // PORTAL SUBDOMAIN (portal.todaytrend.com.np)
  // ===========================================================================
  if (subdomain === PORTAL_SUBDOMAIN) {
    // SECURITY: Block access to dashboard routes from portal subdomain
    if (pathname.startsWith('/dashboard')) {
      console.warn(`[SECURITY] Blocked dashboard access from portal subdomain: ${pathname}`);
      const url = request.nextUrl.clone();
      url.pathname = '/portal/login';
      url.searchParams.set('error', 'unauthorized_access');
      return NextResponse.redirect(url);
    }

    // Root path → redirect to portal
    if (pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/portal';
      return NextResponse.rewrite(url);
    }

    // If already on portal routes, continue
    if (pathname.startsWith('/portal')) {
      // Check authentication for protected portal routes
      if (!isPublicRoute(pathname)) {
        const token = getAuthToken(request);
        
        if (!token) {
          const url = request.nextUrl.clone();
          url.pathname = '/portal/login';
          url.searchParams.set('redirect', pathname);
          return NextResponse.redirect(url);
        }

        // Verify user is a vendor
        const decoded = decodeToken(token);
        if (!decoded || decoded.role !== 'vendor' || !decoded.vendor_id) {
          console.warn(`[SECURITY] Non-vendor attempted portal access: ${decoded?.role}`);
          const url = request.nextUrl.clone();
          url.pathname = '/portal/login';
          url.searchParams.set('error', 'vendor_only');
          return NextResponse.redirect(url);
        }
      }

      return NextResponse.next();
    }

    // Rewrite non-portal paths to portal
    const url = request.nextUrl.clone();
    url.pathname = `/portal${pathname}`;
    return NextResponse.rewrite(url);
  }

  // ===========================================================================
  // APP SUBDOMAIN (app.todaytrend.com.np or www.todaytrend.com.np)
  // ===========================================================================
  if (APP_SUBDOMAINS.includes(subdomain)) {
    // SECURITY: Block access to portal routes from app subdomain
    if (pathname.startsWith('/portal')) {
      console.warn(`[SECURITY] Blocked portal access from app subdomain: ${pathname}`);
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'wrong_portal');
      return NextResponse.redirect(url);
    }

    // Root path → redirect to dashboard or login
    if (pathname === '/') {
      const token = getAuthToken(request);
      const url = request.nextUrl.clone();
      
      if (token) {
        const decoded = decodeToken(token);
        // If vendor, redirect to portal subdomain
        if (decoded?.role === 'vendor') {
          return NextResponse.redirect(new URL(`https://${PORTAL_SUBDOMAIN}.${PRODUCTION_DOMAIN}/portal`));
        }
        url.pathname = '/dashboard';
      } else {
        url.pathname = '/login';
      }
      
      return NextResponse.redirect(url);
    }

    // Check authentication for dashboard routes
    if (pathname.startsWith('/dashboard')) {
      const token = getAuthToken(request);
      
      if (!token) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('redirect', pathname);
        return NextResponse.redirect(url);
      }

      // Verify user is NOT a vendor (vendors can't access dashboard)
      const decoded = decodeToken(token);
      if (decoded?.role === 'vendor') {
        console.warn(`[SECURITY] Vendor attempted dashboard access`);
        return NextResponse.redirect(new URL(`https://${PORTAL_SUBDOMAIN}.${PRODUCTION_DOMAIN}/portal`));
      }
    }

    return NextResponse.next();
  }

  // ===========================================================================
  // UNKNOWN SUBDOMAIN - Block access
  // ===========================================================================
  console.warn(`[SECURITY] Unknown subdomain access attempt: ${subdomain}`);
  return new NextResponse('Not Found', { status: 404 });
}

// =============================================================================
// MATCHER CONFIG
// =============================================================================

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
