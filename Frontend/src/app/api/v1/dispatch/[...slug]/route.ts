/**
 * API Route Handler for Dispatch Endpoints (Catch-all)
 * 
 * Proxies all /api/v1/dispatch/* requests to the Express backend
 * with proper authentication header forwarding
 * 
 * @priority P0 - Critical Auth Fix for Dispatch Module
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

/**
 * Proxy handler for all HTTP methods
 */
async function proxyToBackend(
  request: NextRequest,
  method: string,
  slug: string[]
) {
  try {
    // Get auth token
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    
    // Build backend URL
    const endpoint = `/dispatch/${slug.join('/')}`;
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const backendUrl = `${BACKEND_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;
    
    console.log(`[Dispatch API] ${method} ${backendUrl}`);
    
    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    };
    
    // Add body for POST/PUT/PATCH methods
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.json();
        fetchOptions.body = JSON.stringify(body);
      } catch {
        // No body or invalid JSON - continue without body
      }
    }
    
    // Forward to backend
    const response = await fetch(backendUrl, fetchOptions);
    const data = await response.json();
    
    console.log(`[Dispatch API] Response: ${response.status}`);
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Dispatch API] Proxy error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to proxy request',
      },
      { status: 500 }
    );
  }
}

// Export handlers for all HTTP methods
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  return proxyToBackend(request, 'GET', slug);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  return proxyToBackend(request, 'POST', slug);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  return proxyToBackend(request, 'PUT', slug);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  return proxyToBackend(request, 'PATCH', slug);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  return proxyToBackend(request, 'DELETE', slug);
}
