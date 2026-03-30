/*
  # Add Weather Support to Magnus System v3
  
  1. Extend projects table with location fields
  2. Extend project_daily_logs table with structured weather data
  
  This migration adds weather capabilities without creating new tables,
  reusing existing structures as requested.
*/

-- Add location fields to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS site_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS site_lng DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS site_timezone TEXT DEFAULT 'UTC';

-- Add structured weather fields to project_daily_logs table
ALTER TABLE project_daily_logs
ADD COLUMN IF NOT EXISTS weather_condition TEXT,
ADD COLUMN IF NOT EXISTS weather_temp DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS weather_rain_mm DECIMAL(6, 2),
ADD COLUMN IF NOT EXISTS weather_wind_speed DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS weather_humidity DECIMAL(5, 2),
ADD COLUMN IF NOT EXISTS weather_impacted_work BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS delay_hours_weather DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS weather_snapshot_json JSONB;

-- Create index for weather queries
CREATE INDEX IF NOT EXISTS idx_project_daily_logs_weather_date 
ON project_daily_logs(project_id, log_date);

-- Add comment to document weather fields
COMMENT ON COLUMN projects.site_lat IS 'Project site latitude for weather API';
COMMENT ON COLUMN projects.site_lng IS 'Project site longitude for weather API';
COMMENT ON COLUMN projects.site_timezone IS 'Project site timezone for weather timing';
COMMENT ON COLUMN project_daily_logs.weather_condition IS 'Weather condition (e.g., "Clear", "Rain", "Cloudy")';
COMMENT ON COLUMN project_daily_logs.weather_temp IS 'Temperature in Celsius';
COMMENT ON COLUMN project_daily_logs.weather_rain_mm IS 'Rainfall amount in millimeters';
COMMENT ON COLUMN project_daily_logs.weather_wind_speed IS 'Wind speed in km/h';
COMMENT ON COLUMN project_daily_logs.weather_humidity IS 'Humidity percentage';
COMMENT ON COLUMN project_daily_logs.weather_impacted_work IS 'Whether weather conditions impacted work';
COMMENT ON COLUMN project_daily_logs.delay_hours_weather IS 'Hours delayed due to weather';
COMMENT ON COLUMN project_daily_logs.weather_snapshot_json IS 'Complete weather API response snapshot';
