/*
  Company Documents — Secretary Workspace Stage 2, Section 3

  Tracks company-level compliance documents (business license, insurance
  policy, permits, etc.) — first time this concept exists anywhere in the
  schema. document_category is deliberately plain text, not CHECK-
  constrained, same reasoning as worker_certifications.certification_type:
  no fixed real taxonomy yet, and nothing here feeds a numeric calculation.

  file_url stores the STORAGE PATH within the company-documents bucket
  (e.g. "<company_id>/<timestamp>_<filename>"), not a public URL — same
  naming convention already established by project_documents.file_url in
  documents.ts's uploadProjectFile() (which also names a stored path
  "file_url"). The bucket is private, so retrieval goes through
  supabase.storage.from("company-documents").download()/createSignedUrl(),
  not a bare public URL.

  ── Storage bucket note ──────────────────────────────────────────────────
  Asked to mirror "however project-files' storage policies are structured"
  — checked first, per the schema-drift discipline this session has used
  throughout: project-files has NO tracked migration at all. Its bucket and
  RLS policies exist live but were created outside migration history and
  were never captured (same drift pattern as several other tables/buckets
  found earlier this session), so there's nothing tracked to literally
  mirror. Instead this synthesizes the two storage patterns that ARE
  tracked and real:
    - receipts (20260321145107_create_receipt_archive.sql): private bucket,
      file_size_limit, allowed_mime_types — the closer analog since it's
      company-wide, not project-scoped.
    - project-photos (20260309191225_create_project_photos.sql): RLS scoped
      via a folder-name-as-key convention ((storage.foldername(name))[1]
      matched against a real membership/company check) — the pattern this
      migration reuses for company-scoping, with company_id as the folder
      key instead of project_id, plus the secretary/admin/director role
      restriction Veron asked for (neither existing precedent alone
      enforces a role restriction at the storage layer).
*/

CREATE TABLE IF NOT EXISTS company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  document_category text NOT NULL,
  title text NOT NULL,
  document_number text,
  issue_date date,
  expiry_date date,
  file_url text,
  notes text,

  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_documents_company ON company_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_company_documents_expiry ON company_documents(expiry_date);

-- updated_at trigger, same pattern as every other table in this app.
CREATE OR REPLACE FUNCTION update_company_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_company_documents_updated_at ON company_documents;
CREATE TRIGGER set_company_documents_updated_at
  BEFORE UPDATE ON company_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_company_documents_updated_at();

-- ── Table RLS ────────────────────────────────────────────────────────────
-- Same role set as worker_certifications (secretary/admin/director) —
-- standard company-scoped read/write, no approval-style distinction.

ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_documents_select"
  ON company_documents FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "company_documents_insert"
  ON company_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "company_documents_update"
  ON company_documents FOR UPDATE
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

CREATE POLICY "company_documents_delete"
  ON company_documents FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

-- ── Storage bucket ───────────────────────────────────────────────────────
-- Private (not public, matching receipts' choice over project-photos' —
-- business licenses/insurance policies are sensitive enough to warrant
-- it), 20MB limit, common document/image MIME types. File path convention:
-- "<company_id>/<filename>" — the folder-name-as-company-id key the RLS
-- policies below check against.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-documents',
  'company-documents',
  false,
  20971520,
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Secretary workspace can view company documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "Secretary workspace can upload company documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "Secretary workspace can update company documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

CREATE POLICY "Secretary workspace can delete company documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );
