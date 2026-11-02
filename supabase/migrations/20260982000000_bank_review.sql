-- =====================================================================
-- Banking Step 5 - bank statement lines: match them to the books, or add them
-- Magnus Boy's System
--
-- The standard way (QuickBooks "For review" / Xero bank reconciliation): every line on the bank statement is either
--   * MATCHED to an entry already in the books (a client payment deposited, a bill paid, a transfer, an expense...)
--     - nothing new is posted, the line just points at that entry; or
--   * ADDED - something only the bank knows about yet (bank fees, interest, a card payment never recorded):
--       money out:  DEBIT the account you choose (e.g. Bank Charges)   CREDIT the bank
--       money in:   DEBIT the bank                                     CREDIT the account you choose (e.g. Interest Income); or
--   * EXCLUDED - not real for the books (a duplicate line, a reversal that cancels out).
-- Undo puts the line back to review (an added entry is reversed, a match is just let go).
--
--   * bank_transactions.review_action (matched / added / excluded; empty = to review), reviewed_by, reviewed_at.
--     The line's direction: transaction_type credit / transfer_in = money IN, debit / transfer_out = money OUT
--     (amount is stored positive).
--   * gl_transactions.source_type gains 'bank_line' (entries added from a statement line).
--   * bank_line_suggestions(line): entries in the books on that bank's chart account, same direction and amount,
--     within 10 days, not matched to another line.
--   * bank_line_match(line, entry), bank_line_add(line, account, project, note), bank_line_exclude(line, reason),
--     bank_line_undo(line), bank_auto_match(bank account): matches every line that has exactly ONE suggestion
--     within 3 days.
--   * Only a director, admin or office user. A bank account must be linked to its chart account (Bank Accounts page).
-- Runs as the signed-in user (normal company access rules and every ledger check apply). Safe to run twice.
-- =====================================================================

alter table public.bank_transactions add column if not exists review_action text check (review_action in ('matched', 'added', 'excluded'));
alter table public.bank_transactions add column if not exists reviewed_by uuid references auth.users(id);
alter table public.bank_transactions add column if not exists reviewed_at timestamptz;
create index if not exists idx_bank_transactions_review on public.bank_transactions (bank_account_id, review_action);

alter table public.gl_transactions drop constraint if exists gl_transactions_source_type_check;
alter table public.gl_transactions add constraint gl_transactions_source_type_check
  check (source_type in ('manual', 'client_payment', 'supplier_payment', 'expense', 'payroll', 'invoice', 'procurement',
                         'bank_transfer', 'adjustment', 'opening_balance', 'supplier_invoice', 'fund_transfer', 'bank_line'));

-- The line, its bank's chart account and direction, checked for the caller.
create or replace function public._bank_line_for(p_line uuid, out line public.bank_transactions, out bank_acct uuid, out money_in boolean)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can review bank lines.'; end if;
  select * into line from public.bank_transactions where id = p_line and company_id = v_company;
  if line.id is null then raise exception 'Bank line not found.'; end if;
  select b.chart_account_id into bank_acct from public.bank_accounts b where b.id = line.bank_account_id;
  if bank_acct is null then raise exception 'This bank account is not linked to your chart of accounts yet. Link it on the Bank Accounts page first.'; end if;
  money_in := coalesce(line.transaction_type, 'debit') in ('credit', 'transfer_in');
end;
$$;

create or replace function public._bank_line_candidates(p_line uuid, p_days int)
returns table (id uuid, transaction_number text, transaction_date date, description text, source_type text, amount numeric, days_apart int)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  x record;
begin
  select * into x from public._bank_line_for(p_line);
  return query
    select g.id, g.transaction_number, g.transaction_date, g.description, g.source_type,
           case when x.money_in then e.debit else e.credit end,
           abs(g.transaction_date - (x.line).transaction_date)::int
      from public.gl_transactions g
      join lateral (select sum(ge.debit) debit, sum(ge.credit) credit from public.gl_entries ge
                     where ge.transaction_id = g.id and ge.account_id = x.bank_acct) e on true
     where g.company_id = (x.line).company_id and g.status = 'posted'
       and abs(g.transaction_date - (x.line).transaction_date) <= p_days
       and round(case when x.money_in then e.debit - e.credit else e.credit - e.debit end, 2) = round(abs((x.line).amount), 2)
       and not exists (select 1 from public.bank_transactions bt
                        where bt.gl_transaction_id = g.id and bt.review_action in ('matched', 'added') and bt.id <> p_line)
     order by abs(g.transaction_date - (x.line).transaction_date), g.transaction_date, g.transaction_number;
end;
$$;

create or replace function public.bank_line_suggestions(p_line uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from (select * from public._bank_line_candidates(p_line, 10) limit 5) c;
$$;

create or replace function public.bank_line_match(p_line uuid, p_entry uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  x record;
begin
  select * into x from public._bank_line_for(p_line);
  if (x.line).review_action is not null then raise exception 'This line is already done. Undo it first.'; end if;
  if not exists (select 1 from public._bank_line_candidates(p_line, 31) c where c.id = p_entry) then
    raise exception 'That entry does not match this line (same bank, same amount in the same direction, not matched to another line).';
  end if;
  update public.bank_transactions
     set review_action = 'matched', gl_transaction_id = p_entry, match_status = 'matched', match_type = 'manual',
         matched_entity_type = 'gl_transaction', matched_entity_id = p_entry, matched_by = auth.uid(), matched_at = now(),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_line;
end;
$$;

create or replace function public.bank_line_add(p_line uuid, p_account uuid, p_project uuid default null, p_note text default null)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  x       record;
  a       public.chart_of_accounts%rowtype;
  v_start date;
  v_amt   numeric;
  v_desc  text;
  v_id    uuid;
begin
  select * into x from public._bank_line_for(p_line);
  if (x.line).review_action is not null then raise exception 'This line is already done. Undo it first.'; end if;
  v_start := public._books_start((x.line).company_id);
  if v_start is null then raise exception 'Set the books start date first (Bank Accounts page).'; end if;
  if (x.line).transaction_date < v_start then raise exception 'This line is before the books start date (%). Exclude it instead.', to_char(v_start, 'DD Mon YYYY'); end if;

  select * into a from public.chart_of_accounts where id = p_account and company_id = (x.line).company_id;
  if a.id is null or a.is_active is false then raise exception 'Choose an active account from your chart.'; end if;
  if a.id = x.bank_acct then raise exception 'Choose the other side of the money, not the bank account itself.'; end if;
  if exists (select 1 from public.chart_of_accounts c where c.parent_id = a.id and c.is_active is not false) then
    raise exception '% % is a heading. Choose one of the accounts under it.', a.code, a.name;
  end if;
  if a.subtype in ('accounts_receivable', 'accounts_payable') or a.name ~* '(receivable|payable)' then
    raise exception 'For a client payment use Record Payment, for a supplier use Pay bill, then come back and Match the line.';
  end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project and company_id = (x.line).company_id) then
    raise exception 'That project is not in your company.';
  end if;

  v_amt := round(abs((x.line).amount), 2);
  if v_amt <= 0 then raise exception 'This line has no amount.'; end if;
  v_desc := left(coalesce(nullif(trim(p_note), ''), (x.line).description), 300);
  v_id := public._gl_post((x.line).company_id, (x.line).transaction_date, 'bank_line', (x.line).id,
            left(coalesce(nullif((x.line).reference_number, ''), 'Bank line'), 200), v_desc,
            case when x.money_in then jsonb_build_array(
                   jsonb_build_object('account_id', x.bank_acct, 'debit', v_amt, 'credit', 0, 'project_id', p_project, 'description', v_desc),
                   jsonb_build_object('account_id', a.id, 'debit', 0, 'credit', v_amt, 'project_id', p_project, 'description', v_desc))
                 else jsonb_build_array(
                   jsonb_build_object('account_id', a.id, 'debit', v_amt, 'credit', 0, 'project_id', p_project, 'description', v_desc),
                   jsonb_build_object('account_id', x.bank_acct, 'debit', 0, 'credit', v_amt, 'project_id', p_project, 'description', v_desc)) end);
  update public.bank_transactions
     set review_action = 'added', gl_transaction_id = v_id, match_status = 'matched', match_type = 'manual',
         matched_entity_type = 'gl_transaction', matched_entity_id = v_id, matched_by = auth.uid(), matched_at = now(),
         notes = coalesce(nullif(trim(p_note), ''), notes), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_line;
  return v_id;
end;
$$;

create or replace function public.bank_line_exclude(p_line uuid, p_reason text default null)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  x record;
begin
  select * into x from public._bank_line_for(p_line);
  if (x.line).review_action is not null then raise exception 'This line is already done. Undo it first.'; end if;
  update public.bank_transactions
     set review_action = 'excluded', notes = coalesce(nullif(trim(p_reason), ''), notes),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_line;
end;
$$;

create or replace function public.bank_line_undo(p_line uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  x record;
begin
  select * into x from public._bank_line_for(p_line);
  if (x.line).review_action is null then return; end if;
  if (x.line).match_status = 'reconciled' then raise exception 'This line is reconciled. Undo the reconciliation first.'; end if;
  if (x.line).review_action = 'added' and (x.line).gl_transaction_id is not null then
    perform public._gl_reverse((x.line).gl_transaction_id, 'Bank line put back to review');
  end if;
  update public.bank_transactions
     set review_action = null, gl_transaction_id = null, match_status = 'unmatched', match_type = null,
         matched_entity_type = null, matched_entity_id = null, matched_by = null, matched_at = null,
         reviewed_by = null, reviewed_at = null, updated_at = now()
   where id = p_line;
end;
$$;

-- Match every line of a bank account that has exactly one entry with the same amount within 3 days.
create or replace function public.bank_auto_match(p_bank_account uuid)
returns int
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  l   record;
  v_only uuid;
  n   int := 0;
  k   int;
begin
  if not exists (select 1 from public.bank_accounts where id = p_bank_account and company_id = v_company) then
    raise exception 'Bank account not found.';
  end if;
  for l in select id from public.bank_transactions
            where bank_account_id = p_bank_account and review_action is null and match_status = 'unmatched'
            order by transaction_date, id loop
    select count(*), min(cc.id::text)::uuid into k, v_only from public._bank_line_candidates(l.id, 3) cc;
    if k = 1 then
      perform public.bank_line_match(l.id, v_only);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public._bank_line_for(uuid) from public, anon;
revoke all on function public._bank_line_candidates(uuid, int) from public, anon;
grant execute on function public._bank_line_for(uuid) to authenticated;
grant execute on function public._bank_line_candidates(uuid, int) to authenticated;
grant execute on function public.bank_line_suggestions(uuid) to authenticated;
grant execute on function public.bank_line_match(uuid, uuid) to authenticated;
grant execute on function public.bank_line_add(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.bank_line_exclude(uuid, text) to authenticated;
grant execute on function public.bank_line_undo(uuid) to authenticated;
grant execute on function public.bank_auto_match(uuid) to authenticated;
