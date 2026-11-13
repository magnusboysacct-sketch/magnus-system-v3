-- =====================================================================
-- 20261006000000_project_reader.sql
-- 🤖 Project Reader (step 1): Claude reads a project's drawings, BOQ and contract, explains the job in plain words,
-- points out problems (quantities that don't match the drawing, typos, items with no quantity, wrong names / dates),
-- answers questions, and the app can read it out loud.
--
--   * project_files gets a third folder, 'drawing' ("Drawings & contract"), seen by the same people as Client BOQ.
--     The files go under <company>/project-files/<project>/drawings/ in the private-files bucket.
--   * project_ai_reads: every reading is saved with the project (what was read, the question, the result), so the same
--     documents are not paid for twice. Written ONLY by the magnus-ai function (server side, after it checked the
--     caller's company and project); read by the people who may see the project's Client BOQ folder.
-- Safe to run twice.
-- =====================================================================

begin;

-- 1. the "Drawings & contract" folder
alter table public.project_files drop constraint if exists project_files_folder_check;
alter table public.project_files add constraint project_files_folder_check check (folder in ('client_boq', 'statement', 'drawing'));

-- _project_files_can: from 20260995000000_accountant_role.sql, with 'drawing' seen like 'client_boq'
create or replace function public._project_files_can(p_company uuid, p_folder text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_profiles up
     where up.id = auth.uid() and up.company_id = p_company and coalesce(up.status, 'active') = 'active'
       and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'accountant', 'site_user', 'secretary')
       and (p_folder in ('client_boq', 'drawing') or coalesce(up.finance_access_level, 'none') = 'full'))
$$;
revoke all on function public._project_files_can(uuid, text) from public, anon;
grant execute on function public._project_files_can(uuid, text) to authenticated;

-- 2. saved readings
create table if not exists public.project_ai_reads (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  project_id  uuid not null references public.projects(id) on delete cascade,
  file_ids    uuid[] not null default '{}',
  file_names  text[] not null default '{}',
  question    text,
  result      jsonb not null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists project_ai_reads_project on public.project_ai_reads (project_id, created_at desc);

alter table public.project_ai_reads enable row level security;
revoke all on public.project_ai_reads from public, anon, authenticated;
grant select, delete on public.project_ai_reads to authenticated;

drop policy if exists "project_ai_reads read" on public.project_ai_reads;
create policy "project_ai_reads read" on public.project_ai_reads for select to authenticated
  using (public._project_files_can(company_id, 'client_boq'));
drop policy if exists "project_ai_reads remove" on public.project_ai_reads;
create policy "project_ai_reads remove" on public.project_ai_reads for delete to authenticated
  using (public._project_files_can(company_id, 'client_boq')
         and (created_by = auth.uid() or exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.company_id = project_ai_reads.company_id and up.role in ('director', 'admin'))));

commit;
