-- =====================================================================
-- Magnus HQ - Step 12: "Ask HQ" assistant
-- Magnus Boy's System
--
--   * platform_settings 'ai'  - on/off, monthly US$ cap, model, price per million tokens (in / out). Starts OFF.
--   * platform_ai_usage       - one row per question: who, when, tokens, cost. Never holds the answer or any key.
--   * hq_ai_status()          - on/off, cap, spent this month, last questions (HQ Settings + the chat).
--   * hq_ai_settings_save()   - owner only.
--   * hq_ai_begin()           - called by /api/hq-ask with YOUR login: refuses if not admin + 2-step, switched off,
--                               or over the monthly cap; returns the same numbers HQ shows (overview, health, open errors,
--                               settings). No company documents, payroll or clients are ever included.
--   * hq_ai_record()          - adds the cost of one answer.
--
-- The Anthropic key lives ONLY in the Vercel server variable ANTHROPIC_API_KEY. Never here.
-- The assistant can only SUGGEST actions; you tap Confirm and the normal HQ functions do the change (with a reason).
-- Safe to run twice.
-- =====================================================================

insert into public.platform_settings (key, value) values
  ('ai', '{"on": false, "monthly_cap_usd": 10, "model": "claude-sonnet-5-5", "price_in_per_mtok": 2, "price_out_per_mtok": 10}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.platform_ai_usage (
  id             bigint generated always as identity primary key,
  admin_id       uuid references auth.users(id) on delete set null,
  at             timestamptz not null default now(),
  model          text not null,
  input_tokens   int not null default 0 check (input_tokens >= 0),
  output_tokens  int not null default 0 check (output_tokens >= 0),
  cost_usd       numeric(12, 6) not null default 0,
  question       text
);

create index if not exists idx_platform_ai_usage_at on public.platform_ai_usage (at desc);

alter table public.platform_ai_usage enable row level security;
revoke all on public.platform_ai_usage from anon, authenticated;

insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'platform_ai_usage', 'Magnus HQ: Ask HQ cost log, reached through hq_ai_* functions only.')
on conflict (kind, object) do update set note = excluded.note;

-- The AI settings are internal: keep them out of the public settings read (same list as 20260965 plus 'ai').
create or replace function public.get_platform_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from public.platform_settings
   where key not in ('form_salt', 'push', 'limits', 'billing', 'ai');
$$;

create or replace function public._ai_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select '{"on": false, "monthly_cap_usd": 10, "model": "claude-sonnet-5-5", "price_in_per_mtok": 2, "price_out_per_mtok": 10}'::jsonb
         || coalesce((select value from public.platform_settings where key = 'ai'), '{}'::jsonb);
$$;

-- Spent this calendar month, Jamaica time.
create or replace function public._ai_spent_month()
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(cost_usd), 0)
    from public.platform_ai_usage
   where at >= (date_trunc('month', now() at time zone 'America/Jamaica') at time zone 'America/Jamaica');
$$;

create or replace function public.hq_ai_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s jsonb := public._ai_settings();
begin
  perform public.platform_require(false);
  return s || jsonb_build_object(
    'spent_month_usd', round(public._ai_spent_month(), 4),
    'questions_month', (select count(*) from public.platform_ai_usage
                         where at >= (date_trunc('month', now() at time zone 'America/Jamaica') at time zone 'America/Jamaica')),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('at', u.at, 'who', au.email, 'question', u.question,
                                                           'cost_usd', round(u.cost_usd, 4)) order by u.at desc)
                          from (select * from public.platform_ai_usage order by at desc limit 10) u
                          left join auth.users au on au.id = u.admin_id), '[]'::jsonb));
end;
$$;

create or replace function public.hq_ai_settings_save(p_value jsonb, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := coalesce(p_value, '{}'::jsonb);
  v_cap numeric; v_in numeric; v_out numeric; v_model text;
begin
  perform public.platform_check('setting.ai', 'ai', jsonb_build_object('reason', p_reason, 'value', p_value), true);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason.'; end if;
  begin
    v_cap := (v ->> 'monthly_cap_usd')::numeric;
    v_in  := (v ->> 'price_in_per_mtok')::numeric;
    v_out := (v ->> 'price_out_per_mtok')::numeric;
  exception when others then raise exception 'Type numbers for the cap and prices.';
  end;
  v_model := trim(coalesce(v ->> 'model', ''));
  if v_cap is null or v_cap < 0 or v_cap > 1000 then raise exception 'Monthly cap: 0 to 1,000 US$.'; end if;
  if v_in is null or v_in <= 0 or v_in > 200 or v_out is null or v_out <= 0 or v_out > 500 then
    raise exception 'Prices per million tokens look wrong. Copy them from Anthropic''s price page.';
  end if;
  if v_model !~ '^claude-[a-z0-9.-]{3,60}$' then raise exception 'The model name should look like claude-sonnet-5-5.'; end if;
  if public._looks_secret(v::text) then raise exception 'Never put a key here. The key goes only in Vercel (ANTHROPIC_API_KEY).'; end if;

  insert into public.platform_settings (key, value, updated_by, updated_at)
  values ('ai', jsonb_build_object('on', coalesce((v ->> 'on')::boolean, false), 'monthly_cap_usd', v_cap, 'model', v_model,
                                   'price_in_per_mtok', v_in, 'price_out_per_mtok', v_out), auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- Called by /api/hq-ask with the admin's own login, before the question goes to Anthropic.
create or replace function public.hq_ai_begin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s      jsonb := public._ai_settings();
  v_spent numeric := public._ai_spent_month();
begin
  perform public.platform_require(false);
  if not coalesce((s ->> 'on')::boolean, false) then
    raise exception 'Ask HQ is switched off. The owner can switch it on in Settings.';
  end if;
  if v_spent >= (s ->> 'monthly_cap_usd')::numeric then
    raise exception 'This month''s Ask HQ limit (US$%) is used up. The owner can raise it in Settings.', s ->> 'monthly_cap_usd';
  end if;

  return jsonb_build_object(
    'settings', s || jsonb_build_object('spent_month_usd', round(v_spent, 4)),
    'context', jsonb_build_object(
      'now_jamaica', to_char(now() at time zone 'America/Jamaica', 'YYYY-MM-DD HH24:MI'),
      'overview', public.hq_overview(),
      'health', public.hq_health(),
      'open_errors', coalesce((
        select jsonb_agg(jsonb_build_object('fingerprint', e.fingerprint, 'message', left(e.message, 300), 'screen', e.screen,
                                            'stack', left(coalesce(e.stack, ''), 1200), 'total', e.total, 'reopened', e.reopened_count,
                                            'version', e.version, 'last_seen', e.last_seen))
          from (select * from public.platform_app_errors where status = 'open' order by last_seen desc limit 12) e), '[]'::jsonb),
      'settings', jsonb_build_object(
        'banner', (select value from public.platform_settings where key = 'banner'),
        'maintenance', (select value from public.platform_settings where key = 'maintenance'),
        'signups_open', (select value from public.platform_settings where key = 'signups_open'),
        'features', jsonb_build_object('all', to_jsonb(public._all_features()),
                                       'platform_switches', (select value from public.platform_settings where key = 'features'),
                                       'meaning', 'true = on for everyone, false = off for everyone; a feature not listed is on'))));
end;
$$;

create or replace function public.hq_ai_record(p_model text, p_input_tokens int, p_output_tokens int, p_question text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s      jsonb := public._ai_settings();
  v_uid  uuid := public.platform_require(false);
  v_cost numeric;
begin
  v_cost := greatest(coalesce(p_input_tokens, 0), 0) / 1000000.0 * (s ->> 'price_in_per_mtok')::numeric
          + greatest(coalesce(p_output_tokens, 0), 0) / 1000000.0 * (s ->> 'price_out_per_mtok')::numeric;
  insert into public.platform_ai_usage (admin_id, model, input_tokens, output_tokens, cost_usd, question)
  values (v_uid, left(coalesce(p_model, '?'), 80), greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0),
          v_cost, left(coalesce(p_question, ''), 200));
  return jsonb_build_object('cost_usd', round(v_cost, 5), 'spent_month_usd', round(public._ai_spent_month(), 4),
                            'cap_usd', (s ->> 'monthly_cap_usd')::numeric);
end;
$$;

revoke all on function public._ai_settings() from public, anon, authenticated;
revoke all on function public._ai_spent_month() from public, anon, authenticated;
revoke all on function public.hq_ai_status() from public, anon;
revoke all on function public.hq_ai_settings_save(jsonb, text) from public, anon;
revoke all on function public.hq_ai_begin() from public, anon;
revoke all on function public.hq_ai_record(text, int, int, text) from public, anon;
grant execute on function public.hq_ai_status() to authenticated;
grant execute on function public.hq_ai_settings_save(jsonb, text) to authenticated;
grant execute on function public.hq_ai_begin() to authenticated;
grant execute on function public.hq_ai_record(text, int, int, text) to authenticated;
