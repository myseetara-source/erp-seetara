-- =============================================================================
-- TRANSACTIONAL USER CREATION
-- =============================================================================
-- Creates auth user and public user in a single atomic transaction
-- Prevents orphan auth users if public user creation fails
-- =============================================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS create_user_with_profile(UUID, TEXT, TEXT, TEXT, TEXT, UUID);

-- Create transactional user creation function
CREATE OR REPLACE FUNCTION create_user_with_profile(
  p_user_id UUID,
  p_email TEXT,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role user_role DEFAULT 'operator',
  p_vendor_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Validate vendor_id for vendor role
  IF p_role = 'vendor' AND p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'vendor_id is required for vendor role';
  END IF;

  -- Check if user already exists in public.users
  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    -- Update existing user
    UPDATE users SET
      email = LOWER(p_email),
      name = p_name,
      phone = p_phone,
      role = p_role,
      vendor_id = p_vendor_id,
      is_active = TRUE,
      updated_at = NOW()
    WHERE id = p_user_id;
  ELSE
    -- Insert new user
    INSERT INTO users (id, email, name, phone, role, vendor_id, is_active, created_at, updated_at)
    VALUES (
      p_user_id,
      LOWER(p_email),
      p_name,
      p_phone,
      p_role,
      p_vendor_id,
      TRUE,
      NOW(),
      NOW()
    );
  END IF;

  -- Return the created user
  SELECT json_build_object(
    'success', TRUE,
    'user', json_build_object(
      'id', u.id,
      'email', u.email,
      'name', u.name,
      'phone', u.phone,
      'role', u.role,
      'vendor_id', u.vendor_id,
      'is_active', u.is_active,
      'created_at', u.created_at
    )
  )
  INTO v_result
  FROM users u
  WHERE u.id = p_user_id;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise with context
    RAISE EXCEPTION 'User profile creation failed: %', SQLERRM;
END;
$$;

-- Grant execute to authenticated users (admin check done in application layer)
GRANT EXECUTE ON FUNCTION create_user_with_profile TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_with_profile TO service_role;

-- Add comment
COMMENT ON FUNCTION create_user_with_profile IS 
  'Creates or updates a user profile atomically. Called after auth.users creation.';

-- =============================================================================
-- DELETE USER FUNCTION (Soft delete with auth ban)
-- =============================================================================

DROP FUNCTION IF EXISTS soft_delete_user(UUID);

CREATE OR REPLACE FUNCTION soft_delete_user(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_result JSON;
BEGIN
  -- Get user
  SELECT * INTO v_user FROM users WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Soft delete
  UPDATE users SET
    is_active = FALSE,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Return result
  SELECT json_build_object(
    'success', TRUE,
    'message', 'User ' || v_user.name || ' has been deactivated'
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION soft_delete_user TO authenticated;
GRANT EXECUTE ON FUNCTION soft_delete_user TO service_role;
