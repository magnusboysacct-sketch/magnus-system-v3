/*
  Create project_milestones table and extend project_tasks with milestone linkage.
  Milestones are now the top-level planning unit; tasks accumulate quantity per
  (milestone, assembly/item) pair, which the Takeoff page upserts live while drawing.
*/

-- ── project_milestones ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_milestones (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id               uuid        NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  milestone_no             integer     NOT NULL DEFAULT 1,
  milestone_name           text        NOT NULL,
  description              text,
  status                   text        NOT NULL DEFAULT 'planned'
                             CHECK (status IN ('planned','active','complete','on_hold')),
  planned_start_date       date,
  planned_end_date         date,
  actual_start_date        date,
  actual_end_date          date,
  planned_labour_cost      numeric     DEFAULT 0,
  planned_material_cost    numeric     DEFAULT 0,
  planned_equipment_cost   numeric     DEFAULT 0,
  planned_total_cost       numeric     GENERATED ALWAYS AS
                             (planned_labour_cost + planned_material_cost + planned_equipment_cost)
                             STORED,
  crew_size_needed         numeric,
  production_rate_per_day  numeric,
  payment_amount           numeric     DEFAULT 0,
  percent_complete         numeric     DEFAULT 0,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestone_select" ON project_milestones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_members.project_id = project_milestones.project_id
      AND project_members.user_id = auth.uid()
  ));

CREATE POLICY "milestone_insert" ON project_milestones FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_members.project_id = project_milestones.project_id
      AND project_members.user_id = auth.uid()
  ));

CREATE POLICY "milestone_update" ON project_milestones FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_members.project_id = project_milestones.project_id
      AND project_members.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_members.project_id = project_milestones.project_id
      AND project_members.user_id = auth.uid()
  ));

CREATE POLICY "milestone_delete" ON project_milestones FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM project_members
    WHERE project_members.project_id = project_milestones.project_id
      AND project_members.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_status  ON project_milestones(project_id, status);

-- ── Extend project_tasks ────────────────────────────────────────────────────
-- milestone linkage
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS milestone_id         uuid REFERENCES project_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_assembly_id   uuid,
  ADD COLUMN IF NOT EXISTS linked_item_id       uuid,
  ADD COLUMN IF NOT EXISTS linked_assembly_name text,
  ADD COLUMN IF NOT EXISTS linked_item_name     text;

CREATE INDEX IF NOT EXISTS idx_project_tasks_milestone ON project_tasks(milestone_id);

-- Unique: one task per (milestone, assembly) — enables the upsert accumulation pattern
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tasks_ms_assembly
  ON project_tasks(milestone_id, linked_assembly_id)
  WHERE linked_assembly_id IS NOT NULL;

-- Unique: one task per (milestone, rate-library item) when no assembly
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tasks_ms_item
  ON project_tasks(milestone_id, linked_item_id)
  WHERE linked_item_id IS NOT NULL AND linked_assembly_id IS NULL;

-- also add task fields that were referenced in frontend but may be missing
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS task_description text,
  ADD COLUMN IF NOT EXISTS trade_type       text DEFAULT 'General Labour',
  ADD COLUMN IF NOT EXISTS rate_per_unit    numeric DEFAULT 0;
