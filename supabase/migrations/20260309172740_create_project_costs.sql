/*
  # Create project_costs table

  1. New Tables
    - `project_costs`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `cost_type` (text, one of: 'material', 'labor', 'equipment', 'other')
      - `source_id` (uuid, nullable reference to source record like procurement_items)
      - `description` (text, description of the cost)
      - `amount` (numeric, cost amount)
      - `cost_date` (date, when the cost was incurred)
      - `notes` (text, optional additional notes)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `project_costs` table
    - Add policy for authenticated users to read costs for their projects
    - Add policy for authenticated users to insert costs
    - Add policy for authenticated users to update costs
    - Add policy for authenticated users to delete costs

  3. Indexes
    - Index on project_id for fast filtering
    - Index on cost_type for category filtering
    - Index on cost_date for time-based queries
*/

CREATE TABLE IF NOT EXISTS project_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cost_type text NOT NULL CHECK (cost_type IN ('material', 'labor', 'equipment', 'other')),
  source_id uuid,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  cost_date date DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_costs_project_id ON project_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_cost_type ON project_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_project_costs_cost_date ON project_costs(cost_date);
CREATE INDEX IF NOT EXISTS idx_project_costs_source_id ON project_costs(source_id);

ALTER TABLE project_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view costs for their projects"
  ON project_costs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_costs.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert costs for their projects"
  ON project_costs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_costs.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update costs for their projects"
  ON project_costs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_costs.project_id
      AND project_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_costs.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete costs for their projects"
  ON project_costs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_costs.project_id
      AND project_members.user_id = auth.uid()
    )
  );
