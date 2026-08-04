-- Splits the previously all-encompassing "Users can manage their company
-- workers" FOR ALL policy (20260315125158_create_finance_erp_system.sql)
-- so INSERT specifically requires a manager-level role, closing the gap
-- where any authenticated company member — including 'viewer' — could add
-- workers. UPDATE and DELETE keep their prior any-company-member behavior
-- unchanged (not tightened here, per explicit instruction not to silently
-- change them).
--
-- Note: WorkersPage.tsx's UI already restricts its own "Delete" action to
-- director/site_supervisor, which is *stricter* than this DELETE policy —
-- that mismatch already existed before this migration and is left as-is;
-- flagged separately, not fixed here.
--
-- SELECT policy ("Users can view their company workers") is untouched.

DROP POLICY IF EXISTS "Users can manage their company workers" ON workers;

CREATE POLICY "Managers can add company workers"
  ON workers FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('director', 'admin', 'project_manager', 'site_supervisor')
    )
  );

CREATE POLICY "Users can update their company workers"
  ON workers FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their company workers"
  ON workers FOR DELETE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid()));
