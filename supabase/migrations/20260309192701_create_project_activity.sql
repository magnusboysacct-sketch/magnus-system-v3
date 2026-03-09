/*
  # Create Project Activity Feed

  1. New Tables
    - `project_activity`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `activity_type` (text) - Type of activity: document_upload, photo_upload, daily_log, task_created, task_completed, procurement_received, etc.
      - `message` (text) - Human-readable activity message
      - `created_by` (uuid, foreign key to auth.users)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `project_activity` table
    - Project members can view activity for their projects
    - Authenticated users can create activity for projects they belong to

  3. Indexes
    - Index on project_id for fast lookups
    - Index on created_at for chronological sorting
    - Composite index on (project_id, created_at) for optimized queries

  4. Purpose
    - Track all project activities automatically
    - Display recent activity feed in dashboard
    - Show activity timeline to clients in portal
    - Audit trail for project changes
*/

CREATE TABLE IF NOT EXISTS project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  message text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_activity_project_id ON project_activity(project_id);
CREATE INDEX IF NOT EXISTS idx_project_activity_created_at ON project_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_activity_project_created ON project_activity(project_id, created_at DESC);

ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view activity"
  ON project_activity
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_activity.project_id
      AND project_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Project members can create activity"
  ON project_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_activity.project_id
      AND project_members.user_id = auth.uid()
    )
  );

COMMENT ON TABLE project_activity IS 'Tracks all project activities for activity feed and audit trail';
COMMENT ON COLUMN project_activity.activity_type IS 'Type of activity: document_upload, photo_upload, daily_log, task_created, task_completed, procurement_received, etc.';
COMMENT ON COLUMN project_activity.message IS 'Human-readable message describing the activity';