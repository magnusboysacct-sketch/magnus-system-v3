-- =====================================================================
-- Clock in / clock out, step 4 - works with no signal - Magnus Boy's System
-- (run after 20260989000000_clock_approve_and_pay.sql)
--
-- On a site with no signal the phone keeps the clock in, site checks, pictures, voice notes and clock out, each with the time it
-- really happened, and sends them in order when the signal comes back. The worker functions now take that time (p_at):
--   * it must be within the last 12 hours and not in the future (2 minutes allowed for a phone clock a little ahead);
--   * a clock in / out sent more than 5 minutes late is flagged 'sent_late' so the supervisor knows it was kept on the phone;
--   * a site check older than the last one is ignored ('old').
-- Without p_at everything works exactly as before (the time is "now"). Safe to run twice.
-- =====================================================================

begin;

do $$ begin
  if to_regprocedure('public.attendance_approve(uuid[], integer, text)') is null then
    raise exception 'Clock in step 3 (migration 20260989000000) is not installed. Nothing was changed.';
  end if;
end $$;

-- the time to use: now, or the phone's time when it was kept offline
create or replace function public._att_when(p_at timestamptz)
returns timestamptz language plpgsql stable set search_path = public, pg_temp
as $$
begin
  if p_at is null then return now(); end if;
  if p_at > now() + interval '2 minutes' then raise exception 'The phone''s clock is ahead. Set the right time on the phone.'; end if;
  if p_at < now() - interval '12 hours' then raise exception 'That was kept on the phone too long (more than 12 hours). Tell the supervisor.'; end if;
  return least(p_at, now());
end;
$$;
revoke all on function public._att_when(timestamptz) from public, anon, authenticated;

-- ── internal: open a shift / record a reading at a given time ───────────────────────────────────────────
drop function if exists public._att_open(uuid, uuid, uuid, double precision, double precision, numeric, text, uuid);
create or replace function public._att_open(p_company uuid, p_worker uuid, p_project uuid, p_lat double precision, p_lng double precision, p_acc numeric,
                                            p_photo text, p_by uuid, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid; pr record; j record; v_flags text[] := '{}'; v_at timestamptz := public._att_when(p_at);
begin
  perform public._att_close_stale(p_company);
  if exists (select 1 from public.attendance_shifts where worker_id = p_worker and status = 'open') then
    raise exception 'Already clocked in. Clock out first.';
  end if;
  if exists (select 1 from public.attendance_shifts where worker_id = p_worker and clock_out_at > v_at) then
    raise exception 'That clock in is earlier than the last clock out.';
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
  if now() - v_at > interval '5 minutes' then v_flags := array_append(v_flags, 'sent_late'); end if;
  insert into public.attendance_shifts (company_id, worker_id, project_id, work_date, clock_in_at, in_lat, in_lng, in_accuracy_m, in_distance_m, in_photo_path,
                                        site_radius_m, flags, clocked_in_by, last_check_at)
  values (p_company, p_worker, p_project, ((v_at at time zone 'UTC') - interval '5 hours')::date, v_at, p_lat, p_lng, p_acc, j.distance_m, p_photo,
          j.radius_m, v_flags, p_by, v_at)
  returning id into v_id;
  insert into public.attendance_checks (company_id, shift_id, checked_at, kind, lat, lng, accuracy_m, distance_m, on_site)
  values (p_company, v_id, v_at, 'clock_in', p_lat, p_lng, p_acc, j.distance_m, j.on_site);
  if j.on_site is true then update public.attendance_shifts set last_on_site_at = clock_in_at where id = v_id; end if;
  return jsonb_build_object('shift_id', v_id, 'distance_m', j.distance_m, 'radius_m', j.radius_m,
                            'status', case when j.on_site then 'on_site' when j.on_site = false then 'off_site' when p_lat is null then 'no_location' else 'unsure' end,
                            'site_set', pr.site_lat is not null);
end;
$$;

drop function if exists public._att_reading(uuid, text, double precision, double precision, numeric);
create or replace function public._att_reading(p_shift uuid, p_kind text, p_lat double precision, p_lng double precision, p_acc numeric, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; j record; v_flags text[]; v_at timestamptz := public._att_when(p_at);
begin
  select * into s from public.attendance_shifts where id = p_shift and status = 'open' for update;
  if not found then return jsonb_build_object('status', 'no_shift'); end if;
  if v_at < s.clock_in_at or (p_at is not null and s.last_check_at is not null and v_at < s.last_check_at) then
    return jsonb_build_object('status', 'old');                        -- an older reading sent late: the newer one already counts
  end if;
  select * into j from public._att_judge(s.project_id, p_lat, p_lng, p_acc);
  insert into public.attendance_checks (company_id, shift_id, checked_at, kind, lat, lng, accuracy_m, distance_m, on_site)
  values (s.company_id, s.id, v_at, p_kind, p_lat, p_lng, p_acc, j.distance_m, j.on_site);
  v_flags := s.flags;
  if j.on_site is true then
    if s.last_on_site_at is not null and v_at - s.last_on_site_at > interval '3 hours' then v_flags := array_append(v_flags, 'long_gap'); end if;
    update public.attendance_shifts set last_check_at = v_at, last_on_site_at = v_at, first_off_site_at = null,
           flags = (select coalesce(array_agg(distinct f), '{}') from unnest(v_flags) f) where id = s.id;
    return jsonb_build_object('status', 'on_site', 'distance_m', j.distance_m, 'radius_m', j.radius_m);
  elsif j.on_site is false then
    if p_kind = 'check' and s.first_off_site_at is not null and v_at - s.first_off_site_at >= interval '3 minutes' then
      update public.attendance_shifts set last_check_at = v_at where id = s.id;
      perform public._att_close(s.id, 'left_site', null, null, null, null, null, v_at);
      return jsonb_build_object('status', 'clocked_out', 'distance_m', j.distance_m, 'radius_m', j.radius_m);
    end if;
    update public.attendance_shifts set last_check_at = v_at, first_off_site_at = coalesce(first_off_site_at, v_at) where id = s.id;
    return jsonb_build_object('status', 'off_site', 'distance_m', j.distance_m, 'radius_m', j.radius_m);
  else
    update public.attendance_shifts set last_check_at = v_at where id = s.id;
    return jsonb_build_object('status', case when p_lat is null then 'no_location' else 'unsure' end, 'distance_m', j.distance_m, 'radius_m', j.radius_m);
  end if;
end;
$$;
revoke all on function public._att_open(uuid, uuid, uuid, double precision, double precision, numeric, text, uuid, timestamptz),
  public._att_reading(uuid, text, double precision, double precision, numeric, timestamptz) from public, anon, authenticated;

-- ── the worker functions, now with p_at ──────────────────────────────────────────────────────────────────
drop function if exists public.worker_clock_in(text, uuid, double precision, double precision, numeric, text);
create or replace function public.worker_clock_in(p_token text, p_project uuid, p_lat double precision, p_lng double precision, p_accuracy numeric, p_photo_path text,
                                                  p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then raise exception 'Your session has ended. Sign in again.'; end if;
  return public._att_open(s.company_id, s.worker_id, p_project, p_lat, p_lng, p_accuracy, nullif(btrim(p_photo_path), ''), null, p_at);
end;
$$;

drop function if exists public.worker_clock_check(text, double precision, double precision, numeric);
create or replace function public.worker_clock_check(p_token text, p_lat double precision, p_lng double precision, p_accuracy numeric, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; v_shift record;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then return jsonb_build_object('status', 'no_session'); end if;
  select id, last_check_at into v_shift from public.attendance_shifts where worker_id = s.worker_id and status = 'open';
  if not found then return jsonb_build_object('status', 'no_shift'); end if;
  if p_at is null and v_shift.last_check_at > now() - interval '45 seconds' then return jsonb_build_object('status', 'too_soon'); end if;   -- no flooding
  return public._att_reading(v_shift.id, 'check', p_lat, p_lng, p_accuracy, p_at);
end;
$$;

drop function if exists public.worker_clock_answer(text, double precision, double precision, numeric);
create or replace function public.worker_clock_answer(p_token text, p_lat double precision, p_lng double precision, p_accuracy numeric, p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; v_id uuid;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then return jsonb_build_object('status', 'no_session'); end if;
  select id into v_id from public.attendance_shifts where worker_id = s.worker_id and status = 'open';
  if v_id is null then return jsonb_build_object('status', 'no_shift'); end if;
  return public._att_reading(v_id, 'answer', p_lat, p_lng, p_accuracy, p_at);
end;
$$;

drop function if exists public.worker_clock_out(text, double precision, double precision, numeric, text);
create or replace function public.worker_clock_out(p_token text, p_lat double precision, p_lng double precision, p_accuracy numeric, p_photo_path text,
                                                   p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; sh record; v_photo text := nullif(btrim(p_photo_path), ''); v_at timestamptz := public._att_when(p_at);
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then raise exception 'Your session has ended. Sign in again.'; end if;
  select id, clock_in_at into sh from public.attendance_shifts where worker_id = s.worker_id and status = 'open';
  if sh.id is null then raise exception 'You are not clocked in.'; end if;
  if v_photo is not null and v_photo not like s.company_id::text || '/attendance/%/' || s.worker_id::text || '/%' then
    raise exception 'That photo does not belong to this clock out.';
  end if;
  perform public._att_close(sh.id, 'worker', p_lat, p_lng, p_accuracy, v_photo, null, greatest(v_at, sh.clock_in_at));
  if not exists (select 1 from public.attendance_media where shift_id = sh.id and kind = 'photo') then
    update public.attendance_shifts set flags = array_append(flags, 'no_work_photo') where id = sh.id and not ('no_work_photo' = any(flags));
  end if;
  if now() - v_at > interval '5 minutes' then
    update public.attendance_shifts set flags = array_append(flags, 'sent_late') where id = sh.id and not ('sent_late' = any(flags));
  end if;
  return public._att_shift_json(sh.id);
end;
$$;

drop function if exists public.worker_clock_add_media(text, text, text, integer, double precision, double precision);
create or replace function public.worker_clock_add_media(p_token text, p_kind text, p_path text, p_seconds integer, p_lat double precision, p_lng double precision,
                                                         p_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; v_r jsonb; v_at timestamptz := public._att_when(p_at);
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then raise exception 'Your session has ended. Sign in again.'; end if;
  v_r := public._att_add_media(s.company_id, s.worker_id, p_kind, nullif(btrim(p_path), ''), p_seconds, p_lat, p_lng, null);
  if p_at is not null then update public.attendance_media set created_at = v_at where path = nullif(btrim(p_path), ''); end if;
  return v_r;
end;
$$;

revoke all on function public.worker_clock_in(text, uuid, double precision, double precision, numeric, text, timestamptz),
  public.worker_clock_check(text, double precision, double precision, numeric, timestamptz),
  public.worker_clock_answer(text, double precision, double precision, numeric, timestamptz),
  public.worker_clock_out(text, double precision, double precision, numeric, text, timestamptz),
  public.worker_clock_add_media(text, text, text, integer, double precision, double precision, timestamptz) from public;
grant execute on function public.worker_clock_in(text, uuid, double precision, double precision, numeric, text, timestamptz),
  public.worker_clock_check(text, double precision, double precision, numeric, timestamptz),
  public.worker_clock_answer(text, double precision, double precision, numeric, timestamptz),
  public.worker_clock_out(text, double precision, double precision, numeric, text, timestamptz),
  public.worker_clock_add_media(text, text, text, integer, double precision, double precision, timestamptz) to anon, authenticated, service_role;

commit;
