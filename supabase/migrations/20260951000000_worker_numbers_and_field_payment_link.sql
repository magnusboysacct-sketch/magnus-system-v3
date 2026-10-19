-- Worker portal step 2 (run after 20260950000000): a number for every worker, and a real link from a field payment to the worker it was paid to.
--
--  1. Worker numbers. company_settings.worker_number_prefix (2-5 capital letters; changed only through the existing director / admin settings policy). Our company gets MBW; any other
--     company gets the initials of its name + "W" (Yaad and aboard -> YAW), and so does a company created later (trigger on company_settings).
--     workers.employee_id becomes "<PREFIX>-001", "-002", ... per company (3 digits, growing past 999), unique per company, filled in by a trigger when a worker is added without one.
--     Every existing worker is numbered now, oldest first. Numbers come from a counter that only goes up, so a number is never given out twice, even after a worker is deleted.
--     Changing the prefix later only affects new workers. Only a director or admin of the company (or the service role / a direct database connection) may type or change a number;
--     for anyone else a number they send is replaced by the next one on insert and refused on update.
--  2. field_payments.worker_id (NULL = casual labour, a one-off name): references workers, ON DELETE SET NULL, indexed, and a trigger refuses a worker of another company.
--     NO existing payment is changed here. scripts/field-payment-worker-matches.csv lists proposed matches and supabase/scripts/backfill-field-payment-workers.sql applies the approved ones.
--
-- Changes data only in workers.employee_id (the numbering above). Nothing else is touched.

BEGIN;

-- ── safety checks: stop (and change nothing) if the database is not what this file expects ────────────────────────────────────────────────────────────────
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['company_settings', 'companies', 'workers', 'field_payments', 'user_profiles'] LOOP
    IF to_regclass('public.' || s) IS NULL THEN RAISE EXCEPTION 'Table public.% was not found. Nothing was changed.', s; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workers' AND column_name = 'employee_id')
    THEN RAISE EXCEPTION 'workers.employee_id was not found. Nothing was changed.'; END IF;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = '_caller_may_use_company') <> 1
    THEN RAISE EXCEPTION 'Function public._caller_may_use_company() was not found. Nothing was changed.'; END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE nullif(btrim(employee_id), '') IS NOT NULL GROUP BY company_id, lower(btrim(employee_id)) HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'Two workers of one company already have the same employee_id. Fix that first. Nothing was changed.'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'field_payments' AND column_name = 'worker_id') THEN
    RAISE NOTICE 'field_payments.worker_id already exists: it is left as it is.';
  END IF;
END $$;

-- ── 1a. The prefix ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS worker_number_prefix text;
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_worker_number_prefix_check;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_worker_number_prefix_check CHECK (worker_number_prefix IS NULL OR worker_number_prefix ~ '^[A-Z]{2,5}$');

-- Initials of the words of the name (company-form words and "and" / "of" left out, at most four) + "W"; WK when the name has no usable letters. Same as defaultWorkerPrefix() in src/lib/workerNumber.ts.
CREATE OR REPLACE FUNCTION public.worker_number_prefix_from_name(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce(
           (SELECT left(string_agg(left(w, 1), '' ORDER BY n), 4) || 'W'
              FROM regexp_split_to_table(regexp_replace(upper(coalesce(p_name, '')), '[''’]', '', 'g'), '[^A-Z]+') WITH ORDINALITY AS t(w, n)
             WHERE w <> '' AND w NOT IN ('LTD', 'LIMITED', 'INC', 'INCORPORATED', 'CO', 'COMPANY', 'CORP', 'CORPORATION', 'LLC', 'PVT', 'THE', 'AND', 'OF')
            HAVING count(*) > 0),
           'WK');
$$;
REVOKE ALL ON FUNCTION public.worker_number_prefix_from_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_number_prefix_from_name(text) TO authenticated, service_role;

-- Keeps an existing prefix when a save does not send one (an upsert without it must not reset MBW), and gives a company with none the default from its name.
CREATE OR REPLACE FUNCTION public.company_settings_worker_prefix()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_existing text;
BEGIN
  IF NEW.worker_number_prefix IS NULL OR btrim(NEW.worker_number_prefix) = '' THEN
    SELECT cs.worker_number_prefix INTO v_existing FROM public.company_settings cs WHERE cs.company_id = NEW.company_id AND cs.worker_number_prefix IS NOT NULL LIMIT 1;
    NEW.worker_number_prefix := coalesce(v_existing, public.worker_number_prefix_from_name(coalesce(nullif(btrim(NEW.company_name), ''), (SELECT c.name FROM public.companies c WHERE c.id = NEW.company_id))));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.company_settings_worker_prefix() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS company_settings_worker_prefix ON public.company_settings;
CREATE TRIGGER company_settings_worker_prefix BEFORE INSERT OR UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.company_settings_worker_prefix();

-- existing companies: ours is MBW, every other one gets the default from its name
UPDATE public.company_settings SET worker_number_prefix = 'MBW' WHERE company_id = '813ffe22-b75c-49c5-b41e-3ab185e2724c' AND worker_number_prefix IS NULL;
UPDATE public.company_settings cs SET worker_number_prefix = public.worker_number_prefix_from_name(coalesce(nullif(btrim(cs.company_name), ''), (SELECT c.name FROM public.companies c WHERE c.id = cs.company_id)))
 WHERE cs.worker_number_prefix IS NULL;

-- ── 1b. The counter (only ever goes up: a number is never handed out twice) ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worker_number_counters (
  company_id  uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);
ALTER TABLE public.worker_number_counters ENABLE ROW LEVEL SECURITY;      -- no policy: only the functions below (and the service role) touch it
REVOKE ALL ON public.worker_number_counters FROM PUBLIC, anon, authenticated;

-- The next free number of a company: "<PREFIX>-001"... Skips a number a director typed by hand, so it never collides.
CREATE OR REPLACE FUNCTION public.next_worker_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_prefix text; v_n integer; v_candidate text;
BEGIN
  SELECT cs.worker_number_prefix INTO v_prefix FROM public.company_settings cs WHERE cs.company_id = p_company_id AND cs.worker_number_prefix IS NOT NULL LIMIT 1;
  IF v_prefix IS NULL THEN
    v_prefix := public.worker_number_prefix_from_name((SELECT coalesce(nullif(btrim(cs.company_name), ''), c.name) FROM public.companies c LEFT JOIN public.company_settings cs ON cs.company_id = c.id WHERE c.id = p_company_id LIMIT 1));
  END IF;
  LOOP
    INSERT INTO public.worker_number_counters AS k (company_id, last_number) VALUES (p_company_id, 1)
      ON CONFLICT (company_id) DO UPDATE SET last_number = k.last_number + 1
      RETURNING k.last_number INTO v_n;
    v_candidate := v_prefix || '-' || CASE WHEN v_n < 1000 THEN lpad(v_n::text, 3, '0') ELSE v_n::text END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.company_id = p_company_id AND lower(w.employee_id) = lower(v_candidate));
  END LOOP;
  RETURN v_candidate;
END;
$$;
REVOKE ALL ON FUNCTION public.next_worker_number(uuid) FROM PUBLIC, anon, authenticated;

-- ── 1c. Number every existing worker, oldest first ──────────────────────────────────────────────────────────────────────────────────────────────────────
UPDATE public.workers SET employee_id = NULL WHERE employee_id IS NOT NULL AND btrim(employee_id) = '';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, company_id FROM public.workers WHERE employee_id IS NULL ORDER BY company_id, created_at NULLS LAST, id LOOP
    UPDATE public.workers SET employee_id = public.next_worker_number(r.company_id) WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS workers_company_employee_id_key ON public.workers (company_id, employee_id) WHERE employee_id IS NOT NULL;

-- ── 1d. New workers get the next number; only a director / admin changes one ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workers_employee_id_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_may_set boolean;
BEGIN
  -- may this caller choose a number? the service role / a direct database connection, or a director / admin of the worker's company
  v_may_set := public._caller_may_use_company(NULL)
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.company_id = NEW.company_id AND up.role IN ('director', 'admin') AND coalesce(up.status, 'active') = 'active');

  IF TG_OP = 'INSERT' THEN
    NEW.employee_id := nullif(btrim(NEW.employee_id), '');
    IF NEW.employee_id IS NULL OR NOT v_may_set THEN NEW.employee_id := public.next_worker_number(NEW.company_id); END IF;
  ELSIF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    IF NOT v_may_set THEN RAISE EXCEPTION 'Not allowed: only a director or admin can change a worker number' USING ERRCODE = '42501'; END IF;
    NEW.employee_id := nullif(btrim(NEW.employee_id), '');
    IF NEW.employee_id IS NULL THEN NEW.employee_id := OLD.employee_id; END IF;     -- a worker always keeps a number
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.workers_employee_id_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS workers_employee_id_guard ON public.workers;
CREATE TRIGGER workers_employee_id_guard BEFORE INSERT OR UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.workers_employee_id_guard();

-- ── 2. field_payments.worker_id ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.field_payments ADD COLUMN IF NOT EXISTS worker_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.field_payments'::regclass AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.field_payments'::regclass AND attname = 'worker_id')]) THEN
    ALTER TABLE public.field_payments ADD CONSTRAINT field_payments_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_field_payments_worker_id ON public.field_payments (worker_id);

-- the worker must belong to the same company as the payment
CREATE OR REPLACE FUNCTION public.field_payments_worker_same_company()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.worker_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = NEW.worker_id AND w.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'The worker belongs to another company' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.field_payments_worker_same_company() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS field_payments_worker_same_company ON public.field_payments;
CREATE TRIGGER field_payments_worker_same_company BEFORE INSERT OR UPDATE OF worker_id, company_id ON public.field_payments FOR EACH ROW EXECUTE FUNCTION public.field_payments_worker_same_company();

-- ── final checks: abort (and change nothing) if the result is not what was meant ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.company_settings WHERE worker_number_prefix IS NULL) THEN RAISE EXCEPTION 'A company still has no worker prefix. Nothing was changed.'; END IF;
  IF (SELECT worker_number_prefix FROM public.company_settings WHERE company_id = '813ffe22-b75c-49c5-b41e-3ab185e2724c') IS DISTINCT FROM 'MBW'
     AND EXISTS (SELECT 1 FROM public.company_settings WHERE company_id = '813ffe22-b75c-49c5-b41e-3ab185e2724c')
    THEN RAISE EXCEPTION 'Our company does not have the prefix MBW. Nothing was changed.'; END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE employee_id IS NULL OR btrim(employee_id) = '') THEN RAISE EXCEPTION 'A worker is still without a number. Nothing was changed.'; END IF;
  IF EXISTS (SELECT 1 FROM public.workers GROUP BY company_id, lower(employee_id) HAVING count(*) > 1) THEN RAISE EXCEPTION 'Two workers have the same number. Nothing was changed.'; END IF;
  IF has_function_privilege('anon', 'public.next_worker_number(uuid)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.next_worker_number(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.workers_employee_id_guard()', 'EXECUTE') OR has_function_privilege('anon', 'public.field_payments_worker_same_company()', 'EXECUTE')
     OR has_table_privilege('anon', 'public.worker_number_counters', 'SELECT') OR has_table_privilege('authenticated', 'public.worker_number_counters', 'SELECT')
    THEN RAISE EXCEPTION 'A new function or table is open to signed-in or signed-out users. Nothing was changed.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_payments_worker_id_fkey' AND confdeltype = 'n') THEN RAISE EXCEPTION 'field_payments.worker_id is not ON DELETE SET NULL. Nothing was changed.'; END IF;
  IF EXISTS (SELECT 1 FROM public.field_payments WHERE worker_id IS NOT NULL) THEN RAISE NOTICE 'Some field payments already have a worker_id: left untouched.'; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
