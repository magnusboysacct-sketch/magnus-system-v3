/*
  # Create project_daily_logs table

  1. New Tables
    - `project_daily_logs`
      - `id` (uuid, primary key) - Unique log identifier
      - `project_id` (uuid, foreign key) - References projects table
      - `log_date` (date) - Date of the site log entry
      - `weather` (text) - Weather conditions for the day
      - `workers_count` (integer) - Number of workers on site
      - `work_performed` (text) - Description of work completed
      - `deliveries` (text) - Materials and deliveries received
      - `issues` (text) - Problems or concerns encountered
      - `notes` (text) - Additional notes and observations
      - `created_by` (uuid, foreign key) - References auth.users
      - `created_at` (timestamptz) - Log creation timestamp

  2. Security
    - Enable RLS on `project_daily_logs` table
    - Add policy for authenticated users to view logs for their projects
    - Add policy for authenticated users to create logs for their projects
    - Add policy for authenticated users to update logs they created
    - Add policy for authenticated users to delete logs they created

  3. Indexes
    - Index on project_id for fast log retrieval by project
    - Index on log_date for date-based queries
    - Unique constraint on project_id + log_date to prevent duplicate entries per day
*/

CREATE TABLE IF NOT EXISTS project_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  weather text DEFAULT '',
  workers_count integer DEFAULT 0,
  work_performed text DEFAULT '',
  deliveries text DEFAULT '',
  issues text DEFAULT '',
  notes text DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(project_id, log_date)
);

ALTER TABLE project_daily_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_project_daily_logs_project_id ON project_daily_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_daily_logs_date ON project_daily_logs(log_date);

CREATE POLICY "Users can view logs for projects they are members of"
  ON project_daily_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_daily_logs.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create logs for projects they are members of"
  ON project_daily_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_daily_logs.project_id
      AND project_members.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Users can update logs they created"
  ON project_daily_logs
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete logs they created"
  ON project_daily_logs
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());