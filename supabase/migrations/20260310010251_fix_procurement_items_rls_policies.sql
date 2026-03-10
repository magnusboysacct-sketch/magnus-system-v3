/*
  # Fix Procurement Items RLS Policies

  ## Problem
  The current RLS policies on procurement_items only check project_members table,
  but users who create BOQs through company membership aren't automatically added 
  to project_members. This causes INSERT failures when generating procurement from BOQ.

  ## Solution
  Update RLS policies to match BOQ pattern:
  - Allow access based on company membership (via projects.company_id)
  - Keep project_members check as secondary path
  - Align with how boq_headers and other tables handle multi-tenancy

  ## Changes
  1. Drop existing restrictive policies
  2. Create new policies that check company membership through projects table
  3. Maintain backward compatibility with project_members
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view procurement items for their projects" ON procurement_items;
DROP POLICY IF EXISTS "Users can insert procurement items for their projects" ON procurement_items;
DROP POLICY IF EXISTS "Users can update procurement items for their projects" ON procurement_items;
DROP POLICY IF EXISTS "Users can delete procurement items for their projects" ON procurement_items;

-- SELECT: Allow if user is in same company as project, OR is project member
CREATE POLICY "Users can view procurement items for their company projects"
  ON procurement_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM projects p
      JOIN user_profiles up ON up.company_id = p.company_id
      WHERE p.id = procurement_items.project_id 
        AND up.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM project_members pm
      WHERE pm.project_id = procurement_items.project_id 
        AND pm.user_id = auth.uid()
    )
  );

-- INSERT: Allow if user is admin/owner in same company as project, OR is project member
CREATE POLICY "Users can insert procurement items for their company projects"
  ON procurement_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM projects p
      JOIN user_profiles up ON up.company_id = p.company_id
      WHERE p.id = procurement_items.project_id 
        AND up.id = auth.uid()
        AND LOWER(up.role) IN ('admin', 'owner', 'estimator')
    )
    OR EXISTS (
      SELECT 1
      FROM project_members pm
      WHERE pm.project_id = procurement_items.project_id 
        AND pm.user_id = auth.uid()
    )
  );

-- UPDATE: Allow if user is admin/owner in same company as project, OR is project member
CREATE POLICY "Users can update procurement items for their company projects"
  ON procurement_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM projects p
      JOIN user_profiles up ON up.company_id = p.company_id
      WHERE p.id = procurement_items.project_id 
        AND up.id = auth.uid()
        AND LOWER(up.role) IN ('admin', 'owner', 'estimator')
    )
    OR EXISTS (
      SELECT 1
      FROM project_members pm
      WHERE pm.project_id = procurement_items.project_id 
        AND pm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM projects p
      JOIN user_profiles up ON up.company_id = p.company_id
      WHERE p.id = procurement_items.project_id 
        AND up.id = auth.uid()
        AND LOWER(up.role) IN ('admin', 'owner', 'estimator')
    )
    OR EXISTS (
      SELECT 1
      FROM project_members pm
      WHERE pm.project_id = procurement_items.project_id 
        AND pm.user_id = auth.uid()
    )
  );

-- DELETE: Allow if user is admin/owner in same company as project, OR is project member
CREATE POLICY "Users can delete procurement items for their company projects"
  ON procurement_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM projects p
      JOIN user_profiles up ON up.company_id = p.company_id
      WHERE p.id = procurement_items.project_id 
        AND up.id = auth.uid()
        AND LOWER(up.role) IN ('admin', 'owner', 'estimator')
    )
    OR EXISTS (
      SELECT 1
      FROM project_members pm
      WHERE pm.project_id = procurement_items.project_id 
        AND pm.user_id = auth.uid()
    )
  );
