/*
  Fix project_members RLS recursion by replacing recursive policies with security definer function
*/

-- Create a security definer function to check if user can access project members
CREATE OR REPLACE FUNCTION can_access_project_members(p_project_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_user_role text;
BEGIN
  -- Get user's company and role
  SELECT up.company_id, up.role
  INTO v_company_id, v_user_role
  FROM user_profiles up
  WHERE up.id = p_user_id;
  
  IF v_company_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if project belongs to user's company
  IF NOT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id
    AND p.company_id = v_company_id
  ) THEN
    RETURN false;
  END IF;
  
  -- Directors and admins can access all project members in their company
  IF v_user_role IN ('director', 'admin') THEN
    RETURN true;
  END IF;
  
  -- Check if user is a member of the project
  IF EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = p_project_id
    AND pm.user_id = p_user_id
    AND pm.is_active = true
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Drop existing recursive policies
DROP POLICY IF EXISTS "Users can view project members for their projects" ON project_members;
DROP POLICY IF EXISTS "Users can insert project members for managed projects" ON project_members;
DROP POLICY IF EXISTS "Users can update project members for managed projects" ON project_members;
DROP POLICY IF EXISTS "Users can delete project members for managed projects" ON project_members;

-- Create new non-recursive policies
CREATE POLICY "Users can view project members for their projects"
  ON project_members FOR SELECT
  TO authenticated
  USING (can_access_project_members(project_id, auth.uid()));

CREATE POLICY "Users can insert project members for managed projects"
  ON project_members FOR INSERT
  TO authenticated
  WITH CHECK (
    can_access_project_members(project_id, auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role IN ('director', 'admin', 'project_manager')
    )
  );

CREATE POLICY "Users can update project members for managed projects"
  ON project_members FOR UPDATE
  TO authenticated
  USING (
    can_access_project_members(project_id, auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role IN ('director', 'admin', 'project_manager')
    )
  );

CREATE POLICY "Users can delete project members for managed projects"
  ON project_members FOR DELETE
  TO authenticated
  USING (
    can_access_project_members(project_id, auth.uid()) AND
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role IN ('director', 'admin', 'project_manager')
    )
  );
