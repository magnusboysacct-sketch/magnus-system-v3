/*
  Replace edge-function-based user deletion with a SECURITY DEFINER RPC.
  This runs inside the database with postgres privileges so it can delete
  from auth.users without needing an edge function deployment.

  Also adds an RLS policy so an invited user can mark their own invitation
  as accepted (needed by AcceptInvitePage after password is set).
*/

-- ── RPC: admin_delete_user ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id      uuid;
  v_caller_role    text;
  v_caller_company uuid;
  v_target_company uuid;
  v_target_role    text;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_caller_id = target_user_id THEN
    RAISE EXCEPTION 'You cannot remove yourself';
  END IF;

  SELECT role, company_id
  INTO   v_caller_role, v_caller_company
  FROM   public.user_profiles
  WHERE  id = v_caller_id;

  IF v_caller_role NOT IN ('director', 'admin') THEN
    RAISE EXCEPTION 'Only directors and admins can remove users';
  END IF;

  SELECT company_id, role
  INTO   v_target_company, v_target_role
  FROM   public.user_profiles
  WHERE  id = target_user_id;

  IF v_target_company IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_target_company != v_caller_company THEN
    RAISE EXCEPTION 'User is not in your company';
  END IF;

  IF v_target_role = 'director' AND v_caller_role != 'director' THEN
    RAISE EXCEPTION 'Only a director can remove another director';
  END IF;

  -- Delete the profile first (avoids FK issues if CASCADE not set)
  DELETE FROM public.user_profiles WHERE id = target_user_id;

  -- Delete the auth user (requires SECURITY DEFINER / postgres role)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Grant execute to authenticated users (security is enforced inside the function)
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- ── RLS: let an invited user accept their own invitation ──────────────────────
DROP POLICY IF EXISTS "invitations_accept_own" ON public.company_invitations;

CREATE POLICY "invitations_accept_own" ON public.company_invitations
  FOR UPDATE TO authenticated
  USING  (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
