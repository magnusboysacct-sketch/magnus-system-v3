-- Add assembly-grouping and formula-metadata fields to BOQ line items so a
-- group added via "Add From Assembly" survives a save + reload as one group
-- (with its formula/waste and master-measurement state intact) instead of
-- coming back as flat, ungrouped rows — these were all in-memory-only on
-- BOQItemRow, dropped by saveBoq's itemPayload and never read back by
-- hydrateBoqFromHeader. Same pattern as the measurements column
-- (20260711000000_add_boq_item_measurements.sql), which solved the identical
-- problem for the L/W/H measurement modal's rows.
--
-- assembly_instance_id is TEXT, not UUID: it's generated client-side by
-- safeId() (BOQPage.tsx), which prefers crypto.randomUUID() but falls back to
-- a plain "id_<timestamp>_<random>" string when the Web Crypto API isn't
-- available — a uuid column would reject that fallback format outright.
ALTER TABLE boq_section_items
ADD COLUMN IF NOT EXISTS assembly_instance_id text,
ADD COLUMN IF NOT EXISTS assembly_name text,
ADD COLUMN IF NOT EXISTS assembly_master_length numeric,
ADD COLUMN IF NOT EXISTS assembly_master_width numeric,
ADD COLUMN IF NOT EXISTS assembly_master_height numeric,
ADD COLUMN IF NOT EXISTS assembly_master_set boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS component_formula text,
ADD COLUMN IF NOT EXISTS component_waste_percent numeric,
ADD COLUMN IF NOT EXISTS measurement_overridden boolean DEFAULT false;
