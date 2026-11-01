-- =====================================================================
-- Magnus HQ - Step 12: "Ask HQ" assistant
-- Magnus Boy's System
--
--   * platform_settings 'assistant'  - on/off, monthly US$ cap, model name, price per million tokens (owner sets these)
--   * platform_ai_usage              - one row per question: tokens and cost. No question or answer text is kept.
--   * hq_assistant_status()          - HQ: settings + spent this month
--   * hq_assistant_save()            - owner only
--   * hq_assistant_begin()           - called by /api/hq-ask with the ADMIN'S OWN login: checks 2-step login, on/off,
--                                      the monthly cap and 60 questions an hour, then returns the same numbers HQ shows
--                                      (overview, health, open errors, settings). Counts and totals only - never a
--                                      company's documents, payroll or clients.
--   * hq_assistant_record()          - service key only (the server): writes the real tokens used. Cost is worked out
--                                      here from the saved prices, not sent in by anyone.
--
-- The Anthropic key lives ONLY in Vercel (ANTHROPIC_API_KEY). The assistant can only SUGGEST: a banner,
-- maintenance mode, a feature switch, or opening a tab. Nothing changes until an admin taps Confirm,
-- and that goes through the normal hq_setting_save() checks and activity log.
-- Safe to run twice.
-- =====================================================================

insert into public.platform_settings (key, value) values
  ('assistant', '{"on": false, "cap_usd": 10, "model": "claude-sonnet-5-5", "price_in": 2, "price_out": 10}'::jsonb)
on conflict (key) do nothing;

-- Internal values stay out of the public settings read.
create or replace function public.get_platform_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from public.platform_settings
   where key not in ('form_salt', 'push', 'limits', 'billing', 'assistant');
$$;

create table if not exists public.platform_ai_usage (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  admin_id    uuid references auth.users(id) on delete set null,
  model       text not null,
  tokens_in   int not null default 0,
  tokens_out  int not null default 0,
  cost_usd    numeric(10, 5) not null default 0
);

create index if not exists idx_platform_ai_usage_at on public.platform_ai_usage (at desc);

alter table public.platform_ai_usage enable row level security;
revoke all on public.platform_ai_usage from anon, authenticated;

insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'platform_ai_usage', 'Magnus HQ: Ask HQ token and cost log, reached through hq_assistant_* functions only.')
on conflict (kind, object) do update set note = excluded.note;

-- Month boundaries in Jamaica time.
create or replace function public._ai_spent_this_month()
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(cost_usd), 0)
    from public.platform_ai_usage
   where (at at time zone 'America/Jamaica') >= date_trunc('month', now() at time zone 'America/Jamaica');
$$;

create or replace function public._ai_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select '{"on": false, "cap_usd": 10, "model": "claude-sonnet-5-5", "price_in": 2, "price_out": 10}'::jsonb
         || coalesce((select value from public.platform_settings where key = 'assistant'), '{}'::jsonb);
$$;

create or replace function public.hq_assistant_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return public._ai_settings() || jsonb_build_object(
    'spent_usd', round(public._ai_spent_this_month(), 4),
    'questions_this_month', (select count(*) from public.platform_ai_usage
                              where (at at time zone 'America/Jamaica') >= date_trunc('month', now() at time zone 'America/Jamaica')));
end;
$$;

create or replace function public.hq_assistant_save(p_on boolean, p_cap_usd numeric, p_model text, p_price_in numeric, p_price_out numeric, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_model text := lower(trim(coalesce(p_model, '')));
begin
  perform public.platform_check('assistant.settings', null,
    jsonb_build_object('reason', p_reason, 'on', p_on, 'cap_usd', p_cap_usd, 'model', v_model, 'price_in', p_price_in, 'price_out', p_price_out), true);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason.'; end if;
  if p_cap_usd is null or p_cap_usd < 0 or p_cap_usd > 500 then raise exception 'Monthly limit: US$0 to US$500.'; end if;
  if v_model !~ '^claude-[a-z0-9.-]{3,60}$' then raise exception 'The model name should look like claude-sonnet-5-5.'; end if;
  if p_price_in is null or p_price_in <= 0 or p_price_in > 200 or p_price_out is null or p_price_out <= 0 or p_price_out > 500 then
    raise exception 'Prices are US$ per million tokens (for example 2 and 10). Copy them from Anthropic''s price page.';
  end if;
  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('assistant', jsonb_build_object('on', coalesce(p_on, false), 'cap_usd', p_cap_usd, 'model', v_model,
                                          'price_in', p_price_in, 'price_out', p_price_out), auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Called by the server with the admin's own login (so every HQ check applies).
create or replace function public.hq_assistant_begin()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := public.platform_require(false);
  s       jsonb := public._ai_settings();
  v_spent numeric := public._ai_spent_this_month();
  v_worst numeric;
begin
  if not coalesce((s ->> 'on')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'Ask HQ is switched off. The owner-admin can switch it on in Settings.');
  end if;
  -- Worst case for one question: about 30,000 tokens in and 1,500 out.
  v_worst := (30000 * (s ->> 'price_in')::numeric + 1500 * (s ->> 'price_out')::numeric) / 1000000;
  if v_spent + v_worst > (s ->> 'cap_usd')::numeric then
    return jsonb_build_object('ok', false, 'reason',
      'This month''s Ask HQ limit is reached (US$' || to_char(v_spent, 'FM990.00') || ' of US$' || to_char((s ->> 'cap_usd')::numeric, 'FM990.00')
      || '). The owner-admin can raise it in Settings.');
  end if;
  if (select count(*) from public.platform_ai_usage where at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'That''s 60 questions this hour. Try again a little later.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'admin_id', v_uid,
    'model', s ->> 'model',
    'spent_usd', round(v_spent, 4),
    'cap_usd', (s ->> 'cap_usd')::numeric,
    'snapshot', jsonb_build_object(
      'now_jamaica', to_char(now() at time zone 'America/Jamaica', 'Dy DD Mon YYYY HH12:MI am'),
      'overview', public.hq_overview(),
      'health', public.hq_health(),
      'open_errors', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'message', e ->> 'message', 'screen', e ->> 'screen', 'total', e -> 'total', 'last_24h', e -> 'last_24h',
                 'users', e -> 'users', 'last_seen', e ->> 'last_seen', 'version', e ->> 'version',
                 'came_back_after_fix', e -> 'reopened_count', 'stack', left(e ->> 'stack', 1500)))
          from (select e from jsonb_array_elements(public.hq_errors()) e where e ->> 'status' = 'open' limit 10) x), '[]'::jsonb),
      'settings', jsonb_build_object(
        'banner', (select value from public.platform_settings where key = 'banner'),
        'maintenance', (select value from public.platform_settings where key = 'maintenance'),
        'signups_open', (select value from public.platform_settings where key = 'signups_open'),
        'features', (select value from public.platform_settings where key = 'features')),
      'feature_keys', to_jsonb(public._all_features())));
end;
$$;

-- Server only (service key). Cost worked out from the saved prices.
create or replace function public.hq_assistant_record(p_admin uuid, p_model text, p_in int, p_out int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s      jsonb := public._ai_settings();
  v_cost numeric := (greatest(coalesce(p_in, 0), 0) * (s ->> 'price_in')::numeric
                   + greatest(coalesce(p_out, 0), 0) * (s ->> 'price_out')::numeric) / 1000000;
begin
  insert into public.platform_ai_usage (admin_id, model, tokens_in, tokens_out, cost_usd)
  values (p_admin, left(coalesce(p_model, '?'), 80), greatest(coalesce(p_in, 0), 0), greatest(coalesce(p_out, 0), 0), v_cost);
  return jsonb_build_object('cost_usd', round(v_cost, 5), 'spent_usd', round(public._ai_spent_this_month(), 4),
                            'cap_usd', (s ->> 'cap_usd')::numeric);
end;
$$;

-- Ask HQ log rows older than 13 months are not needed.
delete from public.platform_ai_usage where at < now() - interval '13 months';

revoke all on function public._ai_spent_this_month() from public, anon, authenticated;
revoke all on function public._ai_settings() from public, anon, authenticated;
revoke all on function public.hq_assistant_record(uuid, text, int, int) from public, anon, authenticated;
revoke all on function public.hq_assistant_status() from public, anon;
revoke all on function public.hq_assistant_save(boolean, numeric, text, numeric, numeric, text) from public, anon;
revoke all on function public.hq_assistant_begin() from public, anon;
grant execute on function public.hq_assistant_status() to authenticated;
grant execute on function public.hq_assistant_save(boolean, numeric, text, numeric, numeric, text) to authenticated;
grant execute on function public.hq_assistant_begin() to authenticated;
do $$ begin
  execute 'grant execute on function public.hq_assistant_record(uuid, text, int, int) to service_role';
exception when undefined_object then null;
end $$;
