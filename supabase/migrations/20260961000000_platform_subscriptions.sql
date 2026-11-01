-- =====================================================================
-- Magnus HQ - Step 6b: My subscriptions & bills (what the owner pays to keep Magnus running)
-- Magnus Boy's System
--
--   * platform_subscriptions          - every service the platform depends on: cost, cycle, next due date,
--                                       card LAST 4 DIGITS ONLY, login email, Pay now / dashboard / status links.
--                                       Owner-admin only. NEVER passwords, full card numbers or API keys:
--                                       the save function refuses anything that looks like one.
--   * platform_subscription_payments  - "I paid it" history per service.
--   * hq_subscriptions(), hq_subscription_save(), hq_subscription_paid(), hq_subscription_history()
--   * hq_subscription_reminders()     - daily (pg_cron 1:20 am Jamaica): 14 / 7 / 3 / 1 days before due and EVERY day
--                                       while overdue, to the owner-admin (bell now, phone push in Step 7).
--   * _hq_attention_extra()           - overdue / due-soon bills at the top of Overview, with a Pay now link.
--   * _health_checks()                - an OVERDUE bill for a service the app needs (Supabase, Vercel, domain) is a PROBLEM.
--
-- Pre-filled from the repo scan with each service's real billing page. Cost and due date are left blank for you.
-- Safe to run twice.
-- =====================================================================

create table if not exists public.platform_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  service         text not null unique,
  purpose         text,
  plan            text,
  cost            numeric(12, 2),
  currency        text not null default 'USD' check (currency in ('USD', 'JMD')),
  cycle           text not null default 'monthly' check (cycle in ('monthly', 'yearly')),
  next_due        date,
  auto_renew      boolean not null default false,
  card_last4      text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  login_email     text,
  billing_url     text,
  dashboard_url   text,
  status_url      text,
  notes           text,
  critical        boolean not null default false,   -- the platform goes down if this lapses
  active          boolean not null default true,
  sort            int not null default 100,
  reminders_sent  int[] not null default '{}',      -- for the current due date
  last_overdue_notice date,
  updated_at      timestamptz not null default now()
);

create table if not exists public.platform_subscription_payments (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.platform_subscriptions(id) on delete cascade,
  paid_on         date not null,
  amount          numeric(12, 2),
  currency        text,
  reference       text,
  note            text,
  due_before      date,
  due_after       date,
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_platform_sub_payments on public.platform_subscription_payments (subscription_id, paid_on desc);

alter table public.platform_subscriptions enable row level security;
alter table public.platform_subscription_payments enable row level security;
revoke all on public.platform_subscriptions, public.platform_subscription_payments from anon, authenticated;

insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'platform_subscriptions',         'Magnus HQ: the owner''s service bills, owner-admin functions only.'),
  ('no_policies', 'platform_subscription_payments', 'Magnus HQ: payment history of the owner''s service bills.')
on conflict (kind, object) do update set note = excluded.note;

-- Pre-fill: every service the code or its settings use. Cost and next due date are left for the owner.
insert into public.platform_subscriptions (service, purpose, plan, currency, cycle, critical, billing_url, dashboard_url, status_url, sort) values
  ('Supabase',    'Database, sign-in, file storage, server functions, the daily job', 'Free', 'USD', 'monthly', true,
     'https://supabase.com/dashboard/org/_/billing', 'https://supabase.com/dashboard/project/julylfxbdwgekzqsxykb', 'https://status.supabase.com', 10),
  ('Vercel',      'Hosting of app.magnusboys.com and the /api functions', 'Hobby', 'USD', 'monthly', true,
     'https://vercel.com/account/billing', 'https://vercel.com/dashboard', 'https://www.vercel-status.com', 20),
  ('GoDaddy - magnusboys.com', 'The domain name and its DNS', 'Domain', 'USD', 'yearly', true,
     'https://account.godaddy.com/products', 'https://dcc.godaddy.com/control/portfolio', null, 30),
  ('GitHub',      'The code (magnus-system-v3)', 'Free', 'USD', 'monthly', false,
     'https://github.com/settings/billing', 'https://github.com/magnusboysacct-sketch/magnus-system-v3', 'https://www.githubstatus.com', 40),
  ('Anthropic',   'Magnus AI (the magnus-ai server function)', 'Pay as you go', 'USD', 'monthly', false,
     'https://console.anthropic.com/settings/billing', 'https://console.anthropic.com', 'https://status.anthropic.com', 50),
  ('Resend',      'Invite, password-reset and payslip emails', 'Free', 'USD', 'monthly', false,
     'https://resend.com/settings/billing', 'https://resend.com/overview', 'https://resend-status.com', 60),
  ('Google / Gmail', 'magnusboysacct@gmail.com: sign-in emails and the HQ login', 'Free', 'USD', 'monthly', false,
     'https://one.google.com/storage', 'https://myaccount.google.com', 'https://www.google.com/appsstatus/dashboard/', 70),
  ('UptimeRobot', 'Watches app.magnusboys.com/api/health every 5 minutes', 'Free', 'USD', 'monthly', false,
     'https://dashboard.uptimerobot.com/billing', 'https://dashboard.uptimerobot.com', null, 80),
  ('OpenWeather', 'Weather on the site screens', 'Free', 'USD', 'monthly', false,
     'https://home.openweathermap.org/subscriptions', 'https://home.openweathermap.org', null, 90)
on conflict (service) do nothing;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Refuse anything that looks like a password, full card number or API key.
create or replace function public._looks_secret(p text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p, '') ~* '(\m(\d[ -]?){13,19}\M|sk-[a-z0-9_-]{10,}|sk_(live|test)_|ghp_[a-z0-9]{10,}|github_pat_|eyJ[a-z0-9_-]{10,}\.|AKIA[0-9A-Z]{12,}|password\s*[:=]|passwd|pwd\s*[:=]|pin\s*[:=]\s*\d)';
$$;

-- Days until due (negative = overdue), using Jamaica dates.
create or replace function public._sub_days_left(p_due date)
returns int
language sql
stable
set search_path = public, pg_temp
as $$ select case when p_due is null then null else p_due - public._jm_today() end $$;

-- Monthly cost of one service in J$ (yearly / 12), using the J$-per-US$ rate from the billing settings.
create or replace function public._sub_monthly_jmd(s public.platform_subscriptions)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when s.cost is null or not s.active then 0 else
    (s.cost / case when s.cycle = 'yearly' then 12 else 1 end)
    * case when s.currency = 'USD' then coalesce((public._billing_settings() ->> 'usd_rate')::numeric, 157) else 1 end
  end;
$$;

revoke all on function public._sub_monthly_jmd(public.platform_subscriptions) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- HQ Bills tab (owner-admin only)
-- ---------------------------------------------------------------------
create or replace function public.hq_subscriptions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rate   numeric := coalesce((public._billing_settings() ->> 'usd_rate')::numeric, 157);
  v_month  date := date_trunc('month', public._jm_today())::date;
  v_cost   numeric;
begin
  perform public.platform_require(true);
  select coalesce(sum(public._sub_monthly_jmd(s)), 0) into v_cost from public.platform_subscriptions s;
  return jsonb_build_object(
    'usd_rate', v_rate,
    'services', (select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
                    'days_left', public._sub_days_left(s.next_due),
                    'monthly_jmd', public._sub_monthly_jmd(s),
                    'last_paid', (select max(p.paid_on) from public.platform_subscription_payments p where p.subscription_id = s.id))
                  order by s.active desc, s.next_due nulls last, s.sort), '[]')
                 from public.platform_subscriptions s),
    'cost_month_jmd', round(v_cost, 2),
    'cost_month_usd', round(v_cost / v_rate, 2),
    'cost_year_jmd',  round(v_cost * 12, 2),
    'cost_year_usd',  round(v_cost * 12 / v_rate, 2),
    'income_month_jmd', (select coalesce(sum(amount_jmd), 0) from public.platform_payments
                          where status = 'confirmed' and paid_on >= v_month),
    'income_avg3_jmd', (select round(coalesce(sum(amount_jmd), 0) / 3, 2) from public.platform_payments
                          where status = 'confirmed' and paid_on >= (v_month - interval '3 months') and paid_on < v_month)
  );
end;
$$;

create or replace function public.hq_subscription_save(p_sub jsonb, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid := nullif(p_sub ->> 'id', '')::uuid;
  v_old  public.platform_subscriptions;
  v_card text := nullif(regexp_replace(coalesce(p_sub ->> 'card_last4', ''), '\D', '', 'g'), '');
  k      text;
begin
  perform public.platform_check('subscription.save', coalesce(p_sub ->> 'service', v_id::text),
            jsonb_build_object('reason', p_reason, 'changes', p_sub - 'notes'), true);

  if length(trim(coalesce(p_sub ->> 'service', ''))) = 0 then raise exception 'Give the service a name.'; end if;
  if v_card is not null and length(v_card) <> 4 then
    raise exception 'Only the LAST 4 digits of the card. Never the full card number.';
  end if;
  foreach k in array array['service', 'purpose', 'plan', 'login_email', 'notes', 'billing_url', 'dashboard_url', 'status_url'] loop
    if public._looks_secret(p_sub ->> k) then
      raise exception 'The % looks like it has a password, card number or key in it. Those must never be stored here.', replace(k, '_', ' ');
    end if;
  end loop;
  foreach k in array array['billing_url', 'dashboard_url', 'status_url'] loop
    if coalesce(p_sub ->> k, '') <> '' and (p_sub ->> k) !~* '^https://' then
      raise exception 'The % must start with https://', replace(k, '_', ' ');
    end if;
  end loop;

  if v_id is not null then
    select * into v_old from public.platform_subscriptions where id = v_id for update;
    if not found then raise exception 'Service not found.'; end if;
  end if;

  insert into public.platform_subscriptions as s (
    id, service, purpose, plan, cost, currency, cycle, next_due, auto_renew, card_last4, login_email,
    billing_url, dashboard_url, status_url, notes, critical, active, sort, updated_at)
  values (
    coalesce(v_id, gen_random_uuid()), trim(p_sub ->> 'service'), nullif(trim(coalesce(p_sub ->> 'purpose', '')), ''),
    nullif(trim(coalesce(p_sub ->> 'plan', '')), ''), nullif(p_sub ->> 'cost', '')::numeric,
    coalesce(nullif(p_sub ->> 'currency', ''), 'USD'), coalesce(nullif(p_sub ->> 'cycle', ''), 'monthly'),
    nullif(p_sub ->> 'next_due', '')::date, coalesce((p_sub ->> 'auto_renew')::boolean, false), v_card,
    nullif(trim(coalesce(p_sub ->> 'login_email', '')), ''),
    nullif(trim(coalesce(p_sub ->> 'billing_url', '')), ''), nullif(trim(coalesce(p_sub ->> 'dashboard_url', '')), ''),
    nullif(trim(coalesce(p_sub ->> 'status_url', '')), ''), nullif(trim(coalesce(p_sub ->> 'notes', '')), ''),
    coalesce((p_sub ->> 'critical')::boolean, false), coalesce((p_sub ->> 'active')::boolean, true),
    coalesce(nullif(p_sub ->> 'sort', '')::int, 100), now())
  on conflict (id) do update set
    service = excluded.service, purpose = excluded.purpose, plan = excluded.plan, cost = excluded.cost,
    currency = excluded.currency, cycle = excluded.cycle, next_due = excluded.next_due, auto_renew = excluded.auto_renew,
    card_last4 = excluded.card_last4, login_email = excluded.login_email, billing_url = excluded.billing_url,
    dashboard_url = excluded.dashboard_url, status_url = excluded.status_url, notes = excluded.notes,
    critical = excluded.critical, active = excluded.active, sort = excluded.sort, updated_at = now(),
    -- a new due date starts its reminders again
    reminders_sent = case when excluded.next_due is distinct from s.next_due then '{}' else s.reminders_sent end,
    last_overdue_notice = case when excluded.next_due is distinct from s.next_due then null else s.last_overdue_notice end
  returning id into v_id;

  return v_id;
end;
$$;

-- "I paid it": record the payment and move the next due date on by one month or year.
create or replace function public.hq_subscription_paid(p_id uuid, p_paid_on date, p_amount numeric, p_reference text, p_note text)
returns date
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid;
  s     public.platform_subscriptions;
  v_new date;
begin
  v_me := public.platform_check('subscription.paid', p_id::text,
            jsonb_build_object('amount', p_amount, 'reference', p_reference), true);
  select * into s from public.platform_subscriptions where id = p_id for update;
  if not found then raise exception 'Service not found.'; end if;
  if public._looks_secret(p_reference) or public._looks_secret(p_note) then
    raise exception 'That looks like a card number, password or key. Only write a payment reference.';
  end if;

  v_new := case
    when s.next_due is null then null
    when s.cycle = 'yearly' then (s.next_due + interval '1 year')::date
    else (s.next_due + interval '1 month')::date end;

  insert into public.platform_subscription_payments (subscription_id, paid_on, amount, currency, reference, note, due_before, due_after, recorded_by)
  values (p_id, coalesce(p_paid_on, public._jm_today()), coalesce(p_amount, s.cost), s.currency,
          nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_note, '')), ''), s.next_due, v_new, v_me);

  update public.platform_subscriptions
     set next_due = v_new, reminders_sent = '{}', last_overdue_notice = null, updated_at = now()
   where id = p_id;
  return v_new;
end;
$$;

create or replace function public.hq_subscription_history(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(true);
  return coalesce((select jsonb_agg(to_jsonb(p) order by p.paid_on desc, p.created_at desc)
                     from public.platform_subscription_payments p where p.subscription_id = p_id), '[]'::jsonb);
end;
$$;

revoke all on function public.hq_subscriptions() from public, anon;
revoke all on function public.hq_subscription_save(jsonb, text) from public, anon;
revoke all on function public.hq_subscription_paid(uuid, date, numeric, text, text) from public, anon;
revoke all on function public.hq_subscription_history(uuid) from public, anon;
grant execute on function public.hq_subscriptions() to authenticated;
grant execute on function public.hq_subscription_save(jsonb, text) to authenticated;
grant execute on function public.hq_subscription_paid(uuid, date, numeric, text, text) to authenticated;
grant execute on function public.hq_subscription_history(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Reminders: 14 / 7 / 3 / 1 days before, and every day while overdue (owner-admin only)
-- ---------------------------------------------------------------------
create or replace function public.hq_subscription_reminders()
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s     record;
  v_d   int;
  v_n   int := 0;
  v_amt text;
begin
  for s in select * from public.platform_subscriptions where active and next_due is not null loop
    v_d := public._sub_days_left(s.next_due);
    v_amt := case when s.cost is null then '' else ' (' || case when s.currency = 'USD' then 'US$' else 'J$' end
                  || to_char(s.cost, 'FM999,999,990.00') || ')' end;

    if v_d in (14, 7, 3, 1) and not (v_d = any (s.reminders_sent)) then
      insert into public.notifications (user_id, kind, title, body, link, urgent)
      select pa.user_id, 'bill.due', s.service || ' is due in ' || v_d || ' day' || case when v_d = 1 then '' else 's' end || v_amt,
             'Due ' || to_char(s.next_due, 'DD Mon YYYY') || case when s.auto_renew then ' (auto-renews' || coalesce(' on card ...' || s.card_last4, '') || ')' else '' end || '.',
             '/hq?tab=bills', s.critical and v_d <= 3
        from public.platform_admins pa where pa.is_owner;
      update public.platform_subscriptions set reminders_sent = reminders_sent || v_d where id = s.id;
      v_n := v_n + 1;
    elsif v_d < 0 and s.last_overdue_notice is distinct from public._jm_today() then
      insert into public.notifications (user_id, kind, title, body, link, urgent)
      select pa.user_id, 'bill.overdue', 'OVERDUE: ' || s.service || v_amt,
             'Was due ' || to_char(s.next_due, 'DD Mon YYYY') || '.' || case when s.critical then ' Magnus stops working if this lapses.' else '' end,
             '/hq?tab=bills', true
        from public.platform_admins pa where pa.is_owner;
      update public.platform_subscriptions set last_overdue_notice = public._jm_today() where id = s.id;
      v_n := v_n + 1;
    end if;
  end loop;

  insert into public.platform_job_runs (job, finished_at, ok, details) values ('bills', now(), true, jsonb_build_object('reminders', v_n));
  return v_n;
end;
$$;

revoke all on function public.hq_subscription_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('magnus-hq-bills', '20 6 * * *', 'select public.hq_subscription_reminders()');
    raise notice 'Bill reminders scheduled: magnus-hq-bills at 06:20 UTC (1:20 am Jamaica).';
  else
    raise notice 'pg_cron is not enabled: bill reminders were not scheduled.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Overview: overdue / due-soon bills with a Pay now link (any admin sees them; only the owner can edit)
-- Later steps add more lines here, so hq_overview() doesn't need copying again.
-- ---------------------------------------------------------------------
create or replace function public._hq_attention_extra()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x.item order by x.ord, x.due), '[]'::jsonb)
    from (
      select case when public._sub_days_left(s.next_due) < 0 then 0 else 1 end as ord, s.next_due as due,
             jsonb_build_object(
               'level', case when public._sub_days_left(s.next_due) < 0 then 'problem' else 'warn' end,
               'tab', 'bills',
               'title', case when public._sub_days_left(s.next_due) < 0 then 'OVERDUE: ' else 'Due soon: ' end || s.service
                        || case when s.cost is null then '' else ' (' || case when s.currency = 'USD' then 'US$' else 'J$' end
                           || to_char(s.cost, 'FM999,999,990.00') || ')' end,
               'detail', case when public._sub_days_left(s.next_due) < 0
                              then 'Was due ' || to_char(s.next_due, 'DD Mon YYYY') || '.' || case when s.critical then ' Magnus stops working if this lapses.' else '' end
                              else 'Due ' || to_char(s.next_due, 'DD Mon YYYY') || ' (' || public._sub_days_left(s.next_due) || ' days).' end,
               'link', s.billing_url,
               'link_label', 'Pay now') as item
        from public.platform_subscriptions s
       where s.active and s.next_due is not null and public._sub_days_left(s.next_due) <= 14
    ) x;
$$;

revoke all on function public._hq_attention_extra() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Health check: service bills (copied from 20260960 with one check added)
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

  -- Step 6b: the owner's own service bills. Overdue on a service the app needs = the platform may go down.
  select count(*) filter (where s.critical and public._sub_days_left(s.next_due) < 0),
         count(*) filter (where public._sub_days_left(s.next_due) < 0 or (s.critical and public._sub_days_left(s.next_due) <= 7))
    into v_prob, v_warn
    from public.platform_subscriptions s where s.active and s.next_due is not null;
  out := out || jsonb_build_object('key', 'bills', 'label', 'Service bills',
    'level', case when v_prob > 0 then 'problem' when v_warn > 0 then 'warn' else 'ok' end,
    'text', case when v_prob > 0 then v_prob || ' bill(s) for a service Magnus needs are OVERDUE'
                 when v_warn > 0 then v_warn || ' bill(s) overdue or due within 7 days'
                 else 'Nothing overdue' end);

  return out;
end;
$$;

revoke all on function public._health_checks() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Overview: include _hq_attention_extra() (copied from 20260960 with one line added)
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

  v_attention := public._hq_attention_extra() || v_attention;

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

