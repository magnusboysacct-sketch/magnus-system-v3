/*
  Secretary Workspace — Stage 1 data model

  Adds the 'secretary' role and the secretary_documents approval-workflow
  table underlying the new Secretary Workspace module (correspondence,
  worker admin letters, compliance docs, scheduling, tasks, meeting
  minutes). Stage 1 is layout/navigation/data-model only — no document
  type generates real content yet; that's Stage 2, per document type.

  ── Role addition ──────────────────────────────────────────────────────
  user_profiles.role's CHECK constraint was declared inline without an
  explicit name in its original CREATE TABLE (20260326225000_create_
  missing_user_management_schema.sql), so its real name is whatever
  Postgres auto-generated — looked up dynamically by definition text
  rather than guessed, same robust pattern used for the source_type
  CHECK widenings earlier this session (guessing wrong would silently
  no-op the DROP CONSTRAINT IF EXISTS and leave the old, narrower CHECK
  still enforced with no error).

  IMPORTANT — corrected from the original draft of this migration: the
  live constraint's real values (confirmed via pg_get_constraintdef,
  see the role-vocabulary audit this session) are director, admin,
  estimator, supervisor, office_user, site_user — NOT the 8-value
  project_manager/site_supervisor/procurement/accounts/viewer vocabulary
  the 20260326225000 migration file still shows (that file was never
  updated when the live constraint was changed outside tracked migration
  history). The ADD CONSTRAINT below rebuilds the CHECK from the real 6
  plus 'secretary' as the 7th — it does not reintroduce any of the 5
  phantom values, and does not drop office_user/site_user.

  ── secretary_documents ────────────────────────────────────────────────
  document_type is deliberately plain text, not CHECK-constrained to a
  fixed list — unlike chart_of_accounts.type (which drives real P&L/
  Balance Sheet math and stays strict for that reason), a document's type
  here doesn't feed any numeric calculation, and Stage 2 hasn't yet fixed
  the full real taxonomy across all 6 sections (job/employment/reference
  letters, compliance docs, meeting minutes, and whatever else surfaces
  once each section is actually built) — a strict CHECK here would just
  mean a migration every time a new type is needed, for no real safety
  benefit.

  ── State machine ──────────────────────────────────────────────────────
  Same shape as the GL's own validate_transaction_posting trigger
  (20260329190001_create_general_ledger.sql): a BEFORE UPDATE trigger
  that fires only on an actual status change (WHEN OLD.status IS
  DISTINCT FROM NEW.status), validates the transition is one of the
  allowed edges, and sets approved_by/approved_at as a direct consequence
  of the transition itself — not deferred to Stage 2, since this is state-
  machine integrity (the data model), not document-type feature logic
  (real content generation, notifications, PDF export) the way Stage 2's
  actual work will be. Allowed edges:
    draft -> pending_approval
    pending_approval -> approved | rejected
    approved -> printed
    rejected -> draft (resubmit)
  Anything else (including skipping straight to 'printed' or 'approved')
  is rejected with a clear error, same as the GL trigger's own RAISE
  EXCEPTION pattern.

  ── RLS: who vs. what ──────────────────────────────────────────────────
  Division of responsibility: RLS decides WHO can touch a row and WHICH
  target statuses they're allowed to write at all; the trigger above
  decides WHETHER a given transition is valid regardless of who's making
  it. A secretary's own-row UPDATE policy's WITH CHECK restricts the new
  status to draft/pending_approval only — they can never write 'approved'
  or 'printed' as a target value, full stop, regardless of the trigger.
  admin/director get a separate, broader UPDATE policy covering every
  status. This means the "only admin/director can approve" requirement is
  enforced at the RLS layer (which value can be WRITTEN), while "printed
  requires a prior approved state" is enforced at the trigger layer
  (which transitions are VALID) — two different, complementary questions,
  matching how the GL splits the same concerns between its own RLS
  policies and validate_transaction_posting.

  ── Deliberately NOT done in this migration ────────────────────────────
  No storage bucket (company-documents) created here — Stage 1 has no
  real file uploads to store yet (per the "no real document generation
  yet" scope), so creating storage infrastructure now would be premature;
  proposed for Stage 2 when a section actually needs to persist a
  generated file.
*/

-- ── 1. Add 'secretary' to user_profiles.role ───────────────────────────

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT con.conname INTO con_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'user_profiles'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%role%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_profiles DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN (
    'director',
    'admin',
    'estimator',
    'supervisor',
    'office_user',
    'site_user',
    'secretary'
  ));

-- ── 2. secretary_documents ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS secretary_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  document_type text NOT NULL,
  title text NOT NULL,
  content text,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'printed', 'rejected')),

  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (approved_at IS NULL OR approved_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_secretary_documents_company ON secretary_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_secretary_documents_status ON secretary_documents(status);
CREATE INDEX IF NOT EXISTS idx_secretary_documents_type ON secretary_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_secretary_documents_created_by ON secretary_documents(created_by);

-- updated_at trigger, same pattern as every other table in this app.
CREATE OR REPLACE FUNCTION update_secretary_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_secretary_documents_updated_at ON secretary_documents;
CREATE TRIGGER set_secretary_documents_updated_at
  BEFORE UPDATE ON secretary_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_secretary_documents_updated_at();

-- ── 3. Status-transition validation (state machine, not Stage 2 feature logic) ──

CREATE OR REPLACE FUNCTION validate_secretary_document_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (
    (OLD.status = 'draft' AND NEW.status = 'pending_approval')
    OR (OLD.status = 'pending_approval' AND NEW.status IN ('approved', 'rejected'))
    OR (OLD.status = 'approved' AND NEW.status = 'printed')
    OR (OLD.status = 'rejected' AND NEW.status = 'draft')
  ) THEN
    RAISE EXCEPTION 'Invalid secretary_documents status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'approved' THEN
    NEW.approved_by = auth.uid();
    NEW.approved_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS secretary_documents_status_transition ON secretary_documents;
CREATE TRIGGER secretary_documents_status_transition
  BEFORE UPDATE ON secretary_documents
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_secretary_document_status_transition();

-- ── 4. RLS ────────────────────────────────────────────────────────────

ALTER TABLE secretary_documents ENABLE ROW LEVEL SECURITY;

-- Any workspace-accessible role (secretary/admin/director) in the same
-- company can view every document — a secretary drafting a letter and an
-- admin/director reviewing approvals both need visibility into the same
-- underlying rows, not just their own.
CREATE POLICY "secretary_documents_select"
  ON secretary_documents FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('secretary', 'admin', 'director')
    )
  );

-- Secretary can only insert their own drafts (created_by = self,
-- status = 'draft' — never inserting directly as pending/approved/
-- printed). admin/director can insert at any status, for cases like
-- backfilling a document that was already handled outside the system.
CREATE POLICY "secretary_documents_insert"
  ON secretary_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('admin', 'director')
      OR (
        (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'secretary'
        AND status = 'draft'
        AND created_by = auth.uid()
      )
    )
  );

-- Secretary can update their own rows, but only while still in draft or
-- pending_approval (once approved/printed/rejected by someone else, it's
-- out of their hands), and can never write 'approved' or 'printed' as
-- the new status themselves — the WITH CHECK below caps what they can
-- set it to, regardless of what the trigger would otherwise allow.
CREATE POLICY "secretary_documents_update_own"
  ON secretary_documents FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND status IN ('draft', 'pending_approval')
    AND company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid() AND role = 'secretary')
  )
  WITH CHECK (
    created_by = auth.uid()
    AND status IN ('draft', 'pending_approval')
  );

-- admin/director can update any row in their own company to any status —
-- the transition itself still has to satisfy the trigger's state machine
-- above (e.g. they still can't jump straight to 'printed' from 'draft').
CREATE POLICY "secretary_documents_update_admin"
  ON secretary_documents FOR UPDATE
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'director'))
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'director'))
  );

-- Delete: the creator can delete their own still-draft rows (never once
-- it's left draft — keep the audit trail intact past that point).
-- admin/director can delete at any status, for cleanup.
CREATE POLICY "secretary_documents_delete"
  ON secretary_documents FOR DELETE
  TO authenticated
  USING (
    (created_by = auth.uid() AND status = 'draft')
    OR company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'director'))
  );
