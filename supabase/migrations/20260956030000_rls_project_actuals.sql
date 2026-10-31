-- =====================================================================
-- Magnus HQ - Step 2d: project_actuals had RLS on but NO policies
--
-- The app uses this table (Projects -> close out a project writes a row; estimate suggestions read them),
-- but with no policies both silently failed. Each company now reads and writes only its own rows,
-- the same pattern as material_price_history in 20260944.
-- Safe to run twice.
-- =====================================================================
alter table public.project_actuals enable row level security;

drop policy if exists project_actuals_company on public.project_actuals;
create policy project_actuals_company on public.project_actuals
  for all to authenticated
  using      (company_id in (select up.company_id from public.user_profiles up where up.id = auth.uid()))
  with check (company_id in (select up.company_id from public.user_profiles up where up.id = auth.uid()));

revoke all on public.project_actuals from anon;
grant select, insert, update, delete on public.project_actuals to authenticated;
