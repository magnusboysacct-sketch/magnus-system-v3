-- NOT YET APPLIED: review, then run this file against the live database (SQL Editor, or `npx supabase db query --linked -f <this file>`).
-- Milestone templates: save a milestone and its tasks once, and add it to any future project.
--
-- Nothing like this existed (checked): the "Templates" on the Takeoff page are MATERIAL assemblies (assemblies / assembly_items /
-- takeoff_assemblies: lists of cost items with formulas), and template_types / template_field_definitions describe fields of catalogue
-- items. Neither holds a milestone with a set of tasks, rates and crew.
--
-- A template keeps only what is worth reusing: names, descriptions, quantities, units, rates, crew, durations, planned costs, payment amount and
-- the assembly/item links used by the takeoff. Not dates, not BOQ links, not actuals or progress.
--
-- save_milestone_as_template(milestone, name)  -> uuid of the new template (its tasks keep their order via sort_order)
-- apply_milestone_template(template, project)  -> the new project_milestones row: planned, next milestone_no, actuals 0/NULL, tasks planned
--                                                 at 0% with a manual quantity source and created_at = clock_timestamp() so their order is kept.
-- Both are SECURITY INVOKER (the caller's row-level security applies) and one transaction each. Rename / delete are plain RLS-protected
-- updates and deletes from the app. Access is company-scoped exactly like client_contacts; nothing is granted to anon.
BEGIN;

-- 1. Tables ------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milestone_templates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id),
  name                    text NOT NULL CHECK (btrim(name) <> ''),
  description             text,
  payment_amount          numeric DEFAULT 0,
  planned_duration_days   numeric,
  planned_labour_cost     numeric DEFAULT 0,
  planned_material_cost   numeric DEFAULT 0,
  planned_equipment_cost  numeric DEFAULT 0,
  crew_size_needed        numeric,
  production_rate_per_day numeric,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One template name per company, ignoring case.
CREATE UNIQUE INDEX IF NOT EXISTS uq_milestone_templates_company_name ON public.milestone_templates (company_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_milestone_templates_company_id ON public.milestone_templates (company_id);

CREATE TABLE IF NOT EXISTS public.milestone_template_tasks (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id             uuid NOT NULL REFERENCES public.milestone_templates(id) ON DELETE CASCADE,
  sort_order              int NOT NULL DEFAULT 0,
  task_name               text NOT NULL,
  task_description        text,
  trade_type              text,
  quantity                numeric DEFAULT 1,
  unit                    text DEFAULT 'unit',
  rate_per_unit           numeric,
  crew_size               numeric DEFAULT 1,
  production_rate_per_day numeric DEFAULT 1,
  planned_duration_days   numeric,
  weather_impact_factor   numeric DEFAULT 1.0,
  labor_cost_per_day      numeric DEFAULT 0,
  equipment_cost_per_day  numeric DEFAULT 0,
  material_cost_total     numeric DEFAULT 0,
  linked_assembly_id      uuid,
  linked_item_id          uuid,
  linked_assembly_name    text,
  linked_item_name        text
);
CREATE INDEX IF NOT EXISTS idx_milestone_template_tasks_template ON public.milestone_template_tasks (template_id, sort_order);

-- updated_at follows every update (the app renames templates with a plain update).
CREATE OR REPLACE FUNCTION public.milestone_templates_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS milestone_templates_touch ON public.milestone_templates;
CREATE TRIGGER milestone_templates_touch BEFORE UPDATE ON public.milestone_templates
  FOR EACH ROW EXECUTE FUNCTION public.milestone_templates_touch();

-- 2. Access: company-scoped (the client_contacts pattern); template tasks follow their template's company; nothing for anon ---------------
ALTER TABLE public.milestone_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_template_tasks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.milestone_templates      FROM PUBLIC, anon;
REVOKE ALL ON public.milestone_template_tasks FROM PUBLIC, anon;
REVOKE ALL ON public.milestone_templates      FROM authenticated;
REVOKE ALL ON public.milestone_template_tasks FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestone_templates      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.milestone_template_tasks TO authenticated;

DROP POLICY IF EXISTS milestone_templates_select ON public.milestone_templates;
DROP POLICY IF EXISTS milestone_templates_insert ON public.milestone_templates;
DROP POLICY IF EXISTS milestone_templates_update ON public.milestone_templates;
DROP POLICY IF EXISTS milestone_templates_delete ON public.milestone_templates;

CREATE POLICY milestone_templates_select ON public.milestone_templates FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY milestone_templates_insert ON public.milestone_templates FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY milestone_templates_update ON public.milestone_templates FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))
WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY milestone_templates_delete ON public.milestone_templates FOR DELETE TO authenticated
USING (company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS milestone_template_tasks_select ON public.milestone_template_tasks;
DROP POLICY IF EXISTS milestone_template_tasks_insert ON public.milestone_template_tasks;
DROP POLICY IF EXISTS milestone_template_tasks_update ON public.milestone_template_tasks;
DROP POLICY IF EXISTS milestone_template_tasks_delete ON public.milestone_template_tasks;

CREATE POLICY milestone_template_tasks_select ON public.milestone_template_tasks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.milestone_templates t WHERE t.id = milestone_template_tasks.template_id
               AND t.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)));

CREATE POLICY milestone_template_tasks_insert ON public.milestone_template_tasks FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.milestone_templates t WHERE t.id = milestone_template_tasks.template_id
                    AND t.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)));

CREATE POLICY milestone_template_tasks_update ON public.milestone_template_tasks FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.milestone_templates t WHERE t.id = milestone_template_tasks.template_id
               AND t.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)))
WITH CHECK (EXISTS (SELECT 1 FROM public.milestone_templates t WHERE t.id = milestone_template_tasks.template_id
                    AND t.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)));

CREATE POLICY milestone_template_tasks_delete ON public.milestone_template_tasks FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.milestone_templates t WHERE t.id = milestone_template_tasks.template_id
               AND t.company_id = (SELECT company_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1)));

-- 3. save_milestone_as_template ----------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_milestone_as_template(p_milestone_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src  public.project_milestones%ROWTYPE;
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
BEGIN
  IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'Choose a milestone to save'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Give the template a name'; END IF;

  -- Row-level security decides what the caller can see: an invisible milestone looks the same as a missing one.
  SELECT * INTO v_src FROM public.project_milestones WHERE id = p_milestone_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.milestone_templates WHERE company_id = v_src.company_id AND lower(name) = lower(v_name)) THEN
    RAISE EXCEPTION 'A template named "%" already exists', v_name;
  END IF;

  BEGIN
    INSERT INTO public.milestone_templates (
      company_id, name, description, payment_amount, planned_duration_days,
      planned_labour_cost, planned_material_cost, planned_equipment_cost, crew_size_needed, production_rate_per_day, created_by
    ) VALUES (
      v_src.company_id, v_name, v_src.description, v_src.payment_amount, v_src.planned_duration_days,
      v_src.planned_labour_cost, v_src.planned_material_cost, v_src.planned_equipment_cost, v_src.crew_size_needed, v_src.production_rate_per_day, auth.uid()
    ) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- two people saving the same name at the same moment
    RAISE EXCEPTION 'A template named "%" already exists', v_name;
  END;

  INSERT INTO public.milestone_template_tasks (
    template_id, sort_order, task_name, task_description, trade_type, quantity, unit, rate_per_unit, crew_size,
    production_rate_per_day, planned_duration_days, weather_impact_factor, labor_cost_per_day, equipment_cost_per_day,
    material_cost_total, linked_assembly_id, linked_item_id, linked_assembly_name, linked_item_name
  )
  SELECT v_id, (row_number() OVER (ORDER BY t.created_at, t.id))::int, t.task_name, t.task_description, t.trade_type, t.quantity, t.unit, t.rate_per_unit, t.crew_size,
         t.production_rate_per_day, t.planned_duration_days, t.weather_impact_factor, t.labor_cost_per_day, t.equipment_cost_per_day,
         t.material_cost_total, t.linked_assembly_id, t.linked_item_id, t.linked_assembly_name, t.linked_item_name
  FROM public.project_tasks t
  WHERE t.milestone_id = p_milestone_id;

  RETURN v_id;
END;
$$;

-- 4. apply_milestone_template -------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_milestone_template(p_template_id uuid, p_project_id uuid)
RETURNS public.project_milestones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tpl     public.milestone_templates%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_new     public.project_milestones%ROWTYPE;
  v_next_no int;
  v_tt      public.milestone_template_tasks%ROWTYPE;
BEGIN
  IF p_template_id IS NULL THEN RAISE EXCEPTION 'Choose a template'; END IF;
  IF p_project_id IS NULL THEN RAISE EXCEPTION 'Choose a project'; END IF;

  SELECT * INTO v_tpl FROM public.milestone_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF v_tpl.company_id IS DISTINCT FROM v_project.company_id THEN
    RAISE EXCEPTION 'The template and the project must belong to the same company';
  END IF;

  -- Two people adding to the same project at once must not be handed the same milestone number.
  PERFORM pg_advisory_xact_lock(hashtext('apply_milestone_template:' || p_project_id::text));
  SELECT coalesce(max(milestone_no), 0) + 1 INTO v_next_no FROM public.project_milestones WHERE project_id = p_project_id;

  INSERT INTO public.project_milestones (
    project_id, company_id, milestone_no, milestone_name, description, status,
    planned_start_date, planned_end_date, planned_duration_days,
    actual_start_date, actual_end_date, actual_duration_days,
    planned_labour_cost, planned_material_cost, planned_equipment_cost, planned_total_cost,
    actual_labour_cost, actual_material_cost, actual_total_cost, percent_complete,
    crew_size_needed, production_rate_per_day, contract_milestone_id, payment_amount
  ) VALUES (
    p_project_id, v_project.company_id, v_next_no, v_tpl.name, v_tpl.description, 'planned',
    NULL, NULL, v_tpl.planned_duration_days,
    NULL, NULL, NULL,
    coalesce(v_tpl.planned_labour_cost, 0), coalesce(v_tpl.planned_material_cost, 0), coalesce(v_tpl.planned_equipment_cost, 0),
    coalesce(v_tpl.planned_labour_cost, 0) + coalesce(v_tpl.planned_material_cost, 0) + coalesce(v_tpl.planned_equipment_cost, 0),
    0, 0, 0, 0,
    v_tpl.crew_size_needed, v_tpl.production_rate_per_day, NULL, coalesce(v_tpl.payment_amount, 0)
  ) RETURNING * INTO v_new;

  FOR v_tt IN SELECT * FROM public.milestone_template_tasks WHERE template_id = p_template_id ORDER BY sort_order, id LOOP
    INSERT INTO public.project_tasks (
      project_id, milestone_id, task_name, task_description, trade_type,
      start_date, end_date, status, percent_complete,
      quantity, unit, rate_per_unit, crew_size, production_rate_per_day, planned_duration_days,
      actual_quantity_completed, actual_duration_days, weather_impact_factor,
      labor_cost_per_day, equipment_cost_per_day, material_cost_total,
      boq_section_id, boq_item_id, quantity_source_type, auto_sync_quantity,
      linked_assembly_id, linked_item_id, linked_assembly_name, linked_item_name,
      created_at
    ) VALUES (
      p_project_id, v_new.id, v_tt.task_name, v_tt.task_description, v_tt.trade_type,
      NULL, NULL, 'planned', 0,
      v_tt.quantity, v_tt.unit, v_tt.rate_per_unit, v_tt.crew_size, v_tt.production_rate_per_day, v_tt.planned_duration_days,
      0, 0, v_tt.weather_impact_factor,
      v_tt.labor_cost_per_day, v_tt.equipment_cost_per_day, v_tt.material_cost_total,
      NULL, NULL, 'manual', false,
      v_tt.linked_assembly_id, v_tt.linked_item_id, v_tt.linked_assembly_name, v_tt.linked_item_name,
      -- now() is the same for every row of one transaction; clock_timestamp() moves on, so the tasks keep the template's order
      clock_timestamp()
    );
  END LOOP;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.save_milestone_as_template(uuid, text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_milestone_template(uuid, uuid)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_milestone_as_template(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_milestone_template(uuid, uuid)   TO authenticated;

COMMIT;
