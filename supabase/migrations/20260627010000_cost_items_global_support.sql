/*
  Allow global (company_id IS NULL) cost_items for the shared rate library.

  Previously company_id was NOT NULL, which prevented seeding global items.
  Global items (company_id IS NULL) are visible to all companies.
  Company-specific items are only visible to their company.

  RLS is updated to show: global items OR own-company items.
*/

-- 1. Make company_id nullable
ALTER TABLE cost_items ALTER COLUMN company_id DROP NOT NULL;

-- 2. Drop existing RLS policies (names may vary — use DO block)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'cost_items' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON cost_items', pol.policyname);
  END LOOP;
END $$;

-- 3. Enable RLS (idempotent)
ALTER TABLE cost_items ENABLE ROW LEVEL SECURITY;

-- 4. New policies: global OR own company

-- SELECT: see global items + own company items
CREATE POLICY "cost_items_select"
  ON cost_items FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id = (
      SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- INSERT: only into own company (cannot insert global items via app)
CREATE POLICY "cost_items_insert"
  ON cost_items FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (
      SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- UPDATE: own company items only
CREATE POLICY "cost_items_update"
  ON cost_items FOR UPDATE TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1
    )
  )
  WITH CHECK (
    company_id = (
      SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- DELETE: own company items only
CREATE POLICY "cost_items_delete"
  ON cost_items FOR DELETE TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM user_profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- 5. Add unique constraint to cost_item_rates so seeds are idempotent
--    First remove duplicate rows keeping only the most-recent id per (item, date, source)
DELETE FROM cost_item_rates
WHERE id NOT IN (
  SELECT DISTINCT ON (cost_item_id, effective_date, source) id
  FROM cost_item_rates
  ORDER BY cost_item_id, effective_date, source, created_at DESC
);

ALTER TABLE cost_item_rates
  DROP CONSTRAINT IF EXISTS uq_cost_item_rates_item_date_source;

ALTER TABLE cost_item_rates
  ADD CONSTRAINT uq_cost_item_rates_item_date_source
  UNIQUE (cost_item_id, effective_date, source);
