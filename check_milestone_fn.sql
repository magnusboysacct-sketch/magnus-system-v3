select array_agg(c) filter (where not exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='project_tasks' and column_name=c)) as missing_columns,
  (select count(*) from pg_proc where proname='duplicate_milestone_for_bases') as fn
from unnest(array['task_description','trade_type','rate_per_unit','crew_size','production_rate_per_day',
 'planned_duration_days','actual_quantity_completed','actual_duration_days','weather_impact_factor',
 'labor_cost_per_day','equipment_cost_per_day','material_cost_total','boq_section_id','boq_item_id',
 'quantity_source_type','auto_sync_quantity','linked_assembly_id','linked_item_id','linked_assembly_name',
 'linked_item_name','created_at']) c;