/*
  # Upgrade Procurement Workflow Control System

  ## Overview
  Enhance procurement system with comprehensive workflow tracking, quantity management,
  and expanded status controls for full procurement lifecycle management.

  ## Changes

  ### 1. Procurement Items - New Columns
    - `priority` (text, default 'normal') - Item priority: low, normal, high, urgent
    - `request_date` (date, nullable) - Date item was requested
    - `needed_by_date` (date, nullable) - Target delivery date
    - `ordered_qty` (numeric, default 0) - Quantity actually ordered
    - `delivered_qty` (numeric, default 0) - Quantity delivered so far
    - `unit_rate` (numeric, default 0) - Cost per unit

  ### 2. Procurement Items - Status Upgrade
    Expand status from 3 states to 8 states:
    - Old: pending, ordered, received
    - New: pending, requested, quoted, approved, ordered, part_delivered, received, cancelled

  ### 3. Procurement Headers - Status Constraint
    Add CHECK constraint to enforce valid status values:
    - draft, approved, sent, completed, cancelled

  ### 4. New Indexes
    Add indexes for efficient filtering and sorting:
    - status (already exists, ensure present)
    - priority
    - supplier
    - needed_by_date

  ### 5. Data Preservation
    - All existing data preserved
    - Existing 'pending', 'ordered', 'received' values remain valid
    - New columns get safe defaults

  ## Security
    - No RLS changes needed - existing policies cover all columns
    - Existing UPDATE policies allow modifications to new fields
*/

-- Step 1: Add new columns to procurement_items
ALTER TABLE procurement_items
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS request_date date,
  ADD COLUMN IF NOT EXISTS needed_by_date date,
  ADD COLUMN IF NOT EXISTS ordered_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_rate numeric DEFAULT 0;

-- Step 2: Add CHECK constraint for priority
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'procurement_items_priority_check'
  ) THEN
    ALTER TABLE procurement_items
      ADD CONSTRAINT procurement_items_priority_check
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

-- Step 3: Drop old status constraint and create expanded version
ALTER TABLE procurement_items
  DROP CONSTRAINT IF EXISTS procurement_items_status_check;

ALTER TABLE procurement_items
  ADD CONSTRAINT procurement_items_status_check
  CHECK (status IN (
    'pending',
    'requested',
    'quoted',
    'approved',
    'ordered',
    'part_delivered',
    'received',
    'cancelled'
  ));

-- Step 4: Add CHECK constraint for procurement_headers.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'procurement_headers_status_check'
  ) THEN
    ALTER TABLE procurement_headers
      ADD CONSTRAINT procurement_headers_status_check
      CHECK (status IN ('draft', 'approved', 'sent', 'completed', 'cancelled'));
  END IF;
END $$;

-- Step 5: Add new indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_procurement_items_priority
  ON procurement_items(priority);

CREATE INDEX IF NOT EXISTS idx_procurement_items_supplier
  ON procurement_items(supplier);

CREATE INDEX IF NOT EXISTS idx_procurement_items_needed_by_date
  ON procurement_items(needed_by_date);

-- Note: idx_procurement_items_status already exists from initial migration

-- Step 6: Add helpful comments
COMMENT ON COLUMN procurement_items.priority IS 'Item urgency: low, normal, high, urgent';
COMMENT ON COLUMN procurement_items.request_date IS 'Date the item procurement was requested';
COMMENT ON COLUMN procurement_items.needed_by_date IS 'Target date when item is needed on site';
COMMENT ON COLUMN procurement_items.ordered_qty IS 'Actual quantity ordered (may differ from requested quantity)';
COMMENT ON COLUMN procurement_items.delivered_qty IS 'Quantity delivered so far (supports partial deliveries)';
COMMENT ON COLUMN procurement_items.unit_rate IS 'Cost per unit for budgeting and tracking';
COMMENT ON COLUMN procurement_items.status IS 'Procurement status: pending, requested, quoted, approved, ordered, part_delivered, received, cancelled';
COMMENT ON COLUMN procurement_headers.status IS 'Document workflow status: draft, approved, sent, completed, cancelled';
