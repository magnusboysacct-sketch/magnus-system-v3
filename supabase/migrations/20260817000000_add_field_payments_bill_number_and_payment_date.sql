/*
  # Add bill_number and payment_date to field_payments

  ## Background
  313 field_payments records were created from Zoho's Bill.csv (worker-
  routed bills — Zoho had no subcontractor concept, so subcontractor labor
  was entered as vendor bills there). Each record's originating Bill
  Number was only ever embedded inside a free-text notes string
  ("Migrated from Zoho Bill.csv (Bill X)."), not stored as its own column
  — fine for a human reading one record, but not enough to reliably match
  these records back against a *second* import (Vendor_Payment.csv) that
  also references the same Bill Number, without fragile text-parsing or
  guessy fuzzy-matching on name+amount+approximate date.

  Separately, field_payments has only one date column (work_date, when
  the work was billed/done) — no column for when a payment actually
  happened. Vendor_Payment.csv carries a real payment date distinct from
  the bill date; overwriting work_date with it would conflate two
  different concepts, so a dedicated column is added instead.

  ## What this does
  - Adds bill_number (text, nullable) and payment_date (date, nullable)
    to field_payments.
  - Indexes bill_number for the enrichment JOIN this supports.
  - Backfills bill_number for the 313 existing rows by extracting it from
    the exact, deterministic notes format the Bills->Field Payments
    importer generates ("Migrated from Zoho Bill.csv (Bill X).") — a
    pattern this app's own code wrote, not arbitrary free text, so the
    extraction is precise rather than a guess. Only rows whose notes
    genuinely match that exact shape are touched; anything else (a row
    imported without a mapped Bill Number, or any future non-Bill-sourced
    field_payments row) is left alone.
  - payment_date is intentionally NOT backfilled here — no reliable source
    for a real historical payment date exists until the Vendor_Payment.csv
    enrichment pass (a separate, reviewed script) runs.

  ## Idempotency
  ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS throughout. The
  backfill UPDATE is naturally idempotent too — it only ever targets rows
  where bill_number IS NULL, so re-running this migration a second time
  finds nothing left to touch.
*/

ALTER TABLE field_payments ADD COLUMN IF NOT EXISTS bill_number text;
ALTER TABLE field_payments ADD COLUMN IF NOT EXISTS payment_date date;

CREATE INDEX IF NOT EXISTS idx_field_payments_bill_number ON field_payments(bill_number);

UPDATE field_payments
SET bill_number = substring(notes from 'Migrated from Zoho Bill\.csv \(Bill (.+)\)\.$')
WHERE bill_number IS NULL
  AND notes ~ 'Migrated from Zoho Bill\.csv \(Bill (.+)\)\.$';
