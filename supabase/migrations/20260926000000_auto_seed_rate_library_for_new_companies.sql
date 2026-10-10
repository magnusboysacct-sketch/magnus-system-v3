-- Auto-copy the rate library into every new company. NOT YET APPLIED - review before running.
--
-- Today every cost_items row is owned by the one real company, and a brand-new company starts with an empty library. This
-- migration:
--   1. creates ONE system company ("Rate Library Template") that no user belongs to, used purely as the template holder;
--   2. copies the real company's cost_items (and each item's CURRENT price only) into it, once;
--   3. adds seed_company_rate_library(company_id), which copies the template into any company that has no items yet;
--   4. adds an AFTER INSERT trigger on companies that calls it, so every new company gets its own editable copy - whether it
--      is created by handle_new_user (self sign-up or a user added in the dashboard) or by a raw SQL insert.
-- The real company's existing items are only READ here; none of them is changed.
--
-- One shared copy routine (_copy_rate_library_items) does the actual copying for BOTH the one-time template seed and the
-- ongoing per-company seed, so the two can never use different column lists. Columns copied: item_name, is_active and the
-- same set createOwnCopyAtRate copies (src/lib/rateLibrary.ts COPY_COLUMNS) plus piece_weight_kg. cost_code, supplier_sku
-- and variant_code are deliberately not copied (company-specific / unique-ish), and price history, supplier-specific rate
-- fields and supplier mappings are not copied either.
--
-- Safe to run twice: the system company insert is ON CONFLICT DO NOTHING, the one-time seed is skipped when the template
-- already has items, and seed_company_rate_library does nothing for a company that already has items.
BEGIN;

-- ------------------------------------------------------------------------------------------------------------------
-- 0. The system company's fixed id, defined in one place.
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rate_library_template_company_id()
RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$ SELECT '00000000-0000-4000-8000-00000000a110'::uuid $$;

-- ------------------------------------------------------------------------------------------------------------------
-- 1. The shared copy routine: every cost_items row of p_source -> a new row for p_target (new ids), plus ONE rate row per
--    item holding that item's current price (latest effective_date, then latest created_at - the same rule as
--    v_cost_items_current). Returns the number of items copied. One statement, so it is all-or-nothing.
--    No guards of its own: callers decide when it is allowed to run.
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._copy_rate_library_items(p_source uuid, p_target uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_items integer;
BEGIN
  WITH src AS (
    SELECT s.*, gen_random_uuid() AS new_id
    FROM public.cost_items s
    WHERE s.company_id = p_source
  ),
  ins AS (
    INSERT INTO public.cost_items (
      id, company_id, item_name, is_active,
      description, variant, grade, category, item_type, unit, item_size, item_group, material_type,
      use_type, tags, waste_percent, measurement_type, formula, labor_formula, material_formula,
      equipment_formula, calculator_json, calc_engine_json, calculator_notes, formula_variables,
      coverage_factor, coverage_unit, piece_weight_kg
    )
    SELECT
      new_id, p_target, item_name, COALESCE(is_active, true),
      description, variant, grade, category, item_type, unit, item_size, item_group, material_type,
      use_type, tags, waste_percent, measurement_type, formula, labor_formula, material_formula,
      equipment_formula, calculator_json, calc_engine_json, calculator_notes, formula_variables,
      coverage_factor, coverage_unit, piece_weight_kg
    FROM src
    RETURNING id
  ),
  rates AS (
    INSERT INTO public.cost_item_rates (cost_item_id, rate, currency, effective_date, source)
    SELECT
      src.new_id,
      r.rate,
      COALESCE(r.currency, 'JMD'),
      COALESCE(r.effective_date, (now() AT TIME ZONE 'America/Jamaica')::date),
      'template_copy'
    FROM src
    JOIN ins ON ins.id = src.new_id
    JOIN LATERAL (
      SELECT cr.rate, cr.currency, cr.effective_date
      FROM public.cost_item_rates cr
      WHERE cr.cost_item_id = src.id
      ORDER BY cr.effective_date DESC NULLS LAST, cr.created_at DESC
      LIMIT 1
    ) r ON r.rate IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_items FROM ins;

  RETURN v_items;
END;
$$;

-- ------------------------------------------------------------------------------------------------------------------
-- 2. seed_company_rate_library(target_company_id): copy the template into a company that has no items yet.
--    Idempotent (a company that already has any cost_items is skipped - no error, no duplicates). The copy runs inside its
--    own BEGIN/EXCEPTION block, so a failure logs a WARNING, undoes only the copy, and never blocks the caller.
--    Returns the number of items copied (0 when skipped or on failure).
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_company_rate_library(target_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template uuid := public.rate_library_template_company_id();
BEGIN
  IF target_company_id IS NULL OR target_company_id = v_template THEN
    RETURN 0;
  END IF;

  BEGIN
    -- Two simultaneous calls for the same company queue up, so the "already has items" check below is reliable.
    PERFORM pg_advisory_xact_lock(hashtextextended('seed_company_rate_library:' || target_company_id::text, 0));

    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company_id) THEN
      RAISE WARNING 'seed_company_rate_library: company % does not exist, nothing copied', target_company_id;
      RETURN 0;
    END IF;

    IF EXISTS (SELECT 1 FROM public.cost_items WHERE company_id = target_company_id) THEN
      RETURN 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cost_items WHERE company_id = v_template) THEN
      RAISE WARNING 'seed_company_rate_library: the template library is empty, nothing copied for %', target_company_id;
      RETURN 0;
    END IF;

    RETURN public._copy_rate_library_items(v_template, target_company_id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'seed_company_rate_library failed for %: %', target_company_id, SQLERRM;
    RETURN 0;
  END;
END;
$$;

-- ------------------------------------------------------------------------------------------------------------------
-- 3. The trigger function. It is called while handle_new_user is still running, and handle_new_user rolls back the whole
--    sign-up if anything raises - so this wrapper swallows every error itself (logging a WARNING instead).
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_seed_company_rate_library()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.seed_company_rate_library(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'trg_seed_company_rate_library failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL; -- return value of an AFTER trigger is ignored
END;
$$;

-- These copy one company's library into another, so they must never be callable through the public API. The trigger
-- runs them as the function owner; nothing else needs EXECUTE (an admin can still call seed_company_rate_library from the
-- SQL editor, which runs as the owner).
REVOKE ALL ON FUNCTION public._copy_rate_library_items(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_company_rate_library(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_seed_company_rate_library() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._copy_rate_library_items(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_company_rate_library(uuid) TO service_role;

-- ------------------------------------------------------------------------------------------------------------------
-- 4. One-time: create the system company and seed it from the real company. The trigger does not exist yet, and would
--    skip this company anyway (see the WHEN clause below).
-- ------------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_template uuid := public.rate_library_template_company_id();
  v_sources  uuid[];
  v_source   uuid;
  v_expected integer;
  v_expected_rates integer;
  v_items    integer;
  v_rates    integer;
BEGIN
  INSERT INTO public.companies (id, name)
  VALUES (
    v_template,
    '— Rate Library Template (System) —'
  )
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM public.cost_items WHERE company_id = v_template) THEN
    RAISE NOTICE 'Template library already seeded - skipping the one-time copy.';
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT company_id) INTO v_sources
  FROM public.cost_items
  WHERE company_id IS NOT NULL AND company_id <> v_template;

  IF v_sources IS NULL OR array_length(v_sources, 1) <> 1 THEN
    RAISE EXCEPTION 'Expected cost_items to belong to exactly ONE real company, found % - nothing was changed.',
      COALESCE(array_length(v_sources, 1), 0);
  END IF;
  v_source := v_sources[1];

  SELECT count(*) INTO v_expected FROM public.cost_items WHERE company_id = v_source;
  SELECT count(*) INTO v_expected_rates
  FROM public.cost_items ci
  WHERE ci.company_id = v_source
    AND (SELECT cr.rate FROM public.cost_item_rates cr WHERE cr.cost_item_id = ci.id
         ORDER BY cr.effective_date DESC NULLS LAST, cr.created_at DESC LIMIT 1) IS NOT NULL;

  v_items := public._copy_rate_library_items(v_source, v_template);

  SELECT count(*) INTO v_rates
  FROM public.cost_item_rates r JOIN public.cost_items ci ON ci.id = r.cost_item_id
  WHERE ci.company_id = v_template;

  -- Any mismatch aborts the whole migration (everything above is rolled back).
  IF v_items <> v_expected OR v_rates <> v_expected_rates THEN
    RAISE EXCEPTION 'Template copy mismatch: items % of %, rates % of % - nothing was changed.',
      v_items, v_expected, v_rates, v_expected_rates;
  END IF;

  RAISE NOTICE 'Template library seeded from company %: % items, % prices.', v_source, v_items, v_rates;
END;
$$;

-- ------------------------------------------------------------------------------------------------------------------
-- 5. The trigger. AFTER INSERT on companies (not on auth.users): it fires for every way a company can be created, and it
--    runs after the row exists. It is separate from, and does not replace or conflict with, on_auth_user_created: that one
--    (on auth.users) creates the company/profile/settings; this one (on companies) reacts to the company row that
--    handle_new_user inserts. The system company is excluded.
-- ------------------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS seed_rate_library_on_company_insert ON public.companies;
CREATE TRIGGER seed_rate_library_on_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW
  WHEN (NEW.id IS DISTINCT FROM public.rate_library_template_company_id())
  EXECUTE FUNCTION public.trg_seed_company_rate_library();

COMMIT;
