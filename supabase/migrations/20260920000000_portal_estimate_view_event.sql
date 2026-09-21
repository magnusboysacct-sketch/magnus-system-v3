-- Let log_portal_event accept 'estimate_view' and include it in the client_portal_item_views view.
BEGIN;
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.log_portal_event(text,text,text,text,uuid,jsonb)'::regprocedure);
  IF position('estimate_view' in d) = 0 THEN
    d := replace(d, '''photo_download'',', '''photo_download'',''estimate_view'',');
    d := replace(d, '''change_view'']', '''change_view'',''estimate_view'']');
    IF (length(d) - length(replace(d, 'estimate_view', ''))) / length('estimate_view') <> 2 THEN
      RAISE EXCEPTION 'Patch did not apply cleanly; nothing was changed';
    END IF;
    EXECUTE d;
  END IF;
END $$;
CREATE OR REPLACE VIEW public.client_portal_item_views
WITH (security_invoker = true) AS
SELECT company_id, client_id, project_id, entity_type, entity_id,
  min(occurred_at) AS first_seen_at, max(occurred_at) AS last_seen_at, count(*) AS view_count
FROM public.client_portal_activity
WHERE entity_id IS NOT NULL
  AND event_type IN ('photo_view','photo_download','contract_view','invoice_view','change_view','estimate_view')
GROUP BY company_id, client_id, project_id, entity_type, entity_id;
COMMIT;
