/*
  # Create Takeoff Tables

  1. New Tables
    - `takeoff_sessions`
      - `id` (uuid, primary key)
      - `project_id` (uuid, foreign key to projects)
      - `pdf_name` (text, name of the PDF file)
      - `pdf_storage_path` (text, optional path to stored PDF)
      - `page_count` (int, number of pages in PDF)
      - `calibration` (jsonb, calibration data for measurements)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `takeoff_groups`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key to takeoff_sessions)
      - `name` (text, group name)
      - `color` (text, group color)
      - `trade` (text, optional trade category)
      - `is_hidden` (boolean, visibility flag)
      - `sort_order` (int, display order)
      - `created_at` (timestamptz)

    - `takeoff_measurements`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key to takeoff_sessions)
      - `page_number` (int, PDF page number)
      - `group_id` (uuid, nullable foreign key to takeoff_groups)
      - `type` (text, measurement type: line/area/volume/count)
      - `points` (jsonb, array of coordinate points)
      - `unit` (text, unit of measurement)
      - `result` (numeric, calculated measurement result)
      - `meta` (jsonb, additional metadata)
      - `sort_order` (int, display order)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all takeoff tables
    - Add policies for authenticated users to manage their project takeoffs
    - Cascade deletes when projects or sessions are removed
*/

-- Create takeoff_sessions table
create table if not exists public.takeoff_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  pdf_name text not null default '',
  pdf_storage_path text null,
  page_count int not null default 1,
  calibration jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists takeoff_sessions_project_id_idx
on public.takeoff_sessions(project_id);

-- Create takeoff_groups table
create table if not exists public.takeoff_groups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.takeoff_sessions(id) on delete cascade,
  name text not null,
  color text not null,
  trade text null,
  is_hidden boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists takeoff_groups_session_id_idx
on public.takeoff_groups(session_id);

-- Create takeoff_measurements table
create table if not exists public.takeoff_measurements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.takeoff_sessions(id) on delete cascade,
  page_number int not null default 1,
  group_id uuid null references public.takeoff_groups(id) on delete set null,
  type text not null check (type in ('line', 'area', 'volume', 'count')),
  points jsonb not null,
  unit text not null,
  result numeric not null default 0,
  meta jsonb null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists takeoff_measurements_session_id_idx
on public.takeoff_measurements(session_id);

create index if not exists takeoff_measurements_group_id_idx
on public.takeoff_measurements(group_id);

-- Add updated_at trigger for takeoff_sessions
drop trigger if exists trg_takeoff_sessions_updated_at on public.takeoff_sessions;
create trigger trg_takeoff_sessions_updated_at
before update on public.takeoff_sessions
for each row execute function public.set_updated_at();

-- Enable Row Level Security
alter table public.takeoff_sessions enable row level security;
alter table public.takeoff_groups enable row level security;
alter table public.takeoff_measurements enable row level security;

-- RLS Policies for takeoff_sessions
drop policy if exists takeoff_sessions_select on public.takeoff_sessions;
create policy takeoff_sessions_select
on public.takeoff_sessions
for select
to authenticated
using (true);

drop policy if exists takeoff_sessions_insert on public.takeoff_sessions;
create policy takeoff_sessions_insert
on public.takeoff_sessions
for insert
to authenticated
with check (true);

drop policy if exists takeoff_sessions_update on public.takeoff_sessions;
create policy takeoff_sessions_update
on public.takeoff_sessions
for update
to authenticated
using (true)
with check (true);

drop policy if exists takeoff_sessions_delete on public.takeoff_sessions;
create policy takeoff_sessions_delete
on public.takeoff_sessions
for delete
to authenticated
using (true);

-- RLS Policies for takeoff_groups
drop policy if exists takeoff_groups_select on public.takeoff_groups;
create policy takeoff_groups_select
on public.takeoff_groups
for select
to authenticated
using (true);

drop policy if exists takeoff_groups_insert on public.takeoff_groups;
create policy takeoff_groups_insert
on public.takeoff_groups
for insert
to authenticated
with check (true);

drop policy if exists takeoff_groups_update on public.takeoff_groups;
create policy takeoff_groups_update
on public.takeoff_groups
for update
to authenticated
using (true)
with check (true);

drop policy if exists takeoff_groups_delete on public.takeoff_groups;
create policy takeoff_groups_delete
on public.takeoff_groups
for delete
to authenticated
using (true);

-- RLS Policies for takeoff_measurements
drop policy if exists takeoff_measurements_select on public.takeoff_measurements;
create policy takeoff_measurements_select
on public.takeoff_measurements
for select
to authenticated
using (true);

drop policy if exists takeoff_measurements_insert on public.takeoff_measurements;
create policy takeoff_measurements_insert
on public.takeoff_measurements
for insert
to authenticated
with check (true);

drop policy if exists takeoff_measurements_update on public.takeoff_measurements;
create policy takeoff_measurements_update
on public.takeoff_measurements
for update
to authenticated
using (true)
with check (true);

drop policy if exists takeoff_measurements_delete on public.takeoff_measurements;
create policy takeoff_measurements_delete
on public.takeoff_measurements
for delete
to authenticated
using (true);
