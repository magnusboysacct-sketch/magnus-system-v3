-- =====================================================================
-- Banking Step 3c - apply an advance to an invoice, in full or in part
-- Magnus Boy's System
--
-- The standard construction way: an advance (e.g. mobilisation money) is recovered against invoices, often a part
-- of it on each progress invoice, until it is used up.
--
--   * apply_advance(advance, invoice, amount, date): moves AMOUNT of an unapplied advance onto an invoice.
--       - a new payment row on the invoice for that amount (same bank / date / method as the advance - the money
--         came in that day), marked applied_from_payment_id = the advance, applied_on = the date you applied it;
--       - the advance's own amount goes down by the same amount (what is left stays unapplied).
--     In the books (through the payment rule, 20260973): Client Advances goes down, the client's receivable goes
--     down, the bank does not change. Totals of money received never double count.
--   * Checks: same company and same client; the invoice is issued (not draft / cancelled), for the advance's project
--     (or has no project), and is never paid above what is owed; the amount is not more than is left on the advance.
--   * Deleting an applied part from the invoice gives the amount BACK to the advance (it never leaves the books).
-- Runs as the signed-in user (normal company access rules apply).
-- Safe to run twice.
-- =====================================================================

alter table public.client_payments add column if not exists applied_from_payment_id uuid references public.client_payments(id) on delete set null;
alter table public.client_payments add column if not exists applied_on date;

create or replace function public.apply_advance(p_advance uuid, p_invoice uuid, p_amount numeric, p_date date default null)
returns jsonb
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_company uuid := (select company_id from public.user_profiles where id = auth.uid());
  a public.client_payments%rowtype;
  i public.client_invoices%rowtype;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_paid numeric;
  v_owed numeric;
  v_id uuid;
begin
  if v_company is null then raise exception 'Sign in to your company first.'; end if;
  select * into a from public.client_payments where id = p_advance for update;
  if a.id is null or a.company_id <> v_company then raise exception 'Advance not found.'; end if;
  if a.invoice_id is not null or a.project_id is null then raise exception 'That payment is not an unapplied advance.'; end if;
  select * into i from public.client_invoices where id = p_invoice for update;
  if i.id is null or i.company_id <> v_company then raise exception 'Invoice not found.'; end if;
  if i.status in ('draft', 'cancelled') then raise exception 'Invoice % is %; issue it first.', i.invoice_number, i.status; end if;
  if a.client_id is not null and i.client_id is not null and a.client_id <> i.client_id then
    raise exception 'This advance is from a different client than invoice %.', i.invoice_number;
  end if;
  if i.project_id is not null and i.project_id <> a.project_id then
    raise exception 'This advance is for another project than invoice %.', i.invoice_number;
  end if;
  if v_amount <= 0 then raise exception 'Type an amount above zero.'; end if;
  if v_amount > round(a.amount, 2) then
    raise exception 'Only % is left on this advance.', to_char(a.amount, 'FM999,999,999,990.00');
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.client_payments where invoice_id = i.id;
  v_owed := round(coalesce(i.total_amount, 0) - v_paid, 2);
  if v_amount > v_owed then
    raise exception 'Only % is still owed on invoice %.', to_char(greatest(v_owed, 0), 'FM999,999,999,990.00'), i.invoice_number;
  end if;

  insert into public.client_payments (company_id, client_id, invoice_id, project_id, payment_number, payment_date, amount,
                                      payment_method, reference_number, notes, deposit_account_id,
                                      applied_from_payment_id, applied_on, created_by)
  values (v_company, coalesce(a.client_id, i.client_id), i.id, a.project_id,
          left('APPLY-' || coalesce(nullif(a.payment_number, ''), 'ADV') || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS'), 100),
          a.payment_date, v_amount, a.payment_method, a.reference_number,
          'Applied from advance ' || coalesce(a.payment_number, '') || ' on ' || to_char(coalesce(p_date, current_date), 'DD Mon YYYY'),
          a.deposit_account_id, a.id, coalesce(p_date, current_date), auth.uid())
  returning id into v_id;

  update public.client_payments set amount = round(amount - v_amount, 2) where id = a.id;

  return jsonb_build_object('payment_id', v_id, 'left_on_advance', round(a.amount - v_amount, 2));
end;
$$;

-- Deleting an applied part gives the amount back to its advance.
create or replace function public._restore_applied_advance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.applied_from_payment_id is not null then
    update public.client_payments set amount = round(amount + old.amount, 2)
     where id = old.applied_from_payment_id and invoice_id is null;
  end if;
  return old;
end;
$$;

drop trigger if exists restore_applied_advance on public.client_payments;
create trigger restore_applied_advance
  after delete on public.client_payments
  for each row execute function public._restore_applied_advance();

revoke all on function public.apply_advance(uuid, uuid, numeric, date) from public, anon;
grant execute on function public.apply_advance(uuid, uuid, numeric, date) to authenticated;
