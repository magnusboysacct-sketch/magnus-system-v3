-- =====================================================================
-- Magnus HQ - Step 5: Money - subscriptions with an on/off switch
-- Magnus Boy's System
--
--   * platform_prices      - every price (plans + extras). Nothing is hard-coded in the app.
--   * platform_settings 'billing' - Charging ON/OFF, trial days, grace days, default plan, where to pay (Lynk / bank).
--   * platform_bills       - one bill per company per period (room for automatic card / Lynk later: provider columns).
--   * platform_payments    - "I've paid" claims from companies + payments HQ records by hand. Never deleted.
--   * notifications        - simple per-user notices (the bell + phone push arrive in Step 7).
--   * platform_job_runs    - heartbeat of the daily job (the health check in Step 6 reads it).
--   * companies.billing_locked - unpaid after the grace days: READ-ONLY (same guard as Pause); unlocks the moment
--                            HQ confirms a payment, or when Charging is switched OFF.
--   * hq_daily_job()       - runs every night at 1:10 am Jamaica time (pg_cron): bills, reminders 7/3/1 days before due,
--                            read-only after grace, wipe companies closed 90+ days ago.
--   * my_plan(), my_claim_payment()       - the company owner's "My plan" page.
--   * hq_billing(), hq_billing_save_settings(), hq_price_save(), hq_payment_decide(), hq_record_payment(),
--     hq_bill_void(), hq_run_daily_job() - HQ Money tab.
--   * Closed companies are now also refused by every company-checked server function (_caller_may_use_company).
--   * Uploads into a paused / locked / closed company's file folder are refused (storage guard).
--
-- Charging starts OFF: nothing changes for anyone until you switch it on in HQ.
-- Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.platform_prices (
  key             text primary key check (key ~ '^(plan|extra)\.[a-z_]+$'),
  label           text not null,
  per             text not null default 'company' check (per in ('company', 'seat', 'worker')),
  amount_jmd      numeric(12, 2),            -- null = custom price (agreed by hand)
  included_seats  int,                       -- plans only: users included before extra seats are charged
  features        text[] not null default '{}',
  description     text,
  active          boolean not null default true,
  sort            int not null default 0,
  updated_at      timestamptz not null default now()
);

insert into public.platform_prices (key, label, per, amount_jmd, included_seats, features, description, active, sort) values
  ('plan.starter',    'Starter',    'company', 15000, 3,    '{public_receipts}',
     'Projects, estimates, BOQ, purchasing and books for a small team.', true, 10),
  ('plan.pro',        'Pro',        'company', 35000, 10,   '{payroll,client_portal,worker_portal,ocr,public_receipts,ai}',
     'Everything in Starter plus payroll, client and worker portals, receipt scanning and AI.', true, 20),
  ('plan.enterprise', 'Enterprise', 'company', null,  null, '{payroll,client_portal,worker_portal,ocr,public_receipts,ai}',
     'Several companies or big teams. Price agreed with you.', true, 30),
  ('extra.seat',      'Extra user', 'seat',    1500,  null, '{}', 'Each user above the plan''s included users.', false, 40),
  ('extra.worker',    'Per worker', 'worker',  0,     null, '{}', 'Per active worker on payroll.', false, 50)
on conflict (key) do nothing;

insert into public.platform_settings (key, value) values
  ('billing', '{"charging_on": false, "trial_days": 14, "grace_days": 7, "default_plan": "starter",
                "lynk_handle": "", "bank_details": "", "payment_note": "", "usd_rate": 157}'::jsonb)
on conflict (key) do nothing;

alter table public.companies add column if not exists billing_locked    boolean not null default false;
alter table public.companies add column if not exists billing_locked_at timestamptz;

create table if not exists public.platform_bills (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete set null,
  company_name    text not null,
  plan_key        text,
  period_start    date not null,
  period_end      date not null,
  due_date        date not null,
  amount_jmd      numeric(12, 2) not null,
  lines           jsonb not null default '[]'::jsonb,
  status          text not null default 'open' check (status in ('open', 'claimed', 'paid', 'void')),
  reminders_sent  int[] not null default '{}',
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  void_reason     text,
  provider        text,          -- later: 'card' / 'lynk' automatic charging
  provider_ref    text
);

create index if not exists idx_platform_bills_company on public.platform_bills (company_id, period_start desc);
create index if not exists idx_platform_bills_status  on public.platform_bills (status, due_date);

create table if not exists public.platform_payments (
  id             uuid primary key default gen_random_uuid(),
  bill_id        uuid references public.platform_bills(id) on delete set null,
  company_id     uuid references public.companies(id) on delete set null,
  company_name   text not null,
  amount_jmd     numeric(12, 2) not null check (amount_jmd > 0),
  method         text not null check (method in ('lynk', 'bank', 'cash', 'card', 'other')),
  reference      text,
  paid_on        date not null,
  source         text not null check (source in ('company', 'hq')),
  status         text not null check (status in ('claimed', 'confirmed', 'rejected')),
  claimed_by     uuid references auth.users(id) on delete set null,
  claimed_at     timestamptz not null default now(),
  decided_by     uuid references auth.users(id) on delete set null,
  decided_at     timestamptz,
  reject_reason  text,
  note           text
);

create index if not exists idx_platform_payments_status on public.platform_payments (status, claimed_at desc);
create index if not exists idx_platform_payments_company on public.platform_payments (company_id, paid_on desc);

create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  link        text,
  urgent      boolean not null default false,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists idx_notifications_user on public.notifications (user_id, created_at desc);

create table if not exists public.platform_job_runs (
  id           bigint generated always as identity primary key,
  job          text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  details      jsonb not null default '{}'::jsonb
);

create index if not exists idx_platform_job_runs on public.platform_job_runs (job, started_at desc);

-- RLS: platform tables have no policies (functions only). Notifications: each user sees and marks read only their own.
alter table public.platform_prices   enable row level security;
alter table public.platform_bills    enable row level security;
alter table public.platform_payments enable row level security;
alter table public.platform_job_runs enable row level security;
alter table public.notifications     enable row level security;

revoke all on public.platform_prices, public.platform_bills, public.platform_payments, public.platform_job_runs from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_own_mark on public.notifications;
create policy notifications_own_mark on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'platform_prices',   'Magnus HQ: read through my_plan() / hq_billing() and the public price list.'),
  ('no_policies', 'platform_bills',    'Magnus HQ: bills, reached through billing functions only.'),
  ('no_policies', 'platform_payments', 'Magnus HQ: payments, reached through billing functions only.'),
  ('no_policies', 'platform_job_runs', 'Magnus HQ: daily job heartbeat.')
on conflict (kind, object) do update set note = excluded.note;

-- ---------------------------------------------------------------------
-- 2. Read-only after the grace days uses the same guard as Pause
-- ---------------------------------------------------------------------
create or replace function public._hq_blocked_companies(p_write boolean)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
    from public.companies c
   where c.account_status = 'closed'
      or (p_write and (c.account_status = 'paused' or c.billing_locked));
$$;

create or replace function public.my_company_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object('status', c.account_status, 'reason', c.status_reason, 'purge_after', c.purge_after,
                               'billing_locked', c.billing_locked)
       from public.user_profiles up
       join public.companies c on c.id = up.company_id
      where up.id = auth.uid()),
    jsonb_build_object('status', 'active', 'billing_locked', false));
$$;

-- Same body as 20260943, plus: a CLOSED company is refused by every company-checked server function.
create or replace function public._caller_may_use_company(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role   text;
begin
  if v_claims is null and session_user <> 'authenticator' then return true; end if;   -- direct database connection
  if v_claims is not null then
    begin v_role := v_claims::jsonb ->> 'role'; exception when others then v_role := null; end;
    if v_role = 'service_role' then return true; end if;
  end if;
  if exists (select 1 from public.companies c where c.id = p_company_id and c.account_status = 'closed') then
    return false;
  end if;
  return coalesce(p_company_id is not null and p_company_id = (
    select up.company_id from user_profiles up
     where up.id = auth.uid()
       and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary')
     limit 1), false);
end;
$$;

-- Photo / file uploads: files under a company's folder (<company_id>/...) can't be added or changed while it is
-- paused, unpaid-locked or closed. Skipped with a notice if this database role may not add storage policies.
do $$
declare
  v_expr text := '(split_part(name, ''/'', 1) <> all (coalesce((select array(select x::text from unnest(public._hq_blocked_companies(true)) x)), ''{}''::text[])))';
begin
  begin
    execute 'drop policy if exists hq_guard_upload on storage.objects';
    execute 'drop policy if exists hq_guard_replace on storage.objects';
    execute format('create policy hq_guard_upload on storage.objects as restrictive for insert to authenticated with check %s', v_expr);
    execute format('create policy hq_guard_replace on storage.objects as restrictive for update to authenticated using %s with check %s', v_expr, v_expr);
  exception when insufficient_privilege then
    raise notice 'Storage upload guard skipped: this role may not add policies on storage.objects.';
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------
create or replace function public._billing_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select value from public.platform_settings where key = 'billing'),
                  '{"charging_on": false, "trial_days": 14, "grace_days": 7, "default_plan": "starter"}'::jsonb);
$$;

create or replace function public._jm_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$ select (now() at time zone 'America/Jamaica')::date $$;

-- A company's state for HQ (replaces the Step 4 version: now knows about Charging and unpaid locks).
create or replace function public._hq_company_state(c public.companies, cs public.company_settings)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when c.account_status = 'closed' then 'closed'
    when c.account_status = 'paused' then 'paused'
    when c.billing_locked then 'past_due'
    when cs.subscription_plan = 'free' then 'free'
    when cs.subscription_status = 'active'
         and (cs.subscription_expires_at is null or cs.subscription_expires_at > now()) then 'paid'
    when cs.trial_expires_at is not null and cs.trial_expires_at > now() then 'trial'
    when coalesce((public._billing_settings() ->> 'charging_on')::boolean, false) then 'past_due'
    else 'free'
  end;
$$;

revoke all on function public._billing_settings() from public, anon, authenticated;
revoke all on function public._hq_company_state(public.companies, public.company_settings) from public, anon, authenticated;

-- The bill for one company for one month: plan price + extra users above the plan's included users (+ per worker if on).
create or replace function public._bill_quote(p_company uuid, p_plan text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan   public.platform_prices;
  v_seat   public.platform_prices;
  v_worker public.platform_prices;
  v_users  int;
  v_wk     int;
  v_extra  int;
  v_lines  jsonb := '[]'::jsonb;
  v_total  numeric := 0;
begin
  select * into v_plan from public.platform_prices where key = 'plan.' || p_plan;
  if not found or v_plan.amount_jmd is null then
    return null;   -- custom / unknown plan: HQ bills it by hand
  end if;
  v_lines := v_lines || jsonb_build_object('label', v_plan.label || ' plan', 'qty', 1, 'each', v_plan.amount_jmd, 'amount', v_plan.amount_jmd);
  v_total := v_plan.amount_jmd;

  select count(*) into v_users from public.user_profiles where company_id = p_company;
  select * into v_seat from public.platform_prices where key = 'extra.seat' and active;
  if found and v_plan.included_seats is not null and v_users > v_plan.included_seats and coalesce(v_seat.amount_jmd, 0) > 0 then
    v_extra := v_users - v_plan.included_seats;
    v_lines := v_lines || jsonb_build_object('label', v_seat.label, 'qty', v_extra, 'each', v_seat.amount_jmd, 'amount', v_extra * v_seat.amount_jmd);
    v_total := v_total + v_extra * v_seat.amount_jmd;
  end if;

  select * into v_worker from public.platform_prices where key = 'extra.worker' and active;
  if found and coalesce(v_worker.amount_jmd, 0) > 0 then
    v_wk := coalesce(public._hq_company_count('workers', p_company, 'status = ''active'''), 0);
    if v_wk > 0 then
      v_lines := v_lines || jsonb_build_object('label', v_worker.label, 'qty', v_wk, 'each', v_worker.amount_jmd, 'amount', v_wk * v_worker.amount_jmd);
      v_total := v_total + v_wk * v_worker.amount_jmd;
    end if;
  end if;

  return jsonb_build_object('amount', v_total, 'lines', v_lines);
end;
$$;

create or replace function public._notify_company_admins(p_company uuid, p_kind text, p_title text, p_body text, p_urgent boolean default false)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, company_id, kind, title, body, link, urgent)
  select up.id, p_company, p_kind, p_title, p_body, '/billing', p_urgent
    from public.user_profiles up
   where up.company_id = p_company and up.role in ('director', 'admin');
$$;

create or replace function public._notify_platform_admins(p_kind text, p_title text, p_body text, p_urgent boolean default false)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, kind, title, body, link, urgent)
  select pa.user_id, p_kind, p_title, p_body, '/hq?tab=money', p_urgent from public.platform_admins pa;
$$;

-- Mark a bill paid and unlock the company. Used by confirm + record-by-hand.
create or replace function public._apply_paid_bill(p_bill uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  b public.platform_bills;
begin
  update public.platform_bills set status = 'paid', paid_at = now() where id = p_bill returning * into b;
  if b.company_id is null then return; end if;

  update public.company_settings
     set subscription_status = 'active',
         subscription_plan = coalesce(b.plan_key, subscription_plan),
         subscription_expires_at = greatest(coalesce(subscription_expires_at, b.period_end::timestamp at time zone 'America/Jamaica'),
                                            b.period_end::timestamp at time zone 'America/Jamaica')
   where company_id = b.company_id;
  if not found then
    insert into public.company_settings (company_id, subscription_status, subscription_plan, subscription_expires_at)
    values (b.company_id, 'active', b.plan_key, b.period_end::timestamp at time zone 'America/Jamaica');
  end if;

  update public.companies set billing_locked = false, billing_locked_at = null where id = b.company_id and billing_locked;
end;
$$;

revoke all on function public._bill_quote(uuid, text) from public, anon, authenticated;
revoke all on function public._notify_company_admins(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public._notify_platform_admins(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public._apply_paid_bill(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. The daily job
-- ---------------------------------------------------------------------
create or replace function public.hq_daily_job()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_run      bigint;
  s          jsonb := public._billing_settings();
  v_charging boolean := coalesce((s ->> 'charging_on')::boolean, false);
  v_grace    int := coalesce((s ->> 'grace_days')::int, 7);
  v_trial    int := coalesce((s ->> 'trial_days')::int, 14);
  v_default  text := coalesce(nullif(s ->> 'default_plan', ''), 'starter');
  v_today    date := public._jm_today();
  r          record;
  b          record;
  v_anchor   date;
  v_start    date;
  v_quote    jsonb;
  v_plan     text;
  v_left     int;
  n_bills    int := 0;
  n_remind   int := 0;
  n_locked   int := 0;
  n_unlocked int := 0;
  n_purged   int := 0;
begin
  insert into public.platform_job_runs (job) values ('daily') returning id into v_run;

  if v_charging then
    for r in
      select c.id, c.name, c.created_at, cs.subscription_plan, cs.subscription_status,
             cs.subscription_expires_at, cs.trial_expires_at
        from public.companies c
        left join public.company_settings cs on cs.company_id = c.id
       where not c.is_system and not c.is_test and c.account_status <> 'closed'
         and coalesce(cs.subscription_plan, '') <> 'free'
    loop
      -- When the next period starts: paid-until, else end of trial.
      v_anchor := coalesce(
        case when r.subscription_status = 'active' then (r.subscription_expires_at at time zone 'America/Jamaica')::date end,
        (r.trial_expires_at at time zone 'America/Jamaica')::date,
        (r.created_at at time zone 'America/Jamaica')::date + v_trial);

      -- New bill 7 days ahead of the period. A period that already passed starts TODAY, so nobody is locked instantly
      -- when Charging is first switched on.
      if v_anchor <= v_today + 7
         and not exists (select 1 from public.platform_bills pb
                          where pb.company_id = r.id and pb.status <> 'void' and pb.period_end > v_anchor) then
        v_plan := coalesce(nullif(r.subscription_plan, ''), v_default);
        v_quote := public._bill_quote(r.id, v_plan);
        if v_quote is not null and (v_quote ->> 'amount')::numeric > 0 then
          v_start := greatest(v_anchor, v_today);
          insert into public.platform_bills (company_id, company_name, plan_key, period_start, period_end, due_date, amount_jmd, lines)
          values (r.id, r.name, v_plan, v_start, (v_start + interval '1 month')::date, v_start,
                  (v_quote ->> 'amount')::numeric, v_quote -> 'lines');
          perform public._notify_company_admins(r.id, 'bill.new', 'New Magnus bill',
            'J$' || to_char((v_quote ->> 'amount')::numeric, 'FM999,999,990.00') || ' due ' || to_char(v_start, 'DD Mon YYYY') || '. Open My plan to pay.');
          n_bills := n_bills + 1;
        end if;
      end if;

      -- Reminders 7 / 3 / 1 days before, and read-only after the grace days.
      for b in select * from public.platform_bills where company_id = r.id and status = 'open' loop
        v_left := b.due_date - v_today;
        if v_left in (7, 3, 1) and not (v_left = any (b.reminders_sent)) then
          perform public._notify_company_admins(r.id, 'bill.reminder',
            'Magnus bill due in ' || v_left || ' day' || case when v_left = 1 then '' else 's' end,
            'J$' || to_char(b.amount_jmd, 'FM999,999,990.00') || ' due ' || to_char(b.due_date, 'DD Mon YYYY') || '.');
          update public.platform_bills set reminders_sent = reminders_sent || v_left where id = b.id;
          n_remind := n_remind + 1;
        end if;
        if v_today > b.due_date + v_grace then
          update public.companies set billing_locked = true, billing_locked_at = now()
           where id = r.id and not billing_locked;
          if found then
            perform public._notify_company_admins(r.id, 'bill.locked', 'Your company is read-only',
              'Your Magnus bill is overdue. You can view and download everything, but can''t add or change anything until it is paid.', true);
            perform public._notify_platform_admins('company.locked', r.name || ' is now read-only (unpaid)',
              'Bill due ' || to_char(b.due_date, 'DD Mon YYYY') || '.');
            n_locked := n_locked + 1;
          end if;
        end if;
      end loop;
    end loop;
  else
    -- Charging OFF = everything is free: lift every unpaid lock.
    update public.companies set billing_locked = false, billing_locked_at = null where billing_locked;
    get diagnostics n_unlocked = row_count;
  end if;

  n_purged := public.hq_purge_expired_companies();

  update public.platform_job_runs
     set finished_at = now(), ok = true,
         details = jsonb_build_object('charging_on', v_charging, 'bills_created', n_bills, 'reminders', n_remind,
                                      'locked', n_locked, 'unlocked', n_unlocked, 'purged', n_purged)
   where id = v_run;

  return (select details from public.platform_job_runs where id = v_run);
exception when others then
  -- The work above is rolled back; record the failure so HQ Health sees it.
  insert into public.platform_job_runs (job, finished_at, ok, details)
  values ('daily', now(), false, jsonb_build_object('error', sqlerrm));
  return jsonb_build_object('error', sqlerrm);
end;
$$;

revoke all on function public.hq_daily_job() from public, anon, authenticated;

-- Schedule it: every night at 1:10 am Jamaica (06:10 UTC).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('magnus-hq-daily', '10 6 * * *', 'select public.hq_daily_job()');
    raise notice 'Daily job scheduled: magnus-hq-daily at 06:10 UTC (1:10 am Jamaica).';
  else
    raise notice 'pg_cron is not enabled. Turn it on in Supabase: Database -> Extensions -> pg_cron, then run this file again.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Company owner side ("My plan")
-- ---------------------------------------------------------------------
create or replace function public.my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_role    text;
  s         jsonb := public._billing_settings();
  c         public.companies;
  cs        public.company_settings;
begin
  select up.company_id, up.role into v_company, v_role from public.user_profiles up where up.id = auth.uid();
  if v_company is null then raise exception 'not found'; end if;
  select * into c from public.companies where id = v_company;
  select * into cs from public.company_settings where company_id = v_company;

  if v_role not in ('director', 'admin') then
    return jsonb_build_object('can_manage', false, 'charging_on', coalesce((s ->> 'charging_on')::boolean, false),
                              'billing_locked', c.billing_locked);
  end if;

  return jsonb_build_object(
    'can_manage',       true,
    'company_name',     c.name,
    'charging_on',      coalesce((s ->> 'charging_on')::boolean, false),
    'grace_days',       coalesce((s ->> 'grace_days')::int, 7),
    'billing_locked',   c.billing_locked,
    'plan_key',         coalesce(nullif(cs.subscription_plan, ''), s ->> 'default_plan'),
    'trial_expires_at', cs.trial_expires_at,
    'paid_until',       case when cs.subscription_status = 'active' then cs.subscription_expires_at end,
    'users',            (select count(*) from public.user_profiles where company_id = v_company),
    'pay_to',           jsonb_build_object('lynk_handle', s ->> 'lynk_handle', 'bank_details', s ->> 'bank_details',
                                           'payment_note', s ->> 'payment_note'),
    'plans',            (select coalesce(jsonb_agg(jsonb_build_object('key', substr(p.key, 6), 'label', p.label, 'amount_jmd', p.amount_jmd,
                                          'included_seats', p.included_seats, 'features', p.features, 'description', p.description)
                                          order by p.sort), '[]')
                           from public.platform_prices p where p.key like 'plan.%' and p.active),
    'bills',            (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'period_start', b.period_start, 'period_end', b.period_end,
                                          'due_date', b.due_date, 'amount_jmd', b.amount_jmd, 'lines', b.lines, 'status', b.status,
                                          'plan_key', b.plan_key) order by b.period_start desc), '[]')
                           from (select * from public.platform_bills where company_id = v_company and status <> 'void'
                                  order by period_start desc limit 12) b),
    'payments',         (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'bill_id', p.bill_id, 'amount_jmd', p.amount_jmd,
                                          'method', p.method, 'reference', p.reference, 'paid_on', p.paid_on, 'status', p.status,
                                          'reject_reason', p.reject_reason) order by p.claimed_at desc), '[]')
                           from (select * from public.platform_payments where company_id = v_company
                                  order by claimed_at desc limit 20) p)
  );
end;
$$;

create or replace function public.my_claim_payment(p_bill uuid, p_amount numeric, p_method text, p_reference text, p_paid_on date)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_role    text;
  b         public.platform_bills;
begin
  select up.company_id, up.role into v_company, v_role from public.user_profiles up where up.id = auth.uid();
  if v_company is null or v_role not in ('director', 'admin') then raise exception 'Only a director or admin can do this.'; end if;

  select * into b from public.platform_bills where id = p_bill and company_id = v_company for update;
  if not found then raise exception 'Bill not found.'; end if;
  if b.status <> 'open' then raise exception 'This bill is already %.', b.status; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Type the amount you paid.'; end if;
  if p_method not in ('lynk', 'bank', 'cash', 'card', 'other') then raise exception 'Choose how you paid.'; end if;
  if length(trim(coalesce(p_reference, ''))) < 2 then raise exception 'Type the payment reference.'; end if;

  insert into public.platform_payments (bill_id, company_id, company_name, amount_jmd, method, reference, paid_on, source, status, claimed_by)
  values (b.id, v_company, b.company_name, p_amount, p_method, trim(p_reference), coalesce(p_paid_on, public._jm_today()),
          'company', 'claimed', auth.uid());

  update public.platform_bills set status = 'claimed' where id = b.id;

  perform public._notify_platform_admins('payment.claimed', 'Payment to confirm: ' || b.company_name,
    'J$' || to_char(p_amount, 'FM999,999,990.00') || ' by ' || p_method || ', ref ' || trim(p_reference) || '.', true);
end;
$$;

revoke all on function public.my_plan() from public, anon;
revoke all on function public.my_claim_payment(uuid, numeric, text, text, date) from public, anon;
grant execute on function public.my_plan() to authenticated;
grant execute on function public.my_claim_payment(uuid, numeric, text, text, date) to authenticated;

-- Public price list (for the front page in Step 10).
create or replace function public.get_public_prices()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'charging_on', coalesce((public._billing_settings() ->> 'charging_on')::boolean, false),
    'trial_days',  coalesce((public._billing_settings() ->> 'trial_days')::int, 14),
    'prices', (select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'label', p.label, 'per', p.per, 'amount_jmd', p.amount_jmd,
                      'included_seats', p.included_seats, 'features', p.features, 'description', p.description) order by p.sort), '[]')
                 from public.platform_prices p where p.active));
$$;

revoke all on function public.get_public_prices() from public;
grant execute on function public.get_public_prices() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. HQ Money tab
-- ---------------------------------------------------------------------
create or replace function public.hq_billing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', public._jm_today())::date;
begin
  perform public.platform_require(false);
  return jsonb_build_object(
    'settings', public._billing_settings(),
    'prices', (select coalesce(jsonb_agg(to_jsonb(p) order by p.sort), '[]') from public.platform_prices p),
    'to_confirm', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'company_id', p.company_id, 'company_name', p.company_name,
                          'amount_jmd', p.amount_jmd, 'method', p.method, 'reference', p.reference, 'paid_on', p.paid_on,
                          'claimed_at', p.claimed_at, 'bill_amount', b.amount_jmd, 'bill_due', b.due_date,
                          'claimed_by_email', u.email) order by p.claimed_at), '[]')
                     from public.platform_payments p
                     left join public.platform_bills b on b.id = p.bill_id
                     left join auth.users u on u.id = p.claimed_by
                    where p.status = 'claimed'),
    'open_bills', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'company_id', b.company_id, 'company_name', b.company_name,
                          'amount_jmd', b.amount_jmd, 'due_date', b.due_date, 'status', b.status, 'period_start', b.period_start,
                          'period_end', b.period_end, 'locked', coalesce(c.billing_locked, false)) order by b.due_date), '[]')
                     from public.platform_bills b left join public.companies c on c.id = b.company_id
                    where b.status in ('open', 'claimed')),
    'recent_payments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.decided_at desc nulls last), '[]') from (
                          select p.id, p.company_name, p.amount_jmd, p.method, p.reference, p.paid_on, p.status, p.source,
                                 p.reject_reason, p.decided_at
                            from public.platform_payments p where p.status <> 'claimed'
                           order by p.decided_at desc nulls last limit 30) x),
    'money_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m.month::date, 'amount', coalesce(t.amount, 0)) order by m.month), '[]')
                         from generate_series(v_month - interval '11 months', v_month, interval '1 month') as m(month)
                         left join (select date_trunc('month', p.paid_on)::date as month, sum(p.amount_jmd) as amount
                                      from public.platform_payments p where p.status = 'confirmed' group by 1) t
                           on t.month = m.month::date),
    'income_month', (select coalesce(sum(amount_jmd), 0) from public.platform_payments
                      where status = 'confirmed' and paid_on >= v_month),
    'last_job', (select to_jsonb(j) from public.platform_job_runs j where j.job = 'daily' order by j.started_at desc limit 1),
    'companies', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name), '[]')
                    from public.companies c where not c.is_system and c.account_status <> 'closed')
  );
end;
$$;

create or replace function public.hq_billing_save_settings(p_settings jsonb, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  k text;
begin
  perform public.platform_check('billing.settings', null,
            jsonb_build_object('reason', p_reason, 'changes', p_settings), true);
  for k in select jsonb_object_keys(coalesce(p_settings, '{}'::jsonb)) loop
    if k not in ('charging_on', 'trial_days', 'grace_days', 'default_plan', 'lynk_handle', 'bank_details', 'payment_note', 'usd_rate') then
      raise exception 'Unknown setting: %', k;
    end if;
  end loop;
  if p_settings ? 'grace_days' and (p_settings ->> 'grace_days')::int not between 0 and 60 then raise exception 'Grace days must be 0 to 60.'; end if;
  if p_settings ? 'trial_days' and (p_settings ->> 'trial_days')::int not between 0 and 365 then raise exception 'Trial days must be 0 to 365.'; end if;
  update public.platform_settings set value = public._billing_settings() || p_settings, updated_by = auth.uid(), updated_at = now()
   where key = 'billing';
end;
$$;

create or replace function public.hq_price_save(p_price jsonb, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := p_price ->> 'key';
begin
  perform public.platform_check('billing.price', v_key, jsonb_build_object('reason', p_reason, 'price', p_price), true);
  if coalesce(v_key, '') !~ '^(plan|extra)\.[a-z_]+$' then raise exception 'Price key must look like plan.name or extra.name'; end if;
  if length(trim(coalesce(p_price ->> 'label', ''))) = 0 then raise exception 'Give the price a name.'; end if;

  insert into public.platform_prices (key, label, per, amount_jmd, included_seats, features, description, active, sort, updated_at)
  values (v_key, trim(p_price ->> 'label'), coalesce(p_price ->> 'per', 'company'),
          nullif(p_price ->> 'amount_jmd', '')::numeric, nullif(p_price ->> 'included_seats', '')::int,
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_price -> 'features', '[]'::jsonb)) x), '{}'),
          p_price ->> 'description', coalesce((p_price ->> 'active')::boolean, true),
          coalesce(nullif(p_price ->> 'sort', '')::int, 100), now())
  on conflict (key) do update set
    label = excluded.label, per = excluded.per, amount_jmd = excluded.amount_jmd,
    included_seats = excluded.included_seats, features = excluded.features,
    description = excluded.description, active = excluded.active, sort = excluded.sort, updated_at = now();
end;
$$;

create or replace function public.hq_payment_decide(p_payment uuid, p_confirm boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid;
  p    public.platform_payments;
begin
  v_me := public.platform_check(case when p_confirm then 'payment.confirm' else 'payment.reject' end,
            p_payment::text, jsonb_build_object('reason', p_reason), false);

  select * into p from public.platform_payments where id = p_payment for update;
  if not found then raise exception 'Payment not found.'; end if;
  if p.status <> 'claimed' then raise exception 'Already %.', p.status; end if;

  if p_confirm then
    update public.platform_payments set status = 'confirmed', decided_by = v_me, decided_at = now(),
           note = nullif(trim(coalesce(p_reason, '')), '')
     where id = p.id;
    if p.bill_id is not null then perform public._apply_paid_bill(p.bill_id); end if;
    if p.company_id is not null then
      perform public._notify_company_admins(p.company_id, 'payment.confirmed', 'Payment received - thank you',
        'J$' || to_char(p.amount_jmd, 'FM999,999,990.00') || ' (ref ' || coalesce(p.reference, '-') || ') is confirmed.');
    end if;
  else
    if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write why it was not received.'; end if;
    update public.platform_payments set status = 'rejected', decided_by = v_me, decided_at = now(), reject_reason = trim(p_reason)
     where id = p.id;
    update public.platform_bills set status = 'open' where id = p.bill_id and status = 'claimed';
    if p.company_id is not null then
      perform public._notify_company_admins(p.company_id, 'payment.rejected', 'Payment not received',
        'Ref ' || coalesce(p.reference, '-') || ': ' || trim(p_reason), true);
    end if;
  end if;
end;
$$;

-- Record a payment by hand. Pays the oldest unpaid bill; if there is none, makes a paid bill for N months.
create or replace function public.hq_record_payment(p_company uuid, p_amount numeric, p_method text, p_reference text,
                                                    p_paid_on date, p_months int, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid;
  v_months int := greatest(coalesce(p_months, 1), 1);
  c        public.companies;
  cs       public.company_settings;
  b        public.platform_bills;
  v_start  date;
  v_plan   text;
begin
  v_me := public.platform_check('payment.record', p_company::text,
            jsonb_build_object('reason', p_reason, 'amount', p_amount, 'method', p_method, 'reference', p_reference, 'months', v_months), false);
  if coalesce(p_amount, 0) <= 0 then raise exception 'Type the amount.'; end if;
  if p_method not in ('lynk', 'bank', 'cash', 'card', 'other') then raise exception 'Choose how they paid.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a note (what this payment is for).'; end if;

  select * into c from public.companies where id = p_company;
  if not found or c.is_system then raise exception 'Company not found.'; end if;
  select * into cs from public.company_settings where company_id = p_company;

  select * into b from public.platform_bills
   where company_id = p_company and status in ('open', 'claimed') order by due_date limit 1 for update;

  if not found then
    v_plan := coalesce(nullif(cs.subscription_plan, ''), public._billing_settings() ->> 'default_plan');
    v_start := greatest(coalesce(case when cs.subscription_status = 'active'
                                      then (cs.subscription_expires_at at time zone 'America/Jamaica')::date end,
                                 public._jm_today()), public._jm_today());
    insert into public.platform_bills (company_id, company_name, plan_key, period_start, period_end, due_date, amount_jmd, lines)
    values (p_company, c.name, v_plan, v_start, (v_start + make_interval(months => v_months))::date, v_start, p_amount,
            jsonb_build_array(jsonb_build_object('label', 'Recorded by HQ', 'qty', v_months, 'amount', p_amount)))
    returning * into b;
  else
    -- An "I've paid" claim on that bill is settled by this payment.
    update public.platform_payments set status = 'confirmed', decided_by = v_me, decided_at = now(), note = 'Covered by a payment HQ recorded'
     where bill_id = b.id and status = 'claimed';
  end if;

  insert into public.platform_payments (bill_id, company_id, company_name, amount_jmd, method, reference, paid_on, source, status,
                                        claimed_by, decided_by, decided_at, note)
  values (b.id, p_company, c.name, p_amount, p_method, nullif(trim(coalesce(p_reference, '')), ''), coalesce(p_paid_on, public._jm_today()),
          'hq', 'confirmed', v_me, v_me, now(), p_reason);

  perform public._apply_paid_bill(b.id);
  perform public._notify_company_admins(p_company, 'payment.confirmed', 'Payment received - thank you',
    'J$' || to_char(p_amount, 'FM999,999,990.00') || ' recorded.');
end;
$$;

create or replace function public.hq_bill_void(p_bill uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
begin
  perform public.platform_check('bill.void', p_bill::text, jsonb_build_object('reason', p_reason), true);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason.'; end if;
  update public.platform_bills set status = 'void', void_reason = trim(p_reason)
   where id = p_bill and status in ('open', 'claimed')
   returning company_id into v_company;
  if not found then raise exception 'Only an unpaid bill can be cancelled.'; end if;
  update public.platform_payments set status = 'rejected', reject_reason = 'Bill cancelled: ' || trim(p_reason), decided_at = now()
   where bill_id = p_bill and status = 'claimed';
  -- Unlock if no other overdue bill is holding the company.
  update public.companies c set billing_locked = false, billing_locked_at = null
   where c.id = v_company and c.billing_locked
     and not exists (select 1 from public.platform_bills b where b.company_id = c.id and b.status = 'open'
                       and public._jm_today() > b.due_date + coalesce((public._billing_settings() ->> 'grace_days')::int, 7));
end;
$$;

create or replace function public.hq_run_daily_job(p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_check('job.run_daily', null, jsonb_build_object('reason', p_reason), true);
  return public.hq_daily_job();
end;
$$;

revoke all on function public.hq_billing() from public, anon;
revoke all on function public.hq_billing_save_settings(jsonb, text) from public, anon;
revoke all on function public.hq_price_save(jsonb, text) from public, anon;
revoke all on function public.hq_payment_decide(uuid, boolean, text) from public, anon;
revoke all on function public.hq_record_payment(uuid, numeric, text, text, date, int, text) from public, anon;
revoke all on function public.hq_bill_void(uuid, text) from public, anon;
revoke all on function public.hq_run_daily_job(text) from public, anon;
grant execute on function public.hq_billing() to authenticated;
grant execute on function public.hq_billing_save_settings(jsonb, text) to authenticated;
grant execute on function public.hq_price_save(jsonb, text) to authenticated;
grant execute on function public.hq_payment_decide(uuid, boolean, text) to authenticated;
grant execute on function public.hq_record_payment(uuid, numeric, text, text, date, int, text) to authenticated;
grant execute on function public.hq_bill_void(uuid, text) to authenticated;
grant execute on function public.hq_run_daily_job(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Overview: income this month, payments to confirm, daily job heartbeat, "free" companies
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

-- ---------------------------------------------------------------------
-- 8. Change plan also accepts "free" (never billed: use it for your own company and partners)
--    and any plan added in HQ Money.
-- ---------------------------------------------------------------------
create or replace function public.hq_company_action(
  p_company uuid,
  p_action  text,
  p_reason  text,
  p_args    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_co    public.companies;
  v_owner boolean := p_action in ('close', 'reopen', 'mark_test');
  v_days  int;
  v_plan  text;
begin
  perform public.platform_check('company.' || coalesce(p_action, '?'), p_company::text,
            jsonb_build_object('reason', p_reason) || coalesce(p_args, '{}'::jsonb), v_owner);

  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Write a reason first.';
  end if;

  select * into v_co from public.companies where id = p_company for update;
  if not found or v_co.is_system then
    raise exception 'Company not found.';
  end if;

  if p_action = 'extend_trial' then
    v_days := coalesce((p_args ->> 'days')::int, 0);
    if v_days not in (14, 30) then raise exception 'Extend by 14 or 30 days.'; end if;
    update public.company_settings
       set trial_expires_at = greatest(coalesce(trial_expires_at, now()), now()) + make_interval(days => v_days)
     where company_id = p_company;
    if not found then
      insert into public.company_settings (company_id, trial_expires_at)
      values (p_company, now() + make_interval(days => v_days));
    end if;

  elsif p_action = 'set_plan' then
    v_plan := nullif(lower(trim(coalesce(p_args ->> 'plan', ''))), '');
    if v_plan is not null and v_plan not in ('free', 'starter', 'pro', 'enterprise')
       and not exists (select 1 from public.platform_prices where key = 'plan.' || v_plan) then
      raise exception 'Unknown plan.';
    end if;
    update public.company_settings set subscription_plan = v_plan where company_id = p_company;
    if not found then
      insert into public.company_settings (company_id, subscription_plan) values (p_company, v_plan);
    end if;

  elsif p_action = 'pause' then
    if v_co.account_status <> 'active' then raise exception 'Only an active company can be paused.'; end if;
    update public.companies
       set account_status = 'paused', status_reason = p_reason, status_changed_at = now()
     where id = p_company;

  elsif p_action = 'unpause' then
    if v_co.account_status <> 'paused' then raise exception 'This company is not paused.'; end if;
    update public.companies
       set account_status = 'active', status_reason = null, status_changed_at = now()
     where id = p_company;

  elsif p_action = 'close' then
    if v_co.account_status = 'closed' then raise exception 'Already closed.'; end if;
    if coalesce(p_args ->> 'confirm_name', '') <> v_co.name then
      raise exception 'The company name you typed doesn''t match.';
    end if;
    update public.companies
       set account_status = 'closed', status_reason = p_reason, status_changed_at = now(),
           closed_at = now(), purge_after = now() + interval '90 days'
     where id = p_company;

  elsif p_action = 'reopen' then
    if v_co.account_status <> 'closed' then raise exception 'This company is not closed.'; end if;
    if v_co.purge_after is not null and v_co.purge_after <= now() then
      raise exception 'Too late: this company''s 90 days are over.';
    end if;
    update public.companies
       set account_status = 'active', status_reason = null, status_changed_at = now(),
           closed_at = null, purge_after = null
     where id = p_company;

  elsif p_action = 'mark_test' then
    update public.companies set is_test = coalesce((p_args ->> 'is_test')::boolean, true) where id = p_company;

  else
    raise exception 'Unknown action.';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

