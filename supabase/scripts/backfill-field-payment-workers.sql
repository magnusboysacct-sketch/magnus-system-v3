-- Links existing field payments to registered workers (sets field_payments.worker_id). NOT run by any migration: you run it, after migration 20260951000000.
--
-- It is ONE statement, safe to run as it is: with the settings below untouched it is a PREVIEW. It changes nothing and lists what it would do, one row per payment.
--   1. Run it as it is and read the list (and scripts/field-payment-worker-matches.csv, which has the same proposals plus the fuzzy ones).
--   2. Set apply to true and run it again: only the rows in the list are updated, in one statement (all or nothing).
--
-- What it applies:
--   - every payment with no worker yet whose worker_name is EXACTLY "first_name last_name" of one worker of the SAME company            (how = exact)
--   - if include_normalized is true: the same name apart from capitals, extra spaces and punctuation ("RAINER  william")                (how = normalized)
--   - the pairs you put in approved, e.g. the fuzzy matches or the one-offs you checked in the CSV                                       (how = approved)
--       approved := '[{"payment": "<payment_id from the CSV>", "worker": "<worker id>"}, ...]'::jsonb
--     An approved pair is refused (shown as REJECTED, nothing changes for it) if the payment is not found, already has a worker, or the worker is of another company.
-- Never touched: a payment that already has a worker_id; a name that fits two or more workers (ambiguous); a name that fits nobody. Nothing is deleted or re-pointed.
-- (Accented letters are not folded here; the CSV report does fold them. They only matter for include_normalized.)

WITH settings AS (
  SELECT
    false              AS apply,               -- false = preview only (nothing is changed), true = apply
    false              AS include_normalized,  -- true also applies the capitals / spaces / punctuation matches
    '[]'::jsonb        AS approved             -- pairs you approved by hand (see above)
),
named AS (
  SELECT fp.id AS payment_id, fp.company_id, fp.worker_name,
         lower(btrim(regexp_replace(regexp_replace(coalesce(fp.worker_name, ''), '[''’`]', '', 'g'), '[^A-Za-z0-9]+', ' ', 'g'))) AS norm
    FROM public.field_payments fp
   WHERE fp.worker_id IS NULL
),
wn AS (
  SELECT w.id AS worker_id, w.company_id, w.employee_id,
         btrim(coalesce(w.first_name, '') || ' ' || coalesce(w.last_name, '')) AS full_name,
         lower(btrim(regexp_replace(regexp_replace(btrim(coalesce(w.first_name, '') || ' ' || coalesce(w.last_name, '')), '[''’`]', '', 'g'), '[^A-Za-z0-9]+', ' ', 'g'))) AS norm
    FROM public.workers w
),
exact_hits AS (
  SELECT n.payment_id, w.worker_id, 'exact'::text AS how
    FROM named n JOIN wn w ON w.company_id = n.company_id AND n.worker_name = w.full_name
),
norm_hits AS (
  SELECT n.payment_id, w.worker_id, 'normalized'::text AS how
    FROM named n JOIN wn w ON w.company_id = n.company_id AND n.norm <> '' AND n.norm = w.norm
   WHERE (SELECT include_normalized FROM settings) AND n.payment_id NOT IN (SELECT payment_id FROM exact_hits)
),
auto AS (   -- one worker per payment, and only when the name fits exactly one
  SELECT h.payment_id, (array_agg(h.worker_id))[1] AS worker_id, min(h.how) AS how
    FROM (SELECT * FROM exact_hits UNION ALL SELECT * FROM norm_hits) h
   GROUP BY h.payment_id
  HAVING count(DISTINCT h.worker_id) = 1
),
approved AS (
  SELECT (a ->> 'payment')::uuid AS payment_id, (a ->> 'worker')::uuid AS worker_id
    FROM jsonb_array_elements((SELECT approved FROM settings)) a
),
checked AS (
  SELECT ap.payment_id, ap.worker_id,
         CASE WHEN fp.id IS NULL THEN 'payment not found'
              WHEN fp.worker_id IS NOT NULL THEN 'payment already has a worker'
              WHEN w.id IS NULL THEN 'worker not found'
              WHEN w.company_id <> fp.company_id THEN 'worker of another company' END AS problem
    FROM approved ap
    LEFT JOIN public.field_payments fp ON fp.id = ap.payment_id
    LEFT JOIN public.workers w ON w.id = ap.worker_id
),
plan AS (
  SELECT payment_id, worker_id, 'approved'::text AS how FROM checked WHERE problem IS NULL
  UNION ALL
  SELECT payment_id, worker_id, how FROM auto WHERE payment_id NOT IN (SELECT payment_id FROM checked WHERE problem IS NULL)
),
updated AS (   -- runs always, but changes a row only when apply is true (and only a payment that still has no worker)
  UPDATE public.field_payments fp SET worker_id = p.worker_id
    FROM plan p
   WHERE fp.id = p.payment_id AND fp.worker_id IS NULL AND (SELECT apply FROM settings)
  RETURNING fp.id
)
SELECT * FROM (
  SELECT CASE WHEN (SELECT apply FROM settings) THEN 'UPDATED' ELSE 'would update' END AS status, p.how, fp.id AS payment_id, fp.work_date, fp.total_amount,
         fp.worker_name, w.full_name AS worker, w.employee_id AS worker_number
    FROM plan p JOIN public.field_payments fp ON fp.id = p.payment_id JOIN wn w ON w.worker_id = p.worker_id
  UNION ALL
  SELECT 'REJECTED: ' || c.problem, 'approved', c.payment_id, NULL::date, NULL::numeric, NULL, NULL, NULL FROM checked c WHERE c.problem IS NOT NULL
  UNION ALL
  SELECT 'SUMMARY: ' || (SELECT count(*) FROM plan) || ' planned, ' || (SELECT count(*) FROM updated) || ' updated, '
         || (SELECT count(*) FROM public.field_payments WHERE worker_id IS NULL) || ' payments still without a worker (before this run)',
         NULL, NULL, NULL, NULL, NULL, NULL, NULL
) r
ORDER BY (r.status LIKE 'SUMMARY%') DESC, (r.status LIKE 'REJECTED%') DESC, r.how, r.worker_name, r.work_date;
