-- Applied directly to the live database on 2026-10-11; this file version-controls it.
-- Optional per-line-item Name (e.g. a beneficiary) on BOQ items, carried onto the invoice lines generated from them.
-- Both columns are nullable text with no default, so no existing row is affected.
ALTER TABLE public.boq_section_items ADD COLUMN IF NOT EXISTS line_name text;
ALTER TABLE public.client_invoice_line_items ADD COLUMN IF NOT EXISTS line_name text;
