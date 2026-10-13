-- Applied directly to the live database on 2026-10-13; this file version-controls it.
-- Let a user (auth.users row) be deleted even when they created history rows in the tables that were added after the June FK-fix migrations
-- (20260627060000, 20260628000002). Those tables' user-pointing foreign keys were ON DELETE NO ACTION, which made
-- admin_delete_auth_user's `DELETE FROM auth.users` fail ("Database error deleting user") whenever any row pointed at the user.
--
-- Same fully-dynamic, idempotent style as the June migrations: each listed column's live foreign key (to auth.users or user_profiles,
-- whatever its name) is dropped and recreated, same name and target, as ON DELETE SET NULL, so the history row survives with a null user.
-- Safe to re-run: columns already SET NULL are skipped. A column that is NOT NULL live, a missing table/column, or no matching FK is
-- skipped with a NOTICE (never errors, never changes the column) so it can be decided separately.
--
-- Covers 14 columns across 12 tables. worker_portal_messages.worker_user_id, worker_portal_messages.sender_id and
-- worker_portal_notice_reads.worker_id are NOT NULL, so they are only converted if nullable live; otherwise they are skipped here.

BEGIN;

DO $$
DECLARE
  t        record;
  con      record;
  v_tbl    regclass;
  v_attnum smallint;
  v_notnull boolean;
  v_found  boolean;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('admin_tasks',              'created_by'),
      ('company_documents',        'created_by'),
      ('meeting_minutes',          'created_by'),
      ('photo_share_links',        'created_by'),
      ('project_plans',            'uploaded_by'),
      ('scheduled_events',         'created_by'),
      ('secretary_documents',      'created_by'),
      ('secretary_documents',      'approved_by'),
      ('site_visits',              'visited_by'),
      ('worker_certifications',    'created_by'),
      ('worker_portal_notices',    'posted_by'),
      -- NOT NULL in the migration files; skipped (with a NOTICE) unless they are nullable live. See the separate decision block.
      ('worker_portal_messages',   'worker_user_id'),
      ('worker_portal_messages',   'sender_id'),
      ('worker_portal_notice_reads','worker_id')
    ) AS x(tbl, col)
  LOOP
    v_tbl := to_regclass('public.' || quote_ident(t.tbl));
    IF v_tbl IS NULL THEN
      RAISE NOTICE 'skip %.%: table does not exist', t.tbl, t.col;
      CONTINUE;
    END IF;

    SELECT a.attnum, a.attnotnull INTO v_attnum, v_notnull
    FROM pg_attribute a
    WHERE a.attrelid = v_tbl AND a.attname = t.col AND NOT a.attisdropped;
    IF NOT FOUND THEN
      RAISE NOTICE 'skip %.%: column does not exist', t.tbl, t.col;
      CONTINUE;
    END IF;

    v_found := false;
    FOR con IN
      SELECT c.conname, c.confrelid, c.confdeltype,
             (SELECT string_agg(quote_ident(a2.attname), ', ' ORDER BY k.ord)
                FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a2 ON a2.attrelid = c.confrelid AND a2.attnum = k.attnum) AS refcols
      FROM pg_constraint c
      WHERE c.conrelid = v_tbl
        AND c.contype = 'f'
        AND c.conkey = ARRAY[v_attnum]
        AND c.confrelid IN ('auth.users'::regclass, 'public.user_profiles'::regclass)
    LOOP
      v_found := true;
      IF con.confdeltype = 'n' THEN
        RAISE NOTICE 'ok   %.%: already ON DELETE SET NULL (%)', t.tbl, t.col, con.conname;
        CONTINUE;
      END IF;
      IF v_notnull THEN
        RAISE NOTICE 'SKIP %.%: column is NOT NULL, SET NULL cannot work - needs a separate decision (%)', t.tbl, t.col, con.conname;
        CONTINUE;
      END IF;
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', v_tbl, con.conname);
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s (%s) ON DELETE SET NULL',
                     v_tbl, con.conname, t.col, con.confrelid::regclass, con.refcols);
      RAISE NOTICE 'DONE %.%: % -> ON DELETE SET NULL', t.tbl, t.col, con.conname;
    END LOOP;

    IF NOT v_found THEN
      RAISE NOTICE 'skip %.%: no foreign key to auth.users / user_profiles on this column', t.tbl, t.col;
    END IF;
  END LOOP;
END $$;

COMMIT;
