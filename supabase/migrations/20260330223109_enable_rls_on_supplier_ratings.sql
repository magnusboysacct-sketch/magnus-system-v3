alter table public.supplier_ratings enable row level security;

create policy supplier_ratings_select_same_company
on public.supplier_ratings
for select
to authenticated
using (
  company_id in (
    select up.company_id
    from public.user_profiles up
    where up.id = auth.uid()
  )
);

create policy supplier_ratings_insert_same_company
on public.supplier_ratings
for insert
to authenticated
with check (
  company_id in (
    select up.company_id
    from public.user_profiles up
    where up.id = auth.uid()
  )
);

create policy supplier_ratings_update_same_company
on public.supplier_ratings
for update
to authenticated
using (
  company_id in (
    select up.company_id
    from public.user_profiles up
    where up.id = auth.uid()
  )
)
with check (
  company_id in (
    select up.company_id
    from public.user_profiles up
    where up.id = auth.uid()
  )
);

create policy supplier_ratings_delete_same_company
on public.supplier_ratings
for delete
to authenticated
using (
  company_id in (
    select up.company_id
    from public.user_profiles up
    where up.id = auth.uid()
  )
);