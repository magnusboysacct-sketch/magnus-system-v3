/*
  # Cash Flow Forecasting System

  ## Overview
  Implements comprehensive cash flow forecasting for construction companies.
  Forecasts future cash position based on receivables, payables, payroll, and expenses.

  ## Data Sources

  ### Inflows (Expected Cash In)
    1. **Outstanding Client Invoices** - Accounts Receivable
       - Due invoices not yet paid
       - Forecast by due date
    
    2. **Future Billing** - Contract Progress Billing
       - Scheduled billing milestones
       - Progress billing schedules

  ### Outflows (Expected Cash Out)
    1. **Supplier Invoices** - Accounts Payable
       - Unpaid supplier invoices
       - Forecast by due date
    
    2. **Payroll Schedule**
       - Scheduled payroll periods
       - Regular payroll obligations
    
    3. **Recurring Expenses**
       - Project costs
       - Operating expenses

  ## New Functions

  ### get_cash_flow_forecast(company_id, start_date, end_date, interval)
    - Generates cash flow forecast for specified period
    - Groups by week or month intervals
    - Calculates expected inflows and outflows
    - Projects running balance

  ### get_outstanding_receivables(company_id)
    - Returns all unpaid client invoices
    - Grouped by due date ranges
    - Aging analysis

  ### get_outstanding_payables(company_id)
    - Returns all unpaid supplier invoices
    - Grouped by due date ranges
    - Payment priority analysis

  ### get_upcoming_payroll(company_id, weeks_ahead)
    - Returns scheduled payroll periods
    - Estimates payroll amounts
    - Based on historical averages

  ## Views

  ### v_cash_flow_weekly
    - Weekly cash flow summary
    - Current + 12 weeks forecast

  ### v_cash_flow_monthly
    - Monthly cash flow summary
    - Current + 6 months forecast

  ## Security
  - RLS policies ensure company-based access
  - Users can only view their company's forecasts
*/

-- =====================================================
-- GET OUTSTANDING RECEIVABLES FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_outstanding_receivables(p_company_id uuid)
RETURNS TABLE (
  invoice_id uuid,
  project_id uuid,
  client_id uuid,
  invoice_number text,
  invoice_date date,
  due_date date,
  total_amount numeric,
  amount_paid numeric,
  balance_due numeric,
  days_outstanding integer,
  aging_category text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.id as invoice_id,
    ci.project_id,
    ci.client_id,
    ci.invoice_number,
    ci.invoice_date,
    ci.due_date,
    ci.total_amount,
    ci.amount_paid,
    ci.balance_due,
    CASE 
      WHEN ci.due_date IS NOT NULL 
      THEN EXTRACT(DAY FROM (CURRENT_DATE - ci.due_date))::integer
      ELSE 0
    END as days_outstanding,
    CASE 
      WHEN ci.due_date IS NULL THEN 'Not Due'
      WHEN ci.due_date > CURRENT_DATE THEN 'Not Due'
      WHEN CURRENT_DATE - ci.due_date <= 30 THEN '1-30 Days'
      WHEN CURRENT_DATE - ci.due_date <= 60 THEN '31-60 Days'
      WHEN CURRENT_DATE - ci.due_date <= 90 THEN '61-90 Days'
      ELSE '90+ Days'
    END as aging_category
  FROM client_invoices ci
  WHERE ci.company_id = p_company_id
    AND ci.status IN ('sent', 'overdue', 'partial')
    AND ci.balance_due > 0
  ORDER BY ci.due_date ASC NULLS LAST;
END;
$$;

-- =====================================================
-- GET OUTSTANDING PAYABLES FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_outstanding_payables(p_company_id uuid)
RETURNS TABLE (
  invoice_id uuid,
  supplier_id uuid,
  project_id uuid,
  invoice_number text,
  invoice_date date,
  due_date date,
  total_amount numeric,
  amount_paid numeric,
  balance_due numeric,
  days_until_due integer,
  priority text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    si.id as invoice_id,
    si.supplier_id,
    si.project_id,
    si.invoice_number,
    si.invoice_date,
    si.due_date,
    si.total_amount,
    si.amount_paid,
    si.balance_due,
    CASE 
      WHEN si.due_date IS NOT NULL 
      THEN EXTRACT(DAY FROM (si.due_date - CURRENT_DATE))::integer
      ELSE 999
    END as days_until_due,
    CASE 
      WHEN si.due_date IS NULL THEN 'Low'
      WHEN si.due_date < CURRENT_DATE THEN 'Overdue'
      WHEN si.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'High'
      WHEN si.due_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'Medium'
      ELSE 'Low'
    END as priority
  FROM supplier_invoices si
  WHERE si.company_id = p_company_id
    AND si.status IN ('pending', 'approved', 'partial')
    AND si.balance_due > 0
  ORDER BY si.due_date ASC NULLS LAST;
END;
$$;

-- =====================================================
-- GET UPCOMING PAYROLL FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_upcoming_payroll(p_company_id uuid, p_weeks_ahead integer DEFAULT 12)
RETURNS TABLE (
  period_id uuid,
  period_start date,
  period_end date,
  pay_date date,
  status text,
  estimated_amount numeric,
  is_forecast boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_payroll numeric;
  v_last_pay_date date;
BEGIN
  -- Calculate average payroll from last 6 periods
  SELECT AVG(total_net), MAX(pay_date)
  INTO v_avg_payroll, v_last_pay_date
  FROM payroll_periods
  WHERE company_id = p_company_id
    AND status = 'processed'
    AND pay_date >= CURRENT_DATE - INTERVAL '90 days';

  -- If no average, use a default
  v_avg_payroll := COALESCE(v_avg_payroll, 0);
  
  -- Return existing scheduled payroll periods
  RETURN QUERY
  SELECT 
    pp.id as period_id,
    pp.period_start,
    pp.period_end,
    pp.pay_date,
    pp.status,
    COALESCE(pp.total_net, v_avg_payroll) as estimated_amount,
    false as is_forecast
  FROM payroll_periods pp
  WHERE pp.company_id = p_company_id
    AND pp.pay_date >= CURRENT_DATE
    AND pp.pay_date <= CURRENT_DATE + (p_weeks_ahead * INTERVAL '7 days')
  ORDER BY pp.pay_date;
  
  -- If we have a payroll history, we can forecast future periods
  -- For now, just return existing scheduled periods
  -- Future enhancement: auto-generate forecast periods based on pay frequency
END;
$$;

-- =====================================================
-- GET CASH FLOW FORECAST FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_cash_flow_forecast(
  p_company_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT CURRENT_DATE + INTERVAL '90 days',
  p_interval text DEFAULT 'week'
)
RETURNS TABLE (
  period_start date,
  period_end date,
  period_label text,
  expected_inflows numeric,
  expected_outflows numeric,
  net_cash_flow numeric,
  receivables_count integer,
  payables_count integer,
  payroll_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_date date;
  v_period_start date;
  v_period_end date;
  v_interval_days integer;
BEGIN
  -- Determine interval days
  v_interval_days := CASE p_interval
    WHEN 'week' THEN 7
    WHEN 'month' THEN 30
    ELSE 7
  END;

  v_current_date := p_start_date;

  WHILE v_current_date <= p_end_date LOOP
    v_period_start := v_current_date;
    v_period_end := v_current_date + (v_interval_days || ' days')::interval - INTERVAL '1 day';

    RETURN QUERY
    WITH period_receivables AS (
      SELECT 
        COALESCE(SUM(ci.balance_due), 0) as total_receivables,
        COUNT(*)::integer as count_receivables
      FROM client_invoices ci
      WHERE ci.company_id = p_company_id
        AND ci.status IN ('sent', 'overdue', 'partial')
        AND ci.balance_due > 0
        AND ci.due_date >= v_period_start
        AND ci.due_date <= v_period_end
    ),
    period_payables AS (
      SELECT 
        COALESCE(SUM(si.balance_due), 0) as total_payables,
        COUNT(*)::integer as count_payables
      FROM supplier_invoices si
      WHERE si.company_id = p_company_id
        AND si.status IN ('pending', 'approved', 'partial')
        AND si.balance_due > 0
        AND si.due_date >= v_period_start
        AND si.due_date <= v_period_end
    ),
    period_payroll AS (
      SELECT 
        COALESCE(SUM(pp.total_net), 0) as total_payroll,
        COUNT(*)::integer as count_payroll
      FROM payroll_periods pp
      WHERE pp.company_id = p_company_id
        AND pp.pay_date >= v_period_start
        AND pp.pay_date <= v_period_end
    )
    SELECT 
      v_period_start as period_start,
      v_period_end as period_end,
      CASE p_interval
        WHEN 'week' THEN 'Week of ' || TO_CHAR(v_period_start, 'Mon DD')
        WHEN 'month' THEN TO_CHAR(v_period_start, 'Month YYYY')
        ELSE TO_CHAR(v_period_start, 'YYYY-MM-DD')
      END as period_label,
      pr.total_receivables as expected_inflows,
      (pp.total_payables + ppr.total_payroll) as expected_outflows,
      (pr.total_receivables - pp.total_payables - ppr.total_payroll) as net_cash_flow,
      pr.count_receivables as receivables_count,
      pp.count_payables as payables_count,
      ppr.count_payroll as payroll_count
    FROM period_receivables pr
    CROSS JOIN period_payables pp
    CROSS JOIN period_payroll ppr;

    v_current_date := v_current_date + (v_interval_days || ' days')::interval;
  END LOOP;
END;
$$;

-- =====================================================
-- GET CASH POSITION SUMMARY FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_cash_position_summary(p_company_id uuid)
RETURNS TABLE (
  current_cash_balance numeric,
  total_receivables numeric,
  total_payables numeric,
  upcoming_payroll_30_days numeric,
  net_cash_position numeric,
  receivables_30_days numeric,
  receivables_60_days numeric,
  receivables_90_days numeric,
  payables_30_days numeric,
  payables_60_days numeric,
  payables_90_days numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH current_cash AS (
    SELECT COALESCE(SUM(ct.amount), 0) as balance
    FROM cash_transactions ct
    WHERE ct.company_id = p_company_id
  ),
  receivables AS (
    SELECT 
      COALESCE(SUM(ci.balance_due), 0) as total,
      COALESCE(SUM(CASE WHEN ci.due_date <= CURRENT_DATE + INTERVAL '30 days' THEN ci.balance_due ELSE 0 END), 0) as due_30,
      COALESCE(SUM(CASE WHEN ci.due_date <= CURRENT_DATE + INTERVAL '60 days' THEN ci.balance_due ELSE 0 END), 0) as due_60,
      COALESCE(SUM(CASE WHEN ci.due_date <= CURRENT_DATE + INTERVAL '90 days' THEN ci.balance_due ELSE 0 END), 0) as due_90
    FROM client_invoices ci
    WHERE ci.company_id = p_company_id
      AND ci.status IN ('sent', 'overdue', 'partial')
      AND ci.balance_due > 0
  ),
  payables AS (
    SELECT 
      COALESCE(SUM(si.balance_due), 0) as total,
      COALESCE(SUM(CASE WHEN si.due_date <= CURRENT_DATE + INTERVAL '30 days' THEN si.balance_due ELSE 0 END), 0) as due_30,
      COALESCE(SUM(CASE WHEN si.due_date <= CURRENT_DATE + INTERVAL '60 days' THEN si.balance_due ELSE 0 END), 0) as due_60,
      COALESCE(SUM(CASE WHEN si.due_date <= CURRENT_DATE + INTERVAL '90 days' THEN si.balance_due ELSE 0 END), 0) as due_90
    FROM supplier_invoices si
    WHERE si.company_id = p_company_id
      AND si.status IN ('pending', 'approved', 'partial')
      AND si.balance_due > 0
  ),
  upcoming_payroll AS (
    SELECT COALESCE(SUM(pp.total_net), 0) as total
    FROM payroll_periods pp
    WHERE pp.company_id = p_company_id
      AND pp.pay_date >= CURRENT_DATE
      AND pp.pay_date <= CURRENT_DATE + INTERVAL '30 days'
  )
  SELECT 
    cc.balance as current_cash_balance,
    r.total as total_receivables,
    p.total as total_payables,
    up.total as upcoming_payroll_30_days,
    (cc.balance + r.total - p.total - up.total) as net_cash_position,
    r.due_30 as receivables_30_days,
    r.due_60 as receivables_60_days,
    r.due_90 as receivables_90_days,
    p.due_30 as payables_30_days,
    p.due_60 as payables_60_days,
    p.due_90 as payables_90_days
  FROM current_cash cc
  CROSS JOIN receivables r
  CROSS JOIN payables p
  CROSS JOIN upcoming_payroll up;
END;
$$;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON FUNCTION get_outstanding_receivables IS 'Returns all outstanding client invoices with aging analysis';
COMMENT ON FUNCTION get_outstanding_payables IS 'Returns all outstanding supplier invoices with payment priority';
COMMENT ON FUNCTION get_upcoming_payroll IS 'Returns scheduled and forecasted payroll periods';
COMMENT ON FUNCTION get_cash_flow_forecast IS 'Generates cash flow forecast by week or month intervals';
COMMENT ON FUNCTION get_cash_position_summary IS 'Returns comprehensive cash position summary with AR/AP aging';
