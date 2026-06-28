/*
  Company Auto-Creation on Signup

  When a new user signs up via supabase.auth.signUp(), this trigger:
    1. Creates a row in `companies` using the company_name from user metadata
    2. Creates a row in `user_profiles` with role='director' and finance_access_level='full'
    3. Creates a row in `company_settings` with a 14-day free trial

  The global rate library items (cost_items where company_id IS NULL) are already
  visible to all companies via RLS, so new companies inherit the full rate library
  automatically without any additional seeding.
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_company_name text;
  v_full_name text;
BEGIN
  -- Extract metadata passed in signUp({ options: { data: { ... } } })
  v_company_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'company_name'), ''),
    'My Company'
  );
  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- 1. Create the company
  INSERT INTO public.companies (name)
  VALUES (v_company_name)
  RETURNING id INTO v_company_id;

  -- 2. Create the user profile as director with full finance access
  INSERT INTO public.user_profiles (
    id,
    company_id,
    email,
    full_name,
    role,
    finance_access_level,
    status
  ) VALUES (
    NEW.id,
    v_company_id,
    NEW.email,
    v_full_name,
    'director',
    'full',
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    email      = EXCLUDED.email,
    full_name  = EXCLUDED.full_name,
    role       = EXCLUDED.role,
    finance_access_level = EXCLUDED.finance_access_level;

  -- 3. Bootstrap company_settings with a 14-day trial
  INSERT INTO public.company_settings (
    company_id,
    company_name,
    trial_expires_at,
    subscription_status
  ) VALUES (
    v_company_id,
    v_company_name,
    now() + interval '14 days',
    'inactive'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Never block signup — log and continue
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
