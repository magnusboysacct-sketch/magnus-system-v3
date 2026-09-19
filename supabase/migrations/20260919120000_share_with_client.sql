-- Add shared_* columns, the share/withdraw RPCs and the session-validated get_portal_* RPCs for sending invoices, contracts and estimates to clients.
BEGIN;

-- 1. "Shared with client" markers. Status columns are untouched.
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_via text,
  ADD COLUMN IF NOT EXISTS shared_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_via text,
  ADD COLUMN IF NOT EXISTS shared_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

ALTER TABLE public.estimate_headers
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_via text,
  ADD COLUMN IF NOT EXISTS shared_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_snapshot jsonb;

-- 2. Helpers (internal only)
CREATE OR REPLACE FUNCTION public._portal_staff_company()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_role text; v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT up.role, up.company_id INTO v_role, v_company
  FROM user_profiles up WHERE up.id = auth.uid();
  IF v_company IS NULL OR v_role IS NULL
     OR v_role NOT IN ('director','admin','estimator','supervisor','office_user','secretary') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN v_company;
END;
$$;

CREATE OR REPLACE FUNCTION public._portal_session_client(p_session_token text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT cps.client_id
  FROM client_portal_sessions cps
  JOIN clients c ON c.id = cps.client_id
  WHERE cps.session_token = p_session_token
    AND cps.expires_at > now()
    AND c.portal_enabled = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._portal_staff_company() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._portal_session_client(text) FROM PUBLIC, anon, authenticated;

-- 3. Staff: SEND to client
CREATE OR REPLACE FUNCTION public.share_with_client(
  p_item_type text, p_item_id uuid, p_via text, p_snapshot jsonb DEFAULT NULL
) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_my_company uuid := public._portal_staff_company();
  v_now        timestamptz := now();
  v_type       text := lower(coalesce(p_item_type, ''));
  v_client_id  uuid; v_company_id uuid; v_project_id uuid; v_status text;
BEGIN
  IF p_via IS NULL OR p_via NOT IN ('portal','link','whatsapp','email') THEN
    RAISE EXCEPTION 'Invalid send method';
  END IF;

  IF v_type = 'invoice' THEN
    SELECT i.client_id, coalesce(i.company_id, c.company_id), i.project_id, i.status
      INTO v_client_id, v_company_id, v_project_id, v_status
    FROM client_invoices i JOIN clients c ON c.id = i.client_id
    WHERE i.id = p_item_id;
    IF v_client_id IS NULL OR v_company_id IS DISTINCT FROM v_my_company THEN
      RAISE EXCEPTION 'Item not found';
    END IF;
    IF v_status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled invoice cannot be sent'; END IF;

    UPDATE client_invoices SET
      shared_at    = coalesce(shared_at, v_now),
      shared_via   = p_via,
      shared_by    = auth.uid(),
      withdrawn_at = NULL,
      status       = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
      sent_date    = coalesce(sent_date, (v_now AT TIME ZONE 'America/Jamaica')::date),
      updated_at   = v_now
    WHERE id = p_item_id;

  ELSIF v_type = 'contract' THEN
    SELECT k.client_id, coalesce(k.company_id, c.company_id), k.project_id, k.status
      INTO v_client_id, v_company_id, v_project_id, v_status
    FROM client_contracts k JOIN clients c ON c.id = k.client_id
    WHERE k.id = p_item_id;
    IF v_client_id IS NULL OR v_company_id IS DISTINCT FROM v_my_company THEN
      RAISE EXCEPTION 'Item not found';
    END IF;
    IF v_status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled contract cannot be sent'; END IF;

    UPDATE client_contracts SET
      shared_at    = coalesce(shared_at, v_now),
      shared_via   = p_via,
      shared_by    = auth.uid(),
      withdrawn_at = NULL,
      updated_at   = v_now
    WHERE id = p_item_id;

  ELSIF v_type = 'estimate' THEN
    IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
      RAISE EXCEPTION 'An estimate needs its client-facing snapshot';
    END IF;
    SELECT p.client_id, c.company_id, e.project_id, e.status
      INTO v_client_id, v_company_id, v_project_id, v_status
    FROM estimate_headers e
    JOIN projects p ON p.id = e.project_id
    JOIN clients  c ON c.id = p.client_id
    WHERE e.id = p_item_id;
    IF v_client_id IS NULL OR v_company_id IS DISTINCT FROM v_my_company THEN
      RAISE EXCEPTION 'Item not found';
    END IF;
    IF v_status = 'archived' THEN RAISE EXCEPTION 'An archived estimate cannot be sent'; END IF;

    UPDATE estimate_headers SET
      shared_at       = coalesce(shared_at, v_now),
      shared_via      = p_via,
      shared_by       = auth.uid(),
      withdrawn_at    = NULL,
      shared_snapshot = p_snapshot,
      status          = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
      updated_at      = v_now
    WHERE id = p_item_id;

  ELSE
    RAISE EXCEPTION 'Unknown item type';
  END IF;

  INSERT INTO client_portal_activity
    (company_id, client_id, project_id, event_type, entity_type, entity_id, metadata)
  VALUES
    (v_company_id, v_client_id, v_project_id, 'item_shared', v_type, p_item_id::text,
     jsonb_build_object('via', p_via, 'by', auth.uid()));

  RETURN v_now;
END;
$$;

-- 4. Staff: WITHDRAW from client
CREATE OR REPLACE FUNCTION public.withdraw_from_client(p_item_type text, p_item_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_my_company uuid := public._portal_staff_company();
  v_now        timestamptz := now();
  v_type       text := lower(coalesce(p_item_type, ''));
  v_client_id  uuid; v_company_id uuid; v_project_id uuid; v_signed timestamptz;
BEGIN
  IF v_type = 'invoice' THEN
    SELECT i.client_id, coalesce(i.company_id, c.company_id), i.project_id
      INTO v_client_id, v_company_id, v_project_id
    FROM client_invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = p_item_id;
    IF v_client_id IS NULL OR v_company_id IS DISTINCT FROM v_my_company THEN
      RAISE EXCEPTION 'Item not found';
    END IF;

    UPDATE client_invoices SET
      shared_at    = NULL,
      withdrawn_at = v_now,
      -- an unpaid "sent" invoice goes back to draft so automatic reminders stop
      status    = CASE WHEN status = 'sent' AND coalesce(amount_paid, 0) = 0 THEN 'draft' ELSE status END,
      sent_date = CASE WHEN status = 'sent' AND coalesce(amount_paid, 0) = 0 THEN NULL ELSE sent_date END,
      updated_at = v_now
    WHERE id = p_item_id;

  ELSIF v_type = 'contract' THEN
    SELECT k.client_id, coalesce(k.company_id, c.company_id), k.project_id, k.client_signed_at
      INTO v_client_id, v_company_id, v_project_id, v_signed
    FROM client_contracts k JOIN clients c ON c.id = k.client_id WHERE k.id = p_item_id;
    IF v_client_id IS NULL OR v_company_id IS DISTINCT FROM v_my_company THEN
      RAISE EXCEPTION 'Item not found';
    END IF;
    IF v_signed IS NOT NULL THEN
      RAISE EXCEPTION 'A contract the client has signed cannot be withdrawn';
    END IF;

    UPDATE client_contracts SET shared_at = NULL, withdrawn_at = v_now, updated_at = v_now
    WHERE id = p_item_id;

  ELSIF v_type = 'estimate' THEN
    SELECT p.client_id, c.company_id, e.project_id
      INTO v_client_id, v_company_id, v_project_id
    FROM estimate_headers e
    JOIN projects p ON p.id = e.project_id
    JOIN clients  c ON c.id = p.client_id
    WHERE e.id = p_item_id;
    IF v_client_id IS NULL OR v_company_id IS DISTINCT FROM v_my_company THEN
      RAISE EXCEPTION 'Item not found';
    END IF;

    UPDATE estimate_headers SET
      shared_at = NULL, withdrawn_at = v_now, shared_snapshot = NULL,
      status = CASE WHEN status = 'sent' THEN 'draft' ELSE status END,
      updated_at = v_now
    WHERE id = p_item_id;

  ELSE
    RAISE EXCEPTION 'Unknown item type';
  END IF;

  INSERT INTO client_portal_activity
    (company_id, client_id, project_id, event_type, entity_type, entity_id, metadata)
  VALUES
    (v_company_id, v_client_id, v_project_id, 'item_withdrawn', v_type, p_item_id::text,
     jsonb_build_object('by', auth.uid()));
END;
$$;

-- 5. Portal: read ONLY what was sent, session-validated
CREATE OR REPLACE FUNCTION public.get_portal_invoices(p_session_token text)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_client uuid := public._portal_session_client(p_session_token);
BEGIN
  IF v_client IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT (to_jsonb(i) - 'created_by' - 'company_id' - 'reminder_enabled' - 'reminder_days_before'
                        - 'reminder_repeat_days' - 'last_reminder_sent_at' - 'shared_by')
           || jsonb_build_object('issue_date', i.invoice_date)
    FROM client_invoices i
    WHERE i.client_id = v_client AND i.shared_at IS NOT NULL
    ORDER BY i.invoice_date DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_portal_contracts(p_session_token text)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_client uuid := public._portal_session_client(p_session_token);
BEGIN
  IF v_client IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT to_jsonb(k) - 'created_by' - 'contractor_signed_by' - 'client_signature_token' - 'shared_by'
    FROM client_contracts k
    WHERE k.client_id = v_client AND k.shared_at IS NOT NULL
    ORDER BY k.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_portal_estimates(p_session_token text)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_client uuid := public._portal_session_client(p_session_token);
BEGIN
  IF v_client IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT jsonb_build_object(
             'id', e.id, 'project_id', e.project_id, 'title', e.title, 'version', e.version,
             'status', e.status, 'shared_at', e.shared_at, 'snapshot', e.shared_snapshot)
    FROM estimate_headers e
    JOIN projects p ON p.id = e.project_id
    WHERE p.client_id = v_client AND e.shared_at IS NOT NULL AND e.shared_snapshot IS NOT NULL
    ORDER BY e.shared_at DESC;
END;
$$;

-- 6. Permissions
REVOKE ALL ON FUNCTION public.share_with_client(text,uuid,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_from_client(text,uuid)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_with_client(text,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_from_client(text,uuid)         TO authenticated;

REVOKE ALL ON FUNCTION public.get_portal_invoices(text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_contracts(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_estimates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_invoices(text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_contracts(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_estimates(text) TO anon, authenticated;

-- 7. Staff sending must not count as "client was active"
CREATE OR REPLACE VIEW public.client_portal_last_seen
WITH (security_invoker = true) AS
SELECT
  client_id,
  max(occurred_at) FILTER (WHERE event_type = 'login')                                       AS last_login_at,
  max(occurred_at) FILTER (WHERE event_type NOT IN ('login_failed','item_shared','item_withdrawn')) AS last_active_at,
  count(*) FILTER (WHERE event_type = 'login' AND occurred_at > now() - interval '30 days')   AS logins_30d,
  count(*) FILTER (WHERE event_type = 'login_failed' AND occurred_at > now() - interval '24 hours') AS failed_24h
FROM public.client_portal_activity
GROUP BY client_id;

COMMIT;
