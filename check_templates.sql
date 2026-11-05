select
  to_regclass('public.milestone_templates') is not null      as templates_table,
  to_regclass('public.milestone_template_tasks') is not null as template_tasks_table,
  (select count(*) from pg_proc where proname in ('save_milestone_as_template','apply_milestone_template')) as functions;