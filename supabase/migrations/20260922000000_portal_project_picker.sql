-- Portal project picker: get_portal_data takes an optional project id and returns every project of the client with its progress; invoices and estimates also return the project name.
BEGIN;

-- The old one-argument version must go first, or calls become ambiguous
DROP FUNCTION IF EXISTS public.get_portal_data(text);

CREATE OR REPLACE FUNCTION public.get_portal_data(p_session_token text, p_project_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_portal_data(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text, uuid) TO anon, authenticated;

-- Invoices: add the project name
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
           || jsonb_build_object('issue_date', i.invoice_date, 'project_name', p.name)
    FROM client_invoices i
    LEFT JOIN projects p ON p.id = i.project_id AND p.client_id = i.client_id
    WHERE i.client_id = v_client AND i.shared_at IS NOT NULL
    ORDER BY i.invoice_date DESC NULLS LAST;
END;
$$;

-- Estimates: add the project name
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
             'id', e.id, 'project_id', e.project_id, 'project_name', p.name,
             'title', e.title, 'version', e.version, 'status', e.status,
             'shared_at', e.shared_at, 'snapshot', e.shared_snapshot)
    FROM estimate_headers e
    JOIN projects p ON p.id = e.project_id
    WHERE p.client_id = v_client AND e.shared_at IS NOT NULL AND e.shared_snapshot IS NOT NULL
    ORDER BY e.shared_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_invoices(text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_portal_estimates(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_invoices(text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_estimates(text) TO anon, authenticated;

COMMIT;
