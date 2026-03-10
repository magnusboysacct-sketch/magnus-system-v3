/*
  # Fix BOQ RLS Policies to Use Correct Table

  ## Root Cause
  The RLS policies on boq_section_items were referencing the wrong table:
  - Foreign key chain: boq_section_items → boq_sections → boq_headers (CORRECT)
  - Old policies referenced: boqs table (WRONG)
  
  ## Changes
  1. Drop all conflicting/duplicate policies on boq_section_items
  2. Create correct policies that follow the actual FK chain through boq_headers
  3. Ensure policies check:
     - User is authenticated
     - User's company matches boq_headers.company_id
     - User is admin/owner for write operations OR
     - User is a project member for the project
  
  ## Security
  - Maintains RLS protection
  - Follows proper FK relationships
  - Allows project members to work on their project BOQs
  - Restricts based on company_id for tenant isolation
*/

-- Drop all existing policies on boq_section_items
DROP POLICY IF EXISTS "boq_items_delete_project_members" ON boq_section_items;
DROP POLICY IF EXISTS "boq_items_insert_project_members" ON boq_section_items;
DROP POLICY IF EXISTS "boq_items_select_project_members" ON boq_section_items;
DROP POLICY IF EXISTS "boq_items_update_project_members" ON boq_section_items;
DROP POLICY IF EXISTS "boq_section_items_tenant_read" ON boq_section_items;
DROP POLICY IF EXISTS "boq_section_items_tenant_write" ON boq_section_items;
DROP POLICY IF EXISTS "boq_section_items_tenant_write_admin" ON boq_section_items;

-- CREATE CORRECT POLICIES using boq_headers

-- SELECT: Users can view items from their company's BOQs
CREATE POLICY "boq_section_items_select"
  ON boq_section_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM boq_sections s
      JOIN boq_headers h ON h.id = s.boq_id
      JOIN user_profiles up ON up.company_id = h.company_id
      WHERE s.id = boq_section_items.section_id
        AND up.id = auth.uid()
    )
  );

-- INSERT: Admins/owners can insert, OR project members can insert
CREATE POLICY "boq_section_items_insert"
  ON boq_section_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM boq_sections s
      JOIN boq_headers h ON h.id = s.boq_id
      JOIN user_profiles up ON up.company_id = h.company_id
      WHERE s.id = boq_section_items.section_id
        AND up.id = auth.uid()
        AND (
          lower(up.role) IN ('admin', 'owner')
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = h.project_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

-- UPDATE: Admins/owners can update, OR project members can update
CREATE POLICY "boq_section_items_update"
  ON boq_section_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM boq_sections s
      JOIN boq_headers h ON h.id = s.boq_id
      JOIN user_profiles up ON up.company_id = h.company_id
      WHERE s.id = boq_section_items.section_id
        AND up.id = auth.uid()
        AND (
          lower(up.role) IN ('admin', 'owner')
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = h.project_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM boq_sections s
      JOIN boq_headers h ON h.id = s.boq_id
      JOIN user_profiles up ON up.company_id = h.company_id
      WHERE s.id = boq_section_items.section_id
        AND up.id = auth.uid()
        AND (
          lower(up.role) IN ('admin', 'owner')
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = h.project_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

-- DELETE: Admins/owners can delete, OR project members can delete
CREATE POLICY "boq_section_items_delete"
  ON boq_section_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM boq_sections s
      JOIN boq_headers h ON h.id = s.boq_id
      JOIN user_profiles up ON up.company_id = h.company_id
      WHERE s.id = boq_section_items.section_id
        AND up.id = auth.uid()
        AND (
          lower(up.role) IN ('admin', 'owner')
          OR EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.project_id = h.project_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );
