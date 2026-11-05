select
  (select array_agg(c) filter (where not exists (select 1 from information_schema.columns
     where table_schema='public' and table_name='field_payments' and column_name=c))
   from unnest(array['company_id','worker_ref','worker_name','worker_id_number','project_id','project_name',
     'milestone_name','task_name','payment_type','status','advance_amount','total_amount','receipt_number',
     'work_date','work_type','payment_method','created_at']) c) as missing_field_payment_cols,
  (select array_agg(c) filter (where not exists (select 1 from information_schema.columns
     where table_schema='public' and table_name='client_payments' and column_name=c))
   from unnest(array['company_id','client_id','invoice_id','project_id','payment_number','payment_date',
     'amount','payment_method','reference_number']) c) as missing_client_payment_cols,
  to_regprocedure('extensions.gen_random_bytes(integer)') is not null as has_random_bytes,
  (select count(*) from information_schema.columns where table_schema='public'
     and table_name in ('field_payments','client_payments') and is_generated='ALWAYS') as generated_cols;