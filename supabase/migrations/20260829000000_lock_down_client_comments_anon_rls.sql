/*
  client_comments RLS lockdown — anon access via SECURITY DEFINER functions only

  Confirmed live via Supabase SQL Editor (this session's own investigation):
  - Staff (authenticated) policies on client_comments are correctly scoped
    by company_id already — NOT touched by this migration at all.
  - The anon SELECT/INSERT/UPDATE policies only checked
    `client_id IN (SELECT id FROM clients WHERE portal_enabled = true)` —
    never validated the actual token. Any request using the public anon
    key could read or write ANY portal-enabled client's comments simply by
    supplying a different client_id, since the real portal_token/session
    check only ever happened in browser JavaScript, never in the database.
  - No DELETE policies exist for anon or authenticated — left as-is
    (default-deny, RLS enabled with no permissive DELETE policy for
    either role).

  Functions are keyed on client_portal_sessions.session_token (text), NOT
  clients.portal_token, despite the original request describing the
  latter — confirmed by tracing ClientPortalPage.tsx and
  supabase/functions/client-portal-login/index.ts directly: client_comments
  is only ever touched from loadData()/submitComment(), and BOTH are only
  reached after a client_portal_sessions.session_token has already been
  validated, via either the magic-link flow's cached localStorage session
  or the entirely separate email+password flow's own session route (which
  never has portal_token in scope in the browser at all — that flow
  doesn't go through a magic link). session_token is the one credential
  both flows genuinely possess at the moment client_comments is touched;
  portal_token is real but gates other things (the initial display-info
  read, the login edge function's own magic-link actions), not this.
  session_token is a 64-char hex string from crypto.getRandomValues() (see
  generateToken() in the edge function), not a uuid — confirmed live this
  round, hence the `text` parameter type below.
*/

-- 1. Replaces the direct SELECT in ClientPortalPage.tsx's loadData().
--    Faithful to current behavior: ALL comments for the validated client,
--    no project_id filter (the existing query never filtered by it
--    either, despite the column existing on client_comments).
CREATE OR REPLACE FUNCTION get_portal_comments(p_session_token text)
RETURNS SETOF client_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- 2. Replaces the direct INSERT in ClientPortalPage.tsx's submitComment().
--    client_id is NEVER accepted as a parameter from the caller — always
--    derived from the validated session, per the approved design.
CREATE OR REPLACE FUNCTION insert_portal_comment(
  p_session_token text,
  p_project_id uuid,
  p_message text
)
RETURNS SETOF client_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  RETURN QUERY
    INSERT INTO client_comments (client_id, project_id, message, sender_type)
    VALUES (v_client_id, p_project_id, p_message, 'client')
    RETURNING *;
END;
$$;

-- 3. Explicit execute grants — not relying on default PUBLIC access to a
--    newly-created function.
REVOKE ALL ON FUNCTION get_portal_comments(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION insert_portal_comment(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_portal_comments(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION insert_portal_comment(text, uuid, text) TO anon, authenticated;

-- 4. Drop every anon-facing policy on client_comments. Queries
--    pg_policies rather than hardcoding names (never confirmed exact
--    policyname strings), so this is correct regardless of what they're
--    actually called. Only targets policies where 'anon' is among the
--    roles — the confirmed-correct authenticated/staff policies are
--    untouched.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'client_comments'
      AND 'anon' = ANY(roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON client_comments', pol.policyname);
  END LOOP;
END $$;

-- Result: anon has zero policies left on client_comments. RLS stays
-- enabled (unchanged from its current live state) — with zero permissive
-- policies for anon, every direct anon SELECT/INSERT/UPDATE/DELETE
-- against the table is now default-denied. The two functions above are
-- the only remaining path for anon/portal access, and they keep working
-- regardless since SECURITY DEFINER runs as the function owner, which
-- bypasses RLS on the tables it touches. Staff (authenticated) policies
-- are completely untouched by this migration.
