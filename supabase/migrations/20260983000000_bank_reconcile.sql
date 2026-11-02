-- =====================================================================
-- Banking Step 6 - reconcile a bank (or card) account to its statement, and account history
-- Magnus Boy's System
--
-- The standard way (QuickBooks / Xero "Reconcile"): for each statement, tick the entries in the books that are on the
-- statement. Starting balance (the last reconciled statement's balance) + ticked money in - ticked money out must equal
-- the statement's ending balance. When the difference is 0.00 it is FINISHED: those entries are marked reconciled
-- (gl_entries.reconciled, reconciled_date, reconciled_by) and the matched statement lines become 'reconciled' (they can't
-- be undone on Bank review any more). Entries matched on Bank review are ticked for you.
--
--   * bank_reconciliations: one per statement (open -> done); only one open at a time per account; each statement date
--     must be after the last finished one. gl_entries.reconciliation_id points at the statement an entry was ticked on.
--   * reconcile_start(bank account, statement date, statement balance), reconcile_items(rec), reconcile_tick(rec, entries,
--     on), reconcile_finish(rec), reconcile_cancel(rec) (an open one), reconcile_undo(rec) (only the latest finished one).
--   * Entries undone with a reversal (voided original + its "VOID:" reversal) are left out together, unless the original
--     was already reconciled - then its reversal must be ticked on a later statement.
--   * account_history(account, from, to): opening balance, every entry with a running balance, closing balance.
--   * Reconciling: director, admin or office user. History: anyone who can see the books (normal access rules).
-- Runs as the signed-in user. Safe to run twice.
-- =====================================================================

create table if not exists public.bank_reconciliations (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,
  bank_account_id   uuid not null references public.bank_accounts(id) on delete cascade,
  chart_account_id  uuid not null references public.chart_of_accounts(id) on delete restrict,
  statement_date    date not null,
  statement_balance numeric(15,2) not null,
  opening_balance   numeric(15,2) not null default 0,
  status            text not null default 'open' check (status in ('open', 'done')),
  finished_by       uuid references auth.users(id),
  finished_at       timestamptz,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);
create unique index if not exists bank_reconciliations_one_open on public.bank_reconciliations (bank_account_id) where status = 'open';
create index if not exists bank_reconciliations_account on public.bank_reconciliations (bank_account_id, statement_date);

alter table public.bank_reconciliations enable row level security;
drop policy if exists "Company members read reconciliations" on public.bank_reconciliations;
create policy "Company members read reconciliations" on public.bank_reconciliations for select to authenticated
  using (company_id in (select company_id from public.user_profiles where id = auth.uid()));
drop policy if exists "Finance staff change reconciliations" on public.bank_reconciliations;
create policy "Finance staff change reconciliations" on public.bank_reconciliations for all to authenticated
  using (company_id in (select company_id from public.user_profiles where id = auth.uid() and role in ('director', 'admin', 'office_user')))
  with check (company_id in (select company_id from public.user_profiles where id = auth.uid() and role in ('director', 'admin', 'office_user')));

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_hq_write_guard') then
    execute 'drop trigger if exists hq_write_guard on public.bank_reconciliations';
    execute 'create trigger hq_write_guard before insert or update or delete on public.bank_reconciliations for each row execute function public._hq_write_guard()';
  end if;
end $$;

alter table public.gl_entries add column if not exists reconciliation_id uuid references public.bank_reconciliations(id) on delete set null;
create index if not exists idx_gl_entries_reconciliation on public.gl_entries (reconciliation_id);

-- +1 for money in (asset: debit) / less owed (liability: debit): the statement's own direction.
create or replace function public._rec_sign(p_account uuid)
returns int
language sql
stable
set search_path = public, pg_temp
as $$ select case when type = 'liability' then -1 else 1 end from public.chart_of_accounts where id = p_account $$;

create or replace function public._rec_get(p_rec uuid, p_need_role boolean default true)
returns public.bank_reconciliations
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  r public.bank_reconciliations%rowtype;
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if p_need_role and v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can reconcile.'; end if;
  select * into r from public.bank_reconciliations where id = p_rec and company_id = v_company;
  if r.id is null then raise exception 'Reconciliation not found.'; end if;
  return r;
end;
$$;

-- The entries that can be ticked on this statement: on the account, dated up to the statement date, not reconciled on an
-- earlier statement, and not an undone pair (voided original + its reversal) that never reached a statement.
create or replace function public._rec_candidates(p_rec uuid)
returns table (entry_id uuid, transaction_id uuid, transaction_number text, transaction_date date, description text,
               source_type text, amount numeric, ticked boolean, on_statement boolean)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  r public.bank_reconciliations%rowtype;
  v_sign int;
begin
  select * into r from public.bank_reconciliations where id = p_rec;
  v_sign := public._rec_sign(r.chart_account_id);
  return query
    select e.id, g.id, g.transaction_number, g.transaction_date, coalesce(nullif(e.description, ''), g.description), g.source_type,
           round(v_sign * (coalesce(e.debit, 0) - coalesce(e.credit, 0)), 2), e.reconciliation_id is not distinct from p_rec,
           exists (select 1 from public.bank_transactions bt where bt.gl_transaction_id = g.id and bt.review_action in ('matched', 'added'))
      from public.gl_entries e
      join public.gl_transactions g on g.id = e.transaction_id
     where e.account_id = r.chart_account_id and g.company_id = r.company_id
       and g.transaction_date <= r.statement_date
       and coalesce(e.debit, 0) - coalesce(e.credit, 0) <> 0
       and (e.reconciliation_id is null or e.reconciliation_id = p_rec)
       and not coalesce(e.reconciled, false)
       and g.status in ('posted', 'voided')
       -- an undone pair that never reached a statement is left out together
       and not (g.status = 'voided')
       and not (g.reference like 'VOID: %' and exists (
             select 1 from public.gl_transactions o join public.gl_entries oe on oe.transaction_id = o.id and oe.account_id = r.chart_account_id
              where o.company_id = g.company_id and o.transaction_number = substr(g.reference, 7) and o.status = 'voided'
                and not coalesce(oe.reconciled, false)))
     order by g.transaction_date, g.transaction_number;
end;
$$;

create or replace function public.reconcile_start(p_bank uuid, p_statement_date date, p_statement_balance numeric)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  b         public.bank_accounts%rowtype;
  v_last    public.bank_reconciliations%rowtype;
  v_id      uuid;
begin
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can reconcile.'; end if;
  select * into b from public.bank_accounts where id = p_bank and company_id = v_company;
  if b.id is null then raise exception 'Bank account not found.'; end if;
  if b.chart_account_id is null then raise exception 'Link this bank account to your chart of accounts first (Bank Accounts page).'; end if;
  if p_statement_date is null then raise exception 'Type the statement end date.'; end if;
  if p_statement_balance is null then raise exception 'Type the ending balance on the statement.'; end if;
  if p_statement_date > current_date then raise exception 'The statement date can''t be in the future.'; end if;

  select * into v_last from public.bank_reconciliations where bank_account_id = b.id and status = 'done' order by statement_date desc limit 1;
  if v_last.id is not null and p_statement_date <= v_last.statement_date then
    raise exception 'The last statement reconciled ended on %. Choose a later date.', to_char(v_last.statement_date, 'DD Mon YYYY');
  end if;

  select id into v_id from public.bank_reconciliations where bank_account_id = b.id and status = 'open';
  if v_id is not null then
    update public.bank_reconciliations set statement_date = p_statement_date, statement_balance = round(p_statement_balance, 2),
           chart_account_id = b.chart_account_id, opening_balance = coalesce(v_last.statement_balance, 0)
     where id = v_id;
    -- entries now after the statement date come off
    update public.gl_entries e set reconciliation_id = null
      from public.gl_transactions g
     where e.reconciliation_id = v_id and g.id = e.transaction_id and g.transaction_date > p_statement_date;
  else
    insert into public.bank_reconciliations (company_id, bank_account_id, chart_account_id, statement_date, statement_balance, opening_balance, created_by)
    values (v_company, b.id, b.chart_account_id, p_statement_date, round(p_statement_balance, 2), coalesce(v_last.statement_balance, 0), auth.uid())
    returning id into v_id;
  end if;

  -- Tick what Bank review already matched to a statement line dated on or before the statement date.
  update public.gl_entries e set reconciliation_id = v_id
   where e.id in (select c.entry_id from public._rec_candidates(v_id) c where not c.ticked)
     and exists (select 1 from public.bank_transactions bt
                  where bt.gl_transaction_id = e.transaction_id and bt.bank_account_id = b.id
                    and bt.review_action in ('matched', 'added') and bt.transaction_date <= p_statement_date);
  return v_id;
end;
$$;

create or replace function public.reconcile_items(p_rec uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  r public.bank_reconciliations%rowtype;
  v_items jsonb;
  v_cleared numeric;
  v_review int;
begin
  r := public._rec_get(p_rec, false);
  if r.status = 'done' then
    select coalesce(jsonb_agg(jsonb_build_object('entry_id', e.id, 'transaction_number', g.transaction_number, 'transaction_date', g.transaction_date,
             'description', coalesce(nullif(e.description, ''), g.description), 'source_type', g.source_type,
             'amount', round(public._rec_sign(r.chart_account_id) * (coalesce(e.debit, 0) - coalesce(e.credit, 0)), 2), 'ticked', true, 'on_statement', true)
             order by g.transaction_date, g.transaction_number), '[]'::jsonb)
      into v_items
      from public.gl_entries e join public.gl_transactions g on g.id = e.transaction_id where e.reconciliation_id = r.id;
  else
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_items from public._rec_candidates(r.id) c;
  end if;
  select coalesce(sum((x ->> 'amount')::numeric), 0) into v_cleared from jsonb_array_elements(v_items) x where (x ->> 'ticked')::boolean;
  select count(*) into v_review from public.bank_transactions
   where bank_account_id = r.bank_account_id and review_action is null and transaction_date <= r.statement_date;
  return jsonb_build_object('id', r.id, 'status', r.status, 'statement_date', r.statement_date, 'statement_balance', r.statement_balance,
           'opening_balance', r.opening_balance, 'cleared_balance', round(r.opening_balance + v_cleared, 2),
           'difference', round(r.statement_balance - (r.opening_balance + v_cleared), 2), 'lines_to_review', v_review,
           'items', v_items, 'finished_at', r.finished_at);
end;
$$;

create or replace function public.reconcile_tick(p_rec uuid, p_entries uuid[], p_on boolean)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  r public.bank_reconciliations%rowtype;
begin
  r := public._rec_get(p_rec);
  if r.status <> 'open' then raise exception 'This statement is already finished.'; end if;
  if p_on then
    update public.gl_entries set reconciliation_id = r.id
     where id = any(p_entries) and id in (select c.entry_id from public._rec_candidates(r.id) c);
  else
    update public.gl_entries set reconciliation_id = null where id = any(p_entries) and reconciliation_id = r.id;
  end if;
end;
$$;

create or replace function public.reconcile_finish(p_rec uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  r public.bank_reconciliations%rowtype;
  v jsonb;
begin
  r := public._rec_get(p_rec);
  if r.status <> 'open' then raise exception 'This statement is already finished.'; end if;
  -- an entry ticked earlier but undone since (voided) comes off first
  update public.gl_entries set reconciliation_id = null
   where reconciliation_id = r.id and id not in (select c.entry_id from public._rec_candidates(r.id) c);
  v := public.reconcile_items(r.id);
  if abs((v ->> 'difference')::numeric) >= 0.005 then
    raise exception 'The difference is % - it must be 0.00. Tick or untick entries, or check the statement balance.',
      to_char((v ->> 'difference')::numeric, 'FM999,999,999,990.00');
  end if;
  update public.gl_entries set reconciled = true, reconciled_date = r.statement_date, reconciled_by = auth.uid()
   where reconciliation_id = r.id;
  update public.bank_transactions bt set match_status = 'reconciled', updated_at = now()
   where bt.bank_account_id = r.bank_account_id and bt.review_action in ('matched', 'added') and bt.transaction_date <= r.statement_date
     and bt.match_status = 'matched'
     and exists (select 1 from public.gl_entries e where e.transaction_id = bt.gl_transaction_id and e.reconciliation_id = r.id);
  update public.bank_reconciliations set status = 'done', finished_by = auth.uid(), finished_at = now() where id = r.id;
end;
$$;

create or replace function public.reconcile_cancel(p_rec uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  r public.bank_reconciliations%rowtype;
begin
  r := public._rec_get(p_rec);
  if r.status <> 'open' then raise exception 'A finished statement can''t be cancelled. Use Undo on the latest one.'; end if;
  update public.gl_entries set reconciliation_id = null where reconciliation_id = r.id;
  delete from public.bank_reconciliations where id = r.id;
end;
$$;

create or replace function public.reconcile_undo(p_rec uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  r public.bank_reconciliations%rowtype;
begin
  r := public._rec_get(p_rec);
  if r.status <> 'done' then raise exception 'This statement is not finished.'; end if;
  if exists (select 1 from public.bank_reconciliations x where x.bank_account_id = r.bank_account_id and x.status = 'done' and x.statement_date > r.statement_date) then
    raise exception 'Undo the later statements first (newest first).';
  end if;
  if exists (select 1 from public.bank_reconciliations x where x.bank_account_id = r.bank_account_id and x.status = 'open') then
    raise exception 'Finish or cancel the statement you have open first.';
  end if;
  update public.bank_transactions bt set match_status = 'matched', updated_at = now()
   where bt.bank_account_id = r.bank_account_id and bt.match_status = 'reconciled'
     and exists (select 1 from public.gl_entries e where e.transaction_id = bt.gl_transaction_id and e.reconciliation_id = r.id);
  update public.gl_entries set reconciled = false, reconciled_date = null, reconciled_by = null where reconciliation_id = r.id;
  update public.bank_reconciliations set status = 'open', finished_by = null, finished_at = null where id = r.id;
end;
$$;

-- Every entry on one account between two dates, with a running balance (in the account's own direction).
create or replace function public.account_history(p_account uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  a public.chart_of_accounts%rowtype;
  v_sign int;
  v_open numeric;
  v_rows jsonb;
begin
  select * into a from public.chart_of_accounts where id = p_account and company_id = v_company;
  if a.id is null then raise exception 'Account not found.'; end if;
  v_sign := case when a.type in ('asset', 'expense') then 1 else -1 end;
  select coalesce(sum(v_sign * (coalesce(e.debit, 0) - coalesce(e.credit, 0))), 0) into v_open
    from public.gl_entries e join public.gl_transactions g on g.id = e.transaction_id
   where e.account_id = a.id and g.status in ('posted', 'voided') and g.transaction_date < p_from;
  select coalesce(jsonb_agg(row_to_json(x) order by x.transaction_date, x.transaction_number, x.line), '[]'::jsonb) into v_rows
    from (select g.transaction_date, g.transaction_number, coalesce(nullif(e.description, ''), g.description) description, g.source_type,
                 g.status, g.reference, coalesce(e.debit, 0) debit, coalesce(e.credit, 0) credit, coalesce(e.reconciled, false) reconciled,
                 p.name project, e.line_number line,
                 round(v_open + sum(v_sign * (coalesce(e.debit, 0) - coalesce(e.credit, 0)))
                   over (order by g.transaction_date, g.transaction_number, e.line_number, e.id rows unbounded preceding), 2) balance
            from public.gl_entries e join public.gl_transactions g on g.id = e.transaction_id
            left join public.projects p on p.id = e.project_id
           where e.account_id = a.id and g.status in ('posted', 'voided') and g.transaction_date between p_from and p_to) x;
  return jsonb_build_object('account', jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name, 'type', a.type, 'current_balance', a.current_balance),
           'opening', round(v_open, 2), 'rows', v_rows,
           'closing', round(v_open + coalesce((select sum((r ->> 'debit')::numeric - (r ->> 'credit')::numeric) * v_sign from jsonb_array_elements(v_rows) r), 0), 2));
end;
$$;

revoke all on function public._rec_get(uuid, boolean) from public, anon;
revoke all on function public._rec_candidates(uuid) from public, anon;
revoke all on function public._rec_sign(uuid) from public, anon;
grant execute on function public._rec_get(uuid, boolean) to authenticated;
grant execute on function public._rec_candidates(uuid) to authenticated;
grant execute on function public._rec_sign(uuid) to authenticated;
grant execute on function public.reconcile_start(uuid, date, numeric) to authenticated;
grant execute on function public.reconcile_items(uuid) to authenticated;
grant execute on function public.reconcile_tick(uuid, uuid[], boolean) to authenticated;
grant execute on function public.reconcile_finish(uuid) to authenticated;
grant execute on function public.reconcile_cancel(uuid) to authenticated;
grant execute on function public.reconcile_undo(uuid) to authenticated;
grant execute on function public.account_history(uuid, date, date) to authenticated;
