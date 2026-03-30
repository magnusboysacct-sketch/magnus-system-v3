/*
  Add weather impact fields to project_tasks table
  Phase 4: Weather Impact on Tasks
*/

-- Add weather impact columns
ALTER TABLE project_tasks 
ADD COLUMN weather_impact_factor numeric DEFAULT 1.0,
ADD COLUMN adjusted_production_rate numeric DEFAULT 1.0,
ADD COLUMN weather_delay_days numeric DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_tasks_weather_impact ON project_tasks(weather_impact_factor, weather_delay_days);
CREATE INDEX IF NOT EXISTS idx_project_tasks_adjusted_rate ON project_tasks(adjusted_production_rate);

-- Add comments for documentation
COMMENT ON COLUMN project_tasks.weather_impact_factor IS 'Weather impact factor (0.0-1.0, where 1.0 = no impact, 0.5 = 50% reduction)';
COMMENT ON COLUMN project_tasks.adjusted_production_rate IS 'Production rate adjusted for weather conditions';
COMMENT ON COLUMN project_tasks.weather_delay_days IS 'Additional delay days due to weather conditions';
