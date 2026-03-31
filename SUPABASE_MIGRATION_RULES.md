SUPABASE MIGRATION RULES

1. Only files inside supabase/migrations that must run on remote should stay there.
2. Every runnable migration file must use this exact format:
   YYYYMMDDHHMMSS_name.sql
   Example:
   20260330183000_add_project_scope.sql

3. Never keep draft, temp, zzz, test, backup, or already-applied files in supabase/migrations.
4. Put non-runnable SQL files in:
   supabase/migrations_archive/

5. Before running:
   npx supabase db push
   first check the filenames in supabase/migrations.

6. If a schema change was already applied manually in Supabase SQL Editor:
   - do NOT rename old draft files into live migrations later
   - archive them instead
   - create a proper migration only for new changes going forward
