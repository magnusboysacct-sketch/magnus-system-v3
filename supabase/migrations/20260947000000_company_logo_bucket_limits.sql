-- Company logo uploads: who may write to the company-logos bucket, and what may be uploaded.
--
-- WHO. The storage policies that mention the company-logos bucket (all on storage.objects) were:
--     "Public read"                   SELECT  public       bucket in (company-assets, company-logos, project-photos)      -> kept as it is
--     "company logos public read"     SELECT  public       bucket = company-logos                                         -> kept as it is
--     "company-assets company write"  INSERT  authenticated   bucket in (company-assets, company-logos) AND first folder = the caller's company id
--     "company-assets company update" UPDATE   "
--     "company-assets company delete" DELETE   "
--   i.e. ANY signed-in member of a company (a site user, a supervisor, a secretary...) could add, replace or delete that company's logo files. After this migration
--   only a director or admin of the company whose folder (<companyId>/...) is being written can insert, update or delete in company-logos. Reading stays public
--   (the logo appears on public pages, in emails and in link previews).
--   Those three write policies are shared with the company-assets bucket (signature, watermark), so they are re-created for company-assets ONLY, with exactly the
--   condition they had for it (any member of the company, own folder): the behaviour of company-assets and of every other bucket is unchanged.
--
-- WHAT. The bucket refuses files over 5 MB and anything but PNG and JPG (new uploads only; logos already stored are not touched). WEBP is not accepted (WhatsApp
--   link previews cannot draw it). SVG is not accepted either, for now: the logo files are public, and nothing on the server can look inside an uploaded file to
--   check an SVG is free of scripts (a storage policy sees only the file name, not its content), so the browser's check alone is not enough. It can be added later
--   by uploading through an edge function that sanitises the SVG.
--
-- Safety: the migration stops, changing nothing, if the bucket is missing, if there is a policy that mentions company-logos which this migration does not know
--   about, or if there is a write policy on storage.objects that names no bucket at all (it would reach company-logos too).

BEGIN;

-- ── 1. Check what is there ──────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'company-logos') THEN
    RAISE EXCEPTION 'Storage bucket company-logos was not found. Nothing was changed.';
  END IF;

  FOR r IN
    SELECT p.policyname FROM pg_policies p
     WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
       AND (coalesce(p.qual, '') ILIKE '%company-logos%' OR coalesce(p.with_check, '') ILIKE '%company-logos%')
       AND p.policyname NOT IN ('Public read', 'company logos public read',
                                'company-assets company write', 'company-assets company update', 'company-assets company delete',
                                'company-logos admin insert', 'company-logos admin update', 'company-logos admin delete')
  LOOP
    RAISE EXCEPTION 'Unexpected storage policy "%" mentions company-logos: it is not handled by this migration. Nothing was changed.', r.policyname;
  END LOOP;

  FOR r IN
    SELECT p.policyname FROM pg_policies p
     WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       AND coalesce(p.qual, '') NOT ILIKE '%bucket_id%' AND coalesce(p.with_check, '') NOT ILIKE '%bucket_id%'
  LOOP
    RAISE EXCEPTION 'Storage policy "%" can write to any bucket (it names no bucket), including company-logos. Nothing was changed.', r.policyname;
  END LOOP;
END $$;

-- ── 2. company-assets keeps exactly what it had (the old policies, narrowed to that bucket) ───────────────────────────────────
DROP POLICY IF EXISTS "company-assets company write" ON storage.objects;
DROP POLICY IF EXISTS "company-assets company update" ON storage.objects;
DROP POLICY IF EXISTS "company-assets company delete" ON storage.objects;

CREATE POLICY "company-assets company write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets'
              AND (storage.foldername(name))[1] = (SELECT (up.company_id)::text FROM public.user_profiles up WHERE up.id = auth.uid() LIMIT 1));
CREATE POLICY "company-assets company update" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'company-assets'
              AND (storage.foldername(name))[1] = (SELECT (up.company_id)::text FROM public.user_profiles up WHERE up.id = auth.uid() LIMIT 1))
  WITH CHECK (bucket_id = 'company-assets'
              AND (storage.foldername(name))[1] = (SELECT (up.company_id)::text FROM public.user_profiles up WHERE up.id = auth.uid() LIMIT 1));
CREATE POLICY "company-assets company delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets'
         AND (storage.foldername(name))[1] = (SELECT (up.company_id)::text FROM public.user_profiles up WHERE up.id = auth.uid() LIMIT 1));

-- ── 3. company-logos: only a director or admin of the company whose folder it is ────────────────────────────────────────────
DROP POLICY IF EXISTS "company-logos admin insert" ON storage.objects;
DROP POLICY IF EXISTS "company-logos admin update" ON storage.objects;
DROP POLICY IF EXISTS "company-logos admin delete" ON storage.objects;

CREATE POLICY "company-logos admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos'
              AND EXISTS (SELECT 1 FROM public.user_profiles up
                           WHERE up.id = auth.uid() AND up.company_id::text = (storage.foldername(name))[1] AND lower(up.role) IN ('director', 'admin')));
CREATE POLICY "company-logos admin update" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'company-logos'
              AND EXISTS (SELECT 1 FROM public.user_profiles up
                           WHERE up.id = auth.uid() AND up.company_id::text = (storage.foldername(name))[1] AND lower(up.role) IN ('director', 'admin')))
  WITH CHECK (bucket_id = 'company-logos'
              AND EXISTS (SELECT 1 FROM public.user_profiles up
                           WHERE up.id = auth.uid() AND up.company_id::text = (storage.foldername(name))[1] AND lower(up.role) IN ('director', 'admin')));
CREATE POLICY "company-logos admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos'
         AND EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.id = auth.uid() AND up.company_id::text = (storage.foldername(name))[1] AND lower(up.role) IN ('director', 'admin')));

-- ── 4. What may be uploaded ─────────────────────────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg']
 WHERE id = 'company-logos';

-- ── 5. Check the result: company-logos is public to read and writable only by the three policies above ─────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.policyname FROM pg_policies p
     WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       AND (coalesce(p.qual, '') ILIKE '%company-logos%' OR coalesce(p.with_check, '') ILIKE '%company-logos%')
       AND p.policyname NOT IN ('company-logos admin insert', 'company-logos admin update', 'company-logos admin delete')
  LOOP
    RAISE EXCEPTION 'Policy "%" still lets someone other than a director or admin write to company-logos. Nothing was changed.', r.policyname;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'SELECT'
         AND p.policyname IN ('Public read', 'company logos public read')) < 2 THEN
    RAISE EXCEPTION 'The public read policies for company-logos are missing. Nothing was changed.';
  END IF;
END $$;

COMMIT;
