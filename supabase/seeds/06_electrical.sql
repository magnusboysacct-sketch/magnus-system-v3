/*
  Seed: Electrical
  Jamaican market rates — JMD, effective 2026-06
  Wire sold in 100m rolls; coverage_factor in lf (100m = 328 lf).
  Conduit sold in 10ft lengths; coverage_factor = 10 lf/length.
*/

-- ═══════════════════════════════════════════════════════
--  WIRE & CABLE
-- ═══════════════════════════════════════════════════════

-- 1.5mm² single-core (100m roll = 328 lf)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wire 1.5mm² Single-Core (100m roll)', 'Electrical', 'material', 'roll', 328, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 9000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 2.5mm² single-core (100m roll)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wire 2.5mm² Single-Core (100m roll)', 'Electrical', 'material', 'roll', 328, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 14000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 4mm² single-core (100m roll)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wire 4mm² Single-Core (100m roll)', 'Electrical', 'material', 'roll', 328, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 20000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 6mm² single-core (100m roll)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wire 6mm² Single-Core (100m roll)', 'Electrical', 'material', 'roll', 328, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 30000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 10mm² single-core (100m roll) — sub-mains
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wire 10mm² Single-Core (100m roll)', 'Electrical', 'material', 'roll', 328, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 50000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Armoured cable 4mm² 2-core (per metre)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Armoured Cable 4mm² 2-core (per m)', 'Electrical', 'material', 'm', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  CONDUIT
-- ═══════════════════════════════════════════════════════

-- 1/2" PVC conduit (10ft = 10 lf)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Conduit 1/2" (10ft)', 'Electrical', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 700, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 3/4" PVC conduit (10ft)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Conduit 3/4" (10ft)', 'Electrical', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 1" PVC conduit (10ft)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('PVC Conduit 1" (10ft)', 'Electrical', 'material', 'length', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  OUTLETS, SWITCHES & BOXES
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Duplex Outlet 15A (receptacle)', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1300, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Single Pole Switch 15A', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('3-Way Switch 15A', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Electrical Box 1-gang PVC', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 250, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Junction Box 4" Square', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  BREAKERS & PANEL
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Circuit Breaker 15A Single-Pole', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Circuit Breaker 20A Single-Pole', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Circuit Breaker 30A Double-Pole', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Consumer Unit 12-Way (load centre)', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 22000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Consumer Unit 24-Way', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 35000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Meter Base (100A)', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 18000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  LIGHTING
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('LED Downlight 9W Recessed', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Ceiling Fan 52" with Light', 'Electrical', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 20000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Fluorescent Batten 2-ft Twin', 'Electrical', 'material', 'ea', NULL, NULL, true)
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
  VALUES ('Electrician Day Rate', 'Electrical', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 13500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Electrician Helper Day Rate', 'Electrical', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Conduit install labor — per lf
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Conduit Install Labor (lf)', 'Electrical', 'labor', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 350, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Outlet/switch install labor — per point
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Electrical Point Install Labor (ea)', 'Electrical', 'labor', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
