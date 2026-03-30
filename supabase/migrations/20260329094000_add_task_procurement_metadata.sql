/*
  Add task procurement metadata to procurement_items table
  Phase 7 Upgrade: LIVE + SNAPSHOT modes
*/

-- Add source tracking columns
ALTER TABLE procurement_items 
ADD COLUMN source_type text DEFAULT 'manual',
ADD COLUMN source_snapshot boolean DEFAULT false,
ADD COLUMN source_data jsonb;

-- Add comments for documentation
COMMENT ON COLUMN procurement_items.source_type IS 'Type of source: manual, boq_generated, task_generated';
COMMENT ON COLUMN procurement_items.source_snapshot IS 'Whether this item represents snapshot data from tasks';
COMMENT ON COLUMN procurement_items.source_data IS 'Snapshot data including task references and generation metadata';

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_procurement_items_source_type ON procurement_items(source_type, source_snapshot);
