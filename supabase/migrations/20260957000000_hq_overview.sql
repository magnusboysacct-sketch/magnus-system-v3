-- =====================================================================
-- Magnus HQ - Step 3: Overview tab
-- Magnus Boy's System
--
--   * platform_activity_days  - one row per user per day they used the app (Jamaica date).
--                               Feeds "active users per day" and, in Step 4, each company's last activity.
--                               Holds only user id, company id and the date: no pages, no content.
--   * record_activity()       - the app calls this once a day per signed-in user.
--   * hq_overview()           - platform numbers, the attention list and the two 30-day charts.
--                               COUNTS ONLY across companies: never names, documents, payroll or clients.
--
-- Template companies and the HQ login's own company (companies.is_system) are never counted.
-- Safe to run twice.
-- =====================================================================

create table if not exists public.platform_activity_days (
  day         date not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete set null,
  primary key (day, user_id)
);

create index if not exists idx_platform_activity_days_company on public.platform_activity_days (company_id, day desc);

alter table public.platform_activity_days enable row level security;
revoke all on public.platform_activity_days from anon, authenticated;

insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'platform_activity_days', 'Magnus HQ: written by record_activity(), read by HQ functions only.')
on conflict (kind, object) do update set note = excluded.note;

-- Called by the app once per day per signed-in user. Cheap and idempotent.
create or replace function public.record_activity()
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  insert into public.platform_activity_days (day, user_id, company_id)
  values ((now() at time zone 'America/Jamaica')::date, v_uid,
          (select up.company_id from public.user_profiles up where up.id = v_uid))
  on conflict (day, user_id) do nothing;
end;
$$;

revoke all on function public.record_activity() from public, anon;
grant execute on function public.record_activity() to authenticated;

-- ---------------------------------------------------------------------
-- HQ overview
-- ---------------------------------------------------------------------
create or replace function public.hq_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today        date := (now() at time zone 'America/Jamaica')::date;
  v_month_start  date := date_trunc('month', (now() at time zone 'America/Jamaica'))::date;
  v_companies    jsonb;
  v_numbers      jsonb;
  v_attention    jsonb := '[]'::jsonb;
  v_new_daily    jsonb;
  v_active_daily jsonb;
  v_problems     int;
  v_warnings     int;
  v_past_due     int;
  v_maint        jsonb;
begin
  perform public.platform_require(false);

  -- Companies by subscription state (same rules the app uses to lock an expired trial).
  with s as (
    select c.id,
           c.created_at,
           case
             when cs.subscription_status = 'active'
                  and (cs.subscription_expires_at is null or cs.subscription_expires_at > now()) then 'paid'
             when cs.trial_expires_at is null then 'no_plan'
             when cs.trial_expires_at > now() then 'trial'
             else 'past_due'
           end as state
      from public.companies c
      left join public.company_settings cs on cs.company_id = c.id
     where not c.is_system
  )
  select jsonb_build_object(
           'total',    count(*),
           'trial',    count(*) filter (where state = 'trial'),
           'paid',     count(*) filter (where state = 'paid'),
           'past_due', count(*) filter (where state = 'past_due'),
           'no_plan',  count(*) filter (where state = 'no_plan'),
           'closed',   0,
           'new_30d',  count(*) filter (where created_at >= now() - interval '30 days')
         ),
         count(*) filter (where state = 'past_due')
    into v_companies, v_past_due
    from s;

  select jsonb_build_object(
    'users',            (select count(*) from public.user_profiles up join public.companies r on r.id = up.company_id and not r.is_system),
    'active_today',     (select count(*) from public.platform_activity_days a join public.companies r on r.id = a.company_id and not r.is_system where a.day = v_today),
    'active_7d',        (select count(distinct a.user_id) from public.platform_activity_days a join public.companies r on r.id = a.company_id and not r.is_system where a.day > v_today - 7),
    'workers',          (select count(*) from public.workers w join public.companies r on r.id = w.company_id and not r.is_system where w.status = 'active'),
    'projects',         (select count(*) from public.projects p join public.companies r on r.id = p.company_id and not r.is_system),
    'projects_active',  (select count(*) from public.projects p join public.companies r on r.id = p.company_id and not r.is_system where p.status = 'active'),
    'payroll_runs_month',
        (select count(*) from public.payroll_periods pp join public.companies r on r.id = pp.company_id and not r.is_system
          where pp.pay_date >= v_month_start and pp.status <> 'cancelled')
      + (select count(*) from (select distinct spr.company_id, spr.period_year, spr.period_month
                                 from public.staff_payroll_runs spr join public.companies r on r.id = spr.company_id and not r.is_system
                                where spr.created_at >= v_month_start) x),
    'invoices_month',   (select count(*) from public.client_invoices ci join public.companies r on r.id = ci.company_id and not r.is_system
                          where ci.invoice_date >= v_month_start and ci.status <> 'cancelled'),
    'invoices_total',   (select count(*) from public.client_invoices ci join public.companies r on r.id = ci.company_id and not r.is_system
                          where ci.status <> 'cancelled'),
    'files',            (select count(*) from storage.objects),
    'storage_bytes',    (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o),
    'income_month',     null   -- arrives with platform billing (Step 5)
  ) into v_numbers;

  -- Needs your attention, worst first. More lines join as later steps are built.
  select count(*) filter (where level = 'problem'), count(*) filter (where level = 'warn')
    into v_problems, v_warnings
    from public._security_scan_rows();

  if v_problems > 0 then
    v_attention := v_attention || jsonb_build_object('level', 'problem', 'tab', 'health',
      'title', v_problems || ' security problem' || case when v_problems = 1 then '' else 's' end,
      'detail', 'A table could expose company data. Open Health to see which.');
  end if;

  select value into v_maint from public.platform_settings where key = 'maintenance';
  if coalesce((v_maint ->> 'on')::boolean, false) then
    v_attention := v_attention || jsonb_build_object('level', 'warn', 'tab', 'settings',
      'title', 'Maintenance mode is ON', 'detail', 'Company users can''t get in until you turn it off.');
  end if;

  if v_past_due > 0 then
    v_attention := v_attention || jsonb_build_object('level', 'warn', 'tab', 'companies',
      'title', v_past_due || ' compan' || case when v_past_due = 1 then 'y is' else 'ies are' end || ' past due',
      'detail', 'Trial ended with no paid plan. They are locked out until they pay or you extend the trial.');
  end if;

  if v_warnings > 0 then
    v_attention := v_attention || jsonb_build_object('level', 'warn', 'tab', 'health',
      'title', v_warnings || ' security warning' || case when v_warnings = 1 then '' else 's' end,
      'detail', 'Something to check on the Health tab.');
  end if;

  -- Charts: last 30 days (Jamaica dates), zero-filled.
  select jsonb_agg(jsonb_build_object('day', d.day::date, 'n', coalesce(x.n, 0)) order by d.day)
    into v_new_daily
    from generate_series(v_today - 29, v_today, interval '1 day') as d(day)
    left join (
      select (c.created_at at time zone 'America/Jamaica')::date as day, count(*) as n
        from public.companies c
       where not c.is_system
       group by 1
    ) x on x.day = d.day::date;

  select jsonb_agg(jsonb_build_object('day', d.day::date, 'n', coalesce(x.n, 0)) order by d.day)
    into v_active_daily
    from generate_series(v_today - 29, v_today, interval '1 day') as d(day)
    left join (
      select a.day, count(*) as n
        from public.platform_activity_days a join public.companies r on r.id = a.company_id and not r.is_system
       where a.day > v_today - 30
       group by 1
    ) x on x.day = d.day::date;

  return jsonb_build_object(
    'generated_at',        now(),
    'companies',           v_companies,
    'numbers',             v_numbers,
    'attention',           v_attention,
    'new_companies_daily', coalesce(v_new_daily, '[]'::jsonb),
    'active_users_daily',  coalesce(v_active_daily, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.hq_overview() from public, anon;
grant execute on function public.hq_overview() to authenticated;
