/*
  Seed: Plumbing
  Jamaican market rates — JMD, effective 2026-06
  PVC pipe lengths are 10ft; coverage_factor = 10 lf/length.
*/

-- ═══════════════════════════════════════════════════════
--  SUPPLY PIPES (PVC pressure)
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Pipe 1/2" Sch 40 (10ft)', 'Plumbing', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 900, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Pipe 3/4" Sch 40 (10ft)', 'Plumbing', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Pipe 1" Sch 40 (10ft)', 'Plumbing', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Pipe 1-1/4" Sch 40 (10ft)', 'Plumbing', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  DRAIN / WASTE PIPES (PVC)
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Drain Pipe 1-1/2" (10ft)', 'Plumbing', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Drain Pipe 2" (10ft)', 'Plumbing', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Drain Pipe 3" (10ft)', 'Plumbing', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Drain Pipe 4" (10ft)', 'Plumbing', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  FITTINGS (sold individually — no coverage factor)
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Elbow 90° 1/2"', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 120, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Elbow 90° 3/4"', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 180, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Tee 1/2"', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 150, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Tee 3/4"', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 220, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Ball Valve 1/2" PVC', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Ball Valve 3/4" Brass', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Gate Valve 1" Brass', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Cement Solvent 250ml', 'Plumbing', 'material', 'can', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 900, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  FIXTURES
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Toilet Close-Coupled (standard)', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 22000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Pedestal Basin (standard)', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 15000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Shower Set (overhead + mixer)', 'Plumbing', 'material', 'set', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 32000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Kitchen Sink Stainless 2-Bowl', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 16000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Water Tank Polyethylene 500 gal', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 52000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Pressure Pump 0.5HP', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 42000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Hot Water Heater Electric 30 gal', 'Plumbing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 65000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  LABOR
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plumber Day Rate', 'Plumbing', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 13000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plumber Helper Day Rate', 'Plumbing', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Pipe installation labor — per lf (supply lines)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plumbing Pipe Install Labor (lf)', 'Plumbing', 'labor', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 450, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Fixture installation labor — per fixture
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plumbing Fixture Install Labor (ea)', 'Plumbing', 'labor', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
