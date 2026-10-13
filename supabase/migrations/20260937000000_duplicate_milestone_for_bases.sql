-- NOT YET APPLIED: review, then run this file against the live database (SQL Editor, or `npx supabase db query --linked -f <this file>`).
-- Copy a milestone for several "bases" (e.g. 4 identical water-harvesting points), so each base counts separately in progress.
--
-- The client portal's progress bar is "complete project_tasks / all project_tasks" (get_portal_data); milestones themselves are not
-- counted, so a copy has to carry its tasks. duplicate_milestone_for_bases(milestone, bases) makes, for every base, one copy of the
-- milestone named '<original> – <base>' plus a copy of each of the milestone's tasks. One call is one transaction: all copies or none.
--
-- How a "base" is represented in the BOQ (checked against the live data): a base is a BOQ LINE (boq_section_items) whose line_name is the
-- base's name, e.g. project "WATER Point - Location ( Hanover )", section "Water Harvesting", four lines "Water Point" named
-- "Riverside Division - Rugland", "Lucea Division - Martin Castle", "Sandy Bay Division - Mount Peller", "Hopewell Division - Cacoon".
-- (Not a BOQ section, and not boq_headers.custom_name_*.) The base names offered in the app are the distinct non-empty line_name values.
--
-- p_bases is a JSON array: [{"name": "Riverside Division - Rugland"}, {"name": "Extra base", "boq_line_name": "optional different BOQ name"}].
-- A plain string element ("Tank 1") is also accepted. "boq_line_name" (default: the name) is the BOQ line_name to match against.
--
-- Task copy rule: each copy is a fresh task: status 'planned', percent_complete 0, actual quantity/duration reset, and everything else
-- (name, quantity, unit, rates, crew, durations, trade, description, costs, assembly links) copied as is.
-- BOQ link rule: if the original task is linked to a BOQ line (boq_item_id) the copy is linked to the base's equivalent line: a line in
-- the SAME BOQ (same boq_headers row) whose line_name equals the base's name (case/space-insensitive) and whose item_name equals the
-- original line's item_name; if several match, the one with the same cost_item_id; if exactly one line remains, the copy gets that
-- boq_item_id and its boq_section_id and keeps the original's quantity_source_type / auto_sync_quantity. Otherwise (no BOQ link on the
-- original, no equivalent line, or more than one) the copy is unlinked: boq_item_id and boq_section_id NULL, quantity_source_type
-- 'manual', auto_sync_quantity false.
--
-- Milestone copy: status 'planned', actual_* dates/durations NULL, actual costs 0, percent_complete 0, payment_amount copied,
-- contract_milestone_id NULL, milestone_no continues after the project's current highest number.
--
-- Refuses: no milestone, an empty list, more than 50 bases, an empty or duplicate base name, a name whose copy already exists in the
-- project, and a milestone the caller cannot see. SECURITY INVOKER: the caller's normal row-level security applies throughout.
BEGIN;

CREATE OR REPLACE FUNCTION public.duplicate_milestone_for_bases(p_milestone_id uuid, p_bases jsonb)
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
        quantity, unit, rate_per_unit, crew_size, production_rate_per_day, planned_duration_days,
        actual_quantity_completed, actual_duration_days, weather_impact_factor,
        labor_cost_per_day, equipment_cost_per_day, material_cost_total,
        boq_section_id, boq_item_id, quantity_source_type, auto_sync_quantity,
        linked_assembly_id, linked_item_id, linked_assembly_name, linked_item_name
      ) VALUES (
        v_t.project_id, v_new.id, v_t.task_name, v_t.task_description, v_t.trade_type,
        v_t.start_date, v_t.end_date, 'planned', 0,
        v_t.quantity, v_t.unit, v_t.rate_per_unit, v_t.crew_size, v_t.production_rate_per_day, v_t.planned_duration_days,
        0, 0, v_t.weather_impact_factor,
        v_t.labor_cost_per_day, v_t.equipment_cost_per_day, v_t.material_cost_total,
        v_match_section, v_match_id,
        CASE WHEN v_match_id IS NULL THEN 'manual' ELSE v_t.quantity_source_type END,
        CASE WHEN v_match_id IS NULL THEN false ELSE coalesce(v_t.auto_sync_quantity, false) END,
        v_t.linked_assembly_id, v_t.linked_item_id, v_t.linked_assembly_name, v_t.linked_item_name
      );
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT * FROM public.project_milestones WHERE id = ANY (v_ids) ORDER BY milestone_no;
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_milestone_for_bases(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_milestone_for_bases(uuid, jsonb) TO authenticated;

COMMIT;
