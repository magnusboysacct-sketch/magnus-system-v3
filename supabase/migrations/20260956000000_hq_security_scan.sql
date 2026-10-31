-- =====================================================================
-- Magnus HQ - Step 2a: built-in security scan
-- Magnus Boy's System
--
-- hq_security_scan() lists, for the public schema:
--   * tables with RLS OFF                                      -> problem (red)
--   * tables with RLS on but NO policies                       -> warn (gold), or ok if locked on purpose
--   * policies that are just "true"                            -> problem if they allow writes or anon, else warn / ok
--   * SECURITY DEFINER functions without a fixed search_path   -> warn
--
-- "OK on purpose" items are recorded in platform_security_notes with the reason, so HQ shows them
-- greyed out instead of nagging. Add a row there only after checking the table really is meant that way.
--
-- Safe to run twice.
-- =====================================================================

create table if not exists public.platform_security_notes (
  kind    text not null check (kind in ('no_policies', 'true_policy')),
  object  text not null,
  note    text not null,
  primary key (kind, object)
);

alter table public.platform_security_notes enable row level security;
revoke all on public.platform_security_notes from anon, authenticated;

insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'platform_admins',               'Magnus HQ: only through HQ functions.'),
  ('no_policies', 'platform_audit',                'Magnus HQ: only through HQ functions.'),
  ('no_policies', 'platform_settings',             'Magnus HQ: read through get_platform_settings().'),
  ('no_policies', 'platform_security_notes',       'Magnus HQ: read by the security scan only.'),
  ('no_policies', 'ai_usage_log',                  'Written by the magnus-ai edge function (service key).'),
  ('no_policies', 'client_contact_portal_access',  'Field-officer portal logins: server functions only.'),
  ('no_policies', 'client_portal_sessions',        'Client portal sessions: server functions only.'),
  ('no_policies', 'worker_number_counters',        'Worker number counter: server functions only.'),
  ('no_policies', 'worker_portal_access',          'Worker portal PINs: server functions only.'),
  ('no_policies', 'worker_portal_login_attempts',  'Worker portal lock-out log: server functions only.'),
  ('no_policies', 'worker_portal_sessions',        'Worker portal sessions: server functions only.'),
  ('no_policies', 'storage_migration_log',         'Log of the private-files move: edge function only.'),
  ('no_policies', '_vendor_payment_staging',       'Old import staging table, not used by the app.'),
  ('no_policies', 'client_reviews',                'Not used by the app yet. Locked until a feature needs it.'),
  ('no_policies', 'estimate_factors',              'Not used by the app yet. Locked until a feature needs it.'),
  ('no_policies', 'migration_conflicts',           'Old migration bookkeeping, not used by the app.'),
  ('true_policy', 'master_categories',             'Shared category list for every company (read only).'),
  ('true_policy', 'master_units',                  'Shared units list for every company (read only).'),
  ('true_policy', 'rate_update_batches',           'Rate import titles; left readable on purpose in 20260944 (read only).')
on conflict (kind, object) do update set note = excluded.note;

-- Internal: the raw scan. Not callable by anyone in the app; HQ calls hq_security_scan(),
-- and the public health check (Step 6) will only get the counts.
create or replace function public._security_scan_rows()
returns table (level text, kind text, object text, detail text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 1. RLS off
  select 'problem', 'rls_off', c.relname::text,
         'Row Level Security is OFF: any signed-in user (and maybe visitors) can read or change every row.'
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity

  union all
  -- 2. RLS on but no policies
  select case when sn.note is not null then 'ok' else 'warn' end,
         'no_policies', c.relname::text,
         coalesce(sn.note, 'RLS is on but there are no policies: the app can''t read or write it directly. Fine only if server functions handle it.')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join public.platform_security_notes sn on sn.kind = 'no_policies' and sn.object = c.relname
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)

  union all
  -- 3. "true" policies
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
     and (regexp_replace(coalesce(p.qual, ''), '[()\s]', '', 'g') = 'true'
       or regexp_replace(coalesce(p.with_check, ''), '[()\s]', '', 'g') = 'true')

  union all
  -- 4. SECURITY DEFINER functions without a fixed search_path
  select 'warn', 'definer_search_path',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'Runs with owner rights but has no fixed search_path.'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%');
$$;

-- HQ: the scan, worst first.
create or replace function public.hq_security_scan()
returns table (level text, kind text, object text, detail text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return query
    select s.level, s.kind, s.object, s.detail
      from public._security_scan_rows() s
     order by case s.level when 'problem' then 0 when 'warn' then 1 else 2 end, s.kind, s.object;
end;
$$;

revoke all on function public._security_scan_rows() from public, anon, authenticated;
revoke all on function public.hq_security_scan()    from public, anon;
grant execute on function public.hq_security_scan() to authenticated;
