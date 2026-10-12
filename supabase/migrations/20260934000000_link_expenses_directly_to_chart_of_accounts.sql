-- Applied directly to the live database on 2026-10-12; this file version-controls it.
-- Expenses are charged directly to an expense account from the Chart of Accounts.
--
-- expenses.chart_account_id is the account an expense is charged to (the debit side when it is posted to the General Ledger). It replaces
-- the separate expense_categories list as the thing you pick on the Expenses page: creating an expense account in the Chart of Accounts
-- makes it available as a category immediately, with no second list to keep in step.
-- This is additive only: expenses.category_id and the expense_categories table are NOT changed or dropped, so history keeps displaying
-- exactly as before. The backfill copies each expense's old category link (expense_categories.chart_account_id) onto the new column.
-- Expenses with no category, or whose category isn't linked to an account, are left NULL; they keep showing their old category name.
BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS chart_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_chart_account ON public.expenses(chart_account_id);

UPDATE public.expenses e
SET chart_account_id = ec.chart_account_id
FROM public.expense_categories ec
WHERE e.category_id = ec.id
  AND ec.company_id = e.company_id
  AND ec.chart_account_id IS NOT NULL
  AND e.chart_account_id IS NULL;

COMMIT;
