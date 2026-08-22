/*
  Update get_ar_ap_aging() — add a "Not Yet Due" bucket

  Follow-up to 20260822030000_add_ar_ap_aging_function.sql (already
  applied and confirmed live — not hand-edited here, replaced via
  CREATE OR REPLACE, same pattern as every other function update this
  session). The original version's bucketing formula let a future
  due_date (a negative CURRENT_DATE - due_date day count) fall into the
  '0-30' bucket alongside genuinely-overdue invoices/bills 0-30 days
  past due — a healthy invoice due in 25 days would visually blend with
  one that's 25 days overdue. This adds a fifth, distinct bucket for
  due_date > CURRENT_DATE, checked first so it takes priority over the
  day-count buckets below it.

  Same signature, same table/column sources, same SECURITY INVOKER
  default, same balance_due > 0 / status filtering as the original —
  only the bucket CASE expression changes.
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
      WHEN due_date > CURRENT_DATE THEN 'Not Yet Due'
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
      WHEN due_date > CURRENT_DATE THEN 'Not Yet Due'
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
