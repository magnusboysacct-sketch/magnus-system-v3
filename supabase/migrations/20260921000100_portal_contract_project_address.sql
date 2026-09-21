-- Add project_site_address to get_portal_contracts so a contract on any project shows the same Site Address as the staff copy.
BEGIN;

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
                                 'project_name', p.name,
                                 'project_site_address', p.site_address)
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
