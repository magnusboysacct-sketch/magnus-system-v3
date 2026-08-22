/*
  Admin Tasks — Secretary Workspace Stage 2, Section 5

  Tracks company-admin/office tasks (distinct from project_tasks, which is
  genuinely project-scoped — project_id NOT NULL there, confirmed directly
  — and can't be reused for this). status is a real, fixed CHECK vocabulary,
  unlike prior sections' free-text category fields: a task's lifecycle
  (open -> in_progress -> done) is genuinely bounded, not an open taxonomy
  the way "certification type" or "document category" are.

  assigned_to references user_profiles, not workers — this is office/admin
  work assignable to any real team member with an account (estimator,
  supervisor, office_user, etc.), not construction labor. ON DELETE SET
  NULL — a task shouldn't vanish just because the person it was assigned
  to left; it becomes unassigned instead.

  RLS is secretary/admin/director only, same as every prior section, not
  assignee-scoped — see the accompanying handoff response for why: the
  whole Secretary Workspace is already gated at the route level to those
  three roles, so an assignee-scoped policy would grant access nothing in
  the UI exercises today. A "my tasks" view for arbitrary assignees would
  be a deliberate, separate feature with its own UI, not this.
*/

CREATE TABLE IF NOT EXISTS admin_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  due_date date,
  assigned_to uuid REFERENCES user_profiles(id) ON DELETE SET NULL,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_tasks_company ON admin_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_status ON admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_due_date ON admin_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_assigned_to ON admin_tasks(assigned_to);

-- updated_at trigger, same pattern as every other table in this app.
CREATE OR REPLACE FUNCTION update_admin_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_admin_tasks_updated_at ON admin_tasks;
CREATE TRIGGER set_admin_tasks_updated_at
  BEFORE UPDATE ON admin_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_tasks_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- secretary/admin/director only, same as every prior section — see the
-- file header for why this isn't assignee-scoped.

ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_tasks_select"
  ON admin_tasks FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "admin_tasks_insert"
  ON admin_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "admin_tasks_update"
  ON admin_tasks FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "admin_tasks_delete"
  ON admin_tasks FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );
