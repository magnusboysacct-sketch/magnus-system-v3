/*
  Seed: Masonry & Blockwork
  Jamaican market rates — JMD, effective 2026-06
  Coverage factors where applicable.

  6" concrete block wall face area:
    Standard 6"×8"×16" block laid in running bond:
    1 block ≈ 0.889 ft² of wall face (8"×16" = 128 in² = 0.889 ft²)
    So coverage_factor = 0.889 ft²/block
    → to cover 100 ft² you need ceil(100/0.889) = 113 blocks

  Mortar coverage:
    1 bag Portland + ~3 bags sand makes mortar for ~60–70 blocks laid
    We track cement bags separately from sand, so no combined coverage here.
    Instead: mortar labor is per ft² of wall, cement is per bag (no conversion —
    estimators specify mix ratios in assemblies).

  Block mortar (pre-mix bags) — 40lb bag covers ~12 ft² of block joints
*/

-- ═══════════════════════════════════════════════════════════
--  MASONRY UNITS (BLOCKS)
-- ═══════════════════════════════════════════════════════════

-- 6" Hollow Concrete Block (standard 8"×8"×16")
-- coverage: 1 block = 0.889 ft² of wall face
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Block 6" Hollow', 'Masonry & Blockwork', 'material', 'block', 0.889, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 240, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 8" Hollow Concrete Block
-- coverage: 1 block = 0.889 ft² of wall face (same face area, deeper)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Block 8" Hollow', 'Masonry & Blockwork', 'material', 'block', 0.889, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 310, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 4" Solid Concrete Block (partition walls)
-- coverage: 1 block = 0.222 ft² (4"×8" face)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Block 4" Solid (partition)', 'Masonry & Blockwork', 'material', 'block', 0.222, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 160, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Split-face decorative block 6"
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Split-Face Block 6"', 'Masonry & Blockwork', 'material', 'block', 0.889, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 320, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Patio/retaining wall block (solid cap block)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Cap Block Solid 6"', 'Masonry & Blockwork', 'material', 'block', 0.889, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 280, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
--  MORTAR & GROUT MATERIALS
-- ═══════════════════════════════════════════════════════════

-- Portland Cement 50kg (masonry use — same item as concrete category
--  but listed here so masonry assemblies can reference it directly)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Portland Cement 50kg', 'Masonry & Blockwork', 'material', 'bag', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Masonry sand (fine) per ton
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Masonry Sand (Fine) per ton', 'Masonry & Blockwork', 'material', 'ton', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 10000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Pre-mixed mortar (40lb bag) — covers ~12 ft² of block joints at 3/8" bed
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Pre-Mix Mortar 40lb bag', 'Masonry & Blockwork', 'material', 'bag', 12, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Type S masonry lime — 50lb bag
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Masonry Lime Type S 50lb', 'Masonry & Blockwork', 'material', 'bag', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Grout (coarse) for filled block cores — per ft³
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Block Grout (Coarse) per ft³', 'Masonry & Blockwork', 'material', 'ft³', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
--  LINTELS & STRUCTURAL ELEMENTS
-- ═══════════════════════════════════════════════════════════

-- Precast concrete lintel 4" — per lf
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Precast Lintel 4" per lf', 'Masonry & Blockwork', 'material', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Precast concrete lintel 6" — per lf
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Precast Lintel 6" per lf', 'Masonry & Blockwork', 'material', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- U-block (bond beam block) 6"
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('U-Block Bond Beam 6"', 'Masonry & Blockwork', 'material', 'block', 0.889, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 360, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Half block 6"
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Half Block 6"', 'Masonry & Blockwork', 'material', 'block', 0.444, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 130, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Corner block 6"
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Corner Block 6"', 'Masonry & Blockwork', 'material', 'block', 0.889, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 280, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
--  ACCESSORIES
-- ═══════════════════════════════════════════════════════════

-- Masonry joint reinforcement (ladder wire) — per 10-ft length
-- coverage: 1 piece covers 10 lf of wall
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Masonry Joint Reinforcement 10ft', 'Masonry & Blockwork', 'material', 'piece', 10, 'lf', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 900, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Control joint filler (foam backer rod) — 50 lf roll
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Backer Rod 1/2" 50ft roll', 'Masonry & Blockwork', 'material', 'roll', 50, 'lf', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Masonry sealer — 4L can (covers ~250 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Masonry Sealer 4L', 'Masonry & Blockwork', 'material', 'can', 250, 'ft²', true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Anchor bolts 1/2"×6" — per 10-pack
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Anchor Bolt 1/2"×6" (10-pack)', 'Masonry & Blockwork', 'material', 'pack', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
--  LABOR
-- ═══════════════════════════════════════════════════════════

-- Mason (block laying) — per ft² of wall
-- Typical productivity: 60–80 blocks/day = ~55–70 ft² of wall/day
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Mason - Block Laying (ft²)', 'Masonry & Blockwork', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 160, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Mason day rate (for scheduling/costing)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Mason Day Rate', 'Masonry & Blockwork', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 9500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Mason helper/pointer — per day
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Mason Helper Day Rate', 'Masonry & Blockwork', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Plaster/render labor — per ft² (both sides)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plastering Labor (ft²)', 'Masonry & Blockwork', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 120, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Block fill (grouting cores) labor — per ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Block Fill / Grout Core Labor (ft²)', 'Masonry & Blockwork', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 80, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Lintel installation labor — per lf
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Lintel Installation Labor (lf)', 'Masonry & Blockwork', 'labor', 'lf', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
--  EQUIPMENT
-- ═══════════════════════════════════════════════════════════

-- Mortar mixer rental — per day
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Mortar Mixer Rental (day)', 'Masonry & Blockwork', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Block delivery (truck) — per load (~500 blocks)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Block Delivery (truck load ~500 blk)', 'Masonry & Blockwork', 'equipment', 'load', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 18000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Scaffolding rental — per bay per week (shared with concrete category)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Scaffolding Rental (bay/week)', 'Masonry & Blockwork', 'equipment', 'bay-week', NULL, NULL, true)
  ON CONFLICT (item_name, category) WHERE company_id IS NULL DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
