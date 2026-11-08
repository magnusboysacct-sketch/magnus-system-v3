-- =====================================================================
-- The Accountant role - Magnus Boy's System
--
-- An accountant (often outside the company, working from home) is invited like any staff member, with the role 'accountant'.
-- They get full finance access automatically, and nothing else:
--   CAN    see all of Finance; enter, approve, dispute and pay supplier bills; give and use supplier advances; undo a bill payment;
--          review bank lines; reconcile; send invoices to clients; the Receipt Inbox (file receipts); Documents (incl. private drawers);
--          a project's Statements folder; open the company's finance files (receipts, statements).
--   CANNOT payroll / HR / worker records, field operations, clock-in, estimating, settings, users, the Secretary Workspace,
--          and the director-only money actions (books start date, cancelling client advances).
-- One accountant login belongs to one company (an accountant for several companies uses a separate e-mail for each).
--
--   1. user_profiles.role and company_invitations.role may be 'accountant'.
--   2. An accountant's finance_access_level is always 'full' (trigger).
--   3. The functions below are the SAME as their latest version (each says which file), with 'accountant' added next to
--      'office_user' and nothing else changed. Generated from those files, so nothing drifts.
--   4. bank_reconciliations: the accountant may make and change reconciliations.
-- Safe to run twice.
-- =====================================================================

begin;

do $$ begin
  if to_regclass('public.receipt_inbox') is null or to_regclass('public.doc_files') is null or to_regclass('public.project_files') is null then
    raise exception 'Run 20260992 (project files), 20260993 (Documents) and 20260994 (Receipt Inbox) first. Nothing was changed.';
  end if;
end $$;

-- 1. the role
alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check
  check (role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary', 'accountant')) not valid;
alter table public.company_invitations drop constraint if exists company_invitations_role_check;
alter table public.company_invitations add constraint company_invitations_role_check
  check (role = any (array['director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary', 'accountant'])) not valid;

-- 2. an accountant always has full finance access
create or replace function public._accountant_finance_full()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.role = 'accountant' then new.finance_access_level := 'full'; end if;
  return new;
end;
$$;
drop trigger if exists accountant_finance_full on public.user_profiles;
create trigger accountant_finance_full before insert or update of role, finance_access_level on public.user_profiles
  for each row execute function public._accountant_finance_full();
update public.user_profiles set finance_access_level = 'full' where role = 'accountant' and finance_access_level is distinct from 'full';

-- 3. the functions
-- _portal_staff_company: from 20260919120000_share_with_client.sql, with 'accountant' added next to 'office_user'
CREATE OR REPLACE FUNCTION public._portal_staff_company()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_role text; v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT up.role, up.company_id INTO v_role, v_company
  FROM user_profiles up WHERE up.id = auth.uid();
  IF v_company IS NULL OR v_role IS NULL
     OR v_role NOT IN ('director','admin','estimator','supervisor','office_user','secretary','accountant') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN v_company;
END;
$$;

-- _finance_full_company: from 20260942000000_restrict_payroll_hr_access.sql, with 'accountant' added next to 'office_user'
CREATE OR REPLACE FUNCTION public._finance_full_company()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT up.company_id FROM user_profiles up
   WHERE up.id = auth.uid()
     AND up.finance_access_level = 'full'
     AND up.role IN ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'accountant', 'site_user', 'secretary')
   LIMIT 1;
$$;

-- private_files_access: from 20260948000000_private_files_and_storage_access.sql, with 'accountant' added next to 'office_user'
CREATE OR REPLACE FUNCTION public.private_files_access(p_name text, p_owner uuid, p_mode text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid; v_role text; v_finance text;
  v_class text := public.private_files_class(p_name);
  v_read boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT up.company_id, up.role, up.finance_access_level INTO v_company, v_role, v_finance FROM public.user_profiles up WHERE up.id = v_uid LIMIT 1;
  IF v_company IS NULL OR v_role NOT IN ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'accountant', 'site_user', 'secretary') THEN RETURN false; END IF;
  IF split_part(p_name, '/', 1) <> v_company::text THEN RETURN false; END IF;               -- the first folder is the company

  IF p_mode = 'insert' THEN
    RETURN v_class <> 'id_scan' OR v_role IN ('director', 'admin', 'secretary', 'supervisor', 'site_user');
  END IF;

  v_read := CASE v_class
              WHEN 'id_scan' THEN v_role IN ('director', 'admin', 'secretary')
              WHEN 'finance' THEN coalesce(v_finance = 'full', false) OR p_owner = v_uid
              ELSE true
            END;
  IF p_mode = 'read' THEN RETURN v_read; END IF;
  IF p_mode = 'change' THEN RETURN v_read OR p_owner = v_uid; END IF;                       -- the uploader may replace or remove their own file
  RETURN false;
END;
$$;

-- _caller_may_use_company: from 20260959000000_platform_billing.sql, with 'accountant' added next to 'office_user'
create or replace function public._caller_may_use_company(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role   text;
begin
  if v_claims is null and session_user <> 'authenticator' then return true; end if;   -- direct database connection
  if v_claims is not null then
    begin v_role := v_claims::jsonb ->> 'role'; exception when others then v_role := null; end;
    if v_role = 'service_role' then return true; end if;
  end if;
  if exists (select 1 from public.companies c where c.id = p_company_id and c.account_status = 'closed') then
    return false;
  end if;
  return coalesce(p_company_id is not null and p_company_id = (
    select up.company_id from user_profiles up
     where up.id = auth.uid()
       and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'accountant', 'site_user', 'secretary')
     limit 1), false);
end;
$$;

-- approve_bill: from 20260975000000_bills_to_books.sql, with 'accountant' added next to 'office_user'
create or replace function public.approve_bill(p_id uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can approve bills.'; end if;
  update public.supplier_invoices set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = p_id and company_id = v_company and status in ('pending', 'disputed');
  if not found then raise exception 'Bill not found, or it is already approved.'; end if;
end;
$$;

-- create_bill: from 20260975000000_bills_to_books.sql, with 'accountant' added next to 'office_user'
create or replace function public.create_bill(p_bill jsonb, p_lines jsonb, p_approve boolean default false)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  v_id   uuid;
  v_sub  numeric := 0;
  v_tax  numeric := round(greatest(coalesce((p_bill ->> 'tax_amount')::numeric, 0), 0), 2);
  v_retp numeric := round(greatest(coalesce((p_bill ->> 'retention_percent')::numeric, 0), 0), 2);
  v_total numeric;
  l jsonb;
  n int := 0;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if trim(coalesce(p_bill ->> 'invoice_number', '')) = '' then raise exception 'Type the bill number (the supplier''s invoice number).'; end if;
  if (p_bill ->> 'supplier_id') is null or not exists (select 1 from public.suppliers where id = (p_bill ->> 'supplier_id')::uuid and company_id = v_company) then
    raise exception 'Choose the supplier.';
  end if;
  if (p_bill ->> 'project_id') is not null and not exists (select 1 from public.projects where id = (p_bill ->> 'project_id')::uuid and company_id = v_company) then
    raise exception 'That project is not in your company.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Add at least one line.'; end if;
  if v_retp > 50 then raise exception 'Retention above 50%% is not allowed.'; end if;
  if p_approve and v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can approve bills.'; end if;
  if exists (select 1 from public.supplier_invoices where company_id = v_company and supplier_id = (p_bill ->> 'supplier_id')::uuid
              and lower(invoice_number) = lower(trim(p_bill ->> 'invoice_number'))) then
    raise exception 'This supplier''s bill % is already entered.', trim(p_bill ->> 'invoice_number');
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    if trim(coalesce(l ->> 'item_name', '')) = '' then raise exception 'Every line needs a description.'; end if;
    if coalesce((l ->> 'amount')::numeric, 0) <= 0 then raise exception 'Every line needs an amount above zero.'; end if;
    if (l ->> 'chart_account_id') is null then raise exception 'Choose the cost account for "%".', l ->> 'item_name'; end if;
    v_sub := v_sub + round((l ->> 'amount')::numeric, 2);
  end loop;
  v_total := v_sub + v_tax;

  insert into public.supplier_invoices (company_id, supplier_id, project_id, invoice_number, invoice_date, due_date,
                                        subtotal, tax_amount, shipping_amount, total_amount, amount_paid, balance_due, status,
                                        retention_percent, retention_amount, notes, created_by)
  values (v_company, (p_bill ->> 'supplier_id')::uuid, nullif(p_bill ->> 'project_id', '')::uuid, trim(p_bill ->> 'invoice_number'),
          coalesce((p_bill ->> 'invoice_date')::date, current_date), coalesce((p_bill ->> 'due_date')::date, (p_bill ->> 'invoice_date')::date, current_date),
          v_sub, v_tax, 0, v_total, 0, v_total, 'pending', v_retp, round(v_sub * v_retp / 100, 2),
          nullif(trim(coalesce(p_bill ->> 'notes', '')), ''), auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    insert into public.supplier_invoice_line_items (supplier_invoice_id, line_no, item_name, description, unit, quantity, unit_cost, total_amount, chart_account_id)
    values (v_id, n, left(trim(l ->> 'item_name'), 200), nullif(trim(coalesce(l ->> 'description', '')), ''), 'each', 1,
            round((l ->> 'amount')::numeric, 2), round((l ->> 'amount')::numeric, 2), (l ->> 'chart_account_id')::uuid);
  end loop;

  if p_approve then
    update public.supplier_invoices set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = v_id;
  else
    update public.supplier_invoices set updated_at = now() where id = v_id;   -- writes the "waiting for approval" note
  end if;
  return v_id;
end;
$$;

-- dispute_bill: from 20260975000000_bills_to_books.sql, with 'accountant' added next to 'office_user'
create or replace function public.dispute_bill(p_id uuid, p_reason text)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can dispute bills.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Write why the bill is disputed.'; end if;
  if exists (select 1 from public.supplier_payments where invoice_id = p_id) then
    raise exception 'This bill already has payments. Remove them first.';
  end if;
  update public.supplier_invoices
     set status = 'disputed', notes = left(trim(coalesce(notes, '') || ' | Disputed: ' || trim(p_reason)), 2000)
   where id = p_id and company_id = v_company;
  if not found then raise exception 'Bill not found.'; end if;
end;
$$;

-- pay_bill: from 20260977000000_bill_payment_proof.sql, with 'accountant' added next to 'office_user'
create or replace function public.pay_bill(p_bill uuid, p_amount numeric, p_date date, p_paid_from uuid,
                                           p_method text default 'wire', p_reference text default null, p_retention boolean default false,
                                           p_received_by text default null, p_signature text default null, p_proof_path text default null)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  b         public.supplier_invoices%rowtype;
  v_from    public.chart_of_accounts%rowtype;
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_ret     numeric;
  v_ret_paid numeric;
  v_reg_paid numeric;
  v_left    numeric;
  v_id      uuid;
  v_num     text;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can pay bills.'; end if;
  select * into b from public.supplier_invoices where id = p_bill and company_id = v_company for update;
  if b.id is null then raise exception 'Bill not found.'; end if;
  if b.status = 'pending' then raise exception 'Approve the bill first, then pay it.'; end if;
  if b.status = 'disputed' then raise exception 'This bill is disputed. Approve it again before paying it.'; end if;
  if v_amt <= 0 then raise exception 'Type an amount above zero.'; end if;
  if p_date is null then raise exception 'Choose the date it was paid.'; end if;
  if p_paid_from is null then raise exception 'Choose where the money was paid from.'; end if;
  select * into v_from from public.chart_of_accounts where id = p_paid_from and company_id = v_company;
  if v_from.id is null or not public._is_money_account(v_from) then raise exception '"Paid from" must be one of your bank, cash or card accounts.'; end if;
  if coalesce(p_method, '') not in ('check', 'ach', 'wire', 'credit_card', 'cash', 'other') then raise exception 'Choose how it was paid.'; end if;
  if nullif(p_signature, '') is not null and trim(coalesce(p_received_by, '')) = '' then raise exception 'Type the name of the person who signed.'; end if;

  v_ret := round(coalesce(b.retention_amount, 0), 2);
  select coalesce(sum(amount) filter (where is_retention_release), 0), coalesce(sum(amount) filter (where not is_retention_release), 0)
    into v_ret_paid, v_reg_paid from public.supplier_payments where invoice_id = b.id;

  if p_retention then
    if v_ret <= 0 then raise exception 'This bill has no retention held.'; end if;
    v_left := round(v_ret - v_ret_paid, 2);
    if v_left <= 0 then raise exception 'The retention on this bill is already paid.'; end if;
    if v_amt > v_left then raise exception 'Only % of retention is still held on this bill.', to_char(v_left, 'FM999,999,999,990.00'); end if;
  else
    v_left := round(coalesce(b.total_amount, 0) - v_ret - v_reg_paid, 2);
    if v_left <= 0 then
      raise exception '%', case when v_ret - v_ret_paid > 0 then 'Only the retention is left on this bill. Use "Pay retention" when the work is accepted.'
                                else 'This bill is already paid.' end;
    end if;
    if v_amt > v_left then raise exception 'Only % is owed on this bill now.', to_char(v_left, 'FM999,999,999,990.00'); end if;
  end if;

  if exists (select 1 from public.supplier_payments where invoice_id = b.id and amount = v_amt and payment_date = p_date
               and paid_from_account_id = p_paid_from and created_at > now() - interval '2 minutes') then
    raise exception 'This same payment was just saved. Check the bill before paying again.';
  end if;

  v_num := 'BP-' || lpad(((select count(*) from public.supplier_payments where company_id = v_company) + 1)::text, 4, '0');
  insert into public.supplier_payments (company_id, supplier_id, invoice_id, payment_number, payment_date, amount, payment_method,
                                        check_number, reference_number, notes, created_by, paid_from_account_id, is_retention_release,
                                        received_by_name, signature_data, proof_path)
  values (v_company, b.supplier_id, b.id, v_num, p_date, v_amt, p_method,
          case when p_method = 'check' then nullif(trim(coalesce(p_reference, '')), '') end,
          nullif(trim(coalesce(p_reference, '')), ''), case when p_retention then 'Retention paid' end, auth.uid(), p_paid_from, p_retention,
          nullif(trim(coalesce(p_received_by, '')), ''), nullif(p_signature, ''), nullif(p_proof_path, ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- add_bill_payment_proof: from 20260977000000_bill_payment_proof.sql, with 'accountant' added next to 'office_user'
create or replace function public.add_bill_payment_proof(p_id uuid, p_received_by text, p_signature text, p_proof_path text)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  p         public.supplier_payments%rowtype;
begin
  if v_role not in ('director', 'admin', 'office_user', 'accountant', 'supervisor') then
    raise exception 'Only a director, admin, office user or supervisor can add proof of payment.';
  end if;
  select * into p from public.supplier_payments where id = p_id and company_id = v_company;
  if p.id is null then raise exception 'Payment not found.'; end if;
  if nullif(p_signature, '') is null and nullif(p_proof_path, '') is null then raise exception 'Add a signature or a photo.'; end if;
  if nullif(p_signature, '') is not null and p.signed_at is not null then raise exception 'This payment is already signed.'; end if;
  if nullif(p_proof_path, '') is not null and p.proof_path is not null then raise exception 'This payment already has a proof photo.'; end if;

  update public.supplier_payments
     set received_by_name = case when nullif(p_signature, '') is not null then nullif(trim(coalesce(p_received_by, '')), '') else received_by_name end,
         signature_data   = coalesce(nullif(p_signature, ''), signature_data),
         proof_path       = coalesce(nullif(p_proof_path, ''), proof_path)
   where id = p_id;
end;
$$;

-- apply_supplier_advance: from 20260980000000_supplier_advances.sql, with 'accountant' added next to 'office_user'
create or replace function public.apply_supplier_advance(p_advance uuid, p_bill uuid, p_amount numeric, p_date date default null)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  a         public.supplier_payments%rowtype;
  b         public.supplier_invoices%rowtype;
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_reg_paid numeric;
  v_owed    numeric;
  v_id      uuid;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can use advances on bills.'; end if;
  select * into a from public.supplier_payments where id = p_advance and company_id = v_company for update;
  if a.id is null or not a.is_advance or a.invoice_id is not null then raise exception 'Advance not found.'; end if;
  select * into b from public.supplier_invoices where id = p_bill and company_id = v_company for update;
  if b.id is null then raise exception 'Bill not found.'; end if;
  if b.supplier_id is distinct from a.supplier_id then raise exception 'This advance was given to someone else, not the supplier on bill %.', b.invoice_number; end if;
  if b.status = 'pending' then raise exception 'Approve the bill first, then use the advance on it.'; end if;
  if b.status = 'disputed' then raise exception 'This bill is disputed. Approve it again first.'; end if;
  if v_amt <= 0 then raise exception 'Type an amount above zero.'; end if;
  if v_amt > round(a.amount, 2) then raise exception 'Only % is left on this advance.', to_char(a.amount, 'FM999,999,999,990.00'); end if;
  select coalesce(sum(amount), 0) into v_reg_paid from public.supplier_payments where invoice_id = b.id and not is_retention_release;
  v_owed := round(coalesce(b.total_amount, 0) - coalesce(b.retention_amount, 0) - v_reg_paid, 2);
  if v_amt > v_owed then
    raise exception 'Only % is owed on bill % now (retention is paid separately).', to_char(greatest(v_owed, 0), 'FM999,999,999,990.00'), b.invoice_number;
  end if;

  insert into public.supplier_payments (company_id, supplier_id, invoice_id, project_id, payment_number, payment_date, amount, payment_method,
                                        reference_number, notes, created_by, paid_from_account_id, is_advance,
                                        applied_from_payment_id, applied_on)
  values (v_company, a.supplier_id, b.id, a.project_id, left(coalesce(a.payment_number, 'ADV') || '-' || b.invoice_number, 100),
          a.payment_date, v_amt, a.payment_method, a.reference_number,
          'From advance ' || coalesce(a.payment_number, '') || ', used on ' || to_char(coalesce(p_date, current_date), 'DD Mon YYYY'),
          auth.uid(), a.paid_from_account_id, true, a.id, coalesce(p_date, current_date))
  returning id into v_id;

  update public.supplier_payments set amount = round(amount - v_amt, 2) where id = a.id;
  return v_id;
end;
$$;

-- pay_supplier_advance: from 20260980000000_supplier_advances.sql, with 'accountant' added next to 'office_user'
create or replace function public.pay_supplier_advance(p_supplier uuid, p_project uuid, p_amount numeric, p_date date, p_paid_from uuid,
                                                       p_method text default 'wire', p_reference text default null,
                                                       p_received_by text default null, p_signature text default null, p_proof_path text default null)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  v_from    public.chart_of_accounts%rowtype;
  v_amt     numeric := round(coalesce(p_amount, 0), 2);
  v_id      uuid;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  if v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can give advances.'; end if;
  if p_supplier is null or not exists (select 1 from public.suppliers where id = p_supplier and company_id = v_company) then
    raise exception 'Choose who the advance is for.';
  end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project and company_id = v_company) then
    raise exception 'That project is not in your company.';
  end if;
  if v_amt <= 0 then raise exception 'Type an amount above zero.'; end if;
  if p_date is null then raise exception 'Choose the date it was paid.'; end if;
  if p_paid_from is null then raise exception 'Choose where the money was paid from.'; end if;
  select * into v_from from public.chart_of_accounts where id = p_paid_from and company_id = v_company;
  if v_from.id is null or not public._is_money_account(v_from) then raise exception '"Paid from" must be one of your bank, cash or card accounts.'; end if;
  if coalesce(p_method, '') not in ('check', 'ach', 'wire', 'credit_card', 'cash', 'other') then raise exception 'Choose how it was paid.'; end if;
  if nullif(p_signature, '') is not null and trim(coalesce(p_received_by, '')) = '' then raise exception 'Type the name of the person who signed.'; end if;
  if exists (select 1 from public.supplier_payments where company_id = v_company and supplier_id = p_supplier and is_advance and invoice_id is null
               and amount = v_amt and payment_date = p_date and paid_from_account_id = p_paid_from and created_at > now() - interval '2 minutes') then
    raise exception 'This same advance was just saved. Check the list before saving again.';
  end if;

  perform public._find_supplier_advances(v_company);   -- make the account now if it is missing
  insert into public.supplier_payments (company_id, supplier_id, invoice_id, project_id, payment_number, payment_date, amount, payment_method,
                                        check_number, reference_number, notes, created_by, paid_from_account_id, is_advance,
                                        received_by_name, signature_data, proof_path)
  values (v_company, p_supplier, null, p_project,
          'ADV-' || lpad(((select count(*) from public.supplier_payments where company_id = v_company and is_advance and applied_from_payment_id is null) + 1)::text, 4, '0'),
          p_date, v_amt, p_method,
          case when p_method = 'check' then nullif(trim(coalesce(p_reference, '')), '') end,
          nullif(trim(coalesce(p_reference, '')), ''), 'Advance', auth.uid(), p_paid_from, true,
          nullif(trim(coalesce(p_received_by, '')), ''), nullif(p_signature, ''), nullif(p_proof_path, ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- undo_bill_payment: from 20260980000000_supplier_advances.sql, with 'accountant' added next to 'office_user'
create or replace function public.undo_bill_payment(p_id uuid)
returns void
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  p         public.supplier_payments%rowtype;
begin
  if v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can undo a bill payment.'; end if;
  select * into p from public.supplier_payments where id = p_id and company_id = v_company;
  if p.id is null then raise exception 'Payment not found.'; end if;
  if (p.signed_at is not null or p.proof_path is not null) and v_role not in ('director', 'admin') then
    raise exception 'This payment has proof (signed or a photo). Only a director or admin can undo it.';
  end if;
  if p.is_advance and p.invoice_id is null and exists (select 1 from public.supplier_payments x where x.applied_from_payment_id = p.id) then
    raise exception 'Part of this advance is used on a bill. Take it off the bill first (Unapply on the bill), then undo the advance.';
  end if;
  delete from public.supplier_payments where id = p_id;
end;
$$;

-- create_bill_from_po: from 20260981000000_bill_from_purchase_order.sql, with 'accountant' added next to 'office_user'
create or replace function public.create_bill_from_po(p_po uuid, p_bill jsonb, p_lines jsonb, p_approve boolean default false)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  po        public.purchase_orders%rowtype;
  v_supplier uuid;
  v_id      uuid;
  v_sub     numeric := 0;
  v_tax     numeric := round(greatest(coalesce((p_bill ->> 'tax_amount')::numeric, 0), 0), 2);
  v_retp    numeric := round(greatest(coalesce((p_bill ->> 'retention_percent')::numeric, 0), 0), 2);
  v_num     text := trim(coalesce(p_bill ->> 'invoice_number', ''));
  v_date    date := coalesce((p_bill ->> 'invoice_date')::date, current_date);
  l         jsonb;
  i         record;
  n         int := 0;
  v_qty     numeric;
  v_rate    numeric;
  v_left    numeric;
  v_status  text;
  v_note    text;
  v_price_ok boolean := true;
  v_recv_ok  boolean := true;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  select * into po from public.purchase_orders where id = p_po and company_id = v_company for update;
  if po.id is null then raise exception 'Purchase order not found.'; end if;
  if po.status in ('draft', 'cancelled') then raise exception 'Purchase order % is %. Issue it first.', po.po_number, po.status; end if;
  if v_num = '' then raise exception 'Type the bill number (the supplier''s invoice number).'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Choose at least one line to bill.'; end if;
  if v_retp > 50 then raise exception 'Retention above 50%% is not allowed.'; end if;
  if p_approve and v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can approve bills.'; end if;

  -- The supplier: the PO's, else the one with the PO's supplier name, else add it.
  v_supplier := po.supplier_id;
  if v_supplier is null then
    select id into v_supplier from public.suppliers
     where company_id = v_company and lower(supplier_name) = lower(trim(po.supplier_name)) limit 1;
    if v_supplier is null then
      if trim(coalesce(po.supplier_name, '')) = '' then raise exception 'This PO has no supplier. Open the PO and set the supplier first.'; end if;
      insert into public.suppliers (company_id, supplier_name, is_active) values (v_company, trim(po.supplier_name), true)
      returning id into v_supplier;
    end if;
  end if;
  if exists (select 1 from public.supplier_invoices where company_id = v_company and supplier_id = v_supplier
              and lower(invoice_number) = lower(v_num)) then
    raise exception 'This supplier''s bill % is already entered.', v_num;
  end if;

  insert into public.supplier_invoices (company_id, supplier_id, project_id, purchase_order_id, invoice_number, invoice_date, due_date,
                                        subtotal, tax_amount, shipping_amount, total_amount, amount_paid, balance_due, status,
                                        retention_percent, retention_amount, notes, created_by)
  values (v_company, v_supplier, po.project_id, po.id, v_num, v_date,
          coalesce((p_bill ->> 'due_date')::date, v_date + 30), 0, v_tax, 0, v_tax, 0, v_tax, 'pending', v_retp, 0,
          nullif(trim(coalesce(p_bill ->> 'notes', '')), ''), auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    select it.*, coalesce(it.delivered_qty, 0) recv,
           coalesce((select sum(x.quantity) from public.supplier_invoice_line_items x join public.supplier_invoices s on s.id = x.supplier_invoice_id
                      where x.purchase_order_item_id = it.id and s.status <> 'disputed' and s.id <> v_id), 0) billed
      into i
      from public.purchase_order_items it
     where it.id = (l ->> 'po_item_id')::uuid and it.purchase_order_id = po.id;
    if not found then raise exception 'A line is not on purchase order %.', po.po_number; end if;
    v_qty  := round(coalesce((l ->> 'quantity')::numeric, 0), 4);
    v_rate := round(coalesce((l ->> 'unit_cost')::numeric, i.unit_rate), 4);
    if v_qty <= 0 then raise exception 'Type the quantity billed for "%".', i.material_name; end if;
    if v_rate < 0 then raise exception 'The price for "%" can''t be below zero.', i.material_name; end if;
    if (l ->> 'chart_account_id') is null then raise exception 'Choose the cost account for "%".', i.material_name; end if;

    v_left := i.recv - i.billed;
    v_status := 'matched'; v_note := null;
    if i.recv <= 0 then
      v_status := 'not_received'; v_note := 'Nothing received on the PO yet.'; v_recv_ok := false;
    elsif v_qty > v_left + 0.0001 then
      v_status := 'quantity_mismatch';
      v_note := 'Billed ' || trim_scale(v_qty) || ' but only ' || trim_scale(greatest(v_left, 0)) || ' received and not billed yet.';
      v_recv_ok := false;
    end if;
    if abs(v_rate - i.unit_rate) > 0.005 then
      if v_status = 'matched' then v_status := 'price_mismatch'; end if;
      v_note := concat_ws(' ', v_note, 'Price ' || trim_scale(v_rate) || ' but the PO says ' || trim_scale(i.unit_rate::numeric) || '.');
      v_price_ok := false;
    end if;

    n := n + 1;
    insert into public.supplier_invoice_line_items (supplier_invoice_id, purchase_order_item_id, line_no, item_name, description, unit,
                                                    quantity, unit_cost, total_amount, chart_account_id,
                                                    po_quantity, po_unit_cost, received_quantity, match_status, match_notes)
    values (v_id, i.id, n, left(i.material_name, 200), i.description, coalesce(nullif(i.unit, ''), 'each'),
            v_qty, v_rate, round(v_qty * v_rate, 2), (l ->> 'chart_account_id')::uuid,
            i.quantity, i.unit_rate, i.recv, v_status, v_note);
    v_sub := v_sub + round(v_qty * v_rate, 2);
  end loop;

  if p_approve and not (v_price_ok and v_recv_ok) then
    raise exception 'This bill does not match the PO or what was received (see the flags on the lines). Save it waiting for approval; a director can approve it after checking.';
  end if;

  update public.supplier_invoices
     set subtotal = v_sub, total_amount = v_sub + v_tax, balance_due = v_sub + v_tax,
         retention_amount = round(v_sub * v_retp / 100, 2),
         po_matched = v_price_ok, receiving_matched = v_recv_ok,
         three_way_match_status = case when v_price_ok and v_recv_ok then 'matched' else 'discrepancy' end,
         status = case when p_approve then 'approved' else status end,
         approved_by = case when p_approve then auth.uid() else approved_by end,
         approved_at = case when p_approve then now() else approved_at end,
         updated_at = now()
   where id = v_id;
  return v_id;
end;
$$;

-- _bank_line_for: from 20260982000000_bank_review.sql, with 'accountant' added next to 'office_user'
create or replace function public._bank_line_for(p_line uuid, out line public.bank_transactions, out bank_acct uuid, out money_in boolean)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can review bank lines.'; end if;
  select * into line from public.bank_transactions where id = p_line and company_id = v_company;
  if line.id is null then raise exception 'Bank line not found.'; end if;
  select b.chart_account_id into bank_acct from public.bank_accounts b where b.id = line.bank_account_id;
  if bank_acct is null then raise exception 'This bank account is not linked to your chart of accounts yet. Link it on the Bank Accounts page first.'; end if;
  money_in := coalesce(line.transaction_type, 'debit') in ('credit', 'transfer_in');
end;
$$;

-- _rec_get: from 20260983000000_bank_reconcile.sql, with 'accountant' added next to 'office_user'
create or replace function public._rec_get(p_rec uuid, p_need_role boolean default true)
returns public.bank_reconciliations
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  r public.bank_reconciliations%rowtype;
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
begin
  if p_need_role and v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can reconcile.'; end if;
  select * into r from public.bank_reconciliations where id = p_rec and company_id = v_company;
  if r.id is null then raise exception 'Reconciliation not found.'; end if;
  return r;
end;
$$;

-- reconcile_start: from 20260983000000_bank_reconcile.sql, with 'accountant' added next to 'office_user'
create or replace function public.reconcile_start(p_bank uuid, p_statement_date date, p_statement_balance numeric)
returns uuid
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  v_role    text := (select role from public.user_profiles where id = auth.uid());
  b         public.bank_accounts%rowtype;
  v_last    public.bank_reconciliations%rowtype;
  v_id      uuid;
begin
  if v_role not in ('director', 'admin', 'office_user', 'accountant') then raise exception 'Only a director, admin, office user or accountant can reconcile.'; end if;
  select * into b from public.bank_accounts where id = p_bank and company_id = v_company;
  if b.id is null then raise exception 'Bank account not found.'; end if;
  if b.chart_account_id is null then raise exception 'Link this bank account to your chart of accounts first (Bank Accounts page).'; end if;
  if p_statement_date is null then raise exception 'Type the statement end date.'; end if;
  if p_statement_balance is null then raise exception 'Type the ending balance on the statement.'; end if;
  if p_statement_date > current_date then raise exception 'The statement date can''t be in the future.'; end if;

  select * into v_last from public.bank_reconciliations where bank_account_id = b.id and status = 'done' order by statement_date desc limit 1;
  if v_last.id is not null and p_statement_date <= v_last.statement_date then
    raise exception 'The last statement reconciled ended on %. Choose a later date.', to_char(v_last.statement_date, 'DD Mon YYYY');
  end if;

  select id into v_id from public.bank_reconciliations where bank_account_id = b.id and status = 'open';
  if v_id is not null then
    update public.bank_reconciliations set statement_date = p_statement_date, statement_balance = round(p_statement_balance, 2),
           chart_account_id = b.chart_account_id, opening_balance = coalesce(v_last.statement_balance, 0)
     where id = v_id;
    -- entries now after the statement date come off
    update public.gl_entries e set reconciliation_id = null
      from public.gl_transactions g
     where e.reconciliation_id = v_id and g.id = e.transaction_id and g.transaction_date > p_statement_date;
  else
    insert into public.bank_reconciliations (company_id, bank_account_id, chart_account_id, statement_date, statement_balance, opening_balance, created_by)
    values (v_company, b.id, b.chart_account_id, p_statement_date, round(p_statement_balance, 2), coalesce(v_last.statement_balance, 0), auth.uid())
    returning id into v_id;
  end if;

  -- Tick what Bank review already matched to a statement line dated on or before the statement date.
  update public.gl_entries e set reconciliation_id = v_id
   where e.id in (select c.entry_id from public._rec_candidates(v_id) c where not c.ticked)
     and exists (select 1 from public.bank_transactions bt
                  where bt.gl_transaction_id = e.transaction_id and bt.bank_account_id = b.id
                    and bt.review_action in ('matched', 'added') and bt.transaction_date <= p_statement_date);
  return v_id;
end;
$$;

-- _project_files_can: from 20260992000000_project_files.sql, with 'accountant' added next to 'office_user'
create or replace function public._project_files_can(p_company uuid, p_folder text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_profiles up
     where up.id = auth.uid() and up.company_id = p_company and coalesce(up.status, 'active') = 'active'
       and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'accountant', 'site_user', 'secretary')
       and (p_folder = 'client_boq' or coalesce(up.finance_access_level, 'none') = 'full'))
$$;

-- _docs_role: from 20260993000000_filing_cabinet.sql, with 'accountant' added next to 'office_user'
create or replace function public._docs_role(p_company uuid)
returns text language sql stable security definer set search_path = public, pg_temp
as $$
  select up.role from public.user_profiles up
   where up.id = auth.uid() and up.company_id = p_company and coalesce(up.status, 'active') = 'active'
     and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'accountant', 'site_user', 'secretary')
$$;

-- _receipt_inbox_staff: from 20260994000000_receipt_inbox.sql, with 'accountant' added next to 'office_user'
create or replace function public._receipt_inbox_staff(p_company uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.user_profiles up
                  where up.id = auth.uid() and up.company_id = p_company and coalesce(up.status, 'active') = 'active'
                    and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'accountant', 'site_user', 'secretary'))
$$;

-- 4. reconciliations
drop policy if exists "Finance staff change reconciliations" on public.bank_reconciliations;
create policy "Finance staff change reconciliations" on public.bank_reconciliations for all to authenticated
  using (company_id in (select company_id from public.user_profiles where id = auth.uid() and role in ('director', 'admin', 'office_user', 'accountant')))
  with check (company_id in (select company_id from public.user_profiles where id = auth.uid() and role in ('director', 'admin', 'office_user', 'accountant')));

commit;
