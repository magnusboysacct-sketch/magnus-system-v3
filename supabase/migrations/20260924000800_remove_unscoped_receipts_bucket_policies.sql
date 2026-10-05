-- Remove the unscoped receipts-bucket policies: each only checked bucket_id, so any logged-in user from any company could
-- read, update or delete every receipt. Nothing in the app uses the "receipts" bucket (receipts are uploaded to private-files
-- under <company id>/receipts/), so with these gone only the service role can reach it. Applied directly to the live database;
-- this file version-controls it.
BEGIN;

DROP POLICY IF EXISTS "Company members can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Company members can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Company members can update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete receipts" ON storage.objects;

COMMIT;
