-- Security: worker-portal preparation (run after 20260949000000). Three fixes found while reviewing the worker portal; nothing is added for workers yet.
--
--  1. _hr_self_worker_ids() linked a login to a worker by comparing workers.email with the login's email. Any of the seven staff roles (site_user included) may edit
--     workers.email, so one of them could set a worker's email to their own and then read that worker's payslips (worker_portal_payslips(), worker_portal_ytd() and the
--     "own row" branch of payroll_entries_select_staff_or_self / workers_select_staff_or_self). It now returns nothing. No worker logins exist and payroll_entries is empty,
--     so nothing is lost: the staff branches of those policies (_hr_staff_company() / _payroll_staff_company()) are separate and unchanged, and the one login whose email matches
--     a worker today is a director of another company, who got nothing from it either. The worker portal will use its own token-checked functions, not this one.
--  2. worker_portal_notices: "Director and admin manage notices" was FOR ALL TO public with only "same company" in USING and WITH CHECK, so ANY user of the company could post,
--     edit and delete the notices every worker reads. It is replaced by INSERT / UPDATE / DELETE policies that require an active director or admin OF THAT COMPANY (reading is unchanged).
--     The other two worker_portal_* tables had the same kind of broad policy, fixed the same way:
--       - worker_portal_messages "Message access" (FOR ALL TO public): let a user insert a message with their own worker_user_id and ANY company_id (it landed in another company's inbox),
--         rewrite their rows and delete them. Dropped. messages_insert / messages_update now also bind the row to the caller's company, and a management message may only be addressed
--         to a user of the same company. Nobody deletes messages (the app never does).
--       - worker_portal_notice_reads "Workers manage own reads" (FOR ALL TO public): dropped; inserting or updating a read now requires a notice of the caller's own company.
--     Also: anon held every privilege on the three tables (row-level security stopped it); revoked.
--  3. admin-invite-user (edge function, changed in the same commit): an unknown role is refused with a clear error instead of becoming site_user.
--
-- Read-only on data. Nothing else is touched.

BEGIN;

-- ── safety checks: stop (and change nothing) if the database is not what this file expects ────────────────────────────────────────────────────────────────
DO $$
DECLARE s text; r record;
BEGIN
  FOREACH s IN ARRAY ARRAY['worker_portal_notices', 'worker_portal_messages', 'worker_portal_notice_reads', 'user_profiles'] LOOP
    IF to_regclass('public.' || s) IS NULL THEN RAISE EXCEPTION 'Table public.% was not found. Nothing was changed.', s; END IF;
  END LOOP;
  FOREACH s IN ARRAY ARRAY['worker_portal_notices', 'worker_portal_messages', 'worker_portal_notice_reads'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || s)::regclass) THEN RAISE EXCEPTION 'public.% has no row-level security. Nothing was changed.', s; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = '_hr_self_worker_ids' AND pronargs = 0) <> 1
    THEN RAISE EXCEPTION 'Function public._hr_self_worker_ids() was not found exactly once. Nothing was changed.'; END IF;

  -- exactly the policies we know about (before: the live ones; after a first run: the new ones). Anything else would be a policy we have not reviewed.
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename IN ('worker_portal_notices', 'worker_portal_messages', 'worker_portal_notice_reads')
       AND policyname NOT IN ('Company users read notices', 'notices_select', 'Director and admin manage notices', 'notices_insert', 'notices_update', 'notices_delete',
                              'Message access', 'messages_select', 'messages_insert', 'messages_update',
                              'Workers manage own reads', 'notice_reads_select', 'notice_reads_insert', 'notice_reads_update')
  LOOP
    RAISE EXCEPTION 'Unexpected policy "%" on %. Review it first. Nothing was changed.', r.policyname, r.tablename;
  END LOOP;

  -- what depends on _hr_self_worker_ids(): the two payslip functions and the two "own row" policies, nothing else
  FOR r IN
    SELECT 'function ' || p.proname AS what FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc ILIKE '%_hr_self_worker_ids%' AND p.proname NOT IN ('_hr_self_worker_ids', 'worker_portal_payslips', 'worker_portal_ytd')
    UNION ALL
    SELECT 'policy ' || policyname || ' on ' || tablename FROM pg_policies
     WHERE (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%_hr_self_worker_ids%' AND policyname NOT IN ('payroll_entries_select_staff_or_self', 'workers_select_staff_or_self')
    UNION ALL
    SELECT 'view ' || viewname FROM pg_views WHERE definition ILIKE '%_hr_self_worker_ids%'
  LOOP
    RAISE EXCEPTION 'Something else uses _hr_self_worker_ids(): %. Review it first. Nothing was changed.', r.what;
  END LOOP;
END $$;

-- ── 1. No login is linked to a worker by email any more ──────────────────────────────────────────────────────────────────────────────────────────────────
-- Deliberately empty. There are no worker logins yet, and matching a worker's stored email to the login's email let any staff member who can edit a worker claim that worker's payslips.
-- The worker portal will use its own token-checked functions (like the client portal), not this one.
CREATE OR REPLACE FUNCTION public._hr_self_worker_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT w.id FROM public.workers w WHERE false;
$$;
COMMENT ON FUNCTION public._hr_self_worker_ids() IS 'Always empty: workers are no longer linked to a login by email. The worker portal will use its own token-checked functions.';
REVOKE ALL ON FUNCTION public._hr_self_worker_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._hr_self_worker_ids() TO authenticated, service_role;   -- row-level security policies call it as the signed-in user

-- ── 2a. Notices: only a director or admin of the company writes them ─────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Director and admin manage notices" ON public.worker_portal_notices;
DROP POLICY IF EXISTS notices_insert ON public.worker_portal_notices;
DROP POLICY IF EXISTS notices_update ON public.worker_portal_notices;
DROP POLICY IF EXISTS notices_delete ON public.worker_portal_notices;

CREATE POLICY notices_insert ON public.worker_portal_notices FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active'));
CREATE POLICY notices_update ON public.worker_portal_notices FOR UPDATE TO authenticated
  USING (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active'))
  WITH CHECK (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active'));
CREATE POLICY notices_delete ON public.worker_portal_notices FOR DELETE TO authenticated
  USING (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active'));

-- ── 2b. Messages: no "FOR ALL"; rows stay inside the caller's company ────────────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Message access" ON public.worker_portal_messages;
DROP POLICY IF EXISTS messages_insert ON public.worker_portal_messages;
DROP POLICY IF EXISTS messages_update ON public.worker_portal_messages;

CREATE POLICY messages_insert ON public.worker_portal_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      -- a message from the signed-in user, in their own company
      (sender_type = 'worker' AND worker_user_id = auth.uid()
        AND company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid()))
      -- a reply from management (an active director / admin of the company), to a user of that same company
      OR (sender_type = 'management'
        AND company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active')
        AND EXISTS (SELECT 1 FROM public.user_profiles t WHERE t.id = worker_user_id AND t.company_id = worker_portal_messages.company_id))
    )
  );
CREATE POLICY messages_update ON public.worker_portal_messages FOR UPDATE TO authenticated
  USING (
    worker_user_id = auth.uid()
    OR company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active')
  )
  WITH CHECK (
    (worker_user_id = auth.uid() AND company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid()))
    OR company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active')
  );
-- messages_select is unchanged: your own messages, or every message of your company if you are a director / admin.

-- ── 2c. Notice reads: only your own, only for a notice of your own company ───────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Workers manage own reads" ON public.worker_portal_notice_reads;
DROP POLICY IF EXISTS notice_reads_insert ON public.worker_portal_notice_reads;
DROP POLICY IF EXISTS notice_reads_update ON public.worker_portal_notice_reads;

CREATE POLICY notice_reads_insert ON public.worker_portal_notice_reads FOR INSERT TO authenticated
  WITH CHECK (worker_id = auth.uid() AND notice_id IN (SELECT n.id FROM public.worker_portal_notices n));   -- n is filtered by the notices' own policy: the caller's company
CREATE POLICY notice_reads_update ON public.worker_portal_notice_reads FOR UPDATE TO authenticated
  USING (worker_id = auth.uid())
  WITH CHECK (worker_id = auth.uid() AND notice_id IN (SELECT n.id FROM public.worker_portal_notices n));
-- notice_reads_select is unchanged: your own reads.

-- ── 2d. Signed-out visitors have no business with these tables ───────────────────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON public.worker_portal_notices, public.worker_portal_messages, public.worker_portal_notice_reads FROM PUBLIC, anon;

-- ── final checks: abort (and change nothing) if the result is not what was meant ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public._hr_self_worker_ids()'::regprocedure) ~* '(email|auth\.users)'
    THEN RAISE EXCEPTION '_hr_self_worker_ids() still looks at emails. Nothing was changed.'; END IF;
  IF has_function_privilege('anon', 'public._hr_self_worker_ids()', 'EXECUTE') OR NOT has_function_privilege('authenticated', 'public._hr_self_worker_ids()', 'EXECUTE')
    THEN RAISE EXCEPTION '_hr_self_worker_ids() has the wrong grants. Nothing was changed.'; END IF;

  -- no FOR ALL policy left on the three tables, and every write policy on the notices names director / admin
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('worker_portal_notices', 'worker_portal_messages', 'worker_portal_notice_reads') AND cmd = 'ALL'
  LOOP RAISE EXCEPTION 'Policy "%" on % is still FOR ALL. Nothing was changed.', r.policyname, r.tablename; END LOOP;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worker_portal_notices' AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
              AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%director%'
  LOOP RAISE EXCEPTION 'Notice policy "%" does not check for director / admin. Nothing was changed.', r.policyname; END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'worker_portal_notices' AND cmd IN ('INSERT', 'UPDATE', 'DELETE')) <> 3
    THEN RAISE EXCEPTION 'Expected exactly one INSERT, UPDATE and DELETE policy on worker_portal_notices. Nothing was changed.'; END IF;
  IF has_table_privilege('anon', 'public.worker_portal_notices', 'SELECT, INSERT, UPDATE, DELETE') OR has_table_privilege('anon', 'public.worker_portal_messages', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.worker_portal_notice_reads', 'SELECT, INSERT, UPDATE, DELETE')
    THEN RAISE EXCEPTION 'anon can still reach a worker_portal table. Nothing was changed.'; END IF;
  IF NOT (has_table_privilege('authenticated', 'public.worker_portal_notices', 'SELECT, INSERT, UPDATE, DELETE') AND has_table_privilege('authenticated', 'public.worker_portal_messages', 'SELECT, INSERT, UPDATE')
          AND has_table_privilege('authenticated', 'public.worker_portal_notice_reads', 'SELECT, INSERT, UPDATE'))
    THEN RAISE EXCEPTION 'authenticated lost access to a worker_portal table. Nothing was changed.'; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
