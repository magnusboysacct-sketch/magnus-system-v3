-- =====================================================================
-- Banking Step 4b-3 - advances to suppliers and contractors
-- Magnus Boy's System
--
-- The standard way:
--   * Giving an advance (money before the bill):  DEBIT Advances to Suppliers and Subcontractors (asset)
--                                                 CREDIT the bank / cash / card
--     It is NOT a cost yet: the contractor owes you that much work or goods.
--   * Using it on their bill (Apply advance): the advance is split, and the part used becomes a payment on the bill.
--     Advances go down, what you owe on the bill goes down; the bank does not change again.
--   * Unapply (undo on the bill) gives the amount back to the advance.
--
--   * supplier_payments.is_advance, project_id (the job it is for), applied_from_payment_id, applied_on.
--   * pay_supplier_advance(...) - with the same proof of payment as a bill payment (signature, photo).
--   * apply_supplier_advance(advance, bill, amount, date) - same supplier, never more than is left or still owed.
--   * The account "Advances to Suppliers and Subcontractors" is made under 1300 Prepaid Expenses the first time.
--   * undo_bill_payment(): an advance that is partly used on a bill must be unapplied first.
-- Runs as the signed-in user (normal company access rules and every ledger check apply). Safe to run twice.
-- =====================================================================

alter table public.supplier_payments add column if not exists is_advance boolean not null default false;
alter table public.supplier_payments add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.supplier_payments add column if not exists applied_from_payment_id uuid references public.supplier_payments(id) on delete set null;
alter table public.supplier_payments add column if not exists applied_on date;

create or replace function public._find_supplier_advances(p_company uuid)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v uuid;
  v_code text;
  v_parent uuid;
begin
  select id into v from public.chart_of_accounts
   where company_id = p_company and type = 'asset' and is_active is not false
     and name ~* '((supplier|vendor|subcontractor|contractor)s?\M.*(advance|deposit|prepay))|(advances? (paid )?to (supplier|subcontractor|contractor|vendor))'
   order by code limit 1;
  if v is not null then return v; end if;

  select id into v_parent from public.chart_of_accounts where company_id = p_company and code = '1300' and type = 'asset';
  v_code := coalesce(public._next_free_chart_code(p_company, 1330, 1399), public._next_free_chart_code(p_company, 1001, 1999));
  insert into public.chart_of_accounts (company_id, code, name, type, subtype, parent_id, level, is_active, description, created_by)
  values (p_company, v_code, 'Advances to Suppliers and Subcontractors', 'asset', 'prepaid_expense', v_parent,
          case when v_parent is null then 1 else 2 end, true,
          'Money paid before the bill: the supplier or contractor still owes the work or goods', auth.uid())
  returning id into v;
  return v;
end;
$$;

-- Same as 20260976, plus advances: DEBIT Advances to Suppliers and Subcontractors (an asset: work or goods still owed to you).
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
  v_sig := case when v_should then concat_ws('|', r.amount, r.payment_date, r.paid_from_account_id, r.invoice_id, r.is_retention_release)
                   || case when r.is_advance then '|adv|' || coalesce(r.project_id::text, '') else '' end end;

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
      if r.invoice_id is null and r.is_advance then
        v_debit := public._find_supplier_advances(r.company_id);
        v_what := 'Advance';
      elsif r.is_retention_release then
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
          jsonb_build_object('account_id', v_debit, 'debit', r.amount, 'credit', 0, 'project_id', coalesce(v_bill.project_id, r.project_id),
                             'description', v_what || coalesce(' - ' || v_sup, '')),
          jsonb_build_object('account_id', r.paid_from_account_id, 'debit', 0, 'credit', r.amount, 'project_id', coalesce(v_bill.project_id, r.project_id),
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

-- Taking an applied part off a bill gives the amount back to its advance.
create or replace function public._restore_applied_supplier_advance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.applied_from_payment_id is not null then
    update public.supplier_payments set amount = round(amount + old.amount, 2)
     where id = old.applied_from_payment_id and invoice_id is null;
  end if;
  return old;
end;
$$;

drop trigger if exists restore_applied_supplier_advance on public.supplier_payments;
create trigger restore_applied_supplier_advance
  after delete on public.supplier_payments
  for each row execute function public._restore_applied_supplier_advance();

-- Give an advance (before the bill), with the proof in the same step.
create or replace function public.pay_supplier_advance(p_supplier uuid, p_project uuid, p_amount numeric, p_date date, p_paid_from uuid,
                                                       p_method text default 'wire', p_reference text default null,
                                                       p_received_by text default null, p_signature text default null, p_proof_path text default null)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  v_from    public.chart_of_accounts%rowtype;
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_id      uuid;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can give advances.'; end if;
  if p_supplier is null or not exists (select 1 from public.suppliers where id = p_supplier and company_id = v_company) then
    raise exception 'Choose who the advance is for.';
  end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project and company_id = v_company) then
    raise exception 'That project is not in your company.';
  end if;
  if v_amt <= 0 then raise exception 'Type an amount above zero.'; end if;
  if p_date is null then raise exception 'Choose the date it was paid.'; end if;
  if p_paid_from is null then raise exception 'Choose where the money was paid from.'; end if;
  select * into v_from from public.chart_of_accounts where id = p_paid_from and company_id = v_company;
  if v_from.id is null or not public._is_money_account(v_from) then raise exception '"Paid from" must be one of your bank, cash or card accounts.'; end if;
  if coalesce(p_method, '') not in ('check', 'ach', 'wire', 'credit_card', 'cash', 'other') then raise exception 'Choose how it was paid.'; end if;
  if nullif(p_signature, '') is not null and trim(coalesce(p_received_by, '')) = '' then raise exception 'Type the name of the person who signed.'; end if;
  if exists (select 1 from public.supplier_payments where company_id = v_company and supplier_id = p_supplier and is_advance and invoice_id is null
               and amount = v_amt and payment_date = p_date and paid_from_account_id = p_paid_from and created_at > now() - interval '2 minutes') then
    raise exception 'This same advance was just saved. Check the list before saving again.';
  end if;

  perform public._find_supplier_advances(v_company);   -- make the account now if it is missing
  insert into public.supplier_payments (company_id, supplier_id, invoice_id, project_id, payment_number, payment_date, amount, payment_method,
                                        check_number, reference_number, notes, created_by, paid_from_account_id, is_advance,
                                        received_by_name, signature_data, proof_path)
  values (v_company, p_supplier, null, p_project,
          'ADV-' || lpad(((select count(*) from public.supplier_payments where company_id = v_company and is_advance and applied_from_payment_id is null) + 1)::text, 4, '0'),
          p_date, v_amt, p_method,
          case when p_method = 'check' then nullif(trim(coalesce(p_reference, '')), '') end,
          nullif(trim(coalesce(p_reference, '')), ''), 'Advance', auth.uid(), p_paid_from, true,
          nullif(trim(coalesce(p_received_by, '')), ''), nullif(p_signature, ''), nullif(p_proof_path, ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Use (part of) an advance on that supplier's bill.
create or replace function public.apply_supplier_advance(p_advance uuid, p_bill uuid, p_amount numeric, p_date date default null)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  a         public.supplier_payments%rowtype;
  b         public.supplier_invoices%rowtype;
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_reg_paid numeric;
  v_owed    numeric;
  v_id      uuid;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can use advances on bills.'; end if;
  select * into a from public.supplier_payments where id = p_advance and company_id = v_company for update;
  if a.id is null or not a.is_advance or a.invoice_id is not null then raise exception 'Advance not found.'; end if;
  select * into b from public.supplier_invoices where id = p_bill and company_id = v_company for update;
  if b.id is null then raise exception 'Bill not found.'; end if;
  if b.supplier_id is distinct from a.supplier_id then raise exception 'This advance was given to someone else, not the supplier on bill %.', b.invoice_number; end if;
  if b.status = 'pending' then raise exception 'Approve the bill first, then use the advance on it.'; end if;
  if b.status = 'disputed' then raise exception 'This bill is disputed. Approve it again first.'; end if;
  if v_amt <= 0 then raise exception 'Type an amount above zero.'; end if;
  if v_amt > round(a.amount, 2) then raise exception 'Only % is left on this advance.', to_char(a.amount, 'FM999,999,999,990.00'); end if;
  select coalesce(sum(amount), 0) into v_reg_paid from public.supplier_payments where invoice_id = b.id and not is_retention_release;
  v_owed := round(coalesce(b.total_amount, 0) - coalesce(b.retention_amount, 0) - v_reg_paid, 2);
  if v_amt > v_owed then
    raise exception 'Only % is owed on bill % now (retention is paid separately).', to_char(greatest(v_owed, 0), 'FM999,999,999,990.00'), b.invoice_number;
  end if;

  insert into public.supplier_payments (company_id, supplier_id, invoice_id, project_id, payment_number, payment_date, amount, payment_method,
                                        reference_number, notes, created_by, paid_from_account_id, is_advance,
                                        applied_from_payment_id, applied_on)
  values (v_company, a.supplier_id, b.id, a.project_id, left(coalesce(a.payment_number, 'ADV') || '-' || b.invoice_number, 100),
          a.payment_date, v_amt, a.payment_method, a.reference_number,
          'From advance ' || coalesce(a.payment_number, '') || ', used on ' || to_char(coalesce(p_date, current_date), 'DD Mon YYYY'),
          auth.uid(), a.paid_from_account_id, true, a.id, coalesce(p_date, current_date))
  returning id into v_id;

  update public.supplier_payments set amount = round(amount - v_amt, 2) where id = a.id;
  return v_id;
end;
$$;

-- Undo: same as 20260977, and a partly used advance must be unapplied first.
create or replace function public.undo_bill_payment(p_id uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  p         public.supplier_payments%rowtype;
begin
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can undo a bill payment.'; end if;
  select * into p from public.supplier_payments where id = p_id and company_id = v_company;
  if p.id is null then raise exception 'Payment not found.'; end if;
  if (p.signed_at is not null or p.proof_path is not null) and v_role not in ('director', 'admin') then
    raise exception 'This payment has proof (signed or a photo). Only a director or admin can undo it.';
  end if;
  if p.is_advance and p.invoice_id is null and exists (select 1 from public.supplier_payments x where x.applied_from_payment_id = p.id) then
    raise exception 'Part of this advance is used on a bill. Take it off the bill first (Unapply on the bill), then undo the advance.';
  end if;
  delete from public.supplier_payments where id = p_id;
end;
$$;

revoke all on function public._find_supplier_advances(uuid) from public, anon;
grant execute on function public._find_supplier_advances(uuid) to authenticated;
grant execute on function public.pay_supplier_advance(uuid, uuid, numeric, date, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.apply_supplier_advance(uuid, uuid, numeric, date) to authenticated;
grant execute on function public.undo_bill_payment(uuid) to authenticated;
