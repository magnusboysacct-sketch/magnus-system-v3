-- Scope assembly_components policies through the parent assembly's company (the table has no company_id of its own).
-- The old open policies (qual true / with_check true) are removed. Applied directly to the live database; this file
-- version-controls it.
BEGIN;

DROP POLICY IF EXISTS allow_delete_assembly_components ON public.assembly_components;
DROP POLICY IF EXISTS allow_insert_assembly_components ON public.assembly_components;
DROP POLICY IF EXISTS allow_update_assembly_components ON public.assembly_components;
DROP POLICY IF EXISTS assembly_components_read ON public.assembly_components;
DROP POLICY IF EXISTS assembly_components_write_admin ON public.assembly_components;

CREATE POLICY assembly_components_select ON public.assembly_components FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.assemblies a WHERE a.id = assembly_components.assembly_id
  AND (a.company_id IS NULL OR a.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))));

CREATE POLICY assembly_components_insert ON public.assembly_components FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.assemblies a WHERE a.id = assembly_components.assembly_id
  AND a.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)));

CREATE POLICY assembly_components_update ON public.assembly_components FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.assemblies a WHERE a.id = assembly_components.assembly_id
  AND a.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)))
WITH CHECK (EXISTS (SELECT 1 FROM public.assemblies a WHERE a.id = assembly_components.assembly_id
  AND a.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)));

CREATE POLICY assembly_components_delete ON public.assembly_components FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.assemblies a WHERE a.id = assembly_components.assembly_id
  AND a.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)));

COMMIT;
