-- Company logo uploads: the storage bucket itself now refuses anything but PNG, JPG, WEBP and SVG, and files over 5 MB.
--
-- Until now the browser's file picker was the only limit: the company-logos bucket had no size limit and no mime-type restriction, so any file of any size could
-- be uploaded to it by calling the storage API directly. (Settings -> Company already checks the same rules, shows the logo's pixel size and warns about a small
-- logo; this makes the server enforce them.)
--
-- Logos already stored are not touched (the limits apply to new uploads only), and the bucket stays public (logos appear on public pages and in emails).
-- Only the company-logos bucket changes; nothing else uses it (the logo is the only thing uploaded there).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'company-logos') THEN
    RAISE EXCEPTION 'Storage bucket company-logos was not found. Nothing was changed.';
  END IF;
END $$;

UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
 WHERE id = 'company-logos';

COMMIT;
