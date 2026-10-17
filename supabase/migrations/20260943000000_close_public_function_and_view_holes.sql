-- Security: close the holes found in the payroll / HR review (run after 20260942000000).
--
--  1. worker_verify_view was readable by anon and, with the owner's rights, listed EVERY company's workers (names, employee numbers, hire dates, ID and passport
--     photo URLs). The public ID-card check page now calls verify_worker(id): one worker at a time, only what the page shows. The view is closed to anon.
--  2. Every SECURITY DEFINER function in the public schema was executable by anon (Postgres gives EXECUTE to PUBLIC by default), and most of them never check who
--     is calling. That is:
--       a. the 15 functions that take a company id (finance, bank matching, finance files, cost codes, company settings): each now refuses unless the caller is
--          staff of THAT company (or the service role / a direct database connection), and is no longer executable by anon;
--       b. every other SECURITY DEFINER function: no longer executable by anon, except the ones the signed-out pages really use (listed below);
--       c. admin_delete_auth_user (deletes a login by id, with no check at all) is service_role only; the admin-delete-user edge function is its only caller.
--  3. projects_select had "OR true": every signed-in user could read every company's projects. Now: your own company's.
--  4. access_logs: any signed-in user could read every company's rows and anyone, signed out too, could insert. Now: director / admin of the company.
--
-- Signed-out (anon) keeps EXACTLY these functions, because the public pages call them:
--     get_portal_link_info, get_contact_portal_link_info, get_portal_data, get_portal_comments, get_portal_contracts, get_portal_contract_schedule,
--     get_portal_estimates, get_portal_invoices, insert_portal_comment, log_portal_event, portal_logout, respond_portal_change_order, submit_portal_review
--         -> the client portal (/portal/..., checked by the portal token / session token inside each function)
--     get_login_branding                -> the client login page's company logo
--     get_public_receipt                -> /receipt/:token
--     get_share_preview                 -> the link-preview pages (WhatsApp / social)
--     verify_worker                     -> /verify/:workerId (the QR on a worker ID card)
-- No other table or function is touched. Read-only on data.

BEGIN;

-- ── 1. Public ID-card check ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Exactly what WorkerVerifyPage shows: name, role, status, employee number, hire date, photo, company name and logo; plus whether the card is still valid
-- The photo is the passport / profile photo ONLY: id_photo_url (the scan of the ID document) is never returned.
-- (status active and not past its expiry; the expiry is id_expiry_date, or hire date + 2 years when unset, as the ID card itself does). NULL if unknown.
CREATE OR REPLACE FUNCTION public.verify_worker(p_worker_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
           'id', w.id,
           'first_name', w.first_name,
           'last_name', w.last_name,
           'worker_type', w.worker_type,
           'status', w.status,
           'employee_id', w.employee_id,
           'hire_date', w.hire_date,
           'photo_url', nullif(btrim(w.passport_photo_url), ''),
           'company_name', cs.company_name,
           'logo_url', cs.logo_url,
           'expired', coalesce(coalesce(w.id_expiry_date, w.hire_date + interval '2 years') < current_date, false),
           'valid', (w.status = 'active' AND NOT coalesce(coalesce(w.id_expiry_date, w.hire_date + interval '2 years') < current_date, false)))
    FROM workers w
    LEFT JOIN company_settings cs ON cs.company_id = w.company_id
   WHERE w.id = p_worker_id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_worker(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_worker(uuid) TO anon, authenticated, service_role;

-- The view nobody else uses: signed-in users now see it with their own rights (their company's workers), and signed-out users not at all.
ALTER VIEW public.worker_verify_view SET (security_invoker = true);
REVOKE ALL ON public.worker_verify_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.worker_verify_view TO authenticated;

-- ── 2a. Functions that take a company id: refuse unless the caller belongs to that company ───────────────────────────────────────
-- Allowed: staff of exactly that company (any of the seven roles), the service role (edge functions), and a direct database connection (migrations, cron, SQL editor).
-- A signed-out caller, a signed-in user of another company, or a non-staff account is refused.
CREATE OR REPLACE FUNCTION public._caller_may_use_company(p_company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role   text;
BEGIN
  IF v_claims IS NULL AND session_user <> 'authenticator' THEN RETURN true; END IF;   -- not through the API: a direct database connection
  IF v_claims IS NOT NULL THEN
    BEGIN v_role := v_claims::jsonb ->> 'role'; EXCEPTION WHEN others THEN v_role := NULL; END;
    IF v_role = 'service_role' THEN RETURN true; END IF;
  END IF;
  RETURN coalesce(p_company_id IS NOT NULL AND p_company_id = (
    SELECT up.company_id FROM user_profiles up
     WHERE up.id = auth.uid()
       AND up.role IN ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary')
     LIMIT 1), false);
END;
$$;
REVOKE ALL ON FUNCTION public._caller_may_use_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._caller_may_use_company(uuid) TO authenticated, service_role;

-- Each function below keeps its exact name, arguments, defaults and result; its original body is kept as <name>_unchecked (not callable by clients) and the
-- public name becomes a wrapper that runs the check first. Generated from the catalog, so the signatures cannot drift. Stops (changes nothing) if one is missing.
DO $$
DECLARE
  v_names   text[] := ARRAY[
    'calculate_free_cash(uuid)',
    'classify_transaction(uuid, text, numeric, text, date)',
    'evaluate_draw_safety(numeric, uuid)',
    'get_company_cost_codes(uuid)',
    'get_confidence_score(uuid, text, numeric, text, text, jsonb)',
    'get_finance_dashboard_project_summary(uuid, date, date, uuid)',
    'get_finance_file_stats(uuid)',
    'get_monthly_storage_usage(uuid, integer)',
    'get_or_create_company_settings(uuid)',
    'get_outstanding_payables(uuid)',
    'get_outstanding_receivables(uuid)',
    'get_unmatched_credit_card_transactions(uuid, integer)',
    'get_unmatched_transactions_for_matching(uuid, integer)',
    'match_transaction(uuid, text, numeric, date, text, text)',
    'search_finance_files(uuid, text, text, date, date, text[])'];
  s         text;
  v_oid     oid;
  r         record;
  v_in      text;
  v_company text;
  v_body    text;
  v_vol     text;
BEGIN
  FOREACH s IN ARRAY v_names LOOP
    v_oid := to_regprocedure('public.' || s);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Function public.% was not found. Nothing was changed.', s; END IF;

    SELECT p.proname, pg_get_function_arguments(p.oid) AS fa, pg_get_function_identity_arguments(p.oid) AS ia, pg_get_function_result(p.oid) AS res,
           (SELECT string_agg(u.t::regtype::text, ', ' ORDER BY u.o) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS u(t, o)) AS ty,
           p.proretset, p.prorettype::regtype::text AS rt, p.provolatile, p.prosecdef
      INTO r FROM pg_proc p WHERE p.oid = v_oid;

    IF to_regprocedure(format('public.%I(%s)', r.proname || '_unchecked', r.ty)) IS NOT NULL THEN CONTINUE; END IF;   -- already wrapped (re-run)
    IF NOT r.prosecdef THEN RAISE EXCEPTION 'public.% is not SECURITY DEFINER any more. Nothing was changed.', s; END IF;

    SELECT string_agg(quote_ident(t.nm), ', ' ORDER BY t.ord),
           (array_agg(quote_ident(t.nm) ORDER BY t.ord) FILTER (WHERE t.nm ~ '^(p_|_|target_)?company_id$'))[1]
      INTO v_in, v_company
      FROM pg_proc p,
           unnest(p.proargnames, coalesce(p.proargmodes, array_fill('i'::"char", ARRAY[cardinality(p.proargnames)]))) WITH ORDINALITY AS t(nm, md, ord)
     WHERE p.oid = v_oid AND t.md IN ('i', 'b', 'v');
    IF v_in IS NULL OR v_company IS NULL THEN RAISE EXCEPTION 'public.%: no named company id argument. Nothing was changed.', s; END IF;

    v_body := CASE
      WHEN r.rt = 'void'                          THEN format('PERFORM public.%I(%s);', r.proname || '_unchecked', v_in)
      WHEN r.proretset OR r.res LIKE 'TABLE(%'    THEN format('RETURN QUERY SELECT * FROM public.%I(%s);', r.proname || '_unchecked', v_in)
      ELSE                                             format('RETURN public.%I(%s);', r.proname || '_unchecked', v_in)
    END;
    v_vol := CASE r.provolatile WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE 'VOLATILE' END;

    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', r.proname, r.ia, r.proname || '_unchecked');
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated, service_role', r.proname || '_unchecked', r.ia);
    EXECUTE format($f$CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $b$
BEGIN
  IF public._caller_may_use_company(%s) IS NOT TRUE THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  %s
END;
$b$ $f$, r.proname, r.fa, r.res, v_vol, v_company, v_body);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.ia);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.ia);
  END LOOP;
END $$;

-- ── 2b. Every other SECURITY DEFINER function: closed to anon, except what the signed-out pages use (listed at the top) ────────────
-- Postgres gives EXECUTE to PUBLIC when a function is created, which is how anon could call them all; revoke that and give it back to signed-in users and the
-- service role only. (The *_unchecked originals above stay closed to everyone but the database owner.)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.proname NOT LIKE '%\_unchecked'
       AND p.proname <> ALL (ARRAY[
             'get_portal_link_info', 'get_contact_portal_link_info', 'get_portal_data', 'get_portal_comments', 'get_portal_contracts', 'get_portal_contract_schedule',
             'get_portal_estimates', 'get_portal_invoices', 'insert_portal_comment', 'log_portal_event', 'portal_logout', 'respond_portal_change_order',
             'submit_portal_review', 'get_login_branding', 'get_public_receipt', 'get_share_preview', 'verify_worker'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- 2c. Deletes a login (identities, sessions, auth.users row) for any id, with no check: only the admin-delete-user edge function (service role) calls it.
REVOKE ALL ON FUNCTION public.admin_delete_auth_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_auth_user(uuid) TO service_role;

-- 2d. A policy that applies to signed-out users (PUBLIC / anon) and calls a function closed to anon above would make an anon query on that table ERROR
-- instead of returning nothing. The only one is assemblies_write_admin (calls is_company_admin()); it only ever matched signed-in company admins, so it is
-- restricted to signed-in users, which changes nothing for anyone who could use it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assemblies' AND policyname = 'assemblies_write_admin') THEN
    ALTER POLICY assemblies_write_admin ON public.assemblies TO authenticated;
  END IF;
END $$;

-- NOTE for new functions: Postgres still gives EXECUTE to PUBLIC on every new function, so every future RPC migration must start with
--   REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;   (and GRANT ... TO anon only for a function a signed-out page needs), as the receipt / verify ones do.

-- ── 3. projects: your own company's projects only ──────────────────────────────────────────────────────────────────────────────
-- (The client portal reads projects through get_portal_data and the other get_portal_* functions, which run with the owner's rights, not through this policy.)
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
  USING (company_id = (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() LIMIT 1));

-- ── 4. access_logs: director / admin of the company; nothing for anon ─────────────────────────────────────────────────────────
-- (Nothing in the app inserts access logs yet; inserts are limited to the same people.)
DROP POLICY IF EXISTS "Allow authenticated reads" ON public.access_logs;
DROP POLICY IF EXISTS "Allow all access log inserts" ON public.access_logs;
DROP POLICY IF EXISTS "access_logs_select_admin" ON public.access_logs;
DROP POLICY IF EXISTS "access_logs_insert_admin" ON public.access_logs;
CREATE POLICY "access_logs_select_admin" ON public.access_logs FOR SELECT TO authenticated
  USING (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin')));
CREATE POLICY "access_logs_insert_admin" ON public.access_logs FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin')));
REVOKE ALL ON public.access_logs FROM anon;

-- ── 5. Safety checks: stop and change nothing if something unexpected is left ────────────────────────────────────────────────
-- (a) a policy for signed-out users (PUBLIC / anon, any table, any schema incl. storage) that still calls a function anon can no longer execute
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.schemaname, p.tablename, p.policyname, f.proname
      FROM pg_policies p
      JOIN pg_proc f ON f.pronamespace = 'public'::regnamespace AND f.prokind = 'f' AND NOT has_function_privilege('anon', f.oid, 'EXECUTE')
     WHERE p.roles && ARRAY['public', 'anon']::name[]
       AND (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ ('(^|[^a-zA-Z0-9_])' || f.proname || '\s*\(')
  LOOP
    RAISE EXCEPTION 'Policy % on %.% (for signed-out users) calls %(), which anon can no longer execute. Nothing was changed.', r.policyname, r.schemaname, r.tablename, r.proname;
  END LOOP;
END $$;

-- (b) an unexpected policy on projects / access_logs
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename IN ('projects', 'access_logs')
       AND (p.tablename, p.policyname) NOT IN (
         ('projects', 'projects_select'), ('projects', 'projects_insert'), ('projects', 'projects_update'), ('projects', 'projects_delete'),
         ('access_logs', 'access_logs_select_admin'), ('access_logs', 'access_logs_insert_admin'))
  LOOP
    RAISE EXCEPTION 'Unexpected policy "%" on %. Nothing was changed.', r.policyname, r.tablename;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
