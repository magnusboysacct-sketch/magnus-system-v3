/*
  Fix Phase 4 Weather Impact - Remove stored calculated columns
  Move all weather calculations to frontend logic
*/

-- Remove calculated columns that should be computed in frontend
ALTER TABLE project_tasks DROP COLUMN IF EXISTS adjusted_production_rate;
ALTER TABLE project_tasks DROP COLUMN IF EXISTS weather_delay_days;

-- Keep only the weather_impact_factor column
COMMENT ON COLUMN project_tasks.weather_impact_factor IS 'Weather impact factor (0.0-1.0, where 1.0 = no impact, 0.5 = 50% reduction)';
