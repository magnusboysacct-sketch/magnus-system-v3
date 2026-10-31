-- =====================================================================
-- Magnus HQ - Step 2b: fix the search_path on SECURITY DEFINER functions
--
-- The scan found 33 functions (all the *_unchecked helpers from 20260944) that run with owner rights
-- but take their search_path from whoever calls them. Pinning it stops a caller from slipping in
-- look-alike tables or functions. "extensions" is included so any extension functions they use still resolve.
--
-- Only functions in public with NO search_path set are touched. Their code is not changed.
-- Safe to run twice (the second run finds nothing to do).
-- =====================================================================
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.fn);
    n := n + 1;
  end loop;
  raise notice 'search_path fixed on % function(s)', n;
end;
$$;
