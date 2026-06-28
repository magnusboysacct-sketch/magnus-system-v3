-- Add 'wall' as an allowed measurement type (Wall Tool was added without updating this constraint)
ALTER TABLE takeoff_measurements DROP CONSTRAINT IF EXISTS takeoff_measurements_type_check;

ALTER TABLE takeoff_measurements ADD CONSTRAINT takeoff_measurements_type_check
  CHECK (type = ANY (ARRAY['line'::text, 'area'::text, 'volume'::text, 'count'::text, 'wall'::text]));
