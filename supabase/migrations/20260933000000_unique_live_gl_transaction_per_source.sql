-- Applied directly to the live database on 2026-10-11; this file version-controls it.
-- One live ledger transaction per source record: database-level protection against posting the same thing twice.
--
-- The app already checks before posting, but nothing in the database stopped a second NON-VOIDED gl_transaction for the same
-- (source_type, source_id) - e.g. two browser tabs, or a bug in any future posting code. This adds a partial unique index:
--   * only rows that have a source_id (manual entries, which have none, are unaffected);
--   * voided transactions are excluded, so a voided entry can be re-posted;
--   * different source types may share an id.
-- Every posting script already treats (source_type, source_id) as "already posted", so one live row per pair is the intended shape.
--
-- BEFORE RUNNING: this fails (and changes nothing) if the live data already has two live transactions for one source record.
-- Check first with the query in the comment at the bottom; if it returns rows, those duplicates need a person's decision.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_transactions_live_source
  ON public.gl_transactions (source_type, source_id)
  WHERE source_id IS NOT NULL AND status <> 'voided';

COMMIT;

-- Read-only duplicate check (run it first; it should return no rows):
--   SELECT source_type, source_id, count(*) AS live_transactions, array_agg(transaction_number ORDER BY transaction_number) AS numbers
--   FROM public.gl_transactions
--   WHERE source_id IS NOT NULL AND status <> 'voided'
--   GROUP BY source_type, source_id
--   HAVING count(*) > 1
--   ORDER BY live_transactions DESC;
