-- =====================================================================
-- Magnus HQ - Step 8b: Jamaican statutory rates with effective dates
-- Magnus Boy's System
--
--   * statutory_rates            - one row per set of rates, valid from effective_from until the next set.
--                                  Owner-admin only to edit; every change is in the activity log.
--   * A set is NOT used by payroll until the owner-admin taps Confirm (confirmed_at), after checking the sources.
--   * get_statutory_rates(date)  - the confirmed set for a pay date (signed-in users), or null
--                                  (payroll then keeps using the company's own rates, as before).
--   * hq_statutory_rates(), hq_statutory_rate_save(), hq_statutory_rate_confirm()
--
-- Seeded (UNCONFIRMED) from the official / professional sources listed in each row:
--   2025-04-01  PAYE threshold J$1,799,376 a year
--   2026-04-01  PAYE threshold J$1,902,360 a year (J$158,530 a month)
--   Both: NIS 3% employee + 3% employer up to J$5,000,000 a year; NHT 2% + 3% (no ceiling);
--         Education Tax 2.25% + 3.5% on income after NIS; HEART 3% employer; PAYE 25% up to J$6,000,000, 30% above.
-- Safe to run twice.
-- =====================================================================

create table if not exists public.statutory_rates (
  id                     uuid primary key default gen_random_uuid(),
  effective_from         date not null unique,
  nis_employee_rate      numeric(6,4) not null,
  nis_employer_rate      numeric(6,4) not null,
  nis_annual_ceiling     numeric(14,2),                -- null = no ceiling
  nht_employee_rate      numeric(6,4) not null,
  nht_employer_rate      numeric(6,4) not null,
  edu_employee_rate      numeric(6,4) not null,
  edu_employer_rate      numeric(6,4) not null,
  heart_rate             numeric(6,4) not null,
  paye_threshold_annual  numeric(14,2) not null,
  paye_rate_band1        numeric(6,4) not null,
  paye_rate_band2        numeric(6,4) not null,
  paye_band1_ceiling     numeric(14,2) not null,
  source_note            text,
  sources                jsonb not null default '[]'::jsonb,
  confirmed_at           timestamptz,
  confirmed_by           uuid references auth.users(id) on delete set null,
  updated_at             timestamptz not null default now(),
  constraint statutory_rates_sane check (
    nis_employee_rate between 0 and 0.2 and nis_employer_rate between 0 and 0.2 and
    nht_employee_rate between 0 and 0.2 and nht_employer_rate between 0 and 0.2 and
    edu_employee_rate between 0 and 0.2 and edu_employer_rate between 0 and 0.2 and heart_rate between 0 and 0.2 and
    paye_rate_band1 between 0 and 0.6 and paye_rate_band2 between 0 and 0.6 and
    paye_threshold_annual >= 0 and paye_band1_ceiling > paye_threshold_annual)
);

alter table public.statutory_rates enable row level security;
revoke all on public.statutory_rates from anon, authenticated;
insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'statutory_rates', 'Magnus HQ: Jamaican statutory rates, read through get_statutory_rates().')
on conflict (kind, object) do update set note = excluded.note;

insert into public.statutory_rates (effective_from, nis_employee_rate, nis_employer_rate, nis_annual_ceiling,
  nht_employee_rate, nht_employer_rate, edu_employee_rate, edu_employer_rate, heart_rate,
  paye_threshold_annual, paye_rate_band1, paye_rate_band2, paye_band1_ceiling, source_note, sources) values
 ('2025-04-01', 0.03, 0.03, 5000000, 0.02, 0.03, 0.0225, 0.035, 0.03, 1799376, 0.25, 0.30, 6000000,
  'Income tax threshold J$1,799,376 for the year from 1 April 2025 (raised again on 1 April 2026). Other rates unchanged in 2025/26.',
  '[{"label": "JIS: Increase in income tax threshold now in effect (gives the old J$1,799,376)", "url": "https://jis.gov.jm/increase-in-income-tax-threshold-now-in-effect/"},
    {"label": "PwC tax summary: Jamaica, other taxes (NIS, NHT, Education Tax, HEART)", "url": "https://taxsummaries.pwc.com/jamaica/individual/other-taxes"},
    {"label": "PwC tax summary: Jamaica, taxes on personal income (25% / 30%, J$6,000,000)", "url": "https://taxsummaries.pwc.com/jamaica/individual/taxes-on-personal-income"}]'::jsonb),
 ('2026-04-01', 0.03, 0.03, 5000000, 0.02, 0.03, 0.0225, 0.035, 0.03, 1902360, 0.25, 0.30, 6000000,
  'Income tax threshold J$1,902,360 a year (J$158,530 a month) from 1 April 2026. NIS 3% + 3% up to J$5,000,000 a year. NHT 2% + 3%, no ceiling. Education Tax 2.25% + 3.5% on pay after NIS. HEART 3% (employer). PAYE 25% up to J$6,000,000, 30% above.',
  '[{"label": "JIS: Increase in income tax threshold now in effect (J$1,902,360 from 1 April 2026)", "url": "https://jis.gov.jm/increase-in-income-tax-threshold-now-in-effect/"},
    {"label": "PwC tax summary: Jamaica, taxes on personal income (threshold, 25% / 30%)", "url": "https://taxsummaries.pwc.com/jamaica/individual/taxes-on-personal-income"},
    {"label": "PwC tax summary: Jamaica, other taxes (NIS, NHT, Education Tax, HEART)", "url": "https://taxsummaries.pwc.com/jamaica/individual/other-taxes"},
    {"label": "Tax Administration Jamaica (official)", "url": "https://www.jamaicatax.gov.jm"}]'::jsonb)
on conflict (effective_from) do nothing;

-- ---------------------------------------------------------------------
-- Read (payroll): the confirmed set for a pay date
-- ---------------------------------------------------------------------
create or replace function public.get_statutory_rates(p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(r) - 'confirmed_by' - 'sources' - 'source_note'
    from public.statutory_rates r
   where r.confirmed_at is not null and r.effective_from <= coalesce(p_date, public._jm_today())
   order by r.effective_from desc
   limit 1;
$$;

revoke all on function public.get_statutory_rates(date) from public, anon;
grant execute on function public.get_statutory_rates(date) to authenticated;

-- ---------------------------------------------------------------------
-- HQ (owner-admin)
-- ---------------------------------------------------------------------
create or replace function public.hq_statutory_rates()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('confirmed_by_email', u.email,
                     'in_use_now', r.id = (select x.id from public.statutory_rates x where x.confirmed_at is not null
                                             and x.effective_from <= public._jm_today() order by x.effective_from desc limit 1))
                     order by r.effective_from desc)
                     from public.statutory_rates r left join auth.users u on u.id = r.confirmed_by), '[]'::jsonb);
end;
$$;

-- Add or change a set. Changing a set's numbers takes away its confirmation (it must be checked again).
create or replace function public.hq_statutory_rate_save(p jsonb, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id  uuid := nullif(p ->> 'id', '')::uuid;
  v_out uuid;
begin
  perform public.platform_check('statutory.save', coalesce(p ->> 'effective_from', v_id::text),
            jsonb_build_object('reason', p_reason, 'rates', p - 'sources'), true);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason.'; end if;
  if (p ->> 'effective_from') is null then raise exception 'Choose the date these rates start.'; end if;

  if v_id is null then
    insert into public.statutory_rates (effective_from, nis_employee_rate, nis_employer_rate, nis_annual_ceiling, nht_employee_rate,
      nht_employer_rate, edu_employee_rate, edu_employer_rate, heart_rate, paye_threshold_annual, paye_rate_band1, paye_rate_band2,
      paye_band1_ceiling, source_note, sources)
    values ((p ->> 'effective_from')::date, (p ->> 'nis_employee_rate')::numeric, (p ->> 'nis_employer_rate')::numeric,
      nullif(p ->> 'nis_annual_ceiling', '')::numeric, (p ->> 'nht_employee_rate')::numeric, (p ->> 'nht_employer_rate')::numeric,
      (p ->> 'edu_employee_rate')::numeric, (p ->> 'edu_employer_rate')::numeric, (p ->> 'heart_rate')::numeric,
      (p ->> 'paye_threshold_annual')::numeric, (p ->> 'paye_rate_band1')::numeric, (p ->> 'paye_rate_band2')::numeric,
      (p ->> 'paye_band1_ceiling')::numeric, nullif(trim(coalesce(p ->> 'source_note', '')), ''),
      coalesce(p -> 'sources', '[]'::jsonb))
    returning id into v_out;
  else
    update public.statutory_rates set
      effective_from = (p ->> 'effective_from')::date,
      nis_employee_rate = (p ->> 'nis_employee_rate')::numeric, nis_employer_rate = (p ->> 'nis_employer_rate')::numeric,
      nis_annual_ceiling = nullif(p ->> 'nis_annual_ceiling', '')::numeric,
      nht_employee_rate = (p ->> 'nht_employee_rate')::numeric, nht_employer_rate = (p ->> 'nht_employer_rate')::numeric,
      edu_employee_rate = (p ->> 'edu_employee_rate')::numeric, edu_employer_rate = (p ->> 'edu_employer_rate')::numeric,
      heart_rate = (p ->> 'heart_rate')::numeric, paye_threshold_annual = (p ->> 'paye_threshold_annual')::numeric,
      paye_rate_band1 = (p ->> 'paye_rate_band1')::numeric, paye_rate_band2 = (p ->> 'paye_rate_band2')::numeric,
      paye_band1_ceiling = (p ->> 'paye_band1_ceiling')::numeric,
      source_note = nullif(trim(coalesce(p ->> 'source_note', '')), ''),
      sources = coalesce(p -> 'sources', sources),
      confirmed_at = null, confirmed_by = null, updated_at = now()
     where id = v_id
    returning id into v_out;
    if v_out is null then raise exception 'Rates not found.'; end if;
  end if;
  return v_out;
end;
$$;

create or replace function public.hq_statutory_rate_confirm(p_id uuid, p_confirm boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid;
begin
  v_me := public.platform_check(case when p_confirm then 'statutory.confirm' else 'statutory.unconfirm' end, p_id::text,
            jsonb_build_object('reason', p_reason), true);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason.'; end if;
  update public.statutory_rates
     set confirmed_at = case when p_confirm then now() end, confirmed_by = case when p_confirm then v_me end, updated_at = now()
   where id = p_id;
  if not found then raise exception 'Rates not found.'; end if;
end;
$$;

revoke all on function public.hq_statutory_rates() from public, anon;
revoke all on function public.hq_statutory_rate_save(jsonb, text) from public, anon;
revoke all on function public.hq_statutory_rate_confirm(uuid, boolean, text) from public, anon;
grant execute on function public.hq_statutory_rates() to authenticated;
grant execute on function public.hq_statutory_rate_save(jsonb, text) to authenticated;
grant execute on function public.hq_statutory_rate_confirm(uuid, boolean, text) to authenticated;
