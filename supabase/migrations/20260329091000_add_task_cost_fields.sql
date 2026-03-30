/*
  Add cost fields to project_tasks table
  Phase 5: Task Cost + Productivity Engine
*/

-- Add cost tracking columns
ALTER TABLE project_tasks 
ADD COLUMN labor_cost_per_day numeric DEFAULT 0,
ADD COLUMN equipment_cost_per_day numeric DEFAULT 0,
ADD COLUMN material_cost_total numeric DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_tasks_costs ON project_tasks(labor_cost_per_day, equipment_cost_per_day, material_cost_total);

-- Add comments for documentation
COMMENT ON COLUMN project_tasks.labor_cost_per_day IS 'Labor cost per day for this task';
COMMENT ON COLUMN project_tasks.equipment_cost_per_day IS 'Equipment cost per day for this task';
COMMENT ON COLUMN project_tasks.material_cost_total IS 'Total material cost for this task';
