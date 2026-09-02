/*
  Fix validate_gl_entries_balance: silent no-op -> real deferred check

  The trigger was declared FOR EACH STATEMENT:
    CREATE TRIGGER validate_gl_entries_balance
      AFTER INSERT OR UPDATE OR DELETE ON gl_entries
      FOR EACH STATEMENT
      EXECUTE FUNCTION validate_double_entry_balance();

  but validate_double_entry_balance() references NEW.transaction_id /
  OLD.transaction_id — which are unassigned at statement level (a
  statement-level trigger has no single row to bind NEW/OLD to). The
  function's own query, COALESCE(NEW.transaction_id, OLD.transaction_id),
  resolves to NULL every time, so `WHERE transaction_id = NULL` matches
  zero rows, the computed diff is always 0, and the trigger has silently
  validated nothing, ever — confirmed live this session via a direct
  pg_trigger query showing trigger_level = STATEMENT.

  Investigated before fixing (this session's own prior rounds), not
  assumed: every one of the 9 real gl_entries insertion sites in this
  codebase (postingEngine.ts x2, lib/accounting.ts, JournalEntryPage.tsx,
  the Fund Transfer import pass, and 6 of the 7 GL Phase 2 posting
  scripts) inserts a transaction's lines as ONE batched multi-row
  .insert() call — never as separate sequential single-row inserts. A
  plain FOR EACH ROW trigger would already work correctly against that
  pattern (Postgres fires AFTER ROW triggers for a multi-row INSERT only
  once every row in that statement already exists, so a SUM query inside
  the trigger sees sibling rows from the same statement). DEFERRABLE
  INITIALLY DEFERRED was chosen anyway, for the same cost as a plain row
  trigger: it validates at transaction-commit time instead of
  immediately per row, which additionally protects against any future
  insertion pattern that splits a transaction's lines across multiple
  statements within one real database transaction (e.g. a future
  RPC-wrapped posting function) — not just today's batching convention.

  Cascade-delete correctness, traced and then verified live: gl_entries.
  transaction_id has ON DELETE CASCADE from gl_transactions, and no code
  anywhere in this codebase deletes an individual gl_entries row directly
  (confirmed via repo-wide grep) — the only delete path is DELETE FROM
  gl_transactions, which cascades to remove ALL of that transaction's
  lines together, within the same transaction, before the deferred check
  ever runs. At commit time, SUM(...) WHERE transaction_id = OLD.
  transaction_id then finds zero remaining rows for a fully-removed
  transaction -> COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) =
  0 - 0 = 0 -> passes, no false rejection. This is the exact pattern
  scripts/cleanup-duplicate-field-payments.ts used earlier this session
  (DELETE FROM gl_transactions, relying on cascade).

  No changes to validate_double_entry_balance() itself — its SUM-
  aggregate body was already correct, just never reachable at statement
  level. This migration only changes how it's attached.

  Verified live in Supabase by Veron before this migration was written:
  a deliberately unbalanced test transaction was correctly rejected at
  COMMIT with the function's own error message; a balanced transaction
  and a full cascade-delete (mirroring the field_payments cleanup) both
  committed cleanly.
*/

DROP TRIGGER IF EXISTS validate_gl_entries_balance ON gl_entries;

CREATE CONSTRAINT TRIGGER validate_gl_entries_balance
  AFTER INSERT OR UPDATE OR DELETE ON gl_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_double_entry_balance();
