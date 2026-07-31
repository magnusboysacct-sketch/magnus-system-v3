-- field_payments had SELECT/INSERT/UPDATE RLS policies but no DELETE policy.
-- With RLS enabled and no matching policy, deletes silently affect 0 rows
-- (error: null), so the UI's optimistic removal wasn't backed by a real delete
-- and the row reappeared on refresh.

CREATE POLICY "Company users can delete field payments" ON field_payments
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND
    company_id = (
      SELECT company_id FROM user_profiles
      WHERE id = auth.uid()
    )
  );
