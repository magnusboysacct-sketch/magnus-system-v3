-- =====================================================================
-- Receipt Inbox - Magnus Boy's System
--
-- The owner and staff just SNAP the receipt and leave it; the accountant does the rest.
--   receipt_inbox: one row per receipt dropped in. The picture is in the private-files bucket, in the monthly receipts
--   folder: <company>/receipts/<yyyy>/<mm>/inbox-<random>.<ext> (receipts are finance papers: only full finance access, and the
--   person who took it, can open it). The AI reads it (vendor, date, amount, receipt no., GCT) into ai_data.
--   The accountant turns each one into:  an expense  |  a supplier bill  |  a document in the filing cabinet  |  "not needed".
--   Once handled it leaves the inbox (status <> 'new') and the row keeps what it became, who did it and when.
-- Who:
--   Drop in: director, admin, estimator, supervisor, office user, site user, secretary of the company (staff only: never workers).
--   See the inbox and handle receipts: people with full finance access (finance_access_level = 'full').
--   The person who dropped a receipt sees their own, and may take it back while it is still new.
-- Nobody writes the table directly except to drop a receipt in; everything else goes through the functions below.
-- Safe to run twice.
-- =====================================================================

begin;

do $$ begin
  if to_regclass('public.doc_files') is null then
    raise exception 'Run the Documents file first (migration 20260993000000_filing_cabinet.sql). Nothing was changed.';
  end if;
end $$;

create table if not exists public.receipt_inbox (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null,
  file_path      text not null,
  mime_type      text,
  size_bytes     bigint,
  project_id     uuid references public.projects(id) on delete set null,
  note           text,
  dropped_by     uuid default auth.uid(),
  dropped_at     timestamptz not null default now(),
  ai_status      text not null default 'pending' check (ai_status in ('pending', 'done', 'failed')),
  ai_data        jsonb,
  status         text not null default 'new' check (status in ('new', 'expense', 'bill', 'document', 'discarded')),
  handled_by     uuid,
  handled_at     timestamptz,
  expense_id     uuid references public.expenses(id) on delete set null,
  bill_id        uuid references public.supplier_invoices(id) on delete set null,
  doc_file_id    uuid references public.doc_files(id) on delete set null,
  discard_reason text
);
create unique index if not exists receipt_inbox_path on public.receipt_inbox (file_path);
create index if not exists receipt_inbox_new on public.receipt_inbox (company_id, dropped_at desc) where status = 'new';
create index if not exists receipt_inbox_company on public.receipt_inbox (company_id, status, dropped_at desc);

-- may the signed-in user handle this company's receipts? (full finance access)
create or replace function public._receipt_inbox_handler(p_company uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.user_profiles up
                  where up.id = auth.uid() and up.company_id = p_company and coalesce(up.status, 'active') = 'active'
                    and coalesce(up.finance_access_level, 'none') = 'full')
$$;
create or replace function public._receipt_inbox_staff(p_company uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.user_profiles up
                  where up.id = auth.uid() and up.company_id = p_company and coalesce(up.status, 'active') = 'active'
                    and up.role in ('director', 'admin', 'estimator', 'supervisor', 'office_user', 'site_user', 'secretary'))
$$;
revoke all on function public._receipt_inbox_handler(uuid), public._receipt_inbox_staff(uuid) from public, anon;
grant execute on function public._receipt_inbox_handler(uuid), public._receipt_inbox_staff(uuid) to authenticated;

alter table public.receipt_inbox enable row level security;
revoke all on public.receipt_inbox from public, anon, authenticated;
grant select, insert on public.receipt_inbox to authenticated;

drop policy if exists "receipt_inbox read" on public.receipt_inbox;
create policy "receipt_inbox read" on public.receipt_inbox for select to authenticated
  using (public._receipt_inbox_handler(company_id) or (dropped_by = auth.uid() and public._receipt_inbox_staff(company_id)));
drop policy if exists "receipt_inbox drop" on public.receipt_inbox;
create policy "receipt_inbox drop" on public.receipt_inbox for insert to authenticated
  with check (public._receipt_inbox_staff(company_id) and dropped_by = auth.uid() and status = 'new' and ai_status = 'pending' and ai_data is null
              and handled_by is null and expense_id is null and bill_id is null and doc_file_id is null
              and file_path like company_id::text || '/receipts/%/inbox-%'
              and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.company_id = receipt_inbox.company_id)));

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_hq_write_guard') then
    drop trigger if exists hq_write_guard on public.receipt_inbox;
    create trigger hq_write_guard before insert or update or delete on public.receipt_inbox for each row execute function public._hq_write_guard();
  end if;
end $$;

-- What the AI read (the person who dropped it, or a handler), while the receipt is still new.
create or replace function public.receipt_inbox_set_ai(p_id uuid, p_data jsonb, p_ok boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare r record;
begin
  select id, company_id, dropped_by, status into r from public.receipt_inbox where id = p_id;
  if not found or not (public._receipt_inbox_handler(r.company_id) or r.dropped_by = auth.uid()) then raise exception 'Receipt not found.'; end if;
  if r.status <> 'new' then return; end if;
  update public.receipt_inbox set ai_status = case when p_ok then 'done' else 'failed' end, ai_data = case when p_ok then p_data else ai_data end where id = p_id;
end;
$$;

-- Handled: it became an expense / a bill / a document. The link must be this company's and carry this picture.
create or replace function public.receipt_inbox_done(p_id uuid, p_kind text, p_link uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare r record;
begin
  select * into r from public.receipt_inbox where id = p_id for update;
  if not found or not public._receipt_inbox_handler(r.company_id) then raise exception 'Only someone with full finance access can file receipts.'; end if;
  if r.status <> 'new' then raise exception 'That receipt was already filed.'; end if;
  if p_kind = 'expense' then
    if not exists (select 1 from public.expenses e where e.id = p_link and e.company_id = r.company_id and e.receipt_url = r.file_path) then
      raise exception 'That expense does not carry this receipt.';
    end if;
    update public.receipt_inbox set status = 'expense', expense_id = p_link, handled_by = auth.uid(), handled_at = now() where id = p_id;
  elsif p_kind = 'bill' then
    if not exists (select 1 from public.supplier_invoices b where b.id = p_link and b.company_id = r.company_id and b.bill_file_path = r.file_path) then
      raise exception 'That bill does not carry this receipt.';
    end if;
    update public.receipt_inbox set status = 'bill', bill_id = p_link, handled_by = auth.uid(), handled_at = now() where id = p_id;
  elsif p_kind = 'document' then
    if not exists (select 1 from public.doc_files d where d.id = p_link and d.company_id = r.company_id) then raise exception 'Document not found.'; end if;
    update public.receipt_inbox set status = 'document', doc_file_id = p_link, handled_by = auth.uid(), handled_at = now() where id = p_id;
  else
    raise exception 'Unknown kind.';
  end if;
end;
$$;

-- Not needed (a duplicate, not a receipt, a mistake). A handler, with a reason; or the person who dropped it, while it is new.
-- Returns the file path so the page can delete the picture.
create or replace function public.receipt_inbox_discard(p_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare r record;
begin
  select * into r from public.receipt_inbox where id = p_id for update;
  if not found or not (public._receipt_inbox_handler(r.company_id) or r.dropped_by = auth.uid()) then raise exception 'Receipt not found.'; end if;
  if r.status <> 'new' then raise exception 'That receipt was already filed.'; end if;
  if not public._receipt_inbox_handler(r.company_id) then
    p_reason := coalesce(nullif(btrim(p_reason), ''), 'Taken back by the person who dropped it');
  elsif nullif(btrim(p_reason), '') is null then
    raise exception 'Say why it is not needed (for example: duplicate, not a receipt).';
  end if;
  update public.receipt_inbox set status = 'discarded', discard_reason = btrim(p_reason), handled_by = auth.uid(), handled_at = now() where id = p_id;
  return r.file_path;
end;
$$;

revoke all on function public.receipt_inbox_set_ai(uuid, jsonb, boolean), public.receipt_inbox_done(uuid, text, uuid),
  public.receipt_inbox_discard(uuid, text) from public, anon;
grant execute on function public.receipt_inbox_set_ai(uuid, jsonb, boolean), public.receipt_inbox_done(uuid, text, uuid),
  public.receipt_inbox_discard(uuid, text) to authenticated;

commit;
