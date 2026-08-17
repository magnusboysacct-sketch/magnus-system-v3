/*
  # Widen supplier_invoices.three_way_match_status CHECK constraint

  ## Background
  The original finance-ERP migration (20260315125158_create_finance_erp_system.sql)
  created supplier_invoices.three_way_match_status with:

    CHECK (three_way_match_status IN ('pending', 'matched', 'discrepancy'))

  A later migration (20260315172743_add_three_way_matching_system.sql) added
  perform_three_way_match() plus AFTER INSERT/UPDATE triggers on
  supplier_invoice_line_items that call it automatically whenever a line
  item is inserted or updated. That function writes three_way_match_status
  values of 'no_po', 'invalid_po', 'no_receiving', 'overbilling', and
  'mismatch' — none of which (other than 'matched') were ever added to the
  CHECK constraint above. The two migrations were never reconciled.

  This is a genuine, pre-existing bug in the app's own schema — NOT
  specific to the Import Wizard. It surfaces any time a line item is
  inserted on a supplier invoice with no linked purchase order (the
  overwhelmingly common branch: perform_three_way_match's very first
  check is "IF v_po_id IS NULL THEN SET three_way_match_status = 'no_po'"),
  which immediately violates the original CHECK constraint and rolls back
  the entire line-item insert statement — while the invoice header (a
  separate, already-committed insert) is left behind, orphaned with zero
  line items and no error ever visible on it directly.

  Discovered when the Bills entity import (supplier_invoices +
  supplier_invoice_line_items) hit this on its first real run: 8 of 17
  attempted bills had zero valid line items to insert in the first place
  (so the trigger never fired, and they "succeeded" vacuously with no line
  items), and the other 9 had real line items, which triggered this exact
  violation on every attempt.

  ## What this does
  Widens the CHECK constraint to also allow the values
  perform_three_way_match() actually writes. Purely additive — every
  originally-allowed value (pending/matched/discrepancy) stays allowed, so
  nothing currently relying on those breaks. Once this is in place, a
  PO-less invoice's line items correctly landing on 'no_po' is the
  intended, working behavior of the three-way-matching system, not an
  error.

  ## Status
  Already applied directly via the Supabase SQL Editor against the live
  database (confirmed by Veron Williams, Director) before this migration
  file was written. This file exists for tracking and for consistency
  across any other/future environment (a fresh database, a new dev
  environment) — it is NOT meant to be re-run against the database it was
  already manually applied to. Written idempotently (DROP CONSTRAINT IF
  EXISTS + unconditional re-ADD under the same name) so re-running it
  anywhere is always safe regardless of whether it's already been applied:
  the end state is identical either way, just re-asserted.
*/

ALTER TABLE supplier_invoices DROP CONSTRAINT IF EXISTS supplier_invoices_three_way_match_status_check;

ALTER TABLE supplier_invoices ADD CONSTRAINT supplier_invoices_three_way_match_status_check
  CHECK (three_way_match_status = ANY (ARRAY[
    'pending'::text, 'matched'::text, 'discrepancy'::text,
    'no_po'::text, 'invalid_po'::text, 'no_receiving'::text, 'overbilling'::text, 'mismatch'::text
  ]));
