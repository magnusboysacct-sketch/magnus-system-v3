-- =====================================================================
-- Magnus HQ - Step 11: Leads, Feedback and Website editing
-- Magnus Boy's System
--
--   * hq_leads(), hq_lead_save(), hq_lead_add(), hq_lead_delete()  - demo requests: new / called / trial / won / lost + note
--   * hq_feedback(), hq_feedback_save()                               - ideas & problem reports: new / read / planned / done / spam + note
--   * hq_setting_save() now also takes 'website' (home page headline, sub-line, FAQ)
--   * hq_legal_list(), hq_legal_publish()                             - privacy / terms: every edit is a NEW version, old ones kept (owner only)
--   * submit_lead / submit_feedback: the HQ alert now opens the Leads / Feedback tab
--
-- Every change is checked (platform admin with 2-step login) and written to the HQ activity log.
-- Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Leads
-- ---------------------------------------------------------------------
create or replace function public.hq_leads()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'name', l.name, 'company', l.company, 'phone', l.phone, 'email', l.email,
             'message', l.message, 'source', l.source, 'status', l.status, 'note', l.note,
             'created_at', l.created_at, 'updated_at', l.updated_at)
           order by (l.status = 'new') desc, l.created_at desc)
      from public.leads l), '[]'::jsonb);
end;
$$;

create or replace function public.hq_lead_save(p_id uuid, p_status text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_check('lead.update', p_id::text, jsonb_build_object('status', p_status), false);
  if p_status not in ('new', 'called', 'trial', 'won', 'lost') then raise exception 'Unknown status.'; end if;
  update public.leads
     set status = p_status, note = nullif(left(trim(coalesce(p_note, '')), 2000), ''), updated_at = now()
   where id = p_id;
  if not found then raise exception 'That demo request is gone.'; end if;
end;
$$;

-- For people who phone or WhatsApp you directly.
create or replace function public.hq_lead_add(p_name text, p_company text, p_phone text, p_email text, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.platform_check('lead.add', left(coalesce(p_name, ''), 100), '{}'::jsonb, false);
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Type their name.'; end if;
  if trim(coalesce(p_phone, '')) = '' and trim(coalesce(p_email, '')) = '' then raise exception 'Add a phone / WhatsApp number or an email.'; end if;
  insert into public.leads (name, company, phone, email, message, source, status)
  values (left(trim(p_name), 100), nullif(left(trim(coalesce(p_company, '')), 120), ''), nullif(left(trim(coalesce(p_phone, '')), 40), ''),
          nullif(lower(left(trim(coalesce(p_email, '')), 120)), ''), nullif(left(trim(coalesce(p_message, '')), 2000), ''), 'hq', 'new')
  returning id into v_id;
  return v_id;
end;
$$;

-- Junk / spam only. Owner only.
create or replace function public.hq_lead_delete(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_check('lead.delete', p_id::text,
    jsonb_build_object('reason', p_reason, 'lead', (select to_jsonb(l) - 'message' from public.leads l where l.id = p_id)), true);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write a reason.'; end if;
  delete from public.leads where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Feedback
-- ---------------------------------------------------------------------
create or replace function public.hq_feedback()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'kind', f.kind, 'message', f.message, 'contact', f.contact, 'page', f.page,
             'status', f.status, 'note', f.note, 'created_at', f.created_at,
             'company_name', c.name, 'user_email', u.email)
           order by (f.status = 'new') desc, (f.kind = 'problem') desc, f.created_at desc)
      from public.feedback f
      left join public.companies c on c.id = f.company_id
      left join auth.users u on u.id = f.user_id), '[]'::jsonb);
end;
$$;

create or replace function public.hq_feedback_save(p_id uuid, p_status text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_check('feedback.update', p_id::text, jsonb_build_object('status', p_status), false);
  if p_status not in ('new', 'read', 'planned', 'done', 'spam') then raise exception 'Unknown status.'; end if;
  update public.feedback
     set status = p_status, note = nullif(left(trim(coalesce(p_note, '')), 2000), ''), updated_at = now()
   where id = p_id;
  if not found then raise exception 'That message is gone.'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Privacy policy and terms: every change is a new version
-- ---------------------------------------------------------------------
create or replace function public.hq_legal_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.platform_require(false);
  return coalesce((
    select jsonb_agg(jsonb_build_object('kind', d.kind, 'version', d.version, 'body', d.body,
                                        'published_at', d.published_at, 'published_by', u.email)
           order by d.kind, d.version desc)
      from public.legal_docs d left join auth.users u on u.id = d.published_by), '[]'::jsonb);
end;
$$;

create or replace function public.hq_legal_publish(p_kind text, p_body text, p_reason text)
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_body text := trim(coalesce(p_body, ''));
  v_ver  int;
begin
  perform public.platform_check('legal.publish', p_kind, jsonb_build_object('reason', p_reason), true);
  if p_kind not in ('privacy', 'terms') then raise exception 'Choose Privacy or Terms.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write what changed.'; end if;
  if length(v_body) < 50 then raise exception 'The text is too short.'; end if;
  if length(v_body) > 60000 then raise exception 'The text is too long (60,000 characters max).'; end if;
  if v_body = (select body from public.legal_docs where kind = p_kind order by version desc limit 1) then
    raise exception 'Nothing changed.';
  end if;
  perform pg_advisory_xact_lock(hashtext('legal_docs:' || p_kind));
  select coalesce(max(version), 0) + 1 into v_ver from public.legal_docs where kind = p_kind;
  insert into public.legal_docs (kind, version, body, published_by) values (p_kind, v_ver, v_body, auth.uid());
  insert into public.platform_settings (key, value, updated_by) values ('legal_versions', jsonb_build_object(p_kind, v_ver), auth.uid())
  on conflict (key) do update set value = public.platform_settings.value || excluded.value, updated_by = excluded.updated_by, updated_at = now();
  return v_ver;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Settings: same as 20260963, plus 'website'
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
  elsif p_key = 'website' then
    if length(trim(coalesce(v ->> 'hero_title', ''))) not between 5 and 120 then raise exception 'Headline: 5 to 120 characters.'; end if;
    if length(trim(coalesce(v ->> 'hero_sub', ''))) > 300 then raise exception 'Sub-line: up to 300 characters.'; end if;
    if jsonb_typeof(coalesce(v -> 'faq', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(v -> 'faq', '[]'::jsonb)) > 20 then
      raise exception 'Up to 20 questions.';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(v -> 'faq', '[]'::jsonb)) e
                where length(trim(coalesce(e ->> 'q', ''))) not between 3 and 200
                   or length(trim(coalesce(e ->> 'a', ''))) not between 3 and 1500) then
      raise exception 'Each question needs a question (up to 200 characters) and an answer (up to 1,500).';
    end if;
    v := jsonb_build_object('hero_title', trim(v ->> 'hero_title'), 'hero_sub', trim(coalesce(v ->> 'hero_sub', '')),
           'faq', coalesce((select jsonb_agg(jsonb_build_object('q', trim(e ->> 'q'), 'a', trim(e ->> 'a')) order by i)
                              from jsonb_array_elements(coalesce(v -> 'faq', '[]'::jsonb)) with ordinality t(e, i)), '[]'::jsonb));
  else
    raise exception 'This setting can''t be changed here.';
  end if;

  insert into public.platform_settings (key, value, updated_by, updated_at) values (p_key, v, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Public forms: the HQ alert opens the right tab (same as 20260965 otherwise)
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
  update public.notifications set link = '/hq?tab=leads' where kind = 'lead.new' and created_at > now() - interval '5 seconds';
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
    update public.notifications set link = '/hq?tab=feedback' where kind = 'feedback.problem' and created_at > now() - interval '5 seconds';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Who may call what
-- ---------------------------------------------------------------------
revoke all on function public.hq_leads() from public, anon;
revoke all on function public.hq_lead_save(uuid, text, text) from public, anon;
revoke all on function public.hq_lead_add(text, text, text, text, text) from public, anon;
revoke all on function public.hq_lead_delete(uuid, text) from public, anon;
revoke all on function public.hq_feedback() from public, anon;
revoke all on function public.hq_feedback_save(uuid, text, text) from public, anon;
revoke all on function public.hq_legal_list() from public, anon;
revoke all on function public.hq_legal_publish(text, text, text) from public, anon;
grant execute on function public.hq_leads() to authenticated;
grant execute on function public.hq_lead_save(uuid, text, text) to authenticated;
grant execute on function public.hq_lead_add(text, text, text, text, text) to authenticated;
grant execute on function public.hq_lead_delete(uuid, text) to authenticated;
grant execute on function public.hq_feedback() to authenticated;
grant execute on function public.hq_feedback_save(uuid, text, text) to authenticated;
grant execute on function public.hq_legal_list() to authenticated;
grant execute on function public.hq_legal_publish(text, text, text) to authenticated;
