-- Capture every manager-facing RPC's output (run as anon, exactly like the browser) into regress(phase,...)
CREATE TABLE IF NOT EXISTS regress (phase text, name text, out jsonb);
GRANT ALL ON regress TO anon;
SET ROLE anon;
INSERT INTO regress SELECT :'phase', 'data '||t, public.get_portal_data(t) - 'viewer' FROM unnest(ARRAY['tok-M','tok-MO','tok-X']) t;
INSERT INTO regress SELECT :'phase', 'data P'||n||' '||t, public.get_portal_data(t, ('90000000-0000-0000-0000-00000000000'||n)::uuid) - 'viewer'
  FROM unnest(ARRAY['tok-M','tok-MO']) t, generate_series(1,5) n;
INSERT INTO regress SELECT :'phase', 'comments '||t, (SELECT coalesce(jsonb_agg(to_jsonb(c) - 'contact_id' ORDER BY c.created_at, c.message), '[]') FROM public.get_portal_comments(t) c) FROM unnest(ARRAY['tok-M','tok-MO','tok-X']) t;
INSERT INTO regress SELECT :'phase', 'invoices '||t, (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'), '[]') FROM public.get_portal_invoices(t) x) FROM unnest(ARRAY['tok-M','tok-MO','tok-X']) t;
INSERT INTO regress SELECT :'phase', 'contracts '||t, (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'), '[]') FROM public.get_portal_contracts(t) x) FROM unnest(ARRAY['tok-M','tok-MO','tok-X']) t;
INSERT INTO regress SELECT :'phase', 'estimates '||t, (SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'), '[]') FROM public.get_portal_estimates(t) x) FROM unnest(ARRAY['tok-M','tok-MO','tok-X']) t;
INSERT INTO regress SELECT :'phase', 'schedule '||t||' '||n, (SELECT coalesce(jsonb_agg(x - 'id'), '[]') FROM public.get_portal_contract_schedule(t, ('f0000000-0000-0000-0000-00000000000'||n)::uuid) x)
  FROM unnest(ARRAY['tok-M','tok-MO']) t, generate_series(1,5) n;
RESET ROLE;
