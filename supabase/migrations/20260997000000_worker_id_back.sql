-- =====================================================================
-- Worker ID: the BACK of the card too - Magnus Boy's System
--
-- The ID scanner now takes a picture of the front AND the back (some Jamaican IDs carry the address on the back) and reads
-- both together. workers.id_back_photo_url keeps the back picture, the same way as id_photo_url keeps the front: the PATH in
-- the private-files bucket under <company>/workers/ids/ (an ID scan: only director, admin and secretary can open it).
-- workers has column-level grants, so the new column is granted like the others. Safe to run twice.
-- =====================================================================

begin;

alter table public.workers add column if not exists id_back_photo_url text;
grant select (id_back_photo_url), insert (id_back_photo_url), update (id_back_photo_url) on public.workers to authenticated;

commit;
