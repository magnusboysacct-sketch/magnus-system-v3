-- =====================================================================
-- Banking Step 4b - paying bills goes into the books
-- Magnus Boy's System
--
-- The standard way:
--   * Paying a bill:            DEBIT Supplier Payables          CREDIT the bank / cash / card it was paid from
--   * Paying out retention:     DEBIT Retention Payable          CREDIT the bank / cash / card
--     (retention held on a subcontractor's bill is paid separately, when the work is accepted)
--   * Part payments are allowed; a payment is never more than what is still owed on the bill.
--   * Deleting a payment (Undo) takes it out of the books and puts the amount back on the bill.
--
--   * supplier_payments.paid_from_account_id - "Paid from". If left empty, Magnus uses the company's primary bank account.
--   * supplier_payments.is_retention_release, gl_transaction_id, ledger_note, ledger_signature.
--   * pay_bill(bill, amount, date, paid_from, method, reference, retention) - one step, with every check.
--   * undo_bill_payment(payment) - removes a payment.
--   * The bill's amount paid, balance and status (approved / partial / paid) are kept right by the database.
--   * Same safety as before: only entries made by this rule are ever changed; payments dated before the books start
--     date are left alone; entries imported another way are never reversed or duplicated; saving is never blocked.
--   * set_books_start_date(): the date also locks once bill payments after it are in the books.
-- Runs as the signed-in user (normal company access rules and every ledger check apply).
-- Safe to run twice.
-- =====================================================================

alter table public.supplier_payments add column if not exists paid_from_account_id uuid references public.chart_of_accounts(id) on delete set null;
alter table public.supplier_payments add column if not exists is_retention_release boolean not null default false;
alter table public.supplier_payments add column if not exists gl_transaction_id uuid references public.gl_transactions(id) on delete set null;
alter table public.supplier_payments add column if not exists ledger_note text;
alter table public.supplier_payments add column if not exists ledger_signature text;

create or replace function public._supplier_payment_to_books()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r        public.supplier_payments%rowtype;
  v_start  date;
  v_live   public.gl_transactions%rowtype;
  v_should boolean;
  v_sig    text;
  v_debit  uuid;
  v_from   public.chart_of_accounts%rowtype;
  v_bill   public.supplier_invoices%rowtype;
  v_sup    text;
  v_what   text;
begin
  if tg_op = 'DELETE' then
    begin
      if old.gl_transaction_id is not null then
        perform public._gl_reverse(old.gl_transaction_id, 'Bill payment ' || coalesce(old.payment_number, '') || ' deleted');
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
                                    where g.source_type = 'supplier_payment' and g.source_id = r.id and g.status = 'posted') then
    new.ledger_note := 'Already in the books (entered another way).';
    return new;
  end if;

  -- "Paid from" not chosen: the primary bank account (only for payments the books will hold).
  if r.paid_from_account_id is null and r.payment_date >= v_start then
    new.paid_from_account_id := (select b.chart_account_id from public.bank_accounts b join public.chart_of_accounts a on a.id = b.chart_account_id
                                  where b.company_id = r.company_id and b.is_active is not false and a.is_active is not false
                                  order by b.is_primary desc nulls last, b.created_at limit 1);
    r.paid_from_account_id := new.paid_from_account_id;
  end if;

  v_should := r.payment_date >= v_start and coalesce(r.amount, 0) > 0;
  v_sig := case when v_should then concat_ws('|', r.amount, r.payment_date, r.paid_from_account_id, r.invoice_id, r.is_retention_release) end;

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
      perform public._gl_reverse(v_live.id, 'Bill payment ' || coalesce(r.payment_number, '') || ' changed');
    end if;
    new.gl_transaction_id := null;
    new.ledger_signature := null;

    if v_should then
      if r.paid_from_account_id is null then
        raise exception 'Choose where the money was paid from (add a bank account on the Bank Accounts page).';
      end if;
      select * into v_from from public.chart_of_accounts where id = r.paid_from_account_id;
      if v_from.id is null or v_from.company_id <> r.company_id or not public._is_money_account(v_from) then
        raise exception '"Paid from" must be one of your bank, cash or card accounts.';
      end if;

      if r.invoice_id is not null then
        select * into v_bill from public.supplier_invoices where id = r.invoice_id;
      end if;
      if r.is_retention_release then
        v_debit := public._find_retention_payable(r.company_id);
        if v_debit is null then raise exception 'No "Retention Payable" account in your chart.'; end if;
        v_what := 'Retention paid on bill ' || coalesce(v_bill.invoice_number, '');
      else
        v_debit := public._find_ap_account(r.company_id);
        if v_debit is null then raise exception 'No Supplier Payables / Accounts Payable account in your chart.'; end if;
        v_what := case when v_bill.id is not null then 'Payment on bill ' || v_bill.invoice_number else 'Payment to supplier' end;
      end if;
      select supplier_name into v_sup from public.suppliers where id = coalesce(r.supplier_id, v_bill.supplier_id);

      new.gl_transaction_id := public._gl_post(r.company_id, r.payment_date, 'supplier_payment', r.id,
        left(coalesce(nullif(r.payment_number, ''), 'Bill payment'), 200),
        v_what || coalesce(' - ' || v_sup, '') || coalesce(' (Ref ' || nullif(coalesce(r.reference_number, r.check_number), '') || ')', ''),
        jsonb_build_array(
          jsonb_build_object('account_id', v_debit, 'debit', r.amount, 'credit', 0, 'project_id', v_bill.project_id,
                             'description', v_what || coalesce(' - ' || v_sup, '')),
          jsonb_build_object('account_id', r.paid_from_account_id, 'debit', 0, 'credit', r.amount, 'project_id', v_bill.project_id,
                             'description', v_what)));
      new.ledger_signature := v_sig;
      new.ledger_note := null;
    else
      new.ledger_note := 'Taken out of the books.';
    end if;
  exception when others then
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

drop trigger if exists supplier_payment_to_books on public.supplier_payments;
create trigger supplier_payment_to_books
  before insert or update or delete on public.supplier_payments
  for each row execute function public._supplier_payment_to_books();

-- Keep the bill's amount paid, balance and status right whenever a payment is added, changed or removed.
create or replace function public._bill_paid_refresh(p_bill uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_paid numeric;
begin
  if p_bill is null then return; end if;
  select coalesce(sum(amount), 0) into v_paid from public.supplier_payments where invoice_id = p_bill;
  update public.supplier_invoices si
     set amount_paid = v_paid,
         balance_due = round(coalesce(si.total_amount, 0) - v_paid, 2),
         status = case when si.status not in ('approved', 'partial', 'paid') then si.status
                       when v_paid <= 0 then 'approved'
                       when round(coalesce(si.total_amount, 0) - v_paid, 2) <= 0 then 'paid'
                       else 'partial' end,
         updated_at = now()
   where si.id = p_bill
     and (si.amount_paid is distinct from v_paid or si.balance_due is distinct from round(coalesce(si.total_amount, 0) - v_paid, 2)
          or (si.status in ('approved', 'partial', 'paid') and si.status is distinct from case when v_paid <= 0 then 'approved'
                when round(coalesce(si.total_amount, 0) - v_paid, 2) <= 0 then 'paid' else 'partial' end));
end;
$$;

create or replace function public._supplier_payment_refresh_bill()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public._bill_paid_refresh(old.invoice_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.invoice_id is distinct from old.invoice_id or new.amount is distinct from old.amount) then
    perform public._bill_paid_refresh(new.invoice_id);
  end if;
  return null;
end;
$$;

drop trigger if exists supplier_payment_refresh_bill on public.supplier_payments;
create trigger supplier_payment_refresh_bill
  after insert or update or delete on public.supplier_payments
  for each row execute function public._supplier_payment_refresh_bill();

-- One step: pay a bill (or its retention), with every check.
create or replace function public.pay_bill(p_bill uuid, p_amount numeric, p_date date, p_paid_from uuid,
                                           p_method text default 'wire', p_reference text default null, p_retention boolean default false)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  b         public.supplier_invoices%rowtype;
  v_from    public.chart_of_accounts%rowtype;
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_ret     numeric;
  v_ret_paid numeric;
  v_reg_paid numeric;
  v_left    numeric;
  v_id      uuid;
  v_num     text;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can pay bills.'; end if;
  select * into b from public.supplier_invoices where id = p_bill and company_id = v_company for update;
  if b.id is null then raise exception 'Bill not found.'; end if;
  if b.status = 'pending' then raise exception 'Approve the bill first, then pay it.'; end if;
  if b.status = 'disputed' then raise exception 'This bill is disputed. Approve it again before paying it.'; end if;
  if v_amt <= 0 then raise exception 'Type an amount above zero.'; end if;
  if p_date is null then raise exception 'Choose the date it was paid.'; end if;
  if p_paid_from is null then raise exception 'Choose where the money was paid from.'; end if;
  select * into v_from from public.chart_of_accounts where id = p_paid_from and company_id = v_company;
  if v_from.id is null or not public._is_money_account(v_from) then raise exception '"Paid from" must be one of your bank, cash or card accounts.'; end if;
  if coalesce(p_method, '') not in ('check', 'ach', 'wire', 'credit_card', 'cash', 'other') then raise exception 'Choose how it was paid.'; end if;

  v_ret := round(coalesce(b.retention_amount, 0), 2);
  select coalesce(sum(amount) filter (where is_retention_release), 0), coalesce(sum(amount) filter (where not is_retention_release), 0)
    into v_ret_paid, v_reg_paid from public.supplier_payments where invoice_id = b.id;

  if p_retention then
    if v_ret <= 0 then raise exception 'This bill has no retention held.'; end if;
    v_left := round(v_ret - v_ret_paid, 2);
    if v_left <= 0 then raise exception 'The retention on this bill is already paid.'; end if;
    if v_amt > v_left then raise exception 'Only % of retention is still held on this bill.', to_char(v_left, 'FM999,999,999,990.00'); end if;
  else
    v_left := round(coalesce(b.total_amount, 0) - v_ret - v_reg_paid, 2);
    if v_left <= 0 then
      raise exception '%', case when v_ret - v_ret_paid > 0 then 'Only the retention is left on this bill. Use "Pay retention" when the work is accepted.'
                                else 'This bill is already paid.' end;
    end if;
    if v_amt > v_left then raise exception 'Only % is owed on this bill now.', to_char(v_left, 'FM999,999,999,990.00'); end if;
  end if;

  -- The same payment saved twice by accident (e.g. a double tap) is refused.
  if exists (select 1 from public.supplier_payments where invoice_id = b.id and amount = v_amt and payment_date = p_date
               and paid_from_account_id = p_paid_from and created_at > now() - interval '2 minutes') then
    raise exception 'This same payment was just saved. Check the bill before paying again.';
  end if;

  v_num := 'BP-' || lpad(((select count(*) from public.supplier_payments where company_id = v_company) + 1)::text, 4, '0');
  insert into public.supplier_payments (company_id, supplier_id, invoice_id, payment_number, payment_date, amount, payment_method,
                                        check_number, reference_number, notes, created_by, paid_from_account_id, is_retention_release)
  values (v_company, b.supplier_id, b.id, v_num, p_date, v_amt, p_method,
          case when p_method = 'check' then nullif(trim(coalesce(p_reference, '')), '') end,
          nullif(trim(coalesce(p_reference, '')), ''), case when p_retention then 'Retention paid' end, auth.uid(), p_paid_from, p_retention)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.undo_bill_payment(p_id uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can undo a bill payment.'; end if;
  delete from public.supplier_payments where id = p_id and company_id = v_company;
  if not found then raise exception 'Payment not found.'; end if;
end;
$$;

grant execute on function public.pay_bill(uuid, numeric, date, uuid, text, text, boolean) to authenticated;
grant execute on function public.undo_bill_payment(uuid) to authenticated;

-- Books start date: same as 20260975, plus the bill-payment lock, and bill payments on/after the date go in.
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
        where si.company_id = v_company and g.status = 'posted' and coalesce(g.reference, '') <> 'Opening payable')
     or exists (
       select 1 from public.supplier_payments sp join public.gl_transactions g on g.id = sp.gl_transaction_id
        where sp.company_id = v_company and g.status = 'posted')) then
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
    update public.supplier_payments set amount = amount where company_id = v_company;
  end if;

  return jsonb_build_object('start', p_date, 'opening_invoices', n, 'opening_total', v_total,
                            'opening_bills', nb, 'opening_bills_total', v_btotal);
end;
$$;

-- Companies that already set a books start date: bring in their bill payments on/after it now.
update public.supplier_payments sp set amount = amount
 where exists (select 1 from public.company_settings cs where cs.company_id = sp.company_id and cs.books_start_date is not null
                                                          and sp.payment_date >= cs.books_start_date)
   and sp.gl_transaction_id is null;
