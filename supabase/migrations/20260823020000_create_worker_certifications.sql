/*
  Worker Certifications — Secretary Workspace Stage 2, Section 2

  Tracks certifications/licenses per worker (driver's license, forklift
  cert, OSHA safety card, etc.) — first time this concept exists anywhere
  in the schema. certification_type is deliberately plain text, not CHECK-
  constrained to a fixed list, same reasoning as secretary_documents.
  document_type: the real taxonomy isn't fixed yet, and a strict CHECK
  would just mean a migration every time a new cert type comes up, for no
  real safety benefit (nothing here feeds a numeric calculation the way
  e.g. chart_of_accounts.type does).

  worker_id is ON DELETE CASCADE, unlike secretary_documents.worker_id
  (ON DELETE SET NULL) — a certification record has no meaning without its
  worker. A letter can outlive the worker it was originally about (it's
  still a real record worth keeping); a cert record can't.

  No approval workflow here (unlike secretary_documents' draft/pending_
  approval/approved/printed state machine) — a certification is just
  tracked data, not a document that needs sign-off before it's "real".
*/

CREATE TABLE IF NOT EXISTS worker_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,

  certification_type text NOT NULL,
  certification_number text,
  issue_date date,
  expiry_date date,
  notes text,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_certifications_company ON worker_certifications(company_id);
CREATE INDEX IF NOT EXISTS idx_worker_certifications_worker ON worker_certifications(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_certifications_expiry ON worker_certifications(expiry_date);

-- updated_at trigger, same pattern as every other table in this app.
CREATE OR REPLACE FUNCTION update_worker_certifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_worker_certifications_updated_at ON worker_certifications;
CREATE TRIGGER set_worker_certifications_updated_at
  BEFORE UPDATE ON worker_certifications
  FOR EACH ROW
  EXECUTE FUNCTION update_worker_certifications_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Same role set as canAccessSecretaryWorkspace (secretary/admin/director) —
-- standard company-scoped read/write, all four operations identical in who
-- they allow, since there's no approval-style distinction to enforce here.

ALTER TABLE worker_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "worker_certifications_select"
  ON worker_certifications FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "worker_certifications_insert"
  ON worker_certifications FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "worker_certifications_update"
  ON worker_certifications FOR UPDATE
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

CREATE POLICY "worker_certifications_delete"
  ON worker_certifications FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );
