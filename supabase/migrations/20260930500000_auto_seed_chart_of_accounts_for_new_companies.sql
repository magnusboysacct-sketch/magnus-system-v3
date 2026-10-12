-- Applied directly to the live database on 2026-10-11; this file version-controls it.
-- Default Chart of Accounts for every new company.
--
-- Today a brand-new company starts with an empty chart of accounts. This migration follows the rate-library pattern
-- (20260926000000_auto_seed_rate_library_for_new_companies.sql):
--   1. creates a SECOND system company, "Chart of Accounts Template (System)", that no user belongs to, used purely as the template
--      holder (kept separate from the rate-library template so each template has a clear name and its own lifecycle);
--   2. puts a curated 111-account construction chart into it (codes 1000-6999; Jamaican statutory payables 2310-2360; parents resolved by
--      code, level set on every row, no account flagged owner-private);
--   3. adds copy_chart_of_accounts_template(company_id), which copies the template into any company that has NO accounts yet,
--      giving the copy new ids and re-pointing every parent_id at the new company's own rows;
--   4. adds an AFTER INSERT trigger on companies that calls it, so every new company gets its own editable chart - whether it is
--      created by handle_new_user or by a raw SQL insert. The trigger swallows every error (logging a WARNING), so signup is never blocked.
-- Existing companies are not touched: a company that already has any account is skipped, and nothing is backfilled.
-- The old seed_default_chart_of_accounts(uuid) from 20260329190002 is left alone (it is never called anywhere).
--
-- Safe to run twice: the system company insert and the template insert are each skipped when already done.
BEGIN;

-- ------------------------------------------------------------------------------------------------------------------
-- 1. The template company's id (fixed, so the trigger and the copy function can recognise it).
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chart_of_accounts_template_company_id()
RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$ SELECT '00000000-0000-4000-8000-00000000a111'::uuid $$;

-- ------------------------------------------------------------------------------------------------------------------
-- 2. One-time: create the system company and fill it with the template chart.
--    Inserting a company would normally fire the rate-library trigger and copy 617 rate items into it, so that trigger is
--    switched off for just this insert (and switched back on right after, in the same transaction).
-- ------------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_tpl uuid := public.chart_of_accounts_template_company_id();
  v_rate_trigger_on boolean;
  v_inserted integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_tpl) THEN
    v_rate_trigger_on := EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.companies'::regclass AND tgname = 'seed_rate_library_on_company_insert' AND tgenabled = 'O'
    );
    IF v_rate_trigger_on THEN
      ALTER TABLE public.companies DISABLE TRIGGER seed_rate_library_on_company_insert;
    END IF;
    INSERT INTO public.companies (id, name) VALUES (v_tpl, '— Chart of Accounts Template (System) —');
    IF v_rate_trigger_on THEN
      ALTER TABLE public.companies ENABLE TRIGGER seed_rate_library_on_company_insert;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE company_id = v_tpl) THEN
    RAISE NOTICE 'Template chart already seeded - skipping the one-time insert.';
    RETURN;
  END IF;

  WITH RECURSIVE
  t(code, name, type, subtype, parent_code, linkable) AS (
    VALUES
        ('1000', 'Cash and Cash Equivalents', 'asset', 'current_asset', NULL, false),
        ('1010', 'Operating Bank Account', 'asset', 'bank', '1000', false),
        ('1020', 'Payroll Bank Account', 'asset', 'bank', '1000', false),
        ('1030', 'Savings Account', 'asset', 'bank', '1000', false),
        ('1040', 'Petty Cash', 'asset', 'current_asset', '1000', false),
        ('1050', 'Undeposited Funds', 'asset', 'current_asset', '1000', false),
        ('1100', 'Accounts Receivable', 'asset', 'accounts_receivable', NULL, false),
        ('1110', 'Client Retainage Receivable', 'asset', 'accounts_receivable', '1100', false),
        ('1120', 'Other Receivables', 'asset', 'accounts_receivable', '1100', false),
        ('1140', 'GCT Input Credit', 'asset', 'current_asset', NULL, false),
        ('1200', 'Inventory', 'asset', 'inventory', NULL, false),
        ('1210', 'Materials Inventory', 'asset', 'inventory', '1200', false),
        ('1220', 'Supplies Inventory', 'asset', 'inventory', '1200', false),
        ('1300', 'Prepaid Expenses', 'asset', 'prepaid_expense', NULL, false),
        ('1310', 'Prepaid Insurance', 'asset', 'prepaid_expense', '1300', false),
        ('1320', 'Prepaid Rent', 'asset', 'prepaid_expense', '1300', false),
        ('1400', 'Unbilled Work in Progress', 'asset', 'current_asset', NULL, false),
        ('1500', 'Fixed Assets', 'asset', 'fixed_asset', NULL, false),
        ('1510', 'Land', 'asset', 'fixed_asset', '1500', false),
        ('1520', 'Buildings', 'asset', 'fixed_asset', '1500', false),
        ('1530', 'Construction Equipment', 'asset', 'fixed_asset', '1500', false),
        ('1540', 'Vehicles', 'asset', 'fixed_asset', '1500', false),
        ('1550', 'Tools and Equipment', 'asset', 'fixed_asset', '1500', false),
        ('1560', 'Office Furniture and Equipment', 'asset', 'fixed_asset', '1500', false),
        ('1590', 'Accumulated Depreciation', 'asset', 'fixed_asset', '1500', false),
        ('2100', 'Accounts Payable', 'liability', 'accounts_payable', NULL, false),
        ('2110', 'Supplier Payables', 'liability', 'accounts_payable', '2100', false),
        ('2120', 'Subcontractor Payables', 'liability', 'accounts_payable', '2100', false),
        ('2130', 'Subcontractor Retention Payable', 'liability', 'accounts_payable', '2100', false),
        ('2200', 'Accrued Expenses', 'liability', 'accrued_expense', NULL, false),
        ('2210', 'Accrued Payroll', 'liability', 'accrued_expense', '2200', false),
        ('2220', 'Accrued Interest', 'liability', 'accrued_expense', '2200', false),
        ('2300', 'Statutory Payables', 'liability', 'current_liability', NULL, false),
        ('2310', 'GCT Payable', 'liability', 'current_liability', '2300', false),
        ('2320', 'PAYE Payable', 'liability', 'current_liability', '2300', false),
        ('2330', 'NIS Payable', 'liability', 'current_liability', '2300', false),
        ('2340', 'NHT Payable', 'liability', 'current_liability', '2300', false),
        ('2350', 'Education Tax Payable', 'liability', 'current_liability', '2300', false),
        ('2360', 'HEART/NTA Payable', 'liability', 'current_liability', '2300', false),
        ('2400', 'Client Advances and Deposits', 'liability', 'deferred_revenue', NULL, false),
        ('2500', 'Credit Cards and Lines of Credit', 'liability', 'current_liability', NULL, false),
        ('2510', 'Credit Card Payable', 'liability', 'current_liability', '2500', false),
        ('2520', 'Line of Credit', 'liability', 'current_liability', '2500', false),
        ('2600', 'Long-term Liabilities', 'liability', 'long_term_liability', NULL, false),
        ('2610', 'Bank Loans', 'liability', 'long_term_liability', '2600', false),
        ('2620', 'Equipment Loans', 'liability', 'long_term_liability', '2600', false),
        ('2630', 'Vehicle Loans', 'liability', 'long_term_liability', '2600', false),
        ('3000', 'Owner Equity', 'equity', 'owner_equity', NULL, false),
        ('3100', 'Owner Capital', 'equity', 'owner_equity', '3000', false),
        ('3110', 'Owner Draws', 'equity', 'owner_equity', '3000', false),
        ('3200', 'Retained Earnings', 'equity', 'retained_earnings', NULL, false),
        ('3300', 'Common Stock', 'equity', 'common_stock', NULL, false),
        ('3400', 'Additional Paid-in Capital', 'equity', 'additional_paid_in_capital', NULL, false),
        ('4000', 'Revenue', 'revenue', 'service_revenue', NULL, false),
        ('4100', 'Construction Revenue', 'revenue', 'service_revenue', '4000', true),
        ('4110', 'Residential Construction', 'revenue', 'service_revenue', '4100', true),
        ('4120', 'Commercial Construction', 'revenue', 'service_revenue', '4100', true),
        ('4130', 'Government and Community Projects', 'revenue', 'service_revenue', '4100', true),
        ('4200', 'Change Orders and Variations', 'revenue', 'service_revenue', '4000', true),
        ('4300', 'Materials Sales', 'revenue', 'product_revenue', '4000', false),
        ('4400', 'Equipment Rental Revenue', 'revenue', 'service_revenue', '4000', false),
        ('4500', 'Other Revenue', 'revenue', 'other_revenue', '4000', false),
        ('4510', 'Interest Income', 'revenue', 'other_revenue', '4500', false),
        ('4520', 'Late Fees', 'revenue', 'other_revenue', '4500', false),
        ('5000', 'Cost of Construction', 'expense', 'cost_of_goods_sold', NULL, false),
        ('5100', 'Materials Cost', 'expense', 'cost_of_goods_sold', '5000', true),
        ('5110', 'Direct Materials', 'expense', 'cost_of_goods_sold', '5100', true),
        ('5120', 'Subcontractor Costs', 'expense', 'cost_of_goods_sold', '5000', true),
        ('5200', 'Direct Labour Cost', 'expense', 'cost_of_goods_sold', '5000', true),
        ('5300', 'Equipment Costs', 'expense', 'cost_of_goods_sold', '5000', true),
        ('5310', 'Equipment Hire', 'expense', 'cost_of_goods_sold', '5300', true),
        ('5400', 'Other Direct Costs', 'expense', 'cost_of_goods_sold', '5000', true),
        ('5410', 'Permits and Fees', 'expense', 'cost_of_goods_sold', '5400', true),
        ('5420', 'Project Insurance', 'expense', 'cost_of_goods_sold', '5400', true),
        ('6000', 'Operating Expenses', 'expense', 'operating_expense', NULL, false),
        ('6100', 'Payroll Expenses', 'expense', 'payroll_expense', '6000', false),
        ('6110', 'Salaries - Office', 'expense', 'payroll_expense', '6100', false),
        ('6120', 'Salaries - Field', 'expense', 'payroll_expense', '6100', false),
        ('6130', 'Employer Payroll Contributions', 'expense', 'payroll_expense', '6100', false),
        ('6140', 'Employee Benefits', 'expense', 'payroll_expense', '6100', false),
        ('6200', 'Office Expenses', 'expense', 'administrative_expense', '6000', false),
        ('6210', 'Office Rent', 'expense', 'administrative_expense', '6200', false),
        ('6220', 'Office Utilities', 'expense', 'administrative_expense', '6200', false),
        ('6230', 'Office Supplies', 'expense', 'administrative_expense', '6200', false),
        ('6240', 'Telephone', 'expense', 'administrative_expense', '6200', false),
        ('6250', 'Internet', 'expense', 'administrative_expense', '6200', false),
        ('6300', 'Professional Services', 'expense', 'administrative_expense', '6000', false),
        ('6310', 'Legal Fees', 'expense', 'administrative_expense', '6300', false),
        ('6320', 'Accounting Fees', 'expense', 'administrative_expense', '6300', false),
        ('6330', 'Consulting Fees', 'expense', 'administrative_expense', '6300', false),
        ('6400', 'Insurance Expenses', 'expense', 'administrative_expense', '6000', false),
        ('6410', 'General Liability Insurance', 'expense', 'administrative_expense', '6400', false),
        ('6420', 'Workers Compensation', 'expense', 'administrative_expense', '6400', false),
        ('6430', 'Vehicle Insurance', 'expense', 'administrative_expense', '6400', false),
        ('6500', 'Marketing Expenses', 'expense', 'selling_expense', '6000', false),
        ('6510', 'Advertising', 'expense', 'selling_expense', '6500', false),
        ('6520', 'Website', 'expense', 'selling_expense', '6500', false),
        ('6600', 'Travel Expenses', 'expense', 'administrative_expense', '6000', false),
        ('6610', 'Travel - Local', 'expense', 'administrative_expense', '6600', false),
        ('6620', 'Travel - Out of Town', 'expense', 'administrative_expense', '6600', false),
        ('6700', 'Vehicle Expenses', 'expense', 'administrative_expense', '6000', false),
        ('6710', 'Fuel', 'expense', 'administrative_expense', '6700', false),
        ('6720', 'Maintenance', 'expense', 'administrative_expense', '6700', false),
        ('6730', 'Repairs', 'expense', 'administrative_expense', '6700', false),
        ('6900', 'Other Operating Expenses', 'expense', 'other_expense', '6000', false),
        ('6910', 'Bank Fees', 'expense', 'other_expense', '6900', false),
        ('6920', 'Credit Card Fees', 'expense', 'other_expense', '6900', false),
        ('6930', 'Software Subscriptions', 'expense', 'other_expense', '6900', false),
        ('6940', 'Dues and Subscriptions', 'expense', 'other_expense', '6900', false),
        ('6950', 'Depreciation Expense', 'expense', 'other_expense', '6900', false),
        ('6960', 'Interest Expense', 'expense', 'other_expense', '6900', false)
  ),
  v AS MATERIALIZED (SELECT gen_random_uuid() AS id, t.* FROM t),
  lv(code, level) AS (
    SELECT code, 1 FROM v WHERE parent_code IS NULL
    UNION ALL
    SELECT c.code, lv.level + 1 FROM v c JOIN lv ON c.parent_code = lv.code
  )
  INSERT INTO public.chart_of_accounts
    (id, company_id, code, name, type, subtype, is_project_linkable, is_owner_private, is_active, parent_id, level, opening_balance, current_balance)
  SELECT v.id, v_tpl, v.code, v.name, v.type, v.subtype, v.linkable, false, true, p.id, lv.level, 0, 0
  FROM v
  JOIN lv ON lv.code = v.code
  LEFT JOIN v p ON p.code = v.parent_code;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> 111 THEN
    RAISE EXCEPTION 'Template chart insert wrote % accounts, expected 111 - nothing was changed', v_inserted;
  END IF;
END;
$$;

-- ------------------------------------------------------------------------------------------------------------------
-- 3. copy_chart_of_accounts_template(target_company_id): copy the template into a company that has no accounts yet.
--    Idempotent (a company with any account is skipped - no error, no duplicates). The copy runs inside its own
--    BEGIN/EXCEPTION block, so a failure logs a WARNING, undoes only the copy, and never blocks the caller.
--    Returns the number of accounts copied (0 when skipped or on failure).
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copy_chart_of_accounts_template(target_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template uuid := public.chart_of_accounts_template_company_id();
  v_count integer;
BEGIN
  IF target_company_id IS NULL OR target_company_id = v_template THEN
    RETURN 0;
  END IF;

  BEGIN
    -- Two simultaneous calls for the same company queue up, so the "already has accounts" check below is reliable.
    PERFORM pg_advisory_xact_lock(hashtextextended('copy_chart_of_accounts_template:' || target_company_id::text, 0));

    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company_id) THEN
      RAISE WARNING 'copy_chart_of_accounts_template: company % does not exist, nothing copied', target_company_id;
      RETURN 0;
    END IF;

    IF EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE company_id = target_company_id) THEN
      RETURN 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts WHERE company_id = v_template) THEN
      RAISE WARNING 'copy_chart_of_accounts_template: the template chart is empty, nothing copied for %', target_company_id;
      RETURN 0;
    END IF;

    -- Every template row gets a new id; each parent_id is looked up through the template's own parent link, so it lands on the
    -- NEW company's copy of that parent. Balances start at 0, nothing is owner-private, every account is active.
    WITH src AS MATERIALIZED (
      SELECT t.*, gen_random_uuid() AS new_id
      FROM public.chart_of_accounts t
      WHERE t.company_id = v_template
    )
    INSERT INTO public.chart_of_accounts
      (id, company_id, code, name, type, subtype, is_project_linkable, is_owner_private, is_active, parent_id, level,
       opening_balance, current_balance, description, notes)
    SELECT s.new_id, target_company_id, s.code, s.name, s.type, s.subtype, s.is_project_linkable, false, true, p.new_id, s.level,
           0, 0, s.description, s.notes
    FROM src s
    LEFT JOIN src p ON p.id = s.parent_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'copy_chart_of_accounts_template failed for %: %', target_company_id, SQLERRM;
    RETURN 0;
  END;
END;
$$;

-- ------------------------------------------------------------------------------------------------------------------
-- 4. The trigger function and trigger. It is called while handle_new_user is still running, and handle_new_user rolls back the
--    whole sign-up if anything raises - so this wrapper swallows every error itself (logging a WARNING instead).
-- ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_copy_chart_of_accounts_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.copy_chart_of_accounts_template(NEW.id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'trg_copy_chart_of_accounts_template failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL; -- return value of an AFTER trigger is ignored
END;
$$;

-- These copy one company's chart into another, so they must never be callable through the public API. The trigger runs them as
-- the function owner; nothing else needs EXECUTE (an admin can still call copy_chart_of_accounts_template from the SQL editor,
-- e.g. to give an existing empty company the default chart).
REVOKE ALL ON FUNCTION public.copy_chart_of_accounts_template(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_copy_chart_of_accounts_template() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_chart_of_accounts_template(uuid) TO service_role;

DROP TRIGGER IF EXISTS copy_chart_of_accounts_on_company_insert ON public.companies;
CREATE TRIGGER copy_chart_of_accounts_on_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW
  WHEN (NEW.id IS DISTINCT FROM public.chart_of_accounts_template_company_id())
  EXECUTE FUNCTION public.trg_copy_chart_of_accounts_template();

COMMIT;
