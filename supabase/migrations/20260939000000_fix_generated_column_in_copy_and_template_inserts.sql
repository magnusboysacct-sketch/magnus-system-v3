-- NOT YET APPLIED: review, then run this file against the live database (SQL Editor, or `npx supabase db query --linked -f <this file>`).
-- Fix for the error: cannot insert a non-DEFAULT value into column "planned_duration_days" (Copy for bases and Add from template).
--
-- In the live database project_tasks.planned_duration_days is a GENERATED ALWAYS (stored) column:
--   CASE WHEN quantity > 0 AND crew_size > 0 AND production_rate_per_day > 0
--        THEN round(quantity / (crew_size * production_rate_per_day), 2) ELSE NULL END
-- (checked with information_schema.columns / pg_attribute; it is the ONLY generated or identity column on project_milestones and project_tasks).
-- It cannot be written to, so it is removed from the project_tasks INSERT column lists of the two functions below; every copy gets the value the
-- database computes from the task's own quantity, crew size and production rate (the same as the original task). Everything else in both
-- functions is identical to migrations 20260937000000 and 20260938000000 (which are not edited), and the grants are the same.
-- (project_milestones.planned_duration_days is an ordinary column and is still copied. milestone_template_tasks.planned_duration_days is also an
-- ordinary column: it still records what the task had when the template was saved, but it is no longer inserted into new tasks.)
BEGIN;

CREATE OR REPLACE FUNCTION public.duplicate_milestone_for_bases(p_milestone_id uuid, p_bases jsonb, p_remove_original boolean DEFAULT false)
RETURNS SETOF public.project_milestones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src      public.project_milestones%ROWTYPE;
  v_new      public.project_milestones%ROWTYPE;
  v_t        public.project_tasks%ROWTYPE;
  v_count    int;
  v_elem     jsonb;
  v_name     text;
  v_names    text[] := ARRAY[]::text[];
  v_lines    text[] := ARRAY[]::text[];
  v_ids      uuid[] := ARRAY[]::uuid[];
  v_next_no  int;
  v_orig     record;
  v_match_id      uuid;
  v_match_section uuid;
  v_matches  int;
  v_removed  int;
  i          int;
BEGIN
  IF p_milestone_id IS NULL THEN RAISE EXCEPTION 'Choose a milestone to copy'; END IF;
  IF p_bases IS NULL OR jsonb_typeof(p_bases) <> 'array' THEN RAISE EXCEPTION 'Provide the bases as a list'; END IF;
  v_count := jsonb_array_length(p_bases);
  IF v_count = 0 THEN RAISE EXCEPTION 'Add at least one base'; END IF;
  IF v_count > 50 THEN RAISE EXCEPTION 'You can copy a milestone for at most 50 bases at a time'; END IF;

  -- Row-level security decides what the caller can see: an invisible milestone looks the same as a missing one.
  SELECT * INTO v_src FROM public.project_milestones WHERE id = p_milestone_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found'; END IF;

  -- Removing the original is only allowed while it is still an untouched template (checked before anything is written).
  IF coalesce(p_remove_original, false) THEN
    IF v_src.status <> 'planned' OR coalesce(v_src.percent_complete, 0) > 0 OR coalesce(v_src.actual_total_cost, 0) > 0
       OR EXISTS (
         SELECT 1 FROM public.project_tasks t
         WHERE t.milestone_id = p_milestone_id
           AND (t.status <> 'planned' OR coalesce(t.actual_quantity_completed, 0) > 0 OR coalesce(t.percent_complete, 0) > 0)
       ) THEN
      RAISE EXCEPTION 'This milestone already has progress or payments; keep it instead';
    END IF;
  END IF;

  -- Validate every name before anything is written.
  FOR i IN 0 .. v_count - 1 LOOP
    v_elem := p_bases -> i;
    IF jsonb_typeof(v_elem) = 'string' THEN
      v_name := btrim(v_elem #>> '{}');
    ELSIF jsonb_typeof(v_elem) = 'object' THEN
      v_name := btrim(coalesce(v_elem ->> 'name', ''));
    ELSE
      RAISE EXCEPTION 'Every base needs a name';
    END IF;
    IF v_name = '' THEN RAISE EXCEPTION 'Every base needs a name'; END IF;
    IF lower(v_name) = ANY (SELECT lower(x) FROM unnest(v_names) AS x) THEN
      RAISE EXCEPTION 'Duplicate base name: %', v_name;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_milestones m
      WHERE m.project_id = v_src.project_id AND lower(m.milestone_name) = lower(v_src.milestone_name || ' – ' || v_name)
    ) THEN
      RAISE EXCEPTION 'A milestone named "%" already exists in this project', v_src.milestone_name || ' – ' || v_name;
    END IF;
    v_names := v_names || v_name;
    v_lines := v_lines || coalesce(
      CASE WHEN jsonb_typeof(v_elem) = 'object' THEN nullif(btrim(coalesce(v_elem ->> 'boq_line_name', '')), '') END,
      v_name);
  END LOOP;

  -- Two people copying at once must not be handed the same milestone numbers.
  PERFORM pg_advisory_xact_lock(hashtext('duplicate_milestone_for_bases:' || v_src.project_id::text));
  SELECT coalesce(max(milestone_no), 0) INTO v_next_no FROM public.project_milestones WHERE project_id = v_src.project_id;

  FOR i IN 1 .. v_count LOOP
    v_next_no := v_next_no + 1;

    INSERT INTO public.project_milestones (
      project_id, company_id, milestone_no, milestone_name, description, status,
      planned_start_date, planned_end_date, planned_duration_days,
      actual_start_date, actual_end_date, actual_duration_days,
      planned_labour_cost, planned_material_cost, planned_equipment_cost, planned_total_cost,
      actual_labour_cost, actual_material_cost, actual_total_cost, percent_complete,
      crew_size_needed, production_rate_per_day, contract_milestone_id, payment_amount
    ) VALUES (
      v_src.project_id, v_src.company_id, v_next_no, v_src.milestone_name || ' – ' || v_names[i], v_src.description, 'planned',
      v_src.planned_start_date, v_src.planned_end_date, v_src.planned_duration_days,
      NULL, NULL, NULL,
      v_src.planned_labour_cost, v_src.planned_material_cost, v_src.planned_equipment_cost, v_src.planned_total_cost,
      0, 0, 0, 0,
      v_src.crew_size_needed, v_src.production_rate_per_day, NULL, v_src.payment_amount
    ) RETURNING * INTO v_new;
    v_ids := v_ids || v_new.id;

    FOR v_t IN SELECT * FROM public.project_tasks WHERE milestone_id = p_milestone_id ORDER BY created_at, id LOOP
      -- Find this base's equivalent of the task's BOQ line (see the rule in the header).
      v_match_id := NULL; v_match_section := NULL;
      IF v_t.boq_item_id IS NOT NULL THEN
        SELECT it.item_name, it.cost_item_id, s.boq_id INTO v_orig
        FROM public.boq_section_items it JOIN public.boq_sections s ON s.id = it.section_id
        WHERE it.id = v_t.boq_item_id;
        IF FOUND THEN
          SELECT count(*), (array_agg(c.id))[1], (array_agg(c.section_id))[1]
            INTO v_matches, v_match_id, v_match_section
          FROM (
            SELECT it.id, it.section_id FROM public.boq_section_items it JOIN public.boq_sections s ON s.id = it.section_id
            WHERE s.boq_id = v_orig.boq_id
              AND lower(btrim(coalesce(it.line_name, ''))) = lower(btrim(v_lines[i]))
              AND it.item_name IS NOT DISTINCT FROM v_orig.item_name
          ) c;
          IF v_matches > 1 THEN
            SELECT count(*), (array_agg(c.id))[1], (array_agg(c.section_id))[1]
              INTO v_matches, v_match_id, v_match_section
            FROM (
              SELECT it.id, it.section_id FROM public.boq_section_items it JOIN public.boq_sections s ON s.id = it.section_id
              WHERE s.boq_id = v_orig.boq_id
                AND lower(btrim(coalesce(it.line_name, ''))) = lower(btrim(v_lines[i]))
                AND it.item_name IS NOT DISTINCT FROM v_orig.item_name
                AND it.cost_item_id IS NOT DISTINCT FROM v_orig.cost_item_id
            ) c;
          END IF;
          IF v_matches <> 1 THEN v_match_id := NULL; v_match_section := NULL; END IF;
        END IF;
      END IF;

      INSERT INTO public.project_tasks (
        project_id, milestone_id, task_name, task_description, trade_type,
        start_date, end_date, status, percent_complete,
        quantity, unit, rate_per_unit, crew_size, production_rate_per_day,
        actual_quantity_completed, actual_duration_days, weather_impact_factor,
        labor_cost_per_day, equipment_cost_per_day, material_cost_total,
        boq_section_id, boq_item_id, quantity_source_type, auto_sync_quantity,
        linked_assembly_id, linked_item_id, linked_assembly_name, linked_item_name,
        created_at
      ) VALUES (
        v_t.project_id, v_new.id, v_t.task_name, v_t.task_description, v_t.trade_type,
        v_t.start_date, v_t.end_date, 'planned', 0,
        v_t.quantity, v_t.unit, v_t.rate_per_unit, v_t.crew_size, v_t.production_rate_per_day,
        0, 0, v_t.weather_impact_factor,
        v_t.labor_cost_per_day, v_t.equipment_cost_per_day, v_t.material_cost_total,
        v_match_section, v_match_id,
        CASE WHEN v_match_id IS NULL THEN 'manual' ELSE v_t.quantity_source_type END,
        CASE WHEN v_match_id IS NULL THEN false ELSE coalesce(v_t.auto_sync_quantity, false) END,
        v_t.linked_assembly_id, v_t.linked_item_id, v_t.linked_assembly_name, v_t.linked_item_name,
        -- now() is the same for every row of one transaction; clock_timestamp() moves on, so the copies keep the original task order
        clock_timestamp()
      );
    END LOOP;
  END LOOP;

  -- The original was only a template: remove it and its tasks now, in this same transaction (any failure above or here undoes the copies too).
  IF coalesce(p_remove_original, false) THEN
    DELETE FROM public.project_tasks WHERE milestone_id = p_milestone_id;
    DELETE FROM public.project_milestones WHERE id = p_milestone_id;
    GET DIAGNOSTICS v_removed = ROW_COUNT;
    IF v_removed <> 1 THEN RAISE EXCEPTION 'Could not remove the original milestone'; END IF;
  END IF;

  RETURN QUERY SELECT * FROM public.project_milestones WHERE id = ANY (v_ids) ORDER BY milestone_no;
END;
$$;

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
      quantity, unit, rate_per_unit, crew_size, production_rate_per_day,
      actual_quantity_completed, actual_duration_days, weather_impact_factor,
      labor_cost_per_day, equipment_cost_per_day, material_cost_total,
      boq_section_id, boq_item_id, quantity_source_type, auto_sync_quantity,
      linked_assembly_id, linked_item_id, linked_assembly_name, linked_item_name,
      created_at
    ) VALUES (
      p_project_id, v_new.id, v_tt.task_name, v_tt.task_description, v_tt.trade_type,
      NULL, NULL, 'planned', 0,
      v_tt.quantity, v_tt.unit, v_tt.rate_per_unit, v_tt.crew_size, v_tt.production_rate_per_day,
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

REVOKE ALL ON FUNCTION public.duplicate_milestone_for_bases(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_milestone_for_bases(uuid, jsonb, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_milestone_template(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_milestone_template(uuid, uuid) TO authenticated;

COMMIT;
