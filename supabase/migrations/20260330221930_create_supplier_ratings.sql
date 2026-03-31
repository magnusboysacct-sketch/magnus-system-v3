create table if not exists public.supplier_ratings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  rating integer not null,
  review_text text null,
  created_at timestamptz not null default now(),
  constraint supplier_ratings_rating_check check (rating between 1 and 5)
);

create index if not exists idx_supplier_ratings_company_id
  on public.supplier_ratings (company_id);

create index if not exists idx_supplier_ratings_supplier_id
  on public.supplier_ratings (supplier_id);

create index if not exists idx_supplier_ratings_company_supplier
  on public.supplier_ratings (company_id, supplier_id);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'suppliers'
  ) then
    if not exists (
      select 1
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'supplier_ratings'
        and constraint_name = 'supplier_ratings_supplier_id_fkey'
    ) then
      alter table public.supplier_ratings
        add constraint supplier_ratings_supplier_id_fkey
        foreign key (supplier_id)
        references public.suppliers(id)
        on delete cascade;
    end if;
  end if;
end $$;