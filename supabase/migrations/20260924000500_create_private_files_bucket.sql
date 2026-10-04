-- Create the private-files bucket (not public) with company-scoped policies: the first folder of every object path
-- must be the caller's company id. Applied directly to the live database; this file version-controls it.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('private-files', 'private-files', false, 10485760,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif','application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "private-files company select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'private-files' AND (storage.foldername(name))[1] =
  (SELECT company_id::text FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "private-files company insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'private-files' AND (storage.foldername(name))[1] =
  (SELECT company_id::text FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "private-files company update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'private-files' AND (storage.foldername(name))[1] =
  (SELECT company_id::text FROM public.user_profiles WHERE id = auth.uid() LIMIT 1))
WITH CHECK (bucket_id = 'private-files' AND (storage.foldername(name))[1] =
  (SELECT company_id::text FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "private-files company delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'private-files' AND (storage.foldername(name))[1] =
  (SELECT company_id::text FROM public.user_profiles WHERE id = auth.uid() LIMIT 1));

COMMIT;
