-- =====================================================================
-- Magnus HQ - Step 4: Companies tab (the tenants)
-- Magnus Boy's System
--
--   * companies.account_status   - active / paused (read-only) / closed (no access, wiped after 90 days)
--   * companies.is_test          - only test companies can be deleted straight away
--   * Company guard               - RESTRICTIVE policies on every company table:
--                                   paused  = can read, can't write;  closed = can't read or write.
--                                   hq_apply_company_guards() adds them; the security scan flags any table missing them.
--   * my_company_status()        - lets the app show the paused banner / closed screen
--   * hq_list_companies()        - per-company COUNTS and dates only (never documents, payroll or clients)
--   * hq_company_action()        - extend trial, change plan, pause, unpause, close, reopen, mark as test
--   * hq_company_delete_now()    - test companies only
--   * hq_company_export()        - the company's data as JSON for its owner (secrets and logins left out)
--   * hq_overview()              - updated: paused / closed counts, past-due lines open the Companies tab
--
-- Every action needs a written reason and is written to platform_audit.
-- Platform tables (platform_*) are never touched by delete or export.
-- Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Company status columns
-- ---------------------------------------------------------------------
alter table public.companies add column if not exists account_status     text not null default 'active';
alter table public.companies add column if not exists status_reason      text;
alter table public.companies add column if not exists status_changed_at  timestamptz;
alter table public.companies add column if not exists closed_at          timestamptz;
alter table public.companies add column if not exists purge_after        timestamptz;
alter table public.companies add column if not exists is_test            boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_account_status_check') then
    alter table public.companies
      add constraint companies_account_status_check check (account_status in ('active', 'paused', 'closed'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. The guard
-- ---------------------------------------------------------------------
-- Companies that may not be written to (paused + closed) or read (closed). Returned as one array so a policy
-- evaluates it ONCE per query (as an InitPlan), not once per row.
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
      or (p_write and c.account_status = 'paused');
$$;

revoke all on function public._hq_blocked_companies(boolean) from public, anon;
grant execute on function public._hq_blocked_companies(boolean) to authenticated;

-- Company tables = public tables with a company_id column and at least one normal (permissive) policy.
-- Platform tables and tables that are only reached through server functions are left alone.
create or replace function public._hq_company_tables()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.relname not like 'platform\_%'
     and exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.tablename = c.relname
                    and p.permissive = 'PERMISSIVE'
                    and p.policyname not like 'hq\_guard\_%')
   order by 1;
$$;

revoke all on function public._hq_company_tables() from public, anon, authenticated;

create or replace function public.hq_apply_company_guards()
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  t   text;
  n   int := 0;
  rd  text := '(company_id is null or company_id <> all (coalesce((select public._hq_blocked_companies(false)), ''{}''::uuid[])))';
  wr  text := '(company_id is null or company_id <> all (coalesce((select public._hq_blocked_companies(true)), ''{}''::uuid[])))';
begin
  for t in select * from public._hq_company_tables() loop
    execute format('drop policy if exists hq_guard_read   on public.%I', t);
    execute format('drop policy if exists hq_guard_insert on public.%I', t);
    execute format('drop policy if exists hq_guard_update on public.%I', t);
    execute format('drop policy if exists hq_guard_delete on public.%I', t);
    execute format('create policy hq_guard_read   on public.%I as restrictive for select to authenticated using (%s)', t, rd);
    execute format('create policy hq_guard_insert on public.%I as restrictive for insert to authenticated with check (%s)', t, wr);
    execute format('create policy hq_guard_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)', t, wr, wr);
    execute format('create policy hq_guard_delete on public.%I as restrictive for delete to authenticated using (%s)', t, wr);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.hq_apply_company_guards() from public, anon, authenticated;

do $$
declare n int;
begin
  n := public.hq_apply_company_guards();
  raise notice 'Company guard added to % table(s)', n;
end;
$$;

-- The app asks this to show the paused banner / closed screen.
create or replace function public.my_company_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object('status', c.account_status, 'reason', c.status_reason, 'purge_after', c.purge_after)
       from public.user_profiles up
       join public.companies c on c.id = up.company_id
      where up.id = auth.uid()),
    jsonb_build_object('status', 'active'));
$$;

revoke all on function public.my_company_status() from public, anon;
grant execute on function public.my_company_status() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Security scan: also flag company tables without the guard
-- ---------------------------------------------------------------------
create or replace function public._security_scan_rows()
returns table (level text, kind text, object text, detail text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'problem', 'rls_off', c.relname::text,
         'Row Level Security is OFF: any signed-in user (and maybe visitors) can read or change every row.'
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity

  union all
  select case when sn.note is not null then 'ok' else 'warn' end,
         'no_policies', c.relname::text,
         coalesce(sn.note, 'RLS is on but there are no policies: the app can''t read or write it directly. Fine only if server functions handle it.')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join public.platform_security_notes sn on sn.kind = 'no_policies' and sn.object = c.relname
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)

  union all
  select case
           when p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
             or p.roles && array['anon', 'public']::name[] then 'problem'
           when sn.note is not null then 'ok'
           else 'warn'
         end,
         'true_policy', p.tablename::text,
         p.policyname || ' (' || p.cmd || ' for ' || array_to_string(p.roles, ', ') || ')'
           || coalesce(': ' || sn.note, ': lets every company see every row.')
    from pg_policies p
    left join public.platform_security_notes sn on sn.kind = 'true_policy' and sn.object = p.tablename
   where p.schemaname = 'public'
     and p.permissive = 'PERMISSIVE'
     and (regexp_replace(coalesce(p.qual, ''), '[()\s]', '', 'g') = 'true'
       or regexp_replace(coalesce(p.with_check, ''), '[()\s]', '', 'g') = 'true')

  union all
  select 'warn', 'definer_search_path',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'Runs with owner rights but has no fixed search_path.'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')

  union all
  select 'warn', 'no_company_guard', t,
         'Company table without the pause/close guard (probably new). Fix: select public.hq_apply_company_guards(); in the SQL Editor.'
    from public._hq_company_tables() t
   where not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t and p.policyname = 'hq_guard_insert');
$$;

revoke all on function public._security_scan_rows() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Per-company numbers
-- ---------------------------------------------------------------------
-- Count rows of one company in one table; null if that table or its company_id column doesn't exist.
create or replace function public._hq_company_count(p_table text, p_company uuid, p_extra text default null)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v bigint;
begin
  if to_regclass('public.' || quote_ident(p_table)) is null then return null; end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = ('public.' || quote_ident(p_table))::regclass
                    and attname = 'company_id' and not attisdropped) then
    return null;
  end if;
  execute format('select count(*) from public.%I where company_id = $1 %s',
                 p_table, coalesce('and (' || p_extra || ')', ''))
     into v using p_company;
  return v;
end;
$$;

revoke all on function public._hq_company_count(text, uuid, text) from public, anon, authenticated;

create or replace function public._hq_company_state(c public.companies, cs public.company_settings)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when c.account_status = 'closed' then 'closed'
    when c.account_status = 'paused' then 'paused'
    when cs.subscription_status = 'active'
         and (cs.subscription_expires_at is null or cs.subscription_expires_at > now()) then 'paid'
    when cs.trial_expires_at is null then 'no_plan'
    when cs.trial_expires_at > now() then 'trial'
    else 'past_due'
  end;
$$;

revoke all on function public._hq_company_state(public.companies, public.company_settings) from public, anon, authenticated;

create or replace function public.hq_list_companies()
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

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into v
  from (
    select
      c.id,
      c.name,
      c.created_at,
      c.account_status,
      c.status_reason,
      c.closed_at,
      c.purge_after,
      c.is_test,
      public._hq_company_state(c, cs)                         as state,
      cs.subscription_plan                                     as plan,
      cs.trial_expires_at,
      cs.subscription_expires_at,
      (select u.email from public.user_profiles up join auth.users u on u.id = up.id
        where up.company_id = c.id
        order by (up.role = 'director') desc, up.created_at
        limit 1)                                               as owner_email,
      (select count(*) from public.user_profiles up where up.company_id = c.id)                    as users,
      public._hq_company_count('workers', c.id, 'status = ''active''')                              as workers,
      public._hq_company_count('projects', c.id)                                                    as projects,
      public._hq_company_count('clients', c.id)                                                     as clients,
      coalesce(public._hq_company_count('payroll_periods', c.id), 0)
        + coalesce(public._hq_company_count('staff_payroll_runs', c.id), 0)                         as payroll_runs,
      public._hq_company_count('client_invoices', c.id)                                             as invoices,
      public._hq_company_count('purchase_orders', c.id)                                             as purchase_orders,
      coalesce(public._hq_company_count('field_payment_receipts', c.id), 0)
        + coalesce(public._hq_company_count('receipt_archive', c.id), 0)                            as receipts,
      (select count(*) from storage.objects o where split_part(o.name, '/', 1) = c.id::text)         as files,
      (select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
         from storage.objects o where split_part(o.name, '/', 1) = c.id::text)                      as storage_bytes,
      greatest(
        (select max(a.day)::timestamptz from public.platform_activity_days a where a.company_id = c.id),
        (select max(u.last_sign_in_at) from public.user_profiles up join auth.users u on u.id = up.id
          where up.company_id = c.id)
      )                                                                                             as last_activity
    from public.companies c
    left join public.company_settings cs on cs.company_id = c.id
    where not c.is_system
  ) x;

  return v;
end;
$$;

revoke all on function public.hq_list_companies() from public, anon;
grant execute on function public.hq_list_companies() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Actions
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
    if v_plan is not null and v_plan not in ('starter', 'pro', 'enterprise') then
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

revoke all on function public.hq_company_action(uuid, text, text, jsonb) from public, anon;
grant execute on function public.hq_company_action(uuid, text, text, jsonb) to authenticated;

-- Remove every row of one company. Several passes, so child rows go before parents.
-- Anything that still won't delete stops the whole thing (nothing is removed). Platform tables are never touched.
create or replace function public._hq_purge_company(p_company uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_left    text[];
  v_next    text[];
  v_t       text;
  v_pass    int := 0;
  v_rows    bigint;
  v_total   bigint := 0;
  v_users   uuid[];
  v_files   bigint;
begin
  select coalesce(array_agg(up.id), '{}') into v_users
    from public.user_profiles up
   where up.company_id = p_company
     and not exists (select 1 from public.platform_admins pa where pa.user_id = up.id);

  select coalesce(array_agg(c.relname::text), '{}') into v_left
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname not like 'platform\_%';

  while array_length(v_left, 1) > 0 and v_pass < 12 loop
    v_pass := v_pass + 1;
    v_next := '{}';
    foreach v_t in array v_left loop
      begin
        execute format('delete from public.%I where company_id = $1', v_t) using p_company;
        get diagnostics v_rows = row_count;
        v_total := v_total + v_rows;
      exception when foreign_key_violation then
        v_next := v_next || v_t;
      end;
    end loop;
    exit when v_next = v_left;   -- no progress
    v_left := v_next;
  end loop;

  if array_length(v_left, 1) > 0 then
    raise exception 'Could not delete: rows in % are still in use by other tables. Nothing was deleted.',
      array_to_string(v_left, ', ');
  end if;

  delete from public.companies where id = p_company;

  -- Their logins go too (never a platform admin's).
  delete from auth.users u
   where u.id = any (v_users)
     and not exists (select 1 from public.user_profiles up where up.id = u.id);

  select count(*) into v_files from storage.objects o where split_part(o.name, '/', 1) = p_company::text;

  return jsonb_build_object('rows_deleted', v_total, 'logins_deleted', coalesce(array_length(v_users, 1), 0),
                            'files_left', v_files);
end;
$$;

revoke all on function public._hq_purge_company(uuid) from public, anon, authenticated;

create or replace function public.hq_company_delete_now(p_company uuid, p_reason text, p_confirm_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_co public.companies;
begin
  perform public.platform_check('company.delete_now', p_company::text,
            jsonb_build_object('reason', p_reason), true);

  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason first.'; end if;

  select * into v_co from public.companies where id = p_company for update;
  if not found or v_co.is_system then raise exception 'Company not found.'; end if;
  if not v_co.is_test then raise exception 'Only companies marked as TEST can be deleted now. Close it instead.'; end if;
  if coalesce(p_confirm_name, '') <> v_co.name then raise exception 'The company name you typed doesn''t match.'; end if;

  -- The audit row keeps the name, because the company itself is about to go.
  update public.platform_audit
     set details = details || jsonb_build_object('company_name', v_co.name)
   where id = (select max(id) from public.platform_audit where action = 'company.delete_now' and target = p_company::text);

  return public._hq_purge_company(p_company);
end;
$$;

revoke all on function public.hq_company_delete_now(uuid, text, text) from public, anon;
grant execute on function public.hq_company_delete_now(uuid, text, text) to authenticated;

-- The daily job (Step 5) calls this: wipe companies closed more than 90 days ago.
create or replace function public.hq_purge_expired_companies()
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id, name from public.companies
            where account_status = 'closed' and purge_after is not null and purge_after <= now() and not is_system
  loop
    begin
      perform public._hq_purge_company(r.id);
      insert into public.platform_audit (admin_id, admin_email, action, target, details)
      values (null, 'daily job', 'company.purged', r.id::text, jsonb_build_object('company_name', r.name));
      n := n + 1;
    exception when others then
      insert into public.platform_audit (admin_id, admin_email, action, target, details)
      values (null, 'daily job', 'company.purge_failed', r.id::text,
              jsonb_build_object('company_name', r.name, 'error', sqlerrm));
    end;
  end loop;
  return n;
end;
$$;

revoke all on function public.hq_purge_expired_companies() from public, anon, authenticated;

-- Export: every company table, minus logins, sessions, PINs, passwords and tokens.
create or replace function public.hq_company_export(p_company uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_co     public.companies;
  v_t      text;
  v_rows   jsonb;
  v_out    jsonb := '{}'::jsonb;
  v_secret text := '(password|pin|token|secret|salt|session|otp)';
begin
  perform public.platform_check('company.export', p_company::text, jsonb_build_object('reason', p_reason), false);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason first.'; end if;

  select * into v_co from public.companies where id = p_company;
  if not found or v_co.is_system then raise exception 'Company not found.'; end if;

  for v_t in
    select c.relname::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and c.relname not like 'platform\_%'
       and c.relname !~ '(session|portal_access|login_attempt|token|share_link|verify_code|counter)'
     order by 1
  loop
    execute format(
      'select coalesce(jsonb_agg((select jsonb_object_agg(k, v) from jsonb_each(to_jsonb(t)) e(k, v) where k !~* %L)), ''[]''::jsonb)
         from public.%I t where company_id = $1', v_secret, v_t)
      into v_rows using p_company;
    if jsonb_array_length(v_rows) > 0 then
      v_out := v_out || jsonb_build_object(v_t, v_rows);
    end if;
  end loop;

  return jsonb_build_object(
    'export_of',   v_co.name,
    'company_id',  v_co.id,
    'exported_at', now(),
    'note',        'Magnus Boy''s System data export. Logins, sessions, PINs, passwords and share tokens are left out. Files (photos, PDFs) are not included.',
    'tables',      v_out);
end;
$$;

revoke all on function public.hq_company_export(uuid, text) from public, anon;
grant execute on function public.hq_company_export(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Overview: real paused / closed counts
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
