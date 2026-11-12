-- =====================================================================
-- 20261005000000_billable_bills.sql
-- Supplier / contractor BILLS paid for a client, billed back to the client on an invoice (the same as receipts, 20261004000000).
--
--   * supplier_invoices.billable ("Bill this to the client") and bill_markup_percent (optional handling %).
--   * client_invoice_line_items.source_bill_id - the bill a line bills back. A bill is "billed" while a line of a
--     not-cancelled invoice points at it.
--   * bill_set_billable(bill, on, markup): tick / untick a bill (it needs a project). Director, admin, estimator,
--     office user or accountant of the company.
--   * billable_bills_to_bill(project): the project's ticked bills not billed yet (not disputed), with their items and tax.
--   * invoice_save_lines: the same as 20261004000000, now also keeping source_bill_id (only a bill of the same company).
--   * The books do not change: the bill stays a cost of the job, the invoice is income.
-- Runs as the signed-in user (normal company access rules apply). Safe to run twice.
-- =====================================================================

begin;

alter table public.supplier_invoices add column if not exists billable            boolean not null default false;
alter table public.supplier_invoices add column if not exists bill_markup_percent numeric(6,2) not null default 0;
alter table public.client_invoice_line_items add column if not exists source_bill_id uuid references public.supplier_invoices(id) on delete set null;
create index if not exists client_invoice_line_items_source_bill_idx on public.client_invoice_line_items (source_bill_id) where source_bill_id is not null;

create or replace function public.invoice_save_lines(p_invoice uuid, p_lines jsonb, p_tax_rate numeric default null, p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  inv       public.client_invoices%rowtype;
  l         jsonb;
  n         int := 0;
  v_qty     numeric;
  v_rate    numeric;
  v_sub     numeric := 0;
  v_taxr    numeric;
  v_tax     numeric;
  v_total   numeric;
  v_paid    numeric;
  v_bal     numeric;
  v_status  text;
  v_today   date := (now() at time zone 'America/Jamaica')::date;
begin
  if v_role is null or v_role not in ('director', 'admin', 'estimator', 'office_user', 'accountant') then
    raise exception 'Only a director, admin, estimator, office user or accountant can change an invoice.';
  end if;
  select * into inv from public.client_invoices where id = p_invoice and company_id = v_company for update;
  if inv.id is null then raise exception 'Invoice not found.'; end if;
  if inv.status = 'paid' then raise exception 'This invoice is fully paid, so it is not changed. Put the extra work on a new invoice for the same project.'; end if;
  if inv.status = 'cancelled' then raise exception 'This invoice is cancelled.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'An invoice needs at least one line.'; end if;

  -- check every line first, nothing is written until all are right
  for l in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    if coalesce(btrim(l ->> 'description'), '') = '' then raise exception 'Line %: type what it is.', n; end if;
    v_qty := nullif(l ->> 'quantity', '')::numeric; v_rate := nullif(l ->> 'rate', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Line % (%): the quantity must be more than 0.', n, l ->> 'description'; end if;
    if v_rate is null or v_rate < 0 then raise exception 'Line % (%): type the rate.', n, l ->> 'description'; end if;
    v_sub := v_sub + round(round(v_qty, 2) * round(v_rate, 2), 2);
  end loop;

  v_taxr  := coalesce(p_tax_rate, inv.tax_rate, 0);
  if v_taxr < 0 or v_taxr > 100 then raise exception 'The tax rate must be between 0 and 100.'; end if;
  v_sub   := round(v_sub, 2);
  v_tax   := round(v_sub * v_taxr / 100, 2);
  v_total := round(v_sub + v_tax, 2);
  v_paid  := coalesce(inv.amount_paid, 0);
  if v_total < v_paid then
    raise exception 'The client already paid % on this invoice, so the new total (%) can''t be less than that.', to_char(v_paid, 'FM999,999,990.00'), to_char(v_total, 'FM999,999,990.00');
  end if;
  v_bal := round(v_total - v_paid, 2);
  v_status := case when inv.status = 'draft' then 'draft'
                   when v_bal <= 0 then 'paid'
                   when v_paid > 0 then 'partial'
                   when inv.due_date is not null and inv.due_date < v_today then 'overdue'
                   else 'sent' end;

  delete from public.client_invoice_line_items where invoice_id = inv.id;
  n := 0;
  for l in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    insert into public.client_invoice_line_items (invoice_id, company_id, line_number, description, quantity, unit, rate, amount, notes, line_name, source_boq_section_item_id, source_expense_id, source_bill_id)
    values (inv.id, inv.company_id, n, btrim(l ->> 'description'), round((l ->> 'quantity')::numeric, 2), coalesce(nullif(btrim(l ->> 'unit'), ''), 'ea'),
            round((l ->> 'rate')::numeric, 2), round(round((l ->> 'quantity')::numeric, 2) * round((l ->> 'rate')::numeric, 2), 2),
            nullif(btrim(l ->> 'notes'), ''), nullif(btrim(l ->> 'line_name'), ''), nullif(l ->> 'source_boq_section_item_id', '')::uuid,
            (select x.id from public.expenses x where x.id = nullif(l ->> 'source_expense_id', '')::uuid and x.company_id = inv.company_id),
            (select sb.id from public.supplier_invoices sb where sb.id = nullif(l ->> 'source_bill_id', '')::uuid and sb.company_id = inv.company_id));
  end loop;

  update public.client_invoices
     set subtotal = v_sub, tax_rate = v_taxr, tax_amount = v_tax, total_amount = v_total, balance_due = v_bal, status = v_status,
         paid_date = case when v_status = 'paid' then coalesce(paid_date, v_today) else null end,
         revision = case when inv.status = 'draft' then revision else revision + 1 end,
         revised_at = case when inv.status = 'draft' then revised_at else now() end,
         revision_note = case when inv.status = 'draft' then revision_note else nullif(btrim(coalesce(p_note, '')), '') end,
         updated_at = now()
   where id = inv.id;

  return jsonb_build_object('subtotal', v_sub, 'tax_amount', v_tax, 'total', v_total, 'balance_due', v_bal, 'status', v_status,
                            'revision', case when inv.status = 'draft' then inv.revision else inv.revision + 1 end);
end;
$$;

create or replace function public.bill_set_billable(p_bill uuid, p_on boolean, p_markup numeric default 0)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  b         public.supplier_invoices%rowtype;
begin
  if v_role is null or v_role not in ('director', 'admin', 'estimator', 'office_user', 'accountant') then
    raise exception 'Only a director, admin, estimator, office user or accountant can change this.';
  end if;
  select * into b from public.supplier_invoices where id = p_bill and company_id = v_company;
  if b.id is null then raise exception 'Bill not found.'; end if;
  if p_on and b.project_id is null then raise exception 'Set the project on this bill first, so it shows on that project''s invoice.'; end if;
  if coalesce(p_markup, 0) < 0 or coalesce(p_markup, 0) > 1000 then raise exception 'The markup must be between 0 and 1000 %%.'; end if;
  update public.supplier_invoices set billable = coalesce(p_on, false), bill_markup_percent = coalesce(p_markup, 0) where id = b.id;
end;
$$;

create or replace function public.billable_bills_to_bill(p_project uuid)
returns table (id uuid, invoice_number text, invoice_date date, supplier text, total_amount numeric, tax_amount numeric, items jsonb, bill_markup_percent numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  select b.id, b.invoice_number, b.invoice_date, s.supplier_name, b.total_amount, coalesce(b.tax_amount, 0),
         coalesce((select jsonb_agg(jsonb_build_object('description', li.item_name, 'quantity', li.quantity, 'unit', li.unit,
                                                       'unit_price', li.unit_cost, 'amount', li.total_amount) order by li.line_no)
                     from public.supplier_invoice_line_items li where li.supplier_invoice_id = b.id), '[]'::jsonb),
         b.bill_markup_percent
    from public.supplier_invoices b
    left join public.suppliers s on s.id = b.supplier_id
   where b.project_id = p_project and b.billable and coalesce(b.status, '') not in ('disputed', 'cancelled', 'void')
     and not exists (select 1 from public.client_invoice_line_items li join public.client_invoices ci on ci.id = li.invoice_id
                      where li.source_bill_id = b.id and coalesce(ci.status, '') <> 'cancelled')
   order by b.invoice_date, b.created_at;
$$;

revoke all on function public.invoice_save_lines(uuid, jsonb, numeric, text) from public, anon;
grant execute on function public.invoice_save_lines(uuid, jsonb, numeric, text) to authenticated;
revoke all on function public.bill_set_billable(uuid, boolean, numeric) from public, anon;
grant execute on function public.bill_set_billable(uuid, boolean, numeric) to authenticated;
revoke all on function public.billable_bills_to_bill(uuid) from public, anon;
grant execute on function public.billable_bills_to_bill(uuid) to authenticated;

commit;
