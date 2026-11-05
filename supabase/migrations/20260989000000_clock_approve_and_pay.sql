-- =====================================================================
-- Clock in / clock out, step 3 - approve the days, then pay them as a field payment - Magnus Boy's System
-- (run after 20260988000000_clock_work_photos.sql)
--
-- 1. workers.pay_type can now be 'daily' (pay_rate = the day rate), as well as hourly / salary / contract.
-- 2. Each finished shift waits for a supervisor: approved (with the minutes to pay, which may be changed, and a note) or rejected.
--    Only a director, admin or supervisor approves. A shift still open, or already paid, can't be changed.
-- 3. "Pay" opens the normal field payment (the worker signs as usual) filled in from the approved shifts:
--      hourly: hours x rate;  daily: a full day for 5 hours or more on that date, a half day under 5 hours, x the day rate.
--    When the payment is saved, attendance_mark_paid links the shifts to it (field_payment_id), so they can't be paid twice.
--    Deleting that field payment frees the shifts again (on delete set null).
-- Nothing here creates a payment by itself. Safe to run twice.
-- =====================================================================

begin;

do $$ begin
  if to_regclass('public.attendance_media') is null then
    raise exception 'Clock in step 2 (migration 20260988000000) is not installed. Nothing was changed.';
  end if;
end $$;

-- 1. daily pay type
do $$ declare c record; begin
  for c in select conname from pg_constraint
            where conrelid = 'public.workers'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%pay_type%'
              and pg_get_constraintdef(oid) not ilike '%daily%' loop
    execute format('alter table public.workers drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.workers'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%pay_type%') then
    alter table public.workers add constraint workers_pay_type_check check (pay_type in ('hourly', 'daily', 'salary', 'contract'));
  end if;
end $$;

-- 2. approval on the shift
alter table public.attendance_shifts add column if not exists approval        text not null default 'pending';
alter table public.attendance_shifts add column if not exists approved_minutes integer;
alter table public.attendance_shifts add column if not exists approved_by     uuid;
alter table public.attendance_shifts add column if not exists approved_at     timestamptz;
alter table public.attendance_shifts add column if not exists approval_note   text;
alter table public.attendance_shifts add column if not exists field_payment_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_shifts_approval_check') then
    alter table public.attendance_shifts add constraint attendance_shifts_approval_check check (approval in ('pending', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_shifts_approved_minutes_check') then
    alter table public.attendance_shifts add constraint attendance_shifts_approved_minutes_check check (approved_minutes is null or approved_minutes between 0 and 1440);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_shifts_field_payment_id_fkey') then
    alter table public.attendance_shifts add constraint attendance_shifts_field_payment_id_fkey foreign key (field_payment_id) references public.field_payments(id) on delete set null;
  end if;
end $$;
create index if not exists attendance_shifts_to_pay on public.attendance_shifts (company_id, worker_id) where approval = 'approved' and field_payment_id is null;
create index if not exists attendance_shifts_payment on public.attendance_shifts (field_payment_id) where field_payment_id is not null;

-- who may approve: director, admin, supervisor
create or replace function public._att_approver_company()
returns uuid language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v uuid;
begin
  select up.company_id into v from public.user_profiles up
   where up.id = auth.uid() and up.role in ('director', 'admin', 'supervisor') and coalesce(up.status, 'active') = 'active';
  if v is null then raise exception 'Only a director, admin or supervisor can approve time.' using errcode = '42501'; end if;
  return v;
end;
$$;
revoke all on function public._att_approver_company() from public, anon, authenticated;

-- Approve shifts. p_minutes (one shift only) changes the time to pay; otherwise the counted time (minutes_worked) is used.
create or replace function public.attendance_approve(p_shift_ids uuid[], p_minutes integer default null, p_note text default null)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_approver_company(); v_n integer;
begin
  if p_shift_ids is null or cardinality(p_shift_ids) = 0 then return 0; end if;
  if p_minutes is not null and (cardinality(p_shift_ids) <> 1 or p_minutes not between 0 and 1440) then
    raise exception 'Change the time on one shift at a time (0 to 24 hours).';
  end if;
  if exists (select 1 from public.attendance_shifts where id = any(p_shift_ids) and company_id = v_co and status = 'open') then
    raise exception 'A worker is still clocked in. Clock them out first.';
  end if;
  if exists (select 1 from public.attendance_shifts where id = any(p_shift_ids) and company_id = v_co and field_payment_id is not null) then
    raise exception 'That time is already paid.';
  end if;
  update public.attendance_shifts
     set approval = 'approved', approved_minutes = coalesce(p_minutes, minutes_worked, 0), approved_by = auth.uid(), approved_at = now(),
         approval_note = coalesce(nullif(btrim(p_note), ''), approval_note)
   where id = any(p_shift_ids) and company_id = v_co and status = 'closed' and field_payment_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.attendance_reject(p_shift_ids uuid[], p_note text)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_approver_company(); v_n integer;
begin
  if nullif(btrim(p_note), '') is null then raise exception 'Say why the time is not paid.'; end if;
  if exists (select 1 from public.attendance_shifts where id = any(p_shift_ids) and company_id = v_co and field_payment_id is not null) then
    raise exception 'That time is already paid.';
  end if;
  update public.attendance_shifts
     set approval = 'rejected', approved_minutes = 0, approved_by = auth.uid(), approved_at = now(), approval_note = btrim(p_note)
   where id = any(p_shift_ids) and company_id = v_co and status = 'closed' and field_payment_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- back to "waiting" (a mistake), while not paid
create or replace function public.attendance_unapprove(p_shift_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_approver_company(); v_n integer;
begin
  if exists (select 1 from public.attendance_shifts where id = any(p_shift_ids) and company_id = v_co and field_payment_id is not null) then
    raise exception 'That time is already paid. Delete the field payment first.';
  end if;
  update public.attendance_shifts set approval = 'pending', approved_minutes = null, approved_by = null, approved_at = null
   where id = any(p_shift_ids) and company_id = v_co and field_payment_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- After the field payment is saved: link the approved shifts to it. Director, admin, supervisor or site user (the people who
-- make field payments). The payment must be this company's and, when it names a worker, the same worker.
create or replace function public.attendance_mark_paid(p_shift_ids uuid[], p_payment_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_co uuid := public._att_staff_company(); fp record; v_n integer;
begin
  select id, company_id, worker_id into fp from public.field_payments where id = p_payment_id;
  if not found or fp.company_id <> v_co then raise exception 'Field payment not found.'; end if;
  if exists (select 1 from public.attendance_shifts where id = any(p_shift_ids) and company_id = v_co
               and (approval <> 'approved' or field_payment_id is not null or (fp.worker_id is not null and worker_id <> fp.worker_id))) then
    raise exception 'Some of that time is not approved, is for another worker, or is already paid.';
  end if;
  update public.attendance_shifts set field_payment_id = p_payment_id where id = any(p_shift_ids) and company_id = v_co;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.attendance_approve(uuid[], integer, text), public.attendance_reject(uuid[], text), public.attendance_unapprove(uuid[]),
  public.attendance_mark_paid(uuid[], uuid) from public, anon;
grant execute on function public.attendance_approve(uuid[], integer, text), public.attendance_reject(uuid[], text), public.attendance_unapprove(uuid[]),
  public.attendance_mark_paid(uuid[], uuid) to authenticated, service_role;

commit;
