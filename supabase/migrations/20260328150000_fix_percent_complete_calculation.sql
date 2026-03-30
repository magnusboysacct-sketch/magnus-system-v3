/*
  Fix percent_complete implementation
  Move calculation from database to application logic
*/

-- Drop the generated column
ALTER TABLE project_tasks DROP COLUMN IF EXISTS percent_complete;

-- Add a regular numeric column for percent_complete
ALTER TABLE project_tasks ADD COLUMN percent_complete numeric DEFAULT 0;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_project_tasks_percent_complete ON project_tasks(percent_complete);

-- Add comment for documentation
COMMENT ON COLUMN project_tasks.percent_complete IS 'Percentage complete calculated in application logic (0-100)';
