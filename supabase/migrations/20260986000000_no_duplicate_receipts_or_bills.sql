-- =====================================================================
-- No duplicate receipts or bills
-- Magnus Boy's System
--
-- The same supplier document must be entered once. Numbers are compared ignoring spaces, dashes, dots, slashes and "#",
-- capitals, and leading zeros in the number part ("INV-0012" = "inv 12", "000123" = "123"). Supplier / vendor
-- names are compared ignoring "Ltd", "Limited", "Co", "Company", "The", punctuation and capitals.
--
--   * expenses.receipt_number (new) - the receipt / invoice number printed on it. expenses.vendor already existed.
--   * An expense with the same number from the same vendor as another expense, or as a supplier bill, is refused:
--     "already exists". Same for a bill with the same number from the same supplier (also catches "INV-001" vs
--     "INV 001", which the old check missed), or one already entered as an expense.
--   * find_duplicate_documents(vendor, number, amount, date, supplier, exclude): what already exists - exact (same number)
--     or possible (no number: same vendor, amount and date) - so the screens can warn while you type.
--   * Only when the number / vendor / supplier is set or changed: nothing already in the books is touched or re-checked.
-- Runs as the signed-in user (normal company access rules apply). Safe to run twice.
-- =====================================================================

alter table public.expenses add column if not exists receipt_number text;

create or replace function public._doc_no(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  -- letters and digits only, capitals, and no leading zeros in any run of digits ("INV-0012" = "INV 12", "000123" = "123")
  select case when x = '' then null else regexp_replace(x, '(^|[^0-9])0+([0-9])', '\1\2', 'g') end
    from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) x) s;
$$;

create or replace function public._vendor_key(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(regexp_replace(regexp_replace(lower(coalesce(p, '')), '\m(ltd|limited|co|company|inc|the|and)\M', ' ', 'g'), '[^a-z0-9]+', '', 'g'), '');
$$;

-- Two names are the same business: equal, or one contains the other (at least 4 letters).
create or replace function public._same_vendor(a text, b text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(public._vendor_key(a) = public._vendor_key(b)
         or (length(public._vendor_key(a)) >= 4 and length(public._vendor_key(b)) >= 4
             and (strpos(public._vendor_key(a), public._vendor_key(b)) > 0 or strpos(public._vendor_key(b), public._vendor_key(a)) > 0)), false);
$$;

create or replace function public.find_duplicate_documents(p_vendor text, p_number text, p_amount numeric default null, p_date date default null,
                                                           p_supplier uuid default null, p_exclude uuid default null)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_no   text := public._doc_no(p_number);
  v_name text := coalesce(nullif(trim(p_vendor), ''), (select supplier_name from public.suppliers where id = p_supplier));
  v_out  jsonb := '[]'::jsonb;
begin
  if v_company is null then return v_out; end if;
  if v_no is not null then
    select v_out || coalesce(jsonb_agg(jsonb_build_object('kind', 'expense', 'id', e.id, 'number', e.receipt_number, 'vendor', e.vendor,
             'date', e.expense_date, 'amount', e.amount, 'status', e.status, 'description', e.description, 'exact', true)), '[]'::jsonb)
      into v_out
      from public.expenses e
     where e.company_id = v_company and e.id is distinct from p_exclude and public._doc_no(e.receipt_number) = v_no
       and (e.vendor is null or v_name is null or public._same_vendor(e.vendor, v_name));
    select v_out || coalesce(jsonb_agg(jsonb_build_object('kind', 'bill', 'id', si.id, 'number', si.invoice_number, 'vendor', s.supplier_name,
             'date', si.invoice_date, 'amount', si.total_amount, 'status', si.status, 'exact', true)), '[]'::jsonb)
      into v_out
      from public.supplier_invoices si left join public.suppliers s on s.id = si.supplier_id
     where si.company_id = v_company and si.id is distinct from p_exclude and public._doc_no(si.invoice_number) = v_no
       and ((p_supplier is not null and si.supplier_id = p_supplier) or (v_name is not null and public._same_vendor(s.supplier_name, v_name)));
  elsif p_amount is not null and p_date is not null then
    -- No number: the same vendor (or none given), the same amount and the same day is probably the same receipt.
    select v_out || coalesce(jsonb_agg(jsonb_build_object('kind', 'expense', 'id', e.id, 'number', e.receipt_number, 'vendor', e.vendor,
             'date', e.expense_date, 'amount', e.amount, 'status', e.status, 'description', e.description, 'exact', false)), '[]'::jsonb)
      into v_out
      from public.expenses e
     where e.company_id = v_company and e.id is distinct from p_exclude and e.expense_date = p_date and round(e.amount, 2) = round(p_amount, 2)
       and (v_name is null or e.vendor is null or public._same_vendor(e.vendor, v_name));
  end if;
  return v_out;
end;
$$;

-- Expenses: refuse an exact duplicate (same number, same vendor) of an expense or a bill.
create or replace function public._expense_no_duplicate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_no text := public._doc_no(new.receipt_number);
  d record;
begin
  if v_no is null then return new; end if;
  if tg_op = 'UPDATE' and public._doc_no(old.receipt_number) is not distinct from v_no
     and old.vendor is not distinct from new.vendor then return new; end if;
  select e.expense_date, e.amount, e.vendor into d from public.expenses e
   where e.company_id = new.company_id and e.id <> new.id and public._doc_no(e.receipt_number) = v_no
     and (e.vendor is null or new.vendor is null or public._same_vendor(e.vendor, new.vendor))
   limit 1;
  if found then
    raise exception 'Receipt % % already exists (an expense of % on %). It was not entered again.',
      new.receipt_number, coalesce('from ' || coalesce(d.vendor, new.vendor), ''), to_char(d.amount, 'FM999,999,990.00'), to_char(d.expense_date, 'DD Mon YYYY');
  end if;
  if new.vendor is not null then
    select si.invoice_number, si.invoice_date, s.supplier_name into d
      from public.supplier_invoices si join public.suppliers s on s.id = si.supplier_id
     where si.company_id = new.company_id and public._doc_no(si.invoice_number) = v_no and public._same_vendor(s.supplier_name, new.vendor)
     limit 1;
    if found then
      raise exception '% from % already exists as a supplier bill (Payables, %). Pay that bill instead of entering it as an expense.',
        new.receipt_number, d.supplier_name, to_char(d.invoice_date, 'DD Mon YYYY');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists expense_no_duplicate on public.expenses;
create trigger expense_no_duplicate
  before insert or update of receipt_number, vendor on public.expenses
  for each row execute function public._expense_no_duplicate();

-- Bills: refuse the same number from the same supplier (spaces / dashes ignored), or one already entered as an expense.
create or replace function public._bill_no_duplicate()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_no   text := public._doc_no(new.invoice_number);
  v_name text;
  d      record;
begin
  if v_no is null then return new; end if;
  if tg_op = 'UPDATE' and public._doc_no(old.invoice_number) is not distinct from v_no
     and old.supplier_id is not distinct from new.supplier_id then return new; end if;
  select supplier_name into v_name from public.suppliers where id = new.supplier_id;
  select si.invoice_number, si.invoice_date, si.total_amount into d from public.supplier_invoices si
   where si.company_id = new.company_id and si.id <> new.id and si.supplier_id is not distinct from new.supplier_id
     and public._doc_no(si.invoice_number) = v_no
   limit 1;
  if found then
    raise exception 'Bill % from % already exists (entered as % on %, %). It was not entered again.',
      new.invoice_number, coalesce(v_name, 'this supplier'), d.invoice_number, to_char(d.invoice_date, 'DD Mon YYYY'), to_char(d.total_amount, 'FM999,999,990.00');
  end if;
  if v_name is not null then
    select e.expense_date, e.amount into d from public.expenses e
     where e.company_id = new.company_id and public._doc_no(e.receipt_number) = v_no and e.vendor is not null and public._same_vendor(e.vendor, v_name)
     limit 1;
    if found then
      raise exception '% from % is already entered as an expense (% on %). Delete that expense first if it should be a bill.',
        new.invoice_number, v_name, to_char(d.amount, 'FM999,999,990.00'), to_char(d.expense_date, 'DD Mon YYYY');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bill_no_duplicate on public.supplier_invoices;
create trigger bill_no_duplicate
  before insert or update of invoice_number, supplier_id on public.supplier_invoices
  for each row execute function public._bill_no_duplicate();

grant execute on function public._doc_no(text) to authenticated;
grant execute on function public._vendor_key(text) to authenticated;
grant execute on function public._same_vendor(text, text) to authenticated;
grant execute on function public.find_duplicate_documents(text, text, numeric, date, uuid, uuid) to authenticated;
