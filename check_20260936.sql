select to_regclass('public.client_contact_portal_access') as access_table;
select column_name from information_schema.columns where table_schema='public' and table_name='client_portal_sessions' and column_name='contact_id';
select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('_portal_session_ctx','_portal_can_see_project','get_contact_portal_link_info','get_project_contact_portal_status','invite_project_contact_to_portal','revoke_contact_portal_access') order by 1;
select public.get_portal_data('definitely-not-a-token') is null as invalid_token_ok;