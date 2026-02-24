-- Estimates schema (compatible)

create table if not exists public.estimate_headers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'Estimate',
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  version int not null default 1,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_headers_project_id_idx
on public.estimate_headers(project_id);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimate_headers(id) on delete cascade,
  line_no int not null default 1,
  item_type text not null default 'labor'
    check (item_type in ('labor','material','equipment','other')),
  category text null,
  item text not null default '',
  description text null,
  unit text null,
  qty numeric not null default 0,
  rate numeric not null default 0,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimate_items_estimate_id_idx
on public.estimate_items(estimate_id);

alter table public.estimate_headers enable row level security;
alter table public.estimate_items enable row level security;

drop policy if exists estimate_headers_auth_all on public.estimate_headers;
create policy estimate_headers_auth_all
on public.estimate_headers
for all
to authenticated
using (true)
with check (true);

drop policy if exists estimate_items_auth_all on public.estimate_items;
create policy estimate_items_auth_all
on public.estimate_items
for all
to authenticated
using (true)
with check (true);
