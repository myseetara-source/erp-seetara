/**
 * API Route: PATCH /api/v1/orders/:id/status
 * Handles order status updates with auth token forwarding
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
    
    const backendUrl = `${BACKEND_URL}/orders/${id}/status`;
    console.log('[Orders Status API] PATCH', backendUrl);
    
    // Forward to backend
    const response = await fetch(backendUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    
    const data = await response.json();
    
    console.log('[Orders Status API] Response:', response.status);
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Orders Status API] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update order status' },
      { status: 500 }
    );
  }
}
