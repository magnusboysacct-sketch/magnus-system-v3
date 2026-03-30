/*
  Add BOQ linkage fields to project_tasks table
  Phase 6: Connect Tasks to BOQ + Auto Quantities
*/

-- Add BOQ linkage columns
ALTER TABLE project_tasks 
ADD COLUMN boq_section_id uuid,
ADD COLUMN boq_item_id uuid,
ADD COLUMN quantity_source_type text DEFAULT 'manual',
ADD COLUMN quantity_source_value numeric DEFAULT 0,
ADD COLUMN auto_sync_quantity boolean DEFAULT false;

-- Add foreign key constraints
ALTER TABLE project_tasks 
ADD CONSTRAINT fk_project_tasks_boq_section 
FOREIGN KEY (boq_section_id) REFERENCES boq_sections(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_project_tasks_boq_item 
FOREIGN KEY (boq_item_id) REFERENCES boq_section_items(id) ON DELETE SET NULL;

-- Add check constraint for quantity source type
ALTER TABLE project_tasks 
ADD CONSTRAINT chk_project_tasks_quantity_source_type 
CHECK (quantity_source_type IN ('manual', 'boq'));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_tasks_boq_section ON project_tasks(boq_section_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_boq_item ON project_tasks(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_quantity_source ON project_tasks(quantity_source_type, auto_sync_quantity);

-- Add comments for documentation
COMMENT ON COLUMN project_tasks.boq_section_id IS 'Reference to BOQ section for quantity linking';
COMMENT ON COLUMN project_tasks.boq_item_id IS 'Reference to BOQ item for quantity linking';
COMMENT ON COLUMN project_tasks.quantity_source_type IS 'Type of quantity source: manual or boq';
COMMENT ON COLUMN project_tasks.quantity_source_value IS 'Original quantity value from source (BOQ or manual)';
COMMENT ON COLUMN project_tasks.auto_sync_quantity IS 'Whether to auto-sync quantity from BOQ item';
