-- =====================================================================
-- Parish on workers and suppliers; workers / subcontractors can be chosen on a bill
-- Magnus Boy's System
--
--   * workers.parish, suppliers.parish - chosen from the 14 parishes of Jamaica in the app.
--   * suppliers.worker_id - a supplier record made for a worker or subcontractor, so a bill can be "from" them.
--   * supplier_for_worker(worker) - returns that supplier record, linking one with the same name or making it the
--     first time. Used by New bill when a worker is chosen.
-- Runs as the signed-in user (normal company access rules apply). Safe to run twice.
-- =====================================================================

alter table public.workers add column if not exists parish text;
-- workers has column-level access (20260944): a new column needs its own grant.
grant select (parish), insert (parish), update (parish) on public.workers to authenticated;
alter table public.suppliers add column if not exists parish text;
alter table public.suppliers add column if not exists worker_id uuid references public.workers(id) on delete set null;
create unique index if not exists suppliers_worker_id_unique on public.suppliers(worker_id) where worker_id is not null;

create or replace function public.supplier_for_worker(p_worker uuid)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  w         record;
  v_name    text;
  v_id      uuid;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  -- Only columns every staff member may read (bank / tax fields are restricted).
  select id, first_name, last_name, phone, email, address, parish, worker_type, employee_id into w
    from public.workers where id = p_worker and company_id = v_company;
  if not found then raise exception 'Worker not found.'; end if;

  select id into v_id from public.suppliers where worker_id = w.id;
  if v_id is not null then
    update public.suppliers set is_active = true where id = v_id and is_active is false;
    return v_id;
  end if;

  v_name := trim(concat_ws(' ', nullif(trim(w.first_name), ''), nullif(trim(w.last_name), '')));
  if v_name = '' then raise exception 'This worker has no name.'; end if;

  -- A supplier with the same name, not linked to anyone yet: link it.
  select id into v_id from public.suppliers
   where company_id = v_company and worker_id is null and lower(supplier_name) = lower(v_name)
   limit 1;
  if v_id is not null then
    update public.suppliers set worker_id = w.id, is_active = true,
           phone = coalesce(phone, w.phone), address = coalesce(address, w.address), parish = coalesce(parish, w.parish)
     where id = v_id;
    return v_id;
  end if;

  -- Same name already used by someone else: keep them apart.
  if exists (select 1 from public.suppliers where company_id = v_company and lower(supplier_name) = lower(v_name)) then
    v_name := v_name || ' (' || coalesce(nullif(w.employee_id, ''), left(w.id::text, 6)) || ')';
  end if;

  insert into public.suppliers (company_id, supplier_name, phone, email, address, parish, worker_id, notes, is_active)
  values (v_company, v_name, w.phone, w.email, w.address, w.parish, w.id,
          case when w.worker_type = 'subcontractor' then 'Subcontractor (from Workers)' else 'Worker (from Workers)' end, true)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.supplier_for_worker(uuid) to authenticated;
