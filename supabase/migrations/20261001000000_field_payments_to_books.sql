-- =====================================================================
-- 20261001000000_field_payments_to_books.sql
-- Field payments go into Expenses AND the books, with the right accounts, and stay in step with the payment.
--
-- Before: saving a field payment made a bare expense line (no account, no "paid from", never in the books), a final payment
-- went in at the FULL amount earned (so the advance was counted twice), and changing or deleting the payment left the
-- expense as it was. "Pay Worker" in the Field app made no expense at all.
--
-- Now (the database does it, so every screen that saves a field payment is covered):
--   * field_payments.charge_account_id  - "Charge to": the expense account (Direct Labour Cost, Subcontractor Costs ...)
--   * field_payments.paid_from_account_id - "Paid from": the cash / bank account the money came out of
--   * field_payments.expense_id / expenses.field_payment_id - the one expense line for the payment (linked both ways)
--   * field_payments.ledger_note - why it is not in the books yet (shown to the user)
--   * The expense amount is the CASH that left: an advance = the advance; a work payment = the amount; a final payment =
--     the balance handed over after the advances it settles (nothing when the advances covered it).
--   * With "Charge to" and "Paid from" chosen (and a books start date set, the payment on or after it), the expense is put
--     in the books: DEBIT Charge to (with the project) / CREDIT Paid from. Change the payment and the entry is reversed and
--     made again; delete or cancel it and the entry is reversed and the expense removed. Drafts are not booked until signed.
--   * Saving a field payment is never blocked: if the books part fails, the reason is kept in ledger_note.
--   * Only expense lines linked to a field payment are ever changed. Imported entries are never touched.
--   * Old payments: their expense lines are linked where they can be matched (same worker, amount and day), their accounts
--     copied over, and old FINAL payment lines not yet in the books are corrected to the cash handed over. Nothing old is
--     put in the books by this step (old final lines where the advances covered everything, and not in the books, are removed). The list at the end shows old lines still missing "Charge to" / "Paid from".
-- Runs as the signed-in user (normal company access rules and every ledger check apply).
-- Safe to run twice.
-- =====================================================================

begin;

alter table public.field_payments add column if not exists charge_account_id   uuid references public.chart_of_accounts(id) on delete set null;
alter table public.field_payments add column if not exists paid_from_account_id uuid references public.chart_of_accounts(id) on delete set null;
alter table public.field_payments add column if not exists expense_id           uuid references public.expenses(id) on delete set null;
alter table public.field_payments add column if not exists ledger_note          text;
alter table public.expenses       add column if not exists field_payment_id     uuid references public.field_payments(id) on delete set null;
create unique index if not exists expenses_field_payment_id_key on public.expenses (field_payment_id) where field_payment_id is not null;

-- The cash that left for a field payment.
create or replace function public._field_payment_cash(f public.field_payments)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select round(case
    when f.payment_type = 'advance' then coalesce(nullif(f.advance_amount, 0), f.total_amount, 0)
    when f.payment_type = 'final' then coalesce(f.total_amount, 0) - least(coalesce(f.total_amount, 0),
           public.field_payment_advances_before(f.company_id, f.worker_ref, f.worker_name, f.worker_id_number, f.project_id, f.project_name,
                                                f.milestone_name, f.task_name, f.created_at, f.id))
    else coalesce(f.total_amount, 0) end, 2);
$$;

create or replace function public._field_payment_sync()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  f        public.field_payments%rowtype;
  e        public.expenses%rowtype;
  v_cash   numeric;
  v_charge uuid;
  v_from   uuid;
  v_desc   text;
  v_start  date;
  v_gl     uuid;
  v_note   text;
  v_ca     public.chart_of_accounts%rowtype;
  v_fa     public.chart_of_accounts%rowtype;
begin
  if coalesce(current_setting('magnus.fp_sync', true), '') = '1' then return null; end if;

  if tg_op = 'DELETE' then
    if old.expense_id is not null then
      begin
        select * into e from public.expenses where id = old.expense_id;
        if e.gl_transaction_id is not null then
          perform public._gl_reverse(e.gl_transaction_id, 'Field payment ' || coalesce(old.receipt_number, '') || ' deleted');
        end if;
        delete from public.expenses where id = old.expense_id;
      exception when others then null;     -- never block deleting
      end;
    end if;
    return null;
  end if;

  f := new;
  if f.expense_id is not null then select * into e from public.expenses where id = f.expense_id; end if;

  begin
    v_cash := case when f.status in ('signed', 'completed') then coalesce(public._field_payment_cash(f), 0) else 0 end;

    if v_cash <= 0 then
      -- nothing to book: draft, cancelled, or a final payment the advances covered
      if e.id is not null then
        if e.gl_transaction_id is not null then
          perform public._gl_reverse(e.gl_transaction_id, 'Field payment ' || coalesce(f.receipt_number, '') || ' ' || coalesce(f.status, 'changed'));
        end if;
        delete from public.expenses where id = e.id;
      end if;
      v_note := case when f.status = 'draft' then 'Draft: goes into Expenses when it is signed.'
                     when f.status = 'cancelled' then null
                     when f.payment_type = 'final' then 'Nothing handed over: the advances covered it.'
                     else null end;
      perform set_config('magnus.fp_sync', '1', true);
      update public.field_payments set expense_id = null, ledger_note = v_note
       where id = f.id and (expense_id is not null or ledger_note is distinct from v_note);
      perform set_config('magnus.fp_sync', '', true);
      return null;
    end if;

    v_charge := coalesce(f.charge_account_id, e.chart_account_id);       -- never clear an account set in Expenses
    v_from   := coalesce(f.paid_from_account_id, e.paid_from_account_id);
    v_desc   := case f.payment_type when 'advance' then 'Advance' when 'final' then 'Final payment (balance after advances)' else 'Field payment' end
                || ' — ' || coalesce(f.worker_name, 'Worker') || coalesce(' (' || nullif(f.work_type, '') || ')', '');

    if e.id is null then
      insert into public.expenses (company_id, project_id, worker_id, expense_date, vendor, description, amount, payment_method, status,
                                   receipt_number, chart_account_id, paid_from_account_id, field_payment_id, created_by)
      values (f.company_id, f.project_id, f.worker_id, coalesce(f.work_date, current_date), f.worker_name, v_desc, v_cash, f.payment_method, 'approved',
              f.receipt_number, v_charge, v_from, f.id, auth.uid())
      returning * into e;
    else
      -- money, day, accounts or project changed on a booked line: take it out of the books first
      if e.gl_transaction_id is not null and (e.amount is distinct from v_cash or e.expense_date is distinct from coalesce(f.work_date, e.expense_date)
           or e.chart_account_id is distinct from v_charge or e.paid_from_account_id is distinct from v_from or e.project_id is distinct from f.project_id) then
        perform public._gl_reverse(e.gl_transaction_id, 'Field payment ' || coalesce(f.receipt_number, '') || ' changed');
        update public.expenses set gl_transaction_id = null where id = e.id;
        e.gl_transaction_id := null;
      end if;
      if (e.amount, e.expense_date, e.project_id, e.worker_id, e.vendor, e.description, e.payment_method, e.status, e.chart_account_id, e.paid_from_account_id)
         is distinct from (v_cash, coalesce(f.work_date, e.expense_date), f.project_id, f.worker_id, f.worker_name, v_desc, f.payment_method, 'approved', v_charge, v_from) then
        update public.expenses
           set amount = v_cash, expense_date = coalesce(f.work_date, expense_date), project_id = f.project_id, worker_id = f.worker_id,
               vendor = f.worker_name, description = v_desc, payment_method = f.payment_method, status = 'approved',
               chart_account_id = v_charge, paid_from_account_id = v_from, updated_at = now()
         where id = e.id
        returning * into e;
      end if;
    end if;

    -- into the books (its own block: if this fails, the expense line above still stays)
    v_note := null;
    if e.gl_transaction_id is null then
     begin
      v_start := public._books_start(f.company_id);
      if v_charge is null or v_from is null then
        v_note := 'In Expenses, not in the books yet: choose "Charge to" and "Paid from" (on the payment, or on the expense).';
      elsif v_start is null then
        v_note := 'In Expenses, not in the books: set the books start date (Bank Accounts).';
      elsif e.expense_date < v_start then
        v_note := 'In Expenses. Before the books start date, so not in the books.';
      else
        select * into v_ca from public.chart_of_accounts where id = v_charge;
        select * into v_fa from public.chart_of_accounts where id = v_from;
        if v_ca.id is null or v_ca.company_id <> f.company_id or v_fa.id is null or v_fa.company_id <> f.company_id then
          raise exception 'an account is not in your Chart of Accounts';
        end if;
        if v_ca.type <> 'expense' then raise exception '"Charge to" must be an expense account (% % is %)', v_ca.code, v_ca.name, v_ca.type; end if;
        if v_fa.type not in ('asset', 'liability') then raise exception '"Paid from" must be a cash, bank or card account'; end if;
        v_gl := public._gl_post(f.company_id, e.expense_date, 'expense', e.id, coalesce(f.receipt_number, 'Field payment'), v_desc,
                  jsonb_build_array(
                    jsonb_build_object('account_id', v_charge, 'debit', v_cash, 'credit', 0, 'project_id', coalesce(f.project_id::text, ''), 'description', v_desc),
                    jsonb_build_object('account_id', v_from, 'debit', 0, 'credit', v_cash, 'project_id', '', 'description', v_desc)));
        update public.expenses set gl_transaction_id = v_gl where id = e.id;
      end if;
     exception when others then
      v_note := left('Not in the books: ' || sqlerrm, 500);
     end;
    end if;
  exception when others then
    v_note := left('Not in Expenses: ' || sqlerrm, 500);
    if e.id is not null and not exists (select 1 from public.expenses where id = e.id) then e.id := null; end if;
  end;

  perform set_config('magnus.fp_sync', '1', true);
  update public.field_payments set expense_id = e.id, ledger_note = v_note
   where id = f.id and (expense_id is distinct from e.id or ledger_note is distinct from v_note);
  perform set_config('magnus.fp_sync', '', true);
  return null;
end;
$$;

drop trigger if exists field_payment_sync on public.field_payments;
create trigger field_payment_sync
  after insert or update or delete on public.field_payments
  for each row execute function public._field_payment_sync();

revoke all on function public._field_payment_cash(public.field_payments) from public, anon;
grant execute on function public._field_payment_cash(public.field_payments) to authenticated;
revoke all on function public._field_payment_sync() from public, anon;

-- ── Old payments: link the expense lines the app made before (same company, worker, amount and day) ──────────────────────
do $$
declare
  f record;
  v_exp uuid;
begin
  perform set_config('magnus.fp_sync', '1', true);
  for f in select * from public.field_payments where expense_id is null and status in ('signed', 'completed') order by created_at loop
    select e.id into v_exp
      from public.expenses e
     where e.company_id = f.company_id and e.field_payment_id is null
       and (e.description like 'Advance — ' || f.worker_name || '%' or e.description like 'Field Payment — ' || f.worker_name || '%')
       and round(e.amount, 2) = round(case when f.payment_type = 'advance' then coalesce(nullif(f.advance_amount, 0), f.total_amount) else f.total_amount end, 2)
       and e.expense_date between coalesce(f.work_date, (f.created_at at time zone 'America/Jamaica')::date) - 1
                              and coalesce(f.work_date, (f.created_at at time zone 'America/Jamaica')::date) + 1
     order by abs(extract(epoch from (e.created_at - f.created_at)))
     limit 1;
    if v_exp is not null then
      update public.expenses set field_payment_id = f.id where id = v_exp;
      update public.field_payments fp
         set expense_id = v_exp,
             charge_account_id = coalesce(fp.charge_account_id, (select chart_account_id from public.expenses where id = v_exp)),
             paid_from_account_id = coalesce(fp.paid_from_account_id, (select paid_from_account_id from public.expenses where id = v_exp))
       where fp.id = f.id;
    end if;
  end loop;

  -- old FINAL payment lines not in the books yet: the cash handed over, not the full amount earned
  update public.expenses e
     set amount = public._field_payment_cash(fp), description = 'Final payment (balance after advances) — ' || coalesce(fp.worker_name, 'Worker')
                                                                || coalesce(' (' || nullif(fp.work_type, '') || ')', ''), updated_at = now()
    from public.field_payments fp
   where e.field_payment_id = fp.id and fp.payment_type = 'final' and e.gl_transaction_id is null
     and public._field_payment_cash(fp) > 0 and e.amount is distinct from public._field_payment_cash(fp);
  -- ... and old FINAL lines where nothing was handed over (the advances covered it) and not in the books: that money never left
  delete from public.expenses e
   using public.field_payments fp
   where e.field_payment_id = fp.id and fp.payment_type = 'final' and e.gl_transaction_id is null and public._field_payment_cash(fp) <= 0;
  perform set_config('magnus.fp_sync', '', true);
end $$;

commit;

-- Old field-payment expense lines still missing "Charge to" or "Paid from" (fix them in Expenses → Edit):
select e.expense_date, e.description, e.amount,
       case when e.chart_account_id is null then 'missing' else 'ok' end as charge_to,
       case when e.paid_from_account_id is null then 'missing' else 'ok' end as paid_from,
       case when e.gl_transaction_id is null then 'not in the books' else 'in the books' end as books
  from public.expenses e
 where e.field_payment_id is not null and (e.chart_account_id is null or e.paid_from_account_id is null)
 order by e.expense_date;
