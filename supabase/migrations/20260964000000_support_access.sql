-- =====================================================================
-- Magnus HQ - Step 9: Support without spying
-- Magnus Boy's System
--
--   * support_grants        - a company director / admin lets Magnus support look at their company for 24 hours,
--                             with the reason written down. Ends by itself, or straight away with "End now".
--   * support_access_log    - every screen support opens (which table, which rows). The company sees all of it.
--   * my_support_grant(), my_support_end(), my_support_status()      - company side
--   * hq_support_grants(), hq_support_tables(), hq_support_read()    - HQ side: READ ONLY (these functions only select),
--                             only while a grant is active, platform admin with 2-step login, and every call is logged.
--   * Never shown to support, even with a grant: passwords, PINs, tokens, sessions, salts, bank account / routing numbers,
--     SSN and TRN columns, and login / session / share-link tables.
--   * There is no other way for HQ to see a company's records.
-- Safe to run twice.
-- =====================================================================

create table if not exists public.support_grants (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  granted_by  uuid references auth.users(id) on delete set null,
  reason      text not null,
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  ended_at    timestamptz,
  ended_by    uuid references auth.users(id) on delete set null
);
create index if not exists idx_support_grants_company on public.support_grants (company_id, granted_at desc);

create table if not exists public.support_access_log (
  id           bigint generated always as identity primary key,
  grant_id     uuid references public.support_grants(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  admin_id     uuid references auth.users(id) on delete set null,
  admin_email  text,
  what         text not null,
  at           timestamptz not null default now()
);
create index if not exists idx_support_access_log_company on public.support_access_log (company_id, at desc);

alter table public.support_grants enable row level security;
alter table public.support_access_log enable row level security;
revoke all on public.support_grants, public.support_access_log from anon, authenticated;
insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'support_grants',     'Support access: company side and HQ side go through functions only.'),
  ('no_policies', 'support_access_log', 'Support access log: company sees its own log through my_support_status().')
on conflict (kind, object) do update set note = excluded.note;

-- Columns and tables support never sees.
create or replace function public._support_secret_col(p text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select p ~* '(password|passwd|pin|token|secret|salt|session|otp|bank_account|routing|account_number|ssn|trn|tax_registration)' $$;

create or replace function public._support_hidden_table(p text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$ select p ~* '(session|portal_access|login_attempt|token|share_link|verify_code|counter|push_subscription|notification)' or p like 'platform\_%' or p like 'support\_%' $$;

-- The active grant for a company, or null.
create or replace function public._support_active_grant(p_company uuid)
returns public.support_grants
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.* from public.support_grants g
   where g.company_id = p_company and g.ended_at is null and g.expires_at > now()
   order by g.granted_at desc limit 1;
$$;

revoke all on function public._support_active_grant(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Company side (director / admin)
-- ---------------------------------------------------------------------
create or replace function public.my_support_grant(p_reason text, p_hours int default 24)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_role    text;
  v_name    text;
  v_id      uuid;
begin
  select up.company_id, up.role into v_company, v_role from public.user_profiles up where up.id = auth.uid();
  if v_company is null or v_role not in ('director', 'admin') then raise exception 'Only a director or admin can do this.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Write what you need help with.'; end if;

  -- One at a time: a new grant replaces the old one.
  update public.support_grants set ended_at = now(), ended_by = auth.uid()
   where company_id = v_company and ended_at is null and expires_at > now();

  insert into public.support_grants (company_id, granted_by, reason, expires_at)
  values (v_company, auth.uid(), left(trim(p_reason), 500), now() + make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24)))
  returning id into v_id;

  select name into v_name from public.companies where id = v_company;
  perform public._notify_platform_admins('support.granted', 'Support access: ' || coalesce(v_name, 'a company'),
    left(trim(p_reason), 140) || ' (24 hours)', true);
  update public.notifications set link = '/hq?tab=support'
   where kind = 'support.granted' and created_at > now() - interval '5 seconds';
  return v_id;
end;
$$;

create or replace function public.my_support_end()
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_role    text;
begin
  select up.company_id, up.role into v_company, v_role from public.user_profiles up where up.id = auth.uid();
  if v_company is null or v_role not in ('director', 'admin') then raise exception 'Only a director or admin can do this.'; end if;
  update public.support_grants set ended_at = now(), ended_by = auth.uid()
   where company_id = v_company and ended_at is null and expires_at > now();
end;
$$;

create or replace function public.my_support_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_company uuid;
  v_role    text;
  g         public.support_grants;
begin
  select up.company_id, up.role into v_company, v_role from public.user_profiles up where up.id = auth.uid();
  if v_company is null then raise exception 'not found'; end if;
  if v_role not in ('director', 'admin') then return jsonb_build_object('can_manage', false); end if;
  g := public._support_active_grant(v_company);
  return jsonb_build_object(
    'can_manage', true,
    'active', case when g.id is null then null else jsonb_build_object('id', g.id, 'reason', g.reason, 'granted_at', g.granted_at,
                'expires_at', g.expires_at, 'granted_by_email', (select email from auth.users where id = g.granted_by)) end,
    'grants', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'reason', x.reason, 'granted_at', x.granted_at,
                 'expires_at', x.expires_at, 'ended_at', x.ended_at,
                 'granted_by_email', (select email from auth.users where id = x.granted_by)) order by x.granted_at desc), '[]')
                 from (select * from public.support_grants where company_id = v_company order by granted_at desc limit 20) x),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'who', l.admin_email, 'what', l.what, 'grant_id', l.grant_id)
                 order by l.at desc), '[]')
              from (select * from public.support_access_log where company_id = v_company order by at desc limit 300) l)
  );
end;
$$;

revoke all on function public.my_support_grant(text, int) from public, anon;
revoke all on function public.my_support_end() from public, anon;
revoke all on function public.my_support_status() from public, anon;
grant execute on function public.my_support_grant(text, int) to authenticated;
grant execute on function public.my_support_end() to authenticated;
grant execute on function public.my_support_status() to authenticated;

-- ---------------------------------------------------------------------
-- HQ side (read only, logged)
-- ---------------------------------------------------------------------
create or replace function public._support_log(p_company uuid, p_grant uuid, p_what text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_first boolean;
begin
  v_first := not exists (select 1 from public.support_access_log where grant_id = p_grant);
  insert into public.support_access_log (grant_id, company_id, admin_id, admin_email, what)
  values (p_grant, p_company, auth.uid(), (select email from auth.users where id = auth.uid()), left(p_what, 300));
  if v_first then
    perform public._notify_company_admins(p_company, 'support.opened', 'Magnus support opened your company',
      'Read-only, under the access you gave. See exactly what they look at under Support access.', false);
    update public.notifications set link = '/support-access'
     where kind = 'support.opened' and company_id = p_company and created_at > now() - interval '5 seconds';
  end if;
end;
$$;

revoke all on function public._support_log(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.hq_support_grants()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'company_id', g.company_id, 'company_name', c.name,
                     'reason', g.reason, 'granted_at', g.granted_at, 'expires_at', g.expires_at, 'ended_at', g.ended_at,
                     'active', g.ended_at is null and g.expires_at > now(),
                     'granted_by_email', u.email,
                     'views', (select count(*) from public.support_access_log l where l.grant_id = g.id))
                   order by (g.ended_at is null and g.expires_at > now()) desc, g.granted_at desc)
                     from (select * from public.support_grants order by granted_at desc limit 100) g
                     join public.companies c on c.id = g.company_id
                     left join auth.users u on u.id = g.granted_by), '[]'::jsonb);
end;
$$;

-- Which tables of the company support can look at, with row counts. Opening this is logged.
create or replace function public.hq_support_tables(p_company uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  g   public.support_grants;
  t   text;
  n   bigint;
  out jsonb := '[]'::jsonb;
begin
  perform public.platform_require(false);
  g := public._support_active_grant(p_company);
  if g.id is null then raise exception 'This company has not given support access (or it has ended).'; end if;
  perform public._support_log(p_company, g.id, 'Opened the list of records');

  for t in
    select c.relname::text from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
     where ns.nspname = 'public' and c.relkind in ('r', 'p') and not public._support_hidden_table(c.relname)
     order by 1
  loop
    execute format('select count(*) from public.%I where company_id = $1', t) into n using p_company;
    if n > 0 then out := out || jsonb_build_object('table', t, 'rows', n); end if;
  end loop;
  return jsonb_build_object('company_id', p_company, 'expires_at', g.expires_at, 'reason', g.reason, 'tables', out);
end;
$$;

-- Rows of one company table, secret columns removed. Every call is logged with the table and the rows shown.
create or replace function public.hq_support_read(p_company uuid, p_table text, p_offset int default 0, p_limit int default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  g        public.support_grants;
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_cols   text;
  v_rows   jsonb;
  v_total  bigint;
  v_order  text;
begin
  perform public.platform_require(false);
  g := public._support_active_grant(p_company);
  if g.id is null then raise exception 'This company has not given support access (or it has ended).'; end if;

  if public._support_hidden_table(p_table) or not exists (
       select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
        where ns.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = p_table) then
    raise exception 'Support can''t open that.';
  end if;

  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = ('public.' || quote_ident(p_table))::regclass and a.attnum > 0 and not a.attisdropped
     and not public._support_secret_col(a.attname);

  select case when exists (select 1 from pg_attribute where attrelid = ('public.' || quote_ident(p_table))::regclass and attname = 'created_at' and not attisdropped)
              then 'created_at desc nulls last' else '1' end into v_order;

  execute format('select count(*) from public.%I where company_id = $1', p_table) into v_total using p_company;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select %s from public.%I where company_id = $1 order by %s limit %s offset %s) x',
                 v_cols, p_table, v_order, v_limit, v_offset)
     into v_rows using p_company;

  perform public._support_log(p_company, g.id,
    'Viewed ' || replace(p_table, '_', ' ') || ' (rows ' || (v_offset + 1) || '-' || least(v_offset + v_limit, v_total) || ' of ' || v_total || ')');
  return jsonb_build_object('table', p_table, 'total', v_total, 'offset', v_offset, 'limit', v_limit, 'rows', v_rows);
end;
$$;

revoke all on function public.hq_support_grants() from public, anon;
revoke all on function public.hq_support_tables(uuid) from public, anon;
revoke all on function public.hq_support_read(uuid, text, int, int) from public, anon;
grant execute on function public.hq_support_grants() to authenticated;
grant execute on function public.hq_support_tables(uuid) to authenticated;
grant execute on function public.hq_support_read(uuid, text, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- Overview: active support access shows in "Needs your attention" (bills from 20260961 kept)
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
      union all
      select 2, null::date,
             jsonb_build_object('level', 'info', 'tab', 'support',
               'title', 'Support access open: ' || c.name,
               'detail', g.reason || ' (until ' || to_char(g.expires_at at time zone 'America/Jamaica', 'DD Mon, HH12:MI am') || ')')
        from public.support_grants g join public.companies c on c.id = g.company_id
       where g.ended_at is null and g.expires_at > now()
    ) x;
$$;

revoke all on function public._hq_attention_extra() from public, anon, authenticated;
