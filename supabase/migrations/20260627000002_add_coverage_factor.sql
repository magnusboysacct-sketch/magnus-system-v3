/*
  Add coverage_factor and coverage_unit to cost_items.

  coverage_factor: how much of coverage_unit one sold unit of this item covers/yields.
  coverage_unit:   the measured unit (ft², lf, ft³, ea) that coverage_factor applies to.

  Conversion rule: units_needed = ceil(measured_quantity / coverage_factor)
  When coverage_factor IS NULL or 0, quantity passes through unchanged (sold in same
  unit as measured — concrete by yd³, equipment by hr, labor by day, etc.).

  Also adds a unique constraint on (item_name, category) so seed files can use
  ON CONFLICT DO UPDATE safely.
*/

-- New columns
ALTER TABLE cost_items
  ADD COLUMN IF NOT EXISTS coverage_factor numeric,
  ADD COLUMN IF NOT EXISTS coverage_unit   text;

-- Unique constraint enabling idempotent seeds
ALTER TABLE cost_items
  DROP CONSTRAINT IF EXISTS uq_cost_items_name_category;

ALTER TABLE cost_items
  ADD CONSTRAINT uq_cost_items_name_category UNIQUE (item_name, category);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cost_items_coverage
  ON cost_items(coverage_unit) WHERE coverage_factor IS NOT NULL;

-- Recreate the view to expose the new columns
-- (the smart-attributes migration already owns the canonical view definition;
--  we just add coverage_factor / coverage_unit here)
DROP VIEW IF EXISTS v_cost_items_current CASCADE;

CREATE VIEW v_cost_items_current AS
SELECT
  ci.id,
  ci.item_name,
  ci.description,
  ci.cost_code,
  ci.category,
  ci.item_type,
  ci.unit,
  ci.variant,
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
  ci.created_at,
  ci.updated_at,
  r.rate            AS current_rate,
  r.currency        AS current_currency,
  r.effective_date  AS current_effective_date,
  r.source          AS current_source,
  r.batch_id        AS current_batch_id
FROM cost_items ci
LEFT JOIN LATERAL (
  SELECT rate, currency, effective_date, source, batch_id
  FROM cost_item_rates
  WHERE cost_item_id = ci.id
  ORDER BY effective_date DESC NULLS LAST, created_at DESC
  LIMIT 1
) r ON true;

COMMENT ON VIEW v_cost_items_current IS
  'Cost items with current rate and coverage factor for takeoff unit conversion';

COMMENT ON COLUMN cost_items.coverage_factor IS
  'How much of coverage_unit one unit of this item covers/yields. NULL = no conversion (sold in same unit as measured).';
COMMENT ON COLUMN cost_items.coverage_unit IS
  'The measured unit (ft², lf, ft³, ea) that coverage_factor applies to.';
