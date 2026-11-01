-- =====================================================================
-- Magnus HQ - Step 7: the bell + phone alerts (web push)
-- Magnus Boy's System
--
--   * notifications.push_state      - pending -> sent / none (no phone set up) / failed
--   * push_subscriptions            - each phone or browser that turned alerts on (endpoint + its public keys only)
--   * save_push_subscription(), remove_push_subscription(), my_push_devices(), send_test_notification()
--   * push_claim_batch(), push_report() - used ONLY by /api/push-dispatch with the service key (server env)
--   * push_kick()                   - pg_cron every minute: if something is waiting to be pushed, calls
--                                     https://app.magnusboys.com/api/push-dispatch (pg_net). No secret is stored:
--                                     the endpoint only sends what is already queued.
--   * New company sign-up           -> HQ admins are alerted.
--   * hq_health_watch()             - pg_cron every 5 minutes: a check that turns PROBLEM alerts HQ admins (urgent),
--                                     and they hear when it is back to normal.
-- Urgent alerts (payments, errors, health problems, overdue bills) stay on the lock screen until tapped.
-- VAPID keys live ONLY in Vercel server env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).
-- Safe to run twice.
-- =====================================================================

alter table public.notifications add column if not exists push_state text not null default 'pending';
alter table public.notifications add column if not exists pushed_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_push_state_check') then
    alter table public.notifications add constraint notifications_push_state_check
      check (push_state in ('pending', 'sending', 'sent', 'none', 'failed'));
  end if;
end;
$$;
-- Anything from before phone alerts existed is never pushed.
update public.notifications set push_state = 'none' where push_state = 'pending' and created_at < now() - interval '1 hour';
create index if not exists idx_notifications_push on public.notifications (push_state, created_at) where push_state in ('pending', 'sending');

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  device      text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  failures    int not null default 0
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_own_read on public.push_subscriptions;
create policy push_subscriptions_own_read on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Phone / browser side
-- ---------------------------------------------------------------------
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_=-]{40,200}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_=-]{10,60}$' then
    raise exception 'That phone subscription doesn''t look right.';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = auth.uid()) >= 10 then
    delete from public.push_subscriptions where id in (
      select id from public.push_subscriptions where user_id = auth.uid() order by coalesce(last_ok_at, created_at) limit 1);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_device, 200))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
    device = excluded.device, failures = 0;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create or replace function public.send_test_notification()
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.notifications where user_id = auth.uid() and kind = 'test' and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'That''s enough tests for now. Try again in a few minutes.';
  end if;
  insert into public.notifications (user_id, kind, title, body, link, urgent)
  values (auth.uid(), 'test', 'Test alert from Magnus', 'If you can read this on your phone, alerts are working.', null, true);
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
revoke all on function public.send_test_notification() from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.send_test_notification() to authenticated;

-- ---------------------------------------------------------------------
-- Sending (service key only, from /api/push-dispatch)
-- ---------------------------------------------------------------------
create or replace function public.push_claim_batch(p_limit int default 100)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  -- No phone set up: nothing to send.
  update public.notifications n set push_state = 'none'
   where n.push_state = 'pending'
     and not exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id);
  -- Too old to be useful as an alert.
  update public.notifications set push_state = 'none'
   where push_state in ('pending', 'sending') and created_at < now() - interval '1 day';
  -- A send that never reported back: try once more.
  update public.notifications set push_state = 'pending'
   where push_state = 'sending' and pushed_at < now() - interval '10 minutes';

  with picked as (
    select n.id from public.notifications n
     where n.push_state = 'pending'
     order by n.urgent desc, n.created_at
     limit greatest(1, least(coalesce(p_limit, 100), 500))
     for update skip locked
  ), marked as (
    update public.notifications n set push_state = 'sending', pushed_at = now()
      from picked where n.id = picked.id
    returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'title', m.title, 'body', m.body, 'link', m.link, 'urgent', m.urgent, 'kind', m.kind,
           'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint,
                                    'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth))), '[]')
                               from public.push_subscriptions s where s.user_id = m.user_id))), '[]'::jsonb)
    into v from marked m;
  return v;
end;
$$;

-- p_results: {"sent": [notification ids], "failed": [ids], "ok_subs": [sub ids], "gone_subs": [sub ids], "bad_subs": [sub ids]}
create or replace function public.push_report(p_results jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notifications set push_state = 'sent', pushed_at = now()
   where id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p_results -> 'sent', '[]')) x);
  update public.notifications set push_state = 'failed', pushed_at = now()
   where id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p_results -> 'failed', '[]')) x);
  update public.push_subscriptions set last_ok_at = now(), failures = 0
   where id in (select (x)::uuid from jsonb_array_elements_text(coalesce(p_results -> 'ok_subs', '[]')) x);
  -- The phone unsubscribed or the app was removed: forget it.
  delete from public.push_subscriptions
   where id in (select (x)::uuid from jsonb_array_elements_text(coalesce(p_results -> 'gone_subs', '[]')) x);
  update public.push_subscriptions set failures = failures + 1
   where id in (select (x)::uuid from jsonb_array_elements_text(coalesce(p_results -> 'bad_subs', '[]')) x);
  delete from public.push_subscriptions where failures >= 20;
end;
$$;

revoke all on function public.push_claim_batch(int) from public, anon, authenticated;
revoke all on function public.push_report(jsonb) from public, anon, authenticated;
grant execute on function public.push_claim_batch(int) to service_role;
grant execute on function public.push_report(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- The every-minute nudge (pg_cron + pg_net). Only calls the site when a phone is waiting for something.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    raise notice 'Could not turn on pg_net (%). Turn it on in Supabase: Database -> Extensions -> pg_net, then run this file again.', sqlerrm;
  end;
end;
$$;

create or replace function public.push_kick()
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if exists (select 1 from public.notifications n
              where n.push_state = 'pending' and n.created_at > now() - interval '1 day'
                and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id))
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform net.http_post(
      url := coalesce((select value ->> 'dispatch_url' from public.platform_settings where key = 'push'),
                      'https://app.magnusboys.com/api/push-dispatch'),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000);
  end if;
end;
$$;

revoke all on function public.push_kick() from public, anon, authenticated;

insert into public.platform_settings (key, value) values
  ('push', '{"dispatch_url": "https://app.magnusboys.com/api/push-dispatch"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- New company sign-up -> HQ admins
-- ---------------------------------------------------------------------
create or replace function public._hq_notify_new_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(new.is_system, false) then
    perform public._notify_platform_admins('company.new', 'New company: ' || coalesce(new.name, 'unnamed'),
      'Signed up just now. Open HQ -> Companies.', false);
  end if;
  return new;
exception when others then
  return new;   -- an alert must never block a sign-up
end;
$$;

drop trigger if exists trg_hq_notify_new_company on public.companies;
create trigger trg_hq_notify_new_company after insert on public.companies
  for each row execute function public._hq_notify_new_company();

-- ---------------------------------------------------------------------
-- Health watcher: alert HQ the moment a check turns PROBLEM, and when it recovers
-- ---------------------------------------------------------------------
create table if not exists public.platform_health_state (
  key    text primary key,
  level  text not null,
  since  timestamptz not null default now()
);
alter table public.platform_health_state enable row level security;
revoke all on public.platform_health_state from anon, authenticated;
insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'push_subscriptions',    'Has own-row policies: users see and delete only their own phones.'),
  ('no_policies', 'platform_health_state', 'Magnus HQ: last level of each health check (for alerts).')
on conflict (kind, object) do update set note = excluded.note;

create or replace function public.hq_health_watch()
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c     jsonb;
  v_old text;
  v_n   int := 0;
begin
  for c in select * from jsonb_array_elements(public._health_checks()) loop
    select level into v_old from public.platform_health_state where key = c ->> 'key';
    if v_old is distinct from (c ->> 'level') then
      if c ->> 'level' = 'problem' then
        perform public._notify_platform_admins('health.problem', 'PROBLEM: ' || (c ->> 'label'), c ->> 'text', true);
        v_n := v_n + 1;
      elsif v_old = 'problem' then
        perform public._notify_platform_admins('health.ok', 'Back to normal: ' || (c ->> 'label'), c ->> 'text', false);
        v_n := v_n + 1;
      end if;
      insert into public.platform_health_state (key, level, since) values (c ->> 'key', c ->> 'level', now())
      on conflict (key) do update set level = excluded.level, since = now();
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.hq_health_watch() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('magnus-push-kick', '* * * * *', 'select public.push_kick()');
    perform cron.schedule('magnus-hq-health-watch', '*/5 * * * *', 'select public.hq_health_watch()');
    raise notice 'Scheduled: magnus-push-kick (every minute) and magnus-hq-health-watch (every 5 minutes).';
  else
    raise notice 'pg_cron is not enabled: phone alerts and the health watcher were not scheduled.';
  end if;
end;
$$;
