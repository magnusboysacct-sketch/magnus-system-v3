/*
  Fix any remaining FK constraints that block deletion of auth.users rows.

  Covers two cases:
  1. Tables in public schema referencing auth.users(id) with NO ACTION / RESTRICT
  2. user_profiles.id itself — must be ON DELETE CASCADE so deleting an auth user
     removes the profile row automatically.

  All changes are idempotent: the DO block skips constraints that already have
  the correct delete rule.
*/

-- ── 1. Fix all public.* → auth.users FKs to ON DELETE CASCADE ───────────────
DO $$
DECLARE
  r   record;
  sql text;
BEGIN
  FOR r IN
    SELECT
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints   tc
    JOIN information_schema.key_column_usage    kcu
      ON tc.constraint_name  = kcu.constraint_name
     AND tc.table_schema     = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name  = rc.constraint_name
     AND tc.table_schema     = rc.constraint_schema
    JOIN information_schema.table_constraints   tc2
      ON rc.unique_constraint_name = tc2.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = 'public'
      AND tc2.table_name     = 'users'
      AND tc2.table_schema   = 'auth'
      AND rc.delete_rule    IN ('NO ACTION', 'RESTRICT')
  LOOP
    BEGIN
      sql := format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I; '
        'ALTER TABLE public.%I ADD CONSTRAINT %I '
        '  FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE CASCADE;',
        r.table_name, r.constraint_name,
        r.table_name, r.constraint_name, r.column_name
      );
      EXECUTE sql;
      RAISE NOTICE 'Fixed → CASCADE: %.% (%)',
        r.table_name, r.column_name, r.constraint_name;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not fix %.%: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ── 2. Fix user_profiles.id → auth.users(id) to ON DELETE CASCADE ───────────
--    (user_profiles.id IS the auth user id; when auth user is deleted the
--     profile must also go — SET NULL on a PK makes no sense.)
DO $$
DECLARE
  r   record;
  sql text;
BEGIN
  SELECT tc.constraint_name
  INTO   r
  FROM   information_schema.table_constraints   tc
  JOIN   information_schema.key_column_usage    kcu
    ON   tc.constraint_name = kcu.constraint_name
   AND   tc.table_schema    = kcu.table_schema
  JOIN   information_schema.referential_constraints rc
    ON   tc.constraint_name = rc.constraint_name
   AND   tc.table_schema    = rc.constraint_schema
  JOIN   information_schema.table_constraints   tc2
    ON   rc.unique_constraint_name = tc2.constraint_name
  WHERE  tc.table_schema  = 'public'
    AND  tc.table_name    = 'user_profiles'
    AND  kcu.column_name  = 'id'
    AND  tc2.table_name   = 'users'
    AND  tc2.table_schema = 'auth'
    AND  rc.delete_rule  != 'CASCADE'
  LIMIT 1;

  IF r.constraint_name IS NOT NULL THEN
    sql := format(
      'ALTER TABLE public.user_profiles DROP CONSTRAINT %I; '
      'ALTER TABLE public.user_profiles ADD CONSTRAINT %I '
      '  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;',
      r.constraint_name, r.constraint_name
    );
    EXECUTE sql;
    RAISE NOTICE 'Fixed user_profiles.id → auth.users CASCADE';
  ELSE
    RAISE NOTICE 'user_profiles.id already CASCADE (or no FK found — skipping)';
  END IF;
EXCEPTION WHEN others THEN
  RAISE WARNING 'user_profiles.id fix failed: %', SQLERRM;
END;
$$;

-- ── 3. Fix public.* → user_profiles(id) FKs to ON DELETE SET NULL ───────────
--    Other tables that reference a user by their profile id should SET NULL
--    rather than block the delete chain.
DO $$
DECLARE
  r   record;
  sql text;
BEGIN
  FOR r IN
    SELECT
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints   tc
    JOIN information_schema.key_column_usage    kcu
      ON tc.constraint_name  = kcu.constraint_name
     AND tc.table_schema     = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name  = rc.constraint_name
     AND tc.table_schema     = rc.constraint_schema
    JOIN information_schema.table_constraints   tc2
      ON rc.unique_constraint_name = tc2.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema    = 'public'
      -- exclude user_profiles itself (handled above)
      AND tc.table_name     != 'user_profiles'
      AND tc2.table_name     = 'user_profiles'
      AND tc2.table_schema   = 'public'
      AND rc.delete_rule    IN ('NO ACTION', 'RESTRICT')
  LOOP
    BEGIN
      sql := format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I; '
        'ALTER TABLE public.%I ADD CONSTRAINT %I '
        '  FOREIGN KEY (%I) REFERENCES public.user_profiles(id) ON DELETE SET NULL;',
        r.table_name, r.constraint_name,
        r.table_name, r.constraint_name, r.column_name
      );
      EXECUTE sql;
      RAISE NOTICE 'Fixed → SET NULL: %.% (%)',
        r.table_name, r.column_name, r.constraint_name;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not fix %.%: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END;
$$;
