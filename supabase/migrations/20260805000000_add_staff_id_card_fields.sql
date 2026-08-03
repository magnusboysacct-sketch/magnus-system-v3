/*
  Fields needed for the internal-staff ID card (Settings > Records & IDs >
  Staff tab). user_profiles had none of these — avatar_url, employee_number,
  and id issue/expiry dates only existed on the workers table (for field
  workers), which is a completely separate id space from user_profiles.

  No edit UI exists yet to set these (same situation as user_profiles.trn,
  added in an earlier migration this session) — a director currently has to
  set them directly in Supabase. Cards fall back to a placeholder / a
  computed 2-year expiry from id_issued_date (or created_at) when unset.
*/

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS employee_number text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS id_issued_date date;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS id_expiry_date date;
