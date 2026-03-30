/*
  Add task duration fields to project_tasks table
  Phase 2: Task Duration Engine
*/

-- Add new duration-related columns to project_tasks
ALTER TABLE project_tasks 
ADD COLUMN quantity numeric DEFAULT 1,
ADD COLUMN unit text DEFAULT 'unit',
ADD COLUMN crew_size numeric DEFAULT 1,
ADD COLUMN production_rate_per_day numeric DEFAULT 1,
ADD COLUMN planned_duration_days numeric GENERATED ALWAYS AS (
  CASE 
    WHEN quantity > 0 AND crew_size > 0 AND production_rate_per_day > 0 
    THEN ROUND(quantity / (crew_size * production_rate_per_day), 2)
    ELSE NULL 
  END
) STORED;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_tasks_duration_calc ON project_tasks(quantity, crew_size, production_rate_per_day);
CREATE INDEX IF NOT EXISTS idx_project_tasks_planned_duration ON project_tasks(planned_duration_days);

-- Add comments for documentation
COMMENT ON COLUMN project_tasks.quantity IS 'Total quantity of work to be done';
COMMENT ON COLUMN project_tasks.unit IS 'Unit of measurement for the work';
COMMENT ON COLUMN project_tasks.crew_size IS 'Number of crew members working on task';
COMMENT ON COLUMN project_tasks.production_rate_per_day IS 'Production rate per day per crew member';
COMMENT ON COLUMN project_tasks.planned_duration_days IS 'Calculated planned duration in days based on quantity, crew size, and production rate';
