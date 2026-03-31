-- Add project_scope column to boq_headers table
ALTER TABLE public.boq_headers 
ADD COLUMN IF NOT EXISTS project_scope TEXT;
