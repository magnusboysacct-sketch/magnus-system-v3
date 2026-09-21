-- Add the session-validated portal server functions: link info, login branding, get_portal_data, change-order response, review, and logout.
BEGIN;

-- 1. Before login: what the magic-link screen needs
CREATE OR REPLACE FUNCTION public.get_portal_link_info(p_portal_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE c record; co record;
BEGIN
  IF p_portal_token IS NULL OR btrim(p_portal_token) = '' THEN RETURN NULL; END IF;

  SELECT id, name, contact_name, email, portal_email, portal_activated_at, company_id
    INTO c
  FROM clients
  WHERE portal_token::text = p_portal_token AND portal_enabled = true;

  IF c.id IS NULL THEN RETURN NULL; END IF;

  SELECT company_name, logo_url INTO co
  FROM company_settings WHERE company_id = c.company_id LIMIT 1;

  RETURN jsonb_build_object(
    'mode', CASE WHEN c.portal_activated_at IS NOT NULL THEN 'login' ELSE 'setup' END,
    'client', jsonb_build_object('id', c.id, 'name', c.name, 'contact_name', c.contact_name,
                'email', c.email, 'portal_email', c.portal_email,
                'portal_activated_at', c.portal_activated_at),
    'company', jsonb_build_object('company_name', co.company_name, 'logo_url', co.logo_url)
  );
END;
$$;

-- 2. Generic branding for /client-login (same as today: first company)
CREATE OR REPLACE FUNCTION public.get_login_branding()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object('company_name', company_name, 'logo_url', logo_url)
  FROM company_settings LIMIT 1;
$$;

-- 3. The whole portal in one session-validated call (only what the screen shows)
CREATE OR REPLACE FUNCTION public.get_portal_data(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_client   uuid := public._portal_session_client(p_session_token);
  c record; co record; pr record;
  v_total    int := 0;
  v_done     int := 0;
  v_progress int := 0;
BEGIN
  IF v_client IS NULL THEN RETURN NULL; END IF;

  SELECT id, name, contact_name, email, portal_email, portal_activated_at, company_id
    INTO c FROM clients WHERE id = v_client;

  SELECT company_name, logo_url, phone, email, address_line1
    INTO co FROM company_settings WHERE company_id = c.company_id LIMIT 1;

  SELECT id, name, status, site_address, start_date, end_date
    INTO pr FROM projects WHERE client_id = v_client ORDER BY created_at DESC LIMIT 1;

  IF pr.id IS NOT NULL THEN
    SELECT count(*), count(*) FILTER (WHERE status = 'complete')
      INTO v_total, v_done FROM project_tasks WHERE project_id = pr.id;
    IF v_total > 0 THEN v_progress := round(v_done::numeric / v_total * 100); END IF;
  END IF;

  RETURN jsonb_build_object(
    'client', jsonb_build_object('id', c.id, 'name', c.name, 'contact_name', c.contact_name,
                'email', c.email, 'portal_email', c.portal_email,
                'portal_activated_at', c.portal_activated_at),
    'company', jsonb_build_object('company_name', co.company_name, 'logo_url', co.logo_url,
                'phone', co.phone, 'email', co.email, 'address_line1', co.address_line1),
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
$$;

-- 4. Approve / reject a change order (must belong to this client, still unanswered)
CREATE OR REPLACE FUNCTION public.respond_portal_change_order(
  p_session_token text, p_change_order_id uuid, p_response text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_client uuid := public._portal_session_client(p_session_token);
  v_row    change_orders%ROWTYPE;
BEGIN
  IF v_client IS NULL THEN RAISE EXCEPTION 'Invalid or expired session'; END IF;
  IF p_response IS NULL OR p_response NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid response';
  END IF;

  UPDATE change_orders co
     SET status = p_response, client_response = p_response, responded_at = now()
    FROM projects p
   WHERE co.id = p_change_order_id
     AND p.id = co.project_id
     AND p.client_id = v_client
     AND coalesce(co.status, 'pending') NOT IN ('approved','rejected')
  RETURNING co.* INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Change order not found or already answered'; END IF;

  PERFORM public.log_portal_event(
    p_session_token,
    CASE WHEN p_response = 'approved' THEN 'change_approve' ELSE 'change_reject' END,
    'change_order', v_row.id::text, v_row.project_id);

  RETURN to_jsonb(v_row);
END;
$$;

-- 5. Review: rating 1-5, project must be this client's, one review per project (resubmit updates)
CREATE OR REPLACE FUNCTION public.submit_portal_review(
  p_session_token text, p_project_id uuid, p_rating int, p_comment text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_client uuid := public._portal_session_client(p_session_token);
  v_id     uuid;
  v_text   text := left(coalesce(p_comment, ''), 2000);
BEGIN
  IF v_client IS NULL THEN RAISE EXCEPTION 'Invalid or expired session'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_id AND client_id = v_client) THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  UPDATE client_reviews SET rating = p_rating, comment = v_text
   WHERE client_id = v_client AND project_id = p_project_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO client_reviews (client_id, project_id, rating, comment)
    VALUES (v_client, p_project_id, p_rating, v_text)
    RETURNING id INTO v_id;
  END IF;

  PERFORM public.log_portal_event(p_session_token, 'review_sent', 'project',
                                  p_project_id::text, p_project_id);
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- 6. Sign out for real: log it, then end the server session
CREATE OR REPLACE FUNCTION public.portal_logout(p_session_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.log_portal_event(p_session_token, 'logout');
  DELETE FROM client_portal_sessions WHERE session_token = p_session_token;
END;
$$;

-- 7. Permissions
REVOKE ALL ON FUNCTION public.get_portal_link_info(text)                        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_login_branding()                              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_data(text)                             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_portal_change_order(text,uuid,text)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_portal_review(text,uuid,int,text)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.portal_logout(text)                               FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_portal_link_info(text)                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_login_branding()                           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_portal_change_order(text,uuid,text)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_portal_review(text,uuid,int,text)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_logout(text)                            TO anon, authenticated;

COMMIT;
