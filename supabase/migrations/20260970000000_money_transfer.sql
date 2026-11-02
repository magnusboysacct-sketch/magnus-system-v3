-- =====================================================================
-- Banking Step 2 - Transfer money between accounts
-- Magnus Boy's System
--
-- The standard "Transfer" (QuickBooks / Xero): money moves from one money account to another - bank to petty cash,
-- bank to a partner's job fund, savings to current, bank to pay off a credit card. In the books that is one posted
-- journal entry: DEBIT the account the money goes TO, CREDIT the account it comes FROM.
--
--   * money_transfer(from, to, amount, date, note, project) - saves and posts the transfer in ONE step (never half
--     saved), source_type 'fund_transfer' (the same type the Zoho import used, so old transfers show too).
--   * money_transfer_undo(id, reason) - the standard undo: a posted reversing entry, and the original is marked
--     voided. Nothing is deleted.
-- Which accounts: active asset accounts (bank, cash, petty cash, funds) and liability accounts linked to a bank
-- account (credit cards / lines of credit). Both must be in your company. Runs as the signed-in user, so the
-- normal company access rules and every existing ledger check (balanced, project-linkable accounts, balances) apply.
-- Safe to run twice.
-- =====================================================================

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
  if not (a.type = 'asset'
          or (a.type = 'liability' and exists (select 1 from public.bank_accounts b where b.chart_account_id = a.id))) then
    raise exception 'Money can only move between bank, cash and fund accounts, or a linked credit card / line of credit (% % is %).',
      a.code, a.name, a.type;
  end if;
  return a;
end;
$$;

create or replace function public._next_gl_number(p_company uuid, p_date date)
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_prefix text := 'GL-' || to_char(coalesce(p_date, current_date), 'YYYY-MM-DD');
  v_last   int;
begin
  perform pg_advisory_xact_lock(hashtext('gl_number:' || p_company::text));
  select coalesce(max(nullif(regexp_replace(transaction_number, '^.*-', ''), '')::int), 0) into v_last
    from public.gl_transactions
   where company_id = p_company and transaction_number like v_prefix || '-%'
     and regexp_replace(transaction_number, '^.*-', '') ~ '^[0-9]+$';
  return v_prefix || '-' || lpad((v_last + 1)::text, 4, '0');
end;
$$;

create or replace function public.money_transfer(
  p_from uuid, p_to uuid, p_amount numeric, p_date date, p_note text default null, p_project uuid default null)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  f public.chart_of_accounts%rowtype;
  t public.chart_of_accounts%rowtype;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_note   text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_desc   text;
  v_id     uuid;
  v_number text;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if p_from is null or p_to is null then raise exception 'Choose where the money comes from and where it goes.'; end if;
  if p_from = p_to then raise exception 'From and To must be different accounts.'; end if;
  if v_amount <= 0 or v_amount > 999999999999 then raise exception 'Type an amount above zero.'; end if;
  if p_date is null then raise exception 'Choose the date of the transfer.'; end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project and company_id = v_company) then
    raise exception 'That project is not in your company.';
  end if;

  f := public._money_account_ok(v_company, p_from);
  t := public._money_account_ok(v_company, p_to);

  v_desc := 'Transfer: ' || f.code || ' ' || f.name || ' -> ' || t.code || ' ' || t.name || coalesce(' - ' || v_note, '');
  v_number := public._next_gl_number(v_company, p_date);

  insert into public.gl_transactions (company_id, transaction_number, transaction_date, reference, source_type, source_id,
                                      description, total_amount, currency, status, notes, created_by)
  values (v_company, v_number, p_date, 'Transfer', 'fund_transfer', null, left(v_desc, 500), v_amount, 'JMD', 'draft', v_note, auth.uid())
  returning id into v_id;

  insert into public.gl_entries (transaction_id, company_id, account_id, debit, credit, project_id, description, line_number, entry_type)
  values (v_id, v_company, t.id, v_amount, 0, p_project, 'Transfer in from ' || f.code || ' ' || f.name, 1, 'regular'),
         (v_id, v_company, f.id, 0, v_amount, p_project, 'Transfer out to ' || t.code || ' ' || t.name, 2, 'regular');

  update public.gl_transactions set status = 'posted', posted_by = auth.uid(), posted_at = now() where id = v_id;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

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
  if g.id is null or g.company_id is distinct from v_company then raise exception 'Transfer not found.'; end if;
  if g.source_type <> 'fund_transfer' then raise exception 'That entry is not a transfer.'; end if;
  if g.status <> 'posted' then raise exception 'This transfer was already undone.'; end if;
  if length(v_reason) < 3 then raise exception 'Write why you are undoing it.'; end if;

  v_number := public._next_gl_number(v_company, current_date);
  insert into public.gl_transactions (company_id, transaction_number, transaction_date, reference, source_type, source_id,
                                      description, total_amount, currency, status, notes, created_by)
  values (v_company, v_number, current_date, 'VOID: ' || g.transaction_number, 'adjustment', null,
          left('Undo transfer ' || g.transaction_number || ': ' || g.description, 500), g.total_amount, 'JMD', 'draft',
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

revoke all on function public._money_account_ok(uuid, uuid) from public, anon;
revoke all on function public._next_gl_number(uuid, date) from public, anon;
revoke all on function public.money_transfer(uuid, uuid, numeric, date, text, uuid) from public, anon;
revoke all on function public.money_transfer_undo(uuid, text) from public, anon;
grant execute on function public._money_account_ok(uuid, uuid) to authenticated;
grant execute on function public._next_gl_number(uuid, date) to authenticated;
grant execute on function public.money_transfer(uuid, uuid, numeric, date, text, uuid) to authenticated;
grant execute on function public.money_transfer_undo(uuid, text) to authenticated;
