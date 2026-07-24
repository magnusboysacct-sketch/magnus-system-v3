-- Adds "archived" to the set of allowed project statuses so a project can be
-- soft-hidden (Archive) instead of only hard-deleted. Includes the full real
-- status vocabulary used by the app (src/pages/ProjectsPage.tsx STATUS_OPTS) —
-- not just active/on_hold/completed/archived — so existing "planning" and
-- "cancelled" rows aren't left violating the constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT projects_status_check;
  END IF;
END $$;

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'planning', 'on_hold', 'completed', 'cancelled', 'archived'));
