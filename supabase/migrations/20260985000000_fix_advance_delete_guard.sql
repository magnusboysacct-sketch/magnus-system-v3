-- =====================================================================
-- Fix: cancelling a client advance said "permission denied for table platform_admins"
-- Magnus Boy's System
--
-- The guard from 20260984 looked at platform_admins directly; that table is closed to normal logins (correctly), so
-- every cancel failed. It now asks is_platform_admin(), the safe check signed-in users may call. Same rules as before:
-- only a director or supervisor can delete an advance; server jobs, the SQL Editor and Magnus HQ are not affected.
-- Safe to run twice.
-- =====================================================================

create or replace function public._client_advance_delete_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_jwt_role text;
begin
  if old.invoice_id is not null or old.project_id is null then return old; end if;   -- not an advance
  if v_claims is null then return old; end if;                                         -- server job / SQL Editor
  begin v_jwt_role := v_claims::jsonb ->> 'role'; exception when others then v_jwt_role := null; end;
  if v_jwt_role = 'service_role' then return old; end if;
  if coalesce((select role from public.user_profiles where id = auth.uid()), '') in ('director', 'supervisor') then return old; end if;
  if coalesce(public.is_platform_admin(), false) then return old; end if;               -- Magnus HQ
  raise exception 'Only a director or supervisor can cancel an advance.' using errcode = '42501';
end;
$$;
