/*
  Scheduled Events — Secretary Workspace Stage 2, Section 4

  Tracks company-level scheduled items (meetings, site visits, deadlines,
  etc.) — first time this concept exists anywhere in the schema, confirmed
  via direct search, same "genuinely new" situation as worker_certifications
  and company_documents before it. event_type is deliberately plain text,
  not CHECK-constrained, same reasoning as those two tables' own category
  fields: no fixed real taxonomy yet.

  event_time is nullable — an all-day entry (e.g. "Permit deadline") has no
  meaningful time component. related_project_id is nullable and ON DELETE
  SET NULL, not CASCADE — an event about a project that's later deleted
  should still exist as a record (e.g. a meeting that happened), it just
  loses its project link, same reasoning as secretary_documents.worker_id
  (SET NULL) rather than worker_certifications.worker_id (CASCADE): a
  scheduled event has its own standalone meaning independent of the
  project, unlike a certification which has none without its worker.

  No approval workflow here (unlike secretary_documents) — a scheduled
  event is just tracked data, not a document needing sign-off.
*/

CREATE TABLE IF NOT EXISTS scheduled_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  title text NOT NULL,
  event_type text,
  event_date date NOT NULL,
  event_time time,
  location text,
  description text,
  related_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_events_company ON scheduled_events(company_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_events_date ON scheduled_events(event_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_events_project ON scheduled_events(related_project_id);

-- updated_at trigger, same pattern as every other table in this app.
CREATE OR REPLACE FUNCTION update_scheduled_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_scheduled_events_updated_at ON scheduled_events;
CREATE TRIGGER set_scheduled_events_updated_at
  BEFORE UPDATE ON scheduled_events
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_events_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Same role set as worker_certifications/company_documents
-- (secretary/admin/director) — standard company-scoped read/write, no
-- approval-style distinction.

ALTER TABLE scheduled_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduled_events_select"
  ON scheduled_events FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "scheduled_events_insert"
  ON scheduled_events FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "scheduled_events_update"
  ON scheduled_events FOR UPDATE
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

CREATE POLICY "scheduled_events_delete"
  ON scheduled_events FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );
