/*
  Internal-staff payroll — separate from payroll_periods/payroll_entries,
  which are hard-FK'd to workers(id) (field/site workers) and are also
  explicitly marked "PHASE 1C SHADOW CALCULATION ONLY — NOT ACTIVE PAYROLL"
  throughout payroll.ts. Internal staff (director/admin/accounts/etc.) only
  exist in user_profiles, so they need their own table rather than being
  shoehorned into the workers-based system.
*/

-- =====================================================
-- staff_payroll_runs
-- =====================================================

CREATE TABLE IF NOT EXISTS public.staff_payroll_runs (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id                             uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  period_month                        integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year                         integer NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  gross_pay                           numeric(12,2) NOT NULL,
  nis_deduction                       numeric(12,2) NOT NULL DEFAULT 0,
  nht_deduction                       numeric(12,2) NOT NULL DEFAULT 0,
  education_tax_deduction             numeric(12,2) NOT NULL DEFAULT 0,
  paye_deduction                      numeric(12,2) NOT NULL DEFAULT 0,
  total_employee_deductions           numeric(12,2) NOT NULL DEFAULT 0,
  employer_nis_contribution           numeric(12,2) NOT NULL DEFAULT 0,
  employer_nht_contribution           numeric(12,2) NOT NULL DEFAULT 0,
  employer_education_tax_contribution numeric(12,2) NOT NULL DEFAULT 0,
  employer_heart_contribution         numeric(12,2) NOT NULL DEFAULT 0,
  total_employer_contributions        numeric(12,2) NOT NULL DEFAULT 0,
  net_pay                             numeric(12,2) NOT NULL DEFAULT 0,
  notes                               text,
  status                              text NOT NULL DEFAULT 'paid' CHECK (status = 'paid'),
  paid_at                             timestamptz NOT NULL DEFAULT now(),
  paid_by                             uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  email_sent_at                       timestamptz,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_month, period_year)
);

CREATE INDEX IF NOT EXISTS idx_staff_payroll_runs_company_period
  ON public.staff_payroll_runs (company_id, period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_staff_payroll_runs_user
  ON public.staff_payroll_runs (user_id);

ALTER TABLE public.staff_payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_payroll_runs_select" ON public.staff_payroll_runs;
DROP POLICY IF EXISTS "staff_payroll_runs_insert" ON public.staff_payroll_runs;
DROP POLICY IF EXISTS "staff_payroll_runs_update" ON public.staff_payroll_runs;

CREATE POLICY "staff_payroll_runs_select" ON public.staff_payroll_runs
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin', 'accounts')
    )
  );

CREATE POLICY "staff_payroll_runs_insert" ON public.staff_payroll_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin', 'accounts')
    )
  );

CREATE POLICY "staff_payroll_runs_update" ON public.staff_payroll_runs
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin', 'accounts')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin', 'accounts')
    )
  );

-- =====================================================
-- government_remittances
-- =====================================================

CREATE TABLE IF NOT EXISTS public.government_remittances (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_month                   integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year                    integer NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  paye_total                     numeric(12,2) NOT NULL DEFAULT 0,
  education_tax_employee_total   numeric(12,2) NOT NULL DEFAULT 0,
  education_tax_employer_total   numeric(12,2) NOT NULL DEFAULT 0,
  heart_trust_total               numeric(12,2) NOT NULL DEFAULT 0,
  nht_total                      numeric(12,2) NOT NULL DEFAULT 0,
  nis_total                      numeric(12,2) NOT NULL DEFAULT 0,
  total_due                      numeric(12,2) NOT NULL DEFAULT 0,
  due_date                       date NOT NULL,
  status                         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_date                      date,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_month, period_year)
);

CREATE INDEX IF NOT EXISTS idx_government_remittances_company_status
  ON public.government_remittances (company_id, status);

ALTER TABLE public.government_remittances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "government_remittances_select" ON public.government_remittances;
DROP POLICY IF EXISTS "government_remittances_insert" ON public.government_remittances;
DROP POLICY IF EXISTS "government_remittances_update" ON public.government_remittances;

CREATE POLICY "government_remittances_select" ON public.government_remittances
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin', 'accounts')
    )
  );

CREATE POLICY "government_remittances_insert" ON public.government_remittances
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin', 'accounts')
    )
  );

CREATE POLICY "government_remittances_update" ON public.government_remittances
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin', 'accounts')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('director', 'admin', 'accounts')
    )
  );

-- =====================================================
-- user_profiles.trn — internal staff have nowhere to store a TRN today;
-- worker_tax_info.trn only covers the workers(field-worker) table.
-- =====================================================

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS trn text;
