-- =====================================================================
-- Magnus HQ - Step 2c: migration_conflicts had Row Level Security OFF
--
-- Old migration bookkeeping. Nothing in the app, API or edge functions uses it.
-- RLS on with no policies = only the database owner / service key can touch it.
-- Safe to run twice.
-- =====================================================================
do $$
begin
  if to_regclass('public.migration_conflicts') is not null then
    execute 'alter table public.migration_conflicts enable row level security';
    execute 'revoke all on public.migration_conflicts from anon, authenticated';
  end if;
end;
$$;
