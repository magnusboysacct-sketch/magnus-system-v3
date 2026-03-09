/*
  # Fix v_cost_items_current View - Add Missing Columns

  1. Changes
    - Drop and recreate v_cost_items_current view
    - Add missing columns from cost_items table:
      - variant
      - calculator_json
      - calc_engine_json
    - Preserve all existing columns used by RatesPage

  2. Purpose
    - Fix "column calc_engine_json does not exist" error in RatesPage
    - Ensure all cost_items columns are available in the view
    - Maintain compatibility with existing queries

  3. Columns included:
    From cost_items:
    - id, item_name, description, cost_code, unit, category, item_type
    - variant, calculator_json, calc_engine_json
    - item_size, measurement_type
    - formula, formula_variables, waste_percent
    - labor_formula, material_formula, equipment_formula
    - calculator_notes, updated_at
    
    From cost_item_rates (current rate):
    - current_rate, current_currency, current_effective_date
    - current_source, current_batch_id
*/

DROP VIEW IF EXISTS v_cost_items_current;

CREATE VIEW v_cost_items_current AS
SELECT 
  ci.id,
  ci.item_name,
  ci.description,
  ci.cost_code,
  ci.unit,
  ci.category,
  ci.item_type,
  ci.variant,
  ci.calculator_json,
  ci.calc_engine_json,
  ci.updated_at,
  ci.item_size,
  ci.measurement_type,
  ci.formula,
  ci.formula_variables,
  ci.waste_percent,
  ci.labor_formula,
  ci.material_formula,
  ci.equipment_formula,
  ci.calculator_notes,
  r.rate AS current_rate,
  r.currency AS current_currency,
  r.effective_date AS current_effective_date,
  r.source AS current_source,
  r.batch_id AS current_batch_id
FROM cost_items ci
LEFT JOIN LATERAL (
  SELECT 
    cr.rate,
    cr.currency,
    cr.effective_date,
    cr.source,
    cr.batch_id
  FROM cost_item_rates cr
  WHERE cr.cost_item_id = ci.id
  ORDER BY cr.effective_date DESC NULLS LAST, cr.created_at DESC NULLS LAST
  LIMIT 1
) r ON true;

COMMENT ON VIEW v_cost_items_current IS 'Cost items with their most current rate information, including all calculation engine data';
