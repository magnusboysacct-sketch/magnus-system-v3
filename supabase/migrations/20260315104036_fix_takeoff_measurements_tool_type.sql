/*
  # Fix takeoff_measurements tool_type constraint

  ## Problem
  The `takeoff_measurements` table has a NOT NULL constraint on `tool_type`, 
  but the frontend was only sending the `type` field, causing constraint violations.

  ## Changes
  1. Add a default value for `tool_type` to prevent NULL violations
  2. Create a trigger to auto-populate `tool_type` from `type` if not provided
  3. This maintains backward compatibility while frontend is updated

  ## Fields
  - `tool_type` (text, NOT NULL) - The tool used: line, area, count, volume, calibrate, select, hand
  - `type` (text, nullable) - Legacy field, contains measurement kind: line, area, count, volume

  ## Notes
  - Frontend will be updated to send both fields explicitly
  - Trigger provides safety net for any edge cases
  - No data backfill needed (0 existing measurements)
*/

-- Add default value for tool_type to prevent constraint violations
ALTER TABLE takeoff_measurements 
  ALTER COLUMN tool_type SET DEFAULT 'line';

-- Create function to auto-populate tool_type from type if not provided
CREATE OR REPLACE FUNCTION sync_tool_type_from_type()
RETURNS TRIGGER AS $$
BEGIN
  -- If tool_type is NULL or empty, copy from type field
  IF NEW.tool_type IS NULL OR NEW.tool_type = '' THEN
    NEW.tool_type := COALESCE(NEW.type, 'line');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run before insert/update
DROP TRIGGER IF EXISTS sync_tool_type_trigger ON takeoff_measurements;
CREATE TRIGGER sync_tool_type_trigger
  BEFORE INSERT OR UPDATE ON takeoff_measurements
  FOR EACH ROW
  EXECUTE FUNCTION sync_tool_type_from_type();