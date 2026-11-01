-- =====================================================================
-- Magnus HQ - Step 6: health, app errors, traffic
-- Magnus Boy's System
--
--   * platform_settings 'limits'   - database / storage size of your Supabase plan (free: 500 MB / 1 GB)
--   * _health_checks()             - ok / warn / problem: database, space, error spikes, security scan, daily job
--   * get_public_health()          - for /api/health and the public /status page: levels and plain words only
--   * hq_health()                  - the same with numbers, for HQ
--   * platform_app_errors          - app errors grouped by fingerprint (screen, users, device, version, open / fixed)
--   * platform_app_error_hits      - per-hour counter; caps: 30 per error per hour, 1000 in total per hour
--   * log_app_error()              - the app reports errors here (signed in or not)
--   * hq_errors(), hq_error_set()  - HQ Errors tab: Mark fixed (a fixed error that happens again reopens)
--   * platform_traffic / platform_visitors - views per hour per section, visitors per day. Counts only:
--                                    no names, no IP addresses, no device ids.
--   * log_visit(), hq_traffic()
--   * hq_prune_logs()              - weekly clean-up (pg_cron): error hits and traffic older than 90 days
--
-- Safe to run twice.
-- =====================================================================

insert into public.platform_settings (key, value) values
  ('limits', '{"db_mb": 500, "storage_mb": 1024, "plan": "Supabase Free"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.platform_app_errors (
  fingerprint     text primary key,
  message         text not null,
  stack           text,
  screen          text,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  total           int not null default 0,
  users           uuid[] not null default '{}',
  anon_count      int not null default 0,
  device          text,
  version         text,
  status          text not null default 'open' check (status in ('open', 'fixed', 'ignored')),
  fixed_at        timestamptz,
  fixed_by        uuid references auth.users(id) on delete set null,
  reopened_count  int not null default 0,
  note            text
);

create index if not exists idx_platform_app_errors_status on public.platform_app_errors (status, last_seen desc);

create table if not exists public.platform_app_error_hits (
  fingerprint  text not null,
  hour         timestamptz not null,
  n            int not null default 0,
  primary key (fingerprint, hour)
);

create index if not exists idx_platform_app_error_hits_hour on public.platform_app_error_hits (hour);

create table if not exists public.platform_traffic (
  hour       timestamptz not null,
  section    text not null,
  signed_in  boolean not null,
  views      int not null default 0,
  primary key (hour, section, signed_in)
);

create table if not exists public.platform_visitors (
  day        date not null,
  signed_in  boolean not null,
  n          int not null default 0,
  primary key (day, signed_in)
);

alter table public.platform_app_errors     enable row level security;
alter table public.platform_app_error_hits enable row level security;
alter table public.platform_traffic        enable row level security;
alter table public.platform_visitors       enable row level security;
revoke all on public.platform_app_errors, public.platform_app_error_hits, public.platform_traffic, public.platform_visitors
  from anon, authenticated;

insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'platform_app_errors',     'Magnus HQ: written by log_app_error(), read by HQ only.'),
  ('no_policies', 'platform_app_error_hits', 'Magnus HQ: error rate counter.'),
  ('no_policies', 'platform_traffic',        'Magnus HQ: anonymous view counts.'),
  ('no_policies', 'platform_visitors',       'Magnus HQ: anonymous visitor counts.')
on conflict (kind, object) do update set note = excluded.note;

-- ---------------------------------------------------------------------
-- 2. Health checks
-- ---------------------------------------------------------------------
create or replace function public._health_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  lim        jsonb := coalesce((select value from public.platform_settings where key = 'limits'), '{"db_mb": 500, "storage_mb": 1024}');
  v_db       bigint := pg_database_size(current_database());
  v_st       bigint := (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o);
  v_db_pct   numeric := round(100.0 * v_db / greatest(1, (lim ->> 'db_mb')::numeric * 1024 * 1024), 1);
  v_st_pct   numeric := round(100.0 * v_st / greatest(1, (lim ->> 'storage_mb')::numeric * 1024 * 1024), 1);
  v_err      int := (select coalesce(sum(n), 0) from public.platform_app_error_hits where hour >= date_trunc('hour', now()) - interval '1 hour');
  v_new_err  int := (select count(*) from public.platform_app_errors where status = 'open' and first_seen > now() - interval '24 hours');
  v_prob     int;
  v_warn     int;
  v_job      record;
  out        jsonb := '[]'::jsonb;
  lvl        text;
begin
  out := out || jsonb_build_object('key', 'database', 'level', 'ok', 'label', 'Database', 'text', 'Answering');

  lvl := case when v_db_pct >= 90 then 'problem' when v_db_pct >= 70 then 'warn' else 'ok' end;
  out := out || jsonb_build_object('key', 'db_space', 'level', lvl, 'label', 'Database space',
    'text', v_db_pct || '% used', 'used_bytes', v_db, 'limit_mb', lim -> 'db_mb', 'pct', v_db_pct);

  lvl := case when v_st_pct >= 90 then 'problem' when v_st_pct >= 70 then 'warn' else 'ok' end;
  out := out || jsonb_build_object('key', 'storage_space', 'level', lvl, 'label', 'File storage',
    'text', v_st_pct || '% used', 'used_bytes', v_st, 'limit_mb', lim -> 'storage_mb', 'pct', v_st_pct);

  lvl := case when v_err >= 100 then 'problem' when v_err >= 20 or v_new_err > 0 then 'warn' else 'ok' end;
  out := out || jsonb_build_object('key', 'errors', 'level', lvl, 'label', 'App errors',
    'text', v_err || ' in the last hour' || case when v_new_err > 0 then ', ' || v_new_err || ' new today' else '' end,
    'last_hour', v_err, 'new_today', v_new_err);

  select count(*) filter (where level = 'problem'), count(*) filter (where level = 'warn') into v_prob, v_warn
    from public._security_scan_rows();
  lvl := case when v_prob > 0 then 'problem' when v_warn > 0 then 'warn' else 'ok' end;
  out := out || jsonb_build_object('key', 'security', 'level', lvl, 'label', 'Security check',
    'text', case when v_prob + v_warn = 0 then 'All tables protected' else v_prob || ' problem(s), ' || v_warn || ' warning(s)' end);

  select * into v_job from public.platform_job_runs where job = 'daily' and ok order by started_at desc limit 1;
  if not found then
    out := out || jsonb_build_object('key', 'daily_job', 'level', 'warn', 'label', 'Daily job', 'text', 'Has not run yet');
  elsif v_job.started_at < now() - interval '26 hours' then
    out := out || jsonb_build_object('key', 'daily_job', 'level', 'problem', 'label', 'Daily job',
      'text', 'Last ran ' || round(extract(epoch from now() - v_job.started_at) / 3600) || ' hours ago', 'last_run', v_job.started_at);
  else
    out := out || jsonb_build_object('key', 'daily_job', 'level', 'ok', 'label', 'Daily job',
      'text', 'Ran ' || round(extract(epoch from now() - v_job.started_at) / 3600) || ' hours ago', 'last_run', v_job.started_at);
  end if;

  return out;
end;
$$;

revoke all on function public._health_checks() from public, anon, authenticated;

create or replace function public._worst_level(p_checks jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from jsonb_array_elements(p_checks) c where c ->> 'level' = 'problem') then 'problem'
    when exists (select 1 from jsonb_array_elements(p_checks) c where c ->> 'level' = 'warn') then 'warn'
    else 'ok' end;
$$;

-- Public: plain words and levels only (no numbers about companies, no table names).
create or replace function public.get_public_health()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with c as (select public._health_checks() as checks)
  select jsonb_build_object(
    'status', public._worst_level(c.checks),
    'checked_at', now(),
    'checks', (select jsonb_agg(jsonb_build_object('key', x ->> 'key', 'label', x ->> 'label', 'level', x ->> 'level'))
                 from jsonb_array_elements(c.checks) x))
  from c;
$$;

revoke all on function public.get_public_health() from public;
grant execute on function public.get_public_health() to anon, authenticated;

create or replace function public.hq_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  perform public.platform_require(false);
  v := public._health_checks();
  return jsonb_build_object('status', public._worst_level(v), 'checked_at', now(), 'checks', v,
    'limits', (select value from public.platform_settings where key = 'limits'));
end;
$$;

create or replace function public.hq_limits_save(p_db_mb int, p_storage_mb int, p_plan text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_check('limits.save', null,
    jsonb_build_object('reason', p_reason, 'db_mb', p_db_mb, 'storage_mb', p_storage_mb, 'plan', p_plan), true);
  if coalesce(p_db_mb, 0) < 100 or coalesce(p_storage_mb, 0) < 100 then raise exception 'Sizes look wrong (in MB).'; end if;
  update public.platform_settings
     set value = jsonb_build_object('db_mb', p_db_mb, 'storage_mb', p_storage_mb, 'plan', coalesce(nullif(trim(p_plan), ''), 'Supabase')),
         updated_by = auth.uid(), updated_at = now()
   where key = 'limits';
end;
$$;

revoke all on function public.hq_health() from public, anon;
revoke all on function public.hq_limits_save(int, int, text, text) from public, anon;
grant execute on function public.hq_health() to authenticated;
grant execute on function public.hq_limits_save(int, int, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. App errors
-- ---------------------------------------------------------------------
create or replace function public.log_app_error(
  p_fingerprint text, p_message text, p_stack text, p_screen text, p_device text, p_version text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hour   timestamptz := date_trunc('hour', now());
  v_uid    uuid := auth.uid();
  v_hits   int;
  v_all    int;
  v_old    public.platform_app_errors;
begin
  if coalesce(p_fingerprint, '') !~ '^[a-z0-9]{6,64}$' then return; end if;

  -- Caps: never more than 1000 reports an hour in total, 30 an hour for one error.
  select coalesce(sum(n), 0) into v_all from public.platform_app_error_hits where hour = v_hour;
  if v_all >= 1000 then return; end if;

  insert into public.platform_app_error_hits (fingerprint, hour, n) values (p_fingerprint, v_hour, 1)
  on conflict (fingerprint, hour) do update set n = platform_app_error_hits.n + 1
  returning n into v_hits;

  select * into v_old from public.platform_app_errors where fingerprint = p_fingerprint for update;

  if v_hits > 30 then
    -- Over this error's hourly cap: only count it, except that a FIXED error still reopens.
    if found and v_old.status = 'fixed' then
      update public.platform_app_errors
         set status = 'open', reopened_count = reopened_count + 1, last_seen = now(),
             version = left(coalesce(p_version, version), 40)
       where fingerprint = p_fingerprint;
      perform public._notify_platform_admins('error.reopened', 'A fixed error came back', left(v_old.message, 140), true);
    end if;
    return;
  end if;

  if not found then
    insert into public.platform_app_errors (fingerprint, message, stack, screen, total, users, anon_count, device, version)
    values (p_fingerprint, left(coalesce(nullif(trim(p_message), ''), 'Unknown error'), 500), left(p_stack, 4000),
            left(p_screen, 200), 1, case when v_uid is null then '{}' else array[v_uid] end,
            case when v_uid is null then 1 else 0 end, left(p_device, 300), left(p_version, 40));
    perform public._notify_platform_admins('error.new', 'New app error', left(coalesce(p_message, ''), 140) || ' · ' || coalesce(left(p_screen, 60), ''), true);
    return;
  end if;

  update public.platform_app_errors
     set last_seen = now(),
         total = total + 1,
         users = case when v_uid is null or v_uid = any (users) or cardinality(users) >= 200 then users else users || v_uid end,
         anon_count = anon_count + case when v_uid is null then 1 else 0 end,
         device = left(coalesce(p_device, device), 300),
         version = left(coalesce(p_version, version), 40),
         screen = left(coalesce(p_screen, screen), 200),
         status = case when status = 'fixed' then 'open' else status end,
         reopened_count = reopened_count + case when status = 'fixed' then 1 else 0 end
   where fingerprint = p_fingerprint;

  if v_old.status = 'fixed' then
    perform public._notify_platform_admins('error.reopened', 'A fixed error came back', left(v_old.message, 140), true);
  end if;
end;
$$;

revoke all on function public.log_app_error(text, text, text, text, text, text) from public;
grant execute on function public.log_app_error(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.hq_errors()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'fingerprint', e.fingerprint, 'message', e.message, 'stack', e.stack, 'screen', e.screen,
             'first_seen', e.first_seen, 'last_seen', e.last_seen, 'total', e.total,
             'users', cardinality(e.users), 'anon', e.anon_count, 'device', e.device, 'version', e.version,
             'status', e.status, 'fixed_at', e.fixed_at, 'reopened_count', e.reopened_count, 'note', e.note,
             'last_24h', (select coalesce(sum(h.n), 0) from public.platform_app_error_hits h
                           where h.fingerprint = e.fingerprint and h.hour > now() - interval '24 hours'))
           order by (e.status = 'open') desc, e.last_seen desc)
      from (select * from public.platform_app_errors order by last_seen desc limit 300) e), '[]'::jsonb);
end;
$$;

create or replace function public.hq_error_set(p_fingerprint text, p_status text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid;
begin
  v_me := public.platform_check('error.' || coalesce(p_status, '?'), p_fingerprint, jsonb_build_object('note', p_note), false);
  if p_status not in ('open', 'fixed', 'ignored') then raise exception 'Unknown status.'; end if;
  update public.platform_app_errors
     set status = p_status,
         fixed_at = case when p_status = 'fixed' then now() else fixed_at end,
         fixed_by = case when p_status = 'fixed' then v_me else fixed_by end,
         note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
   where fingerprint = p_fingerprint;
  if not found then raise exception 'Error not found.'; end if;
end;
$$;

revoke all on function public.hq_errors() from public, anon;
revoke all on function public.hq_error_set(text, text, text) from public, anon;
grant execute on function public.hq_errors() to authenticated;
grant execute on function public.hq_error_set(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Traffic (counts only)
-- ---------------------------------------------------------------------
create or replace function public.log_visit(p_section text, p_new_visitor boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_section text := lower(coalesce(p_section, ''));
  v_in      boolean := auth.uid() is not null;
  v_hour    timestamptz := date_trunc('hour', now());
  v_views   int;
begin
  if v_section !~ '^[a-z0-9-]{1,30}$' then v_section := 'other'; end if;

  insert into public.platform_traffic (hour, section, signed_in, views) values (v_hour, v_section, v_in, 1)
  on conflict (hour, section, signed_in) do update set views = platform_traffic.views + 1
    where platform_traffic.views < 20000          -- cap: a runaway script can't fill the table
  returning views into v_views;

  if coalesce(p_new_visitor, false) then
    insert into public.platform_visitors (day, signed_in, n) values (public._jm_today(), v_in, 1)
    on conflict (day, signed_in) do update set n = platform_visitors.n + 1
      where platform_visitors.n < 100000;
  end if;
end;
$$;

revoke all on function public.log_visit(text, boolean) from public;
grant execute on function public.log_visit(text, boolean) to anon, authenticated;

create or replace function public.hq_traffic()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := date_trunc('hour', now());
begin
  perform public.platform_require(false);
  return jsonb_build_object(
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'views', coalesce(t.views, 0),
                                  'signed_in', coalesce(t.signed_in, 0)) order by h.hour), '[]')
                  from generate_series(v_now - interval '47 hours', v_now, interval '1 hour') as h(hour)
                  left join (select hour, sum(views) as views, sum(views) filter (where signed_in) as signed_in
                               from public.platform_traffic where hour > v_now - interval '48 hours' group by hour) t
                    on t.hour = h.hour),
    'by_section', (select coalesce(jsonb_agg(jsonb_build_object('section', section, 'views', views) order by views desc), '[]')
                     from (select section, sum(views) as views from public.platform_traffic
                            where hour > now() - interval '7 days' group by section order by 2 desc limit 20) s),
    'visitors_daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day::date,
                                  'signed_in', coalesce(v.si, 0), 'visitors', coalesce(v.an, 0)) order by d.day), '[]')
                         from generate_series(public._jm_today() - 29, public._jm_today(), interval '1 day') as d(day)
                         left join (select day, sum(n) filter (where signed_in) as si, sum(n) filter (where not signed_in) as an
                                      from public.platform_visitors group by day) v on v.day = d.day::date)
  );
end;
$$;

revoke all on function public.hq_traffic() from public, anon;
grant execute on function public.hq_traffic() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Weekly clean-up
-- ---------------------------------------------------------------------
create or replace function public.hq_prune_logs()
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  delete from public.platform_app_error_hits where hour < now() - interval '90 days';
  delete from public.platform_traffic where hour < now() - interval '90 days';
  delete from public.platform_visitors where day < public._jm_today() - 400;
  delete from public.platform_job_runs where started_at < now() - interval '180 days';
  delete from public.notifications where read_at is not null and read_at < now() - interval '90 days';
$$;

revoke all on function public.hq_prune_logs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('magnus-hq-prune', '40 6 * * 0', 'select public.hq_prune_logs()');
    raise notice 'Weekly clean-up scheduled: magnus-hq-prune (Sundays 1:40 am Jamaica).';
  else
    raise notice 'pg_cron is not enabled: the weekly clean-up was not scheduled.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Overview: space and error lines join "Needs your attention"
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
           public._hq_company_state(c, cs) as state
      from public.companies c
      left join public.company_settings cs on cs.company_id = c.id
     where not c.is_system
  )
  select jsonb_build_object(
           'total',    count(*),
           'trial',    count(*) filter (where state = 'trial'),
           'paid',     count(*) filter (where state = 'paid'),
           'past_due', count(*) filter (where state = 'past_due'),
           'free',     count(*) filter (where state = 'free'),
           'no_plan',  count(*) filter (where state = 'no_plan'),
           'paused',   count(*) filter (where state = 'paused'),
           'closed',   count(*) filter (where state = 'closed'),
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
    'income_month',     (select coalesce(sum(p.amount_jmd), 0) from public.platform_payments p
                          where p.status = 'confirmed' and p.paid_on >= v_month_start),
    'charging_on',      coalesce((public._billing_settings() ->> 'charging_on')::boolean, false)
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

  if exists (select 1 from public.platform_payments where status = 'claimed') then
    v_attention := v_attention || jsonb_build_object('level', 'problem', 'tab', 'money',
      'title', (select count(*) from public.platform_payments where status = 'claimed') || ' payment(s) to confirm',
      'detail', 'A company says it paid. Check your Lynk / bank, then tap Money received or Not received.');
  end if;

  if not exists (select 1 from public.platform_job_runs where job = 'daily' and ok and started_at > now() - interval '26 hours') then
    v_attention := v_attention || jsonb_build_object('level', 'warn', 'tab', 'money',
      'title', 'The daily job has not run in the last 26 hours',
      'detail', 'Bills, reminders and read-only locks wait for it. Open Money and tap Run daily job now.');
  end if;

  -- Health: space running out, error spikes, new errors (Step 6).
  v_attention := v_attention || coalesce((
    select jsonb_agg(jsonb_build_object('level', c ->> 'level',
             'tab', case when c ->> 'key' = 'errors' then 'errors' else 'health' end,
             'title', (c ->> 'label') || ': ' || (c ->> 'text'),
             'detail', case when c ->> 'key' = 'errors' then 'Open Errors to see what broke and copy a note for your developer.'
                            else 'Running out of space. Clean up or upgrade the Supabase plan.' end))
      from jsonb_array_elements(public._health_checks()) c
     where c ->> 'key' in ('db_space', 'storage_space', 'errors') and c ->> 'level' <> 'ok'), '[]'::jsonb);

  select value into v_maint from public.platform_settings where key = 'maintenance';
  if coalesce((v_maint ->> 'on')::boolean, false) then
    v_attention := v_attention || jsonb_build_object('level', 'warn', 'tab', 'settings',
      'title', 'Maintenance mode is ON', 'detail', 'Company users can''t get in until you turn it off.');
  end if;

  if v_past_due > 0 then
    v_attention := v_attention || jsonb_build_object('level', 'warn', 'tab', 'companies',
      'title', v_past_due || ' compan' || case when v_past_due = 1 then 'y is' else 'ies are' end || ' past due',
      'detail', 'Unpaid. They go read-only after the grace days, and unlock when you confirm a payment.');
  end if;

  if exists (select 1 from public.companies where account_status = 'closed' and not is_system
              and purge_after is not null and purge_after <= now() + interval '7 days') then
    v_attention := v_attention || jsonb_build_object('level', 'warn', 'tab', 'companies',
      'title', 'A closed company will be wiped within 7 days',
      'detail', 'Reopen it now if that was a mistake.');
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

