-- Security: close three gaps found while auditing the migration history (run after 20260948000000).
--
--  1. v_project_finance_summary read every company's project money. The view was created without security_invoker, so it ran with its owner's rights (postgres) and
--     skipped row-level security on projects, boqs, boq_items, procurement_items, project_costs, client_invoices, client_payments and supplier_invoices. A user of one
--     company could select all of another company's budgets, committed and actual costs, billed, received, AR and AP. (Confirmed on live before this migration: a user of
--     VERON'S saw 24 rows through the view but only their own 2 projects.) It now runs with the CALLER's rights, so each company sees only its own projects. For the existing
--     users (every director, admin and secretary of both companies) the rows and totals are identical before and after - checked on live against the view's own query.
--     Also: anon had no access already; PUBLIC and the write privileges that authenticated held on a read-only view are removed, SELECT stays for authenticated.
--     This is the fix 20260822010000 describes (that file is marked as superseded by this one; do not apply it as well).
--  2. admin_delete_user: the live function was edited by hand and lost the rule from 20260628000003 - an admin could delete a director. The live body is kept exactly
--     and that rule is put back: only a director may remove a director. (Already live and kept: not signed in = refused, nobody removes themselves, same company only,
--     director or admin only.) Nothing in the app or in any edge function calls this function (the admin-delete-user edge function uses admin_delete_auth_user), so the
--     grant stays as it is: authenticated and service_role, never anon / PUBLIC. It can only act as the signed-in caller (auth.uid()), so service_role cannot use it anyway.
--  3. get_ar_ap_aging, bulk_update_rates and update_account_balance were executable by anon (Postgres gives EXECUTE to PUBLIC by default; 20260943 only closed the
--     SECURITY DEFINER ones and these three are SECURITY INVOKER, so row-level security already stopped a signed-out caller from reading or changing rows - this removes the
--     exposure anyway). get_ar_ap_aging (dashboard) and bulk_update_rates (Rates page) keep authenticated and service_role. update_account_balance is only a trigger function
--     on gl_entries; a trigger runs without any EXECUTE grant, so nobody needs to call it directly and it is closed to authenticated as well.
--
-- Read-only on data. Nothing else is touched.

BEGIN;

-- ── safety checks: stop (and change nothing) if the database is not what this file expects ────────────────────────────────────────────────────────────────
DO $$
DECLARE s text; v_oid oid;
BEGIN
  IF to_regclass('public.v_project_finance_summary') IS NULL THEN RAISE EXCEPTION 'View public.v_project_finance_summary was not found. Nothing was changed.'; END IF;
  IF (SELECT relkind FROM pg_class WHERE oid = 'public.v_project_finance_summary'::regclass) <> 'v' THEN RAISE EXCEPTION 'public.v_project_finance_summary is not a plain view. Nothing was changed.'; END IF;

  -- With security_invoker the view is only as private as the tables under it: each must have row-level security and be readable by signed-in users
  FOREACH s IN ARRAY ARRAY['projects', 'boqs', 'boq_items', 'procurement_items', 'project_costs', 'client_invoices', 'client_payments', 'supplier_invoices'] LOOP
    IF to_regclass('public.' || s) IS NULL THEN RAISE EXCEPTION 'Table public.% was not found. Nothing was changed.', s; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || s)::regclass) THEN RAISE EXCEPTION 'public.% has no row-level security, so the view could not be made private. Nothing was changed.', s; END IF;
    IF NOT has_table_privilege('authenticated', ('public.' || s)::regclass, 'SELECT') THEN RAISE EXCEPTION 'authenticated cannot read public.%, the view would break for every user. Nothing was changed.', s; END IF;
  END LOOP;

  -- admin_delete_user: the signature we expect, SECURITY DEFINER
  SELECT p.oid INTO v_oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'admin_delete_user' AND pg_get_function_identity_arguments(p.oid) = 'target_user_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Function public.admin_delete_user(uuid) was not found. Nothing was changed.'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN RAISE EXCEPTION 'public.admin_delete_user is not SECURITY DEFINER. Nothing was changed.'; END IF;

  -- the three functions we close to anon exist once each
  FOREACH s IN ARRAY ARRAY['get_ar_ap_aging', 'bulk_update_rates', 'update_account_balance'] LOOP
    IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = s) <> 1 THEN RAISE EXCEPTION 'public.% was not found exactly once. Nothing was changed.', s; END IF;
  END LOOP;
END $$;

-- nothing may rely on a signed-out caller running those three functions: no policy for anon / public calls them
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, f.proname
      FROM pg_policies p
      JOIN pg_proc f ON f.pronamespace = 'public'::regnamespace AND f.proname IN ('get_ar_ap_aging', 'bulk_update_rates', 'update_account_balance')
     WHERE p.roles && ARRAY['public', 'anon']::name[]
       AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ ('(^|[^a-zA-Z0-9_])' || f.proname || '\s*\(')
  LOOP
    RAISE EXCEPTION 'Policy % on %.% (for signed-out users) calls %(). Nothing was changed.', r.policyname, r.schemaname, r.tablename, r.proname;
  END LOOP;
END $$;

-- ── 1. The finance view runs with the caller's rights ────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER VIEW public.v_project_finance_summary SET (security_invoker = true);
REVOKE ALL ON public.v_project_finance_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_project_finance_summary TO authenticated;
-- service_role keeps the grants it has (it bypasses row-level security by design, used by edge functions only)

-- ── 2. admin_delete_user: the live body, plus "only a director may remove a director" ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id uuid; v_caller_role text; v_caller_company uuid;
  v_target_company uuid; v_target_role text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_caller_id = target_user_id THEN RAISE EXCEPTION 'You cannot remove yourself'; END IF;
  SELECT role, company_id INTO v_caller_role, v_caller_company FROM public.user_profiles WHERE id = v_caller_id;
  IF v_caller_role NOT IN ('director', 'admin') THEN RAISE EXCEPTION 'Only directors and admins can remove users'; END IF;
  SELECT company_id, role INTO v_target_company, v_target_role FROM public.user_profiles WHERE id = target_user_id;
  IF v_target_company IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_target_company != v_caller_company THEN RAISE EXCEPTION 'User is not in your company'; END IF;
  IF v_target_role = 'director' AND v_caller_role != 'director' THEN RAISE EXCEPTION 'Only a director can remove another director'; END IF;
  DELETE FROM public.user_profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END; $function$;
-- grants as they are today (authenticated, service_role); never anon / PUBLIC
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated, service_role;

-- ── 3. Three functions signed-out visitors never needed ──────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_ar_ap_aging(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ar_ap_aging(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.bulk_update_rates(text, text, text, text, text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_rates(text, text, text, text, text, numeric, date) TO authenticated, service_role;

-- trigger function only: a trigger fires without an EXECUTE grant
REVOKE EXECUTE ON FUNCTION public.update_account_balance() FROM PUBLIC, anon, authenticated;

-- ── final checks: abort (and change nothing) if the result is not what was meant ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT coalesce((SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class WHERE oid = 'public.v_project_finance_summary'::regclass), false) THEN RAISE EXCEPTION 'The finance view is still not security_invoker. Nothing was changed.'; END IF;
  IF has_table_privilege('anon', 'public.v_project_finance_summary', 'SELECT') THEN RAISE EXCEPTION 'anon can still read the finance view. Nothing was changed.'; END IF;
  IF NOT has_table_privilege('authenticated', 'public.v_project_finance_summary', 'SELECT') THEN RAISE EXCEPTION 'authenticated lost SELECT on the finance view. Nothing was changed.'; END IF;
  IF has_table_privilege('authenticated', 'public.v_project_finance_summary', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN RAISE EXCEPTION 'authenticated can still write to the finance view. Nothing was changed.'; END IF;
  IF has_function_privilege('anon', 'public.admin_delete_user(uuid)', 'EXECUTE') OR has_function_privilege('anon', 'public.get_ar_ap_aging(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.bulk_update_rates(text, text, text, text, text, numeric, date)', 'EXECUTE') OR has_function_privilege('anon', 'public.update_account_balance()', 'EXECUTE')
    THEN RAISE EXCEPTION 'anon can still run one of the functions. Nothing was changed.'; END IF;
  IF NOT (has_function_privilege('authenticated', 'public.get_ar_ap_aging(uuid)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.bulk_update_rates(text, text, text, text, text, numeric, date)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.admin_delete_user(uuid)', 'EXECUTE'))
    THEN RAISE EXCEPTION 'authenticated lost a function the app uses. Nothing was changed.'; END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.admin_delete_user(uuid)'::regprocedure) NOT LIKE '%Only a director can remove another director%'
    THEN RAISE EXCEPTION 'admin_delete_user lost the director rule. Nothing was changed.'; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
