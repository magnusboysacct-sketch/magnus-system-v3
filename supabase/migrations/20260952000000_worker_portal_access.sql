-- Worker portal step 3 (run after 20260951000000): the worker portal, built like the client portal. NO Supabase Auth login for workers and NO user_profiles row: a worker
-- signs in with their worker number + a 6-digit PIN, an edge function hands out a session token, and every page reads through token-checked database functions that
-- return only that worker's rows. Nothing here gives a worker access to any staff policy, because a worker is never a database user.
--
--  A. Identity. The worker-number prefix is unique across ALL companies (a taken default gets a digit: VWW -> VWW2; a company renamed this way has its existing worker numbers
--     renumbered to match), and workers.employee_id is unique across all companies, so "MBW-007" alone points at exactly one worker.
--     worker_portal_access        one row per worker with portal access: PBKDF2 hash of the PIN (never the PIN), must_change_pin, failed_attempts, locked_until, enabled ...
--     worker_portal_sessions      the sessions: only a SHA-256 hash of the token, 30 days, revocable.
--     worker_portal_login_attempts  hashed IP + time, for the per-IP limit.
--     All three: row-level security on, no policy, no grant: only the service role (edge functions) and the SECURITY DEFINER functions below touch them.
--  B. Login (service role only; called by the worker-portal-login edge function, which does the PBKDF2 check): worker_portal_login_state, worker_portal_record_failure (5 wrong
--     tries lock 15 minutes, 10 lock until the office unlocks), worker_portal_record_success (new session), worker_portal_change_pin, worker_portal_logout, worker_portal_ip_blocked /
--     worker_portal_ip_record, worker_portal_photo_ref, worker_portal_session_pin.
--  C. Staff (director, admin, secretary of the worker's company; or the service role): worker_portal_staff_status / _set_pin (give access, reset PIN) / _unlock / _set_enabled.
--     The worker-portal-admin edge function generates the temporary PIN, hashes it and calls these with the caller's own login, so the database checks the role again.
--  D. What a worker reads (anon + signed-in may call, but each needs the session token and returns ONLY that worker's data): worker_portal_home, worker_portal_payments,
--     worker_portal_advances, worker_portal_notices, worker_portal_receipt_link (the existing /receipt/:token page). Until the temporary PIN has been replaced they return nothing.
--
-- Changes data only in company_settings.worker_number_prefix / workers.employee_id of a company whose prefix was already taken by an older company (the numbering of step 2).

BEGIN;

-- ── safety checks: stop (and change nothing) if the database is not what this file expects ────────────────────────────────────────────────────────────────
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['companies', 'company_settings', 'workers', 'field_payments', 'projects', 'user_profiles', 'receipt_share_links', 'worker_portal_notices'] LOOP
    IF to_regclass('public.' || s) IS NULL THEN RAISE EXCEPTION 'Table public.% was not found. Nothing was changed.', s; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'company_settings' AND column_name = 'worker_number_prefix')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'field_payments' AND column_name = 'worker_id')
    THEN RAISE EXCEPTION 'Apply migration 20260951000000 (worker numbers and the field payment link) first. Nothing was changed.'; END IF;
  FOREACH s IN ARRAY ARRAY['next_worker_number', 'worker_number_prefix_from_name', '_caller_may_use_company', 'field_payment_previous_advances'] LOOP
    IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = s) < 1 THEN RAISE EXCEPTION 'Function public.% was not found. Nothing was changed.', s; END IF;
  END LOOP;
  IF to_regprocedure('sha256(bytea)') IS NULL THEN RAISE EXCEPTION 'sha256() is not available. Nothing was changed.'; END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE employee_id IS NOT NULL GROUP BY lower(employee_id) HAVING count(*) > 1 AND count(DISTINCT company_id) > 1) THEN
    -- two companies already hold the same number; the prefix renumbering below cannot be trusted to fix a hand-typed clash
    RAISE NOTICE 'Two companies have a worker with the same number: review workers.employee_id if the unique index below fails.';
  END IF;
END $$;

-- ── A1. Prefixes: letters, then an optional digit or two (VWW2); unique across all companies ────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_worker_number_prefix_check;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_worker_number_prefix_check CHECK (worker_number_prefix IS NULL OR worker_number_prefix ~ '^[A-Z]{2,5}[0-9]{0,2}$');

-- The prefix itself when it is free, else with a digit: VWW -> VWW2 -> VWW3 ...
CREATE OR REPLACE FUNCTION public.worker_unique_prefix(p_base text, p_company_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_base text := regexp_replace(upper(coalesce(p_base, '')), '[0-9]+$', ''); v_candidate text; n integer := 1;
BEGIN
  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM public.company_settings cs WHERE cs.worker_number_prefix = v_candidate AND cs.company_id IS DISTINCT FROM p_company_id) LOOP
    n := n + 1;
    IF n > 99 THEN RAISE EXCEPTION 'No free worker-number prefix left for %', v_base; END IF;
    v_candidate := v_base || n::text;
  END LOOP;
  RETURN v_candidate;
END;
$$;
REVOKE ALL ON FUNCTION public.worker_unique_prefix(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.company_settings_worker_prefix()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_existing text;
BEGIN
  IF NEW.worker_number_prefix IS NULL OR btrim(NEW.worker_number_prefix) = '' THEN
    SELECT cs.worker_number_prefix INTO v_existing FROM public.company_settings cs WHERE cs.company_id = NEW.company_id AND cs.worker_number_prefix IS NOT NULL LIMIT 1;
    NEW.worker_number_prefix := coalesce(v_existing, public.worker_unique_prefix(
      public.worker_number_prefix_from_name(coalesce(nullif(btrim(NEW.company_name), ''), (SELECT c.name FROM public.companies c WHERE c.id = NEW.company_id))), NEW.company_id));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.company_settings_worker_prefix() FROM PUBLIC, anon, authenticated;

-- companies that share a prefix today: the oldest keeps it, each later one gets a digit, and its workers' numbers follow ("VWW-001" -> "VWW2-001")
DO $$
DECLARE r record; v_new text;
BEGIN
  FOR r IN
    SELECT x.company_id, x.p FROM (
      SELECT cs.company_id, cs.worker_number_prefix AS p,
             row_number() OVER (PARTITION BY cs.worker_number_prefix ORDER BY c.created_at NULLS LAST, c.id) AS rn
        FROM public.company_settings cs JOIN public.companies c ON c.id = cs.company_id
       WHERE cs.worker_number_prefix IS NOT NULL) x
     WHERE x.rn > 1 ORDER BY x.rn, x.company_id
  LOOP
    v_new := public.worker_unique_prefix(r.p, r.company_id);
    UPDATE public.company_settings SET worker_number_prefix = v_new WHERE company_id = r.company_id;
    UPDATE public.workers SET employee_id = v_new || substr(employee_id, length(r.p) + 1) WHERE company_id = r.company_id AND employee_id LIKE r.p || '-%';
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS company_settings_worker_number_prefix_key ON public.company_settings (worker_number_prefix) WHERE worker_number_prefix IS NOT NULL;

-- ── A2. A worker number is unique across ALL companies (it was unique per company), so a number alone identifies one worker ─────────────────────────────────
DROP INDEX IF EXISTS public.workers_company_employee_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS workers_employee_id_key ON public.workers (lower(employee_id)) WHERE employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.next_worker_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_prefix text; v_n integer; v_candidate text;
BEGIN
  SELECT cs.worker_number_prefix INTO v_prefix FROM public.company_settings cs WHERE cs.company_id = p_company_id AND cs.worker_number_prefix IS NOT NULL LIMIT 1;
  IF v_prefix IS NULL THEN
    v_prefix := public.worker_unique_prefix(public.worker_number_prefix_from_name((SELECT coalesce(nullif(btrim(cs.company_name), ''), c.name) FROM public.companies c LEFT JOIN public.company_settings cs ON cs.company_id = c.id WHERE c.id = p_company_id LIMIT 1)), p_company_id);
  END IF;
  LOOP
    INSERT INTO public.worker_number_counters AS k (company_id, last_number) VALUES (p_company_id, 1)
      ON CONFLICT (company_id) DO UPDATE SET last_number = k.last_number + 1
      RETURNING k.last_number INTO v_n;
    v_candidate := v_prefix || '-' || CASE WHEN v_n < 1000 THEN lpad(v_n::text, 3, '0') ELSE v_n::text END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.workers w WHERE lower(w.employee_id) = lower(v_candidate));      -- any company: a number is never shared
  END LOOP;
  RETURN v_candidate;
END;
$$;
REVOKE ALL ON FUNCTION public.next_worker_number(uuid) FROM PUBLIC, anon, authenticated;

-- ── A3. The tables: nobody but the service role and the functions below ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worker_portal_access (
  worker_id        uuid PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pin_hash         text NOT NULL,
  must_change_pin  boolean NOT NULL DEFAULT true,
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  enabled          boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_login_at    timestamptz,
  pin_changed_at   timestamptz
);
CREATE TABLE IF NOT EXISTS public.worker_portal_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  worker_id   uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_worker_portal_sessions_worker ON public.worker_portal_sessions (worker_id);
CREATE TABLE IF NOT EXISTS public.worker_portal_login_attempts (
  id            bigserial PRIMARY KEY,
  ip_hash       text NOT NULL,
  attempted_at  timestamptz NOT NULL DEFAULT now(),
  ok            boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_worker_portal_login_attempts_ip ON public.worker_portal_login_attempts (ip_hash, attempted_at);
ALTER TABLE public.worker_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_portal_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worker_portal_access, public.worker_portal_sessions, public.worker_portal_login_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.worker_portal_login_attempts_id_seq FROM PUBLIC, anon, authenticated;

-- ── Helpers (internal: nobody calls them directly) ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._worker_hash_token(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $$ SELECT encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;

-- A company that is past its trial and has no active subscription is inactive (the same rule as the staff app's "subscription expired" page).
CREATE OR REPLACE FUNCTION public._worker_portal_company_active(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce((SELECT (cs.trial_expires_at IS NULL OR cs.trial_expires_at > now())
                          OR (cs.subscription_status = 'active' AND (cs.subscription_expires_at IS NULL OR cs.subscription_expires_at > now()))
                     FROM public.company_settings cs WHERE cs.company_id = p_company_id LIMIT 1), true)
$$;

-- The session behind a token: a live (not revoked, not expired) session of a worker whose access is on, who is active, in a company that is active.
-- Until the temporary PIN has been replaced only p_allow_pending (change PIN) gets through.
CREATE OR REPLACE FUNCTION public._worker_session(p_token text, p_allow_pending boolean DEFAULT false)
RETURNS TABLE (worker_id uuid, company_id uuid, must_change_pin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT s.worker_id, s.company_id, a.must_change_pin
    FROM public.worker_portal_sessions s
    JOIN public.worker_portal_access a ON a.worker_id = s.worker_id
    JOIN public.workers w ON w.id = s.worker_id AND w.company_id = s.company_id
   WHERE p_token IS NOT NULL AND length(p_token) BETWEEN 20 AND 200
     AND s.token_hash = public._worker_hash_token(p_token)
     AND s.revoked_at IS NULL AND s.expires_at > now()
     AND a.enabled AND w.status = 'active'
     AND public._worker_portal_company_active(s.company_id)
     AND (p_allow_pending OR NOT a.must_change_pin)
$$;

CREATE OR REPLACE FUNCTION public._worker_portal_staff_ok(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_company_id IS NOT NULL AND (
    public._caller_may_use_company(NULL)        -- the service role, or a direct database connection
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.company_id = p_company_id AND up.role IN ('director', 'admin', 'secretary') AND coalesce(up.status, 'active') = 'active'))
$$;
REVOKE ALL ON FUNCTION public._worker_hash_token(text), public._worker_portal_company_active(uuid), public._worker_session(text, boolean), public._worker_portal_staff_ok(uuid) FROM PUBLIC, anon, authenticated;

-- ── B. Login (service role only) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- The worker for a number and everything the edge function needs to decide. NULL when no such worker has portal access. The hash goes to the service role only.
CREATE OR REPLACE FUNCTION public.worker_portal_login_state(p_number text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record;
BEGIN
  SELECT w.id AS worker_id, w.company_id, w.status, a.pin_hash, a.must_change_pin, a.failed_attempts, a.locked_until, a.enabled INTO r
    FROM public.workers w JOIN public.worker_portal_access a ON a.worker_id = w.id
   WHERE lower(w.employee_id) = lower(btrim(coalesce(p_number, ''))) LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'worker_id', r.worker_id, 'company_id', r.company_id, 'pin_hash', r.pin_hash, 'must_change_pin', r.must_change_pin,
    'failed_attempts', r.failed_attempts, 'locked_until', CASE WHEN r.locked_until = 'infinity' THEN NULL ELSE r.locked_until END,
    'locked', coalesce(r.locked_until > now(), false) OR r.failed_attempts >= 10,
    'enabled', r.enabled, 'worker_active', r.status = 'active', 'company_active', public._worker_portal_company_active(r.company_id),
    'can_try', r.enabled AND r.status = 'active' AND public._worker_portal_company_active(r.company_id) AND r.failed_attempts < 10 AND coalesce(r.locked_until <= now(), true));
END;
$$;

-- A wrong PIN: 5 wrong tries lock the worker for 15 minutes (each further wrong try renews it), 10 lock until the office unlocks / resets.
CREATE OR REPLACE FUNCTION public.worker_portal_record_failure(p_worker_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_n integer; v_until timestamptz;
BEGIN
  UPDATE public.worker_portal_access SET failed_attempts = failed_attempts + 1 WHERE worker_id = p_worker_id RETURNING failed_attempts INTO v_n;
  IF v_n IS NULL THEN RETURN NULL; END IF;
  v_until := CASE WHEN v_n >= 10 THEN 'infinity'::timestamptz WHEN v_n >= 5 THEN now() + interval '15 minutes' ELSE NULL END;
  UPDATE public.worker_portal_access SET locked_until = v_until WHERE worker_id = p_worker_id;
  RETURN jsonb_build_object('failed_attempts', v_n, 'locked', v_until IS NOT NULL, 'until_office', v_n >= 10);
END;
$$;

-- The PIN was right: clear the counter and open a session (the caller sends only the hash of the token it will hand to the browser).
CREATE OR REPLACE FUNCTION public.worker_portal_record_success(p_worker_id uuid, p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_company uuid; v_must boolean; v_expires timestamptz;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Bad token hash' USING ERRCODE = '22023'; END IF;
  UPDATE public.worker_portal_access SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE worker_id = p_worker_id
    RETURNING company_id, must_change_pin INTO v_company, v_must;
  IF v_company IS NULL THEN RETURN NULL; END IF;
  DELETE FROM public.worker_portal_sessions WHERE worker_id = p_worker_id AND (expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days');
  INSERT INTO public.worker_portal_sessions (token_hash, worker_id, company_id) VALUES (p_token_hash, p_worker_id, v_company) RETURNING expires_at INTO v_expires;
  RETURN jsonb_build_object('must_change_pin', v_must, 'expires_at', v_expires);
END;
$$;

-- The worker chose a new PIN (the temporary one, or a normal change): every other session of theirs ends.
CREATE OR REPLACE FUNCTION public.worker_portal_change_pin(p_token text, p_pin_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_worker uuid;
BEGIN
  IF p_pin_hash IS NULL OR p_pin_hash !~ '^pbkdf2_sha256\$[0-9]+\$' THEN RAISE EXCEPTION 'Bad PIN hash' USING ERRCODE = '22023'; END IF;
  SELECT s.worker_id INTO v_worker FROM public._worker_session(p_token, true) s;
  IF v_worker IS NULL THEN RETURN false; END IF;
  UPDATE public.worker_portal_access SET pin_hash = p_pin_hash, must_change_pin = false, failed_attempts = 0, locked_until = NULL, pin_changed_at = now() WHERE worker_id = v_worker;
  UPDATE public.worker_portal_sessions SET revoked_at = now() WHERE worker_id = v_worker AND revoked_at IS NULL AND token_hash <> public._worker_hash_token(p_token);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_portal_logout(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.worker_portal_sessions SET revoked_at = now() WHERE token_hash = public._worker_hash_token(p_token) AND revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_portal_ip_blocked(p_ip_hash text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT (SELECT count(*) FROM public.worker_portal_login_attempts WHERE ip_hash = p_ip_hash AND NOT ok AND attempted_at > now() - interval '15 minutes') >= 20 $$;

CREATE OR REPLACE FUNCTION public.worker_portal_ip_record(p_ip_hash text, p_ok boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO public.worker_portal_login_attempts (ip_hash, ok) VALUES (left(coalesce(p_ip_hash, ''), 128), coalesce(p_ok, false));
  DELETE FROM public.worker_portal_login_attempts WHERE attempted_at < now() - interval '1 day';
END;
$$;

-- The stored passport photo of the session's worker (never the ID scan); the files edge function signs it for a few minutes.
CREATE OR REPLACE FUNCTION public.worker_portal_photo_ref(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object('worker_id', w.id, 'company_id', w.company_id, 'photo', nullif(btrim(coalesce(w.passport_photo_url, '')), ''))
    FROM public._worker_session(p_token) s JOIN public.workers w ON w.id = s.worker_id
$$;

-- The session's worker and the stored PIN hash, for a PIN change (the edge function checks the current PIN of a normal change). Works for a session that still has the temporary PIN.
CREATE OR REPLACE FUNCTION public.worker_portal_session_pin(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object('worker_id', s.worker_id, 'must_change_pin', s.must_change_pin, 'pin_hash', a.pin_hash)
    FROM public._worker_session(p_token, true) s JOIN public.worker_portal_access a ON a.worker_id = s.worker_id
$$;

REVOKE ALL ON FUNCTION public.worker_portal_login_state(text), public.worker_portal_record_failure(uuid), public.worker_portal_record_success(uuid, text),
  public.worker_portal_change_pin(text, text), public.worker_portal_logout(text), public.worker_portal_ip_blocked(text), public.worker_portal_ip_record(text, boolean),
  public.worker_portal_photo_ref(text), public.worker_portal_session_pin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_portal_login_state(text), public.worker_portal_record_failure(uuid), public.worker_portal_record_success(uuid, text),
  public.worker_portal_change_pin(text, text), public.worker_portal_logout(text), public.worker_portal_ip_blocked(text), public.worker_portal_ip_record(text, boolean),
  public.worker_portal_photo_ref(text), public.worker_portal_session_pin(text) TO service_role;

-- ── C. Staff: director / admin / secretary of the worker's company (or the service role) ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.worker_portal_staff_status(p_worker_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE w record; a record;
BEGIN
  SELECT id, company_id, employee_id, status INTO w FROM public.workers WHERE id = p_worker_id;
  IF NOT FOUND OR NOT public._worker_portal_staff_ok(w.company_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.worker_portal_access WHERE worker_id = p_worker_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('has_access', false, 'employee_id', w.employee_id, 'worker_active', w.status = 'active'); END IF;
  RETURN jsonb_build_object('has_access', true, 'enabled', a.enabled, 'must_change_pin', a.must_change_pin, 'failed_attempts', a.failed_attempts,
    'locked', coalesce(a.locked_until > now(), false) OR a.failed_attempts >= 10, 'needs_office_unlock', a.failed_attempts >= 10,
    'locked_until', CASE WHEN a.locked_until = 'infinity' THEN NULL ELSE a.locked_until END, 'last_login_at', a.last_login_at, 'created_at', a.created_at,
    'pin_changed_at', a.pin_changed_at, 'employee_id', w.employee_id, 'worker_active', w.status = 'active');
END;
$$;

-- Give access / reset the PIN: stores the HASH of a temporary PIN (the edge function made it), the worker must choose their own at the first login, every session ends.
CREATE OR REPLACE FUNCTION public.worker_portal_staff_set_pin(p_worker_id uuid, p_pin_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE w record;
BEGIN
  SELECT id, company_id, employee_id, status INTO w FROM public.workers WHERE id = p_worker_id;
  IF NOT FOUND OR NOT public._worker_portal_staff_ok(w.company_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF p_pin_hash IS NULL OR p_pin_hash !~ '^pbkdf2_sha256\$[0-9]+\$' THEN RAISE EXCEPTION 'Bad PIN hash' USING ERRCODE = '22023'; END IF;
  IF w.status <> 'active' THEN RAISE EXCEPTION 'The worker is not active' USING ERRCODE = '22023'; END IF;
  IF w.employee_id IS NULL THEN RAISE EXCEPTION 'The worker has no worker number' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.worker_portal_access (worker_id, company_id, pin_hash, must_change_pin, enabled, created_by)
  VALUES (w.id, w.company_id, p_pin_hash, true, true, auth.uid())
  ON CONFLICT (worker_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, must_change_pin = true, failed_attempts = 0, locked_until = NULL, enabled = true, pin_changed_at = now();
  UPDATE public.worker_portal_sessions SET revoked_at = now() WHERE worker_id = w.id AND revoked_at IS NULL;
  RETURN jsonb_build_object('employee_id', w.employee_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_portal_staff_unlock(p_worker_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.workers WHERE id = p_worker_id;
  IF v_company IS NULL OR NOT public._worker_portal_staff_ok(v_company) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE public.worker_portal_access SET failed_attempts = 0, locked_until = NULL WHERE worker_id = p_worker_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.worker_portal_staff_set_enabled(p_worker_id uuid, p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.workers WHERE id = p_worker_id;
  IF v_company IS NULL OR NOT public._worker_portal_staff_ok(v_company) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE public.worker_portal_access SET enabled = coalesce(p_enabled, false) WHERE worker_id = p_worker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The worker has no portal access yet' USING ERRCODE = 'P0002'; END IF;
  IF NOT coalesce(p_enabled, false) THEN UPDATE public.worker_portal_sessions SET revoked_at = now() WHERE worker_id = p_worker_id AND revoked_at IS NULL; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.worker_portal_staff_status(uuid), public.worker_portal_staff_set_pin(uuid, text), public.worker_portal_staff_unlock(uuid), public.worker_portal_staff_set_enabled(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_portal_staff_status(uuid), public.worker_portal_staff_set_pin(uuid, text), public.worker_portal_staff_unlock(uuid), public.worker_portal_staff_set_enabled(uuid, boolean) TO authenticated, service_role;

-- ── D. What a worker reads: each takes the session token and returns only that worker's data ──────────────────────────────────────────────────────────────
-- Home: the worker (allow-listed: no rates, bank, ID number, notes, email, address), the company's look, and the totals. {"must_change_pin": true} until the temporary PIN is replaced.
CREATE OR REPLACE FUNCTION public.worker_portal_home(p_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE s record; w record; c jsonb; v_today date := ((now() - interval '5 hours') AT TIME ZONE 'UTC')::date;   -- Jamaica is UTC-5 all year
        v_month numeric; v_year numeric; v_month_n integer; v_year_n integer;
BEGIN
  SELECT * INTO s FROM public._worker_session(p_token, true) LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT w2.first_name, w2.last_name, w2.employee_id, w2.job_title, w2.worker_type, w2.phone, w2.hire_date, w2.id_expiry_date, w2.verify_code,
         nullif(btrim(coalesce(w2.passport_photo_url, '')), '') IS NOT NULL AS has_photo INTO w FROM public.workers w2 WHERE w2.id = s.worker_id;
  IF s.must_change_pin THEN RETURN jsonb_build_object('must_change_pin', true, 'first_name', w.first_name, 'employee_id', w.employee_id); END IF;
  SELECT jsonb_build_object('name', coalesce(nullif(btrim(cs.company_name), ''), co.name), 'tagline', cs.tagline, 'logo_url', cs.logo_url, 'phone', cs.phone, 'email', cs.email,
                            'id_card_primary', cs.id_card_primary, 'id_card_accent', cs.id_card_accent)
    INTO c FROM public.companies co LEFT JOIN public.company_settings cs ON cs.company_id = co.id WHERE co.id = s.company_id LIMIT 1;
  SELECT coalesce(sum(f.total_amount) FILTER (WHERE date_trunc('month', f.work_date::timestamp) = date_trunc('month', v_today::timestamp)), 0),
         coalesce(sum(f.total_amount) FILTER (WHERE date_trunc('year', f.work_date::timestamp) = date_trunc('year', v_today::timestamp)), 0),
         count(*) FILTER (WHERE date_trunc('month', f.work_date::timestamp) = date_trunc('month', v_today::timestamp)),
         count(*) FILTER (WHERE date_trunc('year', f.work_date::timestamp) = date_trunc('year', v_today::timestamp))
    INTO v_month, v_year, v_month_n, v_year_n
    FROM public.field_payments f WHERE f.worker_id = s.worker_id AND f.company_id = s.company_id AND f.status IN ('signed', 'completed');
  RETURN jsonb_build_object('must_change_pin', false,
    'worker', jsonb_build_object('first_name', w.first_name, 'last_name', w.last_name, 'employee_id', w.employee_id, 'job_title', w.job_title, 'worker_type', w.worker_type,
                                 'phone', w.phone, 'hire_date', w.hire_date, 'id_expiry_date', w.id_expiry_date, 'verify_code', w.verify_code, 'has_photo', w.has_photo),
    'company', c,
    'totals', jsonb_build_object('month', v_month, 'month_count', v_month_n, 'year', v_year, 'year_count', v_year_n, 'as_of', v_today));
END;
$$;

-- My payments, newest first: only the columns a worker needs (never ID numbers, photos, notes, supervisors or finance links).
CREATE OR REPLACE FUNCTION public.worker_portal_payments(p_token text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.work_date DESC, x.created_at DESC), '[]'::jsonb) FROM (
    SELECT f.id, f.work_date, f.created_at, coalesce(nullif(btrim(f.project_name), ''), pr.name) AS project, f.work_type AS description, f.payment_type,
           f.total_amount AS amount, CASE WHEN f.payment_type = 'advance' THEN coalesce(nullif(f.advance_amount, 0), f.total_amount) ELSE 0 END AS advance_amount,
           f.receipt_number, f.status
      FROM public._worker_session(p_token) s
      JOIN public.field_payments f ON f.worker_id = s.worker_id AND f.company_id = s.company_id AND f.status IN ('signed', 'completed')
      LEFT JOIN public.projects pr ON pr.id = f.project_id
     ORDER BY f.work_date DESC, f.created_at DESC
     LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0))) x
$$;

-- Advances per project: paid, already taken off a final payment (the same rule as the receipt: field_payment_previous_advances), and what is left.
CREATE OR REPLACE FUNCTION public.worker_portal_advances(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  WITH me AS (SELECT worker_id, company_id FROM public._worker_session(p_token) LIMIT 1),
  adv AS (
    SELECT coalesce(f.project_id::text, lower(btrim(coalesce(f.project_name, ''))), '') AS pkey, max(coalesce(nullif(btrim(f.project_name), ''), pr.name)) AS project,
           sum(coalesce(nullif(f.advance_amount, 0), f.total_amount)) AS advances_paid
      FROM me JOIN public.field_payments f ON f.worker_id = me.worker_id AND f.company_id = me.company_id AND f.payment_type = 'advance' AND f.status IN ('signed', 'completed')
      LEFT JOIN public.projects pr ON pr.id = f.project_id GROUP BY 1),
  fin AS (
    SELECT coalesce(f.project_id::text, lower(btrim(coalesce(f.project_name, ''))), '') AS pkey, sum(public.field_payment_previous_advances(f.id)) AS deducted
      FROM me JOIN public.field_payments f ON f.worker_id = me.worker_id AND f.company_id = me.company_id AND f.payment_type = 'final' AND f.status IN ('signed', 'completed') GROUP BY 1)
  SELECT coalesce(jsonb_agg(jsonb_build_object('project', coalesce(adv.project, 'Project'), 'advances_paid', adv.advances_paid, 'deducted', coalesce(fin.deducted, 0),
                                               'balance', greatest(adv.advances_paid - coalesce(fin.deducted, 0), 0)) ORDER BY adv.project), '[]'::jsonb)
    FROM adv LEFT JOIN fin ON fin.pkey = adv.pkey WHERE adv.advances_paid > 0
$$;

-- Notices of my company that are meant for me (employees: all + internal_staff; subcontractors and crew leads: all + site_workers), pinned first, not expired.
CREATE OR REPLACE FUNCTION public.worker_portal_notices(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'pinned', n.pinned, 'created_at', n.created_at) ORDER BY n.pinned DESC, n.created_at DESC), '[]'::jsonb)
    FROM public._worker_session(p_token) s
    JOIN public.workers w ON w.id = s.worker_id
    JOIN public.worker_portal_notices n ON n.company_id = s.company_id
     AND (n.expires_at IS NULL OR n.expires_at > now())
     AND n.visible_to IN ('all', CASE WHEN w.worker_type = 'employee' THEN 'internal_staff' ELSE 'site_workers' END)
$$;

-- The token of the public receipt page (/receipt/:token) for ONE OF MY payments (signed / completed); NULL for anything else. Reuses the payment's active link.
CREATE OR REPLACE FUNCTION public.worker_portal_receipt_link(p_token text, p_payment_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE s record; v_token text;
BEGIN
  SELECT * INTO s FROM public._worker_session(p_token) LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.field_payments f WHERE f.id = p_payment_id AND f.worker_id = s.worker_id AND f.company_id = s.company_id AND f.status IN ('signed', 'completed')) THEN RETURN NULL; END IF;
  SELECT l.token INTO v_token FROM public.receipt_share_links l WHERE l.kind = 'field_payment' AND l.payment_id = p_payment_id AND l.revoked_at IS NULL;
  IF v_token IS NOT NULL THEN RETURN v_token; END IF;
  INSERT INTO public.receipt_share_links (company_id, kind, payment_id) VALUES (s.company_id, 'field_payment', p_payment_id)
  ON CONFLICT (kind, payment_id) WHERE revoked_at IS NULL DO NOTHING RETURNING token INTO v_token;
  IF v_token IS NULL THEN SELECT l.token INTO v_token FROM public.receipt_share_links l WHERE l.kind = 'field_payment' AND l.payment_id = p_payment_id AND l.revoked_at IS NULL; END IF;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.worker_portal_home(text), public.worker_portal_payments(text, integer, integer), public.worker_portal_advances(text), public.worker_portal_notices(text),
  public.worker_portal_receipt_link(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.worker_portal_home(text), public.worker_portal_payments(text, integer, integer), public.worker_portal_advances(text), public.worker_portal_notices(text),
  public.worker_portal_receipt_link(text, uuid) TO anon, authenticated, service_role;

-- ── final checks: abort (and change nothing) if the result is not what was meant ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.company_settings WHERE worker_number_prefix IS NOT NULL GROUP BY worker_number_prefix HAVING count(*) > 1) THEN RAISE EXCEPTION 'Two companies still share a worker prefix. Nothing was changed.'; END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE employee_id IS NOT NULL GROUP BY lower(employee_id) HAVING count(*) > 1) THEN RAISE EXCEPTION 'Two workers still share a worker number. Nothing was changed.'; END IF;
  FOREACH f IN ARRAY ARRAY['public.worker_portal_access', 'public.worker_portal_sessions', 'public.worker_portal_login_attempts'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = f::regclass) THEN RAISE EXCEPTION '% has no row-level security. Nothing was changed.', f; END IF;
    IF has_table_privilege('anon', f, 'SELECT, INSERT, UPDATE, DELETE') OR has_table_privilege('authenticated', f, 'SELECT, INSERT, UPDATE, DELETE') THEN RAISE EXCEPTION '% is open to users. Nothing was changed.', f; END IF;
  END LOOP;
  -- anon may call exactly the five token functions; signed-in users those plus the staff functions; login functions: the service role only
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN
           ('worker_portal_login_state', 'worker_portal_record_failure', 'worker_portal_record_success', 'worker_portal_change_pin', 'worker_portal_logout', 'worker_portal_ip_blocked',
            'worker_portal_ip_record', 'worker_portal_photo_ref', 'worker_portal_session_pin', '_worker_session', '_worker_hash_token', '_worker_portal_staff_ok', '_worker_portal_company_active', 'worker_unique_prefix')
  LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION '% is callable by users. Nothing was changed.', f; END IF;
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'worker_portal_staff_%'
  LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION '% has the wrong grants. Nothing was changed.', f; END IF;
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('worker_portal_home', 'worker_portal_payments', 'worker_portal_advances', 'worker_portal_notices', 'worker_portal_receipt_link')
  LOOP
    IF NOT has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION '% is not callable by the portal pages. Nothing was changed.', f; END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
