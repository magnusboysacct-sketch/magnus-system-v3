-- Drop the unused default Chart of Accounts seed function (not yet run; this file version-controls it).
--
-- seed_default_chart_of_accounts(company_id), created in 20260329190002_seed_default_chart_of_accounts.sql, is never called anywhere:
-- not by the app, any script, any edge function or any other migration. It also builds a flawed chart (level is never set, the
-- utilities accounts 6810-6830 are parented under Vehicle Expenses, and the operating bank accounts are flagged owner-private), so
-- anyone calling it by hand would get a worse chart than the one new companies now receive from copy_chart_of_accounts_template().
-- Safe to run twice (IF EXISTS), and nothing depends on it.
DROP FUNCTION IF EXISTS public.seed_default_chart_of_accounts(uuid);
