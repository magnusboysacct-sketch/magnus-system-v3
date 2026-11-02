-- =====================================================================
-- Banking Step 3a - books start date, and invoices go into the books
-- Magnus Boy's System
--
-- The standard (accrual) way: an ISSUED invoice is income earned and money the client owes:
--     DEBIT  Accounts Receivable   total
--     CREDIT Revenue               subtotal (total - GCT)
--     CREDIT GCT Payable           GCT
-- Drafts are not in the books. Cancelling reverses it. Changing an issued invoice's amount, date or project
-- reverses the old entry and posts the new one. Payment status changes (partial / paid) don't touch it.
--
--   * company_settings.books_start_date - everything dated on/after it goes through Magnus; nothing older is re-entered.
--     set_books_start_date(date): also brings in "opening receivables" - each issued invoice dated before the start
--     date that was still unpaid on that day gets one entry at the start date (DEBIT Receivable, CREDIT Opening
--     Balance Equity), so its later payments balance. The date can be changed only until invoices or payments after
--     it are in the books.
--   * company_settings.default_revenue_account_id - which revenue account invoices go to (else the first active
--     revenue account in the chart). client_invoices.revenue_account_id overrides it for one invoice.
--   * client_invoices.gl_transaction_id / ledger_note - the entry, or why it isn't in the books yet.
--     Posting NEVER blocks saving an invoice: any problem is written to ledger_note instead.
--   * Fix from Step 1: a credit card / line of credit added on the Bank Accounts page is filed under the chart's
--     credit card heading (found by name, e.g. "2500 Credit Cards and Lines of Credit"), never under 2400 when that
--     is "Client Advances and Deposits" (the standard chart).
-- Runs as the signed-in user (normal company access rules and every ledger check apply).
-- Safe to run twice.
-- =====================================================================

alter table public.company_settings add column if not exists books_start_date date;
alter table public.company_settings add column if not exists default_revenue_account_id uuid references public.chart_of_accounts(id) on delete set null;
alter table public.client_invoices  add column if not exists revenue_account_id uuid references public.chart_of_accounts(id) on delete set null;
alter table public.client_invoices  add column if not exists gl_transaction_id uuid references public.gl_transactions(id) on delete set null;
alter table public.client_invoices  add column if not exists ledger_note text;
alter table public.client_invoices  add column if not exists ledger_signature text;

-- ---------------------------------------------------------------------
-- 1. Shared posting helpers
-- ---------------------------------------------------------------------
-- Posts one balanced entry (header -> lines -> posted, so every ledger check and the balance update run).
-- p_lines: [{account_id, debit, credit, project_id, description}]
create or replace function public._gl_post(p_company uuid, p_date date, p_source_type text, p_source_id uuid,
                                           p_reference text, p_description text, p_lines jsonb, p_entry_type text default 'regular')
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_total numeric;
  l jsonb;
  n int := 0;
begin
  select coalesce(sum((x ->> 'debit')::numeric), 0) into v_total from jsonb_array_elements(p_lines) x;
  if v_total <= 0 then raise exception 'Nothing to post (amount is zero).'; end if;
  insert into public.gl_transactions (company_id, transaction_number, transaction_date, reference, source_type, source_id,
                                      description, total_amount, currency, status, created_by)
  values (p_company, public._next_gl_number(p_company, p_date), p_date, left(p_reference, 200), p_source_type, p_source_id,
          left(p_description, 500), round(v_total, 2), 'JMD', 'draft', auth.uid())
  returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    if coalesce((l ->> 'debit')::numeric, 0) = 0 and coalesce((l ->> 'credit')::numeric, 0) = 0 then continue; end if;
    n := n + 1;
    insert into public.gl_entries (transaction_id, company_id, account_id, debit, credit, project_id, description, line_number, entry_type)
    values (v_id, p_company, (l ->> 'account_id')::uuid, round(coalesce((l ->> 'debit')::numeric, 0), 2),
            round(coalesce((l ->> 'credit')::numeric, 0), 2), nullif(l ->> 'project_id', '')::uuid, left(l ->> 'description', 500), n, p_entry_type);
  end loop;
  update public.gl_transactions set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = v_id;
  return v_id;
end;
$$;

-- Reverses a posted entry: a posted reversing 'adjustment' entry, and the original marked voided. Nothing deleted.
create or replace function public._gl_reverse(p_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  g public.gl_transactions%rowtype;
  v_rev uuid;
begin
  select * into g from public.gl_transactions where id = p_id;
  if g.id is null or g.status <> 'posted' then return null; end if;
  insert into public.gl_transactions (company_id, transaction_number, transaction_date, reference, source_type, source_id,
                                      description, total_amount, currency, status, notes, created_by)
  values (g.company_id, public._next_gl_number(g.company_id, current_date), current_date, left('VOID: ' || g.transaction_number, 200),
          'adjustment', null, left('Reversal of ' || g.transaction_number || ': ' || g.description, 500), g.total_amount, 'JMD', 'draft',
          left('Reason: ' || coalesce(p_reason, ''), 500), auth.uid())
  returning id into v_rev;
  insert into public.gl_entries (transaction_id, company_id, account_id, debit, credit, project_id, description, line_number, entry_type)
  select v_rev, g.company_id, e.account_id, e.credit, e.debit, e.project_id, left('Reversal: ' || coalesce(e.description, ''), 500),
         e.line_number, 'adjustment'
    from public.gl_entries e where e.transaction_id = g.id;
  update public.gl_transactions set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = v_rev;
  update public.gl_transactions set status = 'voided', posted_at = null,
         notes = left(trim(coalesce(notes, '') || ' | Reversed by ' || (select transaction_number from public.gl_transactions where id = v_rev)
                          || ': ' || coalesce(p_reason, '')), 1000)
   where id = g.id;
  return v_rev;
end;
$$;

create or replace function public._books_start(p_company uuid)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select books_start_date from public.company_settings where company_id = p_company limit 1;
$$;

create or replace function public._find_ar_account(p_company uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.chart_of_accounts
   where company_id = p_company and type = 'asset' and is_active is not false
     and (subtype = 'accounts_receivable' or name ~* '^accounts receivable')
     and name !~* '(retain|retention|other)'
   order by (name ~* '^accounts receivable$') desc, (code = '1100') desc, code
   limit 1;
$$;

create or replace function public._find_gct_payable(p_company uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.chart_of_accounts
   where company_id = p_company and type = 'liability' and is_active is not false
     and (name ~* 'gct payable' or name ~* '(output gct|gct output|sales tax payable)' or code = '2310' and name ~* 'gct')
   order by (name ~* '^gct payable$') desc, code
   limit 1;
$$;

create or replace function public._find_revenue_account(p_company uuid, p_override uuid)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select a.id from public.chart_of_accounts a where a.id = p_override and a.company_id = p_company and a.type = 'revenue' and a.is_active is not false),
    (select a.id from public.company_settings s join public.chart_of_accounts a on a.id = s.default_revenue_account_id
      where s.company_id = p_company and a.type = 'revenue' and a.is_active is not false limit 1),
    (select a.id from public.chart_of_accounts a
      where a.company_id = p_company and a.type = 'revenue' and a.is_active is not false
        and not exists (select 1 from public.chart_of_accounts c where c.parent_id = a.id and c.is_active is not false)
      order by a.code limit 1));
$$;

-- ---------------------------------------------------------------------
-- 2. Invoices -> books
-- ---------------------------------------------------------------------
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
    return new;                                   -- already in the books exactly like this
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
    -- Never block saving the invoice: say why it isn't in the books instead.
    new.ledger_note := left('Not in the books: ' || sqlerrm, 500);
    new.gl_transaction_id := null;
    new.ledger_signature := null;
  end;
  return new;
end;
$$;

drop trigger if exists invoice_to_books on public.client_invoices;
create trigger invoice_to_books
  before insert or update or delete on public.client_invoices
  for each row execute function public._invoice_to_books();

-- ---------------------------------------------------------------------
-- 3. Books start date (+ opening receivables)
-- ---------------------------------------------------------------------
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
  if v_old is distinct from p_date and exists (
       select 1 from public.client_invoices ci join public.gl_transactions g on g.id = ci.gl_transaction_id
        where ci.company_id = v_company and g.status = 'posted' and coalesce(g.reference, '') <> 'Opening receivable') then
    raise exception 'Invoices are already in the books from % onwards, so the start date can no longer be changed.',
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

    -- Invoices on/after the new date: let the invoice rule post them.
    update public.client_invoices set updated_at = updated_at where company_id = v_company and invoice_date >= p_date;
  end if;

  return jsonb_build_object('start', p_date, 'opening_invoices', n, 'opening_total', v_total);
end;
$$;

revoke all on function public.set_books_start_date(date, uuid) from public, anon;
grant execute on function public.set_books_start_date(date, uuid) to authenticated;
revoke all on function public._gl_post(uuid, date, text, uuid, text, text, jsonb, text) from public, anon;
revoke all on function public._gl_reverse(uuid, text) from public, anon;
grant execute on function public._gl_post(uuid, date, text, uuid, text, text, jsonb, text) to authenticated;
grant execute on function public._gl_reverse(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Fix from Step 1: file credit cards / lines of credit under the chart's credit card heading
-- ---------------------------------------------------------------------
create or replace function public._create_chart_account_for_bank(
  p_company uuid, p_name text, p_account_type text, p_bank_name text default null, p_last4 text default null)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_type   text := public._bank_chart_type(p_account_type);
  v_parent public.chart_of_accounts%rowtype;
  v_base   int;
  v_code   text;
  v_id     uuid;
begin
  if v_type = 'asset' then
    select * into v_parent from public.chart_of_accounts where company_id = p_company and code = '1000' and type = 'asset';
    v_code := coalesce(public._next_free_chart_code(p_company, 1001, 1099), public._next_free_chart_code(p_company, 1001, 1999));
  else
    -- The credit card / line of credit heading, found by name (headers first): e.g. "2500 Credit Cards and Lines of Credit".
    select a.* into v_parent from public.chart_of_accounts a
     where a.company_id = p_company and a.type = 'liability' and a.is_active is not false
       and a.name ~* case when p_account_type = 'line_of_credit' then '(line|lines) of credit' else 'credit card' end
       and a.name !~* '(advance|deposit)'
     order by exists (select 1 from public.chart_of_accounts c where c.parent_id = a.id) desc, a.code
     limit 1;
    if v_parent.id is not null and v_parent.parent_id is not null
       and not exists (select 1 from public.chart_of_accounts c where c.parent_id = v_parent.id) then
      select * into v_parent from public.chart_of_accounts where id = v_parent.parent_id;   -- a leaf "Credit Card Payable": use its heading
    end if;
    if v_parent.code ~ '^[0-9]+$' then
      v_base := (v_parent.code::int / 100) * 100;
      v_code := public._next_free_chart_code(p_company, v_base + 1, v_base + 99);
    end if;
    v_code := coalesce(v_code, public._next_free_chart_code(p_company, 2001, 2999));
  end if;
  if v_code is null then
    raise exception 'No free account code left for a new bank account. Add it in the Chart of Accounts yourself, then link it.';
  end if;

  insert into public.chart_of_accounts (company_id, code, name, type, subtype, parent_id, level, is_active, description, created_by)
  values (p_company, v_code, public._bank_chart_name(p_name, p_bank_name, p_last4), v_type,
          case when v_type = 'asset' then 'bank' else 'current_liability' end,
          v_parent.id, least(coalesce(v_parent.level, 1) + case when v_parent.id is null then 0 else 1 end, 10), true,
          'Bank account' || coalesce(' at ' || nullif(trim(p_bank_name), ''), '') || ' (created from Bank Accounts)', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
