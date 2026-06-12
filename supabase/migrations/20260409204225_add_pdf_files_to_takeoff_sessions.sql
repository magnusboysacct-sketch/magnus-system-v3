alter table public.takeoff_sessions add column if not exists pdf_files jsonb not null default '[]'::jsonb;
