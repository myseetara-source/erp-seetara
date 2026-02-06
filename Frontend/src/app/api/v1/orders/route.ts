/**
 * API Route Handler for Orders List
 * 
 * Proxies GET/POST requests to the Express backend
 * This fixes the 404 issue when fetching orders list
 * 
 * @priority P0 - Critical Data Fetching Fix
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

/**
 * GET /api/v1/orders
 * Fetches orders list with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    // Get auth token
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    
    // Forward query params to backend
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const backendUrl = `${BACKEND_URL}/orders${queryString ? `?${queryString}` : ''}`;
    
    console.log('[API Route] Fetching orders from:', backendUrl);
    
    // Forward to backend
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Don't cache at the proxy level
      cache: 'no-store',
    });
    
    const data = await response.json();
    
    console.log('[API Route] Backend response status:', response.status);
    console.log('[API Route] Orders count:', data?.data?.length || 0);
    
    if (!response.ok) {
      console.error('[API Route] Backend error:', data);
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Error fetching orders:', error);
    
    // Return a structured error response
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to fetch orders',
        data: [],
        pagination: {
          page: 1,
          limit: 25,
          total: 0,
          totalPages: 0,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/orders
 * Creates a new order
 */
export async function POST(request: NextRequest) {
  try {
    // Get auth token
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    
    // Get request body
    const body = await request.json();
    
    console.log('[API Route] Creating order:', {
      customer: body.customer_name || body.customer?.name,
      itemsCount: body.items?.length || 0,
    });
    
    // Forward to backend
    const response = await fetch(`${BACKEND_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[API Route] Create order error:', data);
      return NextResponse.json(data, { status: response.status });
    }
    
    console.log('[API Route] Order created:', data?.data?.id || data?.id);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Error creating order:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to create order' 
      },
      { status: 500 }
    );
  }
}
