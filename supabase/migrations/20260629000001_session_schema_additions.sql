-- Session schema additions (2026-06-29)
-- Captures changes made via SQL Editor that were not previously in migration files.

-- 1. Clients table — portal reset columns
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_reset_token text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_reset_expires_at timestamptz;

-- 2. client_comments table — two-way messaging columns
ALTER TABLE client_comments ADD COLUMN IF NOT EXISTS sender_type text NOT NULL DEFAULT 'client';
ALTER TABLE client_comments ADD COLUMN IF NOT EXISTS sender_id uuid;
ALTER TABLE client_comments ADD COLUMN IF NOT EXISTS read_at timestamptz;

ALTER TABLE client_comments
  ADD CONSTRAINT client_comments_sender_type_check
  CHECK (sender_type IN ('client', 'staff'));

-- 3. admin_delete_auth_user Postgres function
CREATE OR REPLACE FUNCTION admin_delete_auth_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.identities WHERE user_id = target_user_id;
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- 4. RLS UPDATE policy on client_comments
CREATE POLICY "Allow updates to client_comments"
ON client_comments
FOR UPDATE
USING (true)
WITH CHECK (true);
