/*
  Backfill: Create company + profile for any auth users who signed up
  before the auto-creation trigger was added.

  Safe to run multiple times — all inserts use ON CONFLICT DO NOTHING.
*/

DO $$
DECLARE
  r record;
  v_company_id uuid;
  v_company_name text;
  v_full_name text;
BEGIN
  -- Loop over every auth user that has no user_profile yet
  FOR r IN
    SELECT
      u.id,
      u.email,
      u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN public.user_profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    v_company_name := COALESCE(
      NULLIF(trim(r.raw_user_meta_data->>'company_name'), ''),
      'My Company'
    );
    v_full_name := COALESCE(
      NULLIF(trim(r.raw_user_meta_data->>'full_name'), ''),
      split_part(r.email, '@', 1)
    );

    -- Create company
    INSERT INTO public.companies (name)
    VALUES (v_company_name)
    RETURNING id INTO v_company_id;

    -- Create profile as director
    INSERT INTO public.user_profiles (
      id, company_id, email, full_name, role, finance_access_level, status
    ) VALUES (
      r.id, v_company_id, r.email, v_full_name, 'director', 'full', 'active'
    )
    ON CONFLICT (id) DO NOTHING;

    -- Bootstrap company_settings with trial already started at signup
    INSERT INTO public.company_settings (
      company_id, company_name, trial_expires_at, subscription_status
    ) VALUES (
      v_company_id, v_company_name, now() + interval '14 days', 'inactive'
    )
    ON CONFLICT (company_id) DO NOTHING;

    RAISE NOTICE 'Backfilled user % (%) → company %', r.email, r.id, v_company_id;
  END LOOP;
END;
$$;
