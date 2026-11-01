-- =====================================================================
-- Magnus HQ - Step 10: public website - demo requests, ideas & feedback, legal pages, website text
-- Magnus Boy's System
--
--   * leads             - "Book a demo" requests from the front page (status new / called / trial / won / lost: Step 11)
--   * feedback          - ideas / problems / likes from anyone, signed in or not (New / Read / Planned / Done / Spam: Step 11)
--   * legal_docs        - Privacy policy and Terms, versioned (editing in HQ: Step 11). Seeded as DRAFTS to review.
--   * platform_settings 'website' - hero text, sub-text and FAQ, editable in Step 11
--   * public_form_hits  - anti-spam: max 5 forms per visitor per hour and 60 in total per hour (visitor = a one-way hash
--                         of the connection address, never the address itself), plus a hidden "robot trap" field
--   * get_public_site(), get_legal(), submit_lead(), submit_feedback()  - for signed-out visitors
--   * HQ admins get an alert for every demo request and every "problem" report.
-- Safe to run twice.
-- =====================================================================

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text,
  phone       text,
  email       text,
  message     text,
  source      text,
  status      text not null default 'new' check (status in ('new', 'called', 'trial', 'won', 'lost')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_leads_status on public.leads (status, created_at desc);

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('idea', 'problem', 'like', 'other')),
  message     text not null,
  contact     text,
  page        text,
  user_id     uuid references auth.users(id) on delete set null,
  company_id  uuid references public.companies(id) on delete set null,
  status      text not null default 'new' check (status in ('new', 'read', 'planned', 'done', 'spam')),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_feedback_status on public.feedback (status, created_at desc);

create table if not exists public.legal_docs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('privacy', 'terms')),
  version       int not null,
  body          text not null,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users(id) on delete set null,
  unique (kind, version)
);

create table if not exists public.public_form_hits (
  bucket  text not null,
  hour    timestamptz not null,
  n       int not null default 0,
  primary key (bucket, hour)
);

alter table public.leads enable row level security;
alter table public.feedback enable row level security;
alter table public.legal_docs enable row level security;
alter table public.public_form_hits enable row level security;
revoke all on public.leads, public.feedback, public.legal_docs, public.public_form_hits from anon, authenticated;

insert into public.platform_security_notes (kind, object, note) values
  ('no_policies', 'leads',            'Demo requests: written by submit_lead(), read by HQ functions only.'),
  ('no_policies', 'feedback',         'Ideas & feedback: written by submit_feedback(), read by HQ functions only.'),
  ('no_policies', 'legal_docs',       'Privacy / Terms: read through get_legal().'),
  ('no_policies', 'public_form_hits', 'Anti-spam counters for the public forms.')
on conflict (kind, object) do update set note = excluded.note;

-- A random secret for hashing visitor addresses (stays in the database; HQ never shows it).
insert into public.platform_settings (key, value)
values ('form_salt', to_jsonb(md5(random()::text || clock_timestamp()::text || random()::text)))
on conflict (key) do nothing;

create or replace function public.get_platform_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from public.platform_settings
   where key not in ('form_salt', 'push', 'limits', 'billing');   -- internal values (and your bank / Lynk details) are never public
$$;

insert into public.platform_settings (key, value) values
  ('website', jsonb_build_object(
     'hero_title', 'Run your construction company from your phone',
     'hero_sub',   'Projects, workers, payroll, purchasing and clients in one place. Built in Jamaica for Caribbean contractors.',
     'faq', jsonb_build_array(
       jsonb_build_object('q', 'Does it work on my phone?', 'a', 'Yes. Magnus runs in the browser on any phone, tablet or computer. On a phone you can add it to your home screen like an app.'),
       jsonb_build_object('q', 'Does payroll use the Jamaican rates?', 'a', 'Yes. NIS, NHT, Education Tax, HEART and PAYE are worked out with the current official rates, and each rate change is set once for everyone.'),
       jsonb_build_object('q', 'Can my clients and field officers see their projects?', 'a', 'Yes. Each client gets a portal, and each field officer can get their own login that only shows their assigned projects.'),
       jsonb_build_object('q', 'Do my workers need a login?', 'a', 'No. Workers get a worker number and PIN for their own portal and payslips, and field payment receipts can be sent as a WhatsApp link.'),
       jsonb_build_object('q', 'Who can see my company''s data?', 'a', 'Only your own team. Magnus support can only look at your records if you give them access, it is read-only, it ends after 24 hours, and you see everything they open.'),
       jsonb_build_object('q', 'How much does it cost?', 'a', 'See the prices on this page. Every new company starts with a free trial.'))))
on conflict (key) do nothing;

insert into public.legal_docs (kind, version, body) values
('privacy', 1, $doc$DRAFT - have this reviewed by a lawyer before relying on it.

Magnus Boy's System ("Magnus") is run by Magnus Boy's Construction Limited, Jamaica.

What we collect
- Your account: name, email, and the details your company enters (projects, clients, workers, payroll, invoices, files).
- Basic usage counts (which part of the app is used, and when) with no names or addresses, to keep Magnus working.
- Error reports when something breaks (the screen, the browser and the error message).

How we use it
- To run Magnus for your company, send you emails you asked for (invites, password resets, payslips), and keep the service safe.
- We do not sell your data.

Who can see your company's data
- Only people in your company that you give access to.
- Magnus support can only look at your records if your director or admin gives them access. It is read-only, it ends after 24 hours, and you can see everything they opened.

Where it is stored
- With our service providers (Supabase for the database and files, Vercel for hosting, Resend for email).

Your choices
- You can ask for a copy of your company's data, or ask us to close your account. Closed accounts are deleted after 90 days.

Contact: see the support contact on the Magnus website.$doc$),
('terms', 1, $doc$DRAFT - have this reviewed by a lawyer before relying on it.

These terms are between your company and Magnus Boy's Construction Limited, Jamaica, for the use of Magnus Boy's System ("Magnus").

1. Your account. You are responsible for who you invite and what they do in your company's account. Keep passwords private.
2. Your data. Your company owns its data. We look after it as described in the Privacy policy.
3. Fair use. Don't misuse Magnus, try to get into other companies' data, or overload the service.
4. Payroll and tax. Magnus works out deductions with the rates in force, but your company is responsible for checking payslips and filing returns on time.
5. Payment. Paid plans are billed monthly. If a bill is not paid after the grace days, your account becomes read-only until it is paid.
6. Availability. We work to keep Magnus running, but we can't promise it will never be down.
7. Ending. You can close your account at any time. We may close accounts that break these terms. Closed accounts are deleted after 90 days.
8. Changes. We may update these terms and will show the new version on the website.$doc$)
on conflict (kind, version) do nothing;

-- ---------------------------------------------------------------------
-- Anti-spam
-- ---------------------------------------------------------------------
create or replace function public._public_form_allowed(p_form text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_hour   timestamptz := date_trunc('hour', now());
  v_ip     text := split_part(coalesce((nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ''), ',', 1);
  v_salt   text := coalesce((select value #>> '{}' from public.platform_settings where key = 'form_salt'), 'magnus');
  v_bucket text := p_form || ':' || md5(v_salt || trim(v_ip));
  v_mine   int;
  v_all    int;
begin
  select coalesce(sum(n), 0) into v_all from public.public_form_hits where hour = v_hour and bucket like p_form || ':%';
  if v_all >= 60 then return false; end if;
  insert into public.public_form_hits (bucket, hour, n) values (v_bucket, v_hour, 1)
  on conflict (bucket, hour) do update set n = public_form_hits.n + 1
  returning n into v_mine;
  delete from public.public_form_hits where hour < now() - interval '2 days';
  return v_mine <= 5;
end;
$$;

revoke all on function public._public_form_allowed(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Public reads
-- ---------------------------------------------------------------------
create or replace function public.get_public_site()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'website', coalesce((select value from public.platform_settings where key = 'website'), '{}'::jsonb),
    'support_contact', coalesce((select value from public.platform_settings where key = 'support_contact'), '{}'::jsonb),
    'signups_open', coalesce((select value from public.platform_settings where key = 'signups_open'), 'true'::jsonb),
    'pricing', public.get_public_prices(),
    'legal', (select coalesce(jsonb_object_agg(kind, v), '{}'::jsonb)
                from (select kind, max(version) v from public.legal_docs group by kind) x));
$$;

create or replace function public.get_legal(p_kind text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('kind', d.kind, 'version', d.version, 'body', d.body, 'published_at', d.published_at)
    from public.legal_docs d where d.kind = p_kind order by d.version desc limit 1;
$$;

revoke all on function public.get_public_site() from public;
revoke all on function public.get_legal(text) from public;
grant execute on function public.get_public_site() to anon, authenticated;
grant execute on function public.get_legal(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Public forms
-- ---------------------------------------------------------------------
create or replace function public.submit_lead(
  p_name text, p_company text, p_phone text, p_email text, p_message text, p_trap text, p_source text default 'website'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_name  text := left(trim(coalesce(p_name, '')), 100);
  v_phone text := left(trim(coalesce(p_phone, '')), 40);
  v_email text := lower(left(trim(coalesce(p_email, '')), 120));
begin
  -- The robot trap is a field people never see. Pretend it worked.
  if coalesce(p_trap, '') <> '' then return jsonb_build_object('ok', true); end if;
  if length(v_name) < 2 then raise exception 'Please type your name.'; end if;
  if v_phone = '' and v_email = '' then raise exception 'Please give a phone / WhatsApp number or an email so we can reach you.'; end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn''t look right.'; end if;
  if v_phone <> '' and v_phone !~ '^[0-9+()\s.-]{7,40}$' then raise exception 'That phone number doesn''t look right.'; end if;
  if not public._public_form_allowed('lead') then raise exception 'Too many requests right now. Please try again in an hour, or WhatsApp us.'; end if;

  insert into public.leads (name, company, phone, email, message, source)
  values (v_name, nullif(left(trim(coalesce(p_company, '')), 120), ''), nullif(v_phone, ''), nullif(v_email, ''),
          nullif(left(trim(coalesce(p_message, '')), 2000), ''), left(coalesce(p_source, 'website'), 40));

  perform public._notify_platform_admins('lead.new', 'Demo request: ' || v_name || coalesce(' (' || nullif(trim(coalesce(p_company, '')), '') || ')', ''),
    coalesce(nullif(v_phone, ''), v_email) || coalesce(' · ' || left(nullif(trim(coalesce(p_message, '')), ''), 100), ''), true);
  update public.notifications set link = '/hq?tab=overview' where kind = 'lead.new' and created_at > now() - interval '5 seconds';
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.submit_feedback(p_kind text, p_message text, p_contact text, p_page text, p_trap text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_msg text := left(trim(coalesce(p_message, '')), 2000);
  v_uid uuid := auth.uid();
begin
  if coalesce(p_trap, '') <> '' then return jsonb_build_object('ok', true); end if;
  if p_kind not in ('idea', 'problem', 'like', 'other') then raise exception 'Choose what kind of message this is.'; end if;
  if length(v_msg) < 5 then raise exception 'Please write a little more.'; end if;
  if not public._public_form_allowed('feedback') then raise exception 'Too many messages right now. Please try again in an hour.'; end if;

  insert into public.feedback (kind, message, contact, page, user_id, company_id)
  values (p_kind, v_msg, nullif(left(trim(coalesce(p_contact, '')), 160), ''), left(p_page, 120), v_uid,
          (select up.company_id from public.user_profiles up where up.id = v_uid));

  if p_kind = 'problem' then
    perform public._notify_platform_admins('feedback.problem', 'Problem reported', left(v_msg, 140), true);
    update public.notifications set link = '/hq?tab=overview' where kind = 'feedback.problem' and created_at > now() - interval '5 seconds';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_lead(text, text, text, text, text, text, text) from public;
revoke all on function public.submit_feedback(text, text, text, text, text) from public;
grant execute on function public.submit_lead(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Overview: new demo requests and "problem" feedback waiting (bills + support lines from 20260964 kept)
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
      select 1, null::date, jsonb_build_object('level', 'warn', 'tab', 'leads',
               'title', n || ' new demo request' || case when n = 1 then '' else 's' end || ' waiting',
               'detail', 'Call or WhatsApp them. Open Leads.')
        from (select count(*) n from public.leads where status = 'new') l where n > 0
      union all
      select 1, null::date, jsonb_build_object('level', 'warn', 'tab', 'feedback',
               'title', n || ' problem report' || case when n = 1 then '' else 's' end || ' not read yet',
               'detail', 'Someone reported something broken. Open Feedback.')
        from (select count(*) n from public.feedback where status = 'new' and kind = 'problem') f where n > 0
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
