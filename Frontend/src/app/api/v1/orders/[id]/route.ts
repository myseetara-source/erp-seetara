/**
 * API Route Handler for Order Updates
 * 
 * Handles PATCH requests for order updates and forwards them to the backend
 * This is needed because Next.js rewrites don't always forward request bodies properly
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get auth token
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    
    // Get request body
    const body = await request.json();
    
    console.log('[API Route] Forwarding PATCH to backend:', {
      url: `${BACKEND_URL}/orders/${id}`,
      body,
    });
    
    // Forward to backend
    const response = await fetch(`${BACKEND_URL}/orders/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Error forwarding PATCH:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update order' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get auth token
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    
    // Forward to backend
    const response = await fetch(`${BACKEND_URL}/orders/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Error forwarding GET:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get order' },
      { status: 500 }
    );
  }
}
