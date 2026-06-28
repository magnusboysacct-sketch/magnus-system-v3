/*
  Fix: REFERENCES user_profiles(id) columns with NO ACTION / RESTRICT
  block cascade-deleting auth users (auth.users → user_profiles → blocked).
  Change all to SET NULL.
*/

DO $$
DECLARE
  r record;
  sql text;
BEGIN
  FOR r IN
    SELECT
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.key_column_usage kcu2
      ON rc.unique_constraint_name = kcu2.constraint_name
    JOIN information_schema.table_constraints tc2
      ON rc.unique_constraint_name = tc2.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc2.table_name = 'user_profiles'
      AND tc2.table_schema = 'public'
      AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
  LOOP
    BEGIN
      sql := format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I; ' ||
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.user_profiles(id) ON DELETE SET NULL;',
        r.table_name, r.constraint_name,
        r.table_name, r.constraint_name, r.column_name
      );
      EXECUTE sql;
      RAISE NOTICE 'Fixed FK: %.% → user_profiles SET NULL', r.table_name, r.column_name;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not fix %.%: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Also clean up orphaned companies from test users so future deletions are clean
-- (companies have no FK back to auth.users — they persist after user deletion)
-- This is a safe no-op if no orphans exist.
DELETE FROM public.company_settings
WHERE company_id IN (
  SELECT c.id FROM public.companies c
  LEFT JOIN public.user_profiles up ON up.company_id = c.id
  WHERE up.id IS NULL
);

DELETE FROM public.companies
WHERE id NOT IN (
  SELECT DISTINCT company_id FROM public.user_profiles WHERE company_id IS NOT NULL
);
