-- Company-wide overhead rate + salary period convention, edited from
-- Settings > Estimates (Company Overhead section).
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS company_overhead_pct numeric NOT NULL DEFAULT 8;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS salary_period text NOT NULL DEFAULT 'monthly';

-- Per-project cost plan basics, set from the Project Dashboard's Cost Plan tab.
-- The richer staff/vehicle breakdown behind these numbers is stored as JSON in
-- project_budgets.description (category = 'overhead') since project_budgets has
-- no dedicated columns for it.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS duration_months numeric NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_profit_pct numeric NOT NULL DEFAULT 15;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS overhead_budget numeric NOT NULL DEFAULT 0;
