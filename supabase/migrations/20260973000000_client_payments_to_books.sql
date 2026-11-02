-- =====================================================================
-- Banking Step 3b - client payments go into the books
-- Magnus Boy's System
--
-- The standard way:
--   * Payment on an invoice:   DEBIT the bank / cash it was deposited to   CREDIT Accounts Receivable
--   * Advance (a project, no invoice yet): DEBIT bank   CREDIT Client Advances and Deposits (money held for the client)
--     When the advance is applied to an invoice (invoice_id set), it is re-posted as a payment on that invoice, so
--     Client Advances goes back down and Receivable goes down. The bank is unchanged.
--   * Changing amount / date / deposit account / invoice reverses and re-posts; deleting reverses.
--
--   * client_payments.deposit_account_id - "Deposited to". If left empty, Magnus uses the company's primary bank
--     account (Bank Accounts page), else "Undeposited Funds" - the QuickBooks default - so every way of recording a
--     payment (receivables, advances, estimates, BOQ invoices) goes into the books.
--   * client_payments.gl_transaction_id / ledger_note - the entry, or why it isn't in the books yet. Recording a
--     payment is NEVER blocked by the books.
--   * Same safety as invoices: only entries made by this rule are ever changed; payments dated before the books
--     start date are left alone; entries imported another way are never reversed or duplicated.
--   * set_books_start_date(): the date also locks once payments after it are in the books.
-- Runs as the signed-in user (normal company access rules and every ledger check apply).
-- Safe to run twice.
-- =====================================================================

alter table public.client_payments add column if not exists deposit_account_id uuid references public.chart_of_accounts(id) on delete set null;
alter table public.client_payments add column if not exists gl_transaction_id uuid references public.gl_transactions(id) on delete set null;
alter table public.client_payments add column if not exists ledger_note text;
alter table public.client_payments add column if not exists ledger_signature text;

create or replace function public._find_client_advances(p_company uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.chart_of_accounts
   where company_id = p_company and type = 'liability' and is_active is not false
     and (name ~* '(client|customer) (advance|deposit)' or name ~* '^advance payment' or (subtype = 'deferred_revenue' and name ~* '(advance|deposit)'))
   order by (name ~* '^client advances') desc, code
   limit 1;
$$;

-- Where a payment goes when "Deposited to" is not chosen: the primary bank account, else Undeposited Funds.
create or replace function public._default_deposit_account(p_company uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select b.chart_account_id from public.bank_accounts b join public.chart_of_accounts a on a.id = b.chart_account_id
      where b.company_id = p_company and b.is_active is not false and a.type = 'asset' and a.is_active is not false
      order by b.is_primary desc nulls last, b.created_at limit 1),
    (select id from public.chart_of_accounts
      where company_id = p_company and type = 'asset' and is_active is not false and name ~* 'undeposited'
      order by code limit 1));
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
    new.ledger_note := left('Not in the books: ' || sqlerrm, 500);
    new.gl_transaction_id := null;
    new.ledger_signature := null;
  end;
  return new;
end;
$$;

drop trigger if exists client_payment_to_books on public.client_payments;
create trigger client_payment_to_books
  before insert or update or delete on public.client_payments
  for each row execute function public._client_payment_to_books();

-- Books start date: same as 20260972, plus payments (lock + bring in payments on/after the date).
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
        where cp.company_id = v_company and g.status = 'posted')) then
    raise exception 'Invoices or payments are already in the books from % onwards, so the start date can no longer be changed.',
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

    -- Invoices, then payments, on/after the new date: let their rules post them.
    update public.client_invoices set updated_at = updated_at where company_id = v_company and invoice_date >= p_date;
    update public.client_payments set amount = amount where company_id = v_company;
  end if;

  return jsonb_build_object('start', p_date, 'opening_invoices', n, 'opening_total', v_total);
end;
$$;

revoke all on function public.set_books_start_date(date, uuid) from public, anon;
grant execute on function public.set_books_start_date(date, uuid) to authenticated;

-- Companies that already set a books start date: bring in their payments on/after it now.
do $$
declare c record;
begin
  for c in select company_id from public.company_settings where books_start_date is not null loop
    update public.client_payments set amount = amount where company_id = c.company_id;
  end loop;
end;
$$;
