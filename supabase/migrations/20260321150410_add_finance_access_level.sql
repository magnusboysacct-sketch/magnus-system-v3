/*
  # Add Finance Access Level to User Profiles

  1. Changes
    - Add `finance_access_level` column to `user_profiles` table
    - Values: 'full', 'project_only', 'none'
    - Default: 'none' for security (restrictive by default)
    - Directors get 'full' access by default via trigger
    
  2. Purpose
    - Control visibility of sensitive finance data
    - Restrict company-wide P&L, margins, cash flow to authorized users
    - Allow project-level finance access for project managers
    - Prevent unauthorized access to markup and profit data

  3. Access Levels
    - **full**: Complete access to all finance modules (company-wide + project-level)
      - Company dashboard, P&L, Balance Sheet, Cash Flow
      - All markup, profit, and margin data
      - Accounts receivable, expenses, billing
      
    - **project_only**: Limited to project-specific finance data only
      - Project-level costs and budgets
      - No company-wide financial reports
      - No markup/profit visibility
      
    - **none**: No finance access
      - Cannot view any financial data
      - Finance sections hidden from navigation
*/

-- Add finance_access_level column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'finance_access_level'
  ) THEN
    ALTER TABLE user_profiles 
    ADD COLUMN finance_access_level text 
    CHECK (finance_access_level IN ('full', 'project_only', 'none')) 
    DEFAULT 'none';
  END IF;
END $$;

-- Create index for efficient permission checks
CREATE INDEX IF NOT EXISTS idx_user_profiles_finance_access 
ON user_profiles(finance_access_level);

-- Set existing directors to 'full' access
UPDATE user_profiles 
SET finance_access_level = 'full' 
WHERE role = 'director' AND finance_access_level = 'none';

-- Create trigger to auto-grant full finance access to directors
CREATE OR REPLACE FUNCTION set_director_finance_access()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'director' AND (NEW.finance_access_level IS NULL OR NEW.finance_access_level = 'none') THEN
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
