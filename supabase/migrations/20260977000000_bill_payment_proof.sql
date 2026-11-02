-- =====================================================================
-- Banking Step 4b-2 - proof of payment on bill payments (signature, photo)
-- Magnus Boy's System
--
-- Cash handed to a contractor or workman needs proof, the same as a field payment:
--   * supplier_payments.received_by_name + signature_data (signed on the phone) + signed_at
--   * supplier_payments.proof_path: a photo of a signed paper receipt, the person / their ID, or a transfer screenshot.
--     Stored in the private-files bucket under <company>/finance/bill-payments/ (finance files: only people with full
--     finance access, or whoever uploaded it, can open it).
--   * A payment can be saved without proof; a CASH payment without a signature or photo shows as "Not signed yet"
--     until the proof is added (add_bill_payment_proof).
--   * Once a payment is signed, the signature and name can't be changed, and a proof photo can't be swapped.
--   * pay_bill() takes the proof in the same step. undo_bill_payment(): a signed payment can only be undone by a
--     director or admin.
-- Runs as the signed-in user (normal company access rules apply). Safe to run twice.
-- =====================================================================

alter table public.supplier_payments add column if not exists received_by_name text;
alter table public.supplier_payments add column if not exists signature_data text;
alter table public.supplier_payments add column if not exists signed_at timestamptz;
alter table public.supplier_payments add column if not exists proof_path text;

-- Checks the proof and keeps a signed receipt as it was signed.
create or replace function public._supplier_payment_proof_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if old.signed_at is not null and (new.signature_data is distinct from old.signature_data
         or new.received_by_name is distinct from old.received_by_name or new.signed_at is distinct from old.signed_at) then
      raise exception 'This payment is already signed. A signed receipt can''t be changed.';
    end if;
    if old.proof_path is not null and new.proof_path is distinct from old.proof_path then
      raise exception 'This payment already has a proof photo. It can''t be swapped.';
    end if;
  end if;

  if new.signature_data is not null and (tg_op = 'INSERT' or old.signature_data is null) then
    if new.signature_data !~ '^data:image/png;base64,' or length(new.signature_data) > 400000 then
      raise exception 'The signature was not saved properly. Please sign again.';
    end if;
    if trim(coalesce(new.received_by_name, '')) = '' then raise exception 'Type the name of the person who signed.'; end if;
    new.received_by_name := left(trim(new.received_by_name), 120);
    new.signed_at := now();
  end if;
  if new.signature_data is null and (tg_op = 'INSERT' or old.signed_at is null) then
    new.signed_at := null;
  end if;
  if new.proof_path is not null and (tg_op = 'INSERT' or old.proof_path is null)
     and new.proof_path not like new.company_id::text || '/finance/bill-payments/%' then
    raise exception 'The proof photo is not in the right place. Please add it again.';
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_payment_proof_guard on public.supplier_payments;
create trigger supplier_payment_proof_guard
  before insert or update on public.supplier_payments
  for each row execute function public._supplier_payment_proof_guard();

-- pay_bill: same as 20260976, plus the proof in the same step.
drop function if exists public.pay_bill(uuid, numeric, date, uuid, text, text, boolean);
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
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can pay bills.'; end if;
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

-- Add the proof later (the contractor signs when he is next on site, or a photo of the signed paper receipt).
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
  if v_role not in ('director', 'admin', 'office_user', 'supervisor') then
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

-- Undo: a signed payment (proof that money was handed over) only by a director or admin.
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
  if v_role not in ('director', 'admin', 'office_user') then raise exception 'Only a director, admin or office user can undo a bill payment.'; end if;
  select * into p from public.supplier_payments where id = p_id and company_id = v_company;
  if p.id is null then raise exception 'Payment not found.'; end if;
  if (p.signed_at is not null or p.proof_path is not null) and v_role not in ('director', 'admin') then
    raise exception 'This payment has proof (signed or a photo). Only a director or admin can undo it.';
  end if;
  delete from public.supplier_payments where id = p_id;
end;
$$;

grant execute on function public.pay_bill(uuid, numeric, date, uuid, text, text, boolean, text, text, text) to authenticated;
grant execute on function public.add_bill_payment_proof(uuid, text, text, text) to authenticated;
grant execute on function public.undo_bill_payment(uuid) to authenticated;
