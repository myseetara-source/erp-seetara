/**
 * API Route: GET /api/v1/dispatch/orders-packed
 * Get packed orders - proxies to backend with auth token
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const backendUrl = `${BACKEND_URL}/dispatch/orders-packed${queryString ? `?${queryString}` : ''}`;
    
    console.log('[Dispatch API] GET', backendUrl);
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    
    const data = await response.json();
    
    console.log('[Dispatch API] Orders Packed Response:', response.status);
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Dispatch API] Orders Packed Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch packed orders' },
      { status: 500 }
    );
  }
}
