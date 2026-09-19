-- Create the append-only client_portal_activity log with its staff RLS, the log_portal_event RPC and the last-seen / item-view views.
BEGIN;

-- 1. Append-only activity log (no FK on purpose: the record must survive if a client is deleted)
CREATE TABLE IF NOT EXISTS public.client_portal_activity (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid,
  client_id    uuid NOT NULL,
  project_id   uuid,
  session_id   text,
  event_type   text NOT NULL,
  entity_type  text,
  entity_id    text,
  ip_address   text,
  user_agent   text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpa_client_time  ON public.client_portal_activity (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpa_company_time ON public.client_portal_activity (company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpa_entity       ON public.client_portal_activity (entity_type, entity_id);

-- 2. RLS: staff can read their own company's rows. Nobody can write from the browser.
ALTER TABLE public.client_portal_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_portal_activity_staff_select ON public.client_portal_activity;
CREATE POLICY client_portal_activity_staff_select ON public.client_portal_activity
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT up.company_id FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('director','admin','estimator','supervisor','office_user','secretary')
    )
  );

REVOKE ALL ON public.client_portal_activity FROM anon, authenticated;
GRANT SELECT ON public.client_portal_activity TO authenticated;

-- 3. Tamper protection: no updates, deletes only through a deliberate purge setting
CREATE OR REPLACE FUNCTION public.client_portal_activity_block_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_activity_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'client_portal_activity is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_cpa_append_only ON public.client_portal_activity;
CREATE TRIGGER trg_cpa_append_only
  BEFORE UPDATE OR DELETE ON public.client_portal_activity
  FOR EACH ROW EXECUTE FUNCTION public.client_portal_activity_block_changes();

-- 4. Logging RPC: same session validation as insert_portal_comment; never breaks the portal
CREATE OR REPLACE FUNCTION public.log_portal_event(
  p_session_token text,
  p_event_type    text,
  p_entity_type   text DEFAULT NULL,
  p_entity_id     text DEFAULT NULL,
  p_project_id    uuid DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_client_id  uuid;
  v_company_id uuid;
  v_session_id text;
  v_project_id uuid;
  v_headers    json;
  v_ip         text;
  v_ua         text;
  v_allowed    text[] := ARRAY['session_resume','tab_view','photo_view','photo_download',
                               'contract_view','contract_sign','invoice_view','change_view',
                               'change_approve','change_reject','comment_sent','review_sent','logout'];
  v_low_value  text[] := ARRAY['session_resume','tab_view','photo_view','contract_view',
                               'invoice_view','change_view'];
BEGIN
  IF p_event_type IS NULL OR NOT (p_event_type = ANY (v_allowed)) THEN
    RETURN;
  END IF;

  SELECT cps.client_id, c.company_id, cps.id::text
    INTO v_client_id, v_company_id, v_session_id
  FROM client_portal_sessions cps
  JOIN clients c ON c.id = cps.client_id
  WHERE cps.session_token = p_session_token
    AND cps.expires_at > now()
    AND c.portal_enabled = true;

  IF v_client_id IS NULL THEN
    RETURN;  -- invalid session: silently ignore
  END IF;

  IF p_project_id IS NOT NULL THEN
    SELECT p.id INTO v_project_id
    FROM projects p
    WHERE p.id = p_project_id AND p.client_id = v_client_id;
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  v_ip := nullif(btrim(split_part(
            coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-forwarded-for', ''), ',', 1)), '');
  v_ua := left(v_headers->>'user-agent', 300);

  -- skip repeats of routine views within 30 minutes
  IF p_event_type = ANY (v_low_value) THEN
    IF EXISTS (
      SELECT 1 FROM client_portal_activity a
      WHERE a.session_id = v_session_id
        AND a.event_type = p_event_type
        AND a.entity_id IS NOT DISTINCT FROM p_entity_id
        AND a.occurred_at > now() - interval '30 minutes'
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO client_portal_activity
    (company_id, client_id, project_id, session_id, event_type, entity_type, entity_id,
     ip_address, user_agent, metadata)
  VALUES
    (v_company_id, v_client_id, v_project_id, v_session_id, p_event_type, p_entity_type, p_entity_id,
     v_ip, v_ua, coalesce(p_metadata, '{}'::jsonb));

EXCEPTION WHEN OTHERS THEN
  RETURN;  -- logging must never break the portal
END;
$$;

REVOKE ALL ON FUNCTION public.log_portal_event(text,text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_portal_event(text,text,text,text,uuid,jsonb) TO anon, authenticated;

-- 5. Staff-facing views (they respect the staff RLS above)
CREATE OR REPLACE VIEW public.client_portal_last_seen
WITH (security_invoker = true) AS
SELECT
  client_id,
  max(occurred_at) FILTER (WHERE event_type = 'login')                     AS last_login_at,
  max(occurred_at) FILTER (WHERE event_type <> 'login_failed')             AS last_active_at,
  count(*) FILTER (WHERE event_type = 'login' AND occurred_at > now() - interval '30 days')   AS logins_30d,
  count(*) FILTER (WHERE event_type = 'login_failed' AND occurred_at > now() - interval '24 hours') AS failed_24h
FROM public.client_portal_activity
GROUP BY client_id;

CREATE OR REPLACE VIEW public.client_portal_item_views
WITH (security_invoker = true) AS
SELECT
  company_id, client_id, project_id, entity_type, entity_id,
  min(occurred_at) AS first_seen_at,
  max(occurred_at) AS last_seen_at,
  count(*)         AS view_count
FROM public.client_portal_activity
WHERE entity_id IS NOT NULL
  AND event_type IN ('photo_view','photo_download','contract_view','invoice_view','change_view')
GROUP BY company_id, client_id, project_id, entity_type, entity_id;

REVOKE ALL ON public.client_portal_last_seen, public.client_portal_item_views FROM anon;
GRANT SELECT ON public.client_portal_last_seen, public.client_portal_item_views TO authenticated;

COMMIT;
