-- ID cards: per-company card colours, and who may write company_settings.
--
-- 1. company_settings.id_card_primary / id_card_accent   '#RRGGBB' or NULL (NULL = the default navy & gold). company_settings had no brand colour fields to reuse.
--
-- 2. WHO MAY WRITE company_settings. Before: the older "company_settings_update" / "company_settings_insert" / "Users can ..." policies let ANY signed-in member of
--    the company insert or change ANY column (logo, name, subscription status, trial dates, ...), and the one director/admin policy checked the roles
--    ('owner', 'admin'), which is not a role in this system, so it never covered the director. After: only a director or admin of the company can INSERT / UPDATE /
--    DELETE its settings row. Reading is unchanged (the three SELECT policies stay).
--
--      What writes company_settings today (checked in src/, supabase/functions and the live database functions):
--        Settings -> Company        director only (route guard)   upsert of the company details, logo, watermark, payment-notification switch; signature
--        Settings -> Estimates      director only (route guard)   upsert of the estimate_* defaults, company_overhead_pct, salary_period
--        Settings -> Company        director only                 the ID card colours (new)
--        signup / invite triggers   handle_new_user, handle_new_user_signup, get_or_create_company_settings_unchecked: SECURITY DEFINER, owned by postgres, which
--                                   is exempt from row security, so creating a company's first settings row at signup is not affected by this migration.
--        edge functions             all read-only (and the service role is exempt from row security anyway)
--      Everything else (letterhead, invoices, contracts, payroll, field payments, Secretary Workspace, trial / subscription checks, the portal) only READS.
--      No Secretary Workspace page saves company settings, so the secretary gets no write access.
--
--    Because only a director or admin of that company can now write the row at all, the ID card colours need no separate guard.
--    The table-level TRUNCATE / REFERENCES / TRIGGER privileges that signed-in users had on company_settings are also removed (TRUNCATE ignores row security).
--
-- 3. verify_id() and verify_worker() (the public QR pages) also return the two colours, so the verify page header can use the company colour.
--    The status band stays fixed (valid = green, expired = red, inactive = grey). The colours are not secret.
--
-- Safety: if company_settings has any policy this migration does not know about, the whole migration stops and nothing is changed.

BEGIN;

-- ── 1. The colour columns ───────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS id_card_primary text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS id_card_accent  text;

ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_id_card_primary_hex;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_id_card_primary_hex CHECK (id_card_primary IS NULL OR id_card_primary ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_id_card_accent_hex;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_id_card_accent_hex  CHECK (id_card_accent  IS NULL OR id_card_accent  ~ '^#[0-9a-fA-F]{6}$');

-- ── 2. Only a director or admin of the company may write its settings ───────────────────────────────────────────────────────
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own company settings" ON public.company_settings;
DROP POLICY IF EXISTS "Users can update own company settings" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_insert" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_update" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_tenant_write_admin" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_admin_insert" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_admin_update" ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_admin_delete" ON public.company_settings;

CREATE POLICY "company_settings_admin_insert" ON public.company_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                       WHERE up.id = auth.uid() AND up.company_id = company_settings.company_id AND lower(up.role) IN ('director', 'admin')));
CREATE POLICY "company_settings_admin_update" ON public.company_settings FOR UPDATE TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.user_profiles up
                       WHERE up.id = auth.uid() AND up.company_id = company_settings.company_id AND lower(up.role) IN ('director', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                       WHERE up.id = auth.uid() AND up.company_id = company_settings.company_id AND lower(up.role) IN ('director', 'admin')));
CREATE POLICY "company_settings_admin_delete" ON public.company_settings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                  WHERE up.id = auth.uid() AND up.company_id = company_settings.company_id AND lower(up.role) IN ('director', 'admin')));

-- TRUNCATE ignores row security; REFERENCES / TRIGGER are not needed either. (Nothing in the app uses them; only the owner and the service role keep them.)
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.company_settings FROM PUBLIC, anon, authenticated;

-- The guard from an earlier draft of this migration is not needed: whoever can write the row at all is a director or admin of the company.
DROP TRIGGER IF EXISTS company_settings_guard_id_card_colours ON public.company_settings;
DROP FUNCTION IF EXISTS public._guard_company_id_card_colours();

-- Nothing unexpected may be left: exactly the three read policies and the three write policies above.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.policyname FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = 'company_settings'
       AND p.policyname NOT IN ('Users can view own company settings', 'company_settings_select', 'company_settings_tenant_read',
                                'company_settings_admin_insert', 'company_settings_admin_update', 'company_settings_admin_delete')
  LOOP
    RAISE EXCEPTION 'Unexpected policy "%" on company_settings: it was not replaced by this migration. Nothing was changed.', r.policyname;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'company_settings' AND p.cmd IN ('SELECT')) < 1 THEN
    RAISE EXCEPTION 'company_settings has no read policy any more. Nothing was changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'company_settings' AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                AND p.policyname NOT LIKE 'company_settings_admin_%') THEN
    RAISE EXCEPTION 'company_settings still has a write policy for someone other than a director or admin. Nothing was changed.';
  END IF;
END $$;

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
