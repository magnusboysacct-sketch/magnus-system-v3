alter table public.boq_headers
add column if not exists test_flag boolean default false;