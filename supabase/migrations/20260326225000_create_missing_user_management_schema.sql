/*
  # Create Missing User Management Schema
  
  ## Overview
  Create the missing user management tables that are referenced throughout
  the codebase but were never created in migrations.
  
  ## Tables to Create
  
  ### 1. companies
    - Basic company information
    - Used for multi-tenancy across all tables
  
  ### 2. user_profiles  
    - Extended user profile information
    - Links to auth.users table
    - Company membership and roles
  
  ### 3. project_members
    - Junction table for project assignments
    - Links users to projects with specific roles
    - Includes is_active status for project access control
  
  ## Backward Compatibility
  - All existing migrations reference these tables
  - This migration creates the expected schema
  - Enables proper RLS policies throughout the system
*/

-- =====================================================
-- COMPANIES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

-- =====================================================
-- USER PROFILES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  email text,
  full_name text,
  role text DEFAULT 'viewer' CHECK (role IN ('director', 'admin', 'project_manager', 'site_supervisor', 'estimator', 'procurement', 'accounts', 'viewer')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  finance_access_level text DEFAULT 'none' CHECK (finance_access_level IN ('full', 'project_only', 'none')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_company_id ON user_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_status ON user_profiles(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_finance_access ON user_profiles(finance_access_level);

-- =====================================================
-- PROJECT MEMBERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('project_manager', 'site_supervisor', 'estimator', 'procurement', 'accounts', 'viewer')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Primary key constraint
  PRIMARY KEY (project_id, user_id)
);

-- Ensure is_active column exists (in case table was created without it)
DO $$
BEGIN
  -- Check if column exists, if not add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_members' 
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE project_members 
    ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_role ON project_members(role);

-- Only create is_active index if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_members' 
    AND column_name = 'is_active'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_project_members_is_active ON project_members(is_active);
  END IF;
END $$;

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES FOR COMPANIES
-- =====================================================

-- Users can view their own company
CREATE POLICY "Users can view their own company"
  ON companies FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- =====================================================
-- RLS POLICIES FOR USER PROFILES
-- =====================================================

-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Users can view profiles from same company
CREATE POLICY "Users can view company profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- =====================================================
-- RLS POLICIES FOR PROJECT MEMBERS
-- =====================================================

-- Users can view project members for projects they're members of
CREATE POLICY "Users can view project members for their projects"
  ON project_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN companies c ON c.id = up.company_id
      JOIN projects p ON p.company_id = c.id
      WHERE p.id = project_members.project_id
      AND up.id = auth.uid()
    )
  );

-- Users can insert project members for projects they manage
CREATE POLICY "Users can insert project members for managed projects"
  ON project_members FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid() 
      AND pm.role IN ('project_manager', 'director', 'admin')
      AND pm.is_active = true
    )
  );

-- Users can update project members for projects they manage
CREATE POLICY "Users can update project members for managed projects"
  ON project_members FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid() 
      AND pm.role IN ('project_manager', 'director', 'admin')
      AND pm.is_active = true
    )
  );

-- Users can delete project members for projects they manage
CREATE POLICY "Users can delete project members for managed projects"
  ON project_members FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = auth.uid() 
      AND pm.role IN ('project_manager', 'director', 'admin')
      AND pm.is_active = true
    )
  );

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Auto-update updated_at on companies
CREATE OR REPLACE FUNCTION update_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on user_profiles
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on project_members
CREATE OR REPLACE FUNCTION update_project_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers after functions are defined
DROP TRIGGER IF EXISTS trigger_update_companies_updated_at ON companies;
CREATE TRIGGER trigger_update_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_companies_updated_at();

DROP TRIGGER IF EXISTS trigger_update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trigger_update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

DROP TRIGGER IF EXISTS trigger_update_project_members_updated_at ON project_members;
CREATE TRIGGER trigger_update_project_members_updated_at
  BEFORE UPDATE ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION update_project_members_updated_at();

-- =====================================================
-- TRIGGER FOR DIRECTOR FINANCE ACCESS
-- =====================================================

-- Set directors to full finance access by default
CREATE OR REPLACE FUNCTION set_director_finance_access()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'director' AND COALESCE(NEW.finance_access_level, 'none') = 'none' THEN
    NEW.finance_access_level = 'full';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_director_finance_access ON user_profiles;
CREATE TRIGGER trg_director_finance_access
  BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_director_finance_access();

-- =====================================================
-- INSERT DEFAULT COMPANY DATA
-- =====================================================

-- Create a default company if none exists
INSERT INTO companies (id, name)
SELECT 
  gen_random_uuid(),
  'Default Company'
WHERE NOT EXISTS (SELECT 1 FROM companies);

-- Link existing users to default company
UPDATE user_profiles 
SET company_id = (SELECT id FROM companies LIMIT 1)
WHERE company_id IS NULL;
