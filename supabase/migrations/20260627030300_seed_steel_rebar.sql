/*
  Seed: Steel & Rebar
  Jamaican market rates — JMD, effective 2026-06
  Rebar bars are 20ft (6m) lengths; coverage_factor = 20 lf/bar.
  BRC wire mesh sheets 8×4 cover 32 ft².
*/

-- ═══════════════════════════════════════════════════════
--  REBAR
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('#3 Rebar 3/8" (20ft bar)', 'Steel & Rebar', 'material', 'bar', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1900, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('#4 Rebar 1/2" (20ft bar)', 'Steel & Rebar', 'material', 'bar', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('#5 Rebar 5/8" (20ft bar)', 'Steel & Rebar', 'material', 'bar', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('#6 Rebar 3/4" (20ft bar)', 'Steel & Rebar', 'material', 'bar', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('#8 Rebar 1" (20ft bar)', 'Steel & Rebar', 'material', 'bar', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 11500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  WIRE MESH & ACCESSORIES
-- ═══════════════════════════════════════════════════════

-- BRC welded wire mesh 6"×6" W2.9/W2.9 — 4×8 sheet covers 32 ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('BRC Wire Mesh 6×6 W2.9 4×8 sheet', 'Steel & Rebar', 'material', 'sheet', 32, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- BRC wire mesh 4"×4" W4/W4 — 4×8 sheet covers 32 ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('BRC Wire Mesh 4×4 W4 4×8 sheet', 'Steel & Rebar', 'material', 'sheet', 32, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Tie wire (binding) 1kg
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Rebar Tie Wire 1kg', 'Steel & Rebar', 'material', 'kg', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1700, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  STRUCTURAL STEEL
-- ═══════════════════════════════════════════════════════

-- Angle iron 2"×2"×1/4" — per 20ft length (20 lf/piece)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Angle Iron 2"×2"×1/4" 20ft', 'Steel & Rebar', 'material', 'length', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 9000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Angle iron 3"×3"×3/8" — per 20ft length
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Angle Iron 3"×3"×3/8" 20ft', 'Steel & Rebar', 'material', 'length', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 18000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Flat bar 1/4"×2" — per 20ft length
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Flat Bar 1/4"×2" 20ft', 'Steel & Rebar', 'material', 'length', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Square hollow section 2"×2"×3mm — per 20ft
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Square Hollow Section 2"×2"×3mm 20ft', 'Steel & Rebar', 'material', 'length', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 12000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Rectangular hollow section 2"×4"×3mm — per 20ft
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Rect Hollow Section 2"×4"×3mm 20ft', 'Steel & Rebar', 'material', 'length', 20, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 16000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Universal column (H-beam) 100×100 — per lf
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('H-Beam Universal Column 100×100 per lf', 'Steel & Rebar', 'material', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 7000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Galvanised steel sheet 26-gauge 4×8 (roofing deck/flashing) — covers 32 ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Galvanised Sheet 26g 4×8', 'Steel & Rebar', 'material', 'sheet', 32, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Red oxide primer per gallon (covers ~300 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Steel Red Oxide Primer 1 gal', 'Steel & Rebar', 'material', 'gal', 300, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  LABOR
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Steel Fixer Day Rate', 'Steel & Rebar', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 10000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Welder Day Rate', 'Steel & Rebar', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 13000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Rebar cutting & bending labor — per ton
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Rebar Cut & Bend Labor (ton)', 'Steel & Rebar', 'labor', 'ton', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 35000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Structural steel erection labor — per ton
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Structural Steel Erection Labor (ton)', 'Steel & Rebar', 'labor', 'ton', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 55000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  EQUIPMENT
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Welding Machine Rental (day)', 'Steel & Rebar', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 9000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Angle Grinder Rental (day)', 'Steel & Rebar', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Rebar Bender/Cutter Rental (day)', 'Steel & Rebar', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
