/*
  Fix Phase 6 BOQ + Task integration architecture
  Remove redundant quantity_source_value column
*/

-- Drop the redundant quantity_source_value column
ALTER TABLE project_tasks DROP COLUMN IF EXISTS quantity_source_value;

-- Add comment to clarify quantity sourcing logic
COMMENT ON COLUMN project_tasks.quantity IS 'Task quantity - if auto_sync_quantity=true and boq_item_id exists, this should always match BOQ quantity';
COMMENT ON COLUMN project_tasks.auto_sync_quantity IS 'Whether to automatically sync quantity from linked BOQ item';
COMMENT ON COLUMN project_tasks.boq_item_id IS 'Reference to BOQ item for quantity linking';
