/*
  # Recreate Project Member RPC Functions

  1. Functions Created
    - `get_company_assignable_users()` - Returns all active users in the current user's company
      Returns: user_id, email, full_name, role, status
    
    - `get_project_members(p_project_id uuid)` - Returns all members assigned to a specific project
      Returns: user_id, email, full_name, company_role, project_role
    
    - `upsert_project_member(p_project_id uuid, p_user_id uuid, p_role text)` - Adds or updates a project member
      Returns: void

  2. Security
    - All functions use SECURITY DEFINER to access auth.users table
    - All functions verify the current user is authenticated
    - Functions enforce company-based access control
    - Only directors and admins can manage project members (upsert_project_member)

  3. Column Mappings for Frontend
    - AssignableUserRow: { user_id, email, full_name, role, status }
    - ProjectMemberRow: { user_id, email, full_name, company_role, project_role }
*/

-- Drop existing functions first
drop function if exists public.get_company_assignable_users();
drop function if exists public.get_project_members(uuid);
drop function if exists public.upsert_project_member(uuid, uuid, text);

-- Function 1: Get all assignable users from the current user's company
create or replace function public.get_company_assignable_users()
returns table(
  user_id uuid,
  email text,
  full_name text,
  role text,
  status text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_company_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  select up.company_id
    into v_company_id
  from public.user_profiles up
  where up.id = v_me;

  if v_company_id is null then
    raise exception 'No company found for current user';
  end if;

  return query
  select
    up.id as user_id,
    coalesce(au.email, '') as email,
    up.full_name,
    up.role,
    coalesce(up.status, 'active') as status
  from public.user_profiles up
  left join auth.users au
    on au.id = up.id
  where up.company_id = v_company_id
    and coalesce(up.status, 'active') = 'active'
  order by
    case when up.role = 'director' then 0 else 1 end,
    coalesce(up.full_name, ''),
    coalesce(au.email, '');
end;
$$;

-- Function 2: Get all members assigned to a specific project
create or replace function public.get_project_members(p_project_id uuid)
returns table(
  user_id uuid,
  email text,
  full_name text,
  company_role text,
  project_role text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_company_id uuid;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  select up.company_id
    into v_company_id
  from public.user_profiles up
  where up.id = v_me;

  if v_company_id is null then
    raise exception 'No company found for current user';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.company_id = v_company_id
  ) then
    raise exception 'Project not found in your company';
  end if;

  return query
  select
    pm.user_id,
    coalesce(au.email, '') as email,
    up.full_name,
    up.role as company_role,
    pm.role as project_role
  from public.project_members pm
  join public.user_profiles up
    on up.id = pm.user_id
  left join auth.users au
    on au.id = up.id
  where pm.project_id = p_project_id
  order by
    case when pm.role = 'project_manager' then 0 else 1 end,
    coalesce(up.full_name, ''),
    coalesce(au.email, '');
end;
$$;

-- Function 3: Add or update a project member (upsert)
create or replace function public.upsert_project_member(
  p_project_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
  v_company_id uuid;
  v_my_role text;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(p_role, '') not in (
    'project_manager',
    'site_supervisor',
    'estimator',
    'procurement',
    'accounts',
    'viewer'
  ) then
    raise exception 'Invalid project member role';
  end if;

  select up.company_id, up.role
    into v_company_id, v_my_role
  from public.user_profiles up
  where up.id = v_me;

  if v_company_id is null then
    raise exception 'No company found for current user';
  end if;

  if coalesce(v_my_role, '') not in ('director', 'admin') then
    raise exception 'Only directors and admins can manage project members';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.company_id = v_company_id
  ) then
    raise exception 'Project not found in your company';
  end if;

  if not exists (
    select 1
    from public.user_profiles up
    where up.id = p_user_id
      and up.company_id = v_company_id
      and coalesce(up.status, 'active') = 'active'
  ) then
    raise exception 'User not found or inactive in your company';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, p_user_id, p_role)
  on conflict (project_id, user_id)
  do update set role = excluded.role;
end;
$$;
