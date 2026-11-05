select
  to_regclass('public.client_contact_portal_access') is not null                                   as access_table,
  exists (select 1 from information_schema.columns where table_schema='public'
          and table_name='client_portal_sessions' and column_name='contact_id')                     as contact_column,
  position('_portal_session_ctx' in pg_get_functiondef('public.get_portal_data(text,uuid)'::regprocedure)) > 0      as portal_data_new,
  position('_portal_session_ctx' in pg_get_functiondef('public.get_portal_comments(text)'::regprocedure)) > 0       as comments_new,
  position('contact_id IS NULL' in pg_get_functiondef('public._portal_session_client(text)'::regprocedure)) > 0     as manager_only_helper,
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in
    ('_portal_session_ctx','_portal_can_see_project','get_contact_portal_link_info',
     'get_project_contact_portal_status','invite_project_contact_to_portal','revoke_contact_portal_access')) as new_functions;