/*
  Add 'supplier_invoice' as a valid source_type

  gl_transactions.source_type and posting_rules.source_type are both
  CHECK-constrained to a fixed list (manual, client_payment,
  supplier_payment, expense, payroll, invoice, procurement, bank_transfer,
  adjustment, opening_balance) — see 20260329190001_create_general_ledger.sql
  and 20260329190100_create_posting_rules.sql. Neither list has a value for
  a Supplier Bill (the `supplier_invoices` table).

  Deliberately NOT reusing 'procurement' for this: procurement already
  names a different real source table (`procurements`, PO-driven) with a
  different meaning. Overloading it for Bills as well would make
  source_type='procurement' ambiguous between two genuinely different
  source tables, forcing anything reading gl_transactions later to also
  cross-reference source_id against both tables just to tell them apart.
  A dedicated value keeps the mapping unambiguous, and matches the
  existing convention where 'invoice' maps to client_invoices,
  'client_payment'/'supplier_payment' map to their own tables, etc. —
  'supplier_invoice' names the table it comes from the same way.

  Purely additive: only widens each CHECK's allowed list, doesn't touch
  any existing value or any existing row. Both constraints were declared
  inline without an explicit name in their original CREATE TABLE
  statements, so Postgres auto-generated their names - rather than
  hardcode a guessed name (which would silently no-op via DROP CONSTRAINT
  IF EXISTS on a wrong guess, leaving the old, narrower CHECK still live
  with no error), this looks the real constraint up from pg_constraint by
  its definition text, drops whatever it's actually named, and replaces
  it with a new CHECK under a stable, explicit name for any future
  migration to reference safely.
*/

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'gl_transactions'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%source_type%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE gl_transactions DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE gl_transactions
  ADD CONSTRAINT gl_transactions_source_type_check
  CHECK (source_type IN (
    'manual',
    'client_payment',
    'supplier_payment',
    'expense',
    'payroll',
    'invoice',
    'procurement',
    'bank_transfer',
    'adjustment',
    'opening_balance',
    'supplier_invoice'
  ));

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'posting_rules'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%source_type%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE posting_rules DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE posting_rules
  ADD CONSTRAINT posting_rules_source_type_check
  CHECK (source_type IN (
    'manual',
    'client_payment',
    'supplier_payment',
    'expense',
    'payroll',
    'invoice',
    'procurement',
    'bank_transfer',
    'adjustment',
    'opening_balance',
    'supplier_invoice'
  ));
