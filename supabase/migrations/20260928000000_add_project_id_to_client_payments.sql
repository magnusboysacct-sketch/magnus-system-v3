-- Add client_payments.project_id (to be run by hand on the live database; this file version-controls it).
-- Lets an ADVANCE payment be recorded against a project before any invoice exists: project_id set, invoice_id null. An advance is
-- later applied to an invoice by setting its invoice_id and recalculating that invoice from its linked payments
-- (updateInvoiceAfterPayment). Nullable with no default, so no existing payment changes. ON DELETE SET NULL matches the sibling
-- project_id / invoice_id columns, so deleting a project never fails because of a payment that points at it.
ALTER TABLE client_payments ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
