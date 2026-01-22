/**
 * Admin User Detail API - Individual User Management
 * 
 * ENDPOINTS:
 * - GET /api/admin/users/[id] - Get user details
 * - PATCH /api/admin/users/[id] - Update user
 * - DELETE /api/admin/users/[id] - Delete user
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// =============================================================================
// SUPABASE ADMIN CLIENT
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
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    
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
          if (cookie.value && cookie.value.includes('.')) {
            accessToken = cookie.value;
            break;
          }
        }
      }
    }

    if (!accessToken) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }
    }

    if (!accessToken) {
      return { isAdmin: false, error: 'No authentication token found' };
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      return { isAdmin: false, error: 'Invalid or expired token' };
    }

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
// GET /api/admin/users/[id] - Get User Details
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAccess(request);
  if (!auth.isAdmin) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Get public user
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get auth user info
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id);

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        last_sign_in: authUser?.user?.last_sign_in_at,
        email_confirmed: authUser?.user?.email_confirmed_at != null,
        auth_metadata: authUser?.user?.app_metadata,
      },
    });
  } catch (err) {
    console.error('Get user error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/admin/users/[id] - Update User
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAccess(request);
  if (!auth.isAdmin) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, phone, role, is_active, vendor_id } = body;

    // Get existing user
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (vendor_id !== undefined) updateData.vendor_id = vendor_id;
    updateData.updated_at = new Date().toISOString();

    // Update public.users
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Update user error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update user' },
        { status: 500 }
      );
    }

    // Update auth user metadata if role changed
    if (role !== undefined && role !== existingUser.role) {
      await supabaseAdmin.auth.admin.updateUserById(id, {
        app_metadata: {
          role,
          vendor_id: vendor_id || existingUser.vendor_id || null,
        },
      });
    }

    // If user is being deactivated, ban them in auth
    if (is_active === false && existingUser.is_active === true) {
      await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: '876000h', // ~100 years (effectively permanent)
      });
    }

    // If user is being reactivated, unban them
    if (is_active === true && existingUser.is_active === false) {
      await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: 'none',
      });
    }

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: 'User updated successfully',
    });
  } catch (err) {
    console.error('Update user error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/admin/users/[id] - Delete User
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminAccess(request);
  if (!auth.isAdmin) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const { id } = await params;

    // Prevent self-deletion
    if (id === auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Get user first
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Soft delete - mark as inactive instead of deleting
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Soft delete error:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete user' },
        { status: 500 }
      );
    }

    // Ban the user in auth
    await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: '876000h',
    });

    return NextResponse.json({
      success: true,
      message: `User ${user.name || user.email} has been deactivated`,
    });
  } catch (err) {
    console.error('Delete user error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
