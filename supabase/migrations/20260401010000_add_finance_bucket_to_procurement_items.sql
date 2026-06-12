/*
  Add Finance Bucket Classification to Procurement Items
  
  ## Overview
  Adds finance_bucket field to procurement_items as the single source of truth
  for committed cost classification into material, labor, equipment, and other buckets.
  
  ## Changes
  1. Add finance_bucket column to procurement_items table
  2. Backfill existing records with conservative defaults
  3. Update TypeScript interfaces
  
  ## Safety Notes
  - Column is nullable initially for safe migration
  - Conservative backfilling defaults to 'other' when uncertain
  - Uses existing category and material name context for mapping
*/

-- Step 1: Add finance_bucket column to procurement_items
ALTER TABLE procurement_items 
ADD COLUMN finance_bucket text;

-- Step 2: Add comment for documentation
COMMENT ON COLUMN procurement_items.finance_bucket IS 'Finance bucket for committed cost classification: material, labor, equipment, other';

-- Step 3: Backfill existing procurement_items with conservative defaults
UPDATE procurement_items 
SET finance_bucket = CASE
  -- Equipment - clear equipment indicators
  WHEN (
    LOWER(material_name) LIKE '%equipment%' OR
    LOWER(material_name) LIKE '%crane%' OR
    LOWER(material_name) LIKE '%excavator%' OR
    LOWER(material_name) LIKE '%machinery%' OR
    LOWER(material_name) LIKE '%tool%' OR
    LOWER(category) LIKE '%equipment%'
  ) THEN 'equipment'
  
  -- Material - common construction materials
  WHEN (
    LOWER(material_name) LIKE '%concrete%' OR
    LOWER(material_name) LIKE '%steel%' OR
    LOWER(material_name) LIKE '%brick%' OR
    LOWER(material_name) LIKE '%cement%' OR
    LOWER(material_name) LIKE '%sand%' OR
    LOWER(material_name) LIKE '%aggregate%' OR
    LOWER(material_name) LIKE '%timber%' OR
    LOWER(material_name) LIKE '%paint%' OR
    LOWER(material_name) LIKE '%pipe%' OR
    LOWER(material_name) LIKE '%cable%' OR
    LOWER(material_name) LIKE '%wire%' OR
    LOWER(material_name) LIKE '%lumber%' OR
    LOWER(material_name) LIKE '%drywall%' OR
    LOWER(material_name) LIKE '%insulation%' OR
    LOWER(category) LIKE '%material%' OR
    LOWER(category) LIKE '%concrete%' OR
    LOWER(category) LIKE '%steel%' OR
    LOWER(category) LIKE '%masonry%'
  ) THEN 'material'
  
  -- Labor - clear labor indicators
  WHEN (
    LOWER(material_name) LIKE '%labor%' OR
    LOWER(material_name) LIKE '%labour%' OR
    LOWER(material_name) LIKE '%worker%' OR
    LOWER(material_name) LIKE '%crew%' OR
    LOWER(material_name) LIKE '%manpower%' OR
    LOWER(material_name) LIKE '%staff%' OR
    LOWER(category) LIKE '%labor%' OR
    LOWER(category) LIKE '%labour%'
  ) THEN 'labor'
  
  -- Default to other for anything uncertain
  ELSE 'other'
END
WHERE finance_bucket IS NULL;

-- Step 4: Add check constraint for data integrity (after backfill)
ALTER TABLE procurement_items 
ADD CONSTRAINT chk_procurement_items_finance_bucket 
CHECK (finance_bucket IS NULL OR finance_bucket IN ('material', 'labor', 'equipment', 'other'));

-- Step 5: Create index for performance
CREATE INDEX IF NOT EXISTS idx_procurement_items_finance_bucket 
ON procurement_items(finance_bucket) 
WHERE finance_bucket IS NOT NULL;
