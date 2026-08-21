/*
  Fix: current_balance never updates for the draft-then-posted flow

  Confirmed precisely by reading every trigger touching gl_entries and
  gl_transactions (20260329190001_create_general_ledger.sql) — not
  assumed:

  The ONLY trigger that ever writes chart_of_accounts.current_balance is
  update_gl_account_balance (AFTER INSERT/UPDATE/DELETE ON gl_entries,
  FOR EACH ROW, EXECUTE FUNCTION update_account_balance()). Its INSERT
  branch only applies the change when, at the moment the gl_entries row
  is inserted, the parent gl_transactions row is ALREADY status='posted'
  (gated by an EXISTS(... AND status = 'posted') check).

  validate_transaction_posting (BEFORE UPDATE ON gl_transactions, FOR
  EACH ROW) is the only trigger that fires on a transaction's draft ->
  posted transition — it validates (>=2 entries, both a debit and a
  credit present, accounts active, project-linkable rule) and sets
  posted_at/posted_by. It does not touch gl_entries or
  chart_of_accounts at all.

  So: any caller that (a) creates the gl_transactions header as 'draft',
  (b) inserts its gl_entries while still draft, then (c) UPDATEs status
  to 'posted' as a separate step — exactly what createGLTransaction() +
  postTransaction() in postingEngine.ts do, and exactly what the
  Expenses retroactive posting script (scripts/post-expenses.ts) does —
  never has its balance impact applied at all. The entries insert (b)
  finds status != 'posted' yet, so update_account_balance()'s EXISTS
  check is false and it's skipped; the later UPDATE (c) only changes
  gl_transactions, and nothing is listening for that column changing.

  This is why the 1558 posted Expenses transactions show correctly in
  gl_transactions/gl_entries (real records, correctly balanced per the
  validate_double_entry_balance trigger, which fires unconditionally)
  but chart_of_accounts.current_balance never moved.

  JournalEntryPage.tsx's manual entry flow does NOT hit this: it inserts
  gl_transactions with its FINAL status (draft or posted) in a single
  INSERT, never a separate draft-then-update step. When status is
  'posted' from that one INSERT, entries inserted immediately after
  already see a posted parent, so update_account_balance()'s EXISTS
  check is true and the trigger fires correctly at insert time.
  (JournalEntryPage.tsx also runs its own follow-up UPDATE against
  current_balance after posting — that isn't a workaround for THIS bug;
  it predates the sign-convention fix and is simply redundant now that
  the trigger is correctly signed, since it was already double-applying
  the same value the trigger had already written. Not touched here —
  out of scope for this fix, flagged separately.)

  Fix: add a second, complementary trigger — this one on gl_transactions
  itself, firing only on a genuine transition into 'posted' — that walks
  every gl_entries row belonging to that transaction and applies the
  same correctly-signed balance update. This covers the draft-then-post
  flow for every future caller (the live app's postTransaction, and the
  remaining Field Payments / Invoices / Bills / Supplier Payments
  retroactive posting), not just a one-off patch for the Expenses script.
  It cannot double-count against the existing gl_entries-level trigger:
  that one only ever applies when the parent is ALREADY posted at
  insert/update/delete time on gl_entries; this one only fires on
  gl_transactions' own status column transitioning, and is scoped to
  AFTER UPDATE (not INSERT), so it never fires for JournalEntryPage's
  single-insert-as-posted flow at all — the two triggers are mutually
  exclusive by construction, not just by observation.

  Known, narrower gap NOT addressed here (flagging rather than silently
  leaving unmentioned): a transaction that goes posted -> voided -> posted
  again would cause this new trigger to re-apply the same delta a second
  time. Nothing in the app currently exposes a void/un-void workflow, so
  this isn't reachable today — but if that workflow is ever built, it
  will need its own reversing logic on the posted -> voided transition,
  symmetric to this one. Deliberately not built preemptively here.
*/

CREATE OR REPLACE FUNCTION apply_balance_updates_on_transaction_posted()
RETURNS TRIGGER AS $$
DECLARE
  entry RECORD;
  signed numeric;
BEGIN
  FOR entry IN
    SELECT ge.account_id, ge.debit, ge.credit, coa.type AS account_type
    FROM gl_entries ge
    JOIN chart_of_accounts coa ON coa.id = ge.account_id
    WHERE ge.transaction_id = NEW.id
  LOOP
    -- Same sign convention as update_account_balance() (see
    -- 20260820000000_fix_account_balance_sign_convention.sql) — must stay
    -- identical to that function or the two paths would disagree.
    signed := CASE WHEN entry.account_type IN ('asset', 'expense')
                THEN entry.debit - entry.credit
                ELSE entry.credit - entry.debit
              END;
    UPDATE chart_of_accounts
    SET current_balance = current_balance + signed
    WHERE id = entry.account_id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Idempotent: safe to re-run this migration without erroring if the
-- trigger already exists from a prior run.
DROP TRIGGER IF EXISTS apply_balance_updates_on_gl_transaction_posted ON gl_transactions;

CREATE TRIGGER apply_balance_updates_on_gl_transaction_posted
  AFTER UPDATE ON gl_transactions
  FOR EACH ROW
  WHEN (NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted')
  EXECUTE FUNCTION apply_balance_updates_on_transaction_posted();
