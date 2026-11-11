-- =====================================================================
-- 20261002000000_expense_corrections.sql
-- Fixing an expense that is already in the books (wrong project, wrong date, wrong amount ...).
--
-- expense_unpost(expense, reason): takes the expense's entry OUT of the books the standard way - a reversing entry is
-- posted and the old one is marked voided (nothing is deleted, the trail stays) - and clears expenses.gl_transaction_id.
-- The Expenses page calls it when a booked expense is changed or deleted, then posts the corrected one again.
--   * director, admin, office user or accountant of the company only.
--   * Only an entry Magnus made FROM THIS EXPENSE (source 'expense', same id) is ever reversed. Imported entries and
--     anything entered another way are refused, never reversed or duplicated.
--   * An expense made by a field payment is changed on the field payment, not here.
--   * An entry already reconciled on a bank statement can still be reversed; the reversal is ticked on a later statement.
-- Runs as the signed-in user (normal company access rules and every ledger check apply).
-- Safe to run twice.
-- =====================================================================

begin;

-- (also made by 20261001000000; here too so this file works on its own)
alter table public.expenses add column if not exists field_payment_id uuid references public.field_payments(id) on delete set null;

create or replace function public.expense_unpost(p_expense uuid, p_reason text default null)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  e         public.expenses%rowtype;
  g         public.gl_transactions%rowtype;
begin
  if v_role is null or v_role not in ('director', 'admin', 'office_user', 'accountant') then
    raise exception 'Only a director, admin, office user or accountant can change an expense that is in the books.';
  end if;
  select * into e from public.expenses where id = p_expense and company_id = v_company;
  if e.id is null then raise exception 'Expense not found.'; end if;
  if e.field_payment_id is not null then
    raise exception 'This expense comes from a field payment. Change it on the field payment (Field Payments), and the books follow.';
  end if;
  if e.gl_transaction_id is null then return; end if;          -- not in the books: nothing to undo

  select * into g from public.gl_transactions where id = e.gl_transaction_id;
  if g.id is not null and g.status = 'posted' then
    if g.company_id <> v_company or g.source_type is distinct from 'expense' or g.source_id is distinct from e.id then
      raise exception 'This books entry (%) was not made by Magnus from this expense (imported or entered another way), so it is not changed here.', g.transaction_number;
    end if;
    perform public._gl_reverse(g.id, coalesce(nullif(btrim(p_reason), ''), 'Expense corrected'));
  end if;
  update public.expenses set gl_transaction_id = null, updated_at = now() where id = e.id;
end;
$$;

revoke all on function public.expense_unpost(uuid, text) from public, anon;
grant execute on function public.expense_unpost(uuid, text) to authenticated;

commit;
