-- Client portal login email: protected, and a proper way to change it (run after 20260952000000).
--
-- A client signs in to the portal with portal_email, or - when that is empty - with the client's own email (client-portal-login looks for "email = x OR portal_email = x").
-- Since contacts (client_contacts) the client's email is the PRIMARY CONTACT's email, so editing a contact or the client's phone / email details in the office could silently
-- change who can sign in to the portal. Now:
--  1. If an ACTIVATED portal client's email changes while portal_email is empty, portal_email is set to the old email in the same update (the login keeps working, whichever
--     part of the app made the change - the client form, a contact edit, an import).
--  2. portal_email itself can be changed only by a director or admin of the company (or the service role, which the portal login functions use for first-time setup), and
--     the app does it through change_client_portal_email(client, new email): it checks the address, refuses one already used by another portal login, replaces the login
--     email, clears any pending password-reset link and ends the client's open portal sessions.
-- Everything else about clients (name, phone, email, address, notes, status) stays editable by every company user, as before.
-- Changes no existing data.

BEGIN;

-- ── safety checks: stop (and change nothing) if the database is not what this file expects ────────────────────────────────────────────────────────────────
DO $$
DECLARE s text; c text;
BEGIN
  FOREACH s IN ARRAY ARRAY['clients', 'client_contact_portal_access', 'client_portal_sessions', 'user_profiles'] LOOP
    IF to_regclass('public.' || s) IS NULL THEN RAISE EXCEPTION 'Table public.% was not found. Nothing was changed.', s; END IF;
  END LOOP;
  FOREACH c IN ARRAY ARRAY['email', 'portal_email', 'portal_enabled', 'portal_activated_at', 'portal_password_hash', 'portal_reset_token', 'portal_reset_expires_at', 'company_id'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = c) THEN RAISE EXCEPTION 'clients.% was not found. Nothing was changed.', c; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = '_caller_may_use_company') <> 1 THEN RAISE EXCEPTION 'Function public._caller_may_use_company() was not found. Nothing was changed.'; END IF;
  -- no other trigger on clients may already touch portal_email (this file would fight it)
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgrelid = 'public.clients'::regclass AND NOT t.tgisinternal AND t.tgname <> 'clients_portal_email_guard' AND p.prosrc ILIKE '%portal_email%') THEN
    RAISE EXCEPTION 'Another trigger on clients already handles portal_email. Review it first. Nothing was changed.';
  END IF;
END $$;

-- director / admin of the client's company, or the service role / a direct database connection
CREATE OR REPLACE FUNCTION public._client_portal_admin_ok(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_company_id IS NOT NULL AND (
    public._caller_may_use_company(NULL)
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.company_id = p_company_id AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active'))
$$;
REVOKE ALL ON FUNCTION public._client_portal_admin_ok(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.clients_portal_email_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_pinned boolean := false;
BEGIN
  -- 1. the client's email changes under an activated portal login that has no portal_email of its own: pin the old email as the login email
  IF NEW.email IS DISTINCT FROM OLD.email AND nullif(btrim(coalesce(OLD.email, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(OLD.portal_email, '')), '') IS NULL AND nullif(btrim(coalesce(NEW.portal_email, '')), '') IS NULL
     AND coalesce(OLD.portal_enabled, false) AND (OLD.portal_activated_at IS NOT NULL OR OLD.portal_password_hash IS NOT NULL) THEN
    NEW.portal_email := lower(btrim(OLD.email));
    v_pinned := true;
  END IF;
  -- 2. only a director / admin (or the service role) changes the portal login email itself
  IF NEW.portal_email IS DISTINCT FROM OLD.portal_email AND NOT v_pinned AND NOT public._client_portal_admin_ok(OLD.company_id) THEN
    RAISE EXCEPTION 'Only a director or admin can change the portal login email' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clients_portal_email_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS clients_portal_email_guard ON public.clients;
CREATE TRIGGER clients_portal_email_guard BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.clients_portal_email_guard();

-- The "Change portal email" action (director / admin)
CREATE OR REPLACE FUNCTION public.change_client_portal_email(p_client_id uuid, p_new_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE c record; v_new text := lower(btrim(coalesce(p_new_email, ''))); v_old text;
BEGIN
  SELECT id, company_id, email, portal_email, portal_enabled INTO c FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND OR NOT public._client_portal_admin_ok(c.company_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF v_new !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR length(v_new) > 254 THEN RAISE EXCEPTION 'That email address does not look right' USING ERRCODE = '22023'; END IF;
  IF NOT coalesce(c.portal_enabled, false) THEN RAISE EXCEPTION 'The portal is not enabled for this client' USING ERRCODE = '22023'; END IF;
  v_old := lower(btrim(coalesce(c.portal_email, c.email, '')));
  IF v_new = v_old THEN RAISE EXCEPTION 'That is already the portal login email' USING ERRCODE = '22023'; END IF;
  -- one email, one portal login: not another client's, and not a contact's own portal login
  IF EXISTS (SELECT 1 FROM public.clients o WHERE o.id <> c.id AND (lower(btrim(coalesce(o.email, ''))) = v_new OR lower(btrim(coalesce(o.portal_email, ''))) = v_new))
     OR EXISTS (SELECT 1 FROM public.client_contact_portal_access a WHERE lower(btrim(coalesce(a.portal_email, ''))) = v_new) THEN
    RAISE EXCEPTION 'That email is already used for another portal login' USING ERRCODE = '23505';
  END IF;
  UPDATE public.clients SET portal_email = v_new, portal_reset_token = NULL, portal_reset_expires_at = NULL WHERE id = c.id;
  UPDATE public.client_portal_sessions SET expires_at = now() WHERE client_id = c.id AND contact_id IS NULL AND expires_at > now();
  RETURN jsonb_build_object('old_email', nullif(v_old, ''), 'new_email', v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.change_client_portal_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_client_portal_email(uuid, text) TO authenticated, service_role;

-- ── final checks ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.change_client_portal_email(uuid, text)', 'EXECUTE') OR has_function_privilege('anon', 'public.clients_portal_email_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.clients_portal_email_guard()', 'EXECUTE') OR has_function_privilege('authenticated', 'public._client_portal_admin_ok(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'A new function is open to the wrong users. Nothing was changed.'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.change_client_portal_email(uuid, text)', 'EXECUTE') THEN RAISE EXCEPTION 'Signed-in users cannot call change_client_portal_email. Nothing was changed.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.clients'::regclass AND tgname = 'clients_portal_email_guard' AND NOT tgisinternal) THEN RAISE EXCEPTION 'The guard trigger is missing. Nothing was changed.'; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
