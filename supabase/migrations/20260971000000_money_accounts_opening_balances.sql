-- =====================================================================
-- Banking Step 2b - money accounts, opening balances, clearer bank account names
-- Magnus Boy's System
--
--   * _is_money_account(account) - what a transfer can use (the standard "Bank" account type): an active, non-header
--     asset account that is marked Bank (subtype 'bank'), OR linked to a bank account, OR named like petty cash /
--     cash on hand / undeposited funds; and credit cards / lines of credit linked to a bank account.
--     Receivables, inventory, prepaid and header accounts ("1000 Cash and Cash Equivalents") are never money accounts.
--   * money_accounts() - that list with books balances, for the Transfer screen.
--   * money_transfer() now uses the same rule.
--   * bank_account_set_opening_balance(bank, amount, date) - the standard first step for a bank account in the books:
--     what the statement said on the day your books start. One posted entry against "Opening Balance Equity"
--     (found by name, or created as an equity account in 3900-3999). Only one per bank account; undo it with
--     money_transfer_undo() (now also accepts opening balances).
--   * New chart accounts made from a bank account are named "Bank - Name ••1234"; the ones made by the previous step
--     are renamed the same way (only accounts it created, still carrying its description).
-- Runs as the signed-in user (normal company access rules apply).
-- Safe to run twice.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Money accounts
-- ---------------------------------------------------------------------
create or replace function public._is_money_account(a public.chart_of_accounts)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(a.is_active is not false
     and not exists (select 1 from public.chart_of_accounts c where c.parent_id = a.id and c.is_active is not false)
     and (
       (a.type = 'asset'
        and coalesce(a.name, '') !~* '(receivable|inventory|prepaid|deposit paid|retainage|advance tax|input credit)'
        and (coalesce(a.subtype, '') = 'bank'
             or exists (select 1 from public.bank_accounts b where b.chart_account_id = a.id)
             or a.name ~* '(petty[ -]?cash|cash on hand|cash in hand|undeposited|cash float|job fund)'))
       or (a.type = 'liability' and exists (select 1 from public.bank_accounts b where b.chart_account_id = a.id))
     ), false);   -- never NULL: an unknown must count as "not a money account"
$$;

create or replace function public.money_accounts()
returns table (id uuid, code text, name text, type text, current_balance numeric, is_bank boolean)
language sql
stable
set search_path = public, pg_temp
as $$
  select a.id, a.code, a.name, a.type, coalesce(a.current_balance, 0),
         exists (select 1 from public.bank_accounts b where b.chart_account_id = a.id)
    from public.chart_of_accounts a
   where a.company_id = (select company_id from public.user_profiles where id = auth.uid())
     and public._is_money_account(a)
   order by a.code;
$$;

create or replace function public._money_account_ok(p_company uuid, p_account uuid)
returns public.chart_of_accounts
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  a public.chart_of_accounts%rowtype;
begin
  select * into a from public.chart_of_accounts where id = p_account;
  if a.id is null or a.company_id <> p_company then
    raise exception 'That account is not in your Chart of Accounts.';
  end if;
  if a.is_active is false then
    raise exception 'Account % % is inactive.', a.code, a.name;
  end if;
  if not public._is_money_account(a) then
    raise exception '% % is not a bank, cash or fund account. To use it for transfers, mark it as Bank in the Chart of Accounts.',
      a.code, a.name;
  end if;
  return a;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Opening balances
-- ---------------------------------------------------------------------
create or replace function public._opening_balance_equity(p_company uuid)
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
   where company_id = p_company and is_active is not false and type in ('equity', 'liability')
     and name ~* '^opening balance'
   order by (type = 'equity') desc, code limit 1;
  if v is not null then return v; end if;

  v_code := coalesce(public._next_free_chart_code(p_company, 3900, 3999), public._next_free_chart_code(p_company, 3001, 3999));
  select id into v_parent from public.chart_of_accounts where company_id = p_company and code = '3000' and type = 'equity';
  insert into public.chart_of_accounts (company_id, code, name, type, subtype, parent_id, level, is_active, description, created_by)
  values (p_company, v_code, 'Opening Balance Equity', 'equity', 'owner_equity', v_parent, case when v_parent is null then 1 else 2 end,
          true, 'Balances brought in when a bank account was started in Magnus', auth.uid())
  returning id into v;
  return v;
end;
$$;

create or replace function public.bank_account_set_opening_balance(p_bank uuid, p_amount numeric, p_date date)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  b public.bank_accounts%rowtype;
  a public.chart_of_accounts%rowtype;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_obe uuid;
  v_id uuid;
  v_number text;
  v_dr uuid; v_cr uuid;
begin
  select * into b from public.bank_accounts where id = p_bank;
  if b.id is null or b.company_id is distinct from v_company then raise exception 'Bank account not found.'; end if;
  if b.chart_account_id is null then raise exception 'Put this bank account in your books first (Create in chart or Link).'; end if;
  if p_date is null then raise exception 'Choose the date your books start for this account.'; end if;
  if v_amount = 0 then raise exception 'The opening balance is zero, so there is nothing to record.'; end if;
  if exists (select 1 from public.gl_transactions where source_type = 'opening_balance' and source_id = b.id and status <> 'voided') then
    raise exception 'This bank account already has an opening balance. Undo it first to change it.';
  end if;
  select * into a from public.chart_of_accounts where id = b.chart_account_id;

  v_obe := public._opening_balance_equity(v_company);
  -- Money in the bank (asset) or owed on a card (liability); a negative amount is an overdraft / credit balance.
  if (a.type = 'asset') = (v_amount > 0) then v_dr := a.id; v_cr := v_obe; else v_dr := v_obe; v_cr := a.id; end if;

  v_number := public._next_gl_number(v_company, p_date);
  insert into public.gl_transactions (company_id, transaction_number, transaction_date, reference, source_type, source_id,
                                      description, total_amount, currency, status, notes, created_by)
  values (v_company, v_number, p_date, 'Opening balance', 'opening_balance', b.id,
          left('Opening balance: ' || a.code || ' ' || a.name, 500), abs(v_amount), 'JMD', 'draft',
          'Balance on the bank statement on ' || to_char(p_date, 'DD Mon YYYY'), auth.uid())
  returning id into v_id;

  insert into public.gl_entries (transaction_id, company_id, account_id, debit, credit, description, line_number, entry_type)
  values (v_id, v_company, v_dr, abs(v_amount), 0, 'Opening balance', 1, 'opening_balance'),
         (v_id, v_company, v_cr, 0, abs(v_amount), 'Opening balance', 2, 'opening_balance');

  update public.gl_transactions set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = v_id;
  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

-- Undo also works for opening balances (same reversing entry; the original is marked voided).
create or replace function public.money_transfer_undo(p_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  g public.gl_transactions%rowtype;
  v_rev uuid;
  v_number text;
  v_reason text := left(trim(coalesce(p_reason, '')), 300);
begin
  select * into g from public.gl_transactions where id = p_id;
  if g.id is null or g.company_id is distinct from v_company then raise exception 'Entry not found.'; end if;
  if g.source_type not in ('fund_transfer', 'opening_balance') then raise exception 'Only transfers and opening balances can be undone here.'; end if;
  if g.status <> 'posted' then raise exception 'This was already undone.'; end if;
  if length(v_reason) < 3 then raise exception 'Write why you are undoing it.'; end if;

  v_number := public._next_gl_number(v_company, current_date);
  insert into public.gl_transactions (company_id, transaction_number, transaction_date, reference, source_type, source_id,
                                      description, total_amount, currency, status, notes, created_by)
  values (v_company, v_number, current_date, 'VOID: ' || g.transaction_number, 'adjustment', null,
          left('Undo ' || g.transaction_number || ': ' || g.description, 500), g.total_amount, 'JMD', 'draft',
          'Reason: ' || v_reason, auth.uid())
  returning id into v_rev;

  insert into public.gl_entries (transaction_id, company_id, account_id, debit, credit, project_id, description, line_number, entry_type)
  select v_rev, v_company, e.account_id, e.credit, e.debit, e.project_id, left('Undo: ' || coalesce(e.description, ''), 500),
         e.line_number, 'adjustment'
    from public.gl_entries e where e.transaction_id = g.id;

  update public.gl_transactions set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = v_rev;
  update public.gl_transactions
     set status = 'voided', posted_at = null,
         notes = trim(coalesce(notes, '') || ' | Undone ' || to_char(now() at time zone 'America/Jamaica', 'YYYY-MM-DD HH24:MI')
                      || ' by ' || v_number || '. Reason: ' || v_reason)
   where id = g.id;

  return jsonb_build_object('reversal_id', v_rev, 'number', v_number);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Clearer names for chart accounts made from bank accounts
-- ---------------------------------------------------------------------
create or replace function public._bank_chart_name(p_name text, p_bank_name text, p_last4 text)
returns text
language sql
immutable
as $$
  select left(
    case when nullif(trim(coalesce(p_bank_name, '')), '') is not null
              and position(lower(trim(p_bank_name)) in lower(p_name)) = 0
         then trim(p_bank_name) || ' - ' || trim(p_name) else trim(p_name) end
    || case when nullif(trim(coalesce(p_last4, '')), '') is not null then ' ••' || trim(p_last4) else '' end, 200);
$$;

drop function if exists public._create_chart_account_for_bank(uuid, text, text, text);

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
  v_code   text;
  v_id     uuid;
begin
  if v_type = 'asset' then
    select * into v_parent from public.chart_of_accounts where company_id = p_company and code = '1000' and type = 'asset';
    v_code := coalesce(public._next_free_chart_code(p_company, 1001, 1099), public._next_free_chart_code(p_company, 1001, 1999));
  else
    select * into v_parent from public.chart_of_accounts
     where company_id = p_company and type = 'liability'
       and code = case when p_account_type = 'line_of_credit' then '2410' else '2400' end;
    if v_parent.id is null then
      select * into v_parent from public.chart_of_accounts where company_id = p_company and code = '2400' and type = 'liability';
    end if;
    v_code := coalesce(
      case when p_account_type = 'line_of_credit' then public._next_free_chart_code(p_company, 2411, 2419)
           else public._next_free_chart_code(p_company, 2401, 2409) end,
      public._next_free_chart_code(p_company, 2401, 2499),
      public._next_free_chart_code(p_company, 2001, 2999));
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

create or replace function public._bank_account_chart_link()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  a public.chart_of_accounts%rowtype;
  v_type text := public._bank_chart_type(new.account_type);
begin
  if tg_op = 'INSERT' and new.chart_account_id is null then
    new.chart_account_id := public._create_chart_account_for_bank(new.company_id, new.account_name, new.account_type,
                                                                  new.bank_name, new.account_number_last_4);
    return new;
  end if;

  if new.chart_account_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.chart_account_id is not distinct from old.chart_account_id
     and new.account_type is not distinct from old.account_type then
    return new;
  end if;

  select * into a from public.chart_of_accounts where id = new.chart_account_id;
  if a.id is null or a.company_id <> new.company_id then
    raise exception 'That account is not in your Chart of Accounts.';
  end if;
  if a.is_active is false then
    raise exception 'Account % % is inactive. Reactivate it in the Chart of Accounts first.', a.code, a.name;
  end if;
  if a.type <> v_type then
    raise exception '% must be linked to % account (% % is %).',
      case when v_type = 'asset' then 'A bank account' else 'A credit card or line of credit' end,
      case when v_type = 'asset' then 'an asset (bank / cash)' else 'a liability' end, a.code, a.name, a.type;
  end if;
  if exists (select 1 from public.bank_accounts b where b.chart_account_id = new.chart_account_id and b.id <> new.id) then
    raise exception 'Account % % is already linked to another bank account.', a.code, a.name;
  end if;
  if a.type = 'asset' and a.subtype is distinct from 'bank' then
    update public.chart_of_accounts set subtype = 'bank' where id = a.id;
  end if;
  return new;
end;
$$;

create or replace function public.bank_account_create_chart_account(p_bank uuid)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  b  public.bank_accounts%rowtype;
  v  uuid;
begin
  select * into b from public.bank_accounts where id = p_bank;
  if b.id is null then raise exception 'Bank account not found.'; end if;
  if b.chart_account_id is not null then return b.chart_account_id; end if;
  v := public._create_chart_account_for_bank(b.company_id, b.account_name, b.account_type, b.bank_name, b.account_number_last_4);
  update public.bank_accounts set chart_account_id = v, updated_at = now() where id = b.id;
  return v;
end;
$$;

-- Rename the accounts the previous step created (still carrying its description and the bank account's plain name).
update public.chart_of_accounts a
   set name = public._bank_chart_name(b.account_name, b.bank_name, b.account_number_last_4), updated_at = now()
  from public.bank_accounts b
 where b.chart_account_id = a.id
   and a.description like 'Bank account%(created from Bank Accounts)'
   and a.name = left(trim(b.account_name), 200)
   and a.name <> public._bank_chart_name(b.account_name, b.bank_name, b.account_number_last_4);

-- ---------------------------------------------------------------------
-- 4. Who may call what
-- ---------------------------------------------------------------------
revoke all on function public.money_accounts() from public, anon;
revoke all on function public.bank_account_set_opening_balance(uuid, numeric, date) from public, anon;
revoke all on function public._create_chart_account_for_bank(uuid, text, text, text, text) from public, anon;
revoke all on function public._opening_balance_equity(uuid) from public, anon;
grant execute on function public.money_accounts() to authenticated;
grant execute on function public.bank_account_set_opening_balance(uuid, numeric, date) to authenticated;
grant execute on function public._create_chart_account_for_bank(uuid, text, text, text, text) to authenticated;
grant execute on function public._opening_balance_equity(uuid) to authenticated;
grant execute on function public._is_money_account(public.chart_of_accounts) to authenticated;
