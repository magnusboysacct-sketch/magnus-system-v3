-- =====================================================================
-- Banking Step 1 - one list: every bank account is an account in the Chart of Accounts
-- Magnus Boy's System
--
-- The standard way (QuickBooks / Xero / Sage): a bank account IS a ledger account. The Bank Accounts page keeps
-- the bank details (bank name, last 4, statements), and points at its account in the chart, where the books
-- balance lives. Before this, bank_accounts was a separate list nobody could pick in "Paid from".
--
--   * bank_accounts.chart_account_id  - the chart account this bank account is (one each, never shared).
--   * New bank account with no chart account chosen -> one is created in the chart automatically:
--       checking / savings  -> asset, subtype 'bank', next free code 1001-1099 under 1000 (Cash and Cash Equivalents)
--       credit card / line of credit -> liability, next free code 2401-2499 under 2400 / 2410
--   * Linking an existing chart account is checked: same company, active, right kind (asset for a bank account,
--     liability for a credit card / line of credit), not already linked to another bank account.
--   * bank_account_create_chart_account(bank_id) - for an existing bank account: create its chart account now.
--   * Existing bank accounts are linked automatically ONLY when a chart account with exactly the same name exists;
--     the rest are shown on the Bank Accounts page with "Link" / "Create in chart" buttons.
-- Runs as the signed-in user (no security definer): normal company access rules apply.
-- Safe to run twice.
-- =====================================================================

alter table public.bank_accounts
  add column if not exists chart_account_id uuid references public.chart_of_accounts(id) on delete restrict;

create unique index if not exists uq_bank_accounts_chart_account
  on public.bank_accounts (chart_account_id) where chart_account_id is not null;

-- What kind of ledger account a bank account must be.
create or replace function public._bank_chart_type(p_account_type text)
returns text
language sql
immutable
as $$
  select case when p_account_type in ('credit', 'line_of_credit') then 'liability' else 'asset' end;
$$;

-- Next free numeric code in [p_from, p_to], preferring round tens (1040, 1050 ...).
create or replace function public._next_free_chart_code(p_company uuid, p_from int, p_to int)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select c::text
    from generate_series(p_from, p_to) c
   where not exists (select 1 from public.chart_of_accounts a where a.company_id = p_company and a.code = c::text)
   order by (c % 10 <> 0), c
   limit 1;
$$;

-- Creates the chart account for one bank account and returns its id. Used by the insert trigger and the button.
create or replace function public._create_chart_account_for_bank(
  p_company uuid, p_name text, p_account_type text, p_bank_name text default null)
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
  values (p_company, v_code, left(trim(p_name), 200), v_type,
          case when v_type = 'asset' then 'bank' else 'current_liability' end,
          v_parent.id, least(coalesce(v_parent.level, 1) + case when v_parent.id is null then 0 else 1 end, 10), true,
          'Bank account' || coalesce(' at ' || nullif(trim(p_bank_name), ''), '') || ' (created from Bank Accounts)', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Checks (and on insert, creates) the chart account of a bank account.
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
    new.chart_account_id := public._create_chart_account_for_bank(new.company_id, new.account_name, new.account_type, new.bank_name);
    return new;
  end if;

  if new.chart_account_id is null then return new; end if;   -- unlinking an old row is allowed (nothing posts yet)
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
  if a.type = 'asset' and a.subtype is null then
    update public.chart_of_accounts set subtype = 'bank' where id = a.id;
  end if;
  return new;
end;
$$;

drop trigger if exists bank_account_chart_link on public.bank_accounts;
create trigger bank_account_chart_link
  before insert or update of chart_account_id, account_type on public.bank_accounts
  for each row execute function public._bank_account_chart_link();

-- The "Create in chart" button for an existing bank account.
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
  select * into b from public.bank_accounts where id = p_bank;   -- normal access rules: only your own company's
  if b.id is null then raise exception 'Bank account not found.'; end if;
  if b.chart_account_id is not null then return b.chart_account_id; end if;
  v := public._create_chart_account_for_bank(b.company_id, b.account_name, b.account_type, b.bank_name);
  update public.bank_accounts set chart_account_id = v, updated_at = now() where id = b.id;
  return v;
end;
$$;

revoke all on function public._create_chart_account_for_bank(uuid, text, text, text) from public, anon;
revoke all on function public.bank_account_create_chart_account(uuid) from public, anon;
grant execute on function public._create_chart_account_for_bank(uuid, text, text, text) to authenticated;
grant execute on function public.bank_account_create_chart_account(uuid) to authenticated;

-- Existing bank accounts: link only where the chart already has an account with exactly the same name and kind.
do $$
declare
  b record;
  v uuid;
begin
  for b in select * from public.bank_accounts where chart_account_id is null order by created_at loop
    select a.id into v from public.chart_of_accounts a
     where a.company_id = b.company_id and a.is_active is not false
       and lower(trim(a.name)) = lower(trim(b.account_name))
       and a.type = public._bank_chart_type(b.account_type)
       and not exists (select 1 from public.bank_accounts x where x.chart_account_id = a.id)
     order by a.code limit 1;
    if v is not null then
      update public.bank_accounts set chart_account_id = v where id = b.id;
    end if;
  end loop;
end;
$$;

select count(*) filter (where chart_account_id is not null) as bank_accounts_linked,
       count(*) filter (where chart_account_id is null)     as bank_accounts_to_link_on_the_page
  from public.bank_accounts;
