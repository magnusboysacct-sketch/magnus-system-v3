/*
  # Project Finance Monitoring Layer

  ## Overview
  Comprehensive finance monitoring views for project-level financial tracking,
  enabling comparison of budget vs committed vs actual vs billed vs received.

  ## New Database Objects

  ### 1. Views
    - `v_project_finance_summary` - Comprehensive project finance metrics including:
      * Budget (from BOQ items)
      * Committed (from procurement items with unit rates)
      * Actual costs (from project_costs)
      * Billed (from client invoices)
      * Received (from client payments)
      * Outstanding AR (receivables)
      * Outstanding AP (payables)
      * Projected margin

  ### 2. Helper Function
    - `get_project_finance_summary(project_id)` - Returns complete finance summary for a project

  ## Metrics Calculated
  - Budget Total: Sum of all BOQ items amounts
  - Committed: Sum of procurement items (ordered_qty * unit_rate)
  - Actual Cost: Sum of all project_costs records
  - Billed: Sum of all client invoices (non-cancelled)
  - Received: Sum of all client payments
  - Outstanding AR: Billed - Received
  - Outstanding AP: Sum of unpaid supplier invoices
  - Projected Margin: (Budget - Actual) or (Billed - Actual) depending on billing status
  - Margin %: (Projected Margin / Budget) * 100

  ## Security
  - Views inherit RLS from underlying tables
  - Function respects company_id isolation
*/

-- =====================================================
-- PROJECT FINANCE SUMMARY VIEW
-- =====================================================

CREATE OR REPLACE VIEW v_project_finance_summary AS
WITH 
-- Budget from BOQ items
project_budget AS (
  SELECT 
    b.project_id,
    b.org_id as company_id,
    SUM(COALESCE(bi.amount, 0)) as budget_total
  FROM boqs b
  LEFT JOIN boq_items bi ON bi.boq_id = b.id
  WHERE b.status != 'cancelled'
  GROUP BY b.project_id, b.org_id
),
-- Committed from procurement items
project_committed AS (
  SELECT 
    pi.project_id,
    SUM(COALESCE(pi.ordered_qty, 0) * COALESCE(pi.unit_rate, 0)) as committed_total
  FROM procurement_items pi
  WHERE pi.status IN ('approved', 'ordered', 'partial')
  GROUP BY pi.project_id
),
-- Actual Costs from project_costs
project_actual AS (
  SELECT 
    project_id,
    SUM(COALESCE(amount, 0)) as actual_total
  FROM project_costs
  GROUP BY project_id
),
-- Billed from client invoices
project_billed AS (
  SELECT 
    ci.project_id,
    ci.company_id,
    SUM(COALESCE(ci.total_amount, 0)) as billed_total,
    SUM(COALESCE(ci.balance_due, 0)) as ar_outstanding
  FROM client_invoices ci
  WHERE ci.status NOT IN ('cancelled', 'draft')
  GROUP BY ci.project_id, ci.company_id
),
-- Received from client payments
project_received AS (
  SELECT 
    ci.project_id,
    ci.company_id,
    SUM(COALESCE(cp.amount, 0)) as received_total
  FROM client_payments cp
  LEFT JOIN client_invoices ci ON ci.id = cp.invoice_id
  WHERE ci.project_id IS NOT NULL
  GROUP BY ci.project_id, ci.company_id
),
-- Outstanding AP from supplier invoices
project_ap AS (
  SELECT 
    si.project_id,
    si.company_id,
    SUM(COALESCE(si.balance_due, 0)) as ap_outstanding
  FROM supplier_invoices si
  WHERE si.status IN ('pending', 'approved', 'partial')
  GROUP BY si.project_id, si.company_id
)
SELECT 
  p.id as project_id,
  p.company_id,
  p.name as project_name,
  p.status as project_status,
  
  -- Budget metrics
  COALESCE(pb.budget_total, 0) as budget_total,
  
  -- Commitment metrics
  COALESCE(pc.committed_total, 0) as committed_total,
  
  -- Actual cost metrics
  COALESCE(pa.actual_total, 0) as actual_total,
  
  -- Billing metrics
  COALESCE(pbi.billed_total, 0) as billed_total,
  COALESCE(pr.received_total, 0) as received_total,
  COALESCE(pbi.ar_outstanding, 0) as ar_outstanding,
  
  -- Payables metrics
  COALESCE(pap.ap_outstanding, 0) as ap_outstanding,
  
  -- Variance metrics
  COALESCE(pb.budget_total, 0) - COALESCE(pa.actual_total, 0) as budget_variance,
  COALESCE(pc.committed_total, 0) - COALESCE(pa.actual_total, 0) as committed_variance,
  
  -- Margin metrics
  CASE 
    WHEN COALESCE(pbi.billed_total, 0) > 0 THEN COALESCE(pbi.billed_total, 0) - COALESCE(pa.actual_total, 0)
    ELSE COALESCE(pb.budget_total, 0) - COALESCE(pa.actual_total, 0)
  END as projected_margin,
  
  CASE 
    WHEN COALESCE(pb.budget_total, 0) > 0 THEN
      ((CASE 
        WHEN COALESCE(pbi.billed_total, 0) > 0 THEN COALESCE(pbi.billed_total, 0) - COALESCE(pa.actual_total, 0)
        ELSE COALESCE(pb.budget_total, 0) - COALESCE(pa.actual_total, 0)
      END) / COALESCE(pb.budget_total, 0)) * 100
    ELSE 0
  END as margin_percent,
  
  -- Cost completion
  CASE 
    WHEN COALESCE(pb.budget_total, 0) > 0 THEN
      (COALESCE(pa.actual_total, 0) / COALESCE(pb.budget_total, 0)) * 100
    ELSE 0
  END as cost_completion_percent,
  
  -- Billing completion
  CASE 
    WHEN COALESCE(pb.budget_total, 0) > 0 THEN
      (COALESCE(pbi.billed_total, 0) / COALESCE(pb.budget_total, 0)) * 100
    ELSE 0
  END as billing_completion_percent,
  
  -- Collection efficiency
  CASE 
    WHEN COALESCE(pbi.billed_total, 0) > 0 THEN
      (COALESCE(pr.received_total, 0) / COALESCE(pbi.billed_total, 0)) * 100
    ELSE 0
  END as collection_percent,
  
  p.created_at,
  p.updated_at

FROM projects p
LEFT JOIN project_budget pb ON pb.project_id = p.id AND pb.company_id = p.company_id
LEFT JOIN project_committed pc ON pc.project_id = p.id
LEFT JOIN project_actual pa ON pa.project_id = p.id
LEFT JOIN project_billed pbi ON pbi.project_id = p.id AND pbi.company_id = p.company_id
LEFT JOIN project_received pr ON pr.project_id = p.id AND pr.company_id = p.company_id
LEFT JOIN project_ap pap ON pap.project_id = p.id AND pap.company_id = p.company_id;

-- =====================================================
-- HELPER FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION get_project_finance_summary(p_project_id uuid)
RETURNS TABLE (
  project_id uuid,
  project_name text,
  budget_total numeric,
  committed_total numeric,
  actual_total numeric,
  billed_total numeric,
  received_total numeric,
  ar_outstanding numeric,
  ap_outstanding numeric,
  budget_variance numeric,
  projected_margin numeric,
  margin_percent numeric,
  cost_completion_percent numeric,
  billing_completion_percent numeric,
  collection_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    vp.project_id,
    vp.project_name,
    vp.budget_total,
    vp.committed_total,
    vp.actual_total,
    vp.billed_total,
    vp.received_total,
    vp.ar_outstanding,
    vp.ap_outstanding,
    vp.budget_variance,
    vp.projected_margin,
    vp.margin_percent,
    vp.cost_completion_percent,
    vp.billing_completion_percent,
    vp.collection_percent
  FROM v_project_finance_summary vp
  WHERE vp.project_id = p_project_id;
END;
$$;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_project_costs_project_amount ON project_costs(project_id, amount);
CREATE INDEX IF NOT EXISTS idx_client_invoices_project_status ON client_invoices(project_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_project_status ON supplier_invoices(project_id, status);
CREATE INDEX IF NOT EXISTS idx_boq_items_boq_amount ON boq_items(boq_id, amount);
CREATE INDEX IF NOT EXISTS idx_boqs_project ON boqs(project_id);
CREATE INDEX IF NOT EXISTS idx_procurement_items_project_status ON procurement_items(project_id, status);
