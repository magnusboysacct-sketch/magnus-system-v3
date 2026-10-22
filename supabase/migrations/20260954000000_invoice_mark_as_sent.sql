-- "Mark as sent" for client invoices that are handed over (or never sent) rather than emailed from the app (run after 20260953000000).
--
-- Sending an invoice today (share_with_client) does exactly this to the row: status draft -> sent, sent_date = today, shared_at / shared_via / shared_by (which is what
-- puts it in the client portal), and one client_portal_activity row. It does NOT touch the invoice number or the due date, writes nothing to the general ledger (there is
-- no trigger on client_invoices), and leaves reminder_enabled alone (default true, so the daily reminder job emails any unpaid, non-draft invoice).
-- mark_invoice_sent() does the same for the books (status 'sent', sent_date = the date given, so AR aging and the dashboard count it) but sends no email or WhatsApp, lets
-- the office pick the date (today or earlier), records HOW it was delivered and WHO marked it, and sets the two switches itself:
--   * reminders: reminder_enabled = what was ticked (default OFF);
--   * portal:    shared_at is set only if "Show in the client portal" was ticked AND the client has portal access.
-- unmark_invoice_sent() takes it back to draft: director / admin only, only while nothing has been paid against the invoice, and only for an invoice that was marked (a
-- really sent one is withdrawn instead). Nothing was posted by the mark, so there is nothing to reverse in the ledger.
-- Changes no existing invoice: the new columns start empty, existing sent invoices keep their reminders and portal exactly as they are.
-- get_portal_invoices() is replaced by the same function that also hides the new staff-only columns from the client.

BEGIN;

-- ── safety checks ────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['id', 'company_id', 'client_id', 'project_id', 'status', 'sent_date', 'amount_paid', 'reminder_enabled', 'shared_at', 'shared_via', 'shared_by', 'withdrawn_at', 'invoice_date'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'client_invoices' AND column_name = c) THEN
      RAISE EXCEPTION 'client_invoices.% was not found. Nothing was changed.', c;
    END IF;
  END LOOP;
  IF to_regclass('public.client_payments') IS NULL OR to_regclass('public.client_portal_activity') IS NULL OR to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'client_payments, client_portal_activity or user_profiles was not found. Nothing was changed.';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = '_portal_staff_company') <> 1 THEN
    RAISE EXCEPTION 'Function public._portal_staff_company() was not found (migration 20260919120000). Nothing was changed.';
  END IF;
END $$;

-- ── 1. what was recorded ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_invoices
  ADD COLUMN IF NOT EXISTS sent_method          text,
  ADD COLUMN IF NOT EXISTS marked_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS marked_sent_by       uuid,
  ADD COLUMN IF NOT EXISTS marked_sent_by_name  text,
  ADD COLUMN IF NOT EXISTS marked_sent_note     text,
  ADD COLUMN IF NOT EXISTS marked_sent_reminders boolean,
  ADD COLUMN IF NOT EXISTS marked_sent_portal   boolean;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.client_invoices'::regclass AND conname = 'client_invoices_sent_method_check') THEN
    ALTER TABLE public.client_invoices ADD CONSTRAINT client_invoices_sent_method_check
      CHECK (sent_method IS NULL OR sent_method IN ('hand_delivered', 'whatsapp', 'printed', 'not_sent', 'other'));
  END IF;
END $$;

-- A marked invoice that goes back to draft (undo, or withdrawn from the client) is no longer "marked as sent".
CREATE OR REPLACE FUNCTION public.client_invoices_clear_marked_sent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.sent_method := NULL; NEW.marked_sent_at := NULL; NEW.marked_sent_by := NULL; NEW.marked_sent_by_name := NULL;
  NEW.marked_sent_note := NULL; NEW.marked_sent_reminders := NULL; NEW.marked_sent_portal := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.client_invoices_clear_marked_sent() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS client_invoices_clear_marked_sent ON public.client_invoices;
CREATE TRIGGER client_invoices_clear_marked_sent
  BEFORE UPDATE OF status ON public.client_invoices
  FOR EACH ROW WHEN (NEW.status = 'draft' AND OLD.status IS DISTINCT FROM 'draft')
  EXECUTE FUNCTION public.client_invoices_clear_marked_sent();

-- ── 2. mark a draft invoice as sent (no email, no WhatsApp) ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_invoice_sent(
  p_invoice_id uuid, p_sent_date date, p_method text, p_note text DEFAULT NULL,
  p_reminders boolean DEFAULT false, p_portal boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company   uuid := public._portal_staff_company();      -- same roles as "Send to Client": director, admin, estimator, supervisor, office_user, secretary
  v_now       timestamptz := now();
  v_today     date := (now() AT TIME ZONE 'America/Jamaica')::date;
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_inv       record;
  v_portal_ok boolean := false;
  v_name      text;
BEGIN
  IF p_method IS NULL OR p_method NOT IN ('hand_delivered', 'whatsapp', 'printed', 'not_sent', 'other') THEN
    RAISE EXCEPTION 'Choose how the invoice was delivered';
  END IF;
  IF p_sent_date IS NULL THEN RAISE EXCEPTION 'Enter the date sent'; END IF;
  IF p_sent_date > v_today THEN RAISE EXCEPTION 'The date sent cannot be in the future'; END IF;
  IF p_method = 'other' AND v_note IS NULL THEN RAISE EXCEPTION 'Add a note saying how it was delivered'; END IF;
  IF length(coalesce(v_note, '')) > 500 THEN RAISE EXCEPTION 'The note is too long (500 characters at most)'; END IF;

  SELECT i.id, i.company_id, i.client_id, i.project_id, i.status INTO v_inv
  FROM client_invoices i WHERE i.id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_inv.company_id IS DISTINCT FROM v_company THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft invoice can be marked as sent'; END IF;

  -- the portal only if asked for AND the client has portal access
  IF coalesce(p_portal, false) AND v_inv.client_id IS NOT NULL THEN
    SELECT coalesce(c.portal_enabled, false) INTO v_portal_ok FROM clients c WHERE c.id = v_inv.client_id AND c.company_id = v_company;
    v_portal_ok := coalesce(v_portal_ok, false);
  END IF;

  SELECT coalesce(nullif(btrim(up.full_name), ''), up.email) INTO v_name FROM user_profiles up WHERE up.id = auth.uid();

  UPDATE client_invoices SET
    status               = 'sent',
    sent_date            = p_sent_date,
    sent_method          = p_method,
    marked_sent_at       = v_now,
    marked_sent_by       = auth.uid(),
    marked_sent_by_name  = v_name,
    marked_sent_note     = v_note,
    marked_sent_reminders = coalesce(p_reminders, false),
    marked_sent_portal   = v_portal_ok,
    reminder_enabled     = coalesce(p_reminders, false),
    shared_at            = CASE WHEN v_portal_ok THEN v_now ELSE NULL END,
    shared_via           = CASE WHEN v_portal_ok THEN 'marked' ELSE NULL END,
    shared_by            = CASE WHEN v_portal_ok THEN auth.uid() ELSE NULL END,
    withdrawn_at         = NULL,
    updated_at           = v_now
  WHERE id = p_invoice_id;

  IF v_portal_ok THEN
    INSERT INTO client_portal_activity (company_id, client_id, project_id, event_type, entity_type, entity_id, metadata)
    VALUES (v_company, v_inv.client_id, v_inv.project_id, 'item_shared', 'invoice', p_invoice_id::text,
            jsonb_build_object('via', 'marked', 'by', auth.uid()));
  END IF;

  RETURN jsonb_build_object('status', 'sent', 'sent_date', p_sent_date, 'sent_method', p_method, 'marked_sent_at', v_now,
                            'marked_sent_by_name', v_name, 'reminders', coalesce(p_reminders, false), 'portal', v_portal_ok);
END;
$$;

-- ── 3. undo: back to draft (director / admin, nothing paid) ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unmark_invoice_sent(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role    text; v_company uuid; v_now timestamptz := now();
  v_inv     record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT up.role, up.company_id INTO v_role, v_company FROM user_profiles up WHERE up.id = auth.uid();
  IF v_company IS NULL OR v_role IS NULL OR v_role NOT IN ('director', 'admin') THEN
    RAISE EXCEPTION 'Only a director or admin can take an invoice back to draft' USING ERRCODE = '42501';
  END IF;

  SELECT i.id, i.company_id, i.client_id, i.project_id, i.status, i.amount_paid, i.marked_sent_at, i.shared_at, i.shared_via INTO v_inv
  FROM client_invoices i WHERE i.id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_inv.company_id IS DISTINCT FROM v_company THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF v_inv.marked_sent_at IS NULL OR v_inv.status NOT IN ('sent', 'overdue') THEN
    RAISE EXCEPTION 'This invoice was not marked as sent, or it is already draft or paid';
  END IF;
  IF coalesce(v_inv.amount_paid, 0) <> 0 OR EXISTS (SELECT 1 FROM client_payments cp WHERE cp.invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'A payment is recorded against this invoice, so it can no longer be taken back to draft';
  END IF;
  IF v_inv.shared_via IS NOT NULL AND v_inv.shared_via <> 'marked' THEN
    RAISE EXCEPTION 'This invoice was also sent to the client (%). Withdraw it from the client instead', v_inv.shared_via;
  END IF;

  UPDATE client_invoices SET
    status = 'draft', sent_date = NULL,           -- the trigger above clears sent_method and the marked_* columns
    reminder_enabled = true,                       -- back to the column default of a draft
    shared_at = NULL, shared_via = NULL, shared_by = NULL, withdrawn_at = NULL,
    updated_at = v_now
  WHERE id = p_invoice_id;

  IF v_inv.shared_at IS NOT NULL THEN
    INSERT INTO client_portal_activity (company_id, client_id, project_id, event_type, entity_type, entity_id, metadata)
    VALUES (v_company, v_inv.client_id, v_inv.project_id, 'item_withdrawn', 'invoice', p_invoice_id::text, jsonb_build_object('by', auth.uid(), 'undo_marked_sent', true));
  END IF;

  RETURN jsonb_build_object('status', 'draft');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_invoice_sent(uuid, date, text, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unmark_invoice_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_invoice_sent(uuid, date, text, text, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unmark_invoice_sent(uuid) TO authenticated, service_role;

-- ── 4. the client portal must never see the staff-only columns ────────────────────────────────────────────────────────
-- Same function as 20260922000000 (grants unchanged); it removes the new columns from the row it returns.
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
                        - 'reminder_repeat_days' - 'last_reminder_sent_at' - 'shared_by'
                        - 'sent_method' - 'marked_sent_at' - 'marked_sent_by' - 'marked_sent_by_name' - 'marked_sent_note'
                        - 'marked_sent_reminders' - 'marked_sent_portal')
           || jsonb_build_object('issue_date', i.invoice_date, 'project_name', p.name)
    FROM client_invoices i
    LEFT JOIN projects p ON p.id = i.project_id AND p.client_id = i.client_id
    WHERE i.client_id = v_client AND i.shared_at IS NOT NULL
    ORDER BY i.invoice_date DESC NULLS LAST;
END;
$$;

COMMIT;
