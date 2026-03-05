/*
  # Base Schema - Clients and Projects

  1. New Tables
    - `clients`
      - `id` (uuid, primary key)
      - `name` (text, required)
      - `contact_name` (text)
      - `phone` (text)
      - `email` (text)
      - `address` (text)
      - `notes` (text)
      - `status` (text, active/inactive)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `projects`
      - `id` (uuid, primary key)
      - `client_id` (uuid, foreign key to clients)
      - `name` (text, required)
      - `site_address` (text)
      - `status` (text, planning/active/on_hold/completed/cancelled)
      - `start_date` (date)
      - `end_date` (date)
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Functions
    - `set_updated_at()` - Trigger function to auto-update updated_at timestamps
*/

create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  site_address text,
  status text not null default 'planning'
    check (status in ('planning','active','on_hold','completed','cancelled')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.projects enable row level security;

drop policy if exists clients_auth_all on public.clients;
create policy clients_auth_all
on public.clients
for all
to authenticated
using (true)
with check (true);

drop policy if exists projects_auth_all on public.projects;
create policy projects_auth_all
on public.projects
for all
to authenticated
using (true)
with check (true);
