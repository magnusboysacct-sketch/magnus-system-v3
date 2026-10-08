-- Photo share links (applied directly to the live database; this file version-controls it).
-- One row per shareable photo-gallery link: a random token, the project and the specific photos chosen (photo_ids), and an
-- expiry. Company staff can create, see and revoke (set revoked_at on) their own company's links through these policies.
-- Visitors have no Supabase session and never touch this table: the photo-share-resolve edge function looks the token up with
-- the service role and returns only the photos stored on the link.
BEGIN;

CREATE TABLE IF NOT EXISTS photo_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  photo_ids uuid[] NOT NULL,
  title text,
  created_by uuid REFERENCES user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

ALTER TABLE photo_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company staff can view their own share links" ON photo_share_links;
CREATE POLICY "Company staff can view their own share links" ON photo_share_links FOR SELECT TO authenticated
USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS "Company staff can create share links" ON photo_share_links;
CREATE POLICY "Company staff can create share links" ON photo_share_links FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS "Company staff can revoke their own share links" ON photo_share_links;
CREATE POLICY "Company staff can revoke their own share links" ON photo_share_links FOR UPDATE TO authenticated
USING (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1))
WITH CHECK (company_id = (SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1));

COMMIT;
