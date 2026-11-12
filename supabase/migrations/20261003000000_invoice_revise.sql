-- =====================================================================
-- 20261003000000_invoice_revise.sql
-- Change the lines of an invoice (more work from the client on the same job), and add what the BOQ has that is not billed yet.
--
--   * client_invoice_line_items.source_boq_section_item_id - the BOQ item a line came from (so the system knows what is
--     billed and what is left). Lines made before this have none; they are matched by the item's name.
--   * client_invoices.revision / revised_at / revision_note - a SENT invoice that is changed becomes "Revised invoice, Rev N"
--     (the printout says so, to send the client the new copy). A draft changes freely and stays Rev 0.
--   * invoice_save_lines(invoice, lines, tax_rate, note): replaces the lines and works out subtotal, tax, total, balance
--     and status again in one step. The books follow by themselves (invoice_to_books reverses the old figure and posts
--     the new one). Refused for a paid or cancelled invoice (extra work then goes on a new invoice of the same project)
--     and when the new total would be less than what the client already paid.
--     Director, admin, estimator, office user or accountant of the company only.
--   * invoice_boq_unbilled(boq): every item of that BOQ with its quantity, rate, and how much of it is already on the
--     project's invoices (not cancelled). What is left can be added to an invoice.
-- Runs as the signed-in user (normal company access rules apply). Safe to run twice.
-- =====================================================================

begin;

alter table public.client_invoice_line_items add column if not exists source_boq_section_item_id uuid references public.boq_section_items(id) on delete set null;
create index if not exists client_invoice_line_items_source_boq_idx on public.client_invoice_line_items (source_boq_section_item_id) where source_boq_section_item_id is not null;
alter table public.client_invoices add column if not exists revision      integer not null default 0;
alter table public.client_invoices add column if not exists revised_at    timestamptz;
alter table public.client_invoices add column if not exists revision_note text;

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
    insert into public.client_invoice_line_items (invoice_id, company_id, line_number, description, quantity, unit, rate, amount, notes, line_name, source_boq_section_item_id)
    values (inv.id, inv.company_id, n, btrim(l ->> 'description'), round((l ->> 'quantity')::numeric, 2), coalesce(nullif(btrim(l ->> 'unit'), ''), 'ea'),
            round((l ->> 'rate')::numeric, 2), round(round((l ->> 'quantity')::numeric, 2) * round((l ->> 'rate')::numeric, 2), 2),
            nullif(btrim(l ->> 'notes'), ''), nullif(btrim(l ->> 'line_name'), ''), nullif(l ->> 'source_boq_section_item_id', '')::uuid);
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

-- What the BOQ has, and how much of each item is already on this project's invoices (not cancelled).
create or replace function public.invoice_boq_unbilled(p_boq uuid)
returns table (item_id uuid, section_title text, item_name text, description text, unit text, line_name text,
               boq_qty numeric, rate numeric, billed_qty numeric, sort_key bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  with h as (select bh.id, bh.project_id from public.boq_headers bh where bh.id = p_boq),
  items as (
    select i.id, s.title as section_title, i.item_name, i.description, mu.name as unit, i.line_name,
           coalesce(i.qty, 0)::numeric as boq_qty, coalesce(i.rate, 0)::numeric as rate,
           (coalesce(s.sort_order, 0)::bigint * 100000 + coalesce(i.sort_order, 0)) as sort_key
      from public.boq_sections s
      join public.boq_section_items i on i.section_id = s.id
      left join public.master_units mu on mu.id = i.unit_id
     where s.boq_id = p_boq
  ),
  lines as (
    select li.description, li.quantity, li.source_boq_section_item_id
      from public.client_invoice_line_items li
      join public.client_invoices ci on ci.id = li.invoice_id
     where ci.project_id = (select project_id from h) and coalesce(ci.status, '') <> 'cancelled'
  )
  select it.id, it.section_title, it.item_name, it.description, it.unit, it.line_name, it.boq_qty, it.rate,
         coalesce((select sum(ln.quantity) from lines ln
                    where ln.source_boq_section_item_id = it.id
                       or (ln.source_boq_section_item_id is distinct from it.id
                           and lower(btrim(ln.description)) = lower(btrim(coalesce(it.item_name, ''))) and btrim(coalesce(it.item_name, '')) <> '')), 0) as billed_qty,
         it.sort_key
    from items it
   order by it.sort_key;
$$;

revoke all on function public.invoice_save_lines(uuid, jsonb, numeric, text) from public, anon;
grant execute on function public.invoice_save_lines(uuid, jsonb, numeric, text) to authenticated;
revoke all on function public.invoice_boq_unbilled(uuid) from public, anon;
grant execute on function public.invoice_boq_unbilled(uuid) to authenticated;

commit;
