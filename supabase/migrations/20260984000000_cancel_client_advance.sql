-- =====================================================================
-- Cancel a client advance - director or supervisor only
-- Magnus Boy's System
--
--   * cancel_client_advance(advance, reason): removes an advance (money a client paid for a project before it was
--     invoiced). Its entry in the books is reversed (the reversal is kept, with who cancelled it and why).
--     Refused while part of it is used on an invoice: take that part off the invoice first (delete that payment on
--     the invoice - it goes back to the advance), then cancel.
--   * Only a director or supervisor, checked in the database: a trigger refuses deleting an advance any other way
--     for other roles (server jobs, the SQL Editor and Magnus HQ are not affected). Payments on invoices are unchanged.
-- Runs as the signed-in user. Safe to run twice.
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
  if exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()) then return old; end if;
  if coalesce((select role from public.user_profiles where id = auth.uid()), '') not in ('director', 'supervisor') then
    raise exception 'Only a director or supervisor can cancel an advance.' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists client_advance_delete_guard on public.client_payments;
create trigger client_advance_delete_guard
  before delete on public.client_payments
  for each row execute function public._client_advance_delete_guard();

create or replace function public.cancel_client_advance(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  v_name    text := (select coalesce(nullif(trim(full_name), ''), email) from public.user_profiles where id = auth.uid());
  a         public.client_payments%rowtype;
  v_number  text;
  v_used    text;
begin
  if v_role not in ('director', 'supervisor') then raise exception 'Only a director or supervisor can cancel an advance.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write why the advance is being cancelled.'; end if;
  select * into a from public.client_payments where id = p_id and company_id = v_company for update;
  if a.id is null or a.invoice_id is not null or a.project_id is null then raise exception 'Advance not found.'; end if;

  select string_agg(distinct coalesce(ci.invoice_number, '?'), ', ') into v_used
    from public.client_payments x left join public.client_invoices ci on ci.id = x.invoice_id
   where x.applied_from_payment_id = a.id;
  if v_used is not null then
    raise exception 'Part of this advance is used on invoice %. Delete that payment on the invoice first (it goes back to the advance), then cancel.', v_used;
  end if;

  select transaction_number into v_number from public.gl_transactions where id = a.gl_transaction_id;
  delete from public.client_payments where id = a.id;

  -- Keep who cancelled it and why on the reversal in the books.
  if v_number is not null then
    update public.gl_transactions
       set notes = left(trim(coalesce(notes, '') || ' | Advance cancelled by ' || coalesce(v_name, 'a user') || ': ' || trim(p_reason)), 1000)
     where company_id = a.company_id and reference = 'VOID: ' || v_number and status = 'posted';
  end if;
end;
$$;

grant execute on function public.cancel_client_advance(uuid, text) to authenticated;
