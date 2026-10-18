-- Storage audit: sensitive files are private, readable only by the roles that need them, shown through short-lived signed URLs.
--
-- WHAT WAS WRONG (checked on the live project)
--   * project-files was a PUBLIC bucket holding 157 files: legacy copies of worker ID scans and passport photos, field-payment ID scans, a bank statement, receipts,
--     signatures, contract signatures, plans. Anyone with a file's URL could open it (verified: HTTP 200 for each kind, signed out). The earlier one-time copy to
--     private-files deliberately left the public originals behind.
--   * An anonymous visitor could LIST project-photos, company-logos and company-assets (the "Public read" policies allow it): the company ids and file names.
--   * private-files: any staff role of the company could read or replace ANY file under its company folder - ID scans, bank statements, receipts, signatures.
--   * The database stored 1-year signed URLs for ID scans, passport / staff photos, receipts and field signatures: a copied link worked for a year for anyone.
--   * company-assets (company signature, watermark): any member of the company could write there.
--   * The unused 3-argument procurement functions (submit_for_approval / approve_procurement / reject_procurement with a caller-supplied user id) let one staff member
--     approve or reject as another.
--
-- WHAT THIS DOES
--   1. project-files becomes PRIVATE. (Its policies already key on project membership; plans are already opened with signed URLs.) The legacy copies stop being
--      public. Nothing in the database points at them any more, except what the safety check below refuses to proceed past.
--   2. private-files: ONE set of policies, decided per path. The first folder must be the caller's company and the caller a staff role, and then:
--        ID scans   <co>/workers/ids/..  <co>/field-payments/ids/..    read: director, admin, secretary      upload: director, admin, secretary, supervisor, site_user
--        finance    <co>/receipts/.. bank-statements/.. credit-card-statements/.. finance/..    read: full finance access, or the person who uploaded the file
--        everything else (staff / passport photos, signatures, field photos, site visits, plans, documents)    read and upload: any staff role
--        replacing or deleting: whoever may read it (the uploader can also change a file they can see, e.g. their own receipt).
--      A site_user can upload an ID scan but cannot open it, and cannot open anyone's receipts or bank statements unless given full finance access.
--   3. The stored 1-year signed URLs become plain storage paths (workers.id_photo_url / passport_photo_url, field_payments.id_photo_url / signature_url,
--      user_profiles.avatar_url, expenses.receipt_url). The app signs a path for an hour when it shows it (src/lib/storageRefs.ts), so the policies above decide who
--      gets the picture. Old values that are still URLs keep working in the app.
--   4. company-assets (signature, watermark: they are printed on documents and put in emails, so the bucket stays public to read): only a director or admin of the
--      company can write.
--   5. Anonymous listing of project-photos, company-logos and company-assets is closed (the three "Public read" policies are dropped). Public URLs still work; the
--      portal, share links, emails and PDFs are unaffected. Signed-in staff keep their own policies.
--   6. verify_id() / verify_worker() no longer hand out a photo URL: they say has_photo, and the verify-photo edge function (supabase/functions/verify-photo) returns a
--      5-minute signed URL for the profile / passport photo of the card that was scanned (never an ID scan).
--   7. The three 3-argument procurement functions and their *_unchecked helpers are dropped (nothing calls them; the 2-argument versions already use auth.uid()).
--
-- BEFORE YOU APPLY: deploy the new front end and the verify-photo function with this migration (the app reads paths and signs them; the verify pages need the
-- function), and run the migrate-storage-to-private function once more in dry-run: this migration stops, changing nothing, if a stored public project-files URL
-- is still in the database.
--
-- Functions created here start with REVOKE ALL ... FROM PUBLIC, anon. Safety: the migration stops, changing nothing, on any storage policy it does not know.

BEGIN;

-- ── 0. Check what is there ──────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record; v_n bigint;
BEGIN
  FOR r IN SELECT x FROM unnest(ARRAY['private-files', 'project-files', 'company-assets', 'company-logos', 'project-photos']) AS x
            WHERE NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = x)
  LOOP
    RAISE EXCEPTION 'Storage bucket % was not found. Nothing was changed.', r.x;
  END LOOP;

  -- Policies that mention one of these buckets must be ones this migration knows (it replaces or drops some, keeps the rest).
  FOR r IN
    SELECT p.policyname FROM pg_policies p
     WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
       AND (coalesce(p.qual, '') ~ '(private-files|project-files|company-assets|company-logos|project-photos)' OR coalesce(p.with_check, '') ~ '(private-files|project-files|company-assets|company-logos|project-photos)')
       AND p.policyname NOT IN (
         'private-files company select', 'private-files company insert', 'private-files company update', 'private-files company delete',
         'private-files access read', 'private-files access insert', 'private-files access update', 'private-files access delete',
         'Public read', 'company logos public read', 'Public read company-assets 11180r7_0', 'Authenticated write company-assets 11180r7_2',
         'company-assets company write', 'company-assets company update', 'company-assets company delete',
         'company-assets admin write', 'company-assets admin update', 'company-assets admin delete',
         'company-logos admin insert', 'company-logos admin update', 'company-logos admin delete',
         'Company members can delete staff photos', 'Company members can update staff photos', 'Company members can upload staff photos', 'Company members can view staff photos',
         'Project access for project-files delete', 'Project access for project-files insert', 'Project access for project-files select',
         'Company members can upload project photos', 'Company members can view project photos', 'Users can delete their own photos')
  LOOP
    RAISE EXCEPTION 'Unexpected storage policy "%": it is not handled by this migration. Nothing was changed.', r.policyname;
  END LOOP;

  FOR r IN
    SELECT p.policyname FROM pg_policies p
     WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       AND coalesce(p.qual, '') NOT ILIKE '%bucket_id%' AND coalesce(p.with_check, '') NOT ILIKE '%bucket_id%'
  LOOP
    RAISE EXCEPTION 'Storage policy "%" can write to any bucket (it names no bucket). Nothing was changed.', r.policyname;
  END LOOP;

  -- A stored PUBLIC project-files URL would stop working when that bucket becomes private: the one-time copy must have been run for it (migrate-storage-to-private).
  SELECT (SELECT count(*) FROM workers WHERE coalesce(id_photo_url, '') LIKE '%/object/public/project-files/%' OR coalesce(passport_photo_url, '') LIKE '%/object/public/project-files/%')
       + (SELECT count(*) FROM field_payments WHERE coalesce(id_photo_url, '') LIKE '%/object/public/project-files/%')
       + (SELECT count(*) FROM user_profiles WHERE coalesce(avatar_url, '') LIKE '%/object/public/project-files/%')
       + (SELECT count(*) FROM expenses WHERE coalesce(receipt_url, '') LIKE '%/object/public/project-files/%')
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION '% stored file link(s) still point at the public project-files bucket. Run the migrate-storage-to-private function (dry run first) and apply this migration afterwards. Nothing was changed.', v_n;
  END IF;
END $$;

-- ── 1. project-files: private ───────────────────────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'project-files';

-- ── 2. private-files: who may read / write which path ───────────────────────────────────────────────────────────────────────
-- The kind of file, from its path (<companyId>/<folder>/...).
CREATE OR REPLACE FUNCTION public.private_files_class(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
           WHEN split_part(p_name, '/', 2) IN ('workers', 'field-payments') AND split_part(p_name, '/', 3) = 'ids' THEN 'id_scan'
           WHEN split_part(p_name, '/', 2) IN ('receipts', 'bank-statements', 'credit-card-statements', 'finance') THEN 'finance'
           ELSE 'general'
         END
$$;
REVOKE ALL ON FUNCTION public.private_files_class(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.private_files_class(text) TO authenticated, service_role;

-- May the signed-in user read / insert / change this object? mode: 'read' | 'insert' | 'change' (replace or delete). p_owner = storage.objects.owner.
CREATE OR REPLACE FUNCTION public.private_files_access(p_name text, p_owner uuid, p_mode text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid; v_role text; v_finance text;
  v_class text := public.private_files_class(p_name);
  v_read boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT up.company_id, up.role, up.finance_access_level INTO v_company, v_role, v_finance FROM public.user_profiles up WHERE up.id = v_uid LIMIT 1;
  IF v_company IS NULL OR v_role NOT IN ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary') THEN RETURN false; END IF;
  IF split_part(p_name, '/', 1) <> v_company::text THEN RETURN false; END IF;               -- the first folder is the company

  IF p_mode = 'insert' THEN
    RETURN v_class <> 'id_scan' OR v_role IN ('director', 'admin', 'secretary', 'supervisor', 'site_user');
  END IF;

  v_read := CASE v_class
              WHEN 'id_scan' THEN v_role IN ('director', 'admin', 'secretary')
              WHEN 'finance' THEN coalesce(v_finance = 'full', false) OR p_owner = v_uid
              ELSE true
            END;
  IF p_mode = 'read' THEN RETURN v_read; END IF;
  IF p_mode = 'change' THEN RETURN v_read OR p_owner = v_uid; END IF;                       -- the uploader may replace or remove their own file
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.private_files_access(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.private_files_access(text, uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "private-files company select" ON storage.objects;
DROP POLICY IF EXISTS "private-files company insert" ON storage.objects;
DROP POLICY IF EXISTS "private-files company update" ON storage.objects;
DROP POLICY IF EXISTS "private-files company delete" ON storage.objects;
DROP POLICY IF EXISTS "private-files access read" ON storage.objects;
DROP POLICY IF EXISTS "private-files access insert" ON storage.objects;
DROP POLICY IF EXISTS "private-files access update" ON storage.objects;
DROP POLICY IF EXISTS "private-files access delete" ON storage.objects;

CREATE POLICY "private-files access read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'private-files' AND public.private_files_access(name, owner, 'read'));
CREATE POLICY "private-files access insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'private-files' AND public.private_files_access(name, owner, 'insert'));
CREATE POLICY "private-files access update" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'private-files' AND public.private_files_access(name, owner, 'change'))
  WITH CHECK (bucket_id = 'private-files' AND public.private_files_access(name, owner, 'insert'));
CREATE POLICY "private-files access delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'private-files' AND public.private_files_access(name, owner, 'change'));

-- ── 3. The stored links become paths ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.url_decode(t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE r bytea := ''::bytea; i int := 1;
BEGIN
  WHILE i <= length(t) LOOP
    IF substr(t, i, 1) = '%' AND substr(t, i + 1, 2) ~ '^[0-9A-Fa-f]{2}$' THEN r := r || decode(substr(t, i + 1, 2), 'hex'); i := i + 3;
    ELSE r := r || convert_to(substr(t, i, 1), 'UTF8'); i := i + 1; END IF;
  END LOOP;
  RETURN convert_from(r, 'UTF8');
END $f$;

-- <anything>/storage/v1/object/(sign|public|authenticated)/private-files/<path>?token=...  ->  <path>
UPDATE workers SET id_photo_url = pg_temp.url_decode(regexp_replace(id_photo_url, '^.*/storage/v1/object/(sign|public|authenticated)/private-files/([^?#]+).*$', '\2'))
 WHERE id_photo_url ~ '/storage/v1/object/(sign|public|authenticated)/private-files/';
UPDATE workers SET passport_photo_url = pg_temp.url_decode(regexp_replace(passport_photo_url, '^.*/storage/v1/object/(sign|public|authenticated)/private-files/([^?#]+).*$', '\2'))
 WHERE passport_photo_url ~ '/storage/v1/object/(sign|public|authenticated)/private-files/';
UPDATE field_payments SET id_photo_url = pg_temp.url_decode(regexp_replace(id_photo_url, '^.*/storage/v1/object/(sign|public|authenticated)/private-files/([^?#]+).*$', '\2'))
 WHERE id_photo_url ~ '/storage/v1/object/(sign|public|authenticated)/private-files/';
UPDATE field_payments SET signature_url = pg_temp.url_decode(regexp_replace(signature_url, '^.*/storage/v1/object/(sign|public|authenticated)/private-files/([^?#]+).*$', '\2'))
 WHERE signature_url ~ '/storage/v1/object/(sign|public|authenticated)/private-files/';
UPDATE user_profiles SET avatar_url = pg_temp.url_decode(regexp_replace(avatar_url, '^.*/storage/v1/object/(sign|public|authenticated)/private-files/([^?#]+).*$', '\2'))
 WHERE avatar_url ~ '/storage/v1/object/(sign|public|authenticated)/private-files/';
UPDATE expenses SET receipt_url = pg_temp.url_decode(regexp_replace(receipt_url, '^.*/storage/v1/object/(sign|public|authenticated)/private-files/([^?#]+).*$', '\2'))
 WHERE receipt_url ~ '/storage/v1/object/(sign|public|authenticated)/private-files/';

DO $$
DECLARE v_n bigint;
BEGIN
  SELECT (SELECT count(*) FROM workers WHERE id_photo_url ~ '/object/(sign|public|authenticated)/private-files/' OR passport_photo_url ~ '/object/(sign|public|authenticated)/private-files/')
       + (SELECT count(*) FROM field_payments WHERE id_photo_url ~ '/object/(sign|public|authenticated)/private-files/' OR signature_url ~ '/object/(sign|public|authenticated)/private-files/')
       + (SELECT count(*) FROM user_profiles WHERE avatar_url ~ '/object/(sign|public|authenticated)/private-files/')
       + (SELECT count(*) FROM expenses WHERE receipt_url ~ '/object/(sign|public|authenticated)/private-files/')
    INTO v_n;
  IF v_n > 0 THEN RAISE EXCEPTION '% stored file link(s) could not be turned into a storage path. Nothing was changed.', v_n; END IF;
END $$;

-- ── 4. company-assets: only a director or admin of the company can write ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "company-assets company write" ON storage.objects;
DROP POLICY IF EXISTS "company-assets company update" ON storage.objects;
DROP POLICY IF EXISTS "company-assets company delete" ON storage.objects;
DROP POLICY IF EXISTS "company-assets admin write" ON storage.objects;
DROP POLICY IF EXISTS "company-assets admin update" ON storage.objects;
DROP POLICY IF EXISTS "company-assets admin delete" ON storage.objects;

CREATE POLICY "company-assets admin write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets'
              AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.company_id::text = (storage.foldername(name))[1] AND lower(up.role) IN ('director', 'admin')));
CREATE POLICY "company-assets admin update" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'company-assets'
              AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.company_id::text = (storage.foldername(name))[1] AND lower(up.role) IN ('director', 'admin')))
  WITH CHECK (bucket_id = 'company-assets'
              AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.company_id::text = (storage.foldername(name))[1] AND lower(up.role) IN ('director', 'admin')));
CREATE POLICY "company-assets admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets'
         AND EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.company_id::text = (storage.foldername(name))[1] AND lower(up.role) IN ('director', 'admin')));

-- ── 5. No anonymous listing of the public buckets (their files stay reachable by URL) ───────────────────────────────────────
DROP POLICY IF EXISTS "Public read" ON storage.objects;
DROP POLICY IF EXISTS "company logos public read" ON storage.objects;
DROP POLICY IF EXISTS "Public read company-assets 11180r7_0" ON storage.objects;

-- ── 6. The public verify pages ──────────────────────────────────────────────────────────────────────────────────────────────
-- Same as 20260946000000, but no photo URL: has_photo, and the verify-photo edge function signs the picture for five minutes.
CREATE OR REPLACE FUNCTION public.verify_id(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_code text := lower(btrim(coalesce(p_code, '')));
  r jsonb;
BEGIN
  IF v_code !~ '^[0-9a-f]{12}$' THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
           'kind', 'staff',
           'name', coalesce(nullif(btrim(up.full_name), ''), 'Staff member'),
           'title', coalesce(nullif(btrim(up.job_title), ''), initcap(replace(coalesce(nullif(up.role, ''), 'staff'), '_', ' '))),
           'has_photo', nullif(btrim(coalesce(up.avatar_url, '')), '') IS NOT NULL,
           'company_name', cs.company_name,
           'logo_url', cs.logo_url,
           'id_card_primary', cs.id_card_primary,
           'id_card_accent', cs.id_card_accent,
           'status', CASE WHEN coalesce(up.status, 'active') = 'active' THEN 'active' ELSE 'inactive' END,
           'expired', coalesce(x.exp < current_date, false),
           'valid', (coalesce(up.status, 'active') = 'active' AND NOT coalesce(x.exp < current_date, false)),
           'expiry_date', x.exp)
    INTO r
    FROM public.user_profiles up
    LEFT JOIN public.company_settings cs ON cs.company_id = up.company_id
    CROSS JOIN LATERAL (SELECT coalesce(up.id_expiry_date, (coalesce(up.id_issued_date, up.created_at::date) + interval '2 years')::date) AS exp) x
   WHERE up.verify_code = v_code
   LIMIT 1;
  IF r IS NOT NULL THEN RETURN r; END IF;

  SELECT jsonb_build_object(
           'kind', 'worker',
           'name', btrim(concat_ws(' ', w.first_name, w.last_name)),
           'title', coalesce(nullif(btrim(w.job_title), ''), initcap(replace(coalesce(nullif(w.worker_type, ''), 'worker'), '_', ' '))),
           'has_photo', nullif(btrim(coalesce(w.passport_photo_url, '')), '') IS NOT NULL,
           'company_name', cs.company_name,
           'logo_url', cs.logo_url,
           'id_card_primary', cs.id_card_primary,
           'id_card_accent', cs.id_card_accent,
           'status', coalesce(w.status, 'active'),
           'expired', coalesce(x.exp < current_date, false),
           'valid', (coalesce(w.status, 'active') = 'active' AND NOT coalesce(x.exp < current_date, false)),
           'expiry_date', x.exp)
    INTO r
    FROM public.workers w
    LEFT JOIN public.company_settings cs ON cs.company_id = w.company_id
    CROSS JOIN LATERAL (SELECT coalesce(w.id_expiry_date, (w.hire_date + interval '2 years')::date) AS exp) x
   WHERE w.verify_code = v_code
   LIMIT 1;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_id(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verify_worker(p_worker_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
           'id', w.id,
           'first_name', w.first_name,
           'last_name', w.last_name,
           'worker_type', w.worker_type,
           'status', w.status,
           'employee_id', w.employee_id,
           'hire_date', w.hire_date,
           'has_photo', nullif(btrim(coalesce(w.passport_photo_url, '')), '') IS NOT NULL,
           'company_name', cs.company_name,
           'logo_url', cs.logo_url,
           'id_card_primary', cs.id_card_primary,
           'id_card_accent', cs.id_card_accent,
           'expired', coalesce(coalesce(w.id_expiry_date, w.hire_date + interval '2 years') < current_date, false),
           'valid', (w.status = 'active' AND NOT coalesce(coalesce(w.id_expiry_date, w.hire_date + interval '2 years') < current_date, false)))
    FROM workers w
    LEFT JOIN company_settings cs ON cs.company_id = w.company_id
   WHERE w.id = p_worker_id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_worker(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_worker(uuid) TO anon, authenticated, service_role;

-- ── 7. The procurement functions that trusted a caller-supplied user id ─────────────────────────────────────────────────────
-- Nothing in the app, the edge functions or the API calls them (the 2-argument versions, which use auth.uid(), are the ones in use). They are dropped, and their
-- unchecked helpers with them, unless some other function still refers to those helpers.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname NOT IN ('submit_for_approval', 'approve_procurement', 'reject_procurement', 'submit_for_approval_unchecked', 'approve_procurement_unchecked', 'reject_procurement_unchecked')
       AND p.prosrc ~ '(submit_for_approval|approve_procurement|reject_procurement)_unchecked'
  LOOP
    RAISE EXCEPTION 'public.% still calls one of the unchecked procurement functions. Nothing was changed.', r.proname;
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.submit_for_approval(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.approve_procurement(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.reject_procurement(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.submit_for_approval_unchecked(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.approve_procurement_unchecked(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.reject_procurement_unchecked(uuid, uuid, text);

-- ── 8. Check the result ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'project-files') THEN RAISE EXCEPTION 'project-files is still public. Nothing was changed.'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'SELECT' AND 'anon' = ANY (p.roles::text[])
                AND (coalesce(p.qual, '') ~ '(company-assets|company-logos|project-photos)')) THEN
    RAISE EXCEPTION 'A policy still lets signed-out visitors list a public bucket. Nothing was changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'SELECT' AND 'public' = ANY (p.roles::text[])
                AND (coalesce(p.qual, '') ~ '(company-assets|company-logos|project-photos|project-files|private-files)')) THEN
    RAISE EXCEPTION 'A policy still lets everyone read a bucket listing. Nothing was changed.';
  END IF;
  FOR r IN
    SELECT p.policyname FROM pg_policies p
     WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       AND (coalesce(p.qual, '') ~ '(company-assets|company-logos)' OR coalesce(p.with_check, '') ~ '(company-assets|company-logos)')
       AND p.policyname NOT IN ('company-assets admin write', 'company-assets admin update', 'company-assets admin delete', 'company-logos admin insert', 'company-logos admin update', 'company-logos admin delete')
  LOOP
    RAISE EXCEPTION 'Policy "%" still lets someone other than a director or admin write to company-assets / company-logos. Nothing was changed.', r.policyname;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname LIKE 'private-files access %') <> 4 THEN
    RAISE EXCEPTION 'The private-files policies are not all in place. Nothing was changed.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
