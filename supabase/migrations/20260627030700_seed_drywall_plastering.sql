/*
  Seed: Drywall & Plastering
  Jamaican market rates — JMD, effective 2026-06
  Drywall sheet 4×8 = 32 ft².
  Joint compound 5-gal bucket covers ~500 ft².
  Plaster bag 40kg covers ~80 ft².
*/

-- ═══════════════════════════════════════════════════════
--  DRYWALL (GYPSUM BOARD)
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Drywall 1/2" 4×8 sheet', 'Drywall & Plastering', 'material', 'sheet', 32, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Drywall 5/8" Type-X 4×8 sheet', 'Drywall & Plastering', 'material', 'sheet', 32, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Moisture-resistant (green board) 1/2" 4×8
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Moisture-Resistant Drywall 1/2" 4×8', 'Drywall & Plastering', 'material', 'sheet', 32, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Metal stud 3-5/8" (per lf)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Metal Stud 3-5/8" per lf', 'Drywall & Plastering', 'material', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 300, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Metal track 3-5/8" (per lf)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Metal Track 3-5/8" per lf', 'Drywall & Plastering', 'material', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 280, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Joint compound (mud) 5-gal bucket — covers ~500 ft² 3 coats
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Joint Compound 5-gal bucket', 'Drywall & Plastering', 'material', 'bucket', 500, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Paper tape (500ft roll)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Drywall Paper Tape 500ft roll', 'Drywall & Plastering', 'material', 'roll', 500, 'lf', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 900, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Drywall screws 1-5/8" (1000 box)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Drywall Screws 1-5/8" (1000 box)', 'Drywall & Plastering', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Corner bead metal (per 10ft length)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Metal Corner Bead 10ft', 'Drywall & Plastering', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  PLASTERING
-- ═══════════════════════════════════════════════════════

-- Portland cement plaster (40kg bag covers ~80 ft² at 3/4" thickness)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plaster Mix 40kg bag', 'Drywall & Plastering', 'material', 'bag', 80, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Fine plaster/skim coat 20kg bag (covers ~120 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Skim Coat Plaster 20kg bag', 'Drywall & Plastering', 'material', 'bag', 120, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Fibre mesh 50m roll (embedded in plaster over blockwork)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Fibreglass Mesh Tape 50m roll', 'Drywall & Plastering', 'material', 'roll', 164, 'lf', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Bonding agent/PVA 5L (treats ~500 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Bonding Agent PVA 5L', 'Drywall & Plastering', 'material', 'can', 500, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  LABOR
-- ═══════════════════════════════════════════════════════

-- Drywaller/taper day rate
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Drywaller Day Rate', 'Drywall & Plastering', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 10000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Drywall install per ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Drywall Install Labor (ft²)', 'Drywall & Plastering', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 350, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Plastering labor per ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plastering Labor (ft²)', 'Drywall & Plastering', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 280, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Plasterer day rate
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plasterer Day Rate', 'Drywall & Plastering', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 9000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  EQUIPMENT
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Drywall Lift Rental (day)', 'Drywall & Plastering', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Screw Gun Rental (day)', 'Drywall & Plastering', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
