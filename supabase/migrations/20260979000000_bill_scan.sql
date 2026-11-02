-- =====================================================================
-- Scan a bill: the picture is kept with the bill, in the monthly receipts folder; supplier or contractor
-- Magnus Boy's System
--
--   * supplier_invoices.bill_file_path - the photo of the bill in private-files, filed in the same monthly folder as
--     expense receipts: <company>/receipts/<year>/<month>/... (finance files: only people with full finance access, or
--     whoever uploaded it, can open it).
--   * suppliers.supplier_type - 'supplier' (sells materials, rents equipment...) or 'contractor' (does the work:
--     subcontractor, mason, workman). Suppliers made from the Workers list are contractors.
--   * supplier_for_worker(): same as 20260978, and marks the record as a contractor.
-- Runs as the signed-in user (normal company access rules apply). Safe to run twice.
-- =====================================================================

alter table public.supplier_invoices add column if not exists bill_file_path text;
alter table public.suppliers add column if not exists supplier_type text not null default 'supplier'
  check (supplier_type in ('supplier', 'contractor'));
update public.suppliers set supplier_type = 'contractor' where worker_id is not null and supplier_type <> 'contractor';

-- The bill picture must be in this company's receipts folder.
create or replace function public._bill_file_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.bill_file_path is not null and (tg_op = 'INSERT' or new.bill_file_path is distinct from old.bill_file_path)
     and new.bill_file_path not like new.company_id::text || '/receipts/%' then
    raise exception 'The bill picture is not in the right folder. Please add it again.';
  end if;
  return new;
end;
$$;

drop trigger if exists bill_file_guard on public.supplier_invoices;
create trigger bill_file_guard
  before insert or update of bill_file_path on public.supplier_invoices
  for each row execute function public._bill_file_guard();

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
    update public.suppliers set is_active = true, supplier_type = 'contractor' where id = v_id and (is_active is false or supplier_type <> 'contractor');
    return v_id;
  end if;

  v_name := trim(concat_ws(' ', nullif(trim(w.first_name), ''), nullif(trim(w.last_name), '')));
  if v_name = '' then raise exception 'This worker has no name.'; end if;

  -- A supplier with the same name, not linked to anyone yet: link it.
  select id into v_id from public.suppliers
   where company_id = v_company and worker_id is null and lower(supplier_name) = lower(v_name)
   limit 1;
  if v_id is not null then
    update public.suppliers set worker_id = w.id, is_active = true, supplier_type = 'contractor',
           phone = coalesce(phone, w.phone), address = coalesce(address, w.address), parish = coalesce(parish, w.parish)
     where id = v_id;
    return v_id;
  end if;

  -- Same name already used by someone else: keep them apart.
  if exists (select 1 from public.suppliers where company_id = v_company and lower(supplier_name) = lower(v_name)) then
    v_name := v_name || ' (' || coalesce(nullif(w.employee_id, ''), left(w.id::text, 6)) || ')';
  end if;

  insert into public.suppliers (company_id, supplier_name, phone, email, address, parish, worker_id, notes, is_active, supplier_type)
  values (v_company, v_name, w.phone, w.email, w.address, w.parish, w.id,
          case when w.worker_type = 'subcontractor' then 'Subcontractor (from Workers)' else 'Worker (from Workers)' end, true, 'contractor')
  returning id into v_id;
  return v_id;
end;
$$;
