-- =====================================================
-- BOQ versioning + approval constraints
-- =====================================================

-- 1) Ensure one BOQ version number per project per company
create unique index if not exists boq_unique_version_per_project
on public.boq_headers(company_id, project_id, version);

-- 2) Ensure only ONE approved BOQ per project per company
-- (partial unique index)
create unique index if not exists boq_only_one_approved_per_project
on public.boq_headers(company_id, project_id)
where status = 'approved';

-- 3) Simple status check (optional safety)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'boq_headers_status_check'
  ) then
    alter table public.boq_headers
    add constraint boq_headers_status_check
    check (status in ('draft','approved'));
  end if;
end $$;
