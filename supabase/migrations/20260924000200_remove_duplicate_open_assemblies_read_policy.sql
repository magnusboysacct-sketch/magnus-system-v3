-- Remove the duplicate open read policy on assemblies. Applied directly to the live database; this file version-controls it.
BEGIN;

DROP POLICY IF EXISTS assemblies_read ON public.assemblies;

COMMIT;
