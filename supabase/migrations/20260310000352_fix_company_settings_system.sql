/*
  # Fix Company Settings System

  1. Changes
    - Create helper function to auto-create company_settings row if missing
    - Add RLS policies for company_settings if not already present
    
  2. Security
    - Users can only view/edit settings for their own company
    - Settings row auto-created when accessed
*/

-- Function to get or create company settings
CREATE OR REPLACE FUNCTION get_or_create_company_settings(p_company_id uuid)
RETURNS SETOF company_settings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Try to find existing settings
  RETURN QUERY
  SELECT * FROM company_settings WHERE company_id = p_company_id;
  
  -- If not found, create it
  IF NOT FOUND THEN
    INSERT INTO company_settings (
      company_id,
      company_name,
      updated_at,
      _schema_refresh
    )
    SELECT 
      p_company_id,
      name,
      now(),
      now()
    FROM companies
    WHERE id = p_company_id
    ON CONFLICT (company_id) DO NOTHING;
    
    -- Return the newly created settings
    RETURN QUERY
    SELECT * FROM company_settings WHERE company_id = p_company_id;
  END IF;
END;
$$;

-- Enable RLS if not already enabled
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own company settings" ON company_settings;
DROP POLICY IF EXISTS "Users can update own company settings" ON company_settings;
DROP POLICY IF EXISTS "Users can create own company settings" ON company_settings;

-- Create policies for company_settings
CREATE POLICY "Users can view own company settings"
  ON company_settings
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own company settings"
  ON company_settings
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Allow insert for authenticated users (for auto-creation)
CREATE POLICY "Users can create own company settings"
  ON company_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );
