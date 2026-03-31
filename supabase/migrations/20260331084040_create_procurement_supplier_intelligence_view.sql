create or replace view public.v_procurement_supplier_intelligence as
select
  pi.id as procurement_item_id,
  pi.procurement_id,
  pi.project_id,
  pi.material_name,
  pi.description,
  pi.category,
  pi.unit,
  pi.quantity,
  pi.unit_rate,
  pi.status,
  pi.priority,
  pi.needed_by_date,
  pi.supplier_id,
  coalesce(s.supplier_name, pi.supplier) as supplier_name,
  vsp.average_rating,
  vsp.rating_count,
  vsp.last_rating_at
from public.procurement_items pi
left join public.suppliers s
  on s.id = pi.supplier_id
left join public.v_supplier_performance vsp
  on vsp.supplier_id = pi.supplier_id
 and vsp.company_id = s.company_id;