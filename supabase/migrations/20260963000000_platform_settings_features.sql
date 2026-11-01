-- =====================================================================
-- Magnus HQ - Step 8a: Settings - banner, maintenance mode, sign-ups, feature switches, activity log
-- Magnus Boy's System
--
--   * platform_settings 'banner'       {id, kind: news | heads_up | urgent, text, link, on}  - shown on every screen,
--                                       each person can dismiss it once (a new message shows again)
--   * platform_settings 'maintenance'  {on, message} - only platform admins get in while it's on
--   * platform_settings 'signups_open' - false = new people can't create companies. Invited people still can.
--                                       Enforced in the database (a trigger on new sign-in accounts).
--   * platform_settings 'features'     {ocr, client_portal, worker_portal, payroll, public_receipts, ai}: platform switches.
--                                       Switching off hides the feature; its data is always kept.
--   * companies.features_off           - a company switch can only turn things OFF, never on beyond its plan.
--   * _effective_features(), my_features() - what is on for one company:
--                                       platform ON  and  (charging off  or  the plan includes it  or  plan = free)
--                                       and  not switched off for the company.
--   * hq_setting_save(), hq_company_features(), hq_activity()
--
-- Safe to run twice.
-- =====================================================================

update public.platform_settings
   set value = '{"ocr": true, "client_portal": true, "worker_portal": true, "payroll": true, "public_receipts": true, "ai": true}'::jsonb || value
 where key = 'features';

alter table public.companies add column if not exists features_off text[] not null default '{}';

-- ---------------------------------------------------------------------
-- Feature switches
-- ---------------------------------------------------------------------
create or replace function public._all_features()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$ select array['ocr', 'client_portal', 'worker_portal', 'payroll', 'public_receipts', 'ai'] $$;

create or replace function public._effective_features(p_company uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_platform jsonb := coalesce((select value from public.platform_settings where key = 'features'), '{}'::jsonb);
  v_charging boolean := coalesce((public._billing_settings() ->> 'charging_on')::boolean, false);
  v_plan     text;
  v_plan_f   text[];
  v_off      text[] := '{}';
  v_out      jsonb := '{}'::jsonb;
  f          text;
begin
  if p_company is not null then
    select coalesce(c.features_off, '{}'), nullif(cs.subscription_plan, '')
      into v_off, v_plan
      from public.companies c left join public.company_settings cs on cs.company_id = c.id
     where c.id = p_company;
    v_plan := coalesce(v_plan, public._billing_settings() ->> 'default_plan', 'starter');
    select p.features into v_plan_f from public.platform_prices p where p.key = 'plan.' || v_plan;
  end if;

  foreach f in array public._all_features() loop
    v_out := v_out || jsonb_build_object(f,
      coalesce((v_platform ->> f)::boolean, true)
      and (p_company is null or not v_charging or v_plan = 'free' or v_plan_f is null or f = any (v_plan_f))
      and not (f = any (coalesce(v_off, '{}'))));
  end loop;
  return v_out;
end;
$$;

revoke all on function public._effective_features(uuid) from public, anon, authenticated;

-- Signed in: your company's switches. Signed out (portals, receipts): the platform switches.
create or replace function public.my_features()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public._effective_features((select up.company_id from public.user_profiles up where up.id = auth.uid()));
$$;

revoke all on function public.my_features() from public;
grant execute on function public.my_features() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Sign-ups closed: refuse new accounts, except people with a pending invitation
-- ---------------------------------------------------------------------
create or replace function public._hq_signup_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce((select (value)::text from public.platform_settings where key = 'signups_open'), 'true') = 'false'
     and not exists (select 1 from public.company_invitations i
                      where lower(i.email) = lower(new.email) and i.status = 'pending'
                        and (i.expires_at is null or i.expires_at > now())) then
    raise exception 'New sign-ups are closed right now.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hq_signup_gate on auth.users;
create trigger trg_hq_signup_gate before insert on auth.users
  for each row execute function public._hq_signup_gate();

-- ---------------------------------------------------------------------
-- HQ: save a setting (banner, maintenance, sign-ups, features)
-- ---------------------------------------------------------------------
create or replace function public.hq_setting_save(p_key text, p_value jsonb, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := p_value;
  k text;
begin
  perform public.platform_check('setting.' || coalesce(p_key, '?'), p_key, jsonb_build_object('reason', p_reason, 'value', p_value), false);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason.'; end if;

  if p_key = 'banner' then
    if v is not null and v <> 'null'::jsonb then
      if coalesce(v ->> 'kind', '') not in ('news', 'heads_up', 'urgent') then raise exception 'Choose News, Heads up or Urgent.'; end if;
      if length(trim(coalesce(v ->> 'text', ''))) not between 3 and 300 then raise exception 'Write the message (up to 300 characters).'; end if;
      if coalesce(v ->> 'link', '') <> '' and (v ->> 'link') !~ '^(https://|/)' then raise exception 'The link must start with https:// or /'; end if;
      v := jsonb_build_object('id', gen_random_uuid(), 'kind', v ->> 'kind', 'text', trim(v ->> 'text'),
                              'link', nullif(trim(coalesce(v ->> 'link', '')), ''), 'on', coalesce((v ->> 'on')::boolean, true),
                              'at', now());
    else
      v := 'null'::jsonb;
    end if;
  elsif p_key = 'maintenance' then
    v := jsonb_build_object('on', coalesce((v ->> 'on')::boolean, false), 'message', left(trim(coalesce(v ->> 'message', '')), 400),
                            'since', case when coalesce((v ->> 'on')::boolean, false) then now() end);
  elsif p_key = 'signups_open' then
    if jsonb_typeof(v) <> 'boolean' then raise exception 'Sign-ups must be on or off.'; end if;
  elsif p_key = 'features' then
    for k in select jsonb_object_keys(v) loop
      if not (k = any (public._all_features())) or jsonb_typeof(v -> k) <> 'boolean' then raise exception 'Unknown feature: %', k; end if;
    end loop;
    v := coalesce((select value from public.platform_settings where key = 'features'), '{}'::jsonb) || v;
  elsif p_key = 'support_contact' then
    v := jsonb_build_object('whatsapp', left(trim(coalesce(v ->> 'whatsapp', '')), 30), 'email', left(trim(coalesce(v ->> 'email', '')), 120));
  else
    raise exception 'This setting can''t be changed here.';
  end if;

  insert into public.platform_settings (key, value, updated_by, updated_at) values (p_key, v, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- A company's own switches: OFF only.
create or replace function public.hq_company_features(p_company uuid, p_off text[], p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_check('company.features', p_company::text, jsonb_build_object('reason', p_reason, 'off', p_off), false);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason.'; end if;
  if exists (select 1 from unnest(coalesce(p_off, '{}')) f where not (f = any (public._all_features()))) then
    raise exception 'Unknown feature.';
  end if;
  update public.companies set features_off = coalesce(p_off, '{}') where id = p_company and not is_system;
  if not found then raise exception 'Company not found.'; end if;
end;
$$;

-- HQ activity log, newest first, with simple filters.
create or replace function public.hq_activity(p_action text default null, p_admin text default null, p_search text default null, p_limit int default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'at', a.at, 'admin', coalesce(a.admin_email, 'system'), 'action', a.action,
                       'target', a.target, 'target_name', c.name, 'details', a.details) order by a.at desc)
      from (select * from public.platform_audit a
             where (p_action is null or p_action = '' or a.action like p_action || '%')
               and (p_admin is null or p_admin = '' or coalesce(a.admin_email, 'system') ilike '%' || p_admin || '%')
               and (p_search is null or p_search = '' or a.details::text ilike '%' || p_search || '%' or coalesce(a.target, '') ilike '%' || p_search || '%')
             order by a.at desc
             limit greatest(1, least(coalesce(p_limit, 200), 1000))) a
      left join public.companies c on c.id::text = a.target), '[]'::jsonb);
end;
$$;

revoke all on function public.hq_setting_save(text, jsonb, text) from public, anon;
revoke all on function public.hq_company_features(uuid, text[], text) from public, anon;
revoke all on function public.hq_activity(text, text, text, int) from public, anon;
grant execute on function public.hq_setting_save(text, jsonb, text) to authenticated;
grant execute on function public.hq_company_features(uuid, text[], text) to authenticated;
grant execute on function public.hq_activity(text, text, text, int) to authenticated;

-- HQ companies list: include each company's own switches.
create or replace function public.hq_company_features_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return coalesce((select jsonb_object_agg(c.id, jsonb_build_object('off', c.features_off, 'effective', public._effective_features(c.id)))
                     from public.companies c where not c.is_system), '{}'::jsonb);
end;
$$;

revoke all on function public.hq_company_features_list() from public, anon;
grant execute on function public.hq_company_features_list() to authenticated;
