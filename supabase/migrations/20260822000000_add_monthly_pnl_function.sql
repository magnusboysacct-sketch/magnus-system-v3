/*
  Add get_monthly_pnl() — SQL-side monthly revenue/expense aggregation

  For the Director Dashboard's P&L Overview trend chart. Deliberately NOT
  pulling raw gl_entries rows into JS and summing client-side — PostgREST's
  silent 1000-row cap (the same bug already found and fixed multiple times
  this session in ExpensesPage.tsx, ClientsPage.tsx, WorkersPage.tsx,
  RatesPage.tsx, ProjectContext.tsx, and scripts/post-expenses.ts) would
  silently truncate a real company's gl_entries history well before any
  chart needs to render. A set-returning function does the SUM/GROUP BY on
  the server and only ever returns one row per month, never per entry —
  structurally immune to that cap regardless of how much GL data exists.

  A plain VIEW can't take the months_back parameter cleanly, hence a
  function rather than a view (Veron's own suggested shape,
  get_monthly_pnl(company_id, months_back)).

  Sign convention matches update_account_balance() exactly (see
  20260820000000_fix_account_balance_sign_convention.sql) — credit-normal
  for revenue (credit - debit), debit-normal for expense (debit - credit).
  Must stay identical to that function or this chart and current_balance
  would disagree about which direction is "more revenue"/"more expense".

  SECURITY INVOKER (the default — no SECURITY DEFINER here), so this
  respects the same RLS policies already on gl_transactions/gl_entries/
  chart_of_accounts for the calling user; the p_company_id parameter is
  a convenience filter, not a security boundary — RLS is still the real
  enforcement, exactly as everywhere else in this app.

  Only returns rows for months that actually have posted GL activity —
  deliberately not zero-padding missing months. A fabricated zero bar for
  a month with no posted entries would misleadingly read as "no revenue
  that month" when the real reason is "not posted to the GL yet" (only
  Expenses and Fund Transfer are posted as of this migration) — the
  calling UI is expected to show a caveat instead of inventing zero data.
*/

CREATE OR REPLACE FUNCTION get_monthly_pnl(p_company_id uuid, p_months_back int DEFAULT 6)
RETURNS TABLE (
  month_start date,
  month_label text,
  revenue numeric,
  expenses numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_trunc('month', gt.transaction_date)::date AS month_start,
    to_char(date_trunc('month', gt.transaction_date), 'Mon YYYY') AS month_label,
    COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN ge.credit - ge.debit ELSE 0 END), 0) AS revenue,
    COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN ge.debit - ge.credit ELSE 0 END), 0) AS expenses
  FROM gl_transactions gt
  JOIN gl_entries ge ON ge.transaction_id = gt.id
  JOIN chart_of_accounts coa ON coa.id = ge.account_id
  WHERE gt.company_id = p_company_id
    AND gt.status = 'posted'
    AND coa.type IN ('revenue', 'expense')
    AND gt.transaction_date >= (date_trunc('month', CURRENT_DATE) - (p_months_back - 1) * INTERVAL '1 month')
  GROUP BY date_trunc('month', gt.transaction_date)
  ORDER BY month_start;
$$;
