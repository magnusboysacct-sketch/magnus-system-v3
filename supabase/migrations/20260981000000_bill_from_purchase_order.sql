-- =====================================================================
-- Banking Step 4c - a bill from a Purchase Order (three-way match: ordered / received / billed)
-- Magnus Boy's System
--
-- The standard way: when the supplier's bill comes for a PO, each line is checked against
--   * the PO price, and
--   * what was RECEIVED and not billed yet (received on the PO, less what earlier bills already charged).
-- A bill that matches can be approved straight away. A bill that does not (price differs, more than received,
-- nothing received yet) is saved waiting for approval with each line flagged, so a director checks it first.
--
--   * po_lines_to_bill(po) - each PO line: ordered, received, already billed, left to bill, PO price.
--   * create_bill_from_po(po, bill, lines, approve) - the bill and its lines in one step, linked to the PO and its
--     lines (supplier_invoices.purchase_order_id, supplier_invoice_line_items.purchase_order_item_id), with the
--     match result on each line (match_status, po_quantity, po_unit_cost, received_quantity, match_notes) and on
--     the bill (three_way_match_status matched / discrepancy, po_matched, receiving_matched).
--   * The PO's supplier is used; a PO with only a typed supplier name is linked to (or adds) that supplier.
--   * The old automatic matcher triggers on bill lines (20260315172743) are switched off: they checked PO statuses
--     Magnus no longer uses, could approve a bill by themselves (skipping who may approve) and wrote line values the
--     table refuses. Nothing in the app called them; the matching is now done here. Disputed bills don't count as billed.
-- Runs as the signed-in user (normal company access rules and every ledger check apply). Safe to run twice.
-- =====================================================================

drop trigger if exists auto_match_invoice_on_line_insert on public.supplier_invoice_line_items;
drop trigger if exists auto_match_invoice_on_line_update on public.supplier_invoice_line_items;

create or replace function public.po_lines_to_bill(p_po uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
begin
  if not exists (select 1 from public.purchase_orders where id = p_po and company_id = v_company) then
    raise exception 'Purchase order not found.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'material_name', i.material_name, 'description', i.description, 'unit', i.unit,
             'ordered', i.quantity, 'received', coalesce(i.delivered_qty, 0), 'billed', coalesce(b.billed, 0),
             'left_to_bill', greatest(coalesce(i.delivered_qty, 0) - coalesce(b.billed, 0), 0), 'rate', i.unit_rate)
           order by i.created_at, i.id)
      from public.purchase_order_items i
      left join lateral (
        select sum(l.quantity) billed
          from public.supplier_invoice_line_items l join public.supplier_invoices s on s.id = l.supplier_invoice_id
         where l.purchase_order_item_id = i.id and s.status <> 'disputed') b on true
     where i.purchase_order_id = p_po), '[]'::jsonb);
end;
$$;

-- p_bill:  {invoice_number, invoice_date, due_date, tax_amount, retention_percent, notes}
-- p_lines: [{po_item_id, quantity, unit_cost, chart_account_id}]
create or replace function public.create_bill_from_po(p_po uuid, p_bill jsonb, p_lines jsonb, p_approve boolean default false)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  po        public.purchase_orders%rowtype;
  v_supplier uuid;
  v_id      uuid;
  v_sub     numeric := 0;
  v_tax     numeric := round(greatest(coalesce((p_bill ->> 'tax_amount')::numeric, 0), 0), 2);
  v_retp    numeric := round(greatest(coalesce((p_bill ->> 'retention_percent')::numeric, 0), 0), 2);
  v_num     text := trim(coalesce(p_bill ->> 'invoice_number', ''));
  v_date    date := coalesce((p_bill ->> 'invoice_date')::date, current_date);
  l         jsonb;
  i         record;
  n         int := 0;
  v_qty     numeric;
  v_rate    numeric;
  v_left    numeric;
  v_status  text;
  v_note    text;
  v_price_ok boolean := true;
  v_recv_ok  boolean := true;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  select * into po from public.purchase_orders where id = p_po and company_id = v_company for update;
  if po.id is null then raise exception 'Purchase order not found.'; end if;
  if po.status in ('draft', 'cancelled') then raise exception 'Purchase order % is %. Issue it first.', po.po_number, po.status; end if;
  if v_num = '' then raise exception 'Type the bill number (the supplier''s invoice number).'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Choose at least one line to bill.'; end if;
  if v_retp > 50 then raise exception 'Retention above 50%% is not allowed.'; end if;
  if p_approve and v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can approve bills.'; end if;

  -- The supplier: the PO's, else the one with the PO's supplier name, else add it.
  v_supplier := po.supplier_id;
  if v_supplier is null then
    select id into v_supplier from public.suppliers
     where company_id = v_company and lower(supplier_name) = lower(trim(po.supplier_name)) limit 1;
    if v_supplier is null then
      if trim(coalesce(po.supplier_name, '')) = '' then raise exception 'This PO has no supplier. Open the PO and set the supplier first.'; end if;
      insert into public.suppliers (company_id, supplier_name, is_active) values (v_company, trim(po.supplier_name), true)
      returning id into v_supplier;
    end if;
  end if;
  if exists (select 1 from public.supplier_invoices where company_id = v_company and supplier_id = v_supplier
              and lower(invoice_number) = lower(v_num)) then
    raise exception 'This supplier''s bill % is already entered.', v_num;
  end if;

  insert into public.supplier_invoices (company_id, supplier_id, project_id, purchase_order_id, invoice_number, invoice_date, due_date,
                                        subtotal, tax_amount, shipping_amount, total_amount, amount_paid, balance_due, status,
                                        retention_percent, retention_amount, notes, created_by)
  values (v_company, v_supplier, po.project_id, po.id, v_num, v_date,
          coalesce((p_bill ->> 'due_date')::date, v_date + 30), 0, v_tax, 0, v_tax, 0, v_tax, 'pending', v_retp, 0,
          nullif(trim(coalesce(p_bill ->> 'notes', '')), ''), auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    select it.*, coalesce(it.delivered_qty, 0) recv,
           coalesce((select sum(x.quantity) from public.supplier_invoice_line_items x join public.supplier_invoices s on s.id = x.supplier_invoice_id
                      where x.purchase_order_item_id = it.id and s.status <> 'disputed' and s.id <> v_id), 0) billed
      into i
      from public.purchase_order_items it
     where it.id = (l ->> 'po_item_id')::uuid and it.purchase_order_id = po.id;
    if not found then raise exception 'A line is not on purchase order %.', po.po_number; end if;
    v_qty  := round(coalesce((l ->> 'quantity')::numeric, 0), 4);
    v_rate := round(coalesce((l ->> 'unit_cost')::numeric, i.unit_rate), 4);
    if v_qty <= 0 then raise exception 'Type the quantity billed for "%".', i.material_name; end if;
    if v_rate < 0 then raise exception 'The price for "%" can''t be below zero.', i.material_name; end if;
    if (l ->> 'chart_account_id') is null then raise exception 'Choose the cost account for "%".', i.material_name; end if;

    v_left := i.recv - i.billed;
    v_status := 'matched'; v_note := null;
    if i.recv <= 0 then
      v_status := 'not_received'; v_note := 'Nothing received on the PO yet.'; v_recv_ok := false;
    elsif v_qty > v_left + 0.0001 then
      v_status := 'quantity_mismatch';
      v_note := 'Billed ' || trim_scale(v_qty) || ' but only ' || trim_scale(greatest(v_left, 0)) || ' received and not billed yet.';
      v_recv_ok := false;
    end if;
    if abs(v_rate - i.unit_rate) > 0.005 then
      if v_status = 'matched' then v_status := 'price_mismatch'; end if;
      v_note := concat_ws(' ', v_note, 'Price ' || trim_scale(v_rate) || ' but the PO says ' || trim_scale(i.unit_rate::numeric) || '.');
      v_price_ok := false;
    end if;

    n := n + 1;
    insert into public.supplier_invoice_line_items (supplier_invoice_id, purchase_order_item_id, line_no, item_name, description, unit,
                                                    quantity, unit_cost, total_amount, chart_account_id,
                                                    po_quantity, po_unit_cost, received_quantity, match_status, match_notes)
    values (v_id, i.id, n, left(i.material_name, 200), i.description, coalesce(nullif(i.unit, ''), 'each'),
            v_qty, v_rate, round(v_qty * v_rate, 2), (l ->> 'chart_account_id')::uuid,
            i.quantity, i.unit_rate, i.recv, v_status, v_note);
    v_sub := v_sub + round(v_qty * v_rate, 2);
  end loop;

  if p_approve and not (v_price_ok and v_recv_ok) then
    raise exception 'This bill does not match the PO or what was received (see the flags on the lines). Save it waiting for approval; a director can approve it after checking.';
  end if;

  update public.supplier_invoices
     set subtotal = v_sub, total_amount = v_sub + v_tax, balance_due = v_sub + v_tax,
         retention_amount = round(v_sub * v_retp / 100, 2),
         po_matched = v_price_ok, receiving_matched = v_recv_ok,
         three_way_match_status = case when v_price_ok and v_recv_ok then 'matched' else 'discrepancy' end,
         status = case when p_approve then 'approved' else status end,
         approved_by = case when p_approve then auth.uid() else approved_by end,
         approved_at = case when p_approve then now() else approved_at end,
         updated_at = now()
   where id = v_id;
  return v_id;
end;
$$;

grant execute on function public.po_lines_to_bill(uuid) to authenticated;
grant execute on function public.create_bill_from_po(uuid, jsonb, jsonb, boolean) to authenticated;
