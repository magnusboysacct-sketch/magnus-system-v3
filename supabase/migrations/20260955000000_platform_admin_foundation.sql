-- =====================================================================
-- Magnus HQ - Step 1: platform admin foundation
-- Magnus Boy's System
--
-- What this adds:
--   * companies.is_system      - marks template / HQ companies so they are never counted as tenants
--   * platform_admins          - who can open Magnus HQ (separate from company roles)
--   * platform_audit           - every HQ action: who, what, when
--   * platform_settings        - platform-wide safe settings (banner, maintenance, sign-ups, features...)
--   * is_platform_admin()      - true only for an admin whose session passed 2-step login (aal2)
--   * platform_require()       - internal: raise "not found" unless caller is an admin
--   * platform_check()         - internal: platform_require + write an audit row (used by every HQ action)
--   * hq_my_status()           - what the app needs to show / hide HQ (non-admins just get is_admin=false)
--   * hq_list_admins(), hq_add_admin(), hq_remove_admin()  - admin management (add/remove: owner only)
--   * get_platform_settings()  - public read of the safe settings
--   * hq_bootstrap_owner()     - SQL Editor only: make the first owner-admin
--
-- Platform tables have RLS ON and NO policies: nobody reads or writes them directly.
-- Everything goes through the SECURITY DEFINER functions below.
--
-- Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. System companies (templates + the HQ login's own company)
-- ---------------------------------------------------------------------
alter table public.companies
  add column if not exists is_system boolean not null default false;

-- The live companies table has a trigger (update_companies_updated_at) that sets NEW.updated_at,
-- but the column itself is missing, so ANY update to a company row fails today.
-- Adding the column fixes that trigger (and lets the updates below run).
alter table public.companies
  add column if not exists updated_at timestamptz not null default now();

comment on column public.companies.is_system is
  'True for template companies and the HQ login''s own company. Never counted or billed as a tenant.';

update public.companies
   set is_system = true
 where id in ('00000000-0000-4000-8000-00000000a110',   -- rate-library template
              '00000000-0000-4000-8000-00000000a111')   -- chart-of-accounts template
   and is_system = false;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  is_owner  boolean not null default false,
  added_by  uuid references auth.users(id) on delete set null,
  added_at  timestamptz not null default now()
);

-- Only one owner, ever.
create unique index if not exists uq_platform_admins_one_owner
  on public.platform_admins (is_owner) where is_owner;

create table if not exists public.platform_audit (
  id           bigint generated always as identity primary key,
  admin_id     uuid references auth.users(id) on delete set null,
  admin_email  text,
  action       text not null,
  target       text,
  details      jsonb not null default '{}'::jsonb,
  at           timestamptz not null default now()
);

create index if not exists idx_platform_audit_at on public.platform_audit (at desc);
create index if not exists idx_platform_audit_action on public.platform_audit (action, at desc);

create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null default 'null'::jsonb,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- RLS on, no policies, no direct grants.
alter table public.platform_admins   enable row level security;
alter table public.platform_audit    enable row level security;
alter table public.platform_settings enable row level security;

revoke all on public.platform_admins   from anon, authenticated;
revoke all on public.platform_audit    from anon, authenticated;
revoke all on public.platform_settings from anon, authenticated;

-- Default settings (only safe, public values belong in this table).
insert into public.platform_settings (key, value) values
  ('banner',          'null'::jsonb),
  ('maintenance',     '{"on": false, "message": ""}'::jsonb),
  ('signups_open',    'true'::jsonb),
  ('features',        '{}'::jsonb),
  ('support_contact', '{"whatsapp": "", "email": ""}'::jsonb),
  ('legal_versions',  '{"privacy": 0, "terms": 0}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Core checks
-- ---------------------------------------------------------------------

-- True only for a platform admin whose current session passed 2-step login.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Internal: raise unless the caller is a (2-step verified) admin. No audit row.
-- Used by read-only HQ functions so the audit log isn't flooded with page views.
create or replace function public.platform_require(p_owner_only boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_platform_admin() then
    -- Deliberately vague: never hint that HQ exists.
    raise exception 'not found' using errcode = 'P0002';
  end if;

  if p_owner_only and not exists (
       select 1 from public.platform_admins where user_id = v_uid and is_owner) then
    raise exception 'Only the owner-admin can do this.' using errcode = '42501';
  end if;

  return v_uid;
end;
$$;

-- Internal: check the caller AND write the audit row. Every HQ action calls this first.
-- If the action later fails, its audit row rolls back with it (only real actions are logged).
create or replace function public.platform_check(
  p_action     text,
  p_target     text  default null,
  p_details    jsonb default '{}'::jsonb,
  p_owner_only boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := public.platform_require(p_owner_only);
  v_email text;
begin
  select email into v_email from auth.users where id = v_uid;

  insert into public.platform_audit (admin_id, admin_email, action, target, details)
  values (v_uid, v_email, p_action, p_target, coalesce(p_details, '{}'::jsonb));

  return v_uid;
end;
$$;

-- What the app needs to decide whether to show HQ. Non-admins only ever see is_admin=false.
create or replace function public.hq_my_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner boolean;
begin
  select pa.is_owner into v_owner
    from public.platform_admins pa
   where pa.user_id = auth.uid();

  if not found then
    return jsonb_build_object('is_admin', false);
  end if;

  return jsonb_build_object(
    'is_admin', true,
    'is_owner', v_owner,
    'mfa_ok',   coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Admin management
-- ---------------------------------------------------------------------
create or replace function public.hq_list_admins()
returns table (
  user_id          uuid,
  email            text,
  is_owner         boolean,
  added_at         timestamptz,
  added_by_email   text,
  last_sign_in_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);

  return query
  select pa.user_id,
         u.email::text,
         pa.is_owner,
         pa.added_at,
         ab.email::text,
         u.last_sign_in_at
    from public.platform_admins pa
    join auth.users u       on u.id = pa.user_id
    left join auth.users ab on ab.id = pa.added_by
   order by pa.is_owner desc, pa.added_at;
end;
$$;

create or replace function public.hq_add_admin(p_email text, p_reason text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_target uuid;
  v_me     uuid;
begin
  v_me := public.platform_check('admin.add', v_email,
                                jsonb_build_object('reason', p_reason), true);

  if v_email = '' then
    raise exception 'Type the email they signed in with.';
  end if;

  select id into v_target from auth.users where lower(email) = v_email;
  if v_target is null then
    raise exception 'No account uses % yet. Ask them to sign in to Magnus once, then try again.', v_email;
  end if;

  insert into public.platform_admins (user_id, is_owner, added_by)
  values (v_target, false, v_me)
  on conflict (user_id) do nothing;

  return v_target;
end;
$$;

create or replace function public.hq_remove_admin(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid;
  v_owner boolean;
begin
  v_me := public.platform_check('admin.remove', p_user_id::text,
                                jsonb_build_object('reason', p_reason), true);

  if p_user_id = v_me then
    raise exception 'You can''t remove yourself.';
  end if;

  select is_owner into v_owner from public.platform_admins where user_id = p_user_id;
  if not found then
    raise exception 'That person is not an admin.';
  end if;
  if v_owner then
    raise exception 'The owner-admin can''t be removed.';
  end if;

  delete from public.platform_admins where user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Public settings read (banner, maintenance, sign-ups, features...)
-- ---------------------------------------------------------------------
create or replace function public.get_platform_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from public.platform_settings;
$$;

-- ---------------------------------------------------------------------
-- 6. First owner-admin (run by hand in the SQL Editor, once)
-- ---------------------------------------------------------------------
create or replace function public.hq_bootstrap_owner(p_email text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_email   text := lower(trim(coalesce(p_email, '')));
  v_uid     uuid;
  v_company uuid;
  v_members int;
  v_marked  boolean := false;
begin
  if exists (select 1 from public.platform_admins where is_owner) then
    return 'An owner-admin already exists. Nothing changed.';
  end if;

  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid is null then
    raise exception 'No account for % yet. Sign up / sign in with it once, then run this again.', v_email;
  end if;

  insert into public.platform_admins (user_id, is_owner, added_by)
  values (v_uid, true, v_uid)
  on conflict (user_id) do update set is_owner = true;

  -- Mark the HQ login's auto-made company as a system company,
  -- but ONLY if this login is its only member (never touches a real company).
  select company_id into v_company from public.user_profiles where id = v_uid;
  if v_company is not null then
    select count(*) into v_members from public.user_profiles where company_id = v_company;
    if v_members = 1 then
      update public.companies set is_system = true where id = v_company;
      v_marked := true;
    end if;
  end if;

  insert into public.platform_audit (admin_id, admin_email, action, target, details)
  values (v_uid, v_email, 'owner.bootstrap', v_email,
          jsonb_build_object('company_id', v_company, 'company_marked_system', v_marked));

  return 'Done: ' || v_email || ' is the owner-admin.'
         || case when v_marked then ' Its own company is marked as a system company.'
                 else ' (No company was marked as system.)' end;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Who may call what
-- ---------------------------------------------------------------------
revoke all on function public.platform_require(boolean)                    from public, anon, authenticated;
revoke all on function public.platform_check(text, text, jsonb, boolean)   from public, anon, authenticated;
revoke all on function public.hq_bootstrap_owner(text)                     from public, anon, authenticated;

revoke all on function public.is_platform_admin()            from public, anon;
revoke all on function public.hq_my_status()                 from public, anon;
revoke all on function public.hq_list_admins()               from public, anon;
revoke all on function public.hq_add_admin(text, text)       from public, anon;
revoke all on function public.hq_remove_admin(uuid, text)    from public, anon;

grant execute on function public.is_platform_admin()          to authenticated;
grant execute on function public.hq_my_status()               to authenticated;
grant execute on function public.hq_list_admins()             to authenticated;
grant execute on function public.hq_add_admin(text, text)     to authenticated;
grant execute on function public.hq_remove_admin(uuid, text)  to authenticated;

grant execute on function public.get_platform_settings()      to anon, authenticated;
