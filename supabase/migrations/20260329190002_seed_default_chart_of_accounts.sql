/*
  Phase 1: Accounting Foundation - Default Chart of Accounts Seeding
  
  Creates a standard construction industry Chart of Accounts for new companies.
  This provides a solid foundation for construction financial management.
  
  This migration should be run after the chart_of_accounts table is created.
  It will only insert accounts if they don't already exist for a company.
*/

-- =====================================================
-- FUNCTION TO SEED DEFAULT CHART OF ACCOUNTS
-- =====================================================

CREATE OR REPLACE FUNCTION seed_default_chart_of_accounts(p_company_id uuid)
RETURNS void AS $$
DECLARE
  account_count integer;
BEGIN
  -- Check if company already has accounts
  SELECT COUNT(*) INTO account_count
  FROM chart_of_accounts 
  WHERE company_id = p_company_id;
  
  -- Only seed if no accounts exist
  IF account_count = 0 THEN
    -- ASSETS (1000-1999)
    -- Current Assets (1000-1499)
    INSERT INTO chart_of_accounts (company_id, code, name, type, subtype, opening_balance, created_by) VALUES
    (p_company_id, '1000', 'Cash and Cash Equivalents', 'asset', 'current_asset', 0, null),
    (p_company_id, '1010', 'Operating Bank Account', 'asset', 'bank', 0, null),
    (p_company_id, '1020', 'Payroll Bank Account', 'asset', 'bank', 0, null),
    (p_company_id, '1030', 'Reserve Bank Account', 'asset', 'bank', 0, null),
    (p_company_id, '1100', 'Accounts Receivable', 'asset', 'accounts_receivable', 0, null),
    (p_company_id, '1110', 'Client Retainage Receivable', 'asset', 'accounts_receivable', 0, null),
    (p_company_id, '1120', 'Other Receivables', 'asset', 'accounts_receivable', 0, null),
    (p_company_id, '1200', 'Inventory', 'asset', 'inventory', 0, null),
    (p_company_id, '1210', 'Materials Inventory', 'asset', 'inventory', 0, null),
    (p_company_id, '1220', 'Supplies Inventory', 'asset', 'inventory', 0, null),
    (p_company_id, '1300', 'Prepaid Expenses', 'asset', 'prepaid_expense', 0, null),
    (p_company_id, '1310', 'Prepaid Insurance', 'asset', 'prepaid_expense', 0, null),
    (p_company_id, '1320', 'Prepaid Rent', 'asset', 'prepaid_expense', 0, null),
    
    -- Fixed Assets (1500-1999)
    (p_company_id, '1500', 'Fixed Assets', 'asset', 'fixed_asset', 0, null),
    (p_company_id, '1510', 'Land', 'asset', 'fixed_asset', 0, null),
    (p_company_id, '1520', 'Buildings', 'asset', 'fixed_asset', 0, null),
    (p_company_id, '1530', 'Construction Equipment', 'asset', 'fixed_asset', 0, null),
    (p_company_id, '1540', 'Vehicles', 'asset', 'fixed_asset', 0, null),
    (p_company_id, '1550', 'Tools and Equipment', 'asset', 'fixed_asset', 0, null),
    (p_company_id, '1590', 'Accumulated Depreciation', 'asset', 'fixed_asset', 0, null),
    
    -- LIABILITIES (2000-2999)
    -- Current Liabilities (2000-2499)
    (p_company_id, '2000', 'Current Liabilities', 'liability', 'current_liability', 0, null),
    (p_company_id, '2100', 'Accounts Payable', 'liability', 'accounts_payable', 0, null),
    (p_company_id, '2110', 'Supplier Payables', 'liability', 'accounts_payable', 0, null),
    (p_company_id, '2120', 'Subcontractor Payables', 'liability', 'accounts_payable', 0, null),
    (p_company_id, '2130', 'Employee Payroll Payable', 'liability', 'accounts_payable', 0, null),
    (p_company_id, '2140', 'Tax Payables', 'liability', 'accounts_payable', 0, null),
    (p_company_id, '2150', 'Client Retainage Payable', 'liability', 'accounts_payable', 0, null),
    (p_company_id, '2200', 'Accrued Expenses', 'liability', 'accrued_expense', 0, null),
    (p_company_id, '2210', 'Accrued Payroll', 'liability', 'accrued_expense', 0, null),
    (p_company_id, '2220', 'Accrued Interest', 'liability', 'accrued_expense', 0, null),
    (p_company_id, '2300', 'Deferred Revenue', 'liability', 'deferred_revenue', 0, null),
    (p_company_id, '2310', 'Unearned Billings', 'liability', 'deferred_revenue', 0, null),
    (p_company_id, '2400', 'Credit Cards Payable', 'liability', 'current_liability', 0, null),
    (p_company_id, '2410', 'Lines of Credit', 'liability', 'current_liability', 0, null),
    
    -- Long-term Liabilities (2500-2999)
    (p_company_id, '2500', 'Long-term Liabilities', 'liability', 'long_term_liability', 0, null),
    (p_company_id, '2510', 'Bank Loans', 'liability', 'long_term_liability', 0, null),
    (p_company_id, '2520', 'Equipment Loans', 'liability', 'long_term_liability', 0, null),
    (p_company_id, '2530', 'Vehicle Loans', 'liability', 'long_term_liability', 0, null),
    
    -- EQUITY (3000-3999)
    (p_company_id, '3000', 'Owner Equity', 'equity', 'owner_equity', 0, null),
    (p_company_id, '3100', 'Owner Capital', 'equity', 'owner_equity', 0, null),
    (p_company_id, '3110', 'Owner Draws', 'equity', 'owner_equity', 0, null),
    (p_company_id, '3200', 'Retained Earnings', 'equity', 'retained_earnings', 0, null),
    (p_company_id, '3300', 'Common Stock', 'equity', 'common_stock', 0, null),
    (p_company_id, '3400', 'Additional Paid-in Capital', 'equity', 'additional_paid_in_capital', 0, null),
    
    -- REVENUE (4000-4999)
    (p_company_id, '4000', 'Revenue', 'revenue', 'service_revenue', 0, null),
    (p_company_id, '4100', 'Construction Revenue', 'revenue', 'service_revenue', 0, null),
    (p_company_id, '4110', 'Residential Construction', 'revenue', 'service_revenue', 0, null),
    (p_company_id, '4120', 'Commercial Construction', 'revenue', 'service_revenue', 0, null),
    (p_company_id, '4130', 'Industrial Construction', 'revenue', 'service_revenue', 0, null),
    (p_company_id, '4200', 'Change Orders', 'revenue', 'service_revenue', 0, null),
    (p_company_id, '4300', 'Materials Revenue', 'revenue', 'product_revenue', 0, null),
    (p_company_id, '4400', 'Equipment Rental Revenue', 'revenue', 'service_revenue', 0, null),
    (p_company_id, '4500', 'Other Revenue', 'revenue', 'other_revenue', 0, null),
    (p_company_id, '4510', 'Late Fees', 'revenue', 'other_revenue', 0, null),
    (p_company_id, '4520', 'Interest Income', 'revenue', 'other_revenue', 0, null),
    
    -- COST OF GOODS SOLD (5000-5999)
    (p_company_id, '5000', 'Cost of Goods Sold', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5100', 'Materials Cost', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5110', 'Direct Materials', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5120', 'Subcontractor Costs', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5200', 'Direct Labor Cost', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5300', 'Equipment Costs', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5310', 'Equipment Depreciation', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5400', 'Other Direct Costs', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5410', 'Permits and Fees', 'expense', 'cost_of_goods_sold', 0, null),
    (p_company_id, '5420', 'Insurance - Project', 'expense', 'cost_of_goods_sold', 0, null),
    
    -- OPERATING EXPENSES (6000-6999)
    (p_company_id, '6000', 'Operating Expenses', 'expense', 'operating_expense', 0, null),
    (p_company_id, '6100', 'Payroll Expenses', 'expense', 'payroll_expense', 0, null),
    (p_company_id, '6110', 'Salaries - Office', 'expense', 'payroll_expense', 0, null),
    (p_company_id, '6120', 'Salaries - Field', 'expense', 'payroll_expense', 0, null),
    (p_company_id, '6130', 'Payroll Taxes', 'expense', 'payroll_expense', 0, null),
    (p_company_id, '6140', 'Employee Benefits', 'expense', 'payroll_expense', 0, null),
    (p_company_id, '6200', 'Office Expenses', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6210', 'Office Rent', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6220', 'Office Utilities', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6230', 'Office Supplies', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6240', 'Telephone', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6250', 'Internet', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6300', 'Professional Services', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6310', 'Legal Fees', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6320', 'Accounting Fees', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6330', 'Consulting Fees', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6400', 'Insurance Expenses', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6410', 'General Liability Insurance', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6420', 'Workers Compensation', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6430', 'Vehicle Insurance', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6500', 'Marketing Expenses', 'expense', 'selling_expense', 0, null),
    (p_company_id, '6510', 'Advertising', 'expense', 'selling_expense', 0, null),
    (p_company_id, '6520', 'Website', 'expense', 'selling_expense', 0, null),
    (p_company_id, '6600', 'Travel Expenses', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6610', 'Travel - Local', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6620', 'Travel - Out of Town', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6700', 'Vehicle Expenses', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6710', 'Fuel', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6720', 'Maintenance', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6730', 'Repairs', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6800', 'Utilities', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6810', 'Electricity', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6820', 'Water', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6830', 'Gas', 'expense', 'administrative_expense', 0, null),
    (p_company_id, '6900', 'Other Operating Expenses', 'expense', 'other_expense', 0, null),
    (p_company_id, '6910', 'Bank Fees', 'expense', 'other_expense', 0, null),
    (p_company_id, '6920', 'Credit Card Fees', 'expense', 'other_expense', 0, null),
    (p_company_id, '6930', 'Software Subscriptions', 'expense', 'other_expense', 0, null),
    (p_company_id, '6940', 'Dues and Subscriptions', 'expense', 'other_expense', 0, null),
    
    -- Set project-linkable accounts
    UPDATE chart_of_accounts 
    SET is_project_linkable = true 
    WHERE company_id = p_company_id 
    AND code IN (
      '4100', '4110', '4120', '4130', '4200', -- Revenue accounts
      '5100', '5110', '5120', '5200', '5300', '5310', '5400', '5410', '5420' -- COGS accounts
    );
    
    -- Set owner private accounts
    UPDATE chart_of_accounts 
    SET is_owner_private = true 
    WHERE company_id = p_company_id 
    AND code IN (
      '3110' -- Owner Draws
    );
    
    -- Set parent relationships
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '1000'
    ) WHERE company_id = p_company_id AND code IN ('1010', '1020', '1030');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '1100'
    ) WHERE company_id = p_company_id AND code IN ('1110', '1120');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '1200'
    ) WHERE company_id = p_company_id AND code IN ('1210', '1220');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '1300'
    ) WHERE company_id = p_company_id AND code IN ('1310', '1320');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '1500'
    ) WHERE company_id = p_company_id AND code IN ('1510', '1520', '1530', '1540', '1550');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '2100'
    ) WHERE company_id = p_company_id AND code IN ('2110', '2120', '2130', '2140', '2150');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '2200'
    ) WHERE company_id = p_company_id AND code IN ('2210', '2220');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '4100'
    ) WHERE company_id = p_company_id AND code IN ('4110', '4120', '4130');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '5100'
    ) WHERE company_id = p_company_id AND code IN ('5110', '5120');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '5300'
    ) WHERE company_id = p_company_id AND code IN ('5310');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '6100'
    ) WHERE company_id = p_company_id AND code IN ('6110', '6120', '6130', '6140');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '6200'
    ) WHERE company_id = p_company_id AND code IN ('6210', '6220', '6230', '6240', '6250');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '6300'
    ) WHERE company_id = p_company_id AND code IN ('6310', '6320', '6330');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '6400'
    ) WHERE company_id = p_company_id AND code IN ('6410', '6420', '6430');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '6600'
    ) WHERE company_id = p_company_id AND code IN ('6610', '6620');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '6700'
    ) WHERE company_id = p_company_id AND code IN ('6710', '6720', '6730');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '6800'
    ) WHERE company_id = p_company_id AND code IN ('6810', '6820', '6830');
    
    UPDATE chart_of_accounts SET parent_id = (
      SELECT id FROM chart_of_accounts 
      WHERE company_id = p_company_id AND code = '6900'
    ) WHERE company_id = p_company_id AND code IN ('6910', '6920', '6930', '6940');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENT: HOW TO USE THIS FUNCTION
-- =====================================================

/*
  To seed default accounts for a company, run:
  
  SELECT seed_default_chart_of_accounts('your-company-id');
  
  This function:
  1. Checks if the company already has accounts
  2. If no accounts exist, creates a comprehensive construction COA
  3. Sets up proper parent-child relationships
  4. Marks project-linkable and owner private accounts
  5. Uses standard construction account numbering (1000-6999)
  
  The chart includes:
  - Assets (1000-1999): Cash, receivables, inventory, fixed assets
  - Liabilities (2000-2999): Payables, accrued expenses, long-term debt
  - Equity (3000-3999): Owner equity, retained earnings
  - Revenue (4000-4999): Construction revenue, change orders
  - COGS (5000-5999): Materials, labor, equipment, other direct costs
  - Operating Expenses (6000-6999): Payroll, office, professional services, etc.
*/
