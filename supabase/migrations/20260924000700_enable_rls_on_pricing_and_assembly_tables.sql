-- Enable row-level security on cost_item_rates, assemblies and assembly_components. No earlier migration does this (the tables
-- themselves were created by hand), and the company-scoped policies in the 20260924 migrations only take effect once RLS is on.
-- Safe to re-run: enabling RLS on a table that already has it is a no-op. Already enabled on the live database.
BEGIN;

ALTER TABLE public.cost_item_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_components ENABLE ROW LEVEL SECURITY;

COMMIT;
