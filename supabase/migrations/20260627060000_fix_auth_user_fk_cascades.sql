/*
  Fix: REFERENCES auth.users(id) columns with NO ACTION / RESTRICT delete rule
  block deleting users from Supabase Studio. Change them all to SET NULL.
  The DO block is fully dynamic — it only touches constraints that actually exist.
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
    JOIN information_schema.table_constraints tc2
      ON rc.unique_constraint_name = tc2.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc2.table_name = 'users'
      AND tc2.table_schema = 'auth'
      AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
  LOOP
    BEGIN
      sql := format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I; ' ||
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL;',
        r.table_name, r.constraint_name,
        r.table_name, r.constraint_name, r.column_name
      );
      EXECUTE sql;
      RAISE NOTICE 'Fixed FK: %.% (%) → ON DELETE SET NULL',
        r.table_name, r.column_name, r.constraint_name;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not fix %.%: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END;
$$;
