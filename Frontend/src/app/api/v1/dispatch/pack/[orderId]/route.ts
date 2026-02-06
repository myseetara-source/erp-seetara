/**
 * API Route: POST /api/v1/dispatch/pack/:orderId
 * Packs an order - proxies to backend with auth token
 * P0 FIX: Try multiple methods to get auth token
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    
    // P0 FIX: Try multiple methods to get auth token
    let token = '';
    
    // Method 1: Try to get from incoming request Authorization header
    const incomingAuth = request.headers.get('Authorization');
    if (incomingAuth && incomingAuth.startsWith('Bearer ')) {
      token = incomingAuth.replace('Bearer ', '');
      console.log('[Dispatch Pack API] Using token from incoming request header');
    }
    
    // Method 2: Try Supabase server client (cookies)
    if (!token) {
      try {
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          token = session.access_token;
          console.log('[Dispatch Pack API] Using token from Supabase cookies');
        }
      } catch (e) {
        console.log('[Dispatch Pack API] Supabase session error:', e);
      }
    }
    
    if (!token) {
      console.error('[Dispatch Pack API] No auth token available');
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const backendUrl = `${BACKEND_URL}/dispatch/pack/${orderId}`;
    
    console.log('[Dispatch Pack API] POST', backendUrl);
    
    // Get request body if any
    let body = undefined;
    try {
      body = await request.json();
    } catch {
      // No body - that's fine for pack endpoint
    }
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    
    const data = await response.json();
    
    console.log('[Dispatch Pack API] Response:', response.status, data);
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Dispatch Pack API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to pack order' },
      { status: 500 }
    );
  }
}
