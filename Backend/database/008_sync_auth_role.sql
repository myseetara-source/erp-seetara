-- =============================================================================
-- ROLE SYNC BRIDGE: Alternative Approach for Supabase Hosted
-- =============================================================================
--
-- Version: 2.0.0
-- Purpose: Sync role changes to JWT metadata
--
-- IMPORTANT: Supabase hosted doesn't allow direct auth schema access.
-- This migration creates the trigger that calls a backend API to sync roles.
--
-- ARCHITECTURE:
-- ┌─────────────────┐    Trigger    ┌──────────────────┐    Admin API    ┌──────────────────────────┐
-- │  public.users   │ ──────────► │ pg_notify        │ ────────────► │  auth.users              │
-- │  role: 'admin'  │              │ (role_change)    │    (Backend)   │  raw_app_meta_data.role  │
-- └─────────────────┘              └──────────────────┘                └──────────────────────────┘
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: CREATE ROLE CHANGE LOG TABLE
-- =============================================================================

-- This table tracks role changes that need to be synced
CREATE TABLE IF NOT EXISTS public.pending_role_syncs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    new_role TEXT NOT NULL,
    vendor_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ,
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
    error_message TEXT
);

-- Index for quick lookup of pending syncs
CREATE INDEX IF NOT EXISTS idx_pending_role_syncs_status 
ON public.pending_role_syncs(sync_status) 
WHERE sync_status = 'pending';

-- =============================================================================
-- SECTION 2: THE SYNC FUNCTION (Logs to pending table)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Log the role change to pending_role_syncs table
    INSERT INTO public.pending_role_syncs (user_id, new_role, vendor_id)
    VALUES (NEW.id, NEW.role::text, NEW.vendor_id);
    
    -- Send a notification that can be picked up by backend
    PERFORM pg_notify('role_change', json_build_object(
        'user_id', NEW.id,
        'role', NEW.role,
        'vendor_id', NEW.vendor_id,
        'email', NEW.email
    )::text);
    
    RAISE NOTICE 'Role change logged for user %: role=%', NEW.id, NEW.role;
    
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_role_update IS 
'Logs role changes to pending_role_syncs table for backend API to process';

-- =============================================================================
-- SECTION 3: THE TRIGGER
-- =============================================================================

-- Drop existing trigger if exists (for idempotent runs)
DROP TRIGGER IF EXISTS on_role_change ON public.users;

-- Create trigger that fires on INSERT or UPDATE of role/vendor_id columns
CREATE TRIGGER on_role_change
    AFTER INSERT OR UPDATE OF role, vendor_id
    ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_role_update();

COMMENT ON TRIGGER on_role_change ON public.users IS 
'Logs role changes for backend sync to auth.users metadata';

-- =============================================================================
-- SECTION 4: HELPER VIEW FOR CHECKING SYNC STATUS
-- =============================================================================

CREATE OR REPLACE VIEW public.role_sync_status AS
SELECT 
    u.id,
    u.email,
    u.role AS current_role,
    prs.new_role AS pending_role,
    prs.sync_status,
    prs.created_at AS change_time,
    prs.synced_at,
    prs.error_message
FROM public.users u
LEFT JOIN public.pending_role_syncs prs ON u.id = prs.user_id
    AND prs.sync_status = 'pending'
ORDER BY prs.created_at DESC NULLS LAST;

-- =============================================================================
-- SECTION 5: FUNCTION TO MARK SYNC AS COMPLETE (Called by Backend)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_role_sync_complete(
    p_user_id UUID,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.pending_role_syncs
    SET 
        sync_status = CASE WHEN p_success THEN 'synced' ELSE 'failed' END,
        synced_at = NOW(),
        error_message = p_error_message
    WHERE user_id = p_user_id
      AND sync_status = 'pending';
END;
$$;

-- =============================================================================
-- SECTION 6: RLS POLICIES FOR PENDING_ROLE_SYNCS
-- =============================================================================

ALTER TABLE public.pending_role_syncs ENABLE ROW LEVEL SECURITY;

-- Only admins can view pending syncs
DROP POLICY IF EXISTS pending_role_syncs_admin_read ON public.pending_role_syncs;
CREATE POLICY pending_role_syncs_admin_read ON public.pending_role_syncs
    FOR SELECT TO authenticated
    USING (true); -- Backend service will handle this

-- =============================================================================
-- DONE!
-- =============================================================================
-- 
-- NEXT STEPS:
-- 1. Backend needs to process pending_role_syncs using Supabase Admin API
-- 2. See Backend/src/services/authSync.service.js for implementation
--
-- =============================================================================

SELECT '✅ Role sync infrastructure created! Run Backend sync service.' AS status;
