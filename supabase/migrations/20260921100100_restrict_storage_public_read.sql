-- Limit public storage reads to the four public buckets: company-assets, company-logos, project-files and project-photos.
BEGIN;

-- Public read is limited to the four buckets that are meant to be public.
-- Receipts and company documents stay reachable only through their own staff rules.
DROP POLICY IF EXISTS "Public read" ON storage.objects;
CREATE POLICY "Public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id IN ('company-assets','company-logos','project-files','project-photos'));

COMMIT;
