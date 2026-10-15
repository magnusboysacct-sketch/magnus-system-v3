-- get_share_preview(p_kind, p_token): what a link-preview bot (WhatsApp, Facebook, Slack, ...) may be told about a share link.
--
-- The /api/share-preview edge function calls this with the anon key when a preview bot opens /portal/<token>, /portal/contact/<token> or
-- /shared/<token>, so the preview shows the SENDING company's logo and name instead of the platform's. It resolves the token to its company and
-- returns ONLY: company_name, logo_url, a generic title and a generic description. Never amounts, client / contact names, addresses, emails or
-- the token itself.
--
--   p_kind = 'portal'   a client's portal link        (clients.portal_token, portal enabled)
--            'contact'  a field officer's invite link (client_contact_portal_access.portal_token, enabled and not revoked)
--            'photos'   a photo share link            (photo_share_links.token, not revoked, not expired)
--
-- An unknown kind, an unknown token, a revoked / expired / disabled link and a company with no name all return NULL, identically, so the caller
-- cannot tell them apart. Read-only; SECURITY DEFINER because anon cannot read these tables.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_share_preview(p_kind text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_kind    text := lower(btrim(coalesce(p_kind, '')));
  v_company uuid;
  v_name    text;
  v_logo    text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 OR length(p_token) > 128 OR v_kind NOT IN ('portal', 'contact', 'photos') THEN
    RETURN NULL;
  END IF;

  IF v_kind = 'portal' THEN
    SELECT c.company_id INTO v_company
      FROM clients c
     WHERE c.portal_token::text = p_token AND c.portal_enabled = true
     LIMIT 1;
  ELSIF v_kind = 'contact' THEN
    SELECT c.company_id INTO v_company
      FROM client_contact_portal_access a
      JOIN client_contacts cc ON cc.id = a.contact_id
      JOIN clients c          ON c.id  = cc.client_id
     WHERE a.portal_token = p_token
       AND a.enabled = true AND a.revoked_at IS NULL
       AND c.portal_enabled = true
     LIMIT 1;
  ELSE
    SELECT l.company_id INTO v_company
      FROM photo_share_links l
     WHERE l.token::text = p_token
       AND l.revoked_at IS NULL
       AND l.expires_at > now()
     LIMIT 1;
  END IF;

  IF v_company IS NULL THEN RETURN NULL; END IF;

  SELECT nullif(btrim(cs.company_name), ''), nullif(btrim(cs.logo_url), '')
    INTO v_name, v_logo
    FROM company_settings cs
   WHERE cs.company_id = v_company
   LIMIT 1;

  IF v_name IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'company_name', v_name,
    'logo_url',     v_logo,
    'title',        CASE WHEN v_kind = 'photos' THEN 'Project photos – ' || v_name ELSE 'Project portal – ' || v_name END,
    'description',  CASE v_kind
                      WHEN 'photos'  THEN 'View the shared project photos. No login needed.'
                      WHEN 'contact' THEN 'Open this link to set up your project portal access.'
                      ELSE                'Sign in to view your project updates and documents.'
                    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_share_preview(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_share_preview(text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_share_preview(text, text) IS
  'Link-preview data for a share link: company name, logo URL and a generic title/description only. NULL for anything unknown, revoked or expired.';

COMMIT;
