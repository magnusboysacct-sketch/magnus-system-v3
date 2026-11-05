-- =====================================================================
-- Clock in / clock out, step 1 - Magnus Boy's System
--
-- Workers clock in and out on their phone in the worker portal (/worker, worker number + PIN, no Supabase login).
-- A supervisor can also clock in a crew from their own phone. Each clock in / out keeps:
--   * where the phone was (latitude, longitude, how exact the phone said it was) and how far that is from the site;
--   * a selfie (private-files: <company>/attendance/<yyyy-mm>/<worker>/...), so nobody clocks in a friend.
-- The site is the project's own map point (projects.site_lat / site_lng, already there for the weather) and a new
-- projects.site_radius_m (default 300 m). A supervisor sets it standing on the site: attendance_set_site.
--
-- Leaving the site: while the clock screen is open the phone sends a check every 10 minutes (worker_clock_check).
-- Two "off site" checks at least 3 minutes apart clock the worker out (out_method 'left_site'). Paid time always
-- stops at the LAST TIME THE PHONE PROVED THE WORKER WAS ON SITE (paid_until) when the clock out was not on site.
-- A shift left open past the day is closed the next time anyone looks (out_method 'auto_night', flag
-- 'forgot_clock_out'). Nothing here pays anybody: step 3 adds supervisor approval and the field payment.
-- Clocking in away from the site is ALLOWED but flagged (GPS can be wrong in the hills).
-- "Are you still on site?": a few times a day the clock screen buzzes and asks the worker to tap. Tapping sends a site check
-- (proves the PERSON is there, not only the phone). No tap in 15 minutes: worker_clock_missed flags the shift 'missed_check'
-- for the supervisor (step 3 approval decides the pay).
--
--   attendance_shifts / attendance_checks: read by director, admin, supervisor, site user, office user of the company
--   (row-level security). Nobody writes them directly: only the functions below.
--   Worker (token): worker_clock_state, worker_clock_in, worker_clock_check, worker_clock_out
--   Staff:          attendance_set_site, attendance_staff_clock_in, attendance_staff_clock_out, attendance_close_stale
-- Safe to run twice.
-- =====================================================================

begin;

do $$ begin
  if to_regprocedure('public._worker_session(text, boolean)') is null then
    raise exception 'The worker portal (migration 20260952000000) is not installed. Nothing was changed.';
  end if;
end $$;

alter table public.projects add column if not exists site_radius_m integer not null default 300;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'projects_site_radius_m_check') then
    alter table public.projects add constraint projects_site_radius_m_check check (site_radius_m between 50 and 5000);
  end if;
end $$;

create table if not exists public.attendance_shifts (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,
  worker_id         uuid not null references public.workers(id) on delete cascade,
  project_id        uuid references public.projects(id) on delete set null,
  work_date         date not null,
  status            text not null default 'open' check (status in ('open', 'closed')),
  clock_in_at       timestamptz not null default now(),
  in_lat            double precision,
  in_lng            double precision,
  in_accuracy_m     numeric(10,1),
  in_distance_m     integer,
  in_photo_path     text,
  clock_out_at      timestamptz,
  out_lat           double precision,
  out_lng           double precision,
  out_accuracy_m    numeric(10,1),
  out_distance_m    integer,
  out_photo_path    text,
  out_method        text check (out_method in ('worker', 'left_site', 'auto_night', 'staff')),
  site_radius_m     integer,
  last_on_site_at   timestamptz,
  last_check_at     timestamptz,
  first_off_site_at timestamptz,
  paid_until        timestamptz,
  minutes_worked    integer,
  flags             text[] not null default '{}',
  clocked_in_by     uuid,
  clocked_out_by    uuid,
  note              text,
  created_at        timestamptz not null default now()
);
create unique index if not exists attendance_shifts_one_open on public.attendance_shifts (worker_id) where status = 'open';
create index if not exists attendance_shifts_company_day on public.attendance_shifts (company_id, work_date);
create index if not exists attendance_shifts_project on public.attendance_shifts (project_id, work_date);

create table if not exists public.attendance_checks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  shift_id    uuid not null references public.attendance_shifts(id) on delete cascade,
  checked_at  timestamptz not null default now(),
  kind        text not null,
  lat         double precision,
  lng         double precision,
  accuracy_m  numeric(10,1),
  distance_m  integer,
  on_site     boolean            -- null: no location, no site point, or the phone was too unsure
);
create index if not exists attendance_checks_shift on public.attendance_checks (shift_id, checked_at);
alter table public.attendance_checks drop constraint if exists attendance_checks_kind_check;
alter table public.attendance_checks add constraint attendance_checks_kind_check check (kind in ('clock_in', 'check', 'answer', 'missed', 'clock_out'));

alter table public.attendance_shifts enable row level security;
alter table public.attendance_checks enable row level security;
revoke all on public.attendance_shifts, public.attendance_checks from public, anon, authenticated;
grant select on public.attendance_shifts, public.attendance_checks to authenticated;
drop policy if exists "Site staff read shifts" on public.attendance_shifts;
create policy "Site staff read shifts" on public.attendance_shifts for select to authenticated
  using (company_id in (select up.company_id from public.user_profiles up where up.id = auth.uid()
                         and up.role in ('director', 'admin', 'supervisor', 'site_user', 'office_user')));
drop policy if exists "Site staff read checks" on public.attendance_checks;
create policy "Site staff read checks" on public.attendance_checks for select to authenticated
  using (company_id in (select up.company_id from public.user_profiles up where up.id = auth.uid()
                         and up.role in ('director', 'admin', 'supervisor', 'site_user', 'office_user')));

do $$ declare t text; begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_hq_write_guard') then
    foreach t in array array['attendance_shifts', 'attendance_checks'] loop
      execute format('drop trigger if exists hq_write_guard on public.%I', t);
      execute format('create trigger hq_write_guard before insert or update or delete on public.%I for each row execute function public._hq_write_guard()', t);
    end loop;
  end if;
end $$;

-- ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._att_today()
returns date language sql stable set search_path = public, pg_temp
as $$ select ((now() at time zone 'UTC') - interval '5 hours')::date $$;     -- Jamaica is UTC-5 all year

-- metres between two points (haversine)
create or replace function public._att_metres(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns integer language sql immutable set search_path = public, pg_temp
as $$
  select case when a_lat is null or a_lng is null or b_lat is null or b_lng is null then null else
    round(2 * 6371000 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2)
          + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))::integer end
$$;

-- Is this reading on the site?  true / false / null (no reading, no site point, or the phone too unsure to say "off").
create or replace function public._att_judge(p_project uuid, p_lat double precision, p_lng double precision, p_acc numeric,
                                             out distance_m integer, out on_site boolean, out radius_m integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare p record;
begin
  select pr.site_lat, pr.site_lng, coalesce(pr.site_radius_m, 300) r into p from public.projects pr where pr.id = p_project;
  radius_m := coalesce(p.r, 300);
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p.site_lat is null or p.site_lng is null then
    distance_m := case when p.site_lat is not null and p_lat between -90 and 90 and p_lng between -180 and 180
                       then public._att_metres(p_lat, p_lng, p.site_lat::double precision, p.site_lng::double precision) end;
    on_site := null; return;
  end if;
  distance_m := public._att_metres(p_lat, p_lng, p.site_lat::double precision, p.site_lng::double precision);
  if distance_m <= radius_m + least(coalesce(p_acc, 0), 100) then on_site := true;     -- allow for normal GPS drift
  elsif coalesce(p_acc, 0) > 250 then on_site := null;                                 -- the phone itself is not sure
  else on_site := false;
  end if;
end;
$$;

-- Close a shift. Paid time stops at the clock out when it was on site (or can't be judged);
-- otherwise at the last time the phone proved the worker was on site.
create or replace function public._att_close(p_shift uuid, p_method text, p_lat double precision, p_lng double precision, p_acc numeric,
                                             p_photo text, p_by uuid, p_at timestamptz default now())
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; j record; v_paid timestamptz; v_flags text[]; v_dist integer;
begin
  select * into s from public.attendance_shifts where id = p_shift and status = 'open' for update;
  if not found then return; end if;
  v_flags := s.flags;
  if p_method in ('worker', 'staff') then
    select * into j from public._att_judge(s.project_id, p_lat, p_lng, p_acc);
    v_dist := j.distance_m;
    insert into public.attendance_checks (company_id, shift_id, checked_at, kind, lat, lng, accuracy_m, distance_m, on_site)
    values (s.company_id, s.id, p_at, 'clock_out', p_lat, p_lng, p_acc, j.distance_m, j.on_site);
    if p_lat is null then v_flags := array_append(v_flags, 'out_no_location'); end if;
    if j.on_site is false then
      v_flags := array_append(v_flags, 'out_far');
      v_paid := coalesce(s.last_on_site_at, s.clock_in_at);
    else
      v_paid := p_at;
    end if;
  elsif p_method = 'left_site' then
    v_flags := array_append(v_flags, 'left_site');
    v_paid := coalesce(s.last_on_site_at, s.clock_in_at);
  else  -- auto_night
    v_flags := array_append(v_flags, 'forgot_clock_out');
    -- with a site point only proof of being ON SITE counts; without one, the last time the phone checked in
    v_paid := case when 'no_site_point' = any(s.flags) then coalesce(s.last_check_at, s.clock_in_at) else coalesce(s.last_on_site_at, s.clock_in_at) end;
  end if;
  v_paid := greatest(s.clock_in_at, least(v_paid, p_at));
  update public.attendance_shifts set
    status = 'closed', clock_out_at = p_at, out_method = p_method,
    out_lat = case when p_method in ('worker', 'staff') then p_lat end, out_lng = case when p_method in ('worker', 'staff') then p_lng end,
    out_accuracy_m = case when p_method in ('worker', 'staff') then p_acc end, out_distance_m = v_dist,
    out_photo_path = p_photo, clocked_out_by = p_by,
    paid_until = v_paid, minutes_worked = floor(extract(epoch from (v_paid - s.clock_in_at)) / 60)::integer,
    flags = (select coalesce(array_agg(distinct f), '{}') from unnest(v_flags) f)
  where id = s.id;
end;
$$;

-- Shifts still open from an earlier day: closed at the end of that day (11:59 pm Jamaica).
create or replace function public._att_close_stale(p_company uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare r record; n integer := 0;
begin
  for r in select id, work_date from public.attendance_shifts where company_id = p_company and status = 'open' and work_date < public._att_today() loop
    perform public._att_close(r.id, 'auto_night', null, null, null, null, null, (r.work_date + time '23:59' + interval '5 hours') at time zone 'UTC');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- A reading while clocked in (also used for the clock in itself).
create or replace function public._att_reading(p_shift uuid, p_kind text, p_lat double precision, p_lng double precision, p_acc numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; j record; v_flags text[];
begin
  select * into s from public.attendance_shifts where id = p_shift and status = 'open' for update;
  if not found then return jsonb_build_object('status', 'no_shift'); end if;
  select * into j from public._att_judge(s.project_id, p_lat, p_lng, p_acc);
  insert into public.attendance_checks (company_id, shift_id, kind, lat, lng, accuracy_m, distance_m, on_site)
  values (s.company_id, s.id, p_kind, p_lat, p_lng, p_acc, j.distance_m, j.on_site);
  v_flags := s.flags;
  if j.on_site is true then
    if s.last_on_site_at is not null and now() - s.last_on_site_at > interval '3 hours' then v_flags := array_append(v_flags, 'long_gap'); end if;
    update public.attendance_shifts set last_check_at = now(), last_on_site_at = now(), first_off_site_at = null,
           flags = (select coalesce(array_agg(distinct f), '{}') from unnest(v_flags) f) where id = s.id;
    return jsonb_build_object('status', 'on_site', 'distance_m', j.distance_m, 'radius_m', j.radius_m);
  elsif j.on_site is false then
    if p_kind = 'check' and s.first_off_site_at is not null and now() - s.first_off_site_at >= interval '3 minutes' then
      update public.attendance_shifts set last_check_at = now() where id = s.id;
      perform public._att_close(s.id, 'left_site', null, null, null, null, null, now());
      return jsonb_build_object('status', 'clocked_out', 'distance_m', j.distance_m, 'radius_m', j.radius_m);
    end if;
    update public.attendance_shifts set last_check_at = now(), first_off_site_at = coalesce(first_off_site_at, now()) where id = s.id;
    return jsonb_build_object('status', 'off_site', 'distance_m', j.distance_m, 'radius_m', j.radius_m);
  else
    update public.attendance_shifts set last_check_at = now() where id = s.id;
    return jsonb_build_object('status', case when p_lat is null then 'no_location' else 'unsure' end, 'distance_m', j.distance_m, 'radius_m', j.radius_m);
  end if;
end;
$$;

-- Start a shift (worker or staff).
create or replace function public._att_open(p_company uuid, p_worker uuid, p_project uuid, p_lat double precision, p_lng double precision, p_acc numeric,
                                            p_photo text, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid; pr record; j record; v_flags text[] := '{}'; v_r jsonb;
begin
  perform public._att_close_stale(p_company);
  if exists (select 1 from public.attendance_shifts where worker_id = p_worker and status = 'open') then
    raise exception 'Already clocked in. Clock out first.';
  end if;
  select id, site_lat, site_radius_m into pr from public.projects
   where id = p_project and company_id = p_company and coalesce(status, 'active') not in ('completed', 'cancelled', 'archived');
  if not found then raise exception 'Pick one of the company''s open projects.'; end if;
  if p_photo is not null and p_photo not like p_company::text || '/attendance/%/' || p_worker::text || '/%' then
    raise exception 'That photo does not belong to this clock in.';
  end if;
  select * into j from public._att_judge(p_project, p_lat, p_lng, p_acc);
  if pr.site_lat is null then v_flags := array_append(v_flags, 'no_site_point'); end if;
  if p_lat is null then v_flags := array_append(v_flags, 'in_no_location'); end if;
  if p_photo is null then v_flags := array_append(v_flags, 'in_no_photo'); end if;
  if j.on_site is false then v_flags := array_append(v_flags, 'in_far'); end if;
  insert into public.attendance_shifts (company_id, worker_id, project_id, work_date, in_lat, in_lng, in_accuracy_m, in_distance_m, in_photo_path,
                                        site_radius_m, flags, clocked_in_by, last_check_at)
  values (p_company, p_worker, p_project, public._att_today(), p_lat, p_lng, p_acc, j.distance_m, p_photo, j.radius_m, v_flags, p_by, now())
  returning id into v_id;
  insert into public.attendance_checks (company_id, shift_id, kind, lat, lng, accuracy_m, distance_m, on_site)
  values (p_company, v_id, 'clock_in', p_lat, p_lng, p_acc, j.distance_m, j.on_site);
  if j.on_site is true then update public.attendance_shifts set last_on_site_at = clock_in_at where id = v_id; end if;
  v_r := jsonb_build_object('shift_id', v_id, 'distance_m', j.distance_m, 'radius_m', j.radius_m,
                            'status', case when j.on_site then 'on_site' when j.on_site = false then 'off_site' when p_lat is null then 'no_location' else 'unsure' end,
                            'site_set', pr.site_lat is not null);
  return v_r;
end;
$$;

revoke all on function public._att_today(), public._att_metres(double precision, double precision, double precision, double precision),
  public._att_judge(uuid, double precision, double precision, numeric), public._att_close(uuid, text, double precision, double precision, numeric, text, uuid, timestamptz),
  public._att_close_stale(uuid), public._att_reading(uuid, text, double precision, double precision, numeric),
  public._att_open(uuid, uuid, uuid, double precision, double precision, numeric, text, uuid) from public, anon, authenticated;

-- ── the worker (portal session token) ──────────────────────────────────────────────────────────────────
create or replace function public._att_shift_json(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', s.id, 'project_id', s.project_id, 'project', pr.name, 'work_date', s.work_date, 'status', s.status,
           'clock_in_at', s.clock_in_at, 'clock_out_at', s.clock_out_at, 'out_method', s.out_method, 'in_distance_m', s.in_distance_m,
           'radius_m', s.site_radius_m, 'minutes_worked', s.minutes_worked, 'paid_until', s.paid_until, 'last_on_site_at', s.last_on_site_at,
           'off_site_since', s.first_off_site_at, 'flags', to_jsonb(s.flags))
    from public.attendance_shifts s left join public.projects pr on pr.id = s.project_id where s.id = p_shift
$$;
revoke all on function public._att_shift_json(uuid) from public, anon, authenticated;

create or replace function public.worker_clock_state(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; v_open uuid;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then return null; end if;
  perform public._att_close_stale(s.company_id);
  select id into v_open from public.attendance_shifts where worker_id = s.worker_id and status = 'open';
  return jsonb_build_object(
    'server_time', now(),
    'open', case when v_open is not null then public._att_shift_json(v_open) end,
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'site_set', pr.site_lat is not null) order by pr.name)
                            from public.projects pr where pr.company_id = s.company_id and coalesce(pr.status, 'active') in ('active', 'planning', 'on_hold')), '[]'),
    'last_project_id', (select project_id from public.attendance_shifts where worker_id = s.worker_id order by clock_in_at desc limit 1),
    'today', coalesce((select jsonb_agg(public._att_shift_json(x.id) order by x.clock_in_at)
                         from public.attendance_shifts x where x.worker_id = s.worker_id and x.work_date = public._att_today() and x.status = 'closed'), '[]'));
end;
$$;

create or replace function public.worker_clock_in(p_token text, p_project uuid, p_lat double precision, p_lng double precision, p_accuracy numeric, p_photo_path text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then raise exception 'Your session has ended. Sign in again.'; end if;
  return public._att_open(s.company_id, s.worker_id, p_project, p_lat, p_lng, p_accuracy, nullif(btrim(p_photo_path), ''), null);
end;
$$;

create or replace function public.worker_clock_check(p_token text, p_lat double precision, p_lng double precision, p_accuracy numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; v_shift record;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then return jsonb_build_object('status', 'no_session'); end if;
  select id, last_check_at into v_shift from public.attendance_shifts where worker_id = s.worker_id and status = 'open';
  if not found then return jsonb_build_object('status', 'no_shift'); end if;
  if v_shift.last_check_at > now() - interval '45 seconds' then return jsonb_build_object('status', 'too_soon'); end if;   -- no flooding
  return public._att_reading(v_shift.id, 'check', p_lat, p_lng, p_accuracy);
end;
$$;

-- The worker tapped "I'm here" on an "Are you still on site?" check: a site check recorded as an answer.
create or replace function public.worker_clock_answer(p_token text, p_lat double precision, p_lng double precision, p_accuracy numeric)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; v_id uuid;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then return jsonb_build_object('status', 'no_session'); end if;
  select id into v_id from public.attendance_shifts where worker_id = s.worker_id and status = 'open';
  if v_id is null then return jsonb_build_object('status', 'no_shift'); end if;
  return public._att_reading(v_id, 'answer', p_lat, p_lng, p_accuracy);
end;
$$;

-- No tap within 15 minutes: the shift is flagged for the supervisor. At most one 'missed' row per 30 minutes.
create or replace function public.worker_clock_missed(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; sh record;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then return jsonb_build_object('status', 'no_session'); end if;
  select id, company_id, flags into sh from public.attendance_shifts where worker_id = s.worker_id and status = 'open' for update;
  if not found then return jsonb_build_object('status', 'no_shift'); end if;
  if exists (select 1 from public.attendance_checks where shift_id = sh.id and kind = 'missed' and checked_at > now() - interval '30 minutes') then
    return jsonb_build_object('status', 'too_soon');
  end if;
  insert into public.attendance_checks (company_id, shift_id, kind) values (sh.company_id, sh.id, 'missed');
  if not ('missed_check' = any(sh.flags)) then
    update public.attendance_shifts set flags = array_append(flags, 'missed_check') where id = sh.id;
  end if;
  return jsonb_build_object('status', 'missed');
end;
$$;

create or replace function public.worker_clock_out(p_token text, p_lat double precision, p_lng double precision, p_accuracy numeric, p_photo_path text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; v_id uuid; v_photo text := nullif(btrim(p_photo_path), '');
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then raise exception 'Your session has ended. Sign in again.'; end if;
  select id into v_id from public.attendance_shifts where worker_id = s.worker_id and status = 'open';
  if v_id is null then raise exception 'You are not clocked in.'; end if;
  if v_photo is not null and v_photo not like s.company_id::text || '/attendance/%/' || s.worker_id::text || '/%' then
    raise exception 'That photo does not belong to this clock out.';
  end if;
  perform public._att_close(v_id, 'worker', p_lat, p_lng, p_accuracy, v_photo, null, now());
  return public._att_shift_json(v_id);
end;
$$;

revoke all on function public.worker_clock_state(text), public.worker_clock_in(text, uuid, double precision, double precision, numeric, text),
  public.worker_clock_check(text, double precision, double precision, numeric), public.worker_clock_out(text, double precision, double precision, numeric, text),
  public.worker_clock_answer(text, double precision, double precision, numeric), public.worker_clock_missed(text) from public;
grant execute on function public.worker_clock_state(text), public.worker_clock_in(text, uuid, double precision, double precision, numeric, text),
  public.worker_clock_check(text, double precision, double precision, numeric), public.worker_clock_out(text, double precision, double precision, numeric, text),
  public.worker_clock_answer(text, double precision, double precision, numeric), public.worker_clock_missed(text)
  to anon, authenticated, service_role;

-- ── staff ───────────────────────────────────────────────────────────────────────────────────────────────
-- The caller's company when they are director, admin, supervisor or site user; else an error.
create or replace function public._att_staff_company()
returns uuid language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v uuid;
begin
  select up.company_id into v from public.user_profiles up
   where up.id = auth.uid() and up.role in ('director', 'admin', 'supervisor', 'site_user') and coalesce(up.status, 'active') = 'active';
  if v is null then raise exception 'Only a director, admin, supervisor or site user can do this.' using errcode = '42501'; end if;
  return v;
end;
$$;
revoke all on function public._att_staff_company() from public, anon, authenticated;

create or replace function public.attendance_set_site(p_project uuid, p_lat double precision, p_lng double precision, p_radius integer default null)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_staff_company();
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'No location from the phone.'; end if;
  if p_radius is not null and p_radius not between 50 and 5000 then raise exception 'The site distance must be between 50 and 5000 metres.'; end if;
  update public.projects set site_lat = p_lat, site_lng = p_lng, site_radius_m = coalesce(p_radius, site_radius_m)
   where id = p_project and company_id = v_co;
  if not found then raise exception 'Project not found.'; end if;
end;
$$;

create or replace function public.attendance_set_radius(p_project uuid, p_radius integer)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_staff_company();
begin
  if p_radius is null or p_radius not between 50 and 5000 then raise exception 'The site distance must be between 50 and 5000 metres.'; end if;
  update public.projects set site_radius_m = p_radius where id = p_project and company_id = v_co;
  if not found then raise exception 'Project not found.'; end if;
end;
$$;

create or replace function public.attendance_staff_clock_in(p_worker uuid, p_project uuid, p_lat double precision, p_lng double precision, p_accuracy numeric, p_photo_path text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_staff_company();
begin
  if not exists (select 1 from public.workers w where w.id = p_worker and w.company_id = v_co and coalesce(w.status, 'active') = 'active') then
    raise exception 'Worker not found.';
  end if;
  return public._att_open(v_co, p_worker, p_project, p_lat, p_lng, p_accuracy, nullif(btrim(p_photo_path), ''), auth.uid());
end;
$$;

create or replace function public.attendance_staff_clock_out(p_shift uuid, p_lat double precision, p_lng double precision, p_accuracy numeric, p_photo_path text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_staff_company(); s record; v_photo text := nullif(btrim(p_photo_path), '');
begin
  select * into s from public.attendance_shifts where id = p_shift and company_id = v_co;
  if not found then raise exception 'Shift not found.'; end if;
  if s.status <> 'open' then raise exception 'That worker is already clocked out.'; end if;
  if v_photo is not null and v_photo not like v_co::text || '/attendance/%/' || s.worker_id::text || '/%' then
    raise exception 'That photo does not belong to this clock out.';
  end if;
  perform public._att_close(p_shift, 'staff', p_lat, p_lng, p_accuracy, v_photo, auth.uid(), now());
  if nullif(btrim(p_note), '') is not null then update public.attendance_shifts set note = btrim(p_note) where id = p_shift; end if;
  return public._att_shift_json(p_shift);
end;
$$;

create or replace function public.attendance_close_stale()
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid;
begin
  select up.company_id into v_co from public.user_profiles up
   where up.id = auth.uid() and up.role in ('director', 'admin', 'supervisor', 'site_user', 'office_user');
  if v_co is null then return 0; end if;
  return public._att_close_stale(v_co);
end;
$$;

revoke all on function public.attendance_set_site(uuid, double precision, double precision, integer), public.attendance_set_radius(uuid, integer),
  public.attendance_staff_clock_in(uuid, uuid, double precision, double precision, numeric, text),
  public.attendance_staff_clock_out(uuid, double precision, double precision, numeric, text, text), public.attendance_close_stale() from public, anon;
grant execute on function public.attendance_set_site(uuid, double precision, double precision, integer), public.attendance_set_radius(uuid, integer),
  public.attendance_staff_clock_in(uuid, uuid, double precision, double precision, numeric, text),
  public.attendance_staff_clock_out(uuid, double precision, double precision, numeric, text, text), public.attendance_close_stale() to authenticated, service_role;

commit;
