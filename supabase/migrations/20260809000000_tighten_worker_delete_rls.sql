-- Tightens the workers DELETE policy to match WorkersPage.tsx's existing UI
-- restriction (canDelete = director/site_supervisor), which the RLS policy
-- from 20260808000000_role_gate_worker_creation.sql didn't yet enforce —
-- that migration deliberately preserved the old any-company-member DELETE
-- behavior and flagged this exact mismatch for a follow-up. This is that
-- follow-up.
DROP POLICY IF EXISTS "Users can delete their company workers" ON workers;

CREATE POLICY "Managers can delete company workers"
  ON workers FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('director', 'site_supervisor')
    )
  );
