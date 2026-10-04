-- Recreate v_cost_items_current to expose grade and piece_weight_kg. Applied directly to the live database; this file
-- version-controls it.
--
-- ORDERING: this MUST sort after 20260924000000_fix_cost_item_rates_read_and_lock_down_cost_items_view.sql. Dropping and
-- recreating a view discards its options and grants, so this file sets security_invoker and revokes anon access ITSELF
-- rather than relying on that earlier file — otherwise recreating the view would silently undo the lock-down.
--
-- cost_items.grade comes from 20260712000000_add_cost_items_grade.sql. cost_items.piece_weight_kg (nullable numeric,
-- kg per sold piece, e.g. one rebar bar) was added by hand and had no migration, so it is added here (a no-op where
-- it already exists).
BEGIN;

ALTER TABLE public.cost_items
  ADD COLUMN IF NOT EXISTS piece_weight_kg numeric;

DROP VIEW IF EXISTS public.v_cost_items_current;

CREATE VIEW public.v_cost_items_current
WITH (security_invoker = true) AS
SELECT
  ci.id,
  ci.item_name,
  ci.description,
  ci.cost_code,
  ci.category,
  ci.item_type,
  ci.unit,
  ci.variant,
  ci.grade,
  ci.item_size,
  ci.item_group,
  ci.material_type,
  ci.use_type,
  ci.variant_code,
  ci.supplier_sku,
  ci.is_active,
  ci.tags,
  ci.company_id,
  ci.calculator_json,
  ci.calc_engine_json,
  ci.formula,
  ci.waste_percent,
  ci.labor_formula,
  ci.material_formula,
  ci.equipment_formula,
  ci.calculator_notes,
  ci.measurement_type,
  ci.formula_variables,
  ci.coverage_factor,
  ci.coverage_unit,
  ci.piece_weight_kg,
  ci.created_at,
  ci.updated_at,
  r.rate            AS current_rate,
  r.currency        AS current_currency,
  r.effective_date  AS current_effective_date,
  r.source          AS current_source,
  r.batch_id        AS current_batch_id
FROM public.cost_items ci
LEFT JOIN LATERAL (
  SELECT rate, currency, effective_date, source, batch_id
  FROM public.cost_item_rates
  WHERE cost_item_id = ci.id
  ORDER BY effective_date DESC NULLS LAST, created_at DESC
  LIMIT 1
) r ON true;

REVOKE ALL ON public.v_cost_items_current FROM anon;

COMMENT ON VIEW public.v_cost_items_current IS
  'Cost items with current rate and coverage factor for takeoff unit conversion';

COMMIT;
