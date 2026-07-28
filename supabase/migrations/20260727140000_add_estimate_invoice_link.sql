-- Links an estimate to the client_invoices row created via "Create Invoice"
-- on the estimate's Payment Tracking panel.
ALTER TABLE public.estimate_headers
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.client_invoices(id) ON DELETE SET NULL;
