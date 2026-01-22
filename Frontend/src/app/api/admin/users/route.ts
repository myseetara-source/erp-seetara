/**
 * Admin Users API - Server-Side User Management
 * 
 * SECURITY:
 * - Uses Supabase Service Role Key (Server-side only)
 * - Verifies JWT and checks app_metadata.role === 'admin'
 * - Never exposes service role key to client
 * 
 * ENDPOINTS:
 * - GET /api/admin/users - List all users
 * - POST /api/admin/users - Create new user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// =============================================================================
// SUPABASE ADMIN CLIENT (Service Role - Full Access)
// =============================================================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// =============================================================================
// HELPER: Verify Admin Access
// =============================================================================

async function verifyAdminAccess(request: NextRequest): Promise<{
  isAdmin: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    // Get the session token from cookies
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    
    // Find Supabase auth cookie
    let accessToken: string | null = null;
    for (const cookie of allCookies) {
      if (cookie.name.includes('-auth-token') || cookie.name.includes('access-token')) {
        try {
          const parsed = JSON.parse(cookie.value);
          if (parsed.access_token) {
            accessToken = parsed.access_token;
            break;
          }
        } catch {
          // Not JSON, try as raw token
          if (cookie.value && cookie.value.includes('.')) {
            accessToken = cookie.value;
            break;
          }
        }
      }
    }

    // Also check Authorization header
    if (!accessToken) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    if (!accessToken) {
      return { isAdmin: false, error: 'No authentication token found' };
    }

    // Verify the token and get user
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      return { isAdmin: false, error: 'Invalid or expired token' };
    }

    // Check if user is admin
    const role = user.app_metadata?.role || user.user_metadata?.role;
    
    if (role !== 'admin') {
      return { isAdmin: false, userId: user.id, error: 'Admin access required' };
    }

    return { isAdmin: true, userId: user.id };
  } catch (err) {
    console.error('Admin verification error:', err);
    return { isAdmin: false, error: 'Authentication failed' };
  }
}

// =============================================================================
// GET /api/admin/users - List All Users
// =============================================================================

export async function GET(request: NextRequest) {
  // Verify admin access
  const auth = await verifyAdminAccess(request);
  if (!auth.isAdmin) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: 403 }
    );
  }

  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // Build query
    let query = supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (role && role !== 'all') {
      query = query.eq('role', role);
    }
    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'inactive') {
      query = query.eq('is_active', false);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('Failed to fetch users:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch users' },
        { status: 500 }
      );
    }

    // Get auth users for last sign in info
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    
    // Merge data
    const enrichedUsers = users?.map(user => {
      const authUser = authUsers?.users?.find(au => au.id === user.id);
      return {
        ...user,
        last_sign_in: authUser?.last_sign_in_at,
        email_confirmed: authUser?.email_confirmed_at != null,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedUsers || [],
      count: enrichedUsers?.length || 0,
    });
  } catch (err) {
    console.error('List users error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/admin/users - Create New User
// =============================================================================

export async function POST(request: NextRequest) {
  // Verify admin access
  const auth = await verifyAdminAccess(request);
  if (!auth.isAdmin) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { email, password, name, phone, role, vendor_id } = body;

    // Validation
    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { success: false, error: 'Email, password, name, and role are required' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'staff', 'operator', 'rider', 'vendor', 'csr'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // If role is vendor, vendor_id is required
    if (role === 'vendor' && !vendor_id) {
      return NextResponse.json(
        { success: false, error: 'Vendor ID is required for vendor role' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already exists' },
        { status: 409 }
      );
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name,
        phone,
      },
      app_metadata: {
        role, // Set role in metadata immediately
        vendor_id: vendor_id || null,
      },
    });

    if (authError) {
      console.error('Auth user creation failed:', authError);
      return NextResponse.json(
        { success: false, error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { success: false, error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Insert into public.users table
    const { data: publicUser, error: publicError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email: email.toLowerCase(),
        name,
        phone: phone || null,
        role,
        vendor_id: vendor_id || null,
        is_active: true,
        password_hash: 'managed_by_supabase_auth',
      })
      .select()
      .single();

    if (publicError) {
      console.error('Public user creation failed:', publicError);
      // Try to clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { success: false, error: 'Failed to create user profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: publicUser,
      message: `User ${name} created successfully with role: ${role}`,
    }, { status: 201 });

  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
