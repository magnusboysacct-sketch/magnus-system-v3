-- =====================================================================
-- Clock in / clock out, step 2 - pictures of the work and voice notes - Magnus Boy's System
-- (run after 20260987000000_worker_clock_in.sql)
--
-- While clocked in (and up to 2 hours after the clock out) a worker can add pictures of the work done and short voice notes,
-- so nobody has to type. Clocking out asks for a picture first; a clock out with no picture is flagged 'no_work_photo'.
--   attendance_media: one row per picture / voice note: the shift, worker, project, day, where the phone was.
--     Files: private-files <company>/attendance/<yyyy-mm>/<worker>/work|voice/<random>, saved by the worker-portal-files
--     server function (a worker has no login). Supervisors add theirs straight to storage (same folder rule).
--   Read by director, admin, supervisor, site user, office user of the company (row-level security). Nobody writes it directly.
--   Worker (token): worker_clock_add_media; worker_clock_out and worker_clock_state redefined (picture counts, worker name).
--   Staff: attendance_staff_add_media.
-- The private-files bucket also accepts voice recordings (audio/webm, audio/mp4, audio/ogg, audio/mpeg, audio/aac).
-- Safe to run twice.
-- =====================================================================

begin;

do $$ begin
  if to_regclass('public.attendance_shifts') is null then
    raise exception 'Clock in step 1 (migration 20260987000000) is not installed. Nothing was changed.';
  end if;
end $$;

update storage.buckets
   set allowed_mime_types = (select array_agg(distinct m) from unnest(allowed_mime_types || array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac']) m)
 where id = 'private-files' and allowed_mime_types is not null
   and not (allowed_mime_types @> array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac']);

create table if not exists public.attendance_media (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  shift_id    uuid not null references public.attendance_shifts(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  work_date   date not null,
  kind        text not null check (kind in ('photo', 'voice')),
  path        text not null,
  seconds     integer,                 -- voice notes: how long
  lat         double precision,
  lng         double precision,
  added_by    uuid,                    -- a supervisor; null = the worker on their phone
  created_at  timestamptz not null default now()
);
create unique index if not exists attendance_media_path on public.attendance_media (path);
create index if not exists attendance_media_shift on public.attendance_media (shift_id);
create index if not exists attendance_media_project_day on public.attendance_media (project_id, work_date desc);

alter table public.attendance_media enable row level security;
revoke all on public.attendance_media from public, anon, authenticated;
grant select on public.attendance_media to authenticated;
drop policy if exists "Site staff read media" on public.attendance_media;
create policy "Site staff read media" on public.attendance_media for select to authenticated
  using (company_id in (select up.company_id from public.user_profiles up where up.id = auth.uid()
                         and up.role in ('director', 'admin', 'supervisor', 'site_user', 'office_user')));

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_hq_write_guard') then
    drop trigger if exists hq_write_guard on public.attendance_media;
    create trigger hq_write_guard before insert or update or delete on public.attendance_media for each row execute function public._hq_write_guard();
  end if;
end $$;

-- ── helper: add one picture / voice note to a shift ──────────────────────────────────────────────────────
-- The shift is the worker's open one, or the one closed in the last 2 hours (e.g. the phone clocked them out on leaving).
create or replace function public._att_add_media(p_company uuid, p_worker uuid, p_kind text, p_path text, p_seconds integer,
                                                 p_lat double precision, p_lng double precision, p_by uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record; v_n integer; v_folder text;
begin
  if p_kind not in ('photo', 'voice') then raise exception 'Unknown kind.'; end if;
  v_folder := case p_kind when 'photo' then 'work' else 'voice' end;
  if p_path is null or p_path not like p_company::text || '/attendance/%/' || p_worker::text || '/' || v_folder || '/%' then
    raise exception 'That file does not belong to this worker.';
  end if;
  select id, project_id, work_date into s from public.attendance_shifts
   where worker_id = p_worker and company_id = p_company
     and (status = 'open' or clock_out_at > now() - interval '2 hours')
   order by (status = 'open') desc, clock_out_at desc nulls first limit 1;
  if not found then raise exception 'Clock in first.'; end if;
  select count(*) into v_n from public.attendance_media where shift_id = s.id and kind = p_kind;
  if p_kind = 'photo' and v_n >= 12 then raise exception 'That is enough pictures for today.'; end if;
  if p_kind = 'voice' and v_n >= 6 then raise exception 'That is enough voice notes for today.'; end if;
  insert into public.attendance_media (company_id, shift_id, worker_id, project_id, work_date, kind, path, seconds, lat, lng, added_by)
  values (p_company, s.id, p_worker, s.project_id, s.work_date, p_kind, p_path,
          case when p_seconds between 0 and 600 then p_seconds end,
          case when p_lat between -90 and 90 then p_lat end, case when p_lng between -180 and 180 then p_lng end, p_by)
  on conflict (path) do nothing;
  -- a picture after the clock out takes the "no picture" warning away
  if p_kind = 'photo' then
    update public.attendance_shifts set flags = array_remove(flags, 'no_work_photo') where id = s.id and 'no_work_photo' = any(flags);
  end if;
  return jsonb_build_object('shift_id', s.id,
    'photos', (select count(*) from public.attendance_media where shift_id = s.id and kind = 'photo'),
    'voices', (select count(*) from public.attendance_media where shift_id = s.id and kind = 'voice'));
end;
$$;
revoke all on function public._att_add_media(uuid, uuid, text, text, integer, double precision, double precision, uuid) from public, anon, authenticated;

-- the shift as the worker's phone sees it, now with the picture / voice counts
create or replace function public._att_shift_json(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', s.id, 'project_id', s.project_id, 'project', pr.name, 'work_date', s.work_date, 'status', s.status,
           'clock_in_at', s.clock_in_at, 'clock_out_at', s.clock_out_at, 'out_method', s.out_method, 'in_distance_m', s.in_distance_m,
           'radius_m', s.site_radius_m, 'minutes_worked', s.minutes_worked, 'paid_until', s.paid_until, 'last_on_site_at', s.last_on_site_at,
           'off_site_since', s.first_off_site_at, 'flags', to_jsonb(s.flags),
           'photos', (select count(*) from public.attendance_media m where m.shift_id = s.id and m.kind = 'photo'),
           'voices', (select count(*) from public.attendance_media m where m.shift_id = s.id and m.kind = 'voice'))
    from public.attendance_shifts s left join public.projects pr on pr.id = s.project_id where s.id = p_shift
$$;
revoke all on function public._att_shift_json(uuid) from public, anon, authenticated;

-- ── worker ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.worker_clock_add_media(p_token text, p_kind text, p_path text, p_seconds integer, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare s record;
begin
  select * into s from public._worker_session(p_token) limit 1;
  if not found then raise exception 'Your session has ended. Sign in again.'; end if;
  return public._att_add_media(s.company_id, s.worker_id, p_kind, nullif(btrim(p_path), ''), p_seconds, p_lat, p_lng, null);
end;
$$;

-- clock out: as before, plus a 'no_work_photo' warning when no picture of the work was added
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
  if not exists (select 1 from public.attendance_media where shift_id = v_id and kind = 'photo') then
    update public.attendance_shifts set flags = array_append(flags, 'no_work_photo') where id = v_id and not ('no_work_photo' = any(flags));
  end if;
  return public._att_shift_json(v_id);
end;
$$;

-- the clock screen: as before, plus the worker's name (written on each picture)
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
    'worker_name', (select btrim(coalesce(w.first_name, '') || ' ' || coalesce(w.last_name, '')) from public.workers w where w.id = s.worker_id),
    'open', case when v_open is not null then public._att_shift_json(v_open) end,
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'site_set', pr.site_lat is not null) order by pr.name)
                            from public.projects pr where pr.company_id = s.company_id and coalesce(pr.status, 'active') in ('active', 'planning', 'on_hold')), '[]'),
    'last_project_id', (select project_id from public.attendance_shifts where worker_id = s.worker_id order by clock_in_at desc limit 1),
    'today', coalesce((select jsonb_agg(public._att_shift_json(x.id) order by x.clock_in_at)
                         from public.attendance_shifts x where x.worker_id = s.worker_id and x.work_date = public._att_today() and x.status = 'closed'), '[]'));
end;
$$;

revoke all on function public.worker_clock_add_media(text, text, text, integer, double precision, double precision) from public;
grant execute on function public.worker_clock_add_media(text, text, text, integer, double precision, double precision) to anon, authenticated, service_role;

-- ── staff (a supervisor adds a picture for a crew member) ────────────────────────────────────────────────
create or replace function public.attendance_staff_add_media(p_worker uuid, p_kind text, p_path text, p_seconds integer, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_staff_company();
begin
  if not exists (select 1 from public.workers w where w.id = p_worker and w.company_id = v_co) then raise exception 'Worker not found.'; end if;
  return public._att_add_media(v_co, p_worker, p_kind, nullif(btrim(p_path), ''), p_seconds, p_lat, p_lng, auth.uid());
end;
$$;
revoke all on function public.attendance_staff_add_media(uuid, text, text, integer, double precision, double precision) from public, anon;
grant execute on function public.attendance_staff_add_media(uuid, text, text, integer, double precision, double precision) to authenticated, service_role;

commit;
