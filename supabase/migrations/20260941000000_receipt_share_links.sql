-- Receipt links: a payment receipt (worker advance / progress / final payment, or a client payment) can be shared with a link that opens, prints and saves the
-- receipt without logging in, and whose WhatsApp / social preview shows the company's own logo and name.
--
--   receipt_share_links              one row per shared receipt: an unguessable token (32 random bytes, hex) for ONE payment. Staff of the payment's company
--                                    can see, create and revoke them; anon can do nothing with the table.
--   create_receipt_link(kind, id)    SECURITY INVOKER: returns the payment's active link token, creating it if there is none (never a second active link).
--   revoke_receipt_link(token)       SECURITY INVOKER: revokes it.
--   get_public_receipt(token)        SECURITY DEFINER, anon: ONLY what the receipt shows (see below); NULL for an unknown / revoked token or a cancelled payment.
--   field_payment_advances_before()  The ONE definition of "previous advances" on a final payment (used by the public page and every print path).
--   field_payment_previous_advances  The same, for a saved payment.
--   get_share_preview                extended with kind 'receipt' (title "Payment receipt – <company>"); never an amount or a name.
--
-- The public receipt deliberately leaves out: the worker's ID number, phone and signature, notes, "paid by", the invoice's remaining balance, and anything else
-- not listed in get_public_receipt below.
-- Read-only for anon; nothing here changes existing data.

BEGIN;

-- ── 1. The links table ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.receipt_share_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id),
  kind        text        NOT NULL CHECK (kind IN ('field_payment', 'client_payment')),
  payment_id  uuid        NOT NULL,                       -- field_payments.id or client_payments.id, by kind (no FK: two possible tables)
  token       text        NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_by  uuid        DEFAULT auth.uid() REFERENCES public.user_profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  CONSTRAINT receipt_share_links_token_shape CHECK (token ~ '^[0-9a-f]{64}$')
);

-- at most ONE active link per payment (a revoked one may be followed by a new one)
CREATE UNIQUE INDEX IF NOT EXISTS receipt_share_links_one_active_per_payment
  ON public.receipt_share_links (kind, payment_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS receipt_share_links_company_idx ON public.receipt_share_links (company_id);

ALTER TABLE public.receipt_share_links ENABLE ROW LEVEL SECURITY;

-- The signed-in user's company, if they are staff (a 'worker' account is never staff).
CREATE OR REPLACE FUNCTION public._receipt_staff_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT up.company_id FROM user_profiles up WHERE up.id = auth.uid() AND lower(coalesce(up.role, '')) <> 'worker' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._receipt_staff_company() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._receipt_staff_company() TO authenticated;

DROP POLICY IF EXISTS receipt_links_select ON public.receipt_share_links;
CREATE POLICY receipt_links_select ON public.receipt_share_links FOR SELECT TO authenticated
  USING (company_id = public._receipt_staff_company());
DROP POLICY IF EXISTS receipt_links_insert ON public.receipt_share_links;
CREATE POLICY receipt_links_insert ON public.receipt_share_links FOR INSERT TO authenticated
  WITH CHECK (company_id = public._receipt_staff_company() AND created_by = auth.uid());
DROP POLICY IF EXISTS receipt_links_update ON public.receipt_share_links;
CREATE POLICY receipt_links_update ON public.receipt_share_links FOR UPDATE TO authenticated
  USING (company_id = public._receipt_staff_company()) WITH CHECK (company_id = public._receipt_staff_company());
-- (no DELETE policy: a link is revoked, never deleted)

REVOKE ALL ON public.receipt_share_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.receipt_share_links TO authenticated;
GRANT UPDATE (revoked_at) ON public.receipt_share_links TO authenticated;     -- the only column a user may change

-- ── 2. Previous advances on a final payment: ONE definition ───────────────────────────────────────────────────────────────────
-- The sum of that worker's EARLIER advance payments on the same project (same task and/or milestone as well, when the final payment names one), leaving out
-- cancelled and draft ones. "Same worker" is worker_ref, or — for older rows that have none — the same reference the app would have built from the name and ID.
-- SECURITY INVOKER: a signed-in user only sees their own company's payments; get_public_receipt calls it with the company given explicitly.
CREATE OR REPLACE FUNCTION public.field_payment_advances_before(
  p_company_id uuid, p_worker_ref text, p_worker_name text, p_worker_id_number text,
  p_project_id uuid, p_project_name text, p_milestone_name text, p_task_name text,
  p_before timestamptz, p_exclude_id uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH me AS (
    SELECT coalesce(nullif(btrim(p_worker_ref), ''),
                    regexp_replace(lower(btrim(coalesce(p_worker_name, ''))), '\s+', '_', 'g') || '_' || btrim(coalesce(p_worker_id_number, ''))) AS wkey,
           coalesce(p_project_id::text, nullif(lower(btrim(coalesce(p_project_name, ''))), ''), '') AS pkey,
           nullif(lower(btrim(coalesce(p_milestone_name, ''))), '') AS mkey,
           nullif(lower(btrim(coalesce(p_task_name, ''))), '') AS tkey
  )
  SELECT coalesce(sum(coalesce(nullif(a.advance_amount, 0), a.total_amount)), 0)
    FROM field_payments a, me
   WHERE a.company_id = p_company_id
     AND a.payment_type = 'advance'
     AND a.status IN ('signed', 'completed')
     AND a.created_at < p_before
     AND (p_exclude_id IS NULL OR a.id <> p_exclude_id)
     AND coalesce(nullif(btrim(a.worker_ref), ''),
                  regexp_replace(lower(btrim(coalesce(a.worker_name, ''))), '\s+', '_', 'g') || '_' || btrim(coalesce(a.worker_id_number, ''))) = me.wkey
     AND coalesce(a.project_id::text, nullif(lower(btrim(coalesce(a.project_name, ''))), ''), '') = me.pkey
     AND (me.mkey IS NULL OR lower(btrim(coalesce(a.milestone_name, ''))) = me.mkey)
     AND (me.tkey IS NULL OR lower(btrim(coalesce(a.task_name, ''))) = me.tkey);
$$;
REVOKE ALL ON FUNCTION public.field_payment_advances_before(uuid, text, text, text, uuid, text, text, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.field_payment_advances_before(uuid, text, text, text, uuid, text, text, text, timestamptz, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.field_payment_previous_advances(p_payment_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN f.payment_type = 'final'
              THEN public.field_payment_advances_before(f.company_id, f.worker_ref, f.worker_name, f.worker_id_number, f.project_id, f.project_name,
                                                        f.milestone_name, f.task_name, f.created_at, f.id)
              ELSE 0 END
    FROM field_payments f WHERE f.id = p_payment_id;
$$;
REVOKE ALL ON FUNCTION public.field_payment_previous_advances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.field_payment_previous_advances(uuid) TO authenticated;

-- ── 3. Create / revoke (staff) ───────────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: the payment must be visible to the caller under the existing row-level security (so only their own company's payments), and the caller must
-- be staff. Returns the active token, creating it only if there is none.
CREATE OR REPLACE FUNCTION public.create_receipt_link(p_kind text, p_payment_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company uuid;
  v_status  text;
  v_token   text;
BEGIN
  IF auth.uid() IS NULL OR public._receipt_staff_company() IS NULL THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('field_payment', 'client_payment') THEN RAISE EXCEPTION 'Unknown receipt kind' USING ERRCODE = '22023'; END IF;

  IF p_kind = 'field_payment' THEN
    SELECT company_id, status INTO v_company, v_status FROM field_payments WHERE id = p_payment_id;
    IF v_company IS NOT NULL AND v_status NOT IN ('signed', 'completed') THEN RAISE EXCEPTION 'This payment has no receipt (status: %)', v_status USING ERRCODE = '22023'; END IF;
  ELSE
    SELECT company_id INTO v_company FROM client_payments WHERE id = p_payment_id;
  END IF;
  IF v_company IS NULL OR v_company IS DISTINCT FROM public._receipt_staff_company() THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002'; END IF;

  SELECT token INTO v_token FROM receipt_share_links WHERE kind = p_kind AND payment_id = p_payment_id AND revoked_at IS NULL;
  IF v_token IS NOT NULL THEN RETURN v_token; END IF;

  INSERT INTO receipt_share_links (company_id, kind, payment_id) VALUES (v_company, p_kind, p_payment_id)
  ON CONFLICT (kind, payment_id) WHERE revoked_at IS NULL DO NOTHING
  RETURNING token INTO v_token;
  IF v_token IS NULL THEN   -- lost a race with another tab: use theirs
    SELECT token INTO v_token FROM receipt_share_links WHERE kind = p_kind AND payment_id = p_payment_id AND revoked_at IS NULL;
  END IF;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.create_receipt_link(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_receipt_link(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_receipt_link(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR public._receipt_staff_company() IS NULL THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  UPDATE receipt_share_links SET revoked_at = now() WHERE token = p_token AND revoked_at IS NULL;   -- row-level security limits this to the caller's company
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_receipt_link(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_receipt_link(text) TO authenticated;

-- ── 4. The public receipt (anon) ─────────────────────────────────────────────────────────────────────────────────────────────
-- Exactly the receipt's own content and nothing else:
--   company:  name, logo, address, phone, email, tagline
--   receipt:  number, date, kind, payment type
--   party:    the worker's NAME (field payment) or the client's name (client payment) — never an ID number, phone, address or signature
--   what for: project, milestone, task and work description (field payment) / the invoice number or project it was paid against (client payment)
--   money:    method, amount, previous advances (final payments only), reference number (client payment)
-- NULL for an unknown or revoked token, a cancelled / draft field payment, or a payment that no longer exists — all identical.
CREATE OR REPLACE FUNCTION public.get_public_receipt(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  l  receipt_share_links%ROWTYPE;
  co record;
  fp field_payments%ROWTYPE;
  cp client_payments%ROWTYPE;
  v_company jsonb;
  v_project text; v_invoice text; v_client text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO l FROM receipt_share_links WHERE token = p_token AND revoked_at IS NULL;
  IF l.id IS NULL THEN RETURN NULL; END IF;

  SELECT cs.company_name, cs.logo_url, cs.address_line1, cs.address_line2, cs.parish, cs.country, cs.phone, cs.email, cs.tagline INTO co
    FROM company_settings cs WHERE cs.company_id = l.company_id LIMIT 1;
  IF co.company_name IS NULL OR btrim(co.company_name) = '' THEN RETURN NULL; END IF;
  v_company := jsonb_build_object(
    'name', btrim(co.company_name), 'logo_url', nullif(btrim(coalesce(co.logo_url, '')), ''),
    'address', nullif(concat_ws(', ', nullif(btrim(coalesce(co.address_line1, '')), ''), nullif(btrim(coalesce(co.address_line2, '')), ''),
                                      nullif(btrim(coalesce(co.parish, '')), ''), nullif(btrim(coalesce(co.country, '')), '')), ''),
    'phone', nullif(btrim(coalesce(co.phone, '')), ''), 'email', nullif(btrim(coalesce(co.email, '')), ''), 'tagline', nullif(btrim(coalesce(co.tagline, '')), ''));

  IF l.kind = 'field_payment' THEN
    SELECT * INTO fp FROM field_payments WHERE id = l.payment_id AND company_id = l.company_id;
    IF fp.id IS NULL OR fp.status NOT IN ('signed', 'completed') THEN RETURN NULL; END IF;
    SELECT p.name INTO v_project FROM projects p WHERE p.id = fp.project_id AND p.company_id = fp.company_id;
    RETURN jsonb_build_object(
      'kind', 'field_payment',
      'company', v_company,
      'receipt_number', fp.receipt_number,
      'receipt_date', fp.created_at,
      'work_date', fp.work_date,
      'payment_type', fp.payment_type,
      'party_name', fp.worker_name,
      'project_name', coalesce(nullif(btrim(coalesce(fp.project_name, '')), ''), v_project),
      'milestone_name', nullif(btrim(coalesce(fp.milestone_name, '')), ''),
      'task_name', nullif(btrim(coalesce(fp.task_name, '')), ''),
      'description', nullif(btrim(coalesce(fp.work_type, '')), ''),
      'payment_method', fp.payment_method,
      'amount', fp.total_amount,
      'previous_advances', CASE WHEN fp.payment_type = 'final'
        THEN public.field_payment_advances_before(fp.company_id, fp.worker_ref, fp.worker_name, fp.worker_id_number, fp.project_id, fp.project_name,
                                                  fp.milestone_name, fp.task_name, fp.created_at, fp.id)
        ELSE NULL END
    );
  END IF;

  SELECT * INTO cp FROM client_payments WHERE id = l.payment_id AND company_id = l.company_id;
  IF cp.id IS NULL THEN RETURN NULL; END IF;
  SELECT c.name INTO v_client FROM clients c WHERE c.id = cp.client_id AND c.company_id = cp.company_id;
  SELECT i.invoice_number, p.name INTO v_invoice, v_project
    FROM client_invoices i LEFT JOIN projects p ON p.id = i.project_id
   WHERE i.id = cp.invoice_id AND i.company_id = cp.company_id;
  IF v_project IS NULL AND cp.project_id IS NOT NULL THEN
    SELECT p.name INTO v_project FROM projects p WHERE p.id = cp.project_id AND p.company_id = cp.company_id;
  END IF;
  RETURN jsonb_build_object(
    'kind', 'client_payment',
    'company', v_company,
    'receipt_number', cp.payment_number,
    'receipt_date', cp.payment_date,
    'party_name', v_client,
    'invoice_number', v_invoice,
    'project_name', v_project,
    'payment_method', cp.payment_method,
    'reference_number', nullif(btrim(coalesce(cp.reference_number, '')), ''),
    'amount', cp.amount
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_receipt(text) TO anon, authenticated;

-- ── 5. Link previews: kind 'receipt' ─────────────────────────────────────────────────────────────────────────────────────────
-- Same as before (20260940000000_get_share_preview.sql) plus 'receipt': the token resolves to its company through receipt_share_links (active links to a
-- payment that still has a receipt only). Title "Payment receipt – <company>"; never an amount or a name.
CREATE OR REPLACE FUNCTION public.get_share_preview(p_kind text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_kind    text := lower(btrim(coalesce(p_kind, '')));
  v_company uuid;
  v_name    text;
  v_logo    text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 OR length(p_token) > 128 OR v_kind NOT IN ('portal', 'contact', 'photos', 'receipt') THEN
    RETURN NULL;
  END IF;

  IF v_kind = 'portal' THEN
    SELECT c.company_id INTO v_company
      FROM clients c
     WHERE c.portal_token::text = p_token AND c.portal_enabled = true
     LIMIT 1;
  ELSIF v_kind = 'contact' THEN
    SELECT c.company_id INTO v_company
      FROM client_contact_portal_access a
      JOIN client_contacts cc ON cc.id = a.contact_id
      JOIN clients c          ON c.id  = cc.client_id
     WHERE a.portal_token = p_token
       AND a.enabled = true AND a.revoked_at IS NULL
       AND c.portal_enabled = true
     LIMIT 1;
  ELSIF v_kind = 'receipt' THEN
    SELECT l.company_id INTO v_company
      FROM receipt_share_links l
     WHERE l.token = p_token AND l.revoked_at IS NULL
       AND ( (l.kind = 'field_payment'  AND EXISTS (SELECT 1 FROM field_payments  f WHERE f.id = l.payment_id AND f.company_id = l.company_id AND f.status IN ('signed', 'completed')))
          OR (l.kind = 'client_payment' AND EXISTS (SELECT 1 FROM client_payments c WHERE c.id = l.payment_id AND c.company_id = l.company_id)) )
     LIMIT 1;
  ELSE
    SELECT l.company_id INTO v_company
      FROM photo_share_links l
     WHERE l.token::text = p_token
       AND l.revoked_at IS NULL
       AND l.expires_at > now()
     LIMIT 1;
  END IF;

  IF v_company IS NULL THEN RETURN NULL; END IF;

  SELECT nullif(btrim(cs.company_name), ''), nullif(btrim(cs.logo_url), '')
    INTO v_name, v_logo
    FROM company_settings cs
   WHERE cs.company_id = v_company
   LIMIT 1;

  IF v_name IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'company_name', v_name,
    'logo_url',     v_logo,
    'title',        CASE v_kind WHEN 'photos' THEN 'Project photos – ' || v_name WHEN 'receipt' THEN 'Payment receipt – ' || v_name ELSE 'Project portal – ' || v_name END,
    'description',  CASE v_kind
                      WHEN 'photos'  THEN 'View the shared project photos. No login needed.'
                      WHEN 'contact' THEN 'Open this link to set up your project portal access.'
                      WHEN 'receipt' THEN 'Open to view and save your receipt.'
                      ELSE                'Sign in to view your project updates and documents.'
                    END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_share_preview(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_preview(text, text) TO anon, authenticated;

COMMIT;
