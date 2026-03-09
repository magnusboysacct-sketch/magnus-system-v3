/*
  # Create takeoff_pdf_measurements table

  1. New Tables
    - `takeoff_pdf_measurements`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `session_id` (text, references which PDF/drawing file)
      - `measurement_type` (text: 'line', 'area', 'volume', 'count')
      - `label` (text: user-provided name for the measurement)
      - `quantity` (numeric: the calculated quantity)
      - `unit` (text: 'ft', 'ft²', 'yd³', 'ea')
      - `group_name` (text: optional group/trade category from TakeoffPage)
      - `group_id` (uuid: the group ID from TakeoffPage)
      - `metadata` (jsonb: stores points, color, result, etc.)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `takeoff_pdf_measurements` table
    - Add policies for authenticated users based on project membership

  3. Indexes
    - Index on project_id for fast filtering
    - Index on session_id for grouping by PDF/drawing
*/

CREATE TABLE IF NOT EXISTS takeoff_pdf_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id text,
  measurement_type text NOT NULL CHECK (measurement_type IN ('line', 'area', 'volume', 'count')),
  label text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL,
  group_name text,
  group_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_takeoff_pdf_measurements_project_id ON takeoff_pdf_measurements(project_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_pdf_measurements_session_id ON takeoff_pdf_measurements(session_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_pdf_measurements_type ON takeoff_pdf_measurements(measurement_type);
CREATE INDEX IF NOT EXISTS idx_takeoff_pdf_measurements_group_name ON takeoff_pdf_measurements(group_name);

ALTER TABLE takeoff_pdf_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view PDF measurements for their projects"
  ON takeoff_pdf_measurements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = takeoff_pdf_measurements.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert PDF measurements for their projects"
  ON takeoff_pdf_measurements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = takeoff_pdf_measurements.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update PDF measurements for their projects"
  ON takeoff_pdf_measurements
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = takeoff_pdf_measurements.project_id
      AND project_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = takeoff_pdf_measurements.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete PDF measurements for their projects"
  ON takeoff_pdf_measurements
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = takeoff_pdf_measurements.project_id
      AND project_members.user_id = auth.uid()
    )
  );
