-- =====================================================================
-- Staff: government ID (front and back), like workers - Magnus Boy's System
--
-- Settings → Records → Staff → Edit Details can now scan a staff member's government ID (front and back, read together by the
-- AI) and keep both pictures, the ID number, ID type, address and date of birth.
--   staff_id_documents: one row per staff member (user_profiles). Kept apart from user_profiles because colleagues can read
--   parts of user_profiles; this table is not readable by them.
--   The pictures are in the private-files bucket under <company>/workers/ids/ (the ID-scan folder): only director, admin and
--   secretary can open them.
-- Who: read: the staff member themself, or a director / admin / secretary of the company. Add / change / remove: director,
--   admin, secretary of the company. Safe to run twice.
-- =====================================================================

begin;

create table if not exists public.staff_id_documents (
  user_id        uuid primary key references public.user_profiles(id) on delete cascade,
  company_id     uuid not null,
  id_number      text,
  id_type        text,
  address        text,
  date_of_birth  date,
  front_path     text,
  back_path      text,
  updated_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now()
);
create index if not exists staff_id_documents_company on public.staff_id_documents (company_id);

create or replace function public._staff_id_docs_office(p_company uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.company_id = p_company
                    and up.role in ('director', 'admin', 'secretary') and coalesce(up.status, 'active') = 'active')
$$;
revoke all on function public._staff_id_docs_office(uuid) from public, anon;
grant execute on function public._staff_id_docs_office(uuid) to authenticated;

-- the row's company is always the staff member's own company; pictures only from that company's ID folder
create or replace function public._staff_id_docs_check()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  select company_id into new.company_id from public.user_profiles where id = new.user_id;
  if new.company_id is null then raise exception 'Staff member not found.'; end if;
  if (new.front_path is not null and new.front_path not like new.company_id::text || '/workers/ids/%')
     or (new.back_path is not null and new.back_path not like new.company_id::text || '/workers/ids/%') then
    raise exception 'Those pictures are not in this company''s ID folder.';
  end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists staff_id_docs_check on public.staff_id_documents;
create trigger staff_id_docs_check before insert or update on public.staff_id_documents for each row execute function public._staff_id_docs_check();

alter table public.staff_id_documents enable row level security;
revoke all on public.staff_id_documents from public, anon, authenticated;
grant select, insert, update, delete on public.staff_id_documents to authenticated;

drop policy if exists "staff_id_docs read" on public.staff_id_documents;
create policy "staff_id_docs read" on public.staff_id_documents for select to authenticated
  using (user_id = auth.uid() or public._staff_id_docs_office(company_id));
drop policy if exists "staff_id_docs add" on public.staff_id_documents;
create policy "staff_id_docs add" on public.staff_id_documents for insert to authenticated
  with check (public._staff_id_docs_office((select up.company_id from public.user_profiles up where up.id = user_id)));
drop policy if exists "staff_id_docs change" on public.staff_id_documents;
create policy "staff_id_docs change" on public.staff_id_documents for update to authenticated
  using (public._staff_id_docs_office(company_id)) with check (public._staff_id_docs_office(company_id));
drop policy if exists "staff_id_docs remove" on public.staff_id_documents;
create policy "staff_id_docs remove" on public.staff_id_documents for delete to authenticated
  using (public._staff_id_docs_office(company_id));

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_hq_write_guard') then
    drop trigger if exists hq_write_guard on public.staff_id_documents;
    create trigger hq_write_guard before insert or update or delete on public.staff_id_documents for each row execute function public._hq_write_guard();
  end if;
end $$;

commit;
