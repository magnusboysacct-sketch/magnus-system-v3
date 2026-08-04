-- Adds a stored authorized-signature image for the company, captured once in
-- Settings > Company Profile (via the reusable SignaturePad draw component,
-- same pattern already used for field-payment receipts and contract signing),
-- so it can be auto-placed on ID card backs (WorkerIDCard.tsx, StaffIDCard.tsx)
-- instead of a blank hand-sign line.
-- get_or_create_company_settings() (20260310000352) already does `SELECT *` /
-- `RETURNS SETOF company_settings`, so no RPC changes are needed for this
-- column to flow through automatically.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS signature_url text;
