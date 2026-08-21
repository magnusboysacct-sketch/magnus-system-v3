/*
  Add 'fund_transfer' as a valid source_type

  gl_transactions.source_type and posting_rules.source_type are both
  CHECK-constrained to a fixed list — see 20260329190001_create_general_
  ledger.sql and 20260329190100_create_posting_rules.sql, already widened
  once this session by 20260820010000_add_supplier_invoice_source_type.sql
  to add 'supplier_invoice'. Neither list has a value for the Transfer
  Fund entity (internal account-to-account movements and owner draws,
  posted directly to gl_transactions/gl_entries with no business-domain
  header table of its own).

  Deliberately NOT reusing the existing 'bank_transfer' value: that value
  already exists in the enum and could plausibly be read as covering this
  case, but it's reserved for a different, already-established meaning —
  bank_accounts-table-based transfers (see lib/finance.ts's
  transferBetweenAccounts, and CashFlowPage.tsx), a separate cash-tracking
  system from chart_of_accounts/gl_entries entirely. Overloading it here
  would blur two genuinely different source concepts under one value,
  same reasoning that motivated 'supplier_invoice' over reusing
  'procurement' for Bills. 'fund_transfer' names this entity's own real
  source (the Zoho Transfer_Fund.csv import) unambiguously.

  Purely additive: only widens each CHECK's allowed list, doesn't touch
  any existing value or any existing row. Same robust lookup-by-definition
  approach as the supplier_invoice migration — finds each constraint by
  its real (auto-generated) name via pg_constraint rather than guessing
  it, so this doesn't silently no-op if the name differs from what's
  assumed.
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
    'supplier_invoice',
    'fund_transfer'
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
    'supplier_invoice',
    'fund_transfer'
  ));
