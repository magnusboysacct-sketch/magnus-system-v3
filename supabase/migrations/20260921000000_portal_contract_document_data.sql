-- Add watermark, tagline and address lines to get_portal_data, and client and project names to get_portal_contracts.
BEGIN;

-- 1. Portal data: add the watermark, tagline and address lines to the company block
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

  SELECT company_name, logo_url, phone, email, address_line1, address_line2, parish,
         tagline, watermark_url, watermark_enabled, watermark_opacity, watermark_size
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
                'phone', co.phone, 'email', co.email,
                'address_line1', co.address_line1, 'address_line2', co.address_line2,
                'parish', co.parish, 'tagline', co.tagline,
                'watermark_url', co.watermark_url, 'watermark_enabled', co.watermark_enabled,
                'watermark_opacity', co.watermark_opacity, 'watermark_size', co.watermark_size),
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

REVOKE ALL ON FUNCTION public.get_portal_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text) TO anon, authenticated;

-- 2. Portal contracts: add client and project names (still no internal notes)
CREATE OR REPLACE FUNCTION public.get_portal_contracts(p_session_token text)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_client uuid := public._portal_session_client(p_session_token);
BEGIN
  IF v_client IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT (to_jsonb(k) - 'created_by' - 'contractor_signed_by' - 'client_signature_token'
                        - 'shared_by' - 'notes')
           || jsonb_build_object('client_name', cl.name,
                                 'client_address', cl.address,
                                 'project_name', p.name)
    FROM client_contracts k
    JOIN clients cl ON cl.id = k.client_id
    LEFT JOIN projects p ON p.id = k.project_id AND p.client_id = k.client_id
    WHERE k.client_id = v_client AND k.shared_at IS NOT NULL
    ORDER BY k.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_contracts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_contracts(text) TO anon, authenticated;

COMMIT;
