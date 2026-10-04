-- Remove the unrestricted "Allow uploads" storage policy. Applied directly to the live database; this file
-- version-controls it.
BEGIN;

DROP POLICY IF EXISTS "Allow uploads" ON storage.objects;

COMMIT;
