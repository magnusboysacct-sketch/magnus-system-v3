create or replace view public.v_supplier_performance as
select
  s.id as supplier_id,
  s.company_id,
  s.supplier_name,
  count(sr.id) as rating_count,
  coalesce(avg(sr.rating)::numeric(10,2), 0::numeric(10,2)) as average_rating,
  max(sr.created_at) as last_rating_at
from public.suppliers s
left join public.supplier_ratings sr
  on sr.supplier_id = s.id
 and sr.company_id = s.company_id
group by
  s.id,
  s.company_id,
  s.supplier_name;