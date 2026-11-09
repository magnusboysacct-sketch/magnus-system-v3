-- =====================================================================
-- 20261000000000_advances_carry_forward.sql
-- Advances are settled ONCE, and what a worker still owes carries forward.
--
-- Before: a final payment took off ALL of the worker's earlier advances on the project, even advances an earlier final
-- payment had already settled. Example: advance 10,000; final #1 earned 6,000 (worker owes 4,000); final #2 earned 8,000
-- took off 10,000 again (should be 4,000).
--
-- Now field_payment_advances_before walks the worker's advances and final payments in time order:
--   an advance adds to what the worker owes; a final payment takes its earned amount off (never below 0).
-- What is left is "Previous advances" on the next final payment. Same signature, same matching rules (worker, project,
-- and task / milestone when the final names one), same SECURITY INVOKER, so the form, the receipt and the public receipt
-- page all change together.
--
-- New: field_payment_final_advances(ids) gives the advances each final payment settled, for the totals in Reports,
-- Field Payments and Records (cash that really left = earned − advances settled). SECURITY INVOKER: row-level security
-- still limits it to the caller's own company.
-- Safe to run twice.
-- =====================================================================

begin;

create or replace function public.field_payment_advances_before(
  p_company_id uuid, p_worker_ref text, p_worker_name text, p_worker_id_number text,
  p_project_id uuid, p_project_name text, p_milestone_name text, p_task_name text,
  p_before timestamptz, p_exclude_id uuid default null
) returns numeric
language plpgsql stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_wkey text := coalesce(nullif(btrim(p_worker_ref), ''),
                          regexp_replace(lower(btrim(coalesce(p_worker_name, ''))), '\s+', '_', 'g') || '_' || btrim(coalesce(p_worker_id_number, '')));
  v_pkey text := coalesce(p_project_id::text, nullif(lower(btrim(coalesce(p_project_name, ''))), ''), '');
  v_mkey text := nullif(lower(btrim(coalesce(p_milestone_name, ''))), '');
  v_tkey text := nullif(lower(btrim(coalesce(p_task_name, ''))), '');
  v_owed numeric := 0;
  r record;
begin
  for r in
    select a.payment_type,
           coalesce(nullif(a.advance_amount, 0), a.total_amount, 0) as adv,
           coalesce(a.total_amount, 0) as earned
      from field_payments a
     where a.company_id = p_company_id
       and a.payment_type in ('advance', 'final')
       and a.status in ('signed', 'completed')
       and a.created_at < p_before
       and (p_exclude_id is null or a.id <> p_exclude_id)
       and coalesce(nullif(btrim(a.worker_ref), ''),
                    regexp_replace(lower(btrim(coalesce(a.worker_name, ''))), '\s+', '_', 'g') || '_' || btrim(coalesce(a.worker_id_number, ''))) = v_wkey
       and coalesce(a.project_id::text, nullif(lower(btrim(coalesce(a.project_name, ''))), ''), '') = v_pkey
       and (v_mkey is null or lower(btrim(coalesce(a.milestone_name, ''))) = v_mkey)
       and (v_tkey is null or lower(btrim(coalesce(a.task_name, ''))) = v_tkey)
     order by a.created_at, a.id
  loop
    if r.payment_type = 'advance' then
      v_owed := v_owed + r.adv;
    else
      v_owed := greatest(0, v_owed - r.earned);
    end if;
  end loop;
  return v_owed;
end;
$$;
revoke all on function public.field_payment_advances_before(uuid, text, text, text, uuid, text, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.field_payment_advances_before(uuid, text, text, text, uuid, text, text, text, timestamptz, uuid) to authenticated;

-- Advances each final payment settled (never more than it earned). Only finals the caller can see.
create or replace function public.field_payment_final_advances(p_ids uuid[])
returns table (id uuid, advances numeric)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select f.id,
         least(coalesce(f.total_amount, 0),
               public.field_payment_advances_before(f.company_id, f.worker_ref, f.worker_name, f.worker_id_number, f.project_id, f.project_name,
                                                    f.milestone_name, f.task_name, f.created_at, f.id))
    from field_payments f
   where f.id = any(p_ids) and f.payment_type = 'final';
$$;
revoke all on function public.field_payment_final_advances(uuid[]) from public, anon;
grant execute on function public.field_payment_final_advances(uuid[]) to authenticated;

commit;
