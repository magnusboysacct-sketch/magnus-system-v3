-- =====================================================
-- MIGRATION: Add company_id to projects table
-- File: 20260510120000_add_projects_company_id.sql
-- =====================================================

-- Step 1: Add company_id column (safe)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

-- Step 2: Add index for performance
CREATE INDEX IF NOT EXISTS idx_projects_company_id 
ON projects(company_id);

-- Step 3: Add comment for documentation
COMMENT ON COLUMN projects.company_id IS 'Company ownership for unified multi-tenant architecture';

-- =====================================================
-- CREATE: Migration conflicts table (created before use)
-- =====================================================

CREATE TABLE IF NOT EXISTS migration_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  conflict_details jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL CHECK (status IN ('requires_manual_review', 'resolved', 'escalated')),
  assigned_to uuid REFERENCES auth.users(id),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_migration_conflicts_status 
ON migration_conflicts(status);

-- =====================================================
-- BACKFILL: Safe projects (deterministic)
-- =====================================================

WITH project_conflicts AS (
  SELECT 
    p.id as project_id,
    p.name as project_name,
    COUNT(pm.user_id) as member_count,
    COUNT(DISTINCT up.company_id) as unique_companies,
    array_agg(DISTINCT up.company_id) FILTER (WHERE up.company_id IS NOT NULL) as company_list,
    array_agg(DISTINCT up.id) FILTER (WHERE up.id IS NOT NULL) as member_list,
    json_agg(json_build_object(
      'user_id', up.id,
      'company_id', up.company_id,
      'role', pm.role
    )) as member_details,
    CASE 
      WHEN COUNT(DISTINCT up.company_id) = 0 THEN 'no_company'
      WHEN COUNT(DISTINCT up.company_id) = 1 THEN 'single_company'
      WHEN COUNT(DISTINCT up.company_id) > 1 THEN 'multiple_companies'
      ELSE 'unknown'
    END as conflict_type,
    json_build_object(
      'member_list', array_agg(DISTINCT up.id) FILTER (WHERE up.id IS NOT NULL),
      'company_list', array_agg(DISTINCT up.company_id) FILTER (WHERE up.company_id IS NOT NULL),
      'member_details', json_agg(json_build_object(
        'user_id', up.id,
        'company_id', up.company_id,
        'role', pm.role
      ))
    ) as conflict_details
  FROM projects p
  LEFT JOIN project_members pm ON p.id = pm.project_id
  LEFT JOIN user_profiles up ON pm.user_id = up.id
  GROUP BY p.id, p.name
),

-- CTE: Identify safe projects for backfill
safe_projects AS (
  SELECT 
    project_id,
    company_list[1] as company_id  -- Get the single company_id
  FROM project_conflicts
  WHERE conflict_type = 'single_company'
)

-- Step 1: Backfill safe projects (deterministic)
UPDATE projects p
SET company_id = c.company_id,
  updated_at = now()
FROM safe_projects c
WHERE p.id = c.project_id;

-- =====================================================
-- CONFLICT INSERT: Projects requiring manual review
-- =====================================================

WITH project_conflicts AS (
  SELECT 
    p.id as project_id,
    p.name as project_name,
    COUNT(pm.user_id) as member_count,
    COUNT(DISTINCT up.company_id) as unique_companies,
    array_agg(DISTINCT up.company_id) FILTER (WHERE up.company_id IS NOT NULL) as company_list,
    array_agg(DISTINCT up.id) FILTER (WHERE up.id IS NOT NULL) as member_list,
    json_agg(json_build_object(
      'user_id', up.id,
      'company_id', up.company_id,
      'role', pm.role
    )) as member_details,
    CASE 
      WHEN COUNT(DISTINCT up.company_id) = 0 THEN 'no_company'
      WHEN COUNT(DISTINCT up.company_id) = 1 THEN 'single_company'
      WHEN COUNT(DISTINCT up.company_id) > 1 THEN 'multiple_companies'
      ELSE 'unknown'
    END as conflict_type,
    json_build_object(
      'member_list', array_agg(DISTINCT up.id) FILTER (WHERE up.id IS NOT NULL),
      'company_list', array_agg(DISTINCT up.company_id) FILTER (WHERE up.company_id IS NOT NULL),
      'member_details', json_agg(json_build_object(
        'user_id', up.id,
        'company_id', up.company_id,
        'role', pm.role
      ))
    ) as conflict_details
  FROM projects p
  LEFT JOIN project_members pm ON p.id = pm.project_id
  LEFT JOIN user_profiles up ON pm.user_id = up.id
  GROUP BY p.id, p.name
),

-- CTE: Identify projects requiring manual review
conflict_projects AS (
  SELECT 
    project_id,
    conflict_type,
    conflict_details
  FROM project_conflicts
  WHERE conflict_type IN ('multiple_companies', 'no_company')
)

-- Step 2: Create conflict records for manual review
INSERT INTO migration_conflicts (
  project_id, 
  conflict_type, 
  conflict_details, 
  status, 
  created_at
)
SELECT 
  project_id,
  conflict_type,
  conflict_details,
  'requires_manual_review' as status,
  now() as created_at
FROM conflict_projects
WHERE conflict_type IN ('multiple_companies', 'no_company');


-- =====================================================
-- RLS: Update project policies to use company_id
-- =====================================================

-- Step 1: Drop old insecure policy
DROP POLICY IF EXISTS "projects_auth_all" ON public.projects;

-- Step 2: Drop any existing same-name policies (safe)
DROP POLICY IF EXISTS "Users can view own company projects" ON public.projects;
DROP POLICY IF EXISTS "Users can manage own company projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own company projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own company projects" ON public.projects;

-- Step 3: Ensure RLS is enabled
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Step 4: Create secure company-based policies
CREATE POLICY "Users can view own company projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can manage own company projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
);

CREATE POLICY "Users can update own company projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (
  company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  AND id IN (
    SELECT p.id FROM projects p
    WHERE p.company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  )
);

CREATE POLICY "Users can delete own company projects"
ON public.projects
FOR DELETE
TO authenticated
USING (
  company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  AND id IN (
    SELECT p.id FROM projects p
    WHERE p.company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
  )
);