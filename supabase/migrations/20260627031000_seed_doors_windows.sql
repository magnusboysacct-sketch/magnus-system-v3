DO $$ BEGIN END $$;
/*
  Seed: Doors & Windows
  Jamaican market rates — JMD, effective 2026-06
  Items sold per unit (ea); no area coverage factor — each opening is one unit.
*/

-- ═══════════════════════════════════════════════════════
--  DOORS — WOOD
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Solid Wood Door 2/6×6/8 (slab only)', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 28000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Hollow Core Door 2/6×6/8 (slab)', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 14000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Pre-hung door unit 2/6×6/8 (slab + frame)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Pre-Hung Door Unit 2/6×6/8', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 45000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Front entry door solid wood 3/0×6/8
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Front Entry Solid Wood Door 3/0×6/8', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 75000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  DOORS — METAL & GRILLE
-- ═══════════════════════════════════════════════════════

-- Steel security grille door (burglar bar) 2/6×6/8
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Steel Security Grille Door 2/6×6/8', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 55000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Roll-up steel door 8ft wide (garage)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Roll-Up Steel Garage Door 8ft wide', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 180000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  DOOR FRAMES & HARDWARE
-- ═══════════════════════════════════════════════════════

-- Wood door frame set (pine, per opening)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wood Door Frame Set (pine)', 'Doors & Windows', 'material', 'set', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 8000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Door lockset (knob + deadbolt set)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Door Lockset Knob + Deadbolt', 'Doors & Windows', 'material', 'set', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 9000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Door hinges 3.5" brass (pair)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Door Hinges 3.5" Brass (pair)', 'Doors & Windows', 'material', 'pair', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Door threshold aluminium (per lf)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Door Threshold Aluminium per lf', 'Doors & Windows', 'material', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  WINDOWS — ALUMINIUM
-- ═══════════════════════════════════════════════════════

-- Aluminium casement window 3×4ft
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Aluminium Casement Window 3×4ft', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 25000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Aluminium casement window 4×4ft
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Aluminium Casement Window 4×4ft', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 35000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Aluminium sliding window 5×3ft
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Aluminium Sliding Window 5×3ft', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 30000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Jalousie/louvre window 2×3ft
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Jalousie Louvre Window 2×3ft', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 14000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Window burglar bar/grille set (per window)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Window Burglar Bar Set (std window)', 'Doors & Windows', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 18000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  LABOR
-- ═══════════════════════════════════════════════════════

-- Door install labor (per door)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Door Install Labor (ea)', 'Doors & Windows', 'labor', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 8000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Window install labor (per window)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Window Install Labor (ea)', 'Doors & Windows', 'labor', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Carpenter day rate (doors/windows)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Carpenter Day Rate', 'Doors & Windows', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 11000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
