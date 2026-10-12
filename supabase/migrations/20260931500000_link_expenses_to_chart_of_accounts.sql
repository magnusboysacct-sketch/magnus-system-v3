-- Applied directly to the live database on 2026-10-11; this file version-controls it.
-- Link expense categories and expenses to the Chart of Accounts (Stage 1: schema only).
--
-- 1. expense_categories.chart_account_id: the GL account an expense in this category is DEBITED to (nullable: an unlinked
--    category simply isn't posted automatically yet).
-- 2. expenses.paid_from_account_id: the account the expense was paid from, i.e. the CREDIT side (bank, petty cash, payable...).
-- 3. expenses.gl_transaction_id: the posted journal transaction this expense produced (set when the app posts it).
-- All three are nullable and ON DELETE SET NULL, so nothing existing is affected and no account/transaction can be blocked from
-- deletion by a link.
-- 4. A one-time backfill for the real company (813ffe22-b75c-49c5-b41e-3ab185e2724c) only: each of its expense categories is linked
--    to the ACTIVE EXPENSE account with the same name (ignoring upper/lower case and extra spaces), but only when exactly one such
--    account exists. The three categories scripts/post-expenses.ts already treats as exceptions ("Office Supplies", "Firearm
--    License", "Property") are linked to account 5720 Other Expenses, as that script did. Anything else is left unlinked (NULL) for a
--    person to choose; nothing is guessed. Existing links are never overwritten, so it is safe to run twice.
BEGIN;

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS chart_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS paid_from_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS gl_transaction_id uuid REFERENCES public.gl_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_categories_chart_account ON public.expense_categories(chart_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_from_account ON public.expenses(paid_from_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_gl_transaction ON public.expenses(gl_transaction_id);

-- Backfill, step A: same-name match (case/space-insensitive) to exactly one active expense account.
WITH accounts AS (
  SELECT id, lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) AS key
  FROM public.chart_of_accounts
  WHERE company_id = '813ffe22-b75c-49c5-b41e-3ab185e2724c'
    AND type = 'expense'
    AND is_active = true
),
unique_accounts AS (
  SELECT key, (array_agg(id))[1] AS account_id
  FROM accounts
  GROUP BY key
  HAVING count(*) = 1
)
UPDATE public.expense_categories ec
SET chart_account_id = ua.account_id
FROM unique_accounts ua
WHERE ec.company_id = '813ffe22-b75c-49c5-b41e-3ab185e2724c'
  AND ec.chart_account_id IS NULL
  AND lower(btrim(regexp_replace(ec.name, '\s+', ' ', 'g'))) = ua.key;

-- Backfill, step B: the three known exceptions go to 5720 Other Expenses (only if still unlinked, and only if that account exists).
UPDATE public.expense_categories ec
SET chart_account_id = a.id
FROM public.chart_of_accounts a
WHERE ec.company_id = '813ffe22-b75c-49c5-b41e-3ab185e2724c'
  AND a.company_id = '813ffe22-b75c-49c5-b41e-3ab185e2724c'
  AND a.code = '5720'
  AND a.type = 'expense'
  AND a.is_active = true
  AND ec.chart_account_id IS NULL
  AND ec.name IN ('Office Supplies', 'Firearm License', 'Property');

-- Backfill, step C (applied separately, right after the migration above): link each already-posted expense to the GL transaction it
-- produced. The 1,558 imported expenses were posted earlier by scripts/post-expenses.ts with source_type 'expense' and source_id = the
-- expense id; this sets expenses.gl_transaction_id from that, only where it is still empty.
UPDATE public.expenses e
SET gl_transaction_id = t.id
FROM public.gl_transactions t
WHERE t.company_id = e.company_id
  AND t.source_type = 'expense'
  AND t.source_id = e.id
  AND e.gl_transaction_id IS NULL;

COMMIT;
