-- =====================================================================
-- Banking Step 4a - supplier bills (incl. subcontractor bills with retention) go into the books
-- Magnus Boy's System
--
-- The standard way: a bill is a cost you owe. When it is APPROVED:
--     DEBIT  each line's cost account (on the bill's project)       line amounts
--     DEBIT  GCT Input Credit (GCT you can claim back)              GCT
--     CREDIT Supplier Payables (you owe the supplier)               total - retention
--     CREDIT Subcontractor Retention Payable (held back)            retention
-- Pending (waiting for approval) is not in the books; disputed takes it out; changing an approved bill re-posts it.
--
--   * supplier_invoice_line_items.chart_account_id - the cost account of each line.
--   * supplier_invoices.retention_percent / retention_amount, gl_transaction_id, ledger_note, ledger_signature.
--   * create_bill(header jsonb, lines jsonb, approve boolean): the bill and its lines in ONE step.
--   * approve_bill(id) / dispute_bill(id, reason) - director, admin or office user.
--   * set_books_start_date(): unpaid approved bills from before the start date come in once as opening payables
--     (DEBIT Opening Balance Equity, CREDIT Payables); the date also locks once bills after it are in the books.
--   * Same safety as invoices: only entries made by this rule are ever changed (imported Zoho bills are left alone);
--     saving a bill is never blocked by the books (problems go to ledger_note).
--   * Fix for invoices (20260972) and payments (20260973) too: when a change to something already in the books fails,
--     the old entry stays in the books (its reversal is undone with the error) - the row now keeps pointing at it and
--     says "Your last change is not in the books yet", instead of losing track of it.
-- Runs as the signed-in user (normal company access rules and every ledger check apply).
-- Safe to run twice.
-- =====================================================================

alter table public.supplier_invoice_line_items add column if not exists chart_account_id uuid references public.chart_of_accounts(id) on delete set null;
alter table public.supplier_invoices add column if not exists retention_percent numeric(5,2) not null default 0;
alter table public.supplier_invoices add column if not exists retention_amount numeric(12,2) not null default 0;
alter table public.supplier_invoices add column if not exists gl_transaction_id uuid references public.gl_transactions(id) on delete set null;
alter table public.supplier_invoices add column if not exists ledger_note text;
alter table public.supplier_invoices add column if not exists ledger_signature text;

create or replace function public._find_ap_account(p_company uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.chart_of_accounts
   where company_id = p_company and type = 'liability' and is_active is not false
     and (subtype = 'accounts_payable' or name ~* '(supplier|accounts) payable')
     and name !~* '(retention|retainage|subcontractor|payroll|tax|gct)'
   order by (name ~* '^supplier payables?$') desc, (name ~* '^accounts payable$') desc, code
   limit 1;
$$;

create or replace function public._find_gct_input(p_company uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.chart_of_accounts
   where company_id = p_company and type = 'asset' and is_active is not false
     and name ~* '(gct input|input gct|gct recoverable|gct receivable)'
   order by code limit 1;
$$;

create or replace function public._find_retention_payable(p_company uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.chart_of_accounts
   where company_id = p_company and type = 'liability' and is_active is not false
     and name ~* '(retention|retainage) payable'
   order by code limit 1;
$$;

create or replace function public._bill_to_books()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r        public.supplier_invoices%rowtype;
  v_start  date;
  v_live   public.gl_transactions%rowtype;
  v_should boolean;
  v_sig    text;
  v_lines  jsonb := '[]'::jsonb;
  v_sum    numeric;
  v_ret    numeric;
  v_ap     uuid;
  v_gct    uuid;
  v_rp     uuid;
  v_sup    text;
  l        record;
  v_first  boolean := true;
begin
  if tg_op = 'DELETE' then
    begin
      if old.gl_transaction_id is not null then
        perform public._gl_reverse(old.gl_transaction_id, 'Bill ' || old.invoice_number || ' deleted');
      end if;
    exception when others then null;
    end;
    return old;
  end if;

  r := new;
  v_start := public._books_start(r.company_id);
  if r.gl_transaction_id is not null then
    select * into v_live from public.gl_transactions where id = r.gl_transaction_id and status = 'posted';
  end if;
  if v_start is null then
    if v_live.id is null then new.ledger_note := 'Not in the books: set the books start date (Bank Accounts).'; end if;
    return new;
  end if;
  if v_live.id is not null and v_live.reference = 'Opening payable' then return new; end if;
  if v_live.id is null and exists (select 1 from public.gl_transactions g
                                    where g.source_type = 'supplier_invoice' and g.source_id = r.id and g.status = 'posted') then
    new.ledger_note := 'Already in the books (entered another way).';
    return new;
  end if;

  v_ret := round(greatest(coalesce(r.retention_amount, 0), 0), 2);
  v_should := r.invoice_date >= v_start and r.status in ('approved', 'partial', 'paid') and coalesce(r.total_amount, 0) > 0;
  v_sig := case when v_should then concat_ws('|', r.total_amount, r.tax_amount, r.shipping_amount, v_ret, r.invoice_date, r.project_id,
                   (select md5(coalesce(string_agg(coalesce(chart_account_id::text, '-') || ':' || total_amount, ',' order by line_no, id), ''))
                      from public.supplier_invoice_line_items where supplier_invoice_id = r.id)) end;

  if v_should and v_live.id is not null and r.ledger_signature is not distinct from v_sig then
    new.ledger_note := null;   -- already in the books exactly like this
    return new;
  end if;
  if not v_should and v_live.id is null then
    new.ledger_note := case
      when r.status = 'pending' then 'Not in the books yet: waiting for approval.'
      when r.status = 'disputed' then 'Disputed: not in the books.'
      when r.invoice_date < v_start then 'Before the books start date.'
      else null end;
    new.gl_transaction_id := null;
    new.ledger_signature := null;
    return new;
  end if;

  begin
    if v_live.id is not null then
      perform public._gl_reverse(v_live.id, 'Bill ' || r.invoice_number || case when v_should then ' changed' else ' ' || r.status end);
    end if;
    new.gl_transaction_id := null;
    new.ledger_signature := null;

    if v_should then
      select supplier_name into v_sup from public.suppliers where id = r.supplier_id;
      v_sum := 0;
      for l in select li.*, a.company_id a_company, a.type a_type, a.is_active a_active, a.code a_code, a.name a_name
                 from public.supplier_invoice_line_items li left join public.chart_of_accounts a on a.id = li.chart_account_id
                where li.supplier_invoice_id = r.id order by li.line_no, li.id loop
        if l.chart_account_id is null then raise exception 'Line "%" has no cost account.', l.item_name; end if;
        if l.a_company is distinct from r.company_id or l.a_active is false or l.a_type not in ('expense', 'asset') then
          raise exception 'Line "%": % % is not an active cost (expense) or asset account.', l.item_name, l.a_code, l.a_name;
        end if;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', l.chart_account_id,
          'debit', l.total_amount + case when v_first then coalesce(r.shipping_amount, 0) else 0 end, 'credit', 0,
          'project_id', r.project_id, 'description', left(l.item_name || coalesce(' - ' || v_sup, ''), 300)));
        v_sum := v_sum + l.total_amount;
        v_first := false;
      end loop;
      if v_first then raise exception 'The bill has no lines.'; end if;
      if round(v_sum + coalesce(r.tax_amount, 0) + coalesce(r.shipping_amount, 0), 2) <> round(r.total_amount, 2) then
        raise exception 'The lines (%) plus GCT (%) do not add up to the bill total (%).', v_sum, coalesce(r.tax_amount, 0), r.total_amount;
      end if;
      if coalesce(r.tax_amount, 0) > 0 then
        v_gct := public._find_gct_input(r.company_id);
        if v_gct is null then raise exception 'This bill has GCT but there is no "GCT Input Credit" account in your chart.'; end if;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_gct, 'debit', r.tax_amount, 'credit', 0,
          'project_id', null, 'description', 'GCT on bill ' || r.invoice_number));
      end if;
      v_ap := public._find_ap_account(r.company_id);
      if v_ap is null then raise exception 'No Supplier Payables / Accounts Payable account in your chart.'; end if;
      if v_ret > 0 then
        if v_ret > r.total_amount then raise exception 'Retention is more than the bill.'; end if;
        v_rp := public._find_retention_payable(r.company_id);
        if v_rp is null then raise exception 'This bill holds retention but there is no "Retention Payable" account in your chart.'; end if;
      end if;
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_ap, 'debit', 0, 'credit', r.total_amount - v_ret, 'project_id', r.project_id,
                           'description', 'Bill ' || r.invoice_number || coalesce(' - ' || v_sup, '')),
        jsonb_build_object('account_id', v_rp, 'debit', 0, 'credit', v_ret, 'project_id', r.project_id,
                           'description', 'Retention held on bill ' || r.invoice_number));

      new.gl_transaction_id := public._gl_post(r.company_id, r.invoice_date, 'supplier_invoice', r.id, 'Bill ' || r.invoice_number,
        'Bill ' || r.invoice_number || coalesce(' - ' || v_sup, ''), v_lines);
      new.ledger_signature := v_sig;
      new.ledger_note := null;
    else
      new.ledger_note := case when r.status = 'disputed' then 'Disputed: taken out of the books.' else 'Taken out of the books.' end;
    end if;
  exception when others then
    -- Never block saving. The error also undid the reversal above, so an entry that was already in the books is
    -- STILL in the books: keep pointing at it, and say the latest change isn't in yet.
    if v_live.id is not null then
      new.gl_transaction_id := v_live.id;
      new.ledger_signature := r.ledger_signature;
      new.ledger_note := left('Your last change is not in the books yet: ' || sqlerrm, 500);
    else
      new.ledger_note := left('Not in the books: ' || sqlerrm, 500);
      new.gl_transaction_id := null;
      new.ledger_signature := null;
    end if;
  end;
  return new;
end;
$$;

drop trigger if exists bill_to_books on public.supplier_invoices;
create trigger bill_to_books
  before insert or update or delete on public.supplier_invoices
  for each row execute function public._bill_to_books();

-- A line changed on an approved bill: let the bill rule re-post it.
create or replace function public._bill_line_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.supplier_invoices set updated_at = now()
   where id = coalesce(new.supplier_invoice_id, old.supplier_invoice_id) and status in ('approved', 'partial', 'paid')
     and pg_trigger_depth() < 3;
  return coalesce(new, old);
end;
$$;

drop trigger if exists bill_line_touch on public.supplier_invoice_line_items;
create trigger bill_line_touch
  after insert or update or delete on public.supplier_invoice_line_items
  for each row execute function public._bill_line_touch();

-- One step: the bill and its lines.
-- p_bill: {supplier_id, project_id, invoice_number, invoice_date, due_date, tax_amount, retention_percent, notes}
-- p_lines: [{item_name, description, chart_account_id, amount}]
create or replace function public.create_bill(p_bill jsonb, p_lines jsonb, p_approve boolean default false)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  v_id   uuid;
  v_sub  numeric := 0;
  v_tax  numeric := round(greatest(coalesce((p_bill ->> 'tax_amount')::numeric, 0), 0), 2);
  v_retp numeric := round(greatest(coalesce((p_bill ->> 'retention_percent')::numeric, 0), 0), 2);
  v_total numeric;
  l jsonb;
  n int := 0;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if trim(coalesce(p_bill ->> 'invoice_number', '')) = '' then raise exception 'Type the bill number (the supplier''s invoice number).'; end if;
  if (p_bill ->> 'supplier_id') is null or not exists (select 1 from public.suppliers where id = (p_bill ->> 'supplier_id')::uuid and company_id = v_company) then
    raise exception 'Choose the supplier.';
  end if;
  if (p_bill ->> 'project_id') is not null and not exists (select 1 from public.projects where id = (p_bill ->> 'project_id')::uuid and company_id = v_company) then
    raise exception 'That project is not in your company.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one line.'; end if;
  if v_retp > 50 then raise exception 'Retention above 50%% is not allowed.'; end if;
  if p_approve and v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can approve bills.'; end if;
  if exists (select 1 from public.supplier_invoices where company_id = v_company and supplier_id = (p_bill ->> 'supplier_id')::uuid
              and lower(invoice_number) = lower(trim(p_bill ->> 'invoice_number'))) then
    raise exception 'This supplier''s bill % is already entered.', trim(p_bill ->> 'invoice_number');
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    if trim(coalesce(l ->> 'item_name', '')) = '' then raise exception 'Every line needs a description.'; end if;
    if coalesce((l ->> 'amount')::numeric, 0) <= 0 then raise exception 'Every line needs an amount above zero.'; end if;
    if (l ->> 'chart_account_id') is null then raise exception 'Choose the cost account for "%".', l ->> 'item_name'; end if;
    v_sub := v_sub + round((l ->> 'amount')::numeric, 2);
  end loop;
  v_total := v_sub + v_tax;

  insert into public.supplier_invoices (company_id, supplier_id, project_id, invoice_number, invoice_date, due_date,
                                        subtotal, tax_amount, shipping_amount, total_amount, amount_paid, balance_due, status,
                                        retention_percent, retention_amount, notes, created_by)
  values (v_company, (p_bill ->> 'supplier_id')::uuid, nullif(p_bill ->> 'project_id', '')::uuid, trim(p_bill ->> 'invoice_number'),
          coalesce((p_bill ->> 'invoice_date')::date, current_date), coalesce((p_bill ->> 'due_date')::date, (p_bill ->> 'invoice_date')::date, current_date),
          v_sub, v_tax, 0, v_total, 0, v_total, 'pending', v_retp, round(v_sub * v_retp / 100, 2),
          nullif(trim(coalesce(p_bill ->> 'notes', '')), ''), auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    insert into public.supplier_invoice_line_items (supplier_invoice_id, line_no, item_name, description, unit, quantity, unit_cost, total_amount, chart_account_id)
    values (v_id, n, left(trim(l ->> 'item_name'), 200), nullif(trim(coalesce(l ->> 'description', '')), ''), 'each', 1,
            round((l ->> 'amount')::numeric, 2), round((l ->> 'amount')::numeric, 2), (l ->> 'chart_account_id')::uuid);
  end loop;

  if p_approve then
    update public.supplier_invoices set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = v_id;
  else
    update public.supplier_invoices set updated_at = now() where id = v_id;   -- writes the "waiting for approval" note
  end if;
  return v_id;
end;
$$;

create or replace function public.approve_bill(p_id uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can approve bills.'; end if;
  update public.supplier_invoices set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_id and company_id = v_company and status in ('pending', 'disputed');
  if not found then raise exception 'Bill not found, or it is already approved.'; end if;
end;
$$;

create or replace function public.dispute_bill(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can dispute bills.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write why the bill is disputed.'; end if;
  if exists (select 1 from public.supplier_payments where invoice_id = p_id) then
    raise exception 'This bill already has payments. Remove them first.';
  end if;
  update public.supplier_invoices
     set status = 'disputed', notes = left(trim(coalesce(notes, '') || ' | Disputed: ' || trim(p_reason)), 2000)
   where id = p_id and company_id = v_company;
  if not found then raise exception 'Bill not found.'; end if;
end;
$$;

-- Invoices and payments: same rules as 20260972 / 20260973, with the error fix above.
create or replace function public._invoice_to_books()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r        public.client_invoices%rowtype;
  v_start  date;
  v_live   public.gl_transactions%rowtype;
  v_should boolean;
  v_sig    text;
  v_ar     uuid;
  v_rev    uuid;
  v_gct    uuid;
  v_tax    numeric;
  v_client text;
  v_id     uuid;
begin
  if tg_op = 'DELETE' then
    begin
      if old.gl_transaction_id is not null then
        perform public._gl_reverse(old.gl_transaction_id, 'Invoice ' || old.invoice_number || ' deleted');
      end if;
    exception when others then null;   -- never block deleting
    end;
    return old;
  end if;

  r := new;
  v_start := public._books_start(r.company_id);
  -- Only ever manage the entry this rule made (client_invoices.gl_transaction_id). Entries made any other way
  -- (e.g. imported from Zoho) are never reversed or duplicated.
  if r.gl_transaction_id is not null then
    select * into v_live from public.gl_transactions where id = r.gl_transaction_id and status = 'posted';
  end if;

  if v_start is null then
    if v_live.id is null then new.ledger_note := 'Not in the books: set the books start date (Bank Accounts).'; end if;
    return new;
  end if;

  -- Opening receivables (invoices from before the start date) stay as they are.
  if v_live.id is not null and v_live.reference = 'Opening receivable' then
    return new;
  end if;

  if v_live.id is null and exists (select 1 from public.gl_transactions g
                                    where g.source_type = 'invoice' and g.source_id = r.id and g.status = 'posted') then
    new.ledger_note := 'Already in the books (entered another way).';
    return new;
  end if;

  v_should := r.invoice_date >= v_start
              and r.status in ('sent', 'partial', 'paid', 'overdue') and coalesce(r.total_amount, 0) > 0;
  v_tax := greatest(coalesce(r.tax_amount, 0), 0);
  v_sig := case when v_should then concat_ws('|', r.total_amount, v_tax, r.invoice_date, r.project_id, r.revenue_account_id) end;

  if v_should and v_live.id is not null and r.ledger_signature is not distinct from v_sig then
    new.ledger_note := null;   -- already in the books exactly like this
    return new;
  end if;
  if not v_should and v_live.id is null then
    new.ledger_note := case
      when r.status = 'draft' then 'Not in the books yet: still a draft.'
      when r.status = 'cancelled' then null
      when r.invoice_date < v_start then 'Before the books start date.'
      else null end;
    new.gl_transaction_id := null;
    new.ledger_signature := null;
    return new;
  end if;

  begin
    if v_live.id is not null then
      perform public._gl_reverse(v_live.id, case when v_should then 'Invoice ' || r.invoice_number || ' changed' else 'Invoice ' || r.invoice_number || ' ' || r.status end);
    end if;
    new.gl_transaction_id := null;
    new.ledger_signature := null;

    if v_should then
      v_ar := public._find_ar_account(r.company_id);
      v_rev := public._find_revenue_account(r.company_id, r.revenue_account_id);
      if v_ar is null then raise exception 'No Accounts Receivable account in your chart.'; end if;
      if v_rev is null then raise exception 'No revenue account in your chart.'; end if;
      if v_tax > 0 then
        v_gct := public._find_gct_payable(r.company_id);
        if v_gct is null then raise exception 'This invoice has GCT but there is no "GCT Payable" account in your chart.'; end if;
      end if;
      select name into v_client from public.clients where id = r.client_id;

      v_id := public._gl_post(r.company_id, r.invoice_date, 'invoice', r.id, 'Invoice ' || r.invoice_number,
        'Invoice ' || r.invoice_number || coalesce(' - ' || v_client, ''),
        jsonb_build_array(
          jsonb_build_object('account_id', v_ar, 'debit', r.total_amount, 'credit', 0, 'project_id', r.project_id,
                             'description', 'Invoice ' || r.invoice_number || coalesce(' - ' || v_client, '')),
          jsonb_build_object('account_id', v_rev, 'debit', 0, 'credit', r.total_amount - v_tax, 'project_id', r.project_id,
                             'description', 'Invoice ' || r.invoice_number),
          jsonb_build_object('account_id', v_gct, 'debit', 0, 'credit', v_tax, 'project_id', r.project_id,
                             'description', 'GCT on invoice ' || r.invoice_number)));
      new.gl_transaction_id := v_id;
      new.ledger_signature := v_sig;
      new.ledger_note := null;
    else
      new.ledger_note := case when r.status = 'cancelled' then 'Cancelled: reversed in the books.' else 'Taken out of the books.' end;
    end if;
  exception when others then
    -- Never block saving. The error also undid the reversal above, so an entry that was already in the books is
    -- STILL in the books: keep pointing at it, and say the latest change isn't in yet.
    if v_live.id is not null then
      new.gl_transaction_id := v_live.id;
      new.ledger_signature := r.ledger_signature;
      new.ledger_note := left('Your last change is not in the books yet: ' || sqlerrm, 500);
    else
      new.ledger_note := left('Not in the books: ' || sqlerrm, 500);
      new.gl_transaction_id := null;
      new.ledger_signature := null;
    end if;
  end;
  return new;
end;
$$;

create or replace function public._client_payment_to_books()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r        public.client_payments%rowtype;
  v_start  date;
  v_live   public.gl_transactions%rowtype;
  v_should boolean;
  v_sig    text;
  v_credit uuid;
  v_dep    public.chart_of_accounts%rowtype;
  v_inv    public.client_invoices%rowtype;
  v_project uuid;
  v_client text;
  v_what   text;
begin
  if tg_op = 'DELETE' then
    begin
      if old.gl_transaction_id is not null then
        perform public._gl_reverse(old.gl_transaction_id, 'Payment ' || coalesce(old.payment_number, '') || ' deleted');
      end if;
    exception when others then null;   -- never block deleting
    end;
    return old;
  end if;

  r := new;
  v_start := public._books_start(r.company_id);
  if r.gl_transaction_id is not null then
    select * into v_live from public.gl_transactions where id = r.gl_transaction_id and status = 'posted';
  end if;

  if v_start is null then
    if v_live.id is null then new.ledger_note := 'Not in the books: set the books start date (Bank Accounts).'; end if;
    return new;
  end if;
  if v_live.id is null and exists (select 1 from public.gl_transactions g
                                    where g.source_type = 'client_payment' and g.source_id = r.id and g.status = 'posted') then
    new.ledger_note := 'Already in the books (entered another way).';
    return new;
  end if;

  -- "Deposited to" not chosen: the primary bank account, else Undeposited Funds (only for payments the books will hold).
  if r.deposit_account_id is null and r.payment_date >= v_start then
    new.deposit_account_id := public._default_deposit_account(r.company_id);
    r.deposit_account_id := new.deposit_account_id;
  end if;

  v_should := r.payment_date >= v_start and coalesce(r.amount, 0) > 0;
  v_sig := case when v_should then concat_ws('|', r.amount, r.payment_date, r.deposit_account_id, r.invoice_id, r.project_id) end;

  if v_should and v_live.id is not null and r.ledger_signature is not distinct from v_sig then
    new.ledger_note := null;   -- already in the books exactly like this
    return new;
  end if;
  if not v_should and v_live.id is null then
    new.ledger_note := case when r.payment_date < v_start then 'Before the books start date.' else null end;
    new.gl_transaction_id := null;
    new.ledger_signature := null;
    return new;
  end if;

  begin
    if v_live.id is not null then
      perform public._gl_reverse(v_live.id, 'Payment ' || coalesce(r.payment_number, '') || ' changed');
    end if;
    new.gl_transaction_id := null;
    new.ledger_signature := null;

    if v_should then
      if r.deposit_account_id is null then
        raise exception 'Choose where it was deposited (add a bank account or an "Undeposited Funds" account).';
      end if;
      select * into v_dep from public.chart_of_accounts where id = r.deposit_account_id;
      if v_dep.id is null or v_dep.company_id <> r.company_id or v_dep.type <> 'asset' or v_dep.is_active is false then
        raise exception 'The "Deposited to" account must be an active bank or cash account in your chart.';
      end if;

      if r.invoice_id is not null then
        select * into v_inv from public.client_invoices where id = r.invoice_id;
        v_credit := public._find_ar_account(r.company_id);
        if v_credit is null then raise exception 'No Accounts Receivable account in your chart.'; end if;
        v_project := coalesce(r.project_id, v_inv.project_id);
        v_what := 'Payment on invoice ' || coalesce(v_inv.invoice_number, '');
      elsif r.project_id is not null then
        v_credit := public._find_client_advances(r.company_id);
        if v_credit is null then raise exception 'No "Client Advances and Deposits" account in your chart.'; end if;
        v_project := r.project_id;
        v_what := 'Advance payment';
      else
        v_credit := public._find_ar_account(r.company_id);
        if v_credit is null then raise exception 'No Accounts Receivable account in your chart.'; end if;
        v_what := 'Payment on account';
      end if;
      select name into v_client from public.clients where id = coalesce(r.client_id, v_inv.client_id);

      new.gl_transaction_id := public._gl_post(r.company_id, r.payment_date, 'client_payment', r.id,
        left(coalesce(nullif(r.payment_number, ''), 'Payment'), 200),
        v_what || coalesce(' - ' || v_client, '') || coalesce(' (Ref ' || nullif(r.reference_number, '') || ')', ''),
        jsonb_build_array(
          jsonb_build_object('account_id', r.deposit_account_id, 'debit', r.amount, 'credit', 0, 'project_id', v_project,
                             'description', v_what || coalesce(' - ' || v_client, '')),
          jsonb_build_object('account_id', v_credit, 'debit', 0, 'credit', r.amount, 'project_id', v_project,
                             'description', v_what)));
      new.ledger_signature := v_sig;
      new.ledger_note := null;
    else
      new.ledger_note := 'Taken out of the books.';
    end if;
  exception when others then
    -- Never block saving. The error also undid the reversal above, so an entry that was already in the books is
    -- STILL in the books: keep pointing at it, and say the latest change isn't in yet.
    if v_live.id is not null then
      new.gl_transaction_id := v_live.id;
      new.ledger_signature := r.ledger_signature;
      new.ledger_note := left('Your last change is not in the books yet: ' || sqlerrm, 500);
    else
      new.ledger_note := left('Not in the books: ' || sqlerrm, 500);
      new.gl_transaction_id := null;
      new.ledger_signature := null;
    end if;
  end;
  return new;
end;
$$;

-- Books start date: same as 20260973, plus opening payables and the bill lock.
create or replace function public.set_books_start_date(p_date date, p_revenue_account uuid default null)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  v_old     date;
  og        record;
  i         record;
  v_ar      uuid;
  v_obe     uuid;
  v_open    numeric;
  n         int := 0;
  v_total   numeric := 0;
  v_ap      uuid;
  b         record;
  nb        int := 0;
  v_btotal  numeric := 0;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if v_role not in ('director', 'admin') then raise exception 'Only a director or admin can set the books start date.'; end if;
  if p_date is null then raise exception 'Choose the date your books start.'; end if;
  if p_revenue_account is not null and not exists (
       select 1 from public.chart_of_accounts where id = p_revenue_account and company_id = v_company and type = 'revenue' and is_active is not false) then
    raise exception 'Choose an active revenue account from your chart.';
  end if;

  v_old := public._books_start(v_company);
  -- Only entries made by Magnus's own rules count (never entries imported or made another way).
  if v_old is distinct from p_date and (exists (
       select 1 from public.client_invoices ci join public.gl_transactions g on g.id = ci.gl_transaction_id
        where ci.company_id = v_company and g.status = 'posted' and coalesce(g.reference, '') <> 'Opening receivable')
     or exists (
       select 1 from public.client_payments cp join public.gl_transactions g on g.id = cp.gl_transaction_id
        where cp.company_id = v_company and g.status = 'posted')
     or exists (
       select 1 from public.supplier_invoices si join public.gl_transactions g on g.id = si.gl_transaction_id
        where si.company_id = v_company and g.status = 'posted' and coalesce(g.reference, '') <> 'Opening payable')) then
    raise exception 'Invoices, bills or payments are already in the books from % onwards, so the start date can no longer be changed.',
      coalesce(to_char(v_old, 'DD Mon YYYY'), 'the start date');
  end if;

  update public.company_settings
     set books_start_date = p_date,
         default_revenue_account_id = coalesce(p_revenue_account, default_revenue_account_id)
   where company_id = v_company;
  if not found then raise exception 'Company settings not found.'; end if;

  if v_old is distinct from p_date then
    -- Opening receivables: take out the old ones, bring in what was unpaid on the new start date.
    for og in select id from public.gl_transactions
              where company_id = v_company and status = 'posted' and source_type = 'invoice' and reference = 'Opening receivable' loop
      perform public._gl_reverse(og.id, 'Books start date changed');
    end loop;
    update public.client_invoices ci set gl_transaction_id = null, ledger_signature = null
     where ci.company_id = v_company and ci.gl_transaction_id is not null
       and exists (select 1 from public.gl_transactions g where g.id = ci.gl_transaction_id and g.status = 'voided');

    v_ar := public._find_ar_account(v_company);
    for i in select ci.*, (select coalesce(sum(cp.amount), 0) from public.client_payments cp
                            where cp.invoice_id = ci.id and cp.payment_date < p_date) as paid_before
               from public.client_invoices ci
              where ci.company_id = v_company and ci.invoice_date < p_date
                and ci.status in ('sent', 'partial', 'paid', 'overdue')
                -- never duplicate an invoice that is already in the books another way (e.g. imported)
                and not exists (select 1 from public.gl_transactions g
                                 where g.source_type = 'invoice' and g.source_id = ci.id and g.status = 'posted') loop
      v_open := round(coalesce(i.total_amount, 0) - i.paid_before, 2);
      continue when v_open <= 0;
      if v_ar is null then raise exception 'No Accounts Receivable account in your chart.'; end if;
      v_obe := coalesce(v_obe, public._opening_balance_equity(v_company));
      perform public._gl_post(v_company, p_date, 'invoice', i.id, 'Opening receivable',
        'Opening receivable: invoice ' || i.invoice_number || ' (unpaid on ' || to_char(p_date, 'DD Mon YYYY') || ')',
        jsonb_build_array(
          jsonb_build_object('account_id', v_ar, 'debit', v_open, 'credit', 0, 'project_id', i.project_id, 'description', 'Unpaid on books start date'),
          jsonb_build_object('account_id', v_obe, 'debit', 0, 'credit', v_open, 'project_id', null, 'description', 'Opening receivable')),
        'opening_balance');
      n := n + 1; v_total := v_total + v_open;
    end loop;
    update public.client_invoices ci
       set gl_transaction_id = ob.id, ledger_note = 'Opening receivable (unpaid on the books start date).'
      from public.gl_transactions ob
     where ob.source_type = 'invoice' and ob.source_id = ci.id and ob.status = 'posted' and ob.reference = 'Opening receivable'
       and ci.company_id = v_company;

    update public.client_invoices ci set ledger_note = 'Before the books start date.'
     where ci.company_id = v_company and ci.invoice_date < p_date and ci.gl_transaction_id is null
       and not exists (select 1 from public.gl_transactions g where g.source_type = 'invoice' and g.source_id = ci.id and g.status = 'posted');

    -- Opening payables: the same for supplier bills (approved, unpaid on the start date).
    for og in select id from public.gl_transactions
              where company_id = v_company and status = 'posted' and source_type = 'supplier_invoice' and reference = 'Opening payable' loop
      perform public._gl_reverse(og.id, 'Books start date changed');
    end loop;
    update public.supplier_invoices si set gl_transaction_id = null, ledger_signature = null
     where si.company_id = v_company and si.gl_transaction_id is not null
       and exists (select 1 from public.gl_transactions g where g.id = si.gl_transaction_id and g.status = 'voided');
    v_ap := public._find_ap_account(v_company);
    for b in select si.*, (select coalesce(sum(sp.amount), 0) from public.supplier_payments sp
                            where sp.invoice_id = si.id and sp.payment_date < p_date) as paid_before
               from public.supplier_invoices si
              where si.company_id = v_company and si.invoice_date < p_date
                and si.status in ('approved', 'partial', 'paid')
                and not exists (select 1 from public.gl_transactions g
                                 where g.source_type = 'supplier_invoice' and g.source_id = si.id and g.status = 'posted') loop
      v_open := round(coalesce(b.total_amount, 0) - b.paid_before, 2);
      continue when v_open <= 0;
      if v_ap is null then raise exception 'No Accounts Payable account in your chart.'; end if;
      v_obe := coalesce(v_obe, public._opening_balance_equity(v_company));
      perform public._gl_post(v_company, p_date, 'supplier_invoice', b.id, 'Opening payable',
        'Opening payable: bill ' || b.invoice_number || ' (unpaid on ' || to_char(p_date, 'DD Mon YYYY') || ')',
        jsonb_build_array(
          jsonb_build_object('account_id', v_obe, 'debit', v_open, 'credit', 0, 'project_id', null, 'description', 'Opening payable'),
          jsonb_build_object('account_id', v_ap, 'debit', 0, 'credit', v_open, 'project_id', b.project_id, 'description', 'Unpaid on books start date')),
        'opening_balance');
      nb := nb + 1; v_btotal := v_btotal + v_open;
    end loop;
    update public.supplier_invoices si
       set gl_transaction_id = ob.id, ledger_note = 'Opening payable (unpaid on the books start date).'
      from public.gl_transactions ob
     where ob.source_type = 'supplier_invoice' and ob.source_id = si.id and ob.status = 'posted' and ob.reference = 'Opening payable'
       and si.company_id = v_company;
    update public.supplier_invoices set updated_at = updated_at where company_id = v_company and invoice_date >= p_date;

    -- Invoices, then payments, on/after the new date: let their rules post them.
    update public.client_invoices set updated_at = updated_at where company_id = v_company and invoice_date >= p_date;
    update public.client_payments set amount = amount where company_id = v_company;
  end if;

  return jsonb_build_object('start', p_date, 'opening_invoices', n, 'opening_total', v_total,
                            'opening_bills', nb, 'opening_bills_total', v_btotal);
end;
$$;

revoke all on function public.set_books_start_date(date, uuid) from public, anon;
grant execute on function public.set_books_start_date(date, uuid) to authenticated;
revoke all on function public.create_bill(jsonb, jsonb, boolean) from public, anon;
revoke all on function public.approve_bill(uuid) from public, anon;
revoke all on function public.dispute_bill(uuid, text) from public, anon;
grant execute on function public.create_bill(jsonb, jsonb, boolean) to authenticated;
grant execute on function public.approve_bill(uuid) to authenticated;
grant execute on function public.dispute_bill(uuid, text) to authenticated;
