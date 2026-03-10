/*
  # Fix Procurement Items Foreign Key Constraint

  ## Problem
  The foreign key constraint `procurement_items_source_boq_item_id_fkey` references
  the wrong table `boq_items` (legacy table), but the application code uses
  `boq_section_items` (current table). This causes FK violations when generating
  procurement from BOQ.

  ## Root Cause
  - Legacy migration created FK to `boq_items`
  - Application evolved to use `boq_section_items`
  - FK constraint was never updated

  ## Solution
  1. Drop the incorrect FK constraint
  2. Create new FK constraint pointing to `boq_section_items.id`
  3. Make it nullable since some procurement items may not have a BOQ source

  ## Changes
  - Drop: procurement_items_source_boq_item_id_fkey (points to boq_items)
  - Add: procurement_items_source_boq_item_id_fkey (points to boq_section_items)
*/

-- Drop the incorrect foreign key constraint
ALTER TABLE procurement_items
  DROP CONSTRAINT IF EXISTS procurement_items_source_boq_item_id_fkey;

-- Add correct foreign key constraint pointing to boq_section_items
ALTER TABLE procurement_items
  ADD CONSTRAINT procurement_items_source_boq_item_id_fkey
  FOREIGN KEY (source_boq_item_id)
  REFERENCES boq_section_items(id)
  ON DELETE SET NULL;
