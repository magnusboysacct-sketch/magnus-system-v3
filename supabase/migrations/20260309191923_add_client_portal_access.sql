/*
  # Add Client Portal Access

  1. Schema Changes
    - Add `client_portal_access` boolean to `project_members` table
    - Defaults to false (internal team members)
    - When true, user has read-only client portal access

  2. Purpose
    - Mark certain project members as client-facing users
    - Client users can view project information but not edit
    - Enables separate client portal with restricted access

  3. Notes
    - Existing members default to false (internal access)
    - Project admins can grant client portal access
    - Does not affect existing RLS policies
    - Client access is additive to existing permissions
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_members' AND column_name = 'client_portal_access'
  ) THEN
    ALTER TABLE project_members ADD COLUMN client_portal_access boolean DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_members_client_portal ON project_members(project_id, client_portal_access) WHERE client_portal_access = true;

COMMENT ON COLUMN project_members.client_portal_access IS 'When true, user has read-only access to project via client portal';