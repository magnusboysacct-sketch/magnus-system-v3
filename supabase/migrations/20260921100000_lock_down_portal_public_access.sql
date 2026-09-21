-- Lock down public (anon) access: drop the open portal policies, restrict projects to logged-in staff, and revoke the public key's direct table rights.
BEGIN;

-- 0. Guard: stop if the public worker-verify view would be affected
DO $$
DECLARE v_opts text[];
BEGIN
  SELECT c.reloptions INTO v_opts
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'worker_verify_view';
  IF v_opts IS NOT NULL AND EXISTS (
       SELECT 1 FROM unnest(v_opts) o
       WHERE o IN ('security_invoker=true','security_invoker=on')) THEN
    RAISE EXCEPTION 'worker_verify_view runs with the caller''s rights. Check it before locking down. Nothing was changed.';
  END IF;
END $$;

-- 1. Remove the open public policies
DROP POLICY IF EXISTS "Public session management"                            ON public.client_portal_sessions;
DROP POLICY IF EXISTS "Anon can look up portal-enabled clients"              ON public.clients;
DROP POLICY IF EXISTS "Public can view contracts for portal-enabled clients" ON public.client_contracts;
DROP POLICY IF EXISTS "Public read change orders"                            ON public.change_orders;
DROP POLICY IF EXISTS "Public update change orders"                          ON public.change_orders;
DROP POLICY IF EXISTS "Public insert reviews"                                ON public.client_reviews;
DROP POLICY IF EXISTS "Public read reviews"                                  ON public.client_reviews;
DROP POLICY IF EXISTS "Public read company settings"                         ON public.company_settings;

-- 2. Projects: logged-in staff keep their access; the public key loses it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'projects_select') THEN
    ALTER POLICY projects_select ON public.projects TO authenticated;
  END IF;
END $$;

-- 3. Take the public key's direct table rights away
REVOKE ALL ON public.clients                FROM anon;
REVOKE ALL ON public.client_portal_sessions FROM anon;
REVOKE ALL ON public.client_contracts       FROM anon;
REVOKE ALL ON public.client_comments        FROM anon;
REVOKE ALL ON public.client_invoices        FROM anon;
REVOKE ALL ON public.client_reviews         FROM anon;
REVOKE ALL ON public.change_orders          FROM anon;
REVOKE ALL ON public.projects               FROM anon;
REVOKE ALL ON public.project_photos         FROM anon;
REVOKE ALL ON public.project_daily_logs     FROM anon;
REVOKE ALL ON public.boq_items              FROM anon;
REVOKE ALL ON public.company_settings       FROM anon;

DO $$
BEGIN
  IF to_regclass('public.v_project_finance_summary') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON public.v_project_finance_summary FROM anon';
  END IF;
END $$;

COMMIT;
