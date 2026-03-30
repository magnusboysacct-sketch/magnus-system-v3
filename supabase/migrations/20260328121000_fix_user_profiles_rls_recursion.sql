/*
  Fix user_profiles and companies RLS recursion by replacing recursive policies with security definer functions
*/

-- Create security definer function to get user's company (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_company(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id
  FROM user_profiles
  WHERE id = p_user_id;
  
  RETURN v_company_id;
END;
$$;

-- Create security definer function to check if user can access company profiles
CREATE OR REPLACE FUNCTION can_access_company_profiles(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Get user's company
  v_company_id := get_user_company(p_user_id);
  
  -- Return true if user has a company (can access profiles in same company)
  RETURN v_company_id IS NOT NULL;
END;
$$;

-- Drop recursive policies
DROP POLICY IF EXISTS "Users can view their own company" ON companies;
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can view company profiles" ON user_profiles;

-- Create new non-recursive policies for companies
CREATE POLICY "Users can view their own company"
  ON companies FOR SELECT
  TO authenticated
  USING (
    id = get_user_company(auth.uid())
  );

-- Create new non-recursive policies for user_profiles
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can view company profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company(auth.uid()) AND
    id != auth.uid()  -- Don't include own profile again (already covered by above policy)
  );
