/*
  Add worker_id to secretary_documents

  Fixes the gap found while building Edit for Correspondence & Templates:
  secretary_documents never stored which worker a letter was written for —
  only the finished title/content — so Edit couldn't restore the worker
  picker's original selection, only the two fields that were actually
  persisted.

  Nullable, ON DELETE SET NULL (not CASCADE) — deleting a worker record
  should never take a letter down with it, especially one that may already
  be approved/printed. A letter just loses its worker link and reverts to
  the existing graceful fallback (worker picker opens unselected), which is
  also exactly what happens for every row created before this column
  existed. No backfill needed or attempted here.
*/

ALTER TABLE secretary_documents
  ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES workers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_secretary_documents_worker ON secretary_documents(worker_id);
