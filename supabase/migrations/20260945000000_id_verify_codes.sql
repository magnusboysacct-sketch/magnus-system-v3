-- ID cards: a short random verify code for every staff member and worker, and ONE public function that checks a card by that code.
--
--   user_profiles.verify_code / workers.verify_code   12 random hex characters, unique, filled for every existing row and set automatically on new ones.
--                                                     The QR on a card encodes https://app.magnusboys.com/v/<code>. Nobody can change a code through the API
--                                                     (SELECT only); the code identifies a card, it is not a secret (it is printed in the QR).
--   verify_id(p_code)                                 SECURITY DEFINER, executable by anon (the /v/:code page is public). Returns ONLY: kind, name, title,
--                                                     photo (profile / passport photo, never an ID scan), company name and logo, status, valid / expired and the
--                                                     expiry date. Never TRN, ID number, phone, address or employee number. NULL for an unknown code.
--
-- The old /verify/:workerId page and verify_worker(uuid) are untouched, so cards already printed keep working.
-- Read-only on existing data (the new column is filled by its default, which touches no triggers and no updated_at).

BEGIN;

-- ── 1. The codes ────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- A volatile DEFAULT is evaluated once per row when the column is added, so every existing row gets its own random code and no trigger fires.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS verify_code text NOT NULL DEFAULT encode(extensions.gen_random_bytes(6), 'hex');
ALTER TABLE public.workers       ADD COLUMN IF NOT EXISTS verify_code text NOT NULL DEFAULT encode(extensions.gen_random_bytes(6), 'hex');

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_verify_code_shape;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_verify_code_shape CHECK (verify_code ~ '^[0-9a-f]{12}$');
ALTER TABLE public.workers       DROP CONSTRAINT IF EXISTS workers_verify_code_shape;
ALTER TABLE public.workers       ADD CONSTRAINT workers_verify_code_shape CHECK (verify_code ~ '^[0-9a-f]{12}$');

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_verify_code_key ON public.user_profiles (verify_code);
CREATE UNIQUE INDEX IF NOT EXISTS workers_verify_code_key       ON public.workers (verify_code);

-- Column privileges (20260944000000 limited both tables to named columns): the code is readable by signed-in users (the card shows it as a QR) and by nobody
-- as a writable column. New rows get theirs from the default, which needs no privilege.
GRANT SELECT (verify_code) ON public.user_profiles TO authenticated;
GRANT SELECT (verify_code) ON public.workers       TO authenticated;

-- ── 2. The public check ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Expiry, as the cards themselves work it out: staff = id_expiry_date, else issued date (or created date) + 2 years; worker = id_expiry_date, else hire date + 2 years
-- (no hire date: no expiry). valid = active and not expired. A disabled staff member shows as 'inactive'.
CREATE OR REPLACE FUNCTION public.verify_id(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_code text := lower(btrim(coalesce(p_code, '')));
  r jsonb;
BEGIN
  IF v_code !~ '^[0-9a-f]{12}$' THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
           'kind', 'staff',
           'name', coalesce(nullif(btrim(up.full_name), ''), 'Staff member'),
           'title', coalesce(nullif(btrim(up.job_title), ''), initcap(replace(coalesce(nullif(up.role, ''), 'staff'), '_', ' '))),
           'photo_url', nullif(btrim(up.avatar_url), ''),
           'company_name', cs.company_name,
           'logo_url', cs.logo_url,
           'status', CASE WHEN coalesce(up.status, 'active') = 'active' THEN 'active' ELSE 'inactive' END,
           'expired', coalesce(x.exp < current_date, false),
           'valid', (coalesce(up.status, 'active') = 'active' AND NOT coalesce(x.exp < current_date, false)),
           'expiry_date', x.exp)
    INTO r
    FROM public.user_profiles up
    LEFT JOIN public.company_settings cs ON cs.company_id = up.company_id
    CROSS JOIN LATERAL (SELECT coalesce(up.id_expiry_date, (coalesce(up.id_issued_date, up.created_at::date) + interval '2 years')::date) AS exp) x
   WHERE up.verify_code = v_code
   LIMIT 1;
  IF r IS NOT NULL THEN RETURN r; END IF;

  SELECT jsonb_build_object(
           'kind', 'worker',
           'name', btrim(concat_ws(' ', w.first_name, w.last_name)),
           'title', coalesce(nullif(btrim(w.job_title), ''), initcap(replace(coalesce(nullif(w.worker_type, ''), 'worker'), '_', ' '))),
           'photo_url', nullif(btrim(w.passport_photo_url), ''),
           'company_name', cs.company_name,
           'logo_url', cs.logo_url,
           'status', coalesce(w.status, 'active'),
           'expired', coalesce(x.exp < current_date, false),
           'valid', (coalesce(w.status, 'active') = 'active' AND NOT coalesce(x.exp < current_date, false)),
           'expiry_date', x.exp)
    INTO r
    FROM public.workers w
    LEFT JOIN public.company_settings cs ON cs.company_id = w.company_id
    CROSS JOIN LATERAL (SELECT coalesce(w.id_expiry_date, (w.hire_date + interval '2 years')::date) AS exp) x
   WHERE w.verify_code = v_code
   LIMIT 1;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_id(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
