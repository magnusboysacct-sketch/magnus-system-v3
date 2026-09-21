-- Add the session-validated get_portal_contract_schedule and stop get_portal_contracts from returning the internal notes field.
BEGIN;

-- 1. Payment schedule for ONE contract the client was sent (session-validated)
CREATE OR REPLACE FUNCTION public.get_portal_contract_schedule(p_session_token text, p_contract_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_client uuid := public._portal_session_client(p_session_token);
BEGIN
  IF v_client IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM client_contracts k
    WHERE k.id = p_contract_id AND k.client_id = v_client AND k.shared_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT jsonb_build_object(
             'id', s.id, 'milestone_name', s.milestone_name,
             'milestone_description', s.milestone_description,
             'due_date', s.due_date, 'amount', s.amount,
             'percent_complete', s.percent_complete, 'sort_order', s.sort_order)
    FROM contract_payment_schedules s
    WHERE s.contract_id = p_contract_id
    ORDER BY s.sort_order NULLS LAST, s.due_date NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_contract_schedule(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_contract_schedule(text, uuid) TO anon, authenticated;

-- 2. Stop sending the internal "notes" field to clients
CREATE OR REPLACE FUNCTION public.get_portal_contracts(p_session_token text)
RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_client uuid := public._portal_session_client(p_session_token);
BEGIN
  IF v_client IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT to_jsonb(k) - 'created_by' - 'contractor_signed_by' - 'client_signature_token'
                       - 'shared_by' - 'notes'
    FROM client_contracts k
    WHERE k.client_id = v_client AND k.shared_at IS NOT NULL
    ORDER BY k.created_at DESC;
END;
$$;

COMMIT;
