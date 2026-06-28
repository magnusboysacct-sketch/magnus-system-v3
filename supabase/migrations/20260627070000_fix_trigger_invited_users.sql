/*
  Fix: handle_new_user trigger was creating a brand-new company for every
  invited user. Invited users already have company_id in their metadata
  (set by the admin-invite-user edge function via generateLink options.data).

  Logic:
  - If raw_user_meta_data contains company_id  → invited user, link to that company
  - Otherwise                                  → new signup, create fresh company
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id      uuid;
  v_company_name    text;
  v_full_name       text;
  v_invited_role    text;
  v_existing_co_id  uuid;
BEGIN
  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  -- Detect invited user: edge function sets company_id in user metadata
  BEGIN
    v_existing_co_id := (NEW.raw_user_meta_data->>'company_id')::uuid;
  EXCEPTION WHEN others THEN
    v_existing_co_id := NULL;
  END;

  IF v_existing_co_id IS NOT NULL THEN
    -- ── INVITED USER ──────────────────────────────────────────────────────────
    -- Link to the inviting company; do NOT create a new company.
    v_invited_role := COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'invited_role'), ''),
      'viewer'
    );

    INSERT INTO public.user_profiles (
      id, company_id, email, full_name, role, finance_access_level, status
    ) VALUES (
      NEW.id,
      v_existing_co_id,
      NEW.email,
      v_full_name,
      v_invited_role,
      CASE WHEN v_invited_role IN ('director', 'admin', 'accounts') THEN 'full' ELSE 'none' END,
      'active'
    )
    ON CONFLICT (id) DO UPDATE SET
      company_id           = EXCLUDED.company_id,
      email                = EXCLUDED.email,
      full_name            = EXCLUDED.full_name,
      role                 = EXCLUDED.role,
      finance_access_level = EXCLUDED.finance_access_level;

    RETURN NEW;
  END IF;

  -- ── NEW SIGNUP ─────────────────────────────────────────────────────────────
  v_company_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'company_name'), ''),
    'My Company'
  );

  INSERT INTO public.companies (name)
  VALUES (v_company_name)
  RETURNING id INTO v_company_id;

  INSERT INTO public.user_profiles (
    id, company_id, email, full_name, role, finance_access_level, status
  ) VALUES (
    NEW.id, v_company_id, NEW.email, v_full_name, 'director', 'full', 'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    company_id           = EXCLUDED.company_id,
    email                = EXCLUDED.email,
    full_name            = EXCLUDED.full_name,
    role                 = EXCLUDED.role,
    finance_access_level = EXCLUDED.finance_access_level;

  INSERT INTO public.company_settings (
    company_id, company_name, trial_expires_at, subscription_status
  ) VALUES (
    v_company_id, v_company_name, now() + interval '14 days', 'inactive'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN others THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
