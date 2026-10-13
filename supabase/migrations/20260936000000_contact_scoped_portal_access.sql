-- Contact-scoped client portal access.
--
-- A second kind of portal login, tied to ONE client contact (client_contacts). It only ever sees the projects that contact is
-- assigned to (projects.contact_id), re-checked live on every call, so reassigning a project cuts the old contact off at once.
-- The existing client-level login (the "manager view") is unchanged and still sees everything.
--
-- How it fails closed:
--   * _portal_session_client() now returns NULL for a contact session. Everything that still uses it (invoices, contracts,
--     contract schedule, estimates, change-order approval, reviews) is therefore manager-only without further changes.
--   * The few functions a contact may use (get_portal_data, get_portal_comments, insert_portal_comment, log_portal_event)
--     go through _portal_session_ctx() and _portal_can_see_project().
--   * Contact credentials live in their own table that has no browser grants at all.
-- The edge functions portal-sign-contract / portal-contract-signature-urls must also refuse sessions with a contact_id
-- (changed in the same commit).
BEGIN;

-- 1. Which contact a session belongs to (NULL = the client-level manager login, exactly as today)
ALTER TABLE public.client_portal_sessions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.client_contacts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_contact_id
  ON public.client_portal_sessions (contact_id) WHERE contact_id IS NOT NULL;

-- Tighten grants found in the live check (RLS already blocks reads/writes, but not TRUNCATE on a direct connection).
-- Nothing in the browser touches client_portal_sessions directly (only SECURITY DEFINER functions and the service-role
-- edge functions do), and the anon key has no business with client_contacts at all.
REVOKE ALL ON public.client_portal_sessions FROM anon, authenticated;
REVOKE ALL ON public.client_contacts FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.client_contacts FROM authenticated;

-- Who wrote a portal message / did a portal action (NULL = manager login or staff)
ALTER TABLE public.client_comments        ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL;
ALTER TABLE public.client_portal_activity ADD COLUMN IF NOT EXISTS contact_id uuid;  -- no FK: the log must outlive the contact

-- 2. A contact's portal credentials. One row per contact. Never readable from the browser: staff use the RPCs below,
--    logins go through the client-portal-login edge function (service role).
CREATE TABLE IF NOT EXISTS public.client_contact_portal_access (
  contact_id        uuid PRIMARY KEY REFERENCES public.client_contacts(id) ON DELETE CASCADE,
  company_id        uuid NOT NULL REFERENCES public.companies(id),
  portal_token      text NOT NULL UNIQUE,
  portal_email      text,
  password_hash     text,
  activated_at      timestamptz,
  enabled           boolean NOT NULL DEFAULT true,
  revoked_at        timestamptz,
  reset_token       text,
  reset_expires_at  timestamptz,
  invited_by        uuid,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Email sign-in needs an email to point at exactly one live contact login
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_contact_portal_access_email
  ON public.client_contact_portal_access (lower(portal_email))
  WHERE portal_email IS NOT NULL AND enabled;

ALTER TABLE public.client_contact_portal_access ENABLE ROW LEVEL SECURITY;  -- and no policies: no direct access at all
REVOKE ALL ON public.client_contact_portal_access FROM PUBLIC, anon, authenticated;

-- 256 bits of randomness without depending on pgcrypto's schema location
CREATE OR REPLACE FUNCTION public._portal_random_token()
RETURNS text LANGUAGE sql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;
REVOKE ALL ON FUNCTION public._portal_random_token() FROM PUBLIC, anon, authenticated;

-- 3. Session helpers (internal only)

-- Everything about a valid session. A contact session is only valid while the contact still belongs to the session's client
-- and their access is enabled, activated and not revoked. Either kind needs the client's portal to be on.
CREATE OR REPLACE FUNCTION public._portal_session_ctx(p_session_token text)
RETURNS TABLE (client_id uuid, contact_id uuid, session_id uuid, company_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT cps.client_id, cps.contact_id, cps.id, c.company_id
  FROM client_portal_sessions cps
  JOIN clients c ON c.id = cps.client_id
  LEFT JOIN client_contacts cc ON cc.id = cps.contact_id
  LEFT JOIN client_contact_portal_access a ON a.contact_id = cps.contact_id
  WHERE p_session_token IS NOT NULL
    AND btrim(p_session_token) <> ''
    AND cps.session_token = p_session_token
    AND cps.client_id IS NOT NULL
    AND cps.expires_at > now()
    AND c.portal_enabled = true
    AND (cps.contact_id IS NULL
         OR (cc.client_id = cps.client_id
             AND a.enabled = true
             AND a.activated_at IS NOT NULL
             AND a.revoked_at IS NULL))
  LIMIT 1;
$$;

-- MANAGER sessions only. Returns NULL for a contact session, which makes every function built on it manager-only.
CREATE OR REPLACE FUNCTION public._portal_session_client(p_session_token text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT s.client_id FROM public._portal_session_ctx(p_session_token) s WHERE s.contact_id IS NULL;
$$;

-- May this session see this project? Manager: any of the client's projects. Contact: only projects assigned to them.
CREATE OR REPLACE FUNCTION public._portal_can_see_project(p_client uuid, p_contact uuid, p_project uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_client IS NOT NULL AND p_project IS NOT NULL AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = p_project
      AND p.client_id = p_client
      AND (p_contact IS NULL OR p.contact_id = p_contact)
  );
$$;

REVOKE ALL ON FUNCTION public._portal_session_ctx(text)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._portal_session_client(text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._portal_can_see_project(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4. get_portal_data: same payload as before for a manager; a contact gets only their assigned projects, no client login
--    details, and a "viewer" block the portal uses to hide manager-only features.
CREATE OR REPLACE FUNCTION public.get_portal_data(p_session_token text, p_project_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s          record;
  v_client   uuid;
  v_contact  uuid;
  v_pid      uuid;
  c record; co record; pr record; cc record;
  v_total    int := 0;
  v_done     int := 0;
  v_progress int := 0;
  v_projects jsonb;
BEGIN
  SELECT * INTO s FROM public._portal_session_ctx(p_session_token);
  v_client  := s.client_id;
  v_contact := s.contact_id;
  IF v_client IS NULL THEN RETURN NULL; END IF;

  SELECT id, name, contact_name, email, portal_email, portal_activated_at, company_id
    INTO c FROM clients WHERE id = v_client;

  -- Always assigned (all null for a manager session); a record left unassigned would make the RETURN below fail
  SELECT id, name, title, email INTO cc FROM client_contacts WHERE id = v_contact;

  SELECT company_name, logo_url, phone, email, address_line1, address_line2, parish,
         tagline, watermark_url, watermark_enabled, watermark_opacity, watermark_size
    INTO co FROM company_settings WHERE company_id = c.company_id LIMIT 1;

  -- Pick the project: the chosen one if this session may see it, else newest active visible, else newest visible
  IF p_project_id IS NOT NULL AND public._portal_can_see_project(v_client, v_contact, p_project_id) THEN
    v_pid := p_project_id;
  END IF;
  IF v_pid IS NULL THEN
    SELECT p.id INTO v_pid FROM projects p
     WHERE p.client_id = v_client AND (v_contact IS NULL OR p.contact_id = v_contact)
     ORDER BY (p.status = 'active') DESC, p.created_at DESC LIMIT 1;
  END IF;

  -- Always assigned, even when there is no project (all fields come back null)
  SELECT id, name, status, site_address, start_date, end_date
    INTO pr FROM projects WHERE id = v_pid;

  IF pr.id IS NOT NULL THEN
    SELECT count(*), count(*) FILTER (WHERE status = 'complete')
      INTO v_total, v_done FROM project_tasks WHERE project_id = pr.id;
    IF v_total > 0 THEN v_progress := round(v_done::numeric / v_total * 100); END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'status', p.status,
           'start_date', p.start_date, 'end_date', p.end_date,
           'progress_pct', (SELECT CASE WHEN count(*) = 0 THEN 0
                                   ELSE round(count(*) FILTER (WHERE t.status = 'complete')::numeric / count(*) * 100) END
                            FROM project_tasks t WHERE t.project_id = p.id))
         ORDER BY (p.status = 'active') DESC, p.created_at DESC), '[]'::jsonb)
    INTO v_projects
  FROM projects p
  WHERE p.client_id = v_client AND (v_contact IS NULL OR p.contact_id = v_contact);

  RETURN jsonb_build_object(
    'viewer', CASE WHEN v_contact IS NULL
                THEN jsonb_build_object('kind', 'manager')
                ELSE jsonb_build_object('kind', 'contact', 'contact_id', cc.id, 'name', cc.name,
                                        'title', cc.title, 'email', cc.email) END,
    'client', CASE WHEN v_contact IS NULL
                THEN jsonb_build_object('id', c.id, 'name', c.name, 'contact_name', c.contact_name,
                       'email', c.email, 'portal_email', c.portal_email,
                       'portal_activated_at', c.portal_activated_at)
                ELSE jsonb_build_object('id', c.id, 'name', c.name, 'contact_name', cc.name) END,
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

-- 5. Messages. Manager: unchanged (all of the client's messages). Contact: only messages on their assigned projects;
--    general (project-less) messages are hidden from them.
CREATE OR REPLACE FUNCTION public.get_portal_comments(p_session_token text)
RETURNS SETOF client_comments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public._portal_session_ctx(p_session_token);
  IF s.client_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT cm.* FROM client_comments cm
    WHERE cm.client_id = s.client_id
      AND (s.contact_id IS NULL OR public._portal_can_see_project(s.client_id, s.contact_id, cm.project_id))
    ORDER BY cm.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_portal_comment(p_session_token text, p_project_id uuid, p_message text)
RETURNS SETOF client_comments
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public._portal_session_ctx(p_session_token);
  IF s.client_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired session'; END IF;

  IF p_message IS NULL OR btrim(p_message) = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  IF NOT public._portal_can_see_project(s.client_id, s.contact_id, p_project_id) THEN
    RAISE EXCEPTION 'Invalid or expired session';  -- same generic message, reveals nothing
  END IF;

  RETURN QUERY
    INSERT INTO client_comments (client_id, project_id, message, sender_type, contact_id)
    VALUES (s.client_id, p_project_id, p_message, 'client', s.contact_id)
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_comments(text)                FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_portal_comment(text, uuid, text)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_comments(text)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_portal_comment(text, uuid, text) TO anon, authenticated;

-- 6. Activity log: same rules as before, but a contact may only attach a project they can see, and the row records
--    which contact it was.
CREATE OR REPLACE FUNCTION public.log_portal_event(
  p_session_token text,
  p_event_type    text,
  p_entity_type   text DEFAULT NULL,
  p_entity_id     text DEFAULT NULL,
  p_project_id    uuid DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  s            record;
  v_session_id text;
  v_project_id uuid;
  v_headers    json;
  v_ip         text;
  v_ua         text;
  -- Same lists as live today (20260919000000 plus 'estimate_view' from 20260920000000)
  v_allowed    text[] := ARRAY['session_resume','tab_view','photo_view','photo_download','estimate_view',
                               'contract_view','contract_sign','invoice_view','change_view',
                               'change_approve','change_reject','comment_sent','review_sent','logout'];
  v_low_value  text[] := ARRAY['session_resume','tab_view','photo_view','contract_view',
                               'invoice_view','change_view','estimate_view'];
BEGIN
  IF p_event_type IS NULL OR NOT (p_event_type = ANY (v_allowed)) THEN
    RETURN;
  END IF;

  SELECT * INTO s FROM public._portal_session_ctx(p_session_token);
  IF s.client_id IS NULL THEN
    RETURN;  -- invalid session: silently ignore
  END IF;
  v_session_id := s.session_id::text;

  IF p_project_id IS NOT NULL AND public._portal_can_see_project(s.client_id, s.contact_id, p_project_id) THEN
    v_project_id := p_project_id;
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
    (company_id, client_id, contact_id, project_id, session_id, event_type, entity_type, entity_id,
     ip_address, user_agent, metadata)
  VALUES
    (s.company_id, s.client_id, s.contact_id, v_project_id, v_session_id, p_event_type, p_entity_type, p_entity_id,
     v_ip, v_ua, coalesce(p_metadata, '{}'::jsonb));

EXCEPTION WHEN OTHERS THEN
  RETURN;  -- logging must never break the portal
END;
$$;

REVOKE ALL ON FUNCTION public.log_portal_event(text,text,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_portal_event(text,text,text,text,uuid,jsonb) TO anon, authenticated;

-- 7. Before login: what a contact's invite link screen needs. Never returns anything secret.
CREATE OR REPLACE FUNCTION public.get_contact_portal_link_info(p_portal_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record; co record;
BEGIN
  IF p_portal_token IS NULL OR btrim(p_portal_token) = '' THEN RETURN NULL; END IF;

  SELECT a.contact_id, a.activated_at, a.portal_email, cc.name AS contact_name, cc.email AS contact_email,
         c.name AS client_name, c.company_id
    INTO r
  FROM client_contact_portal_access a
  JOIN client_contacts cc ON cc.id = a.contact_id
  JOIN clients c ON c.id = cc.client_id
  WHERE a.portal_token = p_portal_token
    AND a.enabled = true AND a.revoked_at IS NULL
    AND c.portal_enabled = true;

  IF r.contact_id IS NULL THEN RETURN NULL; END IF;

  SELECT company_name, logo_url INTO co FROM company_settings WHERE company_id = r.company_id LIMIT 1;

  RETURN jsonb_build_object(
    'mode', CASE WHEN r.activated_at IS NOT NULL THEN 'login' ELSE 'setup' END,
    'contact', jsonb_build_object('id', r.contact_id, 'name', r.contact_name,
                 'email', coalesce(r.portal_email, r.contact_email), 'client_name', r.client_name),
    'company', jsonb_build_object('company_name', co.company_name, 'logo_url', co.logo_url)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_contact_portal_link_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_contact_portal_link_info(text) TO anon, authenticated;

-- 8. Staff: invite, check and revoke a project's contact. Same staff roles as share_with_client.

-- Status of the project's contact login (or null fields when the project has no contact).
CREATE OR REPLACE FUNCTION public.get_project_contact_portal_status(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company uuid := public._portal_staff_company();
  r record;
BEGIN
  SELECT p.id AS project_id, p.contact_id, cc.name, cc.email, c.portal_enabled,
         a.portal_token, a.activated_at, a.enabled, a.revoked_at, a.invited_at
    INTO r
  FROM projects p
  JOIN clients c ON c.id = p.client_id AND c.company_id = v_company
  LEFT JOIN client_contacts cc ON cc.id = p.contact_id
  LEFT JOIN client_contact_portal_access a ON a.contact_id = p.contact_id
  WHERE p.id = p_project_id;

  IF r.project_id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;

  RETURN jsonb_build_object(
    'contact_id', r.contact_id,
    'contact_name', r.name,
    'contact_email', r.email,
    'client_portal_enabled', coalesce(r.portal_enabled, false),
    'status', CASE
                WHEN r.contact_id IS NULL THEN 'no_contact'
                WHEN r.portal_token IS NULL THEN 'not_invited'
                WHEN NOT r.enabled OR r.revoked_at IS NOT NULL THEN 'revoked'
                WHEN r.activated_at IS NULL THEN 'invited'
                ELSE 'active' END,
    'portal_token', CASE WHEN r.enabled AND r.revoked_at IS NULL THEN r.portal_token END,
    'invited_at', r.invited_at,
    'activated_at', r.activated_at
  );
END;
$$;

-- Invite (or re-invite) the project's contact. Returns the token for the invite link. Re-inviting a revoked contact issues
-- a NEW token and clears the old password, so an old link or password can never come back to life.
CREATE OR REPLACE FUNCTION public.invite_project_contact_to_portal(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company uuid := public._portal_staff_company();
  r record;
  a record;
  v_email text;
BEGIN
  SELECT p.id, p.contact_id, c.portal_enabled, cc.email
    INTO r
  FROM projects p
  JOIN clients c ON c.id = p.client_id AND c.company_id = v_company
  LEFT JOIN client_contacts cc ON cc.id = p.contact_id AND cc.client_id = p.client_id
  WHERE p.id = p_project_id;

  IF r.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF r.contact_id IS NULL THEN RAISE EXCEPTION 'Assign a contact to this project first'; END IF;
  IF NOT coalesce(r.portal_enabled, false) THEN
    RAISE EXCEPTION 'Turn on the client portal for this client first';
  END IF;

  SELECT * INTO a FROM client_contact_portal_access WHERE contact_id = r.contact_id FOR UPDATE;

  -- Pre-fill the sign-in email from the contact, unless another live contact login already uses it
  -- (then this contact signs in with their invite link, or sets an email during setup).
  v_email := nullif(lower(btrim(r.email)), '');
  IF v_email IS NOT NULL AND EXISTS (
       SELECT 1 FROM client_contact_portal_access x
       WHERE lower(x.portal_email) = v_email AND x.enabled AND x.contact_id <> r.contact_id) THEN
    v_email := NULL;
  END IF;

  IF a.contact_id IS NULL THEN
    INSERT INTO client_contact_portal_access (contact_id, company_id, portal_token, portal_email, invited_by)
    VALUES (r.contact_id, v_company, public._portal_random_token(), v_email, auth.uid())
    RETURNING * INTO a;
  ELSIF NOT a.enabled OR a.revoked_at IS NOT NULL THEN
    UPDATE client_contact_portal_access
       SET enabled = true, revoked_at = NULL, portal_token = public._portal_random_token(), portal_email = v_email,
           password_hash = NULL, activated_at = NULL, reset_token = NULL, reset_expires_at = NULL,
           invited_by = auth.uid(), invited_at = now(), updated_at = now()
     WHERE contact_id = r.contact_id
    RETURNING * INTO a;
  END IF;

  RETURN jsonb_build_object('contact_id', a.contact_id, 'portal_token', a.portal_token,
                            'status', CASE WHEN a.activated_at IS NULL THEN 'invited' ELSE 'active' END);
END;
$$;

-- Revoke a contact's login and end all of their sessions at once.
CREATE OR REPLACE FUNCTION public.revoke_contact_portal_access(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_company uuid := public._portal_staff_company();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM client_contacts WHERE id = p_contact_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  UPDATE client_contact_portal_access
     SET enabled = false, revoked_at = now(), reset_token = NULL, reset_expires_at = NULL, updated_at = now()
   WHERE contact_id = p_contact_id;

  DELETE FROM client_portal_sessions WHERE contact_id = p_contact_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_contact_portal_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invite_project_contact_to_portal(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_contact_portal_access(uuid)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_contact_portal_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_project_contact_to_portal(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_contact_portal_access(uuid)      TO authenticated;

COMMIT;
