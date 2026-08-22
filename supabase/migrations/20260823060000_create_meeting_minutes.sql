/*
  Meeting Minutes — Secretary Workspace Stage 2, Section 6 (final)

  Tracks meeting records — first time this concept exists anywhere in the
  schema, same "genuinely new" situation as every prior section this
  build. attendees is plain free text (a comma-separated list or names is
  fine) — not worth a full attendee-linking system against user_profiles
  or workers for this, per the handoff's own framing. notes is the actual
  minutes content, likely the longest free-text field of any section so
  far, but still just text — no structure imposed on it.

  related_event_id links a minutes entry to the scheduled_events row it
  documents (e.g. "Board Meeting" on the calendar -> its own minutes
  afterward) — nullable and ON DELETE SET NULL, not CASCADE: minutes are
  a real record of what happened and should survive even if the calendar
  entry that scheduled it is later deleted, same reasoning as
  scheduled_events.related_project_id and secretary_documents.worker_id
  (both SET NULL) rather than worker_certifications.worker_id (CASCADE,
  where the child record has no meaning without its parent).

  RLS is secretary/admin/director only, same as every prior section — no
  approval workflow, pure tracking data.
*/

CREATE TABLE IF NOT EXISTS meeting_minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  title text NOT NULL,
  meeting_date date NOT NULL,
  attendees text,
  notes text,
  related_event_id uuid REFERENCES scheduled_events(id) ON DELETE SET NULL,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_company ON meeting_minutes(company_id);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_date ON meeting_minutes(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_event ON meeting_minutes(related_event_id);

-- updated_at trigger, same pattern as every other table in this app.
CREATE OR REPLACE FUNCTION update_meeting_minutes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_meeting_minutes_updated_at ON meeting_minutes;
CREATE TRIGGER set_meeting_minutes_updated_at
  BEFORE UPDATE ON meeting_minutes
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_minutes_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Same role set as every prior section (secretary/admin/director) —
-- standard company-scoped read/write, no approval-style distinction.

ALTER TABLE meeting_minutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_minutes_select"
  ON meeting_minutes FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "meeting_minutes_insert"
  ON meeting_minutes FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "meeting_minutes_update"
  ON meeting_minutes FOR UPDATE
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

CREATE POLICY "meeting_minutes_delete"
  ON meeting_minutes FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );
