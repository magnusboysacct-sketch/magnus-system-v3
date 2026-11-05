-- ROLLBACK for 20260936000000_contact_scoped_portal_access: restores the 5 portal functions to their live definitions as of 2026-10-13T16:22:10.245Z
-- (captured with pg_get_functiondef BEFORE the migration was applied). Run with: supabase db query --linked -f supabase/rollback_20260936_portal_functions.sql
-- Does not drop the new table/columns and does not restore the grants the migration revoked.

CREATE OR REPLACE FUNCTION public._portal_session_client(p_session_token text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT cps.client_id
  FROM client_portal_sessions cps
  JOIN clients c ON c.id = cps.client_id
  WHERE cps.session_token = p_session_token
    AND cps.expires_at > now()
    AND c.portal_enabled = true
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_portal_data(p_session_token text, p_project_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client   uuid := public._portal_session_client(p_session_token);
  v_pid      uuid;
  c record; co record; pr record;
  v_total    int := 0;
  v_done     int := 0;
  v_progress int := 0;
  v_projects jsonb;
BEGIN
  IF v_client IS NULL THEN RETURN NULL; END IF;

  SELECT id, name, contact_name, email, portal_email, portal_activated_at, company_id
    INTO c FROM clients WHERE id = v_client;

  SELECT company_name, logo_url, phone, email, address_line1, address_line2, parish,
         tagline, watermark_url, watermark_enabled, watermark_opacity, watermark_size
    INTO co FROM company_settings WHERE company_id = c.company_id LIMIT 1;

  -- Pick the project id: the chosen one if it is this client's, else newest active, else newest
  IF p_project_id IS NOT NULL THEN
    SELECT id INTO v_pid FROM projects WHERE id = p_project_id AND client_id = v_client;
  END IF;
  IF v_pid IS NULL THEN
    SELECT id INTO v_pid FROM projects WHERE client_id = v_client
      ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1;
  END IF;

  -- Always assigned, even when there is no project (all fields come back null)
  SELECT id, name, status, site_address, start_date, end_date
    INTO pr FROM projects WHERE id = v_pid;

  IF pr.id IS NOT NULL THEN
    SELECT count(*), count(*) FILTER (WHERE status = 'complete')
      INTO v_total, v_done FROM project_tasks WHERE project_id = pr.id;
    IF v_total > 0 THEN v_progress := round(v_done::numeric / v_total * 100); END IF;
  END IF;

  -- Every project of this client, each with its own progress
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'status', p.status,
           'start_date', p.start_date, 'end_date', p.end_date,
           'progress_pct', (SELECT CASE WHEN count(*) = 0 THEN 0
                                   ELSE round(count(*) FILTER (WHERE t.status = 'complete')::numeric / count(*) * 100) END
                            FROM project_tasks t WHERE t.project_id = p.id))
         ORDER BY (p.status = 'active') DESC, p.created_at DESC), '[]'::jsonb)
    INTO v_projects
  FROM projects p WHERE p.client_id = v_client;

  RETURN jsonb_build_object(
    'client', jsonb_build_object('id', c.id, 'name', c.name, 'contact_name', c.contact_name,
                'email', c.email, 'portal_email', c.portal_email,
                'portal_activated_at', c.portal_activated_at),
    'company', jsonb_build_object('company_name', co.company_name, 'logo_url', co.logo_url,
                'phone', co.phone, 'email', co.email,
                'address_line1', co.address_line1, 'address_line2', co.address_line2,
                'parish', co.parish, 'tagline', co.tagline,
                'watermark_url', co.watermark_url, 'watermark_enabled', co.watermark_enabled,
                'watermark_opacity', co.watermark_opacity, 'watermark_size', co.watermark_size),
    'projects', v_projects,
    'project', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', pr.id, 'name', pr.name, 'status', pr.status, 'site_address', pr.site_address,
                'start_date', pr.start_date, 'end_date', pr.end_date) END,
    'progress_pct', v_progress,
    'photos', CASE WHEN pr.id IS NULL THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.id, 'photo_url', x.photo_url,
                 'caption', x.caption, 'created_at', x.created_at) ORDER BY x.created_at DESC)
        FROM (SELECT id, photo_url, caption, created_at FROM project_photos
              WHERE project_id = pr.id ORDER BY created_at DESC LIMIT 200) x), '[]'::jsonb) END,
    'daily_logs', CASE WHEN pr.id IS NULL THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.id, 'log_date', x.log_date, 'weather', x.weather,
                 'workers_count', x.workers_count, 'work_performed', x.work_performed,
                 'deliveries', x.deliveries) ORDER BY x.log_date DESC)
        FROM (SELECT id, log_date, weather, workers_count, work_performed, deliveries
              FROM project_daily_logs WHERE project_id = pr.id
              ORDER BY log_date DESC LIMIT 10) x), '[]'::jsonb) END,
    'change_orders', CASE WHEN pr.id IS NULL THEN '[]'::jsonb ELSE coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'description', x.description,
                 'amount', x.amount, 'status', x.status, 'created_at', x.created_at)
                 ORDER BY x.created_at DESC)
        FROM (SELECT id, title, description, amount, status, created_at FROM change_orders
              WHERE project_id = pr.id ORDER BY created_at DESC) x), '[]'::jsonb) END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_portal_comments(p_session_token text)
 RETURNS SETOF client_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT cps.client_id INTO v_client_id
  FROM client_portal_sessions cps
  JOIN clients c ON c.id = cps.client_id
  WHERE cps.session_token = p_session_token
    AND cps.expires_at > now()
    AND c.portal_enabled = true;

  IF v_client_id IS NULL THEN
    RETURN; -- empty result — no distinction revealed between "invalid session" and "no comments"
  END IF;

  RETURN QUERY
    SELECT * FROM client_comments
    WHERE client_id = v_client_id
    ORDER BY created_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_portal_comment(p_session_token text, p_project_id uuid, p_message text)
 RETURNS SETOF client_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT cps.client_id INTO v_client_id
  FROM client_portal_sessions cps
  JOIN clients c ON c.id = cps.client_id
  WHERE cps.session_token = p_session_token
    AND cps.expires_at > now()
    AND c.portal_enabled = true;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  IF p_message IS NULL OR btrim(p_message) = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  -- NEW: the project must belong to this client
  IF NOT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project_id
      AND p.client_id = v_client_id
  ) THEN
    RAISE EXCEPTION 'Invalid or expired session';  -- same generic message, reveals nothing
  END IF;

  RETURN QUERY
    INSERT INTO client_comments (client_id, project_id, message, sender_type)
    VALUES (v_client_id, p_project_id, p_message, 'client')
    RETURNING *;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_portal_event(p_session_token text, p_event_type text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_project_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client_id  uuid;
  v_company_id uuid;
  v_session_id text;
  v_project_id uuid;
  v_headers    json;
  v_ip         text;
  v_ua         text;
  v_allowed    text[] := ARRAY['session_resume','tab_view','photo_view','photo_download','estimate_view',
                               'contract_view','contract_sign','invoice_view','change_view',
                               'change_approve','change_reject','comment_sent','review_sent','logout'];
  v_low_value  text[] := ARRAY['session_resume','tab_view','photo_view','contract_view',
                               'invoice_view','change_view','estimate_view'];
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
$function$;

