/*
  Seed: Concrete & Formwork
  Jamaican market rates — JMD, effective 2026-06
  Coverage factors where applicable (ft², lf, ft³, ea).

  Run with: psql $DATABASE_URL -f supabase/seeds/01_concrete_formwork.sql
  Idempotent: ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
*/

-- ── Helper: insert item + rate atomically ─────────────────────────────────────
-- Pattern: CTE inserts/upserts the item, then rate is inserted for that id.

-- ═══════════════════════════════════════════════════════════
--  MATERIALS
-- ═══════════════════════════════════════════════════════════

-- Portland cement 50kg
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Portland Cement 50kg', 'Concrete & Formwork', 'material', 'bag', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3400, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Sand (coarse, washed) — sold per ton
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Coarse Sand (Washed) per ton', 'Concrete & Formwork', 'material', 'ton', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 12000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Fine sand (plastering) — sold per ton
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Fine Sand (Plastering) per ton', 'Concrete & Formwork', 'material', 'ton', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 10000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 3/4" stone aggregate — sold per ton
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('3/4" Stone Aggregate per ton', 'Concrete & Formwork', 'material', 'ton', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 13500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 1/2" stone aggregate — sold per ton
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('1/2" Stone Aggregate per ton', 'Concrete & Formwork', 'material', 'ton', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 13500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Ready-mix concrete 3000 psi — sold per yd³
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Ready-Mix Concrete 3000 psi', 'Concrete & Formwork', 'material', 'yd³', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 55000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Ready-mix concrete 4000 psi — sold per yd³
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Ready-Mix Concrete 4000 psi', 'Concrete & Formwork', 'material', 'yd³', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 60000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Concrete vibrator rental per day (equipment)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Vibrator Rental (day)', 'Concrete & Formwork', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Water (on-site supply) — per 1000L truck delivery
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Water Supply (1000L truck)', 'Concrete & Formwork', 'material', 'load', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 8000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Concrete release agent / form oil — 4L can
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Form Release Agent 4L', 'Concrete & Formwork', 'material', 'can', 1200, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Concrete curing compound — 4L can (covers ~200 ft²)
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Curing Compound 4L', 'Concrete & Formwork', 'material', 'can', 200, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ── FORMWORK MATERIALS ────────────────────────────────────────────────────────

-- 3/4" plywood (formwork grade) 4×8 sheet — covers 32 ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plywood 3/4" Formwork 4×8 sheet', 'Concrete & Formwork', 'material', 'sheet', 32, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 7500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 1/2" plywood 4×8 sheet — covers 32 ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Plywood 1/2" 4×8 sheet', 'Concrete & Formwork', 'material', 'sheet', 32, 'ft²', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 2×4×8 lumber (form lumber) — 8 lf per piece
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('2×4×8 Lumber (Form)', 'Concrete & Formwork', 'material', 'piece', 8, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 2×6×8 lumber
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('2×6×8 Lumber', 'Concrete & Formwork', 'material', 'piece', 8, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 2×4×10 lumber — 10 lf per piece
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('2×4×10 Lumber', 'Concrete & Formwork', 'material', 'piece', 10, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 2×4×12 lumber — 12 lf per piece
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('2×4×12 Lumber', 'Concrete & Formwork', 'material', 'piece', 12, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 2600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Scaffolding pipe 3m — 9.8 lf per length
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Scaffolding Pipe 3m', 'Concrete & Formwork', 'material', 'length', 9.84, 'lf', true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 4200, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Form ties (snap-ties) — box of 50
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Snap Ties (box of 50)', 'Concrete & Formwork', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 3500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- 3" common nails — 1 lb box
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Common Nails 3" (1 lb)', 'Concrete & Formwork', 'material', 'box', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 600, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Galvanized wire (binding) — 1 kg roll
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Galvanized Binding Wire 1kg', 'Concrete & Formwork', 'material', 'roll', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 1800, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
--  LABOR
-- ═══════════════════════════════════════════════════════════

-- Concrete pouring & placing labor — per yd³
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Placing Labor', 'Concrete & Formwork', 'labor', 'yd³', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 12000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Formwork erection & stripping labor — per ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Formwork Erect & Strip Labor', 'Concrete & Formwork', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 450, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Slab finisher (floor finishing) — per ft²
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Slab Finishing Labor', 'Concrete & Formwork', 'labor', 'ft²', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 280, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- General laborer (concrete gang) — per day
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('General Laborer - Concrete (day)', 'Concrete & Formwork', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 5000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Carpenter (formwork) — per day
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Carpenter - Formwork (day)', 'Concrete & Formwork', 'labor', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 9000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
--  EQUIPMENT
-- ═══════════════════════════════════════════════════════════

-- Concrete mixer rental — per day
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Mixer Rental (day)', 'Concrete & Formwork', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 8500, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Concrete pump rental — per day
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Concrete Pump Rental (day)', 'Concrete & Formwork', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 45000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Scaffolding rental — per bay per week
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Scaffolding Rental (bay/week)', 'Concrete & Formwork', 'equipment', 'bay-week', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 6000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;

-- Generator rental 5kVA — per day
WITH i AS (
  INSERT INTO cost_items (item_name, category, item_type, unit, coverage_factor, coverage_unit, is_active)
  VALUES ('Generator Rental 5kVA (day)', 'Concrete & Formwork', 'equipment', 'day', NULL, NULL, true)
  ON CONFLICT (item_name, category) DO UPDATE SET updated_at = now()
  RETURNING id
)
INSERT INTO cost_item_rates (cost_item_id, rate, currency, effective_date, source)
SELECT id, 12000, 'JMD', CURRENT_DATE, 'seed_2026' FROM i
ON CONFLICT (cost_item_id, effective_date, source) DO NOTHING;
