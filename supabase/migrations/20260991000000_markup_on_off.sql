-- =====================================================================
-- Markup and contingency on / off - Magnus Boy's System
--
-- Some clients (e.g. Food For The Poor) give their own estimate and prices, and the job is done at those prices: no markup.
--   company_settings.estimate_markup_enabled  the default for NEW estimates (Settings → Estimates & Pricing). Default on.
--   estimate_headers.markup_enabled           this one estimate: on = add the markup %, off = the price is the cost (no markup).
--   company_settings.estimate_contingency_enabled / estimate_headers.contingency_enabled: the same for the contingency %.
-- Existing estimates keep their markup and contingency (on). Nothing else changes. Safe to run twice.
-- =====================================================================

begin;

alter table public.company_settings add column if not exists estimate_markup_enabled boolean not null default true;
alter table public.estimate_headers add column if not exists markup_enabled boolean not null default true;
alter table public.company_settings add column if not exists estimate_contingency_enabled boolean not null default true;
alter table public.estimate_headers add column if not exists contingency_enabled boolean not null default true;

commit;
