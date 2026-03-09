/*
  # Create project_tasks table

  1. New Tables
    - `project_tasks`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `task_name` (text, required)
      - `start_date` (date, nullable)
      - `end_date` (date, nullable)
      - `status` (text, one of: planned, active, complete)
      - `created_at` (timestamptz, auto-set)
      - `updated_at` (timestamptz, auto-updated)

  2. Security
    - Enable RLS on `project_tasks` table
    - Add policy for authenticated users to manage tasks in their projects
*/

CREATE TABLE IF NOT EXISTS project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_name text NOT NULL,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'complete')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tasks in their projects"
  ON project_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert tasks in their projects"
  ON project_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tasks in their projects"
  ON project_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tasks in their projects"
  ON project_tasks FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_dates ON project_tasks(start_date, end_date);
