-- =====================================================================
-- Magnus HQ - read-only that can't be bypassed
-- Magnus Boy's System
--
-- Until now a PAUSED or UNPAID (billing_locked) company was read-only on every normal screen (RLS guard policies
-- from 20260958), but a few server functions (security definer, which skip RLS) only refused CLOSED companies.
-- This adds a BEFORE INSERT / UPDATE / DELETE trigger on every company table. When the row's company is paused,
-- closed or billing_locked, the change is refused - whichever way it comes in - except for:
--   * Magnus itself: the nightly job (pg_cron), the sign-up service and anything else with no app login,
--     and server code using the service key;
--   * platform admins (HQ actions, e.g. deleting a closed company).
-- Left out on purpose (they must keep working while a company is read-only): notifications, feedback,
-- support access, sign-in / portal sessions and activity, share-link views, AI usage counting, user profiles
-- (already covered by the RLS guard for direct changes), and shared help articles.
--
--   * _hq_write_guard()                  - the trigger
--   * hq_apply_company_write_guards()    - (re)adds it to every company table; run again after adding a new one
-- Safe to run twice.
-- =====================================================================

create or replace function public._hq_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new    uuid;
  v_old    uuid;
  v_claims text;
  v_role   text;
begin
  if tg_op <> 'DELETE' then v_new := new.company_id; end if;
  if tg_op <> 'INSERT' then v_old := old.company_id; end if;

  -- Fast path: the company is active and paid.
  if exists (select 1 from public.companies c
              where c.id in (v_new, v_old)
                and (c.account_status in ('paused', 'closed') or coalesce(c.billing_locked, false))) then
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null then
      begin v_role := v_claims::jsonb ->> 'role'; exception when others then v_role := null; end;
    end if;

    if not (
         (v_claims is null and session_user <> 'authenticator')                     -- nightly job, sign-up service, SQL Editor
      or v_role = 'service_role'                                                     -- Magnus server code
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())  -- HQ
    ) then
      raise exception 'This company account is read-only right now (paused or bill unpaid). Open My plan, or contact Magnus support.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public._hq_write_guard() from public, anon, authenticated;

create or replace function public._hq_write_guard_skip()
returns text[]
language sql
immutable
as $$
  select array['notifications', 'feedback', 'support_grants', 'support_access_log', 'help_articles', 'user_profiles',
               'ai_usage_log', 'client_portal_activity', 'portal_sessions', 'worker_portal_sessions', 'worker_portal_access',
               'photo_share_links', 'receipt_share_links', 'leads']::text[];
$$;

create or replace function public.hq_apply_company_write_guards()
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  t text;
  n int := 0;
begin
  for t in
    select c.relname::text
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p')
       and a.atttypid = 'uuid'::regtype
       and c.relname not like 'platform\_%'
       and c.relname <> all (public._hq_write_guard_skip())
     order by 1
  loop
    execute format('drop trigger if exists hq_write_guard on public.%I', t);
    execute format('create trigger hq_write_guard before insert or update or delete on public.%I for each row execute function public._hq_write_guard()', t);
    n := n + 1;
  end loop;

  -- A table that was guarded before but is now on the skip list loses the trigger.
  for t in select unnest(public._hq_write_guard_skip()) loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('drop trigger if exists hq_write_guard on public.%I', t);
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.hq_apply_company_write_guards() from public, anon, authenticated;

do $$
declare n int;
begin
  n := public.hq_apply_company_write_guards();
  raise notice 'Read-only guard added to % company table(s)', n;
end;
$$;

-- How many tables have it (the SQL Editor shows this number after Run).
select count(*) as tables_with_write_guard
  from pg_trigger where tgname = 'hq_write_guard' and not tgisinternal;
