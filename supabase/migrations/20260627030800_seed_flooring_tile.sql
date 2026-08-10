/*
  Seed: Flooring & Tile
  Jamaican market rates — JMD, effective 2026-06
  Tile coverage: 1 box = 10 ft² (unless noted).
  Grout bag 25lb covers ~80–120 ft².
  Thinset bag 50lb covers ~50 ft².
*/

-- ═══════════════════════════════════════════════════════
--  CERAMIC & PORCELAIN TILE
-- ═══════════════════════════════════════════════════════

-- 12"×12" ceramic floor tile (box = 10 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Ceramic Floor Tile 12"×12" (box 10ft²)', 'Flooring & Tile', 'material', 'box', 10, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 18"×18" porcelain floor tile (box = 11.25 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Porcelain Floor Tile 18"×18" (box 11ft²)', 'Flooring & Tile', 'material', 'box', 11, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 24"×24" large format porcelain (box = 16 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Porcelain Floor Tile 24"×24" (box 16ft²)', 'Flooring & Tile', 'material', 'box', 16, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 11000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 4"×4" wall tile (box = 10 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Ceramic Wall Tile 4"×4" (box 10ft²)', 'Flooring & Tile', 'material', 'box', 10, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  SETTING MATERIALS
-- ═══════════════════════════════════════════════════════

-- Thinset mortar 50lb bag (covers ~50 ft² floor)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Thinset Mortar 50lb bag', 'Flooring & Tile', 'material', 'bag', 50, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- White thinset 50lb (for light/marble tile)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('White Thinset Mortar 50lb bag', 'Flooring & Tile', 'material', 'bag', 50, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Grout sanded 25lb bag (covers ~80 ft² at 1/8" joint)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Sanded Grout 25lb bag', 'Flooring & Tile', 'material', 'bag', 80, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Grout unsanded 10lb bag (wall tile, narrow joints, covers ~100 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Unsanded Grout 10lb bag', 'Flooring & Tile', 'material', 'bag', 100, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Tile spacers 3/16" (box 500)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Tile Spacers 3/16" (box 500)', 'Flooring & Tile', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Waterproofing membrane 1-gal (covers ~60 ft² in wet areas)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Tile Waterproofing Membrane 1 gal', 'Flooring & Tile', 'material', 'gal', 60, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Tile trim/bullnose per lf
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Tile Bullnose Trim per lf', 'Flooring & Tile', 'material', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  OTHER FLOORING
-- ═══════════════════════════════════════════════════════

-- Vinyl plank LVP 6mm (box = 22 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Luxury Vinyl Plank 6mm (box 22ft²)', 'Flooring & Tile', 'material', 'box', 22, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Laminate flooring 8mm (box = 21.5 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Laminate Flooring 8mm (box 21.5ft²)', 'Flooring & Tile', 'material', 'box', 21, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Underlayment foam 3mm (roll 200 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Flooring Underlayment 3mm (200ft² roll)', 'Flooring & Tile', 'material', 'roll', 200, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Concrete floor leveller 50lb (covers 50 ft² at 1/8")
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Self-Levelling Compound 50lb bag', 'Flooring & Tile', 'material', 'bag', 50, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  LABOR
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Tile Setter Day Rate', 'Flooring & Tile', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 11000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Tile Install Labor (ft²)', 'Flooring & Tile', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Vinyl/Laminate Install Labor (ft²)', 'Flooring & Tile', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 280, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  EQUIPMENT
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Tile Wet Saw Rental (day)', 'Flooring & Tile', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Floor Grinder Rental (day)', 'Flooring & Tile', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 8000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
