/*
  Add progress tracking fields to project_tasks table
  Phase 3: Task Progress + Actual Tracking
*/

-- Add progress tracking columns
ALTER TABLE project_tasks 
ADD COLUMN actual_quantity_completed numeric DEFAULT 0,
ADD COLUMN actual_duration_days numeric DEFAULT 0,
ADD COLUMN percent_complete numeric GENERATED ALWAYS AS (
  CASE 
    WHEN quantity > 0 
    THEN ROUND((actual_quantity_completed / quantity) * 100, 2)
    ELSE 0 
  END
) STORED;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_tasks_progress ON project_tasks(actual_quantity_completed, percent_complete);
CREATE INDEX IF NOT EXISTS idx_project_tasks_actual_duration ON project_tasks(actual_duration_days);

-- Add comments for documentation
COMMENT ON COLUMN project_tasks.actual_quantity_completed IS 'Actual quantity of work completed so far';
COMMENT ON COLUMN project_tasks.actual_duration_days IS 'Actual duration in days spent on the task';
COMMENT ON COLUMN project_tasks.percent_complete IS 'Calculated percentage complete based on actual vs planned quantity';
