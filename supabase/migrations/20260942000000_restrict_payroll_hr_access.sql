-- Security: payroll / HR data was readable (and writable) by ANY signed-in user of the company.
--
-- The policies on workers, payroll_entries, worker_tax_info, owner_salary, payroll_periods, ... only said "company_id is my company". Any account of the
-- company, including a worker-portal account, could read every colleague's pay, bank details and tax numbers through the API. This migration:
--
--   * staff roles keep company-wide access (two tiers, see the helper functions);
--   * every other role (a worker-portal 'worker', or anything else) can read ONLY its own workers row and its own payroll_entries,
--     found through the one link the app already uses: workers.email = the account's login e-mail (workerPortal.ts), same company, status active;
--   * writes on these tables are staff-only;
--   * the worker portal keeps working: its payslip / year-to-date queries move to two SECURITY DEFINER functions that return only the caller's own rows
--     (payroll_periods carries company-wide totals, so a worker must not be given SELECT on it just to show a pay date);
--   * the owner-rights views and the company-id-taking SECURITY DEFINER functions that bypassed these policies (and were open to anon) are closed.
--
-- Who gets what (all allow-lists): staff directory / time / field payments = the seven roles; payroll (entries, periods, tax numbers, the /payroll page's
-- runs and remittances) = director, admin, secretary; payroll governance (comparison reviews, migration approvals) and owner finance (owner salary, owner
-- accounts, owner draws) = director, admin; cash-flow functions = users whose finance_access_level is 'full' (what the Cash Flow page checks).
-- Run once; read-only on data.

BEGIN;

-- ── 1. Who is who ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Tier 1 (people directory, time, field payments): the seven roles user_profiles.role allows today.
-- Tier 2 (payroll: entries, periods, tax numbers, calculation audit, configuration): director, admin and secretary, who run payroll (the app's /payroll guard).
-- Payroll governance (comparison reviews, migration approvals) stays director + admin, like their screens; owner finance is director + admin;
-- the cash functions need finance_access_level = 'full', like the Cash Flow page.
-- All are allow-lists, so a role that is not listed (a 'worker', or any role added later) gets nothing by default.
CREATE OR REPLACE FUNCTION public._hr_staff_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT up.company_id FROM user_profiles up
   WHERE up.id = auth.uid()
     AND up.role IN ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary')
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._payroll_staff_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT up.company_id FROM user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin', 'secretary') LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._payroll_admin_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT up.company_id FROM user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._owner_finance_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT up.company_id FROM user_profiles up WHERE up.id = auth.uid() AND up.role IN ('director', 'admin') LIMIT 1;
$$;

-- Same test as the app's FinanceGuard level="full" / canViewCashFlow (user_profiles.finance_access_level = 'full'), for a staff role.
CREATE OR REPLACE FUNCTION public._finance_full_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT up.company_id FROM user_profiles up
   WHERE up.id = auth.uid()
     AND up.finance_access_level = 'full'
     AND up.role IN ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary')
   LIMIT 1;
$$;

-- The workers row(s) of the signed-in account: same company, active, and the worker's e-mail is the account's LOGIN e-mail (auth.users, which the user
-- cannot edit in user_profiles; the app's worker portal matches the same way).
CREATE OR REPLACE FUNCTION public._hr_self_worker_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT w.id
    FROM workers w
    JOIN auth.users u      ON u.id = auth.uid()
    JOIN user_profiles up  ON up.id = u.id AND up.company_id = w.company_id
   WHERE w.status = 'active'
     AND nullif(btrim(w.email), '') IS NOT NULL
     AND lower(btrim(w.email)) = lower(btrim(u.email));
$$;

REVOKE ALL ON FUNCTION public._hr_staff_company(), public._payroll_staff_company(), public._payroll_admin_company(), public._owner_finance_company(),
                       public._finance_full_company(), public._hr_self_worker_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._hr_staff_company(), public._payroll_staff_company(), public._payroll_admin_company(), public._owner_finance_company(),
                          public._finance_full_company(), public._hr_self_worker_ids() TO authenticated;

-- ── 2. workers: staff see the company; anyone else only their own row ───────────────────────────────────────────────────────────
-- (INSERT "Managers can insert company workers" and DELETE "workers_delete_policy" are already role-gated and stay as they are.)
DROP POLICY IF EXISTS "Users can view their company workers" ON public.workers;
DROP POLICY IF EXISTS "workers_select_staff_or_self" ON public.workers;
CREATE POLICY "workers_select_staff_or_self" ON public.workers FOR SELECT TO authenticated
  USING (company_id = (SELECT public._hr_staff_company()) OR id IN (SELECT public._hr_self_worker_ids()));

DROP POLICY IF EXISTS "Users can update their company workers" ON public.workers;
DROP POLICY IF EXISTS "workers_update_staff" ON public.workers;
CREATE POLICY "workers_update_staff" ON public.workers FOR UPDATE TO authenticated
  USING (company_id = (SELECT public._hr_staff_company()))
  WITH CHECK (company_id = (SELECT public._hr_staff_company()));

-- ── 3. payroll_entries: payroll staff see the company; a worker only their own entries; writes are payroll-staff only ────────────
DROP POLICY IF EXISTS "Users can view their company payroll entries" ON public.payroll_entries;
DROP POLICY IF EXISTS "Users can manage their company payroll entries" ON public.payroll_entries;
DROP POLICY IF EXISTS "payroll_entries_select_staff_or_self" ON public.payroll_entries;
CREATE POLICY "payroll_entries_select_staff_or_self" ON public.payroll_entries FOR SELECT TO authenticated
  USING (company_id = (SELECT public._payroll_staff_company())
         OR (worker_id IN (SELECT public._hr_self_worker_ids()) AND company_id = (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid())));
DROP POLICY IF EXISTS "payroll_entries_insert_staff" ON public.payroll_entries;
CREATE POLICY "payroll_entries_insert_staff" ON public.payroll_entries FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public._payroll_staff_company()));
DROP POLICY IF EXISTS "payroll_entries_update_staff" ON public.payroll_entries;
CREATE POLICY "payroll_entries_update_staff" ON public.payroll_entries FOR UPDATE TO authenticated
  USING (company_id = (SELECT public._payroll_staff_company())) WITH CHECK (company_id = (SELECT public._payroll_staff_company()));
DROP POLICY IF EXISTS "payroll_entries_delete_staff" ON public.payroll_entries;
CREATE POLICY "payroll_entries_delete_staff" ON public.payroll_entries FOR DELETE TO authenticated
  USING (company_id = (SELECT public._payroll_staff_company()));

-- ── 4. Payroll-only tables (no own-row access): payroll staff (director / admin / secretary), nobody else ────────────────────────
-- worker_tax_info (TRN / NIS numbers), payroll_periods (company totals), payroll_calculation_audit, payroll_configuration, payroll_tax_settings (read; its
-- writes are already director-only). payroll_comparison_reviews and payroll_migration_approvals are the payroll-engine cut-over governance screens
-- (director / admin only in the app), so they stay director + admin. owner_salary and the other owner tables are in section 4b.
DROP POLICY IF EXISTS "Users can view their company worker tax info" ON public.worker_tax_info;
DROP POLICY IF EXISTS "Users can manage their company worker tax info" ON public.worker_tax_info;
DROP POLICY IF EXISTS "worker_tax_info_staff" ON public.worker_tax_info;
CREATE POLICY "worker_tax_info_staff" ON public.worker_tax_info FOR ALL TO authenticated
  USING (company_id = (SELECT public._payroll_staff_company())) WITH CHECK (company_id = (SELECT public._payroll_staff_company()));

DROP POLICY IF EXISTS "Users can view their company payroll periods" ON public.payroll_periods;
DROP POLICY IF EXISTS "Users can manage their company payroll periods" ON public.payroll_periods;
DROP POLICY IF EXISTS "payroll_periods_staff" ON public.payroll_periods;
CREATE POLICY "payroll_periods_staff" ON public.payroll_periods FOR ALL TO authenticated
  USING (company_id = (SELECT public._payroll_staff_company())) WITH CHECK (company_id = (SELECT public._payroll_staff_company()));

DROP POLICY IF EXISTS "Users can view their company payroll comparison reviews" ON public.payroll_comparison_reviews;
DROP POLICY IF EXISTS "Users can manage their company payroll comparison reviews" ON public.payroll_comparison_reviews;
DROP POLICY IF EXISTS "payroll_comparison_reviews_staff" ON public.payroll_comparison_reviews;
CREATE POLICY "payroll_comparison_reviews_staff" ON public.payroll_comparison_reviews FOR ALL TO authenticated
  USING (company_id = (SELECT public._payroll_admin_company())) WITH CHECK (company_id = (SELECT public._payroll_admin_company()));

DROP POLICY IF EXISTS "Users can view own company payroll audit" ON public.payroll_calculation_audit;
DROP POLICY IF EXISTS "Users can insert own company payroll audit" ON public.payroll_calculation_audit;
DROP POLICY IF EXISTS "payroll_calculation_audit_staff" ON public.payroll_calculation_audit;
CREATE POLICY "payroll_calculation_audit_staff" ON public.payroll_calculation_audit FOR ALL TO authenticated
  USING (company_id = (SELECT public._payroll_staff_company())) WITH CHECK (company_id = (SELECT public._payroll_staff_company()));

DROP POLICY IF EXISTS "Users can view own company payroll configuration" ON public.payroll_configuration;
DROP POLICY IF EXISTS "Users can insert own company payroll configuration" ON public.payroll_configuration;
DROP POLICY IF EXISTS "Users can update own company payroll configuration" ON public.payroll_configuration;
DROP POLICY IF EXISTS "Users can delete own company payroll configuration" ON public.payroll_configuration;
DROP POLICY IF EXISTS "payroll_configuration_staff" ON public.payroll_configuration;
CREATE POLICY "payroll_configuration_staff" ON public.payroll_configuration FOR ALL TO authenticated
  USING (company_id = (SELECT public._payroll_staff_company())) WITH CHECK (company_id = (SELECT public._payroll_staff_company()));

DROP POLICY IF EXISTS "Users can view their company payroll migration approvals" ON public.payroll_migration_approvals;
DROP POLICY IF EXISTS "Users can manage their company payroll migration approvals" ON public.payroll_migration_approvals;
DROP POLICY IF EXISTS "payroll_migration_approvals_staff" ON public.payroll_migration_approvals;
CREATE POLICY "payroll_migration_approvals_staff" ON public.payroll_migration_approvals FOR ALL TO authenticated
  USING (company_id = (SELECT public._payroll_admin_company())) WITH CHECK (company_id = (SELECT public._payroll_admin_company()));

DROP POLICY IF EXISTS "Users can view their company owner salary" ON public.owner_salary;
DROP POLICY IF EXISTS "Users can manage their company owner salary" ON public.owner_salary;
DROP POLICY IF EXISTS "owner_salary_staff" ON public.owner_salary;
CREATE POLICY "owner_salary_staff" ON public.owner_salary FOR ALL TO authenticated
  USING (company_id = (SELECT public._owner_finance_company())) WITH CHECK (company_id = (SELECT public._owner_finance_company()));

DROP POLICY IF EXISTS "payroll_tax_settings_select" ON public.payroll_tax_settings;
DROP POLICY IF EXISTS "payroll_tax_settings_select" ON public.payroll_tax_settings;
CREATE POLICY "payroll_tax_settings_select" ON public.payroll_tax_settings FOR SELECT TO authenticated
  USING (company_id = (SELECT public._payroll_staff_company()));

-- ── 4b. Owner finance (owner salary, accounts, draws): director + admin; each owner still reads their own rows ─────────────────────
-- owner_accounts and owner_draws are what v_owner_financial_summary (section 7) reads, so they are covered here too. Their own-rows policies stay.
DROP POLICY IF EXISTS "Users can view their company owner accounts" ON public.owner_accounts;
DROP POLICY IF EXISTS "Users can manage their company owner accounts" ON public.owner_accounts;
DROP POLICY IF EXISTS "owner_accounts_staff" ON public.owner_accounts;
CREATE POLICY "owner_accounts_staff" ON public.owner_accounts FOR ALL TO authenticated
  USING (company_id = (SELECT public._owner_finance_company())) WITH CHECK (company_id = (SELECT public._owner_finance_company()));

DROP POLICY IF EXISTS "Users can view their company owner draws" ON public.owner_draws;
DROP POLICY IF EXISTS "Users can manage their company owner draws" ON public.owner_draws;
DROP POLICY IF EXISTS "owner_draws_staff" ON public.owner_draws;
CREATE POLICY "owner_draws_staff" ON public.owner_draws FOR ALL TO authenticated
  USING (company_id = (SELECT public._owner_finance_company())) WITH CHECK (company_id = (SELECT public._owner_finance_company()));

-- ── 4c. The /payroll page's own tables (staff payroll runs, government remittances): the secretary runs payroll, so she is added ──
-- Same policies as before (director / admin; 'accounts' is not a live role and is kept only so nothing else changes) plus 'secretary'.
DROP POLICY IF EXISTS "staff_payroll_runs_select" ON public.staff_payroll_runs;
CREATE POLICY "staff_payroll_runs_select" ON public.staff_payroll_runs FOR SELECT TO authenticated
  USING (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['director', 'admin', 'accounts', 'secretary'])));
DROP POLICY IF EXISTS "staff_payroll_runs_insert" ON public.staff_payroll_runs;
CREATE POLICY "staff_payroll_runs_insert" ON public.staff_payroll_runs FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['director', 'admin', 'accounts', 'secretary'])));
DROP POLICY IF EXISTS "staff_payroll_runs_update" ON public.staff_payroll_runs;
CREATE POLICY "staff_payroll_runs_update" ON public.staff_payroll_runs FOR UPDATE TO authenticated
  USING (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['director', 'admin', 'accounts', 'secretary'])))
  WITH CHECK (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['director', 'admin', 'accounts', 'secretary'])));

DROP POLICY IF EXISTS "government_remittances_select" ON public.government_remittances;
CREATE POLICY "government_remittances_select" ON public.government_remittances FOR SELECT TO authenticated
  USING (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['director', 'admin', 'accounts', 'secretary'])));
DROP POLICY IF EXISTS "government_remittances_insert" ON public.government_remittances;
CREATE POLICY "government_remittances_insert" ON public.government_remittances FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['director', 'admin', 'accounts', 'secretary'])));
DROP POLICY IF EXISTS "government_remittances_update" ON public.government_remittances;
CREATE POLICY "government_remittances_update" ON public.government_remittances FOR UPDATE TO authenticated
  USING (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['director', 'admin', 'accounts', 'secretary'])))
  WITH CHECK (company_id IN (SELECT up.company_id FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role = ANY (ARRAY['director', 'admin', 'accounts', 'secretary'])));

-- ── 5. Field-side HR records (time entries, field payments with workers' ID numbers / phones / signatures): staff roles only ─────
DROP POLICY IF EXISTS "Users can view their company time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can manage their company time entries" ON public.time_entries;
DROP POLICY IF EXISTS "time_entries_staff" ON public.time_entries;
CREATE POLICY "time_entries_staff" ON public.time_entries FOR ALL TO authenticated
  USING (company_id = (SELECT public._hr_staff_company())) WITH CHECK (company_id = (SELECT public._hr_staff_company()));

DROP POLICY IF EXISTS "Company users can view field payments" ON public.field_payments;
DROP POLICY IF EXISTS "Company users can insert field payments" ON public.field_payments;
DROP POLICY IF EXISTS "Company users can update field payments" ON public.field_payments;
DROP POLICY IF EXISTS "Company users can delete field payments" ON public.field_payments;
DROP POLICY IF EXISTS "field_payments_staff" ON public.field_payments;
CREATE POLICY "field_payments_staff" ON public.field_payments FOR ALL TO authenticated
  USING (company_id = (SELECT public._hr_staff_company())) WITH CHECK (company_id = (SELECT public._hr_staff_company()));

DROP POLICY IF EXISTS "Company users can manage field payment signatures" ON public.field_payment_signatures;
DROP POLICY IF EXISTS "field_payment_signatures_staff" ON public.field_payment_signatures;
CREATE POLICY "field_payment_signatures_staff" ON public.field_payment_signatures FOR ALL TO authenticated
  USING (company_id = (SELECT public._hr_staff_company())) WITH CHECK (company_id = (SELECT public._hr_staff_company()));

DROP POLICY IF EXISTS "Company users can manage field payment receipts" ON public.field_payment_receipts;
DROP POLICY IF EXISTS "field_payment_receipts_staff" ON public.field_payment_receipts;
CREATE POLICY "field_payment_receipts_staff" ON public.field_payment_receipts FOR ALL TO authenticated
  USING (company_id = (SELECT public._hr_staff_company())) WITH CHECK (company_id = (SELECT public._hr_staff_company()));

-- Nothing signed-out has any business here (the policies above never matched anon, this removes the table privilege too).
REVOKE ALL ON public.workers, public.payroll_entries, public.worker_tax_info, public.owner_salary, public.owner_accounts, public.owner_draws, public.payroll_periods, public.payroll_comparison_reviews,
              public.payroll_calculation_audit, public.payroll_configuration, public.payroll_migration_approvals, public.time_entries,
              public.field_payments, public.field_payment_signatures, public.field_payment_receipts FROM anon;

-- ── 6. The worker portal's own data: payslips and year-to-date, own rows only ────────────────────────────────────────────────
-- Same JSON shape the portal's embedded select returned, so the page code only swaps the call. SECURITY DEFINER because payroll_periods (company totals) is
-- no longer readable by a worker; the functions return the caller's own entries and only the three period dates.
CREATE OR REPLACE FUNCTION public.worker_portal_payslips(p_limit integer DEFAULT 12)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
           'id', e.id, 'worker_id', e.worker_id, 'payroll_period_id', e.payroll_period_id,
           'regular_hours', e.regular_hours, 'overtime_hours', e.overtime_hours, 'regular_pay', e.regular_pay, 'overtime_pay', e.overtime_pay,
           'gross_pay', e.gross_pay, 'federal_tax', e.federal_tax, 'state_tax', e.state_tax, 'social_security', e.social_security, 'medicare', e.medicare,
           'health_insurance', e.health_insurance, 'retirement_401k', e.retirement_401k, 'other_deductions', e.other_deductions,
           'total_deductions', e.total_deductions, 'net_pay', e.net_pay, 'status', e.status, 'created_at', e.created_at,
           'payroll_periods', jsonb_build_object('period_start', p.period_start, 'period_end', p.period_end, 'pay_date', p.pay_date))
    FROM payroll_entries e
    LEFT JOIN payroll_periods p ON p.id = e.payroll_period_id AND p.company_id = e.company_id
   WHERE e.worker_id IN (SELECT public._hr_self_worker_ids())
   ORDER BY e.created_at DESC
   LIMIT greatest(1, least(coalesce(p_limit, 12), 120));
$$;

CREATE OR REPLACE FUNCTION public.worker_portal_ytd(p_year integer DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
           'worker_id', e.worker_id, 'gross_pay', e.gross_pay, 'federal_tax', e.federal_tax, 'state_tax', e.state_tax, 'social_security', e.social_security,
           'medicare', e.medicare, 'health_insurance', e.health_insurance, 'retirement_401k', e.retirement_401k, 'total_deductions', e.total_deductions,
           'net_pay', e.net_pay, 'payroll_periods', jsonb_build_object('period_start', p.period_start, 'period_end', p.period_end))
    FROM payroll_entries e
    JOIN payroll_periods p ON p.id = e.payroll_period_id AND p.company_id = e.company_id
   WHERE e.worker_id IN (SELECT public._hr_self_worker_ids())
     AND e.status = 'paid'
     AND p.period_end >= make_date(coalesce(p_year, extract(year FROM now())::int), 1, 1)
     AND p.period_end <= make_date(coalesce(p_year, extract(year FROM now())::int), 12, 31);
$$;

REVOKE ALL ON FUNCTION public.worker_portal_payslips(integer), public.worker_portal_ytd(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_portal_payslips(integer), public.worker_portal_ytd(integer) TO authenticated;

-- ── 7. Paths that went around the policies ───────────────────────────────────────────────────────────────────────────────────
-- (a) Two views ran with their owner's rights (so row-level security did not apply) and were readable by anon: v_owner_financial_summary (owner e-mail, salary,
--     draws) and field_payment_summary (payment totals of every company). They now run with the caller's rights, for signed-in users only.
--     (worker_verify_view is the public ID-card check page and is left as it is; see the report.)
ALTER VIEW public.v_owner_financial_summary SET (security_invoker = true);
ALTER VIEW public.field_payment_summary     SET (security_invoker = true);
REVOKE ALL ON public.v_owner_financial_summary, public.field_payment_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_owner_financial_summary, public.field_payment_summary TO authenticated;

-- (b) Three SECURITY DEFINER functions took the company id from the CALLER, were executable by anon, and return payroll and cash totals: anyone who knew a
--     company id could read its figures. The original bodies are kept (renamed, not callable by clients) and the public names now check that the caller has
--     full finance access (finance_access_level = 'full', what the Cash Flow page requires) in exactly that company. Same arguments, same result columns.
DO $$
BEGIN
  IF to_regprocedure('public.get_upcoming_payroll_unchecked(uuid, integer)') IS NULL THEN
    ALTER FUNCTION public.get_upcoming_payroll(uuid, integer) RENAME TO get_upcoming_payroll_unchecked;
  END IF;
  IF to_regprocedure('public.get_cash_flow_forecast_unchecked(uuid, date, date, text)') IS NULL THEN
    ALTER FUNCTION public.get_cash_flow_forecast(uuid, date, date, text) RENAME TO get_cash_flow_forecast_unchecked;
  END IF;
  IF to_regprocedure('public.get_cash_position_summary_unchecked(uuid)') IS NULL THEN
    ALTER FUNCTION public.get_cash_position_summary(uuid) RENAME TO get_cash_position_summary_unchecked;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.get_upcoming_payroll_unchecked(uuid, integer), public.get_cash_flow_forecast_unchecked(uuid, date, date, text),
                       public.get_cash_position_summary_unchecked(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_upcoming_payroll(p_company_id uuid, p_weeks_ahead integer DEFAULT 12)
RETURNS TABLE(period_id uuid, period_start date, period_end date, pay_date date, status text, estimated_amount numeric, is_forecast boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_company_id IS NULL OR p_company_id IS DISTINCT FROM (SELECT public._finance_full_company()) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.get_upcoming_payroll_unchecked(p_company_id, p_weeks_ahead);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_flow_forecast(p_company_id uuid, p_start_date date DEFAULT CURRENT_DATE, p_end_date date DEFAULT (CURRENT_DATE + 90), p_interval text DEFAULT 'week')
RETURNS TABLE(period_start date, period_end date, period_label text, expected_inflows numeric, expected_outflows numeric, net_cash_flow numeric,
              receivables_count integer, payables_count integer, payroll_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_company_id IS NULL OR p_company_id IS DISTINCT FROM (SELECT public._finance_full_company()) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.get_cash_flow_forecast_unchecked(p_company_id, p_start_date, p_end_date, p_interval);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_position_summary(p_company_id uuid)
RETURNS TABLE(current_cash_balance numeric, total_receivables numeric, total_payables numeric, upcoming_payroll_30_days numeric, net_cash_position numeric,
              receivables_30_days numeric, receivables_60_days numeric, receivables_90_days numeric, payables_30_days numeric, payables_60_days numeric, payables_90_days numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_company_id IS NULL OR p_company_id IS DISTINCT FROM (SELECT public._finance_full_company()) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.get_cash_position_summary_unchecked(p_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_upcoming_payroll(uuid, integer), public.get_cash_flow_forecast(uuid, date, date, text), public.get_cash_position_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_upcoming_payroll(uuid, integer), public.get_cash_flow_forecast(uuid, date, date, text), public.get_cash_position_summary(uuid) TO authenticated;

-- ── 8. Safety check: if any OTHER policy is still on these tables (an old company-wide policy under a name this file did not know), stop and change nothing ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename IN ('workers', 'payroll_entries', 'worker_tax_info', 'payroll_periods', 'payroll_comparison_reviews', 'payroll_calculation_audit',
                           'payroll_configuration', 'payroll_migration_approvals', 'owner_salary', 'owner_accounts', 'owner_draws', 'staff_payroll_runs',
                           'government_remittances', 'payroll_tax_settings', 'time_entries', 'field_payments', 'field_payment_signatures', 'field_payment_receipts')
       AND (p.tablename, p.policyname) NOT IN (
         ('workers', 'workers_select_staff_or_self'), ('workers', 'workers_update_staff'), ('workers', 'Managers can insert company workers'), ('workers', 'workers_delete_policy'),
         ('payroll_entries', 'payroll_entries_select_staff_or_self'), ('payroll_entries', 'payroll_entries_insert_staff'),
         ('payroll_entries', 'payroll_entries_update_staff'), ('payroll_entries', 'payroll_entries_delete_staff'),
         ('worker_tax_info', 'worker_tax_info_staff'), ('payroll_periods', 'payroll_periods_staff'), ('payroll_comparison_reviews', 'payroll_comparison_reviews_staff'),
         ('payroll_calculation_audit', 'payroll_calculation_audit_staff'), ('payroll_configuration', 'payroll_configuration_staff'),
         ('payroll_migration_approvals', 'payroll_migration_approvals_staff'), ('owner_salary', 'owner_salary_staff'), ('owner_salary', 'Owners can view their own salary'),
         ('owner_accounts', 'owner_accounts_staff'), ('owner_accounts', 'Owners can view their own accounts'),
         ('owner_draws', 'owner_draws_staff'), ('owner_draws', 'Owners can view their own draws'),
         ('staff_payroll_runs', 'staff_payroll_runs_select'), ('staff_payroll_runs', 'staff_payroll_runs_insert'), ('staff_payroll_runs', 'staff_payroll_runs_update'),
         ('government_remittances', 'government_remittances_select'), ('government_remittances', 'government_remittances_insert'), ('government_remittances', 'government_remittances_update'),
         ('payroll_tax_settings', 'payroll_tax_settings_select'), ('payroll_tax_settings', 'payroll_tax_settings_insert'),
         ('payroll_tax_settings', 'payroll_tax_settings_update'), ('payroll_tax_settings', 'payroll_tax_settings_delete'),
         ('time_entries', 'time_entries_staff'), ('field_payments', 'field_payments_staff'),
         ('field_payment_signatures', 'field_payment_signatures_staff'), ('field_payment_receipts', 'field_payment_receipts_staff'))
  LOOP
    RAISE EXCEPTION 'Unexpected policy "%" on %: it was not replaced by this migration. Nothing was changed.', r.policyname, r.tablename;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
