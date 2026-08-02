/*
  Payroll tax rate settings — moves the hardcoded Jamaican statutory rates
  in jamaicanPayroll.ts into a per-company, director-editable table.

  Two corrections vs. the original spec:
  1. company_id is FK'd to companies(id) and last_updated_by to
     public.user_profiles(id) rather than auth.users(id) — matching every
     other table added this session, and avoiding the embedded-join schema
     cache issue already hit once on worker_portal_notices.
  2. The original "FOR ALL ... director admin" policy only checked
     company_id, not role — any company member (including viewer) could
     have updated statutory tax rates via a direct API call, despite the
     UI restricting the settings page to director only. Split into a
     company-wide SELECT and a director-only INSERT/UPDATE/DELETE.
*/

CREATE TABLE IF NOT EXISTS public.payroll_tax_settings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Employee deductions
  nis_employee_rate           numeric(6,4) NOT NULL DEFAULT 0.0275,
  nht_employee_rate           numeric(6,4) NOT NULL DEFAULT 0.0200,
  education_tax_employee_rate numeric(6,4) NOT NULL DEFAULT 0.0225,
  -- PAYE thresholds
  paye_threshold_annual       numeric(12,2) NOT NULL DEFAULT 1500096.00,
  paye_rate_band1             numeric(6,4) NOT NULL DEFAULT 0.25,
  paye_rate_band2             numeric(6,4) NOT NULL DEFAULT 0.30,
  paye_band1_ceiling          numeric(12,2) NOT NULL DEFAULT 6000000.00,
  -- Employer contributions
  nis_employer_rate           numeric(6,4) NOT NULL DEFAULT 0.0250,
  nht_employer_rate           numeric(6,4) NOT NULL DEFAULT 0.0300,
  education_tax_employer_rate numeric(6,4) NOT NULL DEFAULT 0.0350,
  heart_trust_rate            numeric(6,4) NOT NULL DEFAULT 0.0300,
  -- NHT monthly cap
  nht_monthly_cap             numeric(12,2) NOT NULL DEFAULT 125000.00,
  -- Metadata
  last_updated_by             uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  effective_date               date NOT NULL DEFAULT CURRENT_DATE,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

ALTER TABLE public.payroll_tax_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_tax_settings_select" ON public.payroll_tax_settings;
DROP POLICY IF EXISTS "payroll_tax_settings_insert" ON public.payroll_tax_settings;
DROP POLICY IF EXISTS "payroll_tax_settings_update" ON public.payroll_tax_settings;
DROP POLICY IF EXISTS "payroll_tax_settings_delete" ON public.payroll_tax_settings;

-- Any company member can read the current rates (PayrollPage needs this
-- for every pay run, not just director/admin/accounts)
CREATE POLICY "payroll_tax_settings_select" ON public.payroll_tax_settings
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- Only director can change statutory rates
CREATE POLICY "payroll_tax_settings_insert" ON public.payroll_tax_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

CREATE POLICY "payroll_tax_settings_update" ON public.payroll_tax_settings
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

CREATE POLICY "payroll_tax_settings_delete" ON public.payroll_tax_settings
  FOR DELETE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'director'
    )
  );

-- Seed default rates for every existing company (idempotent) rather than a
-- single hardcoded company_id, so this works regardless of how many
-- companies exist by the time it's run.
INSERT INTO public.payroll_tax_settings (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;
