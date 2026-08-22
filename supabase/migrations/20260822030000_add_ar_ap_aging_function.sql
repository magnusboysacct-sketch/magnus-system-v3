/*
  Add get_ar_ap_aging() — SQL-side receivables/payables aging aggregation

  For the Director Dashboard's Receivables & Payables card. No existing
  aging-bucket logic exists anywhere in the app to mirror — checked
  AccountsReceivablePage.tsx and AccountsPayablePage.tsx directly; both
  only compute a flat "overdue" boolean (due_date < today) and a single
  outstanding total, no 0-30/31-60/61-90/90+ buckets anywhere. This is
  genuinely new logic, not a reuse of something already proven.

  Real source columns, confirmed by reading the two pages' actual
  queries (not information_schema this time, but the app's own live
  query text, which is at least as reliable given this session's
  repeated schema-drift findings):
    client_invoices:   due_date, balance_due, status
      (CHECK vocabulary: draft/sent/partial/paid/overdue/cancelled —
      confirmed via entityConfigs.ts's INVOICE_STATUS_ALIASES earlier
      this session)
    supplier_invoices: due_date, balance_due, status
      (CHECK vocabulary: pending/approved/partial/paid/disputed —
      confirmed via AccountsPayablePage.tsx's own StatusFilter type)

  Same SQL-side aggregation reasoning as get_monthly_pnl(): PostgREST's
  1000-row cap doesn't currently bind here (client_invoices/
  supplier_invoices are small tables today), but doing the bucketing
  server-side is the right default regardless of current row counts —
  cheap now, and doesn't need revisiting if either table grows.

  Bucketing: CURRENT_DATE - due_date (a plain integer day count for two
  date columns) is <= 30 -> '0-30', <= 60 -> '31-60', <= 90 -> '61-90',
  else '90+'. A NEGATIVE day count (due_date in the future, not yet due)
  falls into '0-30' under this formula rather than getting its own
  "not yet due" bucket — deliberate, matching the Director Dashboard
  Stage 1 card's own 4-bucket design (no 5th "current" bucket exists in
  the placeholder shape being wired here). Flagged for Veron: if a
  distinct "not yet due" bucket is wanted instead, this is the one place
  that would need to change.

  "Outstanding" is filtered as balance_due > 0, which already excludes
  fully-paid rows in both tables without needing to name 'paid' in the
  status filter explicitly. client_invoices additionally excludes
  'draft' (not really issued yet) and 'cancelled' (voided, never a real
  receivable) — supplier_invoices has no equivalent draft/cancelled
  status in its real vocabulary, so no extra exclusion is needed there;
  'disputed' bills are deliberately still counted as outstanding, since
  a dispute doesn't mean the money isn't owed, just that it's contested.

  SECURITY INVOKER (the default), matching every other function this
  session — respects RLS on client_invoices/supplier_invoices for
  whoever calls it, same as get_monthly_pnl().
*/

CREATE OR REPLACE FUNCTION get_ar_ap_aging(p_company_id uuid)
RETURNS TABLE (
  kind text,
  bucket text,
  amount numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    'receivable' AS kind,
    CASE
      WHEN (CURRENT_DATE - due_date) <= 30 THEN '0-30'
      WHEN (CURRENT_DATE - due_date) <= 60 THEN '31-60'
      WHEN (CURRENT_DATE - due_date) <= 90 THEN '61-90'
      ELSE '90+'
    END AS bucket,
    SUM(balance_due) AS amount
  FROM client_invoices
  WHERE company_id = p_company_id
    AND status NOT IN ('draft', 'cancelled')
    AND balance_due > 0
  GROUP BY 2

  UNION ALL

  SELECT
    'payable' AS kind,
    CASE
      WHEN (CURRENT_DATE - due_date) <= 30 THEN '0-30'
      WHEN (CURRENT_DATE - due_date) <= 60 THEN '31-60'
      WHEN (CURRENT_DATE - due_date) <= 90 THEN '61-90'
      ELSE '90+'
    END AS bucket,
    SUM(balance_due) AS amount
  FROM supplier_invoices
  WHERE company_id = p_company_id
    AND balance_due > 0
  GROUP BY 2;
$$;
