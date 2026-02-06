/**
 * API Route: POST /api/v1/dispatch/assign-rider
 * Assign rider to orders - proxies to backend with auth token
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    
    const backendUrl = `${BACKEND_URL}/dispatch/assign-rider`;
    
    console.log('[Dispatch API] POST', backendUrl);
    
    const body = await request.json();
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    
    const data = await response.json();
    
    console.log('[Dispatch API] Assign Rider Response:', response.status);
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Dispatch API] Assign Rider Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to assign rider' },
      { status: 500 }
    );
  }
}
