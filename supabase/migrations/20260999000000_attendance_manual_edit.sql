-- =====================================================================
-- Clock in: enter time by hand, change it, delete it - Magnus Boy's System
-- (run after 20260990000000_clock_offline.sql)
--
-- Workers' own clock (the phone) always uses the real day and time. Only a director, admin or supervisor can now:
--   attendance_manual_shift  put in a worker's time for any past day (or today): project, time in, time out, and why it was
--                            entered by hand. It is a finished shift, flagged 'manual', waiting for approval like any other.
--   attendance_edit_shift    change a finished shift's day / time in / time out / project, with a reason. Flagged 'edited'; if
--                            it was approved it goes back to waiting (the hours changed). Every change is kept in edit_log.
--   attendance_delete_shift  delete a finished shift, with a reason. A copy is kept in attendance_deleted (who, when, why, the
--                            whole shift), so a deleted shift can always be looked up.
-- Never on a shift that is paid (its field payment must be deleted first) or still open (clock the worker out first).
-- Shifts of the same worker can't overlap. Times can't be in the future.
-- Safe to run twice.
-- =====================================================================

begin;

do $$ begin
  if to_regprocedure('public._att_when(timestamptz)') is null then
    raise exception 'Clock in step 4 (migration 20260990000000) is not installed. Nothing was changed.';
  end if;
end $$;

alter table public.attendance_shifts add column if not exists edit_log jsonb not null default '[]'::jsonb;

create table if not exists public.attendance_deleted (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  shift_id    uuid not null,
  worker_id   uuid,
  work_date   date,
  shift       jsonb not null,
  reason      text not null,
  deleted_by  uuid default auth.uid(),
  deleted_at  timestamptz not null default now()
);
create index if not exists attendance_deleted_company on public.attendance_deleted (company_id, deleted_at desc);
alter table public.attendance_deleted enable row level security;
revoke all on public.attendance_deleted from public, anon, authenticated;
grant select on public.attendance_deleted to authenticated;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_hq_write_guard') then
    drop trigger if exists hq_write_guard on public.attendance_deleted;
    create trigger hq_write_guard before insert or update or delete on public.attendance_deleted for each row execute function public._hq_write_guard();
  end if;
end $$;
drop policy if exists "approvers read deleted shifts" on public.attendance_deleted;
create policy "approvers read deleted shifts" on public.attendance_deleted for select to authenticated
  using (company_id in (select up.company_id from public.user_profiles up where up.id = auth.uid() and up.role in ('director', 'admin', 'supervisor')));

-- the day of a time, in Jamaica
create or replace function public._att_day(p_at timestamptz)
returns date language sql immutable set search_path = public, pg_temp
as $$ select ((p_at at time zone 'UTC') - interval '5 hours')::date $$;

-- checks shared by "by hand" and "change"
create or replace function public._att_check_times(p_worker uuid, p_in timestamptz, p_out timestamptz, p_skip uuid)
returns void language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if p_in is null or p_out is null then raise exception 'Put the time in and the time out.'; end if;
  if p_out <= p_in then raise exception 'The time out must be after the time in.'; end if;
  if p_out - p_in > interval '24 hours' then raise exception 'One shift can''t be longer than 24 hours.'; end if;
  if p_out > now() + interval '2 minutes' then raise exception 'That time is in the future.'; end if;
  if p_in < now() - interval '400 days' then raise exception 'That is more than a year back.'; end if;
  if exists (select 1 from public.attendance_shifts s
              where s.worker_id = p_worker and s.id is distinct from p_skip
                and s.clock_in_at < p_out and coalesce(s.clock_out_at, now()) > p_in) then
    raise exception 'This worker already has time on the clock between those times.';
  end if;
end;
$$;
revoke all on function public._att_day(timestamptz), public._att_check_times(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- ── put in time by hand ───────────────────────────────────────────────────────────────────────────────
create or replace function public.attendance_manual_shift(p_worker uuid, p_project uuid, p_in timestamptz, p_out timestamptz, p_note text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_approver_company(); pr record; v_id uuid;
begin
  if nullif(btrim(p_note), '') is null then raise exception 'Say why the time is entered by hand (for example: forgot to clock in).'; end if;
  if not exists (select 1 from public.workers w where w.id = p_worker and w.company_id = v_co) then raise exception 'Worker not found.'; end if;
  select id, site_radius_m into pr from public.projects where id = p_project and company_id = v_co;
  if not found then raise exception 'Pick one of the company''s projects.'; end if;
  perform public._att_check_times(p_worker, p_in, p_out, null);
  insert into public.attendance_shifts (company_id, worker_id, project_id, work_date, status, clock_in_at, clock_out_at, out_method,
                                        site_radius_m, paid_until, minutes_worked, flags, clocked_in_by, clocked_out_by, note, last_check_at, edit_log)
  values (v_co, p_worker, p_project, public._att_day(p_in), 'closed', p_in, p_out, 'staff',
          coalesce(pr.site_radius_m, 300), p_out, floor(extract(epoch from (p_out - p_in)) / 60)::integer, array['manual'], auth.uid(), auth.uid(),
          btrim(p_note), p_out,
          jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'what', 'entered by hand', 'in', p_in, 'out', p_out, 'note', btrim(p_note))))
  returning id into v_id;
  return v_id;
end;
$$;

-- ── change a finished shift ───────────────────────────────────────────────────────────────────────────
create or replace function public.attendance_edit_shift(p_shift uuid, p_project uuid, p_in timestamptz, p_out timestamptz, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_approver_company(); s record;
begin
  if nullif(btrim(p_note), '') is null then raise exception 'Say why the time is changed.'; end if;
  select * into s from public.attendance_shifts where id = p_shift and company_id = v_co for update;
  if not found then raise exception 'Shift not found.'; end if;
  if s.status = 'open' then raise exception 'The worker is still clocked in. Clock them out first.'; end if;
  if s.field_payment_id is not null then raise exception 'That time is already paid. Delete the field payment first.'; end if;
  if not exists (select 1 from public.projects where id = p_project and company_id = v_co) then raise exception 'Pick one of the company''s projects.'; end if;
  perform public._att_check_times(s.worker_id, p_in, p_out, s.id);
  update public.attendance_shifts set
    project_id = p_project, work_date = public._att_day(p_in), clock_in_at = p_in, clock_out_at = p_out, paid_until = p_out,
    minutes_worked = floor(extract(epoch from (p_out - p_in)) / 60)::integer,
    flags = (select coalesce(array_agg(distinct f), '{}') from unnest(array_append(flags, 'edited')) f),
    approval = case when approval = 'approved' then 'pending' else approval end,
    approved_minutes = case when approval = 'approved' then null else approved_minutes end,
    approved_by = case when approval = 'approved' then null else approved_by end,
    approved_at = case when approval = 'approved' then null else approved_at end,
    edit_log = edit_log || jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'what', 'changed',
                 'from_in', s.clock_in_at, 'from_out', s.clock_out_at, 'from_project', s.project_id, 'in', p_in, 'out', p_out, 'note', btrim(p_note)))
  where id = s.id;
end;
$$;

-- ── delete a finished shift (a copy is kept) ──────────────────────────────────────────────────────────
create or replace function public.attendance_delete_shift(p_shift uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_approver_company(); s record;
begin
  if nullif(btrim(p_reason), '') is null then raise exception 'Say why it is deleted.'; end if;
  select * into s from public.attendance_shifts where id = p_shift and company_id = v_co for update;
  if not found then raise exception 'Shift not found.'; end if;
  if s.status = 'open' then raise exception 'The worker is still clocked in. Clock them out first.'; end if;
  if s.field_payment_id is not null then raise exception 'That time is already paid. Delete the field payment first.'; end if;
  insert into public.attendance_deleted (company_id, shift_id, worker_id, work_date, shift, reason)
  values (s.company_id, s.id, s.worker_id, s.work_date, to_jsonb(s), btrim(p_reason));
  delete from public.attendance_shifts where id = s.id;
end;
$$;

revoke all on function public.attendance_manual_shift(uuid, uuid, timestamptz, timestamptz, text),
  public.attendance_edit_shift(uuid, uuid, timestamptz, timestamptz, text), public.attendance_delete_shift(uuid, text) from public, anon;
grant execute on function public.attendance_manual_shift(uuid, uuid, timestamptz, timestamptz, text),
  public.attendance_edit_shift(uuid, uuid, timestamptz, timestamptz, text), public.attendance_delete_shift(uuid, text) to authenticated, service_role;

commit;
