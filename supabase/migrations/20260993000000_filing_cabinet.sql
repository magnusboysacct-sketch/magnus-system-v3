-- =====================================================================
-- Documents: the company filing cabinet - Magnus Boy's System
--
-- A place to keep ANY document of the company, like the filing cabinet in the office:
--   doc_drawers  the drawers (folders) the company makes: "Contracts", "Insurance", "Tax"... A drawer can be PRIVATE.
--   doc_files    one row per document: its drawer (none = "Not filed yet"), an optional job (project), title, date, note.
-- The files are in the private-files bucket:
--   normal drawer   <company>/documents/<random>_<name>           (any staff of the company can open it)
--   private drawer  <company>/finance/documents/<random>_<name>   (only people with full finance access, the same rule as the bucket)
--   doc_files.is_private is worked out from that path, so a private file stays private even if its drawer is removed.
-- Who:
--   See / add documents: director, admin, estimator, supervisor, office user, site user, secretary of the company.
--     Private ones: only with full finance access (finance_access_level = 'full').
--   Change a document (title, drawer, job, date, note): the person who added it, or director, admin, secretary, office user.
--   Remove a document: the person who added it, or director / admin.
--   Make / rename drawers: director, admin, secretary, office user. Remove a drawer: director / admin (its documents go to
--   "Not filed yet"). A drawer with documents in it can't be switched between private and normal (move the documents first).
-- The bucket: up to 25 MB a file, and more kinds of files (Word, Excel, PowerPoint, text, zip, drawings...). Anything the page
-- does not know is saved as a plain download (application/octet-stream), never shown as a web page.
-- Safe to run twice.
-- =====================================================================

begin;

create table if not exists public.doc_drawers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  name        text not null check (length(btrim(name)) between 1 and 60),
  is_private  boolean not null default false,
  sort        integer not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create unique index if not exists doc_drawers_name on public.doc_drawers (company_id, lower(btrim(name)));

create table if not exists public.doc_files (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  drawer_id   uuid references public.doc_drawers(id) on delete set null,
  project_id  uuid references public.projects(id) on delete set null,
  title       text not null check (length(btrim(title)) between 1 and 200),
  file_name   text not null,
  file_path   text not null,
  is_private  boolean generated always as (file_path like '%/finance/documents/%') stored,
  mime_type   text,
  size_bytes  bigint,
  doc_date    date,
  note        text,
  uploaded_by uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists doc_files_path on public.doc_files (file_path);
create index if not exists doc_files_company on public.doc_files (company_id, drawer_id, created_at desc);
create index if not exists doc_files_project on public.doc_files (project_id) where project_id is not null;

-- ── who may do what ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public._docs_role(p_company uuid)
returns text language sql stable security definer set search_path = public, pg_temp
as $$
  select up.role from public.user_profiles up
   where up.id = auth.uid() and up.company_id = p_company and coalesce(up.status, 'active') = 'active'
     and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary')
$$;
create or replace function public._docs_private_ok()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select up.finance_access_level = 'full' from public.user_profiles up where up.id = auth.uid()), false) $$;
revoke all on function public._docs_role(uuid), public._docs_private_ok() from public, anon;
grant execute on function public._docs_role(uuid), public._docs_private_ok() to authenticated;

-- keep each document's file path in step with its drawer (private drawer = private path), the company, and updated_at
create or replace function public._doc_files_check()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare d record; v_private boolean := new.file_path like '%/finance/documents/%';
begin
  if new.file_path not like new.company_id::text || '/documents/%' and new.file_path not like new.company_id::text || '/finance/documents/%' then
    raise exception 'That file is not in this company''s documents.';
  end if;
  if new.drawer_id is not null then
    select company_id, is_private into d from public.doc_drawers where id = new.drawer_id;
    if not found or d.company_id <> new.company_id then raise exception 'That drawer is not this company''s.'; end if;
    if d.is_private <> v_private then raise exception 'Move the file first (private and normal drawers keep files in different places).'; end if;
  end if;
  if new.project_id is not null and not exists (select 1 from public.projects p where p.id = new.project_id and p.company_id = new.company_id) then
    raise exception 'That job is not this company''s.';
  end if;
  if tg_op = 'UPDATE' then
    if new.company_id <> old.company_id or new.uploaded_by is distinct from old.uploaded_by then raise exception 'That can''t be changed.'; end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists doc_files_check on public.doc_files;
create trigger doc_files_check before insert or update on public.doc_files for each row execute function public._doc_files_check();

create or replace function public._doc_drawers_check()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.company_id <> old.company_id then raise exception 'That can''t be changed.'; end if;
    if new.is_private <> old.is_private and exists (select 1 from public.doc_files f where f.drawer_id = old.id) then
      raise exception 'Empty the drawer first: private and normal drawers keep files in different places.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists doc_drawers_check on public.doc_drawers;
create trigger doc_drawers_check before update on public.doc_drawers for each row execute function public._doc_drawers_check();

-- ── row-level security ──────────────────────────────────────────────────────────────────────────────────
alter table public.doc_drawers enable row level security;
alter table public.doc_files enable row level security;
revoke all on public.doc_drawers, public.doc_files from public, anon, authenticated;
grant select, insert, delete on public.doc_drawers, public.doc_files to authenticated;
grant update (name, is_private, sort) on public.doc_drawers to authenticated;
grant update (title, drawer_id, project_id, doc_date, note, file_path) on public.doc_files to authenticated;

drop policy if exists "doc_drawers read" on public.doc_drawers;
create policy "doc_drawers read" on public.doc_drawers for select to authenticated
  using (public._docs_role(company_id) is not null and (not is_private or public._docs_private_ok()));
drop policy if exists "doc_drawers add" on public.doc_drawers;
create policy "doc_drawers add" on public.doc_drawers for insert to authenticated
  with check (public._docs_role(company_id) in ('director', 'admin', 'secretary', 'office_user') and (not is_private or public._docs_private_ok()));
drop policy if exists "doc_drawers change" on public.doc_drawers;
create policy "doc_drawers change" on public.doc_drawers for update to authenticated
  using (public._docs_role(company_id) in ('director', 'admin', 'secretary', 'office_user') and (not is_private or public._docs_private_ok()))
  with check (public._docs_role(company_id) in ('director', 'admin', 'secretary', 'office_user') and (not is_private or public._docs_private_ok()));
drop policy if exists "doc_drawers remove" on public.doc_drawers;
create policy "doc_drawers remove" on public.doc_drawers for delete to authenticated
  using (public._docs_role(company_id) in ('director', 'admin') and (not is_private or public._docs_private_ok()));

drop policy if exists "doc_files read" on public.doc_files;
create policy "doc_files read" on public.doc_files for select to authenticated
  using (public._docs_role(company_id) is not null and (not is_private or public._docs_private_ok()));
drop policy if exists "doc_files add" on public.doc_files;
create policy "doc_files add" on public.doc_files for insert to authenticated
  with check (public._docs_role(company_id) is not null and uploaded_by = auth.uid()
              and (file_path not like '%/finance/documents/%' or public._docs_private_ok()));
drop policy if exists "doc_files change" on public.doc_files;
create policy "doc_files change" on public.doc_files for update to authenticated
  using (public._docs_role(company_id) is not null and (not is_private or public._docs_private_ok())
         and (uploaded_by = auth.uid() or public._docs_role(company_id) in ('director', 'admin', 'secretary', 'office_user')))
  with check (public._docs_role(company_id) is not null and (file_path not like '%/finance/documents/%' or public._docs_private_ok()));
drop policy if exists "doc_files remove" on public.doc_files;
create policy "doc_files remove" on public.doc_files for delete to authenticated
  using (public._docs_role(company_id) is not null and (not is_private or public._docs_private_ok())
         and (uploaded_by = auth.uid() or public._docs_role(company_id) in ('director', 'admin')));

do $$ declare t text; begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_hq_write_guard') then
    foreach t in array array['doc_drawers', 'doc_files'] loop
      execute format('drop trigger if exists hq_write_guard on public.%I', t);
      execute format('create trigger hq_write_guard before insert or update or delete on public.%I for each row execute function public._hq_write_guard()', t);
    end loop;
  end if;
end $$;

-- ── the bucket: bigger files and more kinds ─────────────────────────────────────────────────────────────
update storage.buckets
   set allowed_mime_types = (select array_agg(distinct m) from unnest(allowed_mime_types || array[
         'application/octet-stream', 'text/plain', 'text/csv', 'application/rtf', 'application/zip', 'application/x-zip-compressed',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint',
         'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
         'image/gif', 'image/bmp', 'image/tiff', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp4']) m)
 where id = 'private-files' and allowed_mime_types is not null;
update storage.buckets set file_size_limit = 26214400 where id = 'private-files' and file_size_limit is not null and file_size_limit < 26214400;

commit;
