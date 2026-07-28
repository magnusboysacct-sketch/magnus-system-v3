-- Estimate markup/contingency pricing + company-wide estimate defaults,
-- plus a link from client_contracts back to the estimate it was generated from.

-- Company-wide defaults, edited from Settings > Estimates.
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_markup_overall numeric NOT NULL DEFAULT 25;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_markup_materials numeric NOT NULL DEFAULT 20;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_markup_labor numeric NOT NULL DEFAULT 35;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_markup_equipment numeric NOT NULL DEFAULT 15;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_markup_subcontractor numeric NOT NULL DEFAULT 10;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_contingency numeric NOT NULL DEFAULT 5;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_validity_days integer NOT NULL DEFAULT 30;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_deposit_pct numeric NOT NULL DEFAULT 30;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_progress_pct numeric NOT NULL DEFAULT 40;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_completion_pct numeric NOT NULL DEFAULT 30;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS estimate_print_format text NOT NULL DEFAULT 'summary';

-- Per-estimate pricing, set from the markup panel on the estimate detail modal.
ALTER TABLE public.estimate_headers ADD COLUMN IF NOT EXISTS markup_overall numeric NOT NULL DEFAULT 25;
ALTER TABLE public.estimate_headers ADD COLUMN IF NOT EXISTS markup_type text NOT NULL DEFAULT 'overall';
ALTER TABLE public.estimate_headers ADD COLUMN IF NOT EXISTS contingency_pct numeric NOT NULL DEFAULT 5;
ALTER TABLE public.estimate_headers ADD COLUMN IF NOT EXISTS contingency_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estimate_headers ADD COLUMN IF NOT EXISTS subtotal_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estimate_headers ADD COLUMN IF NOT EXISTS subtotal_markup numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estimate_headers ADD COLUMN IF NOT EXISTS total_client_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.estimate_headers ADD COLUMN IF NOT EXISTS print_format text;

-- Links a contract back to the estimate it was generated from (Generate Contract action).
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES public.estimate_headers(id) ON DELETE SET NULL;
