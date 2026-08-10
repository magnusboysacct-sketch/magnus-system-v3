DO $$ BEGIN END $$;
/*
  Seed: Fasteners & Hardware
  Jamaican market rates — JMD, effective 2026-06
  Nails/screws sold per box (1lb or 1kg); no coverage factor — ordered by count/weight.
*/

-- ═══════════════════════════════════════════════════════
--  NAILS
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Common Nails 2" (1lb box)', 'Fasteners & Hardware', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Common Nails 3" (1lb box)', 'Fasteners & Hardware', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Roofing Nails Galv 1-3/4" (1lb)', 'Fasteners & Hardware', 'material', 'lb', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 700, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Masonry Cut Nails 3" (1lb)', 'Fasteners & Hardware', 'material', 'lb', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  SCREWS
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wood Screws #8 1-1/2" (100 box)', 'Fasteners & Hardware', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 900, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wood Screws #8 2-1/2" (100 box)', 'Fasteners & Hardware', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Roofing Screws #14 1-1/2" (100 box)', 'Fasteners & Hardware', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Anchor Bolt 3/8"×3" (25 box)', 'Fasteners & Hardware', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  BOLTS, NUTS, WASHERS
-- ═══════════════════════════════════════════════════════

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Hex Bolt 1/2"×4" with Nut (ea)', 'Fasteners & Hardware', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 350, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Carriage Bolt 3/8"×3" (25 box)', 'Fasteners & Hardware', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Flat Washer 1/2" (25 box)', 'Fasteners & Hardware', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  ADHESIVES & SEALANTS
-- ═══════════════════════════════════════════════════════

-- Construction adhesive (Liquid Nails type, each tube)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Construction Adhesive (tube)', 'Fasteners & Hardware', 'material', 'tube', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Epoxy adhesive 2-part (tube)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Epoxy Adhesive 2-Part (tube)', 'Fasteners & Hardware', 'material', 'tube', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Expanding foam sealant (can 12oz)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Expanding Foam Sealant 12oz can', 'Fasteners & Hardware', 'material', 'can', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  STRAPS, HANGERS & MISC HARDWARE
-- ═══════════════════════════════════════════════════════

-- Hurricane tie/strap (each)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Hurricane Strap/Tie (ea)', 'Fasteners & Hardware', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 350, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Joist hanger 2×8 (each)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Joist Hanger 2×8 (ea)', 'Fasteners & Hardware', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Post base 6×6 (each)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Post Base 6×6 (ea)', 'Fasteners & Hardware', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Threaded rod 1/2" (per lf)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Threaded Rod 1/2" per lf', 'Fasteners & Hardware', 'material', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 700, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Duct tape (2" 60yd)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Duct Tape 2" 60yd roll', 'Fasteners & Hardware', 'material', 'roll', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 900, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
