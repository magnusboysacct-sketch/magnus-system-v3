-- =====================================================================
-- Project folders: "Client BOQ" and "Statements" - Magnus Boy's System
--
-- Inside each project, two folders for papers the client gives:
--   client_boq  the client's own BOQ / estimate (e.g. Food For The Poor's BOQ): PDF, picture, Excel or Word.
--   statement   the client's payment statements, each with its date and (optional) amount.
-- project_files: one row per file. The file itself is in the private-files bucket:
--   client_boq  <company>/project-files/<project>/client-boq/<time>_<name>       (any staff of the company can open it)
--   statement   <company>/finance/project-statements/<project>/<time>_<name>     (money papers: only people with full finance access)
-- Who sees / adds:
--   Client BOQ:  director, admin, estimator, supervisor, office user, site user, secretary of the company.
--   Statements:  only people with full finance access (finance_access_level = 'full'), the same rule as the files themselves.
--   Remove a file / change its date, amount or note: director, admin, or the person who added it (and who can still see it).
-- The client portal does NOT show these. The private-files bucket now also takes Excel, Word and CSV files.
-- Safe to run twice.
-- =====================================================================

begin;

create table if not exists public.project_files (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  project_id  uuid not null references public.projects(id) on delete cascade,
  folder      text not null check (folder in ('client_boq', 'statement')),
  file_name   text not null,
  file_path   text not null,
  mime_type   text,
  size_bytes  bigint,
  doc_date    date,
  amount      numeric(14,2),
  note        text,
  uploaded_by uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create unique index if not exists project_files_path on public.project_files (file_path);
create index if not exists project_files_project on public.project_files (project_id, folder, doc_date desc);

-- may the signed-in user see / add files of this folder in this company?
create or replace function public._project_files_can(p_company uuid, p_folder text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_profiles up
     where up.id = auth.uid() and up.company_id = p_company and coalesce(up.status, 'active') = 'active'
       and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary')
       and (p_folder = 'client_boq' or coalesce(up.finance_access_level, 'none') = 'full'))
$$;
revoke all on function public._project_files_can(uuid, text) from public, anon;
grant execute on function public._project_files_can(uuid, text) to authenticated;

create or replace function public._project_files_can_change(p_company uuid, p_folder text, p_uploader uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public._project_files_can(p_company, p_folder) and (
    p_uploader = auth.uid()
    or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.company_id = p_company and up.role in ('director', 'admin')))
$$;
revoke all on function public._project_files_can_change(uuid, text, uuid) from public, anon;
grant execute on function public._project_files_can_change(uuid, text, uuid) to authenticated;

alter table public.project_files enable row level security;
revoke all on public.project_files from public, anon, authenticated;
grant select, insert, delete on public.project_files to authenticated;
grant update (doc_date, amount, note) on public.project_files to authenticated;

drop policy if exists "project_files read" on public.project_files;
create policy "project_files read" on public.project_files for select to authenticated
  using (public._project_files_can(company_id, folder));
drop policy if exists "project_files add" on public.project_files;
create policy "project_files add" on public.project_files for insert to authenticated
  with check (
    public._project_files_can(company_id, folder)
    and uploaded_by = auth.uid()
    and exists (select 1 from public.projects p where p.id = project_id and p.company_id = project_files.company_id)
    and file_path like case folder
          when 'client_boq' then company_id::text || '/project-files/' || project_id::text || '/client-boq/%'
          else company_id::text || '/finance/project-statements/' || project_id::text || '/%' end);
drop policy if exists "project_files change" on public.project_files;
create policy "project_files change" on public.project_files for update to authenticated
  using (public._project_files_can_change(company_id, folder, uploaded_by))
  with check (public._project_files_can_change(company_id, folder, uploaded_by));
drop policy if exists "project_files remove" on public.project_files;
create policy "project_files remove" on public.project_files for delete to authenticated
  using (public._project_files_can_change(company_id, folder, uploaded_by));

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_hq_write_guard') then
    drop trigger if exists hq_write_guard on public.project_files;
    create trigger hq_write_guard before insert or update or delete on public.project_files for each row execute function public._hq_write_guard();
  end if;
end $$;

-- the bucket: also Excel, Word and CSV (a client's BOQ is often a spreadsheet)
update storage.buckets
   set allowed_mime_types = (select array_agg(distinct m) from unnest(allowed_mime_types || array[
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/csv']) m)
 where id = 'private-files' and allowed_mime_types is not null
   and not (allowed_mime_types @> array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/csv']);

commit;
