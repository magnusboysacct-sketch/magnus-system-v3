/*
  Seed: Painting & Finishing
  Jamaican market rates — JMD, effective 2026-06
  Paint coverage assumes 2 coats:
    Interior latex 1 gal = ~350 ft² (2 coats)
    Exterior 1 gal = ~300 ft²
    Primer 1 gal = ~400 ft² (1 coat)
    Sealer 1 gal = ~200 ft²
*/

-- ═══════════════════════════════════════════════════════
--  PRIMER & SEALER
-- ═══════════════════════════════════════════════════════

-- Interior PVA primer 1 gal (400 ft² / 1 coat)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Interior PVA Primer 1 gal', 'Painting & Finishing', 'material', 'gal', 400, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Exterior primer/sealer 1 gal
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Exterior Primer Sealer 1 gal', 'Painting & Finishing', 'material', 'gal', 350, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Masonry sealer 1 gal (dense block/concrete, 200 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Masonry Sealer 1 gal', 'Painting & Finishing', 'material', 'gal', 200, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  INTERIOR PAINT
-- ═══════════════════════════════════════════════════════

-- Interior latex flat 1 gal (350 ft² / 2 coats)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Interior Latex Paint Flat 1 gal', 'Painting & Finishing', 'material', 'gal', 350, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Interior latex eggshell 1 gal
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Interior Latex Paint Eggshell 1 gal', 'Painting & Finishing', 'material', 'gal', 350, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Interior semi-gloss 1 gal (trim/kitchen/bath)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Interior Semi-Gloss Paint 1 gal', 'Painting & Finishing', 'material', 'gal', 350, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Ceiling white flat 1 gal
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Ceiling Paint Flat White 1 gal', 'Painting & Finishing', 'material', 'gal', 400, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  EXTERIOR PAINT
-- ═══════════════════════════════════════════════════════

-- Exterior masonry paint 1 gal (300 ft² / 2 coats)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Exterior Masonry Paint 1 gal', 'Painting & Finishing', 'material', 'gal', 300, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Elastomeric waterproof coating 1 gal (250 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Elastomeric Waterproof Coating 1 gal', 'Painting & Finishing', 'material', 'gal', 250, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 8500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  SUNDRIES
-- ═══════════════════════════════════════════════════════

-- Paint roller 9" (each)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Paint Roller 9" Cover', 'Painting & Finishing', 'material', 'ea', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Painter's tape 2" (54yd roll)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Painter''s Tape 2" 54yd roll', 'Painting & Finishing', 'material', 'roll', 162, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Drop cloth plastic (12×15 ft each)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plastic Drop Cloth 12×15ft', 'Painting & Finishing', 'material', 'ea', 180, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Caulking tube (paintable latex)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Paintable Latex Caulk (tube)', 'Painting & Finishing', 'material', 'tube', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 700, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Silicone sealant clear tube
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Silicone Sealant Clear (tube)', 'Painting & Finishing', 'material', 'tube', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 900, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Wood filler/putty (1 pint can)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Wood Filler Putty 1pt can', 'Painting & Finishing', 'material', 'can', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  LABOR
-- ═══════════════════════════════════════════════════════

-- Painter day rate
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Painter Day Rate', 'Painting & Finishing', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 9000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Interior painting labor per ft² (all surfaces, 2 coats)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Interior Painting Labor (ft²)', 'Painting & Finishing', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 180, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Exterior painting labor per ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Exterior Painting Labor (ft²)', 'Painting & Finishing', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 220, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════
--  EQUIPMENT
-- ═══════════════════════════════════════════════════════

-- Airless sprayer rental (day)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Airless Paint Sprayer Rental (day)', 'Painting & Finishing', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now() RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 8000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
