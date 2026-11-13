-- =====================================================================
-- 20261007000000_project_reader_upload_fix.sql
-- Fix for 20261006000000: saving a file in the new "Drawings & contract" folder was refused ("new row violates row-level
-- security policy for table project_files"). The insert rule only knew the Client BOQ and Statements paths. It now also
-- accepts <company>/project-files/<project>/drawings/ for the 'drawing' folder. Everything else in the rule is unchanged.
-- Safe to run twice.
-- =====================================================================

begin;

drop policy if exists "project_files add" on public.project_files;
create policy "project_files add" on public.project_files for insert to authenticated
  with check (
    public._project_files_can(company_id, folder)
    and uploaded_by = auth.uid()
    and exists (select 1 from public.projects p where p.id = project_id and p.company_id = project_files.company_id)
    and file_path like case folder
          when 'client_boq' then company_id::text || '/project-files/' || project_id::text || '/client-boq/%'
          when 'drawing'    then company_id::text || '/project-files/' || project_id::text || '/drawings/%'
          else company_id::text || '/finance/project-statements/' || project_id::text || '/%' end);

commit;
