/*
  # Add source_type to project_costs

  1. Changes
    - Add `source_type` column to `project_costs` table
      - Helps identify the source of the cost (e.g., 'po_item', 'expense', 'time_entry')
      - Optional but useful for tracing cost origins
    
  2. Purpose
    - Enables better tracking of cost sources in Phase 1A auto-cost creation
    - Allows filtering/reporting by cost source type
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_costs' 
    AND column_name = 'source_type'
  ) THEN
    ALTER TABLE project_costs 
    ADD COLUMN source_type text;
    
    COMMENT ON COLUMN project_costs.source_type IS 'Type of source record: po_item, expense, time_entry, manual, etc.';
  END IF;
END $$;
