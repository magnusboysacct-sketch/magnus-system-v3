/*
  # Phase 1 Organization: Folders, Tags, and Measurement Links
  
  1. New Tables
    - `takeoff_folders`
      - Hierarchical folder structure for organizing measurements
      - Links to categories for auto-classification
      - Supports discipline, level, zone, system organization
      
    - `takeoff_tags`
      - Reusable project tags for measurements
      - Supports quick classification and search
      - Color-coded for visual organization
      
    - `takeoff_measurement_tags`
      - Many-to-many link between measurements and tags
      - Enables multi-dimensional tagging
      
  2. Enhanced takeoff_measurements fields
    - Add folder_id, category_id references
    - Add tag support through measurement_tags table
    
  3. Integration points
    - Load folders/tags in TakeoffPage
    - Safe assignment in measurement save flow
    - Preserve existing UI/UX
*/

-- Create takeoff_folders table
create table if not exists public.takeoff_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid null references public.takeoff_folders(id) on delete cascade,
  category_id uuid null references public.master_categories(id),
  folder_name text not null,
  folder_code text null,
  folder_type text not null default 'standard',
  path_text text not null,
  depth integer not null default 0,
  sort_order integer not null default 0,
  color_token text null,
  icon_token text null,
  is_system_generated boolean not null default false,
  is_locked boolean not null default false,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create indexes for folders
create index if not exists takeoff_folders_project_id_idx on public.takeoff_folders(project_id);
create index if not exists takeoff_folders_parent_id_idx on public.takeoff_folders(parent_id);
create index if not exists takeoff_folders_category_id_idx on public.takeoff_folders(category_id);

-- Create takeoff_tags table
create table if not exists public.takeoff_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  tag_name text not null,
  tag_group text null,
  color_token text null,
  description text null,
  is_system_generated boolean not null default false,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_takeoff_tags_project_tag_name
  on public.takeoff_tags (project_id, lower(tag_name));

-- Create indexes for tags
create index if not exists takeoff_tags_project_id_idx on public.takeoff_tags(project_id);
create index if not exists takeoff_tags_tag_group_idx on public.takeoff_tags(tag_group);

-- Create takeoff_measurement_tags junction table
create table if not exists public.takeoff_measurement_tags (
  id uuid primary key default gen_random_uuid(),
  measurement_id uuid not null references public.takeoff_measurements(id) on delete cascade,
  tag_id uuid not null references public.takeoff_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (measurement_id, tag_id)
);

-- Create indexes for measurement tags
create index if not exists takeoff_measurement_tags_measurement_id_idx on public.takeoff_measurement_tags(measurement_id);
create index if not exists takeoff_measurement_tags_tag_id_idx on public.takeoff_measurement_tags(tag_id);

-- Add organization fields to takeoff_measurements
do $$
begin
  -- Add folder_id if not exists
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'takeoff_measurements' and column_name = 'folder_id'
  ) then
    alter table public.takeoff_measurements 
    add column folder_id uuid null references public.takeoff_folders(id) on delete set null;
  end if;

  -- Add category_id if not exists
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'takeoff_measurements' and column_name = 'category_id'
  ) then
    alter table public.takeoff_measurements 
    add column category_id uuid null references public.master_categories(id) on delete set null;
  end if;
end $$;


