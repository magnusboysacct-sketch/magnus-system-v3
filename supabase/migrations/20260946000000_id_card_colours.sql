-- ID cards: per-company card colours.
--
--   company_settings.id_card_primary / id_card_accent   '#RRGGBB' or NULL (NULL = the default navy & gold). company_settings had no brand colour fields to reuse.
--
-- WHO MAY CHANGE THEM. company_settings already has UPDATE / INSERT policies that let ANY signed-in member of the company write ANY column (the older
-- "company_settings_update" / "company_settings_insert" / "Users can ..." policies are permissive and OR together with the director/admin one), so a policy
-- alone would not restrict the new columns. A trigger does: through the API, only a director or admin of that company can set or change either colour.
-- The service role and direct database connections (migrations, SQL editor) are not restricted. Other columns and other people's saves are unaffected.
--
-- verify_id() and verify_worker() (the public QR pages) also return the two colours, so the verify page header can use the company colour.
-- The status band stays fixed (valid = green, expired = red, inactive = grey). The colours are not secret.

BEGIN;

-- ── 1. The columns ──────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS id_card_primary text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS id_card_accent  text;

ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_id_card_primary_hex;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_id_card_primary_hex CHECK (id_card_primary IS NULL OR id_card_primary ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_id_card_accent_hex;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_id_card_accent_hex  CHECK (id_card_accent  IS NULL OR id_card_accent  ~ '^#[0-9a-fA-F]{6}$');

-- ── 2. Only a director or admin may change them ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._guard_company_id_card_colours()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role   text;
  v_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.id_card_primary IS NOT NULL OR NEW.id_card_accent IS NOT NULL;
  ELSE
    v_changed := NEW.id_card_primary IS DISTINCT FROM OLD.id_card_primary OR NEW.id_card_accent IS DISTINCT FROM OLD.id_card_accent;
  END IF;
  IF NOT v_changed THEN RETURN NEW; END IF;

  IF v_claims IS NULL AND session_user <> 'authenticator' THEN RETURN NEW; END IF;      -- not through the API: a direct database connection
  IF v_claims IS NOT NULL THEN
    BEGIN v_role := v_claims::jsonb ->> 'role'; EXCEPTION WHEN others THEN v_role := NULL; END;
    IF v_role = 'service_role' THEN RETURN NEW; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_profiles up
              WHERE up.id = auth.uid() AND up.company_id = NEW.company_id AND up.role IN ('director', 'admin')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only a director or admin can change the ID card colours.' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public._guard_company_id_card_colours() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS company_settings_guard_id_card_colours ON public.company_settings;
CREATE TRIGGER company_settings_guard_id_card_colours
  BEFORE INSERT OR UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public._guard_company_id_card_colours();

-- ── 3. The public checks return the colours too ─────────────────────────────────────────────────────────────────────────────
-- verify_id: same as 20260945000000 plus 'id_card_primary' / 'id_card_accent'.
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
           'id_card_primary', cs.id_card_primary,
           'id_card_accent', cs.id_card_accent,
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
           'id_card_primary', cs.id_card_primary,
           'id_card_accent', cs.id_card_accent,
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

-- verify_worker: same as 20260943000000 plus 'id_card_primary' / 'id_card_accent'.
CREATE OR REPLACE FUNCTION public.verify_worker(p_worker_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
           'id', w.id,
           'first_name', w.first_name,
           'last_name', w.last_name,
           'worker_type', w.worker_type,
           'status', w.status,
           'employee_id', w.employee_id,
           'hire_date', w.hire_date,
           'photo_url', nullif(btrim(w.passport_photo_url), ''),
           'company_name', cs.company_name,
           'logo_url', cs.logo_url,
           'id_card_primary', cs.id_card_primary,
           'id_card_accent', cs.id_card_accent,
           'expired', coalesce(coalesce(w.id_expiry_date, w.hire_date + interval '2 years') < current_date, false),
           'valid', (w.status = 'active' AND NOT coalesce(coalesce(w.id_expiry_date, w.hire_date + interval '2 years') < current_date, false)))
    FROM workers w
    LEFT JOIN company_settings cs ON cs.company_id = w.company_id
   WHERE w.id = p_worker_id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_worker(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_worker(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
