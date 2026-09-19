-- Tighten insert_portal_comment so the project must belong to the client identified by the portal session.
BEGIN;

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

COMMIT;
